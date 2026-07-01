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
    expect(g[0]).toEqual({ id: 'a', query: 'q1', relevant: ['wiki/x.md'], trimCandidate: false, note: undefined })
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
})
