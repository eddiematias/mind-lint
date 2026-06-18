export interface BrainConfig {
  dbPath: string                 // '' or ':memory:' for in-memory
  scopeGlobs: string[]           // globs relative to vaultRoot
  vaultRoot: string              // absolute path to the vault
  embedder: { type: 'ollama'; model: string; endpoint: string; dimensions: number }
  reranker: { enabled: boolean; model: string }
  // authToken: when set, createMcpHttpServer requires `Authorization: Bearer <token>`.
  // Optional so the default open/loopback mode (the public-repo cloner default) is unchanged.
  // Never committed: it comes from the gitignored brain.config.json or the BRAIN_AUTH_TOKEN env var.
  server: { host: string; port: number; authToken?: string }
}

export interface Chunk {
  id: string                     // `${sourcePath}#${chunkIndex}`
  sourcePath: string
  chunkIndex: number
  content: string
  metadata: Record<string, unknown>
  contentHash: string
}

export interface RetrievedChunk {
  id: string
  sourcePath: string
  content: string
  metadata: Record<string, unknown>
  score: number
}

export interface Embedder {
  // Stable identity of the embedding model + output shape (e.g. 'ollama:nomic-embed-text:768').
  // Folded into the reindex skip key so swapping the embedding model auto-invalidates the cache.
  readonly id: string
  readonly dimensions: number
  embed(texts: string[]): Promise<number[][]>
}

export interface Reranker {
  // returns indices of `candidates` reordered best-first
  rerank(query: string, candidates: string[]): Promise<number[]>
}
