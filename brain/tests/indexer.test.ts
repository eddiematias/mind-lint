// brain/tests/indexer.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { resolve } from 'node:path'
import { openDb, initSchema } from '../src/db.js'
import { FakeEmbedder } from '../src/embedder.js'
import { indexVault, buildEntityGazetteer } from '../src/indexer.js'
import { scanMentions } from '../src/chunker.js'
import type { PGlite } from '@electric-sql/pglite'

const vaultRoot = resolve(__dirname, 'fixtures/vault')
const cfg = { vaultRoot, scopeGlobs: ['memory/**/*.md', 'wiki/**/*.md'] }

describe('indexVault', () => {
  let db: PGlite
  beforeEach(async () => { db = await openDb(''); await initSchema(db, 768) })

  it('indexes all files and preserves metadata on chunks', async () => {
    const res = await indexVault(db, new FakeEmbedder(768), cfg, 2000)
    expect(res.filesIndexed).toBe(2)
    const rows = await db.query<{ c: number }>(`SELECT count(*)::int AS c FROM chunks`)
    expect(rows.rows[0].c).toBeGreaterThanOrEqual(2)
    const meta = await db.query<{ metadata: { title: string } }>(`SELECT metadata FROM chunks WHERE source_path = 'memory/one.md' LIMIT 1`)
    expect(meta.rows[0].metadata.title).toBe('One')
  })

  it('skips unchanged files on re-run (incremental)', async () => {
    await indexVault(db, new FakeEmbedder(768), cfg, 2000)
    const res2 = await indexVault(db, new FakeEmbedder(768), cfg, 2000)
    expect(res2.filesIndexed).toBe(0)
    expect(res2.filesSkipped).toBe(2)
  })

  it('re-chunks (does not skip) an unchanged file when the chunker version changes', async () => {
    const first = await indexVault(db, new FakeEmbedder(768), { ...cfg, chunkerVersion: 'v-old' }, 2000)
    expect(first.filesIndexed).toBe(2)
    // same raw bytes, but a bumped chunker version must invalidate the skip cache
    const second = await indexVault(db, new FakeEmbedder(768), { ...cfg, chunkerVersion: 'v-new' }, 2000)
    expect(second.filesIndexed).toBe(2)
    expect(second.filesSkipped).toBe(0)
  })

  it('re-chunks (does not skip) an unchanged file when the embedder id changes', async () => {
    // dims differ ⇒ FakeEmbedder.id differs ⇒ skip key differs.
    // (Schema is created at 768; both embedders here must still produce 768-dim vectors
    // for the chunks table, so swap the *id* without changing the stored vector width:
    // use a thin id override rather than a real dimension change.)
    const e768a = new FakeEmbedder(768)
    const e768b = new FakeEmbedder(768)
    Object.defineProperty(e768b, 'id', { value: 'fake:OTHER', configurable: true })
    const first = await indexVault(db, e768a, cfg, 2000)
    expect(first.filesIndexed).toBe(2)
    const second = await indexVault(db, e768b, cfg, 2000)
    expect(second.filesIndexed).toBe(2)
    expect(second.filesSkipped).toBe(0)
  })

  it('still skips unchanged files when version AND embedder id are unchanged', async () => {
    await indexVault(db, new FakeEmbedder(768), cfg, 2000)
    const again = await indexVault(db, new FakeEmbedder(768), cfg, 2000)
    expect(again.filesIndexed).toBe(0)
    expect(again.filesSkipped).toBe(2)
  })

  it('force re-chunks every file even when nothing changed', async () => {
    await indexVault(db, new FakeEmbedder(768), cfg, 2000)
    // without force this would be indexed=0 skipped=2; with force it must re-chunk all.
    const forced = await indexVault(db, new FakeEmbedder(768), { ...cfg, force: true }, 2000)
    expect(forced.filesIndexed).toBe(2)
    expect(forced.filesSkipped).toBe(0)
  })
})

// `resolve` is already imported near the top of indexer.test.ts — do NOT add a
// second `node:path` import; reuse the existing one.
import { listEdgesFrom, insertSuppression } from '../src/db.js'

// SEPARATE fixture root — keeps the existing toBe(2) file-count assertions (which run
// against the shared fixtures/vault/) untouched. Do NOT reuse the file's `vaultRoot`.
const graphVaultRoot = resolve(__dirname, 'fixtures/graph-vault')
const entityCfg = { vaultRoot: graphVaultRoot, scopeGlobs: ['wiki/**/*.md'] }
const derivCfg = { vaultRoot: graphVaultRoot, scopeGlobs: ['wiki/**/*.md', 'journal/**/*.md'] }

