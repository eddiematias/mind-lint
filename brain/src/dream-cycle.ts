import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import fg from 'fast-glob'
import matter from 'gray-matter'
import type { ChatClient } from './chat.js'
import type { Embedder } from './types.js'
import { buildResolver } from './indexer.js'
import { pullVault } from './reindex-loop.js'
import { gitHead, gitChangedFiles, gitCommitAndPush } from './git.js'
import { extractFromFile, type ExtractedRow } from './facts/extract.js'
import { dedupeNewFacts } from './facts/dedup.js'
import { isFactSource, factFilePath } from './facts/source.js'
import { renderFactsFile, parseFactsFile, factKey, type Fact } from './facts/markdown.js'

const ENTITY_DIRS = ['wiki/people/', 'wiki/companies/', 'wiki/projects/']
const isEntityPath = (rel: string) => ENTITY_DIRS.some((d) => rel.startsWith(d)) && !rel.endsWith('_index.md')
const MIN_BODY_CHARS = 40

export interface FactsCycleDeps {
  vaultRoot: string
  scopeGlobs: string[]
  chat: ChatClient
  embedder: Embedder
  cosineThreshold: number
  maxFactsPerFile: number
  watermarkPath: string
  now: string // ISO date, injected (no Date.now in tests)
}

export function readWatermark(path: string): string | null {
  try { return existsSync(path) ? readFileSync(path, 'utf8').trim() || null : null } catch { return null }
}
export function writeWatermark(path: string, sha: string): void {
  writeFileSync(path, sha)
}

export async function runFactsCycle(deps: FactsCycleDeps): Promise<{ filesScanned: number; factsWritten: number; chatCalls: number; skipped: boolean }> {
  await pullVault(deps.vaultRoot) // best-effort; reindex still runs on already-synced content
  const head = await gitHead(deps.vaultRoot)
  if (!head.ok) { console.warn('[brain] dream: not a git vault, skipping facts cycle'); return { filesScanned: 0, factsWritten: 0, chatCalls: 0, skipped: true } }

  const watermark = readWatermark(deps.watermarkPath)
  const allMatches = await fg(deps.scopeGlobs, { cwd: deps.vaultRoot, dot: true })
  const entityPaths = allMatches.filter(isEntityPath)
  const resolver = buildResolver(entityPaths)

  // Work set: changed since watermark (first run = whole allowlist).
  let workSet: string[]
  if (!watermark) {
    workSet = allMatches.filter(isFactSource)
  } else {
    const changed = await gitChangedFiles(deps.vaultRoot, watermark, head.sha)
    const present = new Set(allMatches)
    workSet = changed.files.filter((f) => present.has(f) && isFactSource(f))
  }

  let chatCalls = 0
  let factsWritten = 0
  // PR-I1: the watermark only advances after a clean commit AND zero extraction/dedup
  // failures. A failed night re-processes the whole delta next run; dedup makes that
  // idempotent. Trade-off: a persistently failing file blocks the watermark forever
  // (accepted for slice 3: surfaces as a stuck watermark rather than silent data loss).
  let hadFailure = false
  // Accumulate new facts per target file, then write once per file.
  const pending = new Map<string, { label: string | null; facts: Fact[] }>()

  for (const rel of workSet) {
    let body: string
    try {
      const raw = await readFile(resolve(deps.vaultRoot, rel), 'utf8')
      try { body = matter(raw).content } catch { body = raw }
    } catch { continue }
    if (body.trim().length < MIN_BODY_CHARS) continue

    // PR-M1: type the extraction rows explicitly so tsc does not infer implicit any.
    let rows: ExtractedRow[] = []
    try { chatCalls++; rows = await extractFromFile(deps.chat, rel, body, deps.maxFactsPerFile) }
    catch (e) { hadFailure = true; console.warn(`[brain] dream: extraction failed for ${rel}, skipping:`, e); continue }

    for (const row of rows) {
      const targetBase = row.entity ? resolver.get(row.entity) ?? null : null
      const entityLabel = targetBase ? `[[${row.entity}]]` : null
      const fact: Fact = {
        claim: row.claim, kind: row.kind, confidence: row.confidence, entity: entityLabel,
        sourcePath: rel, validFrom: deps.now, validUntil: null, superseded: false, supersededNote: null,
      }
      const path = factFilePath(entityLabel)
      if (!pending.has(path)) pending.set(path, { label: entityLabel ? row.entity : null, facts: [] })
      pending.get(path)!.facts.push(fact)
    }
  }

  for (const [relPath, { label, facts: candidates }] of pending) {
    const absPath = resolve(deps.vaultRoot, relPath)
    let existing: Fact[] = []
    try { existing = parseFactsFile(await readFile(absPath, 'utf8')) } catch { existing = [] }
    // Honor suppressions: drop candidates matching an existing SUPERSEDED fact's key.
    const suppressed = new Set(existing.filter((f) => f.superseded).map(factKey))
    const notSuppressed = candidates.filter((c) => !suppressed.has(factKey(c)))
    let fresh: Fact[]
    // Dedup and suppression do DISTINCT jobs, so dedup compares against LIVE facts only.
    // Dedup's job: prevent duplicate LIVE facts. Suppression's job: never re-add a RETIRED
    // (struck) fact. If dedup also saw superseded facts, a re-emitted struck claim would be
    // caught by dedup (identical claim text -> cosine 1.0), masking the suppression filter
    // and making it impossible to tell the two mechanisms apart. Passing liveExisting means
    // suppression is the SOLE thing that drops a re-emitted retired claim.
    const liveExisting = existing.filter((f) => !f.superseded)
    try { fresh = await dedupeNewFacts(deps.embedder, liveExisting, notSuppressed, deps.cosineThreshold) }
    catch (e) { hadFailure = true; console.warn(`[brain] dream: dedup failed for ${relPath}, skipping file:`, e); continue }
    if (fresh.length === 0 && existing.length > 0) continue // nothing new; leave file untouched
    // merged keeps the FULL existing (incl. struck facts); only the dedup COMPARISON used liveExisting.
    const merged = [...existing, ...fresh]
    await mkdir(dirname(absPath), { recursive: true })
    await writeFile(absPath, renderFactsFile(label, merged))
    factsWritten += fresh.length
  }

  const commit = await gitCommitAndPush(deps.vaultRoot, `facts: nightly extraction ${deps.now}`)
  // PR-I1: advance the watermark ONLY on a clean commit AND zero per-file failures.
  if (!hadFailure && commit.ok) writeWatermark(deps.watermarkPath, head.sha)
  return { filesScanned: workSet.length, factsWritten, chatCalls, skipped: false }
}
