import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { Embedder } from '../types.js'
import { factKey, type Fact } from './markdown.js'

export async function loadVectorCache(path: string): Promise<Map<string, number[]>> {
  try {
    const obj = JSON.parse(await readFile(path, 'utf8')) as Record<string, number[]>
    return new Map(Object.entries(obj))
  } catch { return new Map() }
}

export async function saveVectorCache(path: string, cache: Map<string, number[]>): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(Object.fromEntries(cache)))
}

// ADD-ONLY (PR-2): embed only the facts whose key is not already cached (batched by
// the embedder) and return the mutated cache. It must NOT prune: the probe calls this
// once per fact file against one shared cache, so pruning here would delete the other
// files' vectors and re-embed the whole corpus nightly (the R-I3 failure). The embedder
// owns batching (OllamaEmbedder batches by 64); no DB is touched.
export async function embedFactsCached(
  embedder: Embedder, facts: Fact[], cache: Map<string, number[]>,
): Promise<Map<string, number[]>> {
  const missing = facts.filter((f) => !cache.has(factKey(f)))
  if (missing.length > 0) {
    const vecs = await embedder.embed(missing.map((f) => f.claim))
    missing.forEach((f, i) => cache.set(factKey(f), vecs[i]))
  }
  return cache
}

// Drop cache entries whose key is not in liveKeys. The probe calls this ONCE after
// embedding every fact file, with the UNION of all live fact keys (PR-2).
export function pruneVectorCache(cache: Map<string, number[]>, liveKeys: Set<string>): void {
  for (const k of [...cache.keys()]) if (!liveKeys.has(k)) cache.delete(k)
}
