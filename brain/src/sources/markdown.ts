import matter from 'gray-matter'

export type Platform = 'instagram' | 'tiktok' | 'youtube' | 'x' | 'web'
export type SourceType = 'video' | 'article' | 'email'
export type OgFetchStatus = 'success' | 'blocked' | 'failed' | 'skipped'
export type SourceStatus = 'captured' | 'fetched' | 'transcribed' | 'processed'

export interface SourceItem {
  url: string
  platform: Platform
  type: SourceType | null      // capture-time guess; the downloader brick refines it
  itemId: string | null        // platform-native stable id; null for plain web URLs
  creator: string | null       // filled by a later brick
  captured: string             // YYYY-MM-DD
  capturedVia: 'manual' | 'slack'
  ogFetchStatus: OgFetchStatus
  why: string                  // plain prose, no [[wikilinks]] (R-6)
  tags: string[]
  status: SourceStatus
  caption: string
  transcript: string
  onScreenText: string
  summary: string
  contentAngles: string
}

const SECTIONS: Array<[keyof SourceItem, string]> = [
  ['caption', 'Caption'],
  ['transcript', 'Transcript'],
  ['onScreenText', 'On-screen text'],
  ['summary', 'Summary'],
  ['contentAngles', 'Content angles'],
]

export function renderSourceItem(item: SourceItem): string {
  const data = {
    corpus: 'sources',
    url: item.url,
    platform: item.platform,
    type: item.type,
    item_id: item.itemId,
    creator: item.creator,
    captured: item.captured,
    captured_via: item.capturedVia,
    og_fetch_status: item.ogFetchStatus,
    why: item.why,
    tags: item.tags,
    status: item.status,
  }
  const body = SECTIONS.map(([key, heading]) => `## ${heading}\n\n${(item[key] as string) ?? ''}`.trimEnd()).join('\n\n') + '\n'
  return matter.stringify(body, data)
}

export function parseSourceItem(raw: string): SourceItem {
  const { data, content } = matter(raw)
  const section = (heading: string): string => {
    const esc = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const m = content.match(new RegExp(`(?:^|\\n)## ${esc}\\n([\\s\\S]*?)(?=\\n## |$)`))
    return (m?.[1] ?? '').trim()
  }
  const str = (v: unknown): string => (v == null ? '' : String(v))
  return {
    url: str(data.url),
    platform: (data.platform ?? 'web') as Platform,
    type: (data.type ?? null) as SourceType | null,
    itemId: data.item_id == null ? null : String(data.item_id),
    creator: data.creator == null ? null : String(data.creator),
    captured: str(data.captured),
    capturedVia: (data.captured_via ?? 'manual') as 'manual' | 'slack',
    ogFetchStatus: (data.og_fetch_status ?? 'skipped') as OgFetchStatus,
    why: str(data.why),
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    status: (data.status ?? 'captured') as SourceStatus,
    caption: section('Caption'),
    transcript: section('Transcript'),
    onScreenText: section('On-screen text'),
    summary: section('Summary'),
    contentAngles: section('Content angles'),
  }
}
