import { describe, it, expect } from 'vitest'
import { candidatePairs, pairId } from '../src/facts/supersession.js'
import { factKey, type Fact } from '../src/facts/markdown.js'

const mk = (claim: string, source: string, superseded = false): Fact => ({
  claim, kind: 'fact', confidence: 1, entity: null, sourcePath: source,
  validFrom: '2026-01-01', validUntil: null, superseded, supersededNote: null,
})

describe('candidatePairs', () => {
  const A = mk('goal anchored to May 27', 'journal/2026-05-04.md')
  const B = mk('timeline removed from the goal', 'journal/2026-05-13.md')
  const C = mk('completely unrelated note about bagels', 'journal/2026-04-01.md')
  const cache = new Map<string, number[]>([
    [factKey(A), [1, 0]], [factKey(B), [0.95, 0.31]], [factKey(C), [0, 1]],
  ])
  it('pairs in-band neighbors regardless of age, excludes far and identical', () => {
    const pairs = candidatePairs([A, B, C], cache, 0.80, 0.985, new Set())
    const ids = pairs.map((p) => p.id)
    expect(ids).toContain(pairId(A, B))   // cosine(A,B) ~0.95 in band
    expect(ids).not.toContain(pairId(A, C)) // cosine(A,C) = 0, out of band
  })
  it('skips judged pairs', () => {
    const judged = new Set([pairId(A, B)])
    const pairs = candidatePairs([A, B, C], cache, 0.80, 0.985, judged)
    expect(pairs.map((p) => p.id)).not.toContain(pairId(A, B))
  })
  it('excludes superseded facts', () => {
    const Bs = mk('timeline removed from the goal', 'journal/2026-05-13.md', true)
    const cache2 = new Map([[factKey(A), [1, 0]], [factKey(Bs), [0.95, 0.31]]])
    const pairs = candidatePairs([A, Bs], cache2, 0.80, 0.985, new Set())
    expect(pairs).toHaveLength(0)
  })
})
