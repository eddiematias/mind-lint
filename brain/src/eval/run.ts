import type { RetrievedChunk } from '../types.js'
import type { GoldEntry } from './gold.js'
import { recallAtK, mrr, hitAtK } from './metrics.js'
import { retrieve, CANDIDATE_N } from '../retriever.js'

// Ranked distinct sourcePaths, best (earliest) rank preserved.
export function dedupeToDocs(chunks: Pick<RetrievedChunk, 'sourcePath'>[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const c of chunks) {
    if (!seen.has(c.sourcePath)) { seen.add(c.sourcePath); out.push(c.sourcePath) }
  }
  return out
}

export interface QueryResult { id: string; trimCandidate: boolean; recall: number; mrr: number; hit: boolean; missed: string[] }

// Score one gold entry against a ranked distinct-doc list, at doc-rank cutoff k.
export function scoreEntry(entry: GoldEntry, docs: string[], k: number): QueryResult {
  const topK = new Set(docs.slice(0, k))
  return {
    id: entry.id,
    trimCandidate: entry.trimCandidate,
    recall: recallAtK(docs, entry.relevant, k),
    mrr: mrr(docs, entry.relevant),
    hit: hitAtK(docs, entry.relevant, k),
    missed: entry.relevant.filter((r) => !topK.has(r)),
  }
}

export interface ClassAgg { count: number; recall: number; mrr: number; hitRate: number }

// Per-class means (trim-candidate vs stable), computed independently so a 0-recall trim-candidate
// query is never masked by high-recall stable queries.
export function aggregateByClass(results: QueryResult[]): { trimCandidate: ClassAgg; stable: ClassAgg } {
  const agg = (rs: QueryResult[]): ClassAgg => ({
    count: rs.length,
    recall: rs.length ? rs.reduce((s, r) => s + r.recall, 0) / rs.length : 0,
    mrr: rs.length ? rs.reduce((s, r) => s + r.mrr, 0) / rs.length : 0,
    hitRate: rs.length ? rs.filter((r) => r.hit).length / rs.length : 0,
  })
  return {
    trimCandidate: agg(results.filter((r) => r.trimCandidate)),
    stable: agg(results.filter((r) => !r.trimCandidate)),
  }
}

// argv is process.argv.slice(3) for `brain eval [--gold <p>] [--k N] [--floor F]`.
// (No --baseline in v1: a stable-class regression-vs-baseline check is a Phase-4-time feature; do
// not parse a flag the runner does not consume.)
export function parseEvalArgs(argv: string[]): { gold?: string; k?: number; floor?: number } {
  const flagVal = (f: string): string | undefined => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined }
  const num = (v: string | undefined): number | undefined => {
    if (v === undefined) return undefined
    const n = Number(v)
    return Number.isNaN(n) ? undefined : n
  }
  return { gold: flagVal('--gold'), k: num(flagVal('--k')), floor: num(flagVal('--floor')) }
}

// retrieve()'s parameter types, borrowed so we do not re-name Embedder/Reranker here.
type RetrieveParams = Parameters<typeof retrieve>

export interface EvalResult {
  env: { embedder: string; reranker: string }
  perQuery: QueryResult[]
  byClass: { trimCandidate: ClassAgg; stable: ClassAgg }
  k: number
  floor: number
  gatedClass: 'trim-candidate' | 'stable'  // which class the pass/fail gated on (R-3)
  pass: boolean
}

// Runs the REAL retrieval for each gold query (non-hermetic: needs the live index + Ollama).
// Fetches the full candidate pool (CANDIDATE_N chunks), dedups to distinct docs, scores top-k docs.
// Gates on the trim-candidate class (the class the trim risks); falls back to stable if there are
// no trim-candidate entries.
export async function runEval(deps: {
  db: RetrieveParams[0]
  embedder: RetrieveParams[1]
  reranker: RetrieveParams[2]
  gold: GoldEntry[]
  k: number
  floor: number
  rerankerLabel: string
}): Promise<EvalResult> {
  const perQuery: QueryResult[] = []
  for (const entry of deps.gold) {
    const chunks = await retrieve(deps.db, deps.embedder, deps.reranker, entry.query, CANDIDATE_N)
    perQuery.push(scoreEntry(entry, dedupeToDocs(chunks), deps.k))
  }
  const byClass = aggregateByClass(perQuery)
  // Gate on the trim-candidate class (the class the trim risks). If there are none, gate on stable
  // as a BASELINE check, and formatReport says so loudly so a stable-baseline pass is never mistaken
  // for a trim-safety pass (R-3).
  const gatedClass: 'trim-candidate' | 'stable' = byClass.trimCandidate.count > 0 ? 'trim-candidate' : 'stable'
  const gate = gatedClass === 'trim-candidate' ? byClass.trimCandidate : byClass.stable
  return {
    env: { embedder: deps.embedder.id, reranker: deps.rerankerLabel },
    perQuery, byClass, k: deps.k, floor: deps.floor, gatedClass,
    pass: gate.recall >= deps.floor,
  }
}

export function formatReport(r: EvalResult): string {
  const pct = (n: number) => n.toFixed(2)
  const lines: string[] = []
  lines.push(`[eval] env: embedder=${r.env.embedder} reranker=${r.env.reranker} k=${r.k} floor=${pct(r.floor)}`)
  lines.push(`[eval] (before/after comparisons are valid only within the same env above)`)
  for (const q of r.perQuery) {
    const cls = q.trimCandidate ? 'trim-candidate' : 'stable'
    const miss = q.missed.length ? ` missed=${q.missed.join(',')}` : ''
    lines.push(`  ${cls}  ${q.id}  recall@${r.k}=${pct(q.recall)} mrr=${pct(q.mrr)}${miss}`)
  }
  const cl = (name: string, a: ClassAgg) => `[eval] ${name}: n=${a.count} recall@${r.k}=${pct(a.recall)} mrr=${pct(a.mrr)} hit@${r.k}=${pct(a.hitRate)}`
  lines.push(cl('trim-candidate', r.byClass.trimCandidate))
  lines.push(cl('stable', r.byClass.stable))
  const baselineNote = r.gatedClass === 'stable'
    ? ' (BASELINE ONLY: no trimCandidate entries, so this is NOT a trim-safety gate; add a trimCandidate entry per Phase-4-move file before trusting a trim)'
    : ''
  lines.push(`[eval] ${r.pass ? 'PASS' : 'FAIL'} (gated on ${r.gatedClass} recall >= ${pct(r.floor)})${baselineNote}`)
  return lines.join('\n')
}
