// tests/indexer-ledger-exclusion.test.ts
import { describe, it, expect } from 'vitest'
import { isIndexable } from '../src/indexer.js'

describe('isIndexable', () => {
  it('excludes supersession ledger files', () => {
    expect(isIndexable('memory/facts/_supersession-proposals.md')).toBe(false)
    expect(isIndexable('memory/facts/_supersession-decisions.md')).toBe(false)
  })
  it('keeps real fact stores indexable', () => {
    expect(isIndexable('memory/facts/_general.md')).toBe(true)
    expect(isIndexable('memory/facts/amara-markovic.md')).toBe(true)
    expect(isIndexable('memory/learnings/x.md')).toBe(true)
  })
})
