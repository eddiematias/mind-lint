import type { RetrievedChunk } from '../types.js'
import type { GoldEntry } from './gold.js'
import { recallAtK, mrr, hitAtK } from './metrics.js'

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
