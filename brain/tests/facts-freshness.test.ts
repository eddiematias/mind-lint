import { describe, it, expect } from 'vitest'
import { freshness, daysBetween, HALFLIFE_DAYS } from '../src/facts/freshness.js'
import type { Fact } from '../src/facts/markdown.js'

const f = (over: Partial<Fact> = {}): Fact => ({
  claim: 'x', kind: 'fact', confidence: 0.9, entity: null,
  sourcePath: 'memory/learnings/x.md', validFrom: '2026-01-01', validUntil: null,
  superseded: false, supersededNote: null, ...over,
})

const plusDays = (iso: string, days: number): string =>
  new Date(new Date(iso).getTime() + days * 86_400_000).toISOString().slice(0, 10)

describe('daysBetween (UTC)', () => {
  it('returns whole days between two YYYY-MM-DD dates', () => {
    expect(daysBetween('2026-01-01', '2026-02-01')).toBe(31)
  })
})

describe('freshness', () => {
  it('is exactly 0.5 at one halflife for every kind', () => {
    for (const kind of Object.keys(HALFLIFE_DAYS) as Array<keyof typeof HALFLIFE_DAYS>) {
      const from = '2026-01-01'
      const asOf = plusDays(from, HALFLIFE_DAYS[kind])
      expect(freshness(f({ kind, validFrom: from }), asOf)).toBeCloseTo(0.5, 5)
    }
  })
  it('age 0 returns 1', () => {
    expect(freshness(f({ validFrom: '2026-06-01' }), '2026-06-01')).toBe(1)
  })
  it('far-aged event approaches 0', () => {
    expect(freshness(f({ kind: 'event', validFrom: '2026-01-01' }), '2026-03-12')).toBeLessThan(0.01)
  })
  it('is independent of confidence (same age and kind, different confidence, same freshness)', () => {
    const a = freshness(f({ confidence: 0.2, validFrom: '2026-01-01' }), '2026-04-01')
    const b = freshness(f({ confidence: 0.95, validFrom: '2026-01-01' }), '2026-04-01')
    expect(a).toBe(b)
  })
  it('null validFrom returns 1 (unknown age, never stale)', () => {
    expect(freshness(f({ validFrom: null }), '2026-06-01')).toBe(1)
  })
  it('future validFrom (negative age) returns 1', () => {
    expect(freshness(f({ validFrom: '2026-12-01' }), '2026-06-01')).toBe(1)
  })
  it('a later asOf yields strictly lower freshness for a decaying kind', () => {
    const early = freshness(f({ kind: 'event', validFrom: '2026-01-01' }), '2026-01-10')
    const late = freshness(f({ kind: 'event', validFrom: '2026-01-01' }), '2026-01-20')
    expect(late).toBeLessThan(early)
  })
})
