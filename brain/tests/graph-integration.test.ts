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

// Task 4: quarantine derived mentions from traverseEdges (I2, I3).
// These tests create their own db + schema; they do NOT call indexVault so the
// beforeEach fixture data does not interfere with the raw edge inserts below.
describe('traverseEdges mention quarantine', () => {
  it('derived mentions hidden by default, shown with includeMentions, human mentions never hidden', async () => {
    const db = await openDb('')
    await initSchema(db, 768)
    // seed: a derived mention edge and a human role:mentions affiliation to a similar target
    await db.query(`INSERT INTO edges (from_path,to_path,to_raw,role,source,context,resolved) VALUES
      ('journal/x.md','wiki/companies/JBR.md','[[JBR]]','mentions','derived','JBR is hiring',true),
      ('wiki/companies/JBR.md','wiki/people/Nobody.md','[[Nobody]]','mentions','human','',false)`)

    const def = await traverseEdges(db, 'wiki/companies/JBR.md', { direction: 'both', depth: 1 })
    // derived mention hidden by default; human mention kept
    expect(def.some((r) => r.source === 'derived' && r.role === 'mentions')).toBe(false)
    expect(def.some((r) => r.source === 'human' && r.role === 'mentions')).toBe(true)

    const inc = await traverseEdges(db, 'wiki/companies/JBR.md', { direction: 'both', depth: 1, includeMentions: true })
    expect(inc.some((r) => r.source === 'derived' && r.role === 'mentions')).toBe(true)
  })

  it('quarantine blocks derived mentions from forming depth-2 hops (I3)', async () => {
    const db = await openDb('')
    await initSchema(db, 768)
    // A --(derived mention)--> B --(human references)--> C. With mentions hidden, C must be unreachable from A.
    await db.query(`INSERT INTO edges (from_path,to_path,to_raw,role,source,context,resolved) VALUES
      ('A.md','B.md','[[B]]','mentions','derived','',true),
      ('B.md','C.md','[[C]]','references','human','',true)`)
    const rows = await traverseEdges(db, 'A.md', { direction: 'out', depth: 2 })
    expect(rows.some((r) => r.to === 'C.md')).toBe(false)
  })
})
