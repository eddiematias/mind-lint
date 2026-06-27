import type { Embedder } from '../types.js'
import { factKey, type Fact } from './markdown.js'

export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

// Returns the candidates that are NOT near-duplicates of an existing fact or of an
// earlier-kept candidate. Exact-key duplicates are dropped before embedding (cheap).
export async function dedupeNewFacts(
  embedder: Embedder, existing: Fact[], candidates: Fact[], threshold: number,
): Promise<Fact[]> {
  const existingKeys = new Set(existing.map(factKey))
  const fresh = candidates.filter((c) => !existingKeys.has(factKey(c)))
  if (fresh.length === 0) return []
  // Embed existing + fresh together so indices line up.
  const allClaims = [...existing.map((e) => e.claim), ...fresh.map((c) => c.claim)]
  const vecs = await embedder.embed(allClaims)
  const existingVecs = vecs.slice(0, existing.length)
  const freshVecs = vecs.slice(existing.length)
  const kept: Fact[] = []
  const keptVecs: number[][] = [...existingVecs]
  for (let i = 0; i < fresh.length; i++) {
    const v = freshVecs[i]
    const dup = keptVecs.some((k) => cosine(v, k) >= threshold)
    if (!dup) { kept.push(fresh[i]); keptVecs.push(v) }
  }
  return kept
}