describe('indexVault edge-building', () => {
  let db: PGlite
  beforeEach(async () => { db = await openDb(''); await initSchema(db, 768) })

  it('builds edges from entity affiliations at index time', async () => {
    await indexVault(db, new FakeEmbedder(768), entityCfg, 2000)
    const jbrEdges = await listEdgesFrom(db, 'wiki/companies/JBR.md')
    expect(jbrEdges.map((e) => e.to_raw).sort()).toEqual(['[[Jeff Perera]]', '[[Nobody Profiled]]', '[[Otus Coffee]]'])
  })

  it('resolves a [[target]] to its entity file path; an unprofiled target stays unresolved', async () => {
    await indexVault(db, new FakeEmbedder(768), entityCfg, 2000)
    const edges = await listEdgesFrom(db, 'wiki/companies/JBR.md')
    const jeff = edges.find((e) => e.to_raw === '[[Jeff Perera]]')!
    expect(jeff.resolved).toBe(true)
    expect(jeff.to_path).toBe('wiki/people/Jeff Perera.md')
    const ghost = edges.find((e) => e.to_raw === '[[Nobody Profiled]]')!
    expect(ghost.resolved).toBe(false)
    expect(ghost.to_path).toBeNull()
  })

  it('basename collision resolves people > companies > projects', async () => {
    // Jeff declares [[JBR]]; both wiki/companies/JBR.md and wiki/projects/JBR.md exist.
    // people>companies>projects → company wins over project (no people/JBR.md), so the company file.
    await indexVault(db, new FakeEmbedder(768), entityCfg, 2000)
    const jeff = await listEdgesFrom(db, 'wiki/people/Jeff Perera.md')
    expect(jeff[0].to_path).toBe('wiki/companies/JBR.md')
  })

  it('an entity with affiliations: [] produces no edges', async () => {
    await indexVault(db, new FakeEmbedder(768), entityCfg, 2000)
    expect(await listEdgesFrom(db, 'wiki/companies/Otus Coffee.md')).toEqual([])
  })

  it('re-indexing does NOT duplicate edges (delete+insert rebuild)', async () => {
    await indexVault(db, new FakeEmbedder(768), entityCfg, 2000)
    await indexVault(db, new FakeEmbedder(768), entityCfg, 2000)
    expect(await listEdgesFrom(db, 'wiki/companies/JBR.md')).toHaveLength(3)
  })

  it('rebuilds edges on an already-indexed corpus even when every file is hash-skipped (I3 decoupling)', async () => {
    const first = await indexVault(db, new FakeEmbedder(768), entityCfg, 2000)
    expect(first.filesIndexed).toBeGreaterThan(0)
    // Wipe edges only (simulate a graph schema add to an existing index), keep file hashes.
    await db.query(`DELETE FROM edges`)
    const second = await indexVault(db, new FakeEmbedder(768), entityCfg, 2000)
    expect(second.filesSkipped).toBeGreaterThan(0) // chunks were skipped...
    expect(await listEdgesFrom(db, 'wiki/companies/JBR.md')).toHaveLength(3) // ...but edges rebuilt anyway
  })
})

