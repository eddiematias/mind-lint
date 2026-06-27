import { describe, it, expect } from 'vitest'
import { FakeEmbedder } from '../src/embedder.js'
import { cosine, dedupeNewFacts } from '../src/facts/dedup.js'
import type { Fact } from '../src/facts/markdown.js'

const f = (claim: string): Fact => ({
  claim, kind: 'fact', confidence: 1, entity: null, sourcePath: 'a.md',
  validFrom: null, validUntil: null, superseded: false, supersededNote: null,
})

describe('cosine', () => {
  it('is 1 for identical vectors and ~0 for orthogonal', () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1)
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0)
  })
})

describe('dedupeNewFacts', () => {
  it('drops an exact-claim duplicate of an existing fact without embedding', async () => {
    const out = await dedupeNewFacts(new FakeEmbedder(8), [f('hello world')], [f('Hello   World'), f('brand new')], 0.95)
    expect(out.map((x) => x.claim)).toEqual(['brand new'])
  })
  it('keeps semantically distinct candidates', async () => {
    const out = await dedupeNewFacts(new FakeEmbedder(8), [], [f('alpha'), f('beta'), f('gamma')], 0.999)
    expect(out).toHaveLength(3)
  })
  it('drops a candidate within cosine threshold of an existing fact (embedding branch)', async () => {
    const out = await dedupeNewFacts(new FakeEmbedder(8), [f('alpha')], [f('beta')], -1)
    expect(out).toHaveLength(0) // threshold -1 => everything is a "duplicate"
  })
})
