import type { Platform, SourceType } from './markdown.js'

const TRACKING_PARAMS = [/^igsh$/, /^utm_/, /^fbclid$/, /^feature$/, /^si$/]

export function normalizeUrl(input: string): string {
  let u: URL
  try { u = new URL(input.trim()) } catch { return input.trim() }
  u.protocol = 'https:'
  u.hostname = u.hostname.replace(/^www\./, '')
  const keep = new URLSearchParams()
  for (const [k, v] of u.searchParams) {
    if (!TRACKING_PARAMS.some((re) => re.test(k))) keep.append(k, v)
  }
  u.search = keep.toString()
  u.hash = ''
  if (u.pathname.length > 1 && u.pathname.endsWith('/')) u.pathname = u.pathname.replace(/\/+$/, '')
  return u.toString()
}

export function detectPlatform(url: string): Platform {
  let host = ''
  try { host = new URL(url).hostname.replace(/^www\./, '') } catch { return 'web' }
  if (host === 'instagram.com' || host.endsWith('.instagram.com')) return 'instagram'
  if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) return 'tiktok'
  if (host === 'youtu.be' || host === 'youtube.com' || host.endsWith('.youtube.com')) return 'youtube'
  if (host === 'x.com' || host === 'twitter.com' || host.endsWith('.twitter.com')) return 'x'
  return 'web'
}

export function detectType(url: string, platform: Platform): SourceType {
  let path = ''
  try { path = new URL(url).pathname } catch { path = '' }
  if (platform === 'instagram') return /\/(reel|reels|tv)\//.test(path) ? 'video' : 'article'
  if (platform === 'tiktok' || platform === 'youtube') return 'video'
  // x video detection is unreliable from the URL; default article, the downloader brick refines.
  return 'article'
}

export function parseItemId(url: string, platform: Platform): string | null {
  let u: URL
  try { u = new URL(url) } catch { return null }
  const path = u.pathname
  if (platform === 'instagram') return path.match(/\/(?:reel|reels|p|tv)\/([^/]+)/)?.[1] ?? null
  if (platform === 'tiktok') return path.match(/\/video\/(\d+)/)?.[1] ?? null
  if (platform === 'youtube') {
    if (u.hostname.replace(/^www\./, '') === 'youtu.be') return path.slice(1).split('/')[0] || null
    const v = u.searchParams.get('v')
    if (v) return v
    return path.match(/\/shorts\/([^/]+)/)?.[1] ?? null
  }
  if (platform === 'x') return path.match(/\/status\/(\d+)/)?.[1] ?? null
  return null
}

export function slugify(input: string): string {
  const out = input.toLowerCase().normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '')
  return out || 'item'
}
