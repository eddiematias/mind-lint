import { readFile, writeFile } from 'node:fs/promises'
import { resolve, basename } from 'node:path'
import { createHash } from 'node:crypto'
import fg from 'fast-glob'
import { parseFactsFile, renderFactsFile, factKey, type Fact } from './markdown.js'
import { sourceDate } from './source.js'
import { cosine } from './dedup.js'
import type { ChatClient } from '../chat.js'
import type { Embedder } from '../types.js'
import { loadVectorCache, saveVectorCache, embedFactsCached, pruneVectorCache } from './vector-cache.js'

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

// ── Pending (review front-end, /review-derived) ─────────────────────────────
export interface PendingOpts {
  minConfidence?: number
  excludePathSubstrings?: string[]
  limit?: number
}
export interface PendingResult {
  pending: Proposal[]
  totalPending: number
  hiddenByFilter: number
}

// Pure. "Pending" uses the SAME resolvedIds as writePendingCount, so totalPending
// equals the number the SessionStart hook prints. Filters/sort/limit are display-only.
export function pendingProposals(
  doc: ProposalsDoc,
  decisions: Decision[],
  opts: PendingOpts = {},
): PendingResult {
  const resolved = resolvedIds(doc, decisions)
  const allPending = doc.proposals.filter((p) => !resolved.has(p.id))
  const exclude = opts.excludePathSubstrings ?? []
  const filtered = allPending.filter((p) => {
    if (opts.minConfidence != null && p.confidence < opts.minConfidence) return false
    if (exclude.some((s) => p.loser.sourcePath.includes(s) || p.winner.sourcePath.includes(s))) return false
    return true
  })
  const sorted = [...filtered].sort((a, b) => b.confidence - a.confidence)
  const limit = opts.limit ?? 20
  return { pending: sorted.slice(0, limit), totalPending: allPending.length, hiddenByFilter: allPending.length - filtered.length }
}

// IO wrapper: read the two ledger files and compute pending. Missing files read as empty
// (readMaybe), so a first run with no decisions file still works.
export async function pendingProposalsFromVault(
  vaultRoot: string,
  opts: PendingOpts = {},
): Promise<PendingResult> {
  const proposalsPath = resolve(vaultRoot, 'memory/facts/_supersession-proposals.md')
  const decisionsPath = resolve(vaultRoot, 'memory/facts/_supersession-decisions.md')
  const doc = parseProposals(await readMaybe(proposalsPath))
  const decisions = parseDecisions(await readMaybe(decisionsPath))
  return pendingProposals(doc, decisions, opts)
}

// ── Judge prompt/parse + loser assignment (R-I5) ─────────────────────────────

const CONFIDENCE_FLOOR = 0.7

export function buildJudgePrompt(): { system: string } {
  return {
    system: [
      'You compare two FACTS from a personal knowledge base and decide their relationship.',
      'Use "supersedes" ONLY when one clearly replaces or retires the other (a changed decision,',
      'a reversed preference, an updated plan), where the difference is a real change, not just',
      'different wording. Use "coexist" when both can be true at once (two distinct goals, two',
      'separate facts). Use "no_contradiction" when they are unrelated or restate the same thing.',
      '',
      'Reply with ONLY JSON, no prose:',
      '{"verdict":"supersedes"|"coexist"|"no_contradiction","confidence":0.0-1.0,"axis":"<one line: what changed, or empty>"}',
      'Reply verdict "supersedes" only when confidence >= 0.7.',
    ].join('\n'),
  }
}

export function parseJudgeJson(raw: string): { verdict: Proposal['verdict']; confidence: number; axis: string } {
  const start = raw.indexOf('{'); const end = raw.lastIndexOf('}')
  const fail = { verdict: 'no_contradiction' as const, confidence: 0, axis: '' }
  if (start === -1 || end === -1 || end < start) return fail
  let o: Record<string, unknown>
  try { o = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown> } catch { return fail }
  let verdict: Proposal['verdict'] = (o.verdict === 'supersedes' || o.verdict === 'coexist') ? o.verdict : 'no_contradiction'
  const confidence = typeof o.confidence === 'number' && !Number.isNaN(o.confidence) ? Math.max(0, Math.min(1, o.confidence)) : 0
  const axis = typeof o.axis === 'string' ? o.axis.trim().replace(/\s+/g, ' ') : ''
  if (verdict === 'supersedes' && confidence < CONFIDENCE_FLOOR) verdict = 'no_contradiction'
  return { verdict, confidence, axis }
}

// Loser = older source date when both paths are dated and differ. Otherwise (equal
// dates, or one/both undated) -> which-wins: decided:false, human picks on confirm.
// NEVER null (PR-7): a supersedes verdict must always surface, never silently drop.
// Frontmatter-only-dated facts read as undated here and route to which-wins.
export function assignLoser(a: Fact, b: Fact): { loser: Fact; winner: Fact; decided: boolean } {
  const da = sourceDate(a.sourcePath, {}); const db = sourceDate(b.sourcePath, {})
  if (da && db && da !== db) {
    return da < db ? { loser: a, winner: b, decided: true } : { loser: b, winner: a, decided: true }
  }
  return { loser: a, winner: b, decided: false }
}

