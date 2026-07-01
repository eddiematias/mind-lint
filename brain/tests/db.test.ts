// brain/tests/db.test.ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { openDb, initSchema, upsertChunk, vectorSearch, keywordSearch, getMeta, setMeta, bestChunkPerDoc } from '../src/db.js'
import { existsSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import type { PGlite } from '@electric-sql/pglite'

function vec(seed: number, dim = 768): number[] {
  return Array.from({ length: dim }, (_, i) => Math.sin(seed * (i + 1)))
}

describe('db', () => {
  let db: PGlite
  beforeEach(async () => {
    db = await openDb('')
    await initSchema(db, 768)
  })

  it('upserts and vector-searches a chunk', async () => {
    await upsertChunk(db, { id: 'a#0', sourcePath: 'a.md', chunkIndex: 0, content: 'apples and oranges', metadata: { t: 1 }, contentHash: 'h1' }, vec(1))
    const hits = await vectorSearch(db, vec(1), 5)
    expect(hits[0].id).toBe('a#0')
    expect(hits[0].source_path).toBe('a.md')
  })

  it('keyword-searches by content', async () => {
    await upsertChunk(db, { id: 'b#0', sourcePath: 'b.md', chunkIndex: 0, content: 'payload migration discipline', metadata: {}, contentHash: 'h2' }, vec(2))
    const hits = await keywordSearch(db, 'migration', 5)
    expect(hits.map((h) => h.id)).toContain('b#0')
  })

  it('stores and reads back meta key/value rows', async () => {
    expect(await getMeta(db, 'chunker_version')).toBeNull()
    await setMeta(db, 'chunker_version', '2')
    await setMeta(db, 'embedder_id', 'fake:768')
    expect(await getMeta(db, 'chunker_version')).toBe('2')
    expect(await getMeta(db, 'embedder_id')).toBe('fake:768')
    // upsert semantics: re-setting a key overwrites
    await setMeta(db, 'chunker_version', '3')
    expect(await getMeta(db, 'chunker_version')).toBe('3')
  })
})

describe('bestChunkPerDoc', () => {
  it('returns the query-closest chunk per doc, most-similar-first, [] for empty paths', async () => {
    const db = await openDb('')
    await initSchema(db, 3)
    // doc a.md: two chunks. a.md#1 is [1,0,0] (exact match to query). a.md#0 is [0,1,0] (farther).
    // doc b.md: one chunk at [0.6,0.6,0] (farther than a.md#1 but closer than a.md#0).
    await upsertChunk(db, { id: 'a.md#0', sourcePath: 'a.md', chunkIndex: 0, content: 'a0', metadata: {}, contentHash: 'h1' }, [0, 1, 0])
    await upsertChunk(db, { id: 'a.md#1', sourcePath: 'a.md', chunkIndex: 1, content: 'a1', metadata: {}, contentHash: 'h2' }, [1, 0, 0])
    await upsertChunk(db, { id: 'b.md#0', sourcePath: 'b.md', chunkIndex: 0, content: 'b0', metadata: {}, contentHash: 'h3' }, [0.6, 0.6, 0])

    // empty paths returns []
    expect(await bestChunkPerDoc(db, [1, 0, 0], [])).toEqual([])

    // two docs: one row per doc, best chunk chosen, ordered by ascending distance
    const rows = await bestChunkPerDoc(db, [1, 0, 0], ['a.md', 'b.md'])
    expect(rows.map((r) => r.id)).toEqual(['a.md#1', 'b.md#0'])
  })
})

describe('openDb (file-backed)', () => {
  const tmp = resolve(__dirname, '_tmp_db', 'nested', 'brain.pglite')
  afterAll(() => rmSync(resolve(__dirname, '_tmp_db'), { recursive: true, force: true }))

  it('creates missing parent directories for a configured dbPath', async () => {
    // regression: PGLite's nodefs does a non-recursive mkdir on the data dir, so a
    // dbPath whose parent does not exist throws ENOENT unless openDb creates it.
    const db = await openDb(tmp)
    await initSchema(db, 768)
    expect(existsSync(tmp)).toBe(true)
  })
})
