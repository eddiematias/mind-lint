import fg from 'fast-glob'
import { readFile } from 'node:fs/promises'
import { resolve, basename } from 'node:path'
import { createHash } from 'node:crypto'
import matter from 'gray-matter'
import type { PGlite } from '@electric-sql/pglite'
import type { Embedder } from './types.js'
import { chunkMarkdown, parseEntityFile, scanProseWikilinks, scanMentions, buildGazetteer, TOKEN_RE, CHUNKER_VERSION } from './chunker.js'
import type { Gazetteer } from './chunker.js'
import {
  upsertChunk, getFileHash, setFileHash, deleteFileChunks, deleteFileEdges,
  insertEdge, listIndexedPaths,
  upsertDerivedEdge, isSuppressed, deleteAllFileEdges, listEdgesFrom,
} from './db.js'

function fileHash(s: string): string {
  return createHash('sha256').update(s).digest('hex')
}

const ENTITY_DIRS = ['wiki/people/', 'wiki/companies/', 'wiki/projects/']
const SUBTREE_RANK: Record<string, number> = { 'wiki/people/': 0, 'wiki/companies/': 1, 'wiki/projects/': 2 }

// Exclude the per-subtree roster files. wiki/{people,companies,projects}/_index.md are in
// scope (scopeGlobs has wiki/**/*.md) but are rosters, not entities — and all three share
// the basename "_index", which would otherwise log a 3-way collision every reindex and
// needlessly enter the resolver. Mirrors the `grep -v _index` the /reindex and /people-sync
// commands already use for these subtrees.
function isEntityPath(rel: string): boolean {
  return ENTITY_DIRS.some((d) => rel.startsWith(d)) && basename(rel) !== '_index.md'
}

// A file is a derivation source if it is indexed (in scopeGlobs) but is NOT an entity file
// and is NOT an agent-owned underscore file. raw/ is not in scopeGlobs so it never appears
// here (C3). Two exclusion mechanisms, by DIFFERENT keys:
//  (1) entity subtrees, by PREFIX: a path under wiki/{people,companies,projects}/ is an
//      entity (or its _index.md roster) and is handled by the affiliations edge pass, not
//      derivation. ENTITY_DIRS.startsWith covers these (the rosters too, implicitly).
//  (2) agent-owned underscore files, by BASENAME: wiki/_derived-edges.md, wiki/_log.md,
//      wiki/_index.md (and any people/companies/projects _index.md roster) are machine-written
//      artifacts, not human prose. The review artifact in particular contains [[JBR]] verbatim
//      (context snippets + Suppressed lines), so scanning it would derive
//      wiki/_derived-edges.md -> JBR and pollute the very graph it audits (I-1, a self-referential
//      loop). basename startsWith('_') excludes them explicitly. Mirrors the /reindex precedent
//      that treats _index.md / _log.md as non-content.
function isDerivationSource(rel: string): boolean {
  if (ENTITY_DIRS.some((d) => rel.startsWith(d))) return false
  if (basename(rel).startsWith('_')) return false
  return true
}

// Build a basename → best entity path index honoring people > companies > projects.
function buildResolver(entityPaths: string[]): Map<string, string> {
  const byBase = new Map<string, string>()
  for (const p of entityPaths) {
    const base = basename(p, '.md')
    const dir = ENTITY_DIRS.find((d) => p.startsWith(d))!
    const existing = byBase.get(base)
    if (!existing) {
      byBase.set(base, p)
    } else if (SUBTREE_RANK[dir] < SUBTREE_RANK[ENTITY_DIRS.find((d) => existing.startsWith(d))!]) {
      console.warn(`[brain] basename collision for "${base}": ${dir} wins over ${existing}`)
      byBase.set(base, p)
    } else {
      console.warn(`[brain] basename collision for "${base}": kept ${existing}, ignored ${p}`)
    }
  }
  return byBase
}

const MENTION_MIN_TOKEN_CHARS = 4
// Genuinely ambiguous single tokens to keep out of the gazetteer even if they are a
// title or first-name. Seeded empty; extend (exact case) only when real noise appears.
const MENTION_IGNORE_TOKENS = new Set<string>([])

