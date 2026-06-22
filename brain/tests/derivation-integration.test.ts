import { describe, it, expect, beforeEach } from 'vitest'
import { resolve } from 'node:path'
import {
  openDb, initSchema, listEdgesFrom, listDerivedEdges, insertSuppression, upsertDerivedEdge,
} from '../src/db.js'
import { FakeEmbedder } from '../src/embedder.js'
import { indexVault } from '../src/indexer.js'
import type { PGlite } from '@electric-sql/pglite'

const vaultRoot = resolve(__dirname, 'fixtures/graph-vault')
const cfg = { vaultRoot, scopeGlobs: ['wiki/**/*.md', 'journal/**/*.md', 'content/**/*.md'] }

describe('derivation integration', () => {
  let db: PGlite
  beforeEach(async () => { db = await openDb(''); await initSchema(db, 768) })

  it('a journal [[JBR]] mention becomes a derived edge present in the since window', async () => {
    await indexVault(db, new FakeEmbedder(768), cfg, 2000)
    const edges = await listEdgesFrom(db, 'journal/2026-06-19.md')
    expect(edges.some((e) => e.to_raw === '[[JBR]]' && e.source === 'derived')).toBe(true)
    const pending = await listDerivedEdges(db, null, 500)
    expect(pending.some((r) => r.from_path === 'journal/2026-06-19.md' && r.to_raw === '[[JBR]]')).toBe(true)
  })

  it('suppress -> reindex -> the edge is gone and stays gone (reject path)', async () => {
    await indexVault(db, new FakeEmbedder(768), cfg, 2000)
    await insertSuppression(db, 'journal/2026-06-19.md', '[[JBR]]', 'references', 'wrong target')
    await indexVault(db, new FakeEmbedder(768), cfg, 2000)
    const edges = await listEdgesFrom(db, 'journal/2026-06-19.md')
    expect(edges.some((e) => e.to_raw === '[[JBR]]' && e.source === 'derived')).toBe(false)
  })

  it('vanished-wikilink cleanup: an edge whose to_raw is no longer derived is deleted', async () => {
    // Simulate a prior pass that derived an edge for a wikilink the current source no longer contains.
    await upsertDerivedEdge(db, { fromPath: 'content/note-a.md', toPath: 'wiki/companies/JBR.md', toRaw: '[[JBR]]', role: 'references', category: null, source: 'derived', context: 'stale', resolved: true })
    // The on-disk content/note-a.md mentions [[Otus Coffee]], NOT [[JBR]]: so the reindex
    // re-derives Otus and must delete the stale [[JBR]] derived edge for this file.
    await indexVault(db, new FakeEmbedder(768), cfg, 2000)
    const edges = await listEdgesFrom(db, 'content/note-a.md')
    expect(edges.some((e) => e.to_raw === '[[JBR]]' && e.source === 'derived')).toBe(false) // stale gone
    expect(edges.some((e) => e.to_raw === '[[Otus Coffee]]' && e.source === 'derived')).toBe(true) // current present
  })

  it('a since watermark slices pending to only newer edges', async () => {
    await indexVault(db, new FakeEmbedder(768), cfg, 2000)
    const future = new Date(Date.now() + 60_000).toISOString()
    expect(await listDerivedEdges(db, future, 500)).toEqual([])
  })

  it('a re-confirmed edge is NOT pending after mark-reviewed (success criterion #4, first-seen across the review loop)', async () => {
    // First index: capture the max created_at (the value /review-derived would advance to).
    await indexVault(db, new FakeEmbedder(768), cfg, 2000)
    const pending = await listDerivedEdges(db, null, 500)
    expect(pending.length).toBeGreaterThan(0)
    const watermark = pending.reduce((max, r) => (r.created_at > max ? r.created_at : max), pending[0].created_at)
    // Re-index (no vault change): the same edges are re-confirmed via upsert (created_at preserved).
    await indexVault(db, new FakeEmbedder(768), cfg, 2000)
    // After mark-reviewed (watermark := the max shown created_at), a re-confirmed edge is NOT
    // returned by listDerivedEdges(since = watermark): strict-> means created_at = watermark is
    // not > watermark, so it is no longer pending.
    expect(await listDerivedEdges(db, watermark, 500)).toEqual([])
  })

  it('derives role:mentions from BARE prose only, not wikilinked names; both edges coexist (C3, decision 5)', async () => {
    await indexVault(db, new FakeEmbedder(768), cfg, 2000)
    const edges = await listEdgesFrom(db, 'content/mentions-note.md')
    // bare "JBR" -> mention edge AND [[JBR]] -> references edge, same target, no collision (role differs)
    expect(edges.some((e) => e.to_raw === '[[JBR]]' && e.role === 'mentions' && e.source === 'derived')).toBe(true)
    expect(edges.some((e) => e.to_raw === '[[JBR]]' && e.role === 'references' && e.source === 'derived')).toBe(true)
    // [[Otus Coffee]] is ONLY wikilinked -> never a mention
    expect(edges.some((e) => e.to_path === 'wiki/companies/Otus Coffee.md' && e.role === 'mentions')).toBe(false)
  })

  it('mention created_at is preserved across re-derivation (first-seen)', async () => {
    await indexVault(db, new FakeEmbedder(768), cfg, 2000)
    const first = await listEdgesFrom(db, 'content/mentions-note.md')
    const m1 = first.find((e) => e.to_raw === '[[JBR]]' && e.role === 'mentions')! as unknown as { created_at: Date | string }
    await new Promise((r) => setTimeout(r, 5))           // PR-3: non-vacuous guard (mirrors slice-1 test)
    await indexVault(db, new FakeEmbedder(768), cfg, 2000) // no force: the derivation pass is unconditional
    const second = await listEdgesFrom(db, 'content/mentions-note.md')
    const m2 = second.find((e) => e.to_raw === '[[JBR]]' && e.role === 'mentions')! as unknown as { created_at: Date | string }
    expect(new Date(m2.created_at).getTime()).toBe(new Date(m1.created_at).getTime())
  })

  it('a suppressed mention is skipped but the references edge to the same target survives, and stays gone (criterion 5)', async () => {
    await insertSuppression(db, 'content/mentions-note.md', '[[JBR]]', 'mentions', 'noise')
    await indexVault(db, new FakeEmbedder(768), cfg, 2000)
    let edges = await listEdgesFrom(db, 'content/mentions-note.md')
    expect(edges.some((e) => e.to_raw === '[[JBR]]' && e.role === 'mentions')).toBe(false)   // mention skipped
    expect(edges.some((e) => e.to_raw === '[[JBR]]' && e.role === 'references')).toBe(true)   // references untouched
    await indexVault(db, new FakeEmbedder(768), cfg, 2000)
    edges = await listEdgesFrom(db, 'content/mentions-note.md')
    expect(edges.some((e) => e.to_raw === '[[JBR]]' && e.role === 'mentions')).toBe(false)    // stays gone
  })

  it('renders the FULL pending set past a single page; watermark covers the OLDEST, not just the newest (C-1)', async () => {
    // Seed N=1100 derived edges with EXPLICIT, strictly-increasing created_at (1 second apart) so
    // seed-0000 is provably the oldest and all timestamps are distinct. Uses a direct SQL insert
    // rather than upsertDerivedEdge (which uses DEFAULT now() and would produce clock-dependent,
    // potentially tied timestamps). The edges_unique 4-tuple (from_path,to_raw,role,source) stays
    // unique because from_path differs across rows.
    const N = 1100
    const BASE_MS = Date.UTC(2026, 0, 1) // 2026-01-01T00:00:00.000Z
    for (let i = 0; i < N; i++) {
      const ts = new Date(BASE_MS + i * 1000).toISOString()
      await db.query(
        `INSERT INTO edges (from_path, to_path, to_raw, role, category, source, context, resolved, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz)`,
        [
          `journal/seed-${String(i).padStart(4, '0')}.md`,
          'wiki/companies/JBR.md', '[[JBR]]', 'references', null,
          'derived', `ctx ${i}`, true, ts,
        ],
      )
    }
    // A single capped page (limit=500 < N=1100) returns only the 500 NEWEST rows, so the oldest
    // seed-0000 is NOT present. This proves a single page drops the oldest row.
    const onePage = await listDerivedEdges(db, null, 500)
    expect(onePage.length).toBe(500)
    expect(onePage.some((r) => r.from_path === 'journal/seed-0000.md')).toBe(false)

    // Grow-the-limit paging: start BELOW N so the loop actually iterates and doubles at least once.
    // After the loop, `all` contains every seeded row including seed-0000 (the oldest).
    let limit = 500
    let all: { from_path: string; created_at: Date | string }[] = []
    for (;;) {
      const page = await listDerivedEdges(db, null, limit)
      all = page
      if (page.length < limit) break
      limit *= 2
    }
    expect(all.length).toBe(N) // every seeded edge is rendered, none truncated
    expect(all.some((r) => r.from_path === 'journal/seed-0000.md')).toBe(true) // oldest IS recovered

    // pending-through = max(created_at) across ALL rendered rows. It must equal the newest
    // seeded timestamp (seed-1099, BASE_MS + (N-1)*1000), proving the watermark covers the
    // full set and the oldest was not advanced past unshown.
    const pendingThrough = all.reduce(
      (max, r) => (new Date(r.created_at).getTime() > new Date(max).getTime() ? r.created_at : max),
      all[0].created_at,
    )
    expect(new Date(pendingThrough).getTime()).toBe(BASE_MS + (N - 1) * 1000)
  })
})
