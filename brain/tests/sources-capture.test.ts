import { describe, it, expect } from 'vitest'
import { normalizeUrl, detectPlatform, detectType, parseItemId, slugify } from '../src/sources/capture.js'

describe('normalizeUrl', () => {
  it('strips igsh tracking, forces https, drops www and trailing slash', () => {
    expect(normalizeUrl('http://www.instagram.com/reel/ABC123/?igsh=xyz123'))
      .toBe('https://instagram.com/reel/ABC123')
  })
  it('keeps the youtube v param but strips feature', () => {
    expect(normalizeUrl('https://www.youtube.com/watch?v=XYZ&feature=shared'))
      .toBe('https://youtube.com/watch?v=XYZ')
  })
  it('two share variants of the same reel normalize identically', () => {
    expect(normalizeUrl('https://www.instagram.com/reel/ABC123/?igsh=a'))
      .toBe(normalizeUrl('https://instagram.com/reel/ABC123'))
  })
})

describe('detectPlatform / detectType / parseItemId', () => {
  it('instagram reel', () => {
    const u = 'https://instagram.com/reel/ABC123'
    expect(detectPlatform(u)).toBe('instagram')
    expect(detectType(u, 'instagram')).toBe('video')
    expect(parseItemId(u, 'instagram')).toBe('ABC123')
  })
  it('youtube watch and youtu.be', () => {
    expect(detectPlatform('https://youtube.com/watch?v=XYZ')).toBe('youtube')
    expect(parseItemId('https://youtube.com/watch?v=XYZ', 'youtube')).toBe('XYZ')
    expect(parseItemId('https://youtu.be/SHORT', 'youtube')).toBe('SHORT')
    expect(detectType('https://youtube.com/watch?v=XYZ', 'youtube')).toBe('video')
  })
  it('tiktok and x', () => {
    expect(parseItemId('https://tiktok.com/@u/video/12345', 'tiktok')).toBe('12345')
    expect(parseItemId('https://x.com/u/status/67890', 'x')).toBe('67890')
  })
  it('plain web url has no item_id and is an article', () => {
    expect(detectPlatform('https://example.com/post')).toBe('web')
    expect(parseItemId('https://example.com/post', 'web')).toBeNull()
    expect(detectType('https://example.com/post', 'web')).toBe('article')
  })
})

describe('slugify', () => {
  it('lowercases, strips punctuation, dashes spaces, caps length', () => {
    expect(slugify('A Clever Hook! About: Building')).toBe('a-clever-hook-about-building')
    expect(slugify('')).toBe('item')
  })
})

import { captureSource } from '../src/sources/capture.js'
import { parseSourceItem } from '../src/sources/markdown.js'
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { afterEach } from 'vitest'

