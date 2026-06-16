// brain/tests/retriever.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { resolve } from 'node:path'
import { openDb, initSchema } from '../src/db.js'
import { FakeEmbedder } from '../src/embedder.js'
import { NoopReranker } from '../src/reranker.js'
import { indexVault } from '../src/indexer.js'
import { retrieve } from '../src/retriever.js'
import type { PGlite } from '@electric-sql/pglite'

const vaultRoot = resolve(__dirname, 'fixtures/vault')
const cfg = { vaultRoot, scopeGlobs: ['memory/**/*.md', 'wiki/**/*.md'] }

describe('retrieve', () => {
  let db: PGlite
  beforeEach(async () => {
    db = await openDb(''); await initSchema(db, 768)
    await indexVault(db, new FakeEmbedder(768), cfg, 2000)
  })

  it('returns the keyword-matching source in top-k for a keyword query', async () => {
    const out = await retrieve(db, new FakeEmbedder(768), new NoopReranker(), 'migration', 5)
    expect(out.map((r) => r.sourcePath)).toContain('wiki/two.md')
    expect(out[0]).toHaveProperty('content')
    expect(out[0]).toHaveProperty('score')
  })
})
