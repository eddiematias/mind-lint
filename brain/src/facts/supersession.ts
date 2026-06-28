import { readFile, writeFile } from 'node:fs/promises'
import { resolve, basename } from 'node:path'
import { createHash } from 'node:crypto'
import fg from 'fast-glob'
import { parseFactsFile, renderFactsFile, type Fact } from './markdown.js'
import { sourceDate } from './source.js'

// Recover a facts file's title label from the file ITSELF (PR-3), not from the facts:
// renderFactsFile writes '# Facts: <label>' or '# Facts (unattached)'. Parsing the
// existing title round-trips losslessly even for entity files whose facts might carry
// a null entity, which "first fact with an entity" would mislabel.
export function parseFactsTitle(content: string): string | null {
  const first = content.split('\n').find((l) => l.startsWith('# Facts'))
  const m = first?.match(/^# Facts:\s*(.+)$/)
  return m ? m[1].trim() : null // '# Facts (unattached)' -> null
}

function isLedgerFile(rel: string): boolean {
  return basename(rel).startsWith('_supersession')
}

// Re-derive valid_from from sourcePath (path-only, no file read) for every fact
// file under memory/facts/. Idempotent: rewrites a file only if a value changed.
export async function restampValidFrom(vaultRoot: string): Promise<{ filesChanged: number }> {
  const files = await fg('memory/facts/*.md', { cwd: vaultRoot, dot: true })
  let filesChanged = 0
  for (const rel of files) {
    if (isLedgerFile(rel)) continue
    const abs = resolve(vaultRoot, rel)
    let raw: string
    try { raw = await readFile(abs, 'utf8') } catch { continue }
    const facts: Fact[] = parseFactsFile(raw)
    const title = parseFactsTitle(raw) // PR-3: preserve the file's own title
    let changed = false
    for (const f of facts) {
      const d = sourceDate(f.sourcePath, {})
      if (d && d !== f.validFrom) { f.validFrom = d; changed = true }
    }
    if (changed) { await writeFile(abs, renderFactsFile(title, facts)); filesChanged++ }
  }
  return { filesChanged }
}

// ── Ledger types ──────────────────────────────────────────────────────────────

export interface FactRef { sourcePath: string; claim: string }
export interface Proposal {
  id: string
  loser: FactRef
  winner: FactRef
  verdict: 'supersedes' | 'coexist' | 'no_contradiction'
  confidence: number
  axis: string
  loserDecided: boolean   // false => which-wins (equal/ambiguous dates, R-I5)
  proposedOn: string
}
export type LifecycleKind = 'applied' | 'stale' | 'reverted' | 'checked'
export interface ProposalsDoc { proposals: Proposal[]; lifecycle: { kind: LifecycleKind; id: string }[] }
export type DecisionStatus = 'confirmed' | 'dismissed'
export interface Decision { id: string; status: DecisionStatus; chosenLoserPath: string | null }

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase()

// Order-independent pair id. The sorted sourcePath pair is the stable component,
// so resolved-skip survives an LLM rewording the claim text (R-I2).
export function pairId(a: FactRef, b: FactRef): string {
  const sides = [`${a.sourcePath}\0${norm(a.claim)}`, `${b.sourcePath}\0${norm(b.claim)}`].sort()
  return createHash('sha1').update(sides.join('')).digest('hex').slice(0, 16)
}

const PROPOSAL_HEADER =
  '<!-- Cycle-owned, APPEND-ONLY. Each ## block is a supersession candidate. Lifecycle lines ' +
  '(applied/stale/reverted/checked: <id>) are appended by the cycle. Decisions go in ' +
  '_supersession-decisions.md (confirm/dismiss there); never edit this file by hand. -->'

export function renderProposals(doc: ProposalsDoc): string {
  const out: string[] = ['# Supersession proposals', '', PROPOSAL_HEADER, '']
  for (const p of doc.proposals) {
    out.push(`## ${p.id}`, '',
      `- verdict: \`${p.verdict}\``,
      `- confidence: \`${p.confidence.toFixed(2)}\``,
      `- loser: \`${p.loser.sourcePath}\` :: ${p.loser.claim}`,
      `- winner: \`${p.winner.sourcePath}\` :: ${p.winner.claim}`,
      `- axis: ${p.axis}`,
      `- loserDecided: \`${p.loserDecided}\``,
      `- proposedOn: \`${p.proposedOn}\``, '')
  }
  if (doc.lifecycle.length > 0) {
    out.push('## lifecycle', '')
    for (const l of doc.lifecycle) out.push(`- ${l.kind}: ${l.id}`)
    out.push('')
  }
  return out.join('\n')
}

const BT = /`([^`]*)`/
const bt = (line: string) => (line.match(BT)?.[1] ?? '').trim()
const afterDoubleColon = (line: string) => { const i = line.indexOf('::'); return i === -1 ? '' : line.slice(i + 2).trim() }

export function parseProposals(content: string): ProposalsDoc {
  const doc: ProposalsDoc = { proposals: [], lifecycle: [] }
  const parts = content.split(/^## /m).slice(1)
  for (const part of parts) {
    const lines = part.split('\n')
    const head = lines[0].trim()
    if (head === 'lifecycle') {
      for (const raw of lines.slice(1)) {
        const m = raw.trim().match(/^- (applied|stale|reverted|checked):\s*(\S+)/)
        if (m) doc.lifecycle.push({ kind: m[1] as LifecycleKind, id: m[2] })
      }
      continue
    }
    const p: Proposal = {
      id: head, loser: { sourcePath: '', claim: '' }, winner: { sourcePath: '', claim: '' },
      verdict: 'no_contradiction', confidence: 0, axis: '', loserDecided: true, proposedOn: '',
    }
    for (const raw of lines.slice(1)) {
      const line = raw.trim()
      if (line.startsWith('- verdict:')) { const v = bt(line); if (v === 'supersedes' || v === 'coexist' || v === 'no_contradiction') p.verdict = v }
      else if (line.startsWith('- confidence:')) { const n = parseFloat(bt(line)); if (!Number.isNaN(n)) p.confidence = n }
      else if (line.startsWith('- loser:')) { p.loser = { sourcePath: bt(line), claim: afterDoubleColon(line) } }
      else if (line.startsWith('- winner:')) { p.winner = { sourcePath: bt(line), claim: afterDoubleColon(line) } }
      else if (line.startsWith('- axis:')) { p.axis = line.slice('- axis:'.length).trim() }
      else if (line.startsWith('- loserDecided:')) { p.loserDecided = bt(line) === 'true' }
      else if (line.startsWith('- proposedOn:')) { p.proposedOn = bt(line) }
    }
    if (p.id) doc.proposals.push(p)
  }
  return doc
}

export function parseDecisions(content: string): Decision[] {
  const out: Decision[] = []
  for (const raw of content.split('\n')) {
    const m = raw.trim().match(/^(\w{6,}):\s*(confirmed|dismissed)(?:\s+loser=(\S+))?/)
    if (m) out.push({ id: m[1], status: m[2] as DecisionStatus, chosenLoserPath: m[3] ?? null })
  }
  return out
}

// ids the probe must NOT re-judge: every pending proposal, every lifecycle id, every decision.
export function judgedIds(doc: ProposalsDoc, decisions: Decision[]): Set<string> {
  const s = new Set<string>()
  for (const p of doc.proposals) s.add(p.id)
  for (const l of doc.lifecycle) s.add(l.id)
  for (const d of decisions) s.add(d.id)
  return s
}

// ids whose state is settled (used by the surface to hide rows that no longer need a decision).
export function resolvedIds(doc: ProposalsDoc, decisions: Decision[]): Set<string> {
  const s = new Set<string>()
  for (const l of doc.lifecycle) s.add(l.id)
  for (const d of decisions) s.add(d.id)
  return s
}
