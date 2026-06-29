import type { Platform, SourceType, OgFetchStatus } from './markdown.js'

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

export interface OgResult { title: string; description: string; image: string; status: OgFetchStatus }

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
}

export async function fetchOpenGraph(url: string, fetchImpl: typeof fetch = fetch): Promise<OgResult> {
  const empty = (status: OgFetchStatus): OgResult => ({ title: '', description: '', image: '', status })
  let html = ''
  try {
    const res = await fetchImpl(url, { headers: { 'user-agent': UA, accept: 'text/html' }, redirect: 'follow' })
    if (!res.ok) return empty('failed')
    html = await res.text()
  } catch {
    return empty('failed')
  }
  const og = (prop: string): string => {
    const patterns = [
      new RegExp(`<meta[^>]+(?:property|name)=["']og:${prop}["'][^>]*\\scontent=["']([^"']*)["']`, 'i'),
      new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']og:${prop}["']`, 'i'),
    ]
    for (const re of patterns) { const m = html.match(re); if (m?.[1]) return decodeEntities(m[1]) }
    return ''
  }
  const title = og('title')
  const description = og('description')
  const image = og('image')
  return { title, description, image, status: title || description ? 'success' : 'blocked' }
}
