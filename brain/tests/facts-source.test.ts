import { describe, it, expect } from 'vitest'
import { isFactSource, factFilePath, slugForEntity } from '../src/facts/source.js'

describe('isFactSource', () => {
  it('includes entity pages (unlike edge derivation) and ordinary prose', () => {
    expect(isFactSource('wiki/people/Amara Markovic.md')).toBe(true)
    expect(isFactSource('memory/learnings/backend.md')).toBe(true)
    expect(isFactSource('journal/2026-06-27.md')).toBe(true)
  })
  it('excludes the facts store itself, underscore files, and rosters', () => {
    expect(isFactSource('memory/facts/amara-markovic.md')).toBe(false)
    expect(isFactSource('wiki/_derived-edges.md')).toBe(false)
    expect(isFactSource('wiki/people/_index.md')).toBe(false)
  })
})

describe('factFilePath / slugForEntity', () => {
  it('routes entity facts to a per-entity slug file and the rest to _general', () => {
    expect(factFilePath('[[Amara Markovic]]')).toBe('memory/facts/amara-markovic.md')
    expect(factFilePath(null)).toBe('memory/facts/_general.md')
  })
  it('slug is stable and filesystem-safe', () => {
    expect(slugForEntity('Jeff Perera')).toBe('jeff-perera')
    expect(slugForEntity('JBR')).toBe('jbr')
  })
})
