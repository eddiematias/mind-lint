import type { PGlite } from '@electric-sql/pglite'
import type { Embedder, Reranker, RetrievedChunk } from './types.js'
import { vectorSearch, keywordSearch, getChunkContents } from './db.js'
import { reciprocalRankFusion } from './rrf.js'

export const CANDIDATE_N = 20

export async function retrieve(
  db: PGlite, embedder: Embedder, reranker: Reranker, query: string, k = 8,
): Promise<RetrievedChunk[]> {
  const [qvec] = await embedder.embed([query])
  const [vRows, kRows] = await Promise.all([
    vectorSearch(db, qvec, CANDIDATE_N),
    keywordSearch(db, query, CANDIDATE_N),
  ])

  const fusedIds = reciprocalRankFusion([vRows.map((r) => r.id), kRows.map((r) => r.id)], 60)
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
