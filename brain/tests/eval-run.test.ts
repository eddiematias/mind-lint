import { describe, it, expect } from 'vitest'
import { dedupeToDocs, scoreEntry, aggregateByClass, parseEvalArgs, type QueryResult } from '../src/eval/run.js'
import type { GoldEntry } from '../src/eval/gold.js'

describe('dedupeToDocs', () => {
  it('collapses chunks to distinct sourcePaths preserving best (earliest) rank', () => {
    const chunks = [{ sourcePath: 'a' }, { sourcePath: 'a' }, { sourcePath: 'b' }, { sourcePath: 'a' }, { sourcePath: 'c' }]
    expect(dedupeToDocs(chunks)).toEqual(['a', 'b', 'c'])
  })
})

describe('scoreEntry', () => {
  it('scores recall/mrr/hit at the doc level and lists missed relevant paths', () => {
    const entry: GoldEntry = { id: 'x', query: 'q', relevant: ['a', 'b'], trimCandidate: true }
    const r = scoreEntry(entry, ['c', 'a', 'd'], 3)
    expect(r.recall).toBe(0.5)
    expect(r.mrr).toBe(0.5)
    expect(r.hit).toBe(true)
    expect(r.missed).toEqual(['b'])
    expect(r.trimCandidate).toBe(true)
  })
})

describe('aggregateByClass', () => {
  it('computes trim-candidate and stable means independently (a 0-recall trim query is not masked)', () => {
    const results: QueryResult[] = [
      { id: 't', trimCandidate: true, recall: 0, mrr: 0, hit: false, missed: ['a'] },
      { id: 's1', trimCandidate: false, recall: 1, mrr: 1, hit: true, missed: [] },
      { id: 's2', trimCandidate: false, recall: 1, mrr: 1, hit: true, missed: [] },
    ]
    const agg = aggregateByClass(results)
    expect(agg.trimCandidate).toEqual({ count: 1, recall: 0, mrr: 0, hitRate: 0 })
    expect(agg.stable).toEqual({ count: 2, recall: 1, mrr: 1, hitRate: 1 })
  })
})

describe('parseEvalArgs', () => {
  it('parses --gold/--k/--floor; ignores a non-numeric --k', () => {
    expect(parseEvalArgs(['--gold', 'g.jsonl', '--k', '5', '--floor', '0.9']))
      .toEqual({ gold: 'g.jsonl', k: 5, floor: 0.9 })
    expect(parseEvalArgs(['--k', 'abc'])).toEqual({ gold: undefined, k: undefined, floor: undefined })
  })
})

describe('dedupeToDocs + scoreEntry edges', () => {
  it('dedupeToDocs([]) is [] and scoreEntry over empty docs is recall 0, no crash (zero-chunk pool)', () => {
    expect(dedupeToDocs([])).toEqual([])
    const r = scoreEntry({ id: 'z', query: 'q', relevant: ['a'], trimCandidate: false }, [], 8)
    expect(r.recall).toBe(0)
    expect(r.hit).toBe(false)
    expect(r.missed).toEqual(['a'])
  })
  it('scoreEntry applies the k cutoff at the doc level (a relevant doc beyond k is missed)', () => {
    const r = scoreEntry({ id: 'x', query: 'q', relevant: ['a', 'b'], trimCandidate: false }, ['c', 'a', 'd', 'b'], 2)
    expect(r.recall).toBe(0.5) // a at doc-rank 1 (in top-2), b at doc-rank 3 (outside)
    expect(r.missed).toEqual(['b'])
  })
})
