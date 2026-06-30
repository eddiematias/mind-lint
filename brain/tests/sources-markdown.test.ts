import { describe, it, expect } from 'vitest'
import { renderSourceItem, parseSourceItem, type SourceItem } from '../src/sources/markdown.js'

const s = (over: Partial<SourceItem> = {}): SourceItem => ({
  url: 'https://instagram.com/reel/ABC123',
  platform: 'instagram', type: 'video', itemId: 'ABC123', creator: null,
  captured: '2026-06-29', capturedVia: 'manual', ogFetchStatus: 'success',
  why: 'hook idea for the build-in-public channel', tags: ['hooks', 'ai'],
  status: 'captured',
  caption: 'A clever hook about building in public', transcript: '', onScreenText: '',
  summary: '', contentAngles: '', ...over,
})

describe('source item markdown round-trip', () => {
  it('render then parse preserves frontmatter and section slots', () => {
    const item = s()
    const parsed = parseSourceItem(renderSourceItem(item))
    expect(parsed.url).toBe(item.url)
    expect(parsed.platform).toBe('instagram')
    expect(parsed.type).toBe('video')
    expect(parsed.itemId).toBe('ABC123')
    expect(parsed.ogFetchStatus).toBe('success')
    expect(parsed.why).toBe(item.why)
    expect(parsed.tags).toEqual(['hooks', 'ai'])
    expect(parsed.status).toBe('captured')
    expect(parsed.caption).toBe('A clever hook about building in public')
    expect(parsed.creator).toBeNull()           // PR-4: schema field exercised
    expect(parsed.capturedVia).toBe('manual')   // PR-4: schema field exercised
  })

  it('preserves a filled transcript slot and null type', () => {
    const parsed = parseSourceItem(renderSourceItem(s({ type: null, transcript: 'spoken words here', status: 'transcribed' })))
    expect(parsed.type).toBeNull()
    expect(parsed.transcript).toBe('spoken words here')
    expect(parsed.status).toBe('transcribed')
  })

  it('renders the five canonical section headings', () => {
    const md = renderSourceItem(s())
    for (const h of ['## Caption', '## Transcript', '## On-screen text', '## Summary', '## Content angles']) {
      expect(md).toContain(h)
    }
    expect(md.startsWith('---')).toBe(true) // frontmatter fence
  })
})
