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
