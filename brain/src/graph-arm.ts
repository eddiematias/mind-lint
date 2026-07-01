import type { PGlite } from '@electric-sql/pglite'
import { traverseEdges, bestChunkPerDoc } from './db.js'

export interface GraphArmConfig {
  enabled: boolean
  maxSeeds: number
  maxDocs: number
  roles: string[]
  maxHops: number
  direction: 'out' | 'in' | 'both'
}

export const DEFAULT_GRAPH_ARM: GraphArmConfig = {
  enabled: false,
  maxSeeds: 5,
  maxDocs: 10,
  roles: ['references'],
  maxHops: 1,
  direction: 'out',
}

// Relational-fanout arm: from the seed docs, walk `references` edges 1 hop out, then return each
// connected doc's query-closest chunk id, ordered most-similar-first (to be fused as a 3rd RRF list).
// Read-only. v1 reads roles[0]. Suppression is upstream (indexer); this arm follows exactly the edges present.
export async function graphArm(
  db: PGlite, qvec: number[], seedDocPaths: string[], cfg: GraphArmConfig,
): Promise<string[]> {
  if (seedDocPaths.length === 0 || cfg.maxDocs <= 0) return []
  const seedSet = new Set(seedDocPaths)
  const connected = new Set<string>()
  const role = cfg.roles[0]
  for (const seed of seedDocPaths) {
    const rows = await traverseEdges(db, seed, { direction: cfg.direction, depth: cfg.maxHops, role, includeMentions: false })
    for (const r of rows) {
      for (const endpoint of [r.from, r.to]) {
        if (endpoint && !seedSet.has(endpoint)) connected.add(endpoint)
      }
    }
  }
  if (connected.size === 0) return []
  const best = await bestChunkPerDoc(db, qvec, [...connected]) // already ordered most-similar-first
  return best.slice(0, cfg.maxDocs).map((r) => r.id)
}
