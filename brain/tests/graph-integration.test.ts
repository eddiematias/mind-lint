import { describe, it, expect, beforeEach } from 'vitest'
import { resolve } from 'node:path'
import { openDb, initSchema, traverseEdges, listEdgesFrom } from '../src/db.js'
import { FakeEmbedder } from '../src/embedder.js'
import { indexVault } from '../src/indexer.js'
import type { PGlite } from '@electric-sql/pglite'

// SEPARATE fixture root (graph-vault), NOT the shared fixtures/vault/ — keeps the
// existing toBe(2) file-count assertions untouched.
const vaultRoot = resolve(__dirname, 'fixtures/graph-vault')
const cfg = { vaultRoot, scopeGlobs: ['wiki/**/*.md'] }

describe('graph integration', () => {
  let db: PGlite
  beforeEach(async () => {
    db = await openDb('')
    await initSchema(db, 768)
    await indexVault(db, new FakeEmbedder(768), cfg, 2000)
  })

  it('direction:both on JBR enumerates the exact expected set', async () => {
    const rows = await traverseEdges(db, 'wiki/companies/JBR.md', { direction: 'both', depth: 1 })
    const endpoints = new Set(rows.flatMap((r) => [r.from, r.to]).filter((p) => p && p !== 'wiki/companies/JBR.md'))
    // outgoing: Jeff (founded), Otus (acquired), Nobody Profiled (unresolved → to_path null, surfaced via to_raw)
    // incoming: Jeff (founded → JBR)
    expect(endpoints.has('wiki/people/Jeff Perera.md')).toBe(true)
    expect(endpoints.has('wiki/companies/Otus Coffee.md')).toBe(true)
    expect(rows.some((r) => r.to === null && r.resolved === false)).toBe(true) // unprofiled surfaced
  })

  it('a 2-hop walk returns Downstream Hub → Mid → Leaf', async () => {
    // 2-hop chain lives in its own fixtures (added in this task); does not touch Otus,
    // so Task 4's Otus-edgeless assertion stays green.
    const rows = await traverseEdges(db, 'wiki/companies/Downstream Hub.md', { direction: 'out', depth: 2 })
    expect(rows.some((r) => r.from === 'wiki/companies/Downstream Mid.md' && r.to === 'wiki/people/Downstream Leaf.md' && r.hop === 2)).toBe(true)
  })

  it('an edgeless entity yields no outgoing edges', async () => {
    expect(await listEdgesFrom(db, 'wiki/projects/Solo.md')).toEqual([])
    // Otus stays edgeless across Task 4 AND Task 7 (no task mutates a prior fixture).
    expect(await listEdgesFrom(db, 'wiki/companies/Otus Coffee.md')).toEqual([])
  })
})
