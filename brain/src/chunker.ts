import matter from 'gray-matter'
import { createHash } from 'node:crypto'
import type { Chunk } from './types.js'

// Bumped on ANY change to how a file's raw bytes are serialized into chunk text
// (section splitting, the entity-frontmatter header, long-paragraph slicing, etc.).
// Folded into the reindex skip key (see indexer.ts) so a serialization change
// auto-invalidates every file's cache entry — the Phase-2 deploy bug (a new chunker
// that re-serializes identical source was silently skipped) cannot recur.
// v1 = original body-only chunker; v2 = Phase-2 entity-frontmatter serialization.
export const CHUNKER_VERSION = '3'

export interface ParsedAffiliation {
  target: string         // raw "[[Name]]" verbatim
  role: string
  category: string | null
  source: string
  context: string
}
export interface ProseWikilink {
  raw: string       // "[[Name]]" verbatim
  context: string   // first matching line in document order, trimmed, <= 240 chars
}
export interface ParsedEntityFile {
  chunks: Chunk[]
  affiliations: ParsedAffiliation[]   // [] for non-entity files or entities with none
  type: string | null                 // 'person' | 'company' | 'project' | null
}

function sha(s: string): string {
  return createHash('sha256').update(s).digest('hex').slice(0, 16)
}

