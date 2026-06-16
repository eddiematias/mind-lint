import matter from 'gray-matter'
import { createHash } from 'node:crypto'
import type { Chunk } from './types.js'

function sha(s: string): string {
  return createHash('sha256').update(s).digest('hex').slice(0, 16)
}

// split body into sections at lines starting with # or ##.
// A fence guard prevents splitting on `#` comment lines inside fenced code blocks
// (bash/python/etc.), which this vault has many of. charCodeAt(96) is a backtick;
// we test by char code so this code stays embeddable in markdown without literal
// triple-backticks.
function splitSections(body: string): string[] {
  const lines = body.split('\n')
  const sections: string[] = []
  let current: string[] = []
  let inFence = false
  const isFence = (l: string): boolean => {
    const t = l.trimStart()
    return t.startsWith('~~~') || (t.charCodeAt(0) === 96 && t.charCodeAt(1) === 96 && t.charCodeAt(2) === 96)
  }
  for (const line of lines) {
    if (isFence(line)) inFence = !inFence
    if (!inFence && /^#{1,2}\s/.test(line) && current.some((l) => l.trim() !== '')) {
      sections.push(current.join('\n').trim())
      current = []
    }
    current.push(line)
  }
  if (current.some((l) => l.trim() !== '')) sections.push(current.join('\n').trim())
  return sections.filter((s) => s.length > 0)
}

function splitLong(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text]
  const out: string[] = []
  const paras = text.split(/\n\n+/)
  let buf = ''
  const flush = () => { if (buf.trim()) out.push(buf.trim()); buf = '' }
  for (const p of paras) {
    // a single paragraph (or unbroken line) larger than maxChars must be hard-sliced;
    // paragraph-boundary splitting alone leaves it as one over-long chunk.
    if (p.length > maxChars) {
      flush()
      for (let i = 0; i < p.length; i += maxChars) out.push(p.slice(i, i + maxChars))
      continue
    }
    if ((buf + '\n\n' + p).length > maxChars && buf) flush()
    buf = buf ? buf + '\n\n' + p : p
  }
  flush()
  return out
}

export function chunkMarkdown(sourcePath: string, raw: string, maxChars = 2000): Chunk[] {
  const { data: metadata, content } = matter(raw)
  const sections = splitSections(content)
  const pieces: string[] = []
  for (const s of sections) pieces.push(...splitLong(s, maxChars))
  return pieces.map((content, chunkIndex) => ({
    id: `${sourcePath}#${chunkIndex}`,
    sourcePath,
    chunkIndex,
    content,
    metadata: metadata as Record<string, unknown>,
    contentHash: sha(content),
  }))
}
