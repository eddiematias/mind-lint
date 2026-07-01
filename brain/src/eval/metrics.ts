// Document-level IR metrics for the retrieval eval. Pure + deterministic.
// `retrieved` is a ranked list of DISTINCT sourcePaths (best rank first); `relevant` is the gold set.

export function recallAtK(retrieved: string[], relevant: string[], k: number): number {
  if (relevant.length === 0) return 1 // nothing required, nothing missed
  const topK = new Set(retrieved.slice(0, k))
  const hits = relevant.filter((r) => topK.has(r)).length
  return hits / relevant.length
}

export function mrr(retrieved: string[], relevant: string[]): number {
  const rel = new Set(relevant)
  for (let i = 0; i < retrieved.length; i++) {
    if (rel.has(retrieved[i])) return 1 / (i + 1)
  }
  return 0
}

export function hitAtK(retrieved: string[], relevant: string[], k: number): boolean {
  const rel = new Set(relevant)
  return retrieved.slice(0, k).some((d) => rel.has(d))
}
