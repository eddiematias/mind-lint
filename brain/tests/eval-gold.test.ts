import { describe, it, expect } from 'vitest'
import { parseGoldSet } from '../src/eval/gold.js'

describe('parseGoldSet', () => {
  it('parses entries, defaults trimCandidate to false, skips blank and # comment lines', () => {
    const text = [
      '# frozen gold set; changing requires a Why: line',
      '',
      '{"id":"a","query":"q1","relevant":["wiki/x.md"]}',
      '{"id":"b","query":"q2","relevant":["rules/preferences.md"],"trimCandidate":true,"note":"n"}',
    ].join('\n')
    const g = parseGoldSet(text)
    expect(g).toHaveLength(2)
    expect(g[0]).toEqual({ id: 'a', query: 'q1', relevant: ['wiki/x.md'], trimCandidate: false, edgeReachable: false, note: undefined })
    expect(g[1].trimCandidate).toBe(true)
    expect(g[1].note).toBe('n')
  })
  it('throws on invalid JSON, naming the line number', () => {
    expect(() => parseGoldSet('{"id":"a"')).toThrow(/line 1/)
  })
  it('throws on an entry missing id/query or with empty relevant', () => {
    expect(() => parseGoldSet('{"id":"a","query":"q","relevant":[]}')).toThrow(/relevant/)
    expect(() => parseGoldSet('{"query":"q","relevant":["x"]}')).toThrow(/line 1/)
  })
  it('coerces edgeReachable exactly like trimCandidate (default false, ===true)', () => {
    const g = parseGoldSet(
      '{"id":"a","query":"q","relevant":["x.md"]}\n' +
      '{"id":"b","query":"q","relevant":["y.md"],"edgeReachable":true}\n' +
      '{"id":"c","query":"q","relevant":["z.md"],"edgeReachable":"yes"}\n'
    )
    expect(g[0].edgeReachable).toBe(false) // absent -> false
    expect(g[1].edgeReachable).toBe(true)
    expect(g[2].edgeReachable).toBe(false) // non-boolean truthy -> false (strict ===true)
  })
})