describe('indexVault derivation pass', () => {
  let db: PGlite
  beforeEach(async () => { db = await openDb(''); await initSchema(db, 768) })

  it('derives a source=derived references edge from a prose wikilink to an entity', async () => {
    await indexVault(db, new FakeEmbedder(768), derivCfg, 2000)
    const edges = await listEdgesFrom(db, 'journal/2026-06-19.md')
    const jbr = edges.find((e) => e.to_raw === '[[JBR]]')!
    expect(jbr.source).toBe('derived')
    expect(jbr.role).toBe('references')
    expect(jbr.resolved).toBe(true)
    expect(jbr.to_path).toBe('wiki/companies/JBR.md')
  })

  it('de-dupes a wikilink mentioned twice to a single edge', async () => {
    await indexVault(db, new FakeEmbedder(768), derivCfg, 2000)
    const jbrEdges = (await listEdgesFrom(db, 'journal/2026-06-19.md')).filter((e) => e.to_raw === '[[JBR]]')
    expect(jbrEdges).toHaveLength(1)
  })

  it('skips a prose wikilink that does NOT resolve to an entity', async () => {
    await indexVault(db, new FakeEmbedder(768), derivCfg, 2000)
    const edges = await listEdgesFrom(db, 'journal/2026-06-19.md')
    expect(edges.some((e) => e.to_raw === '[[Some Concept]]')).toBe(false)
  })

  it('slice-1 derivation emits only role=references edges (criterion #6: mentions reserved)', async () => {
    await indexVault(db, new FakeEmbedder(768), derivCfg, 2000)
    // All derived edges must have role='references'. Any other role (mentions, etc.) is reserved for
    // later slices. Human affiliation edges (source='human') may have other roles and are not checked here.
    const res = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM edges WHERE source = 'derived' AND role != 'references'`)
    expect(res.rows[0].n).toBe(0)
  })

  it('does NOT derive edges from entity files (those use the affiliations edge pass)', async () => {
    await indexVault(db, new FakeEmbedder(768), derivCfg, 2000)
    // JBR company has only human affiliation edges, no source=derived edges
    const jbr = await listEdgesFrom(db, 'wiki/companies/JBR.md')
    expect(jbr.every((e) => e.source !== 'derived')).toBe(true)
  })

  it('created_at is preserved across re-derivation (first-seen invariant)', async () => {
    await indexVault(db, new FakeEmbedder(768), derivCfg, 2000)
    const first = await listEdgesFrom(db, 'journal/2026-06-19.md')
    const jbr1 = first.find((e) => e.to_raw === '[[JBR]]')! as unknown as { created_at: Date | string }
    await new Promise((r) => setTimeout(r, 5))
    await indexVault(db, new FakeEmbedder(768), derivCfg, 2000)
    const second = await listEdgesFrom(db, 'journal/2026-06-19.md')
    const jbr2 = second.find((e) => e.to_raw === '[[JBR]]')! as unknown as { created_at: Date | string }
    // Compare by time value, not .toBe(): PGlite returns a distinct Date instance per query.
    expect(new Date(jbr2.created_at).getTime()).toBe(new Date(jbr1.created_at).getTime())
  })

  it('a suppressed (from_path, to_raw, references) is skipped and does not re-appear', async () => {
    await insertSuppression(db, 'journal/2026-06-19.md', '[[JBR]]', 'references', 'test')
    await indexVault(db, new FakeEmbedder(768), derivCfg, 2000)
    const edges = await listEdgesFrom(db, 'journal/2026-06-19.md')
    expect(edges.some((e) => e.to_raw === '[[JBR]]' && e.source === 'derived')).toBe(false)
  })

  it('does NOT derive from agent-owned underscore files (I-1 self-referential loop guard)', async () => {
    // wiki/_log.md contains [[JBR]] verbatim but is a machine artifact, not human prose.
    // Scanning it would derive wiki/_log.md -> JBR and pollute the graph it audits.
    await indexVault(db, new FakeEmbedder(768), derivCfg, 2000)
    const edges = await listEdgesFrom(db, 'wiki/_log.md')
    expect(edges.some((e) => e.source === 'derived')).toBe(false)
  })
})

// graphVaultRoot is defined above at line 78; do NOT redeclare it here.
// PR-6/PR-7: use TOKEN_RE from chunker (exported) and graphVaultRoot from above.

describe('buildEntityGazetteer', () => {
  it('includes the JBR title (all-caps acronym exempt from min-char) resolving to companies', async () => {
    const gaz = await buildEntityGazetteer(graphVaultRoot, [
      'wiki/companies/JBR.md', 'wiki/projects/JBR.md',
    ])
    const hits = scanMentions('Met with JBR.', gaz)
    expect(hits.length).toBe(1)
    expect(hits[0].targetPath).toBe('wiki/companies/JBR.md') // people>companies>projects tiebreak
    expect(hits[0].canonicalRaw).toBe('[[JBR]]')
  })

  it('derives a person first-name from the name: field (Nadia)', async () => {
    const gaz = await buildEntityGazetteer(graphVaultRoot, ['wiki/people/Nadia Okafor.md'])
    const hits = scanMentions('Saw Nadia yesterday.', gaz)
    expect(hits.length).toBe(1)
    expect(hits[0].canonicalRaw).toBe('[[Nadia Okafor]]') // canonical = basename, not the first name
  })

  it('falls back to basename first-name when no name: field (Jeff)', async () => {
    const gaz = await buildEntityGazetteer(graphVaultRoot, ['wiki/people/Jeff Perera.md'])
    const hits = scanMentions('Jeff called.', gaz)
    expect(hits.map((h) => h.canonicalRaw)).toEqual(['[[Jeff Perera]]'])
  })

  it('excludes an ambiguous first-name shared by two people (+ no hit)', async () => {
    // Two people whose first token is "Downstream" -> excluded as ambiguous.
    const gaz = await buildEntityGazetteer(graphVaultRoot, [
      'wiki/people/Downstream Leaf.md', 'wiki/people/Downstream Twin.md',
    ])
    expect(scanMentions('Downstream is here.', gaz).length).toBe(0)
  })

  it('M2: a person first-name equal to a single-word title resolves to the TITLE (title wins)', async () => {
    const gaz = await buildEntityGazetteer(graphVaultRoot, ['wiki/projects/Solo.md', 'wiki/people/Solo Maker.md'])
    const hits = scanMentions('Solo shipped today.', gaz)
    expect(hits.length).toBe(1)
    expect(hits[0].targetPath).toBe('wiki/projects/Solo.md')
  })
})
