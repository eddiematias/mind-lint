import type { PGlite } from '@electric-sql/pglite'
import type { Embedder, Reranker } from '../types.js'
import { retrieve, CANDIDATE_N } from '../retriever.js'
import { traverseEdges } from '../db.js'
import { DEFAULT_GRAPH_ARM } from '../graph-arm.js'
import type { GoldEntry } from './gold.js'
import { dedupeToDocs } from './run.js'

// Pure predicate: true when at least one relevant doc is present in the references-neighbors set.
// Exported for unit testing (no db required).
// The integrity guarantee is that reachedNeighbors NEVER includes seed docs (top-hit docs),
// so a relevant doc that is already a top hit cannot be labeled edgeReachable=true purely by
// appearing in the seed set. Only genuine references-neighbors of seeds qualify.
export function edgeReachableFor(reachedNeighbors: Set<string>, relevant: string[]): boolean {
  return relevant.some((r) => reachedNeighbors.has(r))
}

// Compute the references-neighbors set for a query.
// 1. Run retrieve arm-OFF to get the top-hit docs (the seed set).
// 2. For each seed, walk references 1-hop OUT via traverseEdges.
// 3. Collect ONLY the `to` endpoints, excluding any endpoint in the seed set
//    (the same !seedSet.has(endpoint) guard graphArm uses), and excluding nulls.
// This yields neighbors of seeds, NEVER seeds themselves. Integrity crux.
async function buildReachedNeighbors(
  db: PGlite,
  embedder: Embedder,
  reranker: Reranker,
  query: string,
  k: number,
): Promise<{ seedSet: Set<string>; reachedNeighbors: Set<string> }> {
  const armOff = { ...DEFAULT_GRAPH_ARM, enabled: false }
  const chunks = await retrieve(db, embedder, reranker, query, CANDIDATE_N, { graphArm: armOff })
  const topHitDocs = dedupeToDocs(chunks).slice(0, k)
  const seedSet = new Set(topHitDocs)
  const reachedNeighbors = new Set<string>()

  for (const seedDoc of topHitDocs) {
    const rows = await traverseEdges(db, seedDoc, {
      direction: 'out',
      role: 'references',
      depth: 1,
      includeMentions: false,
    })
    for (const row of rows) {
      const endpoint = row.to
      if (endpoint !== null && !seedSet.has(endpoint)) {
        reachedNeighbors.add(endpoint)
      }
    }
  }

  return { seedSet, reachedNeighbors }
}

// For each gold entry, compute and print the correct edgeReachable value.
// Prints: "<id> edgeReachable=<bool>" per entry.
// Does NOT rewrite the frozen gold file (human commits labels; re-verifiable by re-running).
export async function runLabelEdges(deps: {
  db: PGlite
  embedder: Embedder
  reranker: Reranker
  gold: GoldEntry[]
  k: number
}): Promise<void> {
  for (const entry of deps.gold) {
    const { reachedNeighbors } = await buildReachedNeighbors(
      deps.db,
      deps.embedder,
      deps.reranker,
      entry.query,
      deps.k,
    )
    const val = edgeReachableFor(reachedNeighbors, entry.relevant)
    console.log(`${entry.id} edgeReachable=${val}`)
  }
}
