import { describe, it, expect } from 'vitest'
import { renderFactsFile, parseFactsFile, factKey, type Fact } from '../src/facts/markdown.js'

const f = (over: Partial<Fact> = {}): Fact => ({
  claim: 'The brain self-reindexes in-process every 600s',
  kind: 'fact', confidence: 0.9, entity: null,
  sourcePath: 'memory/learnings/devops.md',
  validFrom: null, validUntil: null, superseded: false, supersededNote: null, ...over,
})

describe('facts markdown round-trip', () => {
  it('render then parse yields the same facts', () => {
    const facts = [f(), f({ claim: 'Amara starts school in May 2026', entity: '[[Amara Markovic]]', confidence: 0.8, kind: 'event' })]
    const parsed = parseFactsFile(renderFactsFile('Amara Markovic', facts))
    expect(parsed).toHaveLength(2)
    expect(parsed[0].claim).toBe(facts[0].claim)
    expect(parsed[1].entity).toBe('[[Amara Markovic]]')
    expect(parsed[1].kind).toBe('event')
    expect(parsed[1].confidence).toBeCloseTo(0.8)
  })
  it('strikethrough claim parses as superseded with its note', () => {
    const parsed = parseFactsFile(renderFactsFile('X', [f({ superseded: true, supersededNote: 'forgotten: wrong' })]))
    expect(parsed[0].superseded).toBe(true)
    expect(parsed[0].supersededNote).toBe('forgotten: wrong')
  })
  it('factKey is stable across whitespace/case in the claim', () => {
    expect(factKey({ sourcePath: 'a.md', claim: '  Hello  World ' })).toBe(factKey({ sourcePath: 'a.md', claim: 'hello world' }))
  })
  it('facts are separated by blank lines (chunker splits at fact boundaries, not mid-fact)', () => {
    const md = renderFactsFile('X', [f(), f({ claim: 'second' })])
    expect(md).toContain('\n\n## ')
  })
  it('round-trips validFrom/validUntil', () => {
    const parsed = parseFactsFile(renderFactsFile('X', [f({ validFrom: '2026-06-27', validUntil: '2026-12-01' })]))
    expect(parsed[0].validFrom).toBe('2026-06-27')
    expect(parsed[0].validUntil).toBe('2026-12-01')
  })
})