// PR-7: reuse TOKEN_RE exported from chunker.ts (no local duplicate).
function firstToken(s: string): string { return (s.match(TOKEN_RE) ?? [''])[0] }
function singleTokenQualifies(surface: string): boolean {
  const tokens = surface.match(TOKEN_RE) ?? []
  if (tokens.length !== 1) return true // multi-token surfaces are specific enough
  const t = tokens[0]
  if (MENTION_IGNORE_TOKENS.has(t)) return false
  if (/^[A-Z]{2,}$/.test(t)) return true // all-caps acronym exemption (JBR)
  return t.length >= MENTION_MIN_TOKEN_CHARS
}

// Build the mention gazetteer from entity files: titles (resolver-deduped) + person
// first-names. Reads name/type via matter() directly (parseEntityFile does not expose
// name, I1). Deterministic: entityPaths are sorted before iteration (M1).
export async function buildEntityGazetteer(vaultRoot: string, entityPaths: string[]): Promise<Gazetteer> {
  const sorted = [...entityPaths].sort()
  const resolver = buildResolver(sorted) // base -> winning entity path (people>companies>projects)

  const entries: { surface: string; targetPath: string; canonicalRaw: string }[] = []
  // 1) Title entries: one per resolved basename (collisions already resolved).
  for (const [base, path] of resolver) {
    if (!singleTokenQualifies(base)) continue
    entries.push({ surface: base, targetPath: path, canonicalRaw: `[[${base}]]` })
  }
  // 2) Person first-name entries (read frontmatter for type + name).
  const firstNameCount = new Map<string, number>()
  const firstNameInfo: { fn: string; path: string; base: string }[] = []
  for (const rel of sorted) {
    let data: Record<string, unknown> = {}
    try { data = matter(await readFile(resolve(vaultRoot, rel), 'utf8')).data as Record<string, unknown> } catch { data = {} }
    if (String(data.type ?? '') !== 'person') continue
    const base = basename(rel, '.md')
    const nameField = data.name == null ? base : String(data.name)
    const fn = firstToken(nameField)
    if (!fn) continue
    firstNameCount.set(fn, (firstNameCount.get(fn) ?? 0) + 1)
    firstNameInfo.push({ fn, path: rel, base })
  }
  for (const info of firstNameInfo) {
    if ((firstNameCount.get(info.fn) ?? 0) > 1) continue // ambiguous across people (M2): exclude
    if (resolver.has(info.fn)) continue // first-name equals a title basename: title already covers it (M2)
    if (!singleTokenQualifies(info.fn)) continue
    entries.push({ surface: info.fn, targetPath: info.path, canonicalRaw: `[[${info.base}]]` })
  }
  return buildGazetteer(entries)
}

// "[[Name]]" → bare "Name"
function rawToBase(toRaw: string): string {
  return toRaw.replace(/^\[\[/, '').replace(/\]\]$/, '').trim()
}

interface IndexCfg {
  vaultRoot: string
  scopeGlobs: string[]
  // Defaults to the compiled-in CHUNKER_VERSION; overridable so tests can simulate a
  // version bump without editing source. The skip key also includes embedder.id, so a
  // chunker bump OR an embedder swap invalidates every file and forces a re-chunk.
  chunkerVersion?: string
  // When true, ignore the skip cache entirely and re-chunk every file (documented
  // full-rebuild path for chunker/embedder upgrades and recovery; `reindex --force`).
  force?: boolean
}
export interface IndexResult { filesIndexed: number; filesSkipped: number; filesRemoved: number; chunksWritten: number }