describe('captureSource', () => {
  let dir = ''
  afterEach(async () => { if (dir) await rm(dir, { recursive: true, force: true }); dir = '' })

  const og = (html: string): typeof fetch =>
    (async () => ({ ok: true, text: async () => html } as Response)) as unknown as typeof fetch

  it('creates one record under sources/ with captured status', async () => {
    dir = await mkdtemp(resolve(tmpdir(), 'brain-cap-'))
    const html = '<meta property="og:title" content="Hook"><meta property="og:description" content="A clever hook">'
    const res = await captureSource('https://www.instagram.com/reel/ABC123/?igsh=z', {
      vaultRoot: dir, now: '2026-06-29', why: 'hook idea', tags: ['ai', 'hooks'], fetchImpl: og(html),
    })
    expect(res.created).toBe(true)
    const files = (await readdir(resolve(dir, 'sources'))).filter((f) => f.endsWith('.md'))
    expect(files).toHaveLength(1)
    const item = parseSourceItem(await readFile(res.path, 'utf8'))
    expect(item.platform).toBe('instagram')
    expect(item.itemId).toBe('ABC123')
    expect(item.status).toBe('captured')
    expect(item.caption).toBe('A clever hook')
    expect(item.url).toBe('https://instagram.com/reel/ABC123')
    expect(item.tags).toEqual(['ai', 'hooks'])   // PR-4: tags survive the write+read path
    expect(item.capturedVia).toBe('manual')       // PR-4
  })

  it('re-capturing a tracking-param variant updates the same record, no duplicate', async () => {
    dir = await mkdtemp(resolve(tmpdir(), 'brain-cap2-'))
    const first = await captureSource('https://instagram.com/reel/ABC123', { vaultRoot: dir, now: '2026-06-29', fetchImpl: og('<meta property="og:description" content="v1">') })
    const second = await captureSource('https://www.instagram.com/reel/ABC123/?igsh=different', { vaultRoot: dir, now: '2026-06-30', why: 'updated', fetchImpl: og('<meta property="og:description" content="v2">') })
    expect(first.created).toBe(true)
    expect(second.created).toBe(false)
    expect(second.path).toBe(first.path)
    const files = (await readdir(resolve(dir, 'sources'))).filter((f) => f.endsWith('.md'))
    expect(files).toHaveLength(1)
    const item = parseSourceItem(await readFile(second.path, 'utf8'))
    expect(item.why).toBe('updated')
  })

  it('records og_fetch_status=failed and still writes when fetch throws', async () => {
    dir = await mkdtemp(resolve(tmpdir(), 'brain-cap3-'))
    const throwing = (async () => { throw new Error('down') }) as unknown as typeof fetch
    const res = await captureSource('https://example.com/article', { vaultRoot: dir, now: '2026-06-29', fetchImpl: throwing })
    expect(res.created).toBe(true)
    const item = parseSourceItem(await readFile(res.path, 'utf8'))
    expect(item.ogFetchStatus).toBe('failed')
    expect(item.type).toBe('article')
  })

  it('PR-2: re-capturing the same web URL (no item_id) updates via normalized-URL match, no duplicate', async () => {
    dir = await mkdtemp(resolve(tmpdir(), 'brain-cap4-'))
    const first = await captureSource('https://example.com/post/', { vaultRoot: dir, now: '2026-06-29', fetchImpl: og('<meta property="og:description" content="v1">') })
    const second = await captureSource('https://example.com/post', { vaultRoot: dir, now: '2026-06-30', why: 'second pass', fetchImpl: og('<meta property="og:description" content="v2">') })
    expect(first.created).toBe(true)
    expect(second.created).toBe(false)
    expect(second.path).toBe(first.path)
    const files = (await readdir(resolve(dir, 'sources'))).filter((f) => f.endsWith('.md'))
    expect(files).toHaveLength(1)
    expect(parseSourceItem(await readFile(second.path, 'utf8')).why).toBe('second pass')
  })

  it('PR-4: og_fetch_status=blocked when the page returns 200 with no og tags', async () => {
    dir = await mkdtemp(resolve(tmpdir(), 'brain-cap5-'))
    const res = await captureSource('https://www.instagram.com/reel/NOOG1/', { vaultRoot: dir, now: '2026-06-29', fetchImpl: og('<html><body>login</body></html>') })
    const item = parseSourceItem(await readFile(res.path, 'utf8'))
    expect(item.ogFetchStatus).toBe('blocked')
    expect(item.caption).toBe('')
  })
})

import { fetchOpenGraph } from '../src/sources/capture.js'

const fakeFetch = (body: { ok?: boolean; html?: string; throws?: boolean }): typeof fetch =>
  (async () => {
    if (body.throws) throw new Error('network down')
    return { ok: body.ok ?? true, text: async () => body.html ?? '' } as Response
  }) as unknown as typeof fetch

describe('fetchOpenGraph', () => {
  it('returns success when og tags are present', async () => {
    const html = '<meta property="og:title" content="Hook"><meta property="og:description" content="About building &amp; shipping">'
    const r = await fetchOpenGraph('https://x.test/a', fakeFetch({ html }))
    expect(r.status).toBe('success')
    expect(r.title).toBe('Hook')
    expect(r.description).toBe('About building & shipping')
  })
  it('returns blocked on a 200 with no og tags (challenge page)', async () => {
    const r = await fetchOpenGraph('https://x.test/a', fakeFetch({ html: '<html><body>login</body></html>' }))
    expect(r.status).toBe('blocked')
    expect(r.description).toBe('')
  })
  it('returns failed and never throws on a network error', async () => {
    const r = await fetchOpenGraph('https://x.test/a', fakeFetch({ throws: true }))
    expect(r.status).toBe('failed')
  })
  it('returns failed on a non-ok response', async () => {
    const r = await fetchOpenGraph('https://x.test/a', fakeFetch({ ok: false }))
    expect(r.status).toBe('failed')
  })
})
