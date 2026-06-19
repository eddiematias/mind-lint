// brain/tests/edges.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { openDb, initSchema } from '../src/db.js'
import type { PGlite } from '@electric-sql/pglite'

describe('edges schema', () => {
  let db: PGlite
  beforeEach(async () => { db = await openDb(''); await initSchema(db, 768) })

  it('creates the edges table with the expected columns', async () => {
    const res = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'edges'`,
    )
    const cols = res.rows.map((r) => r.column_name).sort()
    expect(cols).toEqual(
      ['category', 'context', 'created_at', 'from_path', 'id', 'resolved', 'role', 'source', 'to_path', 'to_raw'].sort(),
    )
  })

  it('enforces the NULLS NOT DISTINCT unique constraint (two NULL to_path rows collide)', async () => {
    const ins = `INSERT INTO edges (from_path, to_path, to_raw, role, source) VALUES ($1, NULL, $2, $3, $4)`
    await db.query(ins, ['wiki/people/A.md', '[[Ghost]]', 'knows', 'human'])
    // same (from_path, to_raw, role, source) with NULL to_path must be deduped, not duplicated
    await db.query(ins + ` ON CONFLICT DO NOTHING`, ['wiki/people/A.md', '[[Ghost]]', 'knows', 'human'])
    const c = await db.query<{ c: number }>(`SELECT count(*)::int AS c FROM edges`)
    expect(c.rows[0].c).toBe(1)
  })
})

import { insertEdge, deleteFileEdges, listEdgesFrom, deleteFileChunks } from '../src/db.js'

describe('edge CRUD', () => {
  let db: PGlite
  beforeEach(async () => { db = await openDb(''); await initSchema(db, 768) })

  it('inserts an edge and reads it back from a from_path', async () => {
    await insertEdge(db, {
      fromPath: 'wiki/companies/JBR.md', toPath: 'wiki/people/Jeff Perera.md',
      toRaw: '[[Jeff Perera]]', role: 'founded', category: 'business', source: 'human', context: '', resolved: true,
    })
    const rows = await listEdgesFrom(db, 'wiki/companies/JBR.md')
    expect(rows).toHaveLength(1)
    expect(rows[0].to_raw).toBe('[[Jeff Perera]]')
    expect(rows[0].resolved).toBe(true)
  })

  it('re-inserting the same edge does not duplicate it (ON CONFLICT)', async () => {
    const e = { fromPath: 'wiki/companies/JBR.md', toPath: null, toRaw: '[[Ghost]]', role: 'knows', category: null, source: 'human', context: '', resolved: false }
    await insertEdge(db, e)
    await insertEdge(db, e)
    expect(await listEdgesFrom(db, 'wiki/companies/JBR.md')).toHaveLength(1)
  })

  it('deleteFileEdges removes only that file’s outgoing edges', async () => {
    await insertEdge(db, { fromPath: 'wiki/companies/JBR.md', toPath: null, toRaw: '[[X]]', role: 'r', category: null, source: 'human', context: '', resolved: false })
    await insertEdge(db, { fromPath: 'wiki/people/Jeff Perera.md', toPath: null, toRaw: '[[JBR]]', role: 'founded', category: null, source: 'human', context: '', resolved: false })
    await deleteFileEdges(db, 'wiki/companies/JBR.md')
    expect(await listEdgesFrom(db, 'wiki/companies/JBR.md')).toHaveLength(0)
    expect(await listEdgesFrom(db, 'wiki/people/Jeff Perera.md')).toHaveLength(1)
  })

  it('deleteFileChunks also sweeps that file’s edges (deleted-file sweep, I2)', async () => {
    await insertEdge(db, { fromPath: 'wiki/companies/Gone.md', toPath: null, toRaw: '[[X]]', role: 'r', category: null, source: 'human', context: '', resolved: false })
    await deleteFileChunks(db, 'wiki/companies/Gone.md')
    expect(await listEdgesFrom(db, 'wiki/companies/Gone.md')).toHaveLength(0)
  })
})

import { insertEdge as ins, traverseEdges } from '../src/db.js'

async function seedGraph(db: PGlite) {
  // JBR → Jeff (founded), JBR → Otus (acquired), Jeff → JBR (founded), Otus → DownstreamCafe (supplies)
  const E = (fromPath: string, toPath: string, toRaw: string, role: string) =>
    ins(db, { fromPath, toPath, toRaw, role, category: 'business', source: 'human', context: '', resolved: true })
  await E('wiki/companies/JBR.md', 'wiki/people/Jeff Perera.md', '[[Jeff Perera]]', 'founded')
  await E('wiki/companies/JBR.md', 'wiki/companies/Otus Coffee.md', '[[Otus Coffee]]', 'acquired')
  await E('wiki/people/Jeff Perera.md', 'wiki/companies/JBR.md', '[[JBR]]', 'founded')
  await E('wiki/companies/Otus Coffee.md', 'wiki/projects/DownstreamCafe.md', '[[DownstreamCafe]]', 'supplies')
}

describe('traverseEdges', () => {
  let db: PGlite
  beforeEach(async () => { db = await openDb(''); await initSchema(db, 768); await seedGraph(db) })

  it('direction:out lists outgoing 1-hop edges', async () => {
    const rows = await traverseEdges(db, 'wiki/companies/JBR.md', { direction: 'out', depth: 1 })
    expect(rows.map((r) => r.to).sort()).toEqual(['wiki/companies/Otus Coffee.md', 'wiki/people/Jeff Perera.md'])
  })

  it('direction:in lists incoming 1-hop edges (reverse join flip)', async () => {
    const rows = await traverseEdges(db, 'wiki/companies/JBR.md', { direction: 'in', depth: 1 })
    expect(rows.map((r) => r.from)).toContain('wiki/people/Jeff Perera.md')
  })

  it('direction:both surfaces the connection either way', async () => {
    const rows = await traverseEdges(db, 'wiki/people/Jeff Perera.md', { direction: 'both', depth: 1 })
    // Jeff→JBR (out) and JBR→Jeff (in) both surface JBR as the connected endpoint
    expect(rows.some((r) => r.to === 'wiki/companies/JBR.md' || r.from === 'wiki/companies/JBR.md')).toBe(true)
  })

  it('depth:2 returns a multi-hop walk (JBR → Otus → DownstreamCafe)', async () => {
    const rows = await traverseEdges(db, 'wiki/companies/JBR.md', { direction: 'out', depth: 2 })
    expect(rows.some((r) => r.to === 'wiki/projects/DownstreamCafe.md' && r.hop === 2)).toBe(true)
  })

  it('a role filter narrows the result set', async () => {
    const rows = await traverseEdges(db, 'wiki/companies/JBR.md', { direction: 'out', depth: 1, role: 'acquired' })
    expect(rows.map((r) => r.to)).toEqual(['wiki/companies/Otus Coffee.md'])
  })

  it('does not loop forever on a cycle (visited[] guard)', async () => {
    // JBR↔Jeff is a 2-cycle; depth 5 must terminate.
    const rows = await traverseEdges(db, 'wiki/companies/JBR.md', { direction: 'both', depth: 5 })
    expect(Array.isArray(rows)).toBe(true) // terminates, no hang/throw
  })
})