// All unordered pairs of live (non-superseded) facts within `facts` whose cached cosine
// is in [lo, hi] and whose pairId is NOT in judged. Facts missing from cache are excluded.
// Regardless of fact age: fixes the new-vs-old hole where only same-file pairs were checked.
export function candidatePairs(
  facts: Fact[], cache: Map<string, number[]>, lo: number, hi: number, judged: Set<string>,
): { a: Fact; b: Fact; id: string }[] {
  const live = facts.filter((f) => !f.superseded && cache.has(factKey(f)))
  const out: { a: Fact; b: Fact; id: string }[] = []
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i], b = live[j]
      const c = cosine(cache.get(factKey(a))!, cache.get(factKey(b))!)
      if (c < lo || c > hi) continue
      const id = pairId(a, b)
      if (judged.has(id)) continue
      out.push({ a, b, id })
    }
  }
  return out
}

// ── Probe orchestration ───────────────────────────────────────────────────────

export interface ProbeDeps {
  vaultRoot: string; chat: ChatClient; embedder: Embedder
  cachePath: string; proposalsPath: string; decisionsPath: string
  neighborLo: number; neighborHi: number; maxPairsPerRun: number; now: string
}

async function readMaybe(path: string): Promise<string> {
  try { return await readFile(path, 'utf8') } catch { return '' }
}

// PR-4: count of proposals still awaiting a human decision, written for SessionStart.
export async function writePendingCount(vaultRoot: string, doc: ProposalsDoc, decisions: Decision[]): Promise<void> {
  const resolved = resolvedIds(doc, decisions)
  const pending = doc.proposals.filter((p) => !resolved.has(p.id)).length
  await writeFile(resolve(vaultRoot, 'memory/facts/_supersession-pending-count'), String(pending))
}

export interface ApplyDeps { vaultRoot: string; proposalsPath: string; decisionsPath: string }

// Same normalized key markdown.factKey computes (inline to avoid a struck-vs-live mismatch;
// parseFactsFile strips ~~ so a struck fact's claim text still keys to its live form).
function keyOf(ref: { sourcePath: string; claim: string }): string {
  return `${ref.sourcePath}\0${ref.claim.trim().replace(/\s+/g, ' ').toLowerCase()}`
}

// Find the fact file + index whose factKey matches the target. Scans all fact files
// (a loser may live in _general or any entity file). Returns the file's title too (PR-3).
async function findFact(vaultRoot: string, keyTarget: string): Promise<{ rel: string; facts: Fact[]; idx: number; title: string | null } | null> {
  const files = await fg('memory/facts/*.md', { cwd: vaultRoot, dot: true })
  for (const rel of files) {
    if (basename(rel).startsWith('_supersession')) continue
    let raw: string
    try { raw = await readFile(resolve(vaultRoot, rel), 'utf8') } catch { continue }
    const facts = parseFactsFile(raw)
    const idx = facts.findIndex((f) => factKey(f) === keyTarget)
    if (idx !== -1) return { rel, facts, idx, title: parseFactsTitle(raw) }
  }
  return null
}