// split body into sections at lines starting with #, ##, or ### (H1-H3).
// H3 splitting is load-bearing for learnings: they live as `### [date] Title` entries
// inside a category file (one H1, no H2s), so without H3 splitting a whole category file
// collapses into one section that splitLong then slices blindly across unrelated entries.
// Splitting on H3 makes each learning (and each wiki/decision H3 sub-section) its own chunk.
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
    if (!inFence && /^#{1,3}\s/.test(line) && current.some((l) => l.trim() !== '')) {
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

// Render a scalar-or-array YAML value as a comma-joined string.
function asList(v: unknown): string {
  if (Array.isArray(v)) return v.map((x) => String(x)).join(', ')
  return v == null ? '' : String(v)
}

// Phase 2 (R1): entities store their typed edges in nested `affiliations` frontmatter,
// which the body-only embed path never sees. Serialize the entity header + edges into a
// short human-readable block so the structured edges are embedded + keyword-searchable.
// This is generated at index time from the parsed frontmatter only; the YAML stays the
// single source of truth (we never write this back to disk, never duplicate into body prose).
// Returns '' for non-entity files, so ordinary notes are untouched. The gate is the ENTITY
// type set (not "any non-empty type"): indexed files like journal/*.md (type: daily-note)
// and content ideas (type: business-exploration) carry a `type:` too, and must NOT get a
// serialized header — only person/company/project entities do.
const ENTITY_TYPES = new Set(['person', 'company', 'project'])
// NOTE: changing how a file is serialized here is a cache-invalidating event —
// bump CHUNKER_VERSION (top of file) so reindex re-chunks every file on the next run.
function serializeEntityFrontmatter(meta: Record<string, unknown>): string {
  const type = meta.type
  if (!ENTITY_TYPES.has(String(type))) return ''
  const lines: string[] = []
  lines.push(`type: ${asList(type)}`)
  if (meta.relationship != null) lines.push(`relationship: ${asList(meta.relationship)}`)
  if (meta.category != null) lines.push(`category: ${asList(meta.category)}`)
  if (meta.status != null) lines.push(`status: ${asList(meta.status)}`)
  const affs = meta.affiliations
  if (Array.isArray(affs)) {
    for (const a of affs) {
      if (a && typeof a === 'object') {
        const e = a as Record<string, unknown>
        const target = e.target == null ? '' : String(e.target)
        const role = e.role == null ? '' : String(e.role)
        const cat = e.category == null ? '' : String(e.category)
        const meta2 = [role, cat].filter((s) => s !== '').join(', ')
        lines.push(meta2 ? `affiliated with ${target} (${meta2})` : `affiliated with ${target}`)
      }
    }
  }
  return lines.join('\n')
}

export function chunkMarkdown(sourcePath: string, raw: string, maxChars = 2000): Chunk[] {
  // Parse frontmatter defensively: a single file with malformed YAML (bad indentation,
  // stray null bytes, an unquoted value that breaks the parser) must not abort the whole
  // reindex. On failure, fall back to indexing the full body with empty metadata.
  let metadata: Record<string, unknown> = {}
  let body = raw
  try {
    const parsed = matter(raw)
    metadata = parsed.data as Record<string, unknown>
    body = parsed.content
  } catch {
    metadata = {}
    body = raw
  }
  // NOTE: changing how a file is serialized here is a cache-invalidating event —
  // bump CHUNKER_VERSION (top of file) so reindex re-chunks every file on the next run.
  const sections = splitSections(body)
  const pieces: string[] = []
  for (const s of sections) pieces.push(...splitLong(s, maxChars))

  // R1: prepend the serialized entity header (incl. affiliations) to the FIRST chunk only,
  // so edges are embedded + keyword-searchable without duplicating into body prose.
  const header = serializeEntityFrontmatter(metadata)
  if (header) {
    if (pieces.length === 0) pieces.push(header)
    else pieces[0] = `${header}\n\n${pieces[0]}`
  }

  return pieces.map((content, chunkIndex) => ({
    id: `${sourcePath}#${chunkIndex}`,
    sourcePath,
    chunkIndex,
    content,
    metadata,
    contentHash: sha(content),
  }))
}

function parseAffiliations(meta: Record<string, unknown>): ParsedAffiliation[] {
  const affs = meta.affiliations
  if (!Array.isArray(affs)) return []
  const out: ParsedAffiliation[] = []
  for (const a of affs) {
    if (a && typeof a === 'object') {
      const e = a as Record<string, unknown>
      if (e.target == null) continue // a malformed affiliation with no target is skipped, not crashed
      out.push({
        target: String(e.target),
        role: e.role == null ? '' : String(e.role),
        category: e.category == null ? null : String(e.category),
        source: e.source == null ? 'human' : String(e.source),
        context: e.context == null ? '' : String(e.context),
      })
    }
  }
  return out
}

// Sibling of chunkMarkdown: same chunks, plus the structured affiliations + entity type
// the knowledge graph needs at index time (I2). Non-entity files get type=null, affiliations=[].
export function parseEntityFile(sourcePath: string, raw: string, maxChars = 2000): ParsedEntityFile {
  const chunks = chunkMarkdown(sourcePath, raw, maxChars)
  let metadata: Record<string, unknown> = {}
  try { metadata = matter(raw).data as Record<string, unknown> } catch { metadata = {} }
  const typeRaw = metadata.type == null ? null : String(metadata.type)
  const isEntity = typeRaw != null && ENTITY_TYPES.has(typeRaw)
  return {
    chunks,
    type: isEntity ? typeRaw : null,
    affiliations: isEntity ? parseAffiliations(metadata) : [],
  }
}

// Body-prose [[wikilink]] scanner (I2). Two code guards so only genuine prose links derive:
//  - fenced code blocks: reuses the same fence guard as splitSections (chunker.ts isFence);
//    a [[Name]] inside a ``` / ~~~ block is an example, not an edge.
//  - inline code spans (I-2): a [[Name]] inside backticks (e.g. `the [[JBR]] syntax`) is code,
//    not prose, so the line's inline-backtick spans are stripped before scanning.
// This vault, and the spec itself, contain many such examples. Context = the FIRST matching
// line in document order (M1), trimmed to <= 240 chars, so reordered prose does not churn the
// review artifact. De-dupes per distinct [[raw]] in this single file.
const PROSE_FENCE = (l: string): boolean => {
  const t = l.trimStart()
  return t.startsWith('~~~') || (t.charCodeAt(0) === 96 && t.charCodeAt(1) === 96 && t.charCodeAt(2) === 96)
}
const WIKILINK_RE = /\[\[([^\]]+)\]\]/g
const INLINE_CODE_RE = /`[^`]*`/g // I-2: inline backtick spans are code, not prose

export function scanProseWikilinks(content: string): ProseWikilink[] {
  const byRaw = new Map<string, string>() // raw -> first matching line (document order)
  let inFence = false
  for (const line of content.split('\n')) {
    if (PROSE_FENCE(line)) { inFence = !inFence; continue }
    if (inFence) continue
    // I-2: strip inline-code spans before scanning so `[[JBR]]` inside backticks is NOT an edge.
    // The visible context line keeps the original text; only the scan target is stripped.
    const scanTarget = line.replace(INLINE_CODE_RE, '')
    WIKILINK_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = WIKILINK_RE.exec(scanTarget)) !== null) {
      const raw = `[[${m[1].trim()}]]`
      if (!byRaw.has(raw)) byRaw.set(raw, line.trim().slice(0, 240))
    }
  }
  return [...byRaw.entries()].map(([raw, context]) => ({ raw, context }))
}

// --- Mention gazetteer (slice 2). NET-NEW: tokenizer + maximal-munch matcher. ---
// A "mention" is a BARE entity name in prose (no wikilink). Wikilinked names are
// already references edges, so [[...]] spans are stripped before matching (C3).
export interface MentionHit { targetPath: string; canonicalRaw: string; context: string }
export interface GazetteerEntry { tokens: string[]; surface: string; targetPath: string; canonicalRaw: string }
export type Gazetteer = Map<string, GazetteerEntry[]>

export const TOKEN_RE = /[a-zA-Z0-9]+/g // exported (PR-7) so indexer reuses it; not a guard regex (C2 unaffected)

// Group entries by first token (exact case); within a bucket, longest token-count
// first, then surface ascending, so maximal-munch is deterministic (M1).
export function buildGazetteer(entries: { surface: string; targetPath: string; canonicalRaw: string }[]): Gazetteer {
  const gaz: Gazetteer = new Map()
  for (const e of entries) {
    const tokens = e.surface.match(TOKEN_RE) ?? []
    const first = tokens[0]
    if (first === undefined) continue
    const entry: GazetteerEntry = { tokens, surface: e.surface, targetPath: e.targetPath, canonicalRaw: e.canonicalRaw }
    const bucket = gaz.get(first) ?? []
    bucket.push(entry)
    gaz.set(first, bucket)
  }
  for (const bucket of gaz.values()) {
    bucket.sort((a, b) => b.tokens.length - a.tokens.length || (a.surface < b.surface ? -1 : a.surface > b.surface ? 1 : 0))
  }
  return gaz
}

// Scan bare prose for gazetteer hits. Fence-guarded; per line strip inline-code AND
// [[...]] spans before tokenizing (the visible context keeps the original line).
// Case-sensitive, word-boundary (token) matching, maximal-munch. First mention per
// target wins (document order); one hit per target.
export function scanMentions(content: string, gaz: Gazetteer): MentionHit[] {
  const byTarget = new Map<string, MentionHit>()
  let inFence = false
  for (const line of content.split('\n')) {
    if (PROSE_FENCE(line)) { inFence = !inFence; continue }
    if (inFence) continue
    const scanTarget = line.replace(INLINE_CODE_RE, '').replace(WIKILINK_RE, '')
    const tokens = scanTarget.match(TOKEN_RE) ?? []
    let i = 0
    while (i < tokens.length) {
      const candidates = gaz.get(tokens[i])
      let matched: GazetteerEntry | null = null
      if (candidates) {
        for (const c of candidates) {
          if (i + c.tokens.length > tokens.length) continue
          let ok = true
          for (let k = 0; k < c.tokens.length; k++) {
            if (tokens[i + k] !== c.tokens[k]) { ok = false; break }
          }
          if (ok) { matched = c; break }
        }
      }
      if (matched) {
        if (!byTarget.has(matched.targetPath)) {
          byTarget.set(matched.targetPath, { targetPath: matched.targetPath, canonicalRaw: matched.canonicalRaw, context: line.trim().slice(0, 240) })
        }
        i += matched.tokens.length
      } else {
        i += 1
      }
    }
  }
  return [...byTarget.values()]
}
