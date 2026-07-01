import { describe, it, expect } from 'vitest'
import { recallAtK, mrr, hitAtK } from '../src/eval/metrics.js'

describe('recallAtK', () => {
  it('is the fraction of relevant docs within top-k', () => {
    expect(recallAtK(['c', 'a', 'd'], ['a', 'b'], 3)).toBe(0.5) // a in top-3, b not
  })
  it('is 1 when all relevant are in top-k', () => {
    expect(recallAtK(['a', 'b', 'c'], ['a', 'b'], 3)).toBe(1)
  })
  it('uses a top-k cutoff (rank k and beyond excluded)', () => {
    expect(recallAtK(['x', 'y', 'a'], ['a'], 2)).toBe(0) // a at index 2, outside top-2
    expect(recallAtK(['x', 'y', 'a'], ['a'], 3)).toBe(1)
  })
  it('treats empty relevant as vacuously 1', () => {
    expect(recallAtK(['a'], [], 3)).toBe(1)
  })
})

describe('mrr', () => {
  it('is the reciprocal rank of the first relevant hit', () => {
    expect(mrr(['c', 'a', 'd'], ['a', 'b'])).toBe(0.5) // a at index 1 -> 1/2
  })
  it('is 1 when the first result is relevant', () => {
    expect(mrr(['a', 'b'], ['a'])).toBe(1)
  })
  it('is 0 when there is no hit', () => {
    expect(mrr(['x', 'y'], ['a'])).toBe(0)
  })
})

describe('hitAtK', () => {
  it('is true iff any relevant doc is in top-k', () => {
    expect(hitAtK(['c', 'a'], ['a'], 2)).toBe(true)
    expect(hitAtK(['c', 'a'], ['a'], 1)).toBe(false)
  })
})
