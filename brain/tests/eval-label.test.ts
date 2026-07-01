import { describe, it, expect } from 'vitest'
import { edgeReachableFor } from '../src/eval/label.js'

describe('edgeReachableFor (pure predicate)', () => {
  it('returns false when a relevant doc equals a top-hit doc with no incoming reference edge (seed exclusion holds)', () => {
    // The relevant doc IS in the top-hit set but was excluded from reachedNeighbors
    // because the label tool applies !seedSet.has(endpoint).
    const reachedNeighbors = new Set<string>(['other/doc.md'])
    const relevant = ['wiki/mind-lint-system.md'] // top-hit doc, NOT a references-neighbor
    expect(edgeReachableFor(reachedNeighbors, relevant)).toBe(false)
  })

  it('returns true when a relevant doc is a references-neighbor of a top-hit doc', () => {
    const reachedNeighbors = new Set<string>([
      'memory/decisions/some-decision.md',
      'wiki/jbr-website-architecture.md',
    ])
    const relevant = ['wiki/jbr-website-architecture.md']
    expect(edgeReachableFor(reachedNeighbors, relevant)).toBe(true)
  })

  it('returns false when reachedNeighbors is empty', () => {
    const reachedNeighbors = new Set<string>()
    const relevant = ['wiki/mind-lint-system.md', 'memory/learnings/ai-workflows.md']
    expect(edgeReachableFor(reachedNeighbors, relevant)).toBe(false)
  })

  it('returns false when relevant is empty', () => {
    const reachedNeighbors = new Set<string>(['some/doc.md'])
    expect(edgeReachableFor(reachedNeighbors, [])).toBe(false)
  })

  it('returns true when ANY relevant doc is a references-neighbor (partial match)', () => {
    const reachedNeighbors = new Set<string>(['doc-b.md'])
    const relevant = ['doc-a.md', 'doc-b.md'] // only doc-b is a neighbor
    expect(edgeReachableFor(reachedNeighbors, relevant)).toBe(true)
  })
})
