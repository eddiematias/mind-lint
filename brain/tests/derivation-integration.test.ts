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

  it('renders the FULL pending set past a single page; watermark covers the OLDEST, not just the newest (C-1)', async () => {
    // Seed more than one page of derived edges with strictly increasing created_at, so a single
    // capped page would drop the oldest. This guards the C-1 truncation bug: the artifact must
    // render ALL pending edges and pending-through must equal max(ALL pending), so the oldest is
    // rendered and counted, not advanced-past unshown.
    const N = 1100 // > the 500 default cap, forces the paging path
    for (let i = 0; i < N; i++) {
      await upsertDerivedEdge(db, {
        fromPath: `journal/seed-${String(i).padStart(4, '0')}.md`,
        toPath: 'wiki/companies/JBR.md', toRaw: `[[JBR]]`, role: 'references',
        category: null, source: 'derived', context: `ctx ${i}`, resolved: true,
      })
    }
    // Page until exhausted (mirrors the /reindex render loop), accumulating ALL rows.
    const all: { from_path: string; created_at: string }[] = []
    let limit = 5000
    for (;;) {
      const page = await listDerivedEdges(db, null, limit)
      all.length = 0
      all.push(...page)
      if (page.length < limit) break
      limit *= 2
    }
    expect(all.length).toBeGreaterThanOrEqual(N) // every seeded edge is rendered, none truncated
    // pending-through = max(created_at among ALL rendered rows) covers the newest...
    const pendingThrough = all.reduce((max, r) => (r.created_at > max ? r.created_at : max), all[0].created_at)
    // ...and the OLDEST edge is in the rendered set (it would be lost by a single capped page).
    const oldest = all.reduce((min, r) => (r.created_at < min ? r.created_at : min), all[0].created_at)
    expect(all.some((r) => r.created_at === oldest)).toBe(true)
    expect(pendingThrough >= oldest).toBe(true)
  })
})