export async function indexVault(db: PGlite, embedder: Embedder, cfg: IndexCfg, maxChars = 2000): Promise<IndexResult> {
  const chunkerVersion = cfg.chunkerVersion ?? CHUNKER_VERSION
  const matches = await fg(cfg.scopeGlobs, { cwd: cfg.vaultRoot, dot: true })
  const present = new Set(matches)
  const entityPaths = matches.filter(isEntityPath)
  const resolver = buildResolver(entityPaths)
  let filesIndexed = 0, filesSkipped = 0, filesRemoved = 0, chunksWritten = 0

  // prune files that no longer exist
  for (const indexed of await listIndexedPaths(db)) {
    if (!present.has(indexed)) {
      await deleteFileChunks(db, indexed)
      await deleteAllFileEdges(db, indexed) // C1: a vanished file's derived edges go too
      filesRemoved++
    }
  }

  for (const rel of matches) {
    const raw = await readFile(resolve(cfg.vaultRoot, rel), 'utf8')
    // Skip key includes the chunker version + embedder identity, so a serialization
    // change or an embedder swap changes every file's hash and forces a re-chunk.
    const hash = fileHash(`${chunkerVersion}\0${embedder.id}\0${raw}`)
    if (!cfg.force && (await getFileHash(db, rel)) === hash) { filesSkipped++; continue }

    await deleteFileChunks(db, rel) // replace any stale chunks
    const chunks = chunkMarkdown(rel, raw, maxChars)
    if (chunks.length > 0) {
      const vectors = await embedder.embed(chunks.map((c) => c.content))
      for (let i = 0; i < chunks.length; i++) { await upsertChunk(db, chunks[i], vectors[i]); chunksWritten++ }
    }
    await setFileHash(db, rel, hash)
    filesIndexed++
  }

  // Edge pass (I3): unconditional over entity subtrees, NOT gated by the chunk skip-cache.
  // Parsing frontmatter + inserting ~tens of rows is milliseconds and has zero embedding cost.
  for (const rel of entityPaths) {
    const raw = await readFile(resolve(cfg.vaultRoot, rel), 'utf8')
    const { affiliations } = parseEntityFile(rel, raw, maxChars)
    await deleteFileEdges(db, rel)
    for (const a of affiliations) {
      const base = rawToBase(a.target)
      const toPath = resolver.get(base) ?? null
      await insertEdge(db, {
        fromPath: rel, toPath, toRaw: a.target, role: a.role,
        category: a.category, source: a.source, context: a.context, resolved: toPath != null,
      })
    }
  }

  // Derivation pass (slice 1): prose [[wikilink]] -> source=derived, role=references edges
  // over NON-entity files. Unconditional (like the entity edge pass): rebuilds on a fully
  // hash-skipped corpus. Reconcile via upsert against survivors (preserve created_at) +
  // vanished-wikilink cleanup; never a blanket per-file pre-delete (that would reset
  // created_at, breaking first-seen). Suppressed pairs are skipped (C1/M1/M2 channel).
  for (const rel of matches) {
    if (!isDerivationSource(rel)) continue
    const raw = await readFile(resolve(cfg.vaultRoot, rel), 'utf8')
    let content = raw
    try { content = matter(raw).content } catch { content = raw }
    const hits = scanProseWikilinks(content)
    const survivors = new Set<string>() // to_raw values that resolved AND were not suppressed
    for (const h of hits) {
      const target = resolver.get(rawToBase(h.raw))
      if (!target) continue // non-entity wikilink: skip
      if (await isSuppressed(db, rel, h.raw, 'references')) continue
      survivors.add(h.raw)
      await upsertDerivedEdge(db, {
        fromPath: rel, toPath: target, toRaw: h.raw, role: 'references',
        category: null, source: 'derived', context: h.context, resolved: true,
      })
    }
    // Vanished-wikilink cleanup: delete this file's derived edges whose to_raw is no longer present.
    for (const e of await listEdgesFrom(db, rel)) {
      if (e.source === 'derived' && e.role === 'references' && !survivors.has(e.to_raw)) {
        await db.query(
          `DELETE FROM edges WHERE from_path = $1 AND to_raw = $2 AND role = 'references' AND source = 'derived'`,
          [rel, e.to_raw],
        )
      }
    }
  }

  return { filesIndexed, filesSkipped, filesRemoved, chunksWritten }
}