export async function applyConfirmedSupersessions(
  deps: ApplyDeps,
): Promise<{ applied: number; stale: number; reverted: number }> {
  const doc = parseProposals(await readMaybe(deps.proposalsPath))
  const decisions = parseDecisions(await readMaybe(deps.decisionsPath))
  const lifecycleIds = new Set(doc.lifecycle.map((l) => l.id))
  const byId = new Map(doc.proposals.map((p) => [p.id, p]))
  let applied = 0, stale = 0, reverted = 0

  for (const dcn of decisions) {
    if (dcn.status !== 'confirmed' || lifecycleIds.has(dcn.id)) continue
    const p = byId.get(dcn.id)
    if (!p) continue
    // PR-6: which-wins -- the human's chosenLoserPath decides which side loses.
    let effLoser = p.loser, effWinner = p.winner
    if (!p.loserDecided) {
      if (dcn.chosenLoserPath === p.winner.sourcePath) { effLoser = p.winner; effWinner = p.loser }
      else if (dcn.chosenLoserPath !== p.loser.sourcePath) {
        // confirmed a which-wins without a valid loser= pick: cannot apply.
        doc.lifecycle.push({ kind: 'stale', id: dcn.id }); lifecycleIds.add(dcn.id); stale++; continue
      }
    }
    const hit = await findFact(deps.vaultRoot, keyOf(effLoser))
    if (!hit) { doc.lifecycle.push({ kind: 'stale', id: dcn.id }); lifecycleIds.add(dcn.id); stale++; continue }
    const f = hit.facts[hit.idx]
    f.superseded = true
    const wDate = sourceDate(effWinner.sourcePath, {}) ?? ''
    f.supersededNote = `superseded by: ${effWinner.claim} (${wDate}) [${p.verdict} ${p.confidence.toFixed(2)}]`
    if (wDate) f.validUntil = wDate
    await writeFile(resolve(deps.vaultRoot, hit.rel), renderFactsFile(hit.title, hit.facts)) // PR-3 title
    doc.lifecycle.push({ kind: 'applied', id: dcn.id }); lifecycleIds.add(dcn.id); applied++
  }

  // Reversal (PR-9): an applied strike a human un-struck -> register it so the probe never
  // re-proposes. Auto-detected only for loserDecided (auto) proposals: for which-wins the
  // struck side is ambiguous without storing it, so which-wins reversal is NOT auto-detected
  // (documented limitation; the human un-strikes, and dismisses if it is re-proposed).
  for (const l of doc.lifecycle.filter((x) => x.kind === 'applied')) {
    const p = byId.get(l.id)
    if (!p || !p.loserDecided) continue
    if (doc.lifecycle.some((x) => x.kind === 'reverted' && x.id === l.id)) continue
    const hit = await findFact(deps.vaultRoot, keyOf(p.loser))
    if (hit && !hit.facts[hit.idx].superseded) { doc.lifecycle.push({ kind: 'reverted', id: l.id }); reverted++ }
  }

  await writeFile(deps.proposalsPath, renderProposals(doc))
  await writePendingCount(deps.vaultRoot, doc, decisions) // PR-4
  return { applied, stale, reverted }
}

export async function runSupersessionProbe(
  deps: ProbeDeps,
): Promise<{ judged: number; proposed: number; capped: boolean; skipped: boolean }> {
  const doc = parseProposals(await readMaybe(deps.proposalsPath))
  const decisions = parseDecisions(await readMaybe(deps.decisionsPath))
  const judged = judgedIds(doc, decisions)
  const cache = await loadVectorCache(deps.cachePath)

  const files = await fg('memory/facts/*.md', { cwd: deps.vaultRoot, dot: true })
  const liveKeys = new Set<string>()
  let allPairs: { a: Fact; b: Fact; id: string }[] = []
  try {
    for (const rel of files) {
      if (basename(rel).startsWith('_supersession')) continue
      let facts: Fact[]
      try { facts = parseFactsFile(await readFile(resolve(deps.vaultRoot, rel), 'utf8')) } catch { continue }
      const live = facts.filter((f) => !f.superseded)
      live.forEach((f) => liveKeys.add(factKey(f)))
      await embedFactsCached(deps.embedder, live, cache)
      allPairs.push(...candidatePairs(facts, cache, deps.neighborLo, deps.neighborHi, judged))
    }
  } catch (e) {
    console.warn('[brain] dream: supersession embed failed, skipping probe:', e)
    return { judged: 0, proposed: 0, capped: false, skipped: true }
  }
  pruneVectorCache(cache, liveKeys) // PR-2: prune ONCE, against the union of all live keys
  await saveVectorCache(deps.cachePath, cache)

  const capped = allPairs.length > deps.maxPairsPerRun
  if (capped) {
    console.log(`[brain] dream: ${allPairs.length} candidate pairs, judging ${deps.maxPairsPerRun} this run, rest deferred to next run`)
    allPairs = allPairs.slice(0, deps.maxPairsPerRun)
  }

  const { system } = buildJudgePrompt()
  let proposed = 0, judgedCount = 0
  for (const { a, b, id } of allPairs) {
    let r: { verdict: Proposal['verdict']; confidence: number; axis: string }
    try {
      r = parseJudgeJson(await deps.chat.complete(system, `A: ${a.claim}\nB: ${b.claim}`))
    } catch (e) {
      // PR-5: a chat failure must NOT record checked (that would burn the pair as
      // judged forever during an outage). Leave it unjudged so it is retried next run.
      console.warn(`[brain] dream: judge failed for ${id}, will retry next run:`, e)
      continue
    }
    judgedCount++
    if (r.verdict === 'supersedes') {
      const la = assignLoser(a, b) // never null (PR-7)
      doc.proposals.push({
        id, loser: { sourcePath: la.loser.sourcePath, claim: la.loser.claim },
        winner: { sourcePath: la.winner.sourcePath, claim: la.winner.claim },
        verdict: r.verdict, confidence: r.confidence, axis: r.axis, loserDecided: la.decided, proposedOn: deps.now,
      })
      proposed++
    } else {
      doc.lifecycle.push({ kind: 'checked', id }) // genuine negative verdict, do not re-judge
    }
  }
  await writeFile(deps.proposalsPath, renderProposals(doc)) // PR-8: deps path, not hardcoded
  await writePendingCount(deps.vaultRoot, doc, decisions) // PR-4
  return { judged: judgedCount, proposed, capped, skipped: false }
}
