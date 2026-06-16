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
})
