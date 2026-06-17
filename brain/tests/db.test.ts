// brain/tests/db.test.ts
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { openDb, initSchema, upsertChunk, vectorSearch, keywordSearch } from '../src/db.js'
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
