// brain/tests/reranker.test.ts
import { describe, it, expect } from 'vitest'
import { NoopReranker } from '../src/reranker.js'

describe('NoopReranker', () => {
  it('preserves order', async () => {
    const r = new NoopReranker()
    const order = await r.rerank('q', ['x', 'y', 'z'])
    expect(order).toEqual([0, 1, 2])
  })
})
