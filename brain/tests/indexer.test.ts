// brain/tests/indexer.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { resolve } from 'node:path'
import { openDb, initSchema } from '../src/db.js'
import { FakeEmbedder } from '../src/embedder.js'
import { indexVault } from '../src/indexer.js'
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
})
