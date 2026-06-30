import { describe, it, expect } from 'vitest'
import { freshness, daysBetween, HALFLIFE_DAYS, staleFacts, parseStaleArgs } from '../src/facts/freshness.js'
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

describe('staleFacts', () => {
  it('returns only live facts below the threshold; excludes superseded and null-validFrom', () => {
    const facts: Fact[] = [
      f({ claim: 'old event', kind: 'event', validFrom: '2026-01-01' }),        // very stale, included
      f({ claim: 'fresh fact', kind: 'fact', validFrom: '2026-06-25' }),         // fresh, excluded
      f({ claim: 'struck', kind: 'event', validFrom: '2026-01-01', superseded: true }), // excluded
      f({ claim: 'undated', kind: 'event', validFrom: null }),                   // freshness 1, excluded
    ]
    const rows = staleFacts(facts, '2026-07-01', 0.25)
    expect(rows).toHaveLength(1)
    expect(rows[0].claim).toBe('old event')
    expect(rows[0].confidence).toBe(0.9) // carries the unchanged confidence
    expect(rows[0].freshness).toBeLessThan(0.25)
  })
  it('boundary is exclusive: a fact at exactly the threshold is not listed', () => {
    // event hl=7, asOf is exactly one halflife after validFrom => freshness exactly 0.5.
    const atHalflife = f({ claim: 'exactly half', kind: 'event', validFrom: '2026-06-24' })
    expect(staleFacts([atHalflife], '2026-07-01', 0.5)).toHaveLength(0) // 0.5 >= 0.5 excluded
    expect(staleFacts([atHalflife], '2026-07-01', 0.51)).toHaveLength(1) // just above threshold, included
  })
  it('sorts ascending by freshness; exact ties keep input order (stable sort)', () => {
    const facts: Fact[] = [
      f({ claim: 'a', kind: 'event', validFrom: '2026-06-01' }), // ties with b (same validFrom/kind)
      f({ claim: 'b', kind: 'event', validFrom: '2026-06-01' }),
      f({ claim: 'c', kind: 'event', validFrom: '2026-05-01' }), // older => lower freshness => first
    ]
    const rows = staleFacts(facts, '2026-07-01', 1) // below=1 includes all aged facts
    // c has the lowest freshness (oldest) so sorts first; a and b tie and keep input order.
    // Explicit expected order; do not sort the expectation.
    expect(rows.map((r) => r.claim)).toEqual(['c', 'a', 'b'])
  })
})

describe('parseStaleArgs', () => {
  it('parses --below and --asof', () => {
    expect(parseStaleArgs(['--below', '0.4', '--asof', '2026-06-01'])).toEqual({ below: 0.4, asof: '2026-06-01' })
  })
  it('returns undefined fields when flags absent (caller applies defaults)', () => {
    expect(parseStaleArgs([])).toEqual({ below: undefined, asof: undefined })
  })
  it('ignores a non-numeric --below', () => {
    expect(parseStaleArgs(['--below', 'abc'])).toEqual({ below: undefined, asof: undefined })
  })
  it('treats --below with no following value as absent (no crash)', () => {
    expect(parseStaleArgs(['--below'])).toEqual({ below: undefined, asof: undefined })
  })
})
