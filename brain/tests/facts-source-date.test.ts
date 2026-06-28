import { describe, it, expect } from 'vitest'
import { sourceDate } from '../src/facts/source.js'

describe('sourceDate', () => {
  it('reads a journal path date', () => {
    expect(sourceDate('journal/2026-05-13.md', {})).toBe('2026-05-13')
  })
  it('reads a decisions path date with a slug suffix', () => {
    expect(sourceDate('memory/decisions/2026-06-22-some-topic.md', {})).toBe('2026-06-22')
  })
  it('falls back to frontmatter date, then created', () => {
    expect(sourceDate('wiki/people/Amara Markovic.md', { date: '2026-01-09' })).toBe('2026-01-09')
    expect(sourceDate('wiki/people/Amara Markovic.md', { created: '2026-01-09T08:00:00Z' })).toBe('2026-01-09')
  })
  it('returns null when there is no derivable date', () => {
    expect(sourceDate('rules/preferences.md', {})).toBeNull()
    expect(sourceDate('memory/learnings/frontend.md', { tags: ['x'] })).toBeNull()
  })
})
