import type { PGlite } from '@electric-sql/pglite'
import type { Embedder, Reranker, RetrievedChunk } from './types.js'
import { vectorSearch, keywordSearch, getChunkContents } from './db.js'
import { reciprocalRankFusion } from './rrf.js'
import { graphArm, type GraphArmConfig } from './graph-arm.js'

export const CANDIDATE_N = 20

export async function retrieve(
  db: PGlite, embedder: Embedder, reranker: Reranker, query: string, k = 8,
  opts: { graphArm?: GraphArmConfig } = {},
): Promise<RetrievedChunk[]> {
  const [qvec] = await embedder.embed([query])
  const [vRows, kRows] = await Promise.all([
    vectorSearch(db, qvec, CANDIDATE_N),
    keywordSearch(db, query, CANDIDATE_N),
  ])
  const vIds = vRows.map((r) => r.id)
  const kIds = kRows.map((r) => r.id)

  let fusedIds: string[]
  const arm = opts.graphArm
  if (arm?.enabled) {
    // Seed the fanout from the top DOCS of a preliminary vector+keyword fusion.
    const prelim = reciprocalRankFusion([vIds, kIds], 60)
    const idToPath = new Map<string, string>()
    for (const r of [...vRows, ...kRows]) idToPath.set(r.id, r.source_path)
    const seenDocs = new Set<string>()
    const seedDocs: string[] = []
    for (const id of prelim) {
      const p = idToPath.get(id)
      if (p && !seenDocs.has(p)) { seenDocs.add(p); seedDocs.push(p); if (seedDocs.length >= arm.maxSeeds) break }
    }
    const graphIds = await graphArm(db, qvec, seedDocs, arm)
    fusedIds = reciprocalRankFusion([vIds, kIds, graphIds], 60)
  } else {
    fusedIds = reciprocalRankFusion([vIds, kIds], 60) // unchanged, bit-identical to today
  }

  const topIds = fusedIds.slice(0, CANDIDATE_N)
  const rows = await getChunkContents(db, topIds)
  const byId = new Map(rows.map((r) => [r.id, r]))
  const ordered = topIds.map((id) => byId.get(id)).filter(Boolean) as typeof rows
  const rerankOrder = await reranker.rerank(query, ordered.map((r) => r.content))
  const final = rerankOrder.map((idx, rank) => {
    const r = ordered[idx]
    return { id: r.id, sourcePath: r.source_path, content: r.content, metadata: r.metadata, score: 1 / (rank + 1) }
  })
  return final.slice(0, k)
}
