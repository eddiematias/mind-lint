import { describe, it, expect } from 'vitest'
import { openDb, initSchema, upsertChunk, upsertDerivedEdge } from '../src/db.js'
import { graphArm, DEFAULT_GRAPH_ARM } from '../src/graph-arm.js'

// Seed a tiny graph: seed.md --references--> nb.md (relevant), and a derived mention seed.md->noise.md.
// Edges are inserted per-edge via the REAL helper upsertDerivedEdge (db.ts:190); EdgeInput shape is
// { fromPath, toPath, toRaw, role, category, source, context, resolved } (db.ts:132). There is NO
// batch upsertEdges. references edges are source='derived' in production, so seed them that way.
async function seed() {
  const db = await openDb('')
  await initSchema(db, 3)
  await upsertChunk(db, { id: 'seed.md#0', sourcePath: 'seed.md', chunkIndex: 0, content: 's', metadata: {}, contentHash: 'h0' }, [1, 0, 0])
  await upsertChunk(db, { id: 'nb.md#0', sourcePath: 'nb.md', chunkIndex: 0, content: 'n', metadata: {}, contentHash: 'h1' }, [0.9, 0.1, 0])
  await upsertChunk(db, { id: 'noise.md#0', sourcePath: 'noise.md', chunkIndex: 0, content: 'x', metadata: {}, contentHash: 'h2' }, [0, 0, 1])
  await upsertDerivedEdge(db, { fromPath: 'seed.md', toPath: 'nb.md', toRaw: 'nb.md', role: 'references', category: null, source: 'derived', context: '', resolved: true })
  await upsertDerivedEdge(db, { fromPath: 'seed.md', toPath: 'noise.md', toRaw: 'noise.md', role: 'mentions', category: null, source: 'derived', context: '', resolved: true })
  return db
}

describe('graphArm', () => {
  it('1-hop outbound references fanout returns the connected doc best chunk; excludes seed; excludes derived mentions', async () => {
    const db = await seed()
    const ids = await graphArm(db, [1, 0, 0], ['seed.md'], { ...DEFAULT_GRAPH_ARM, enabled: true })
    expect(ids).toContain('nb.md#0')       // references neighbor surfaces
    expect(ids).not.toContain('seed.md#0') // seed's own doc excluded
    expect(ids).not.toContain('noise.md#0')// derived mention NOT followed (includeMentions:false)
  })
  it('returns [] when there are no seeds', async () => {
    const db = await seed()
    expect(await graphArm(db, [1, 0, 0], [], { ...DEFAULT_GRAPH_ARM, enabled: true })).toEqual([])
  })
  it('returns [] when the seed has no references edges', async () => {
    const db = await seed()
    expect(await graphArm(db, [1, 0, 0], ['nb.md'], { ...DEFAULT_GRAPH_ARM, enabled: true })).toEqual([])
  })
  it('caps the result at maxDocs', async () => {
    const db = await seed()
    const ids = await graphArm(db, [1, 0, 0], ['seed.md'], { ...DEFAULT_GRAPH_ARM, enabled: true, maxDocs: 0 })
    expect(ids).toEqual([])
  })
})
