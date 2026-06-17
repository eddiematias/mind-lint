export interface BrainConfig {
  dbPath: string                 // '' or ':memory:' for in-memory
  scopeGlobs: string[]           // globs relative to vaultRoot
  vaultRoot: string              // absolute path to the vault
  embedder: { type: 'ollama'; model: string; endpoint: string; dimensions: number }
  reranker: { enabled: boolean; model: string }
  server: { host: string; port: number }
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
  readonly dimensions: number
  embed(texts: string[]): Promise<number[][]>
}

export interface Reranker {
  // returns indices of `candidates` reordered best-first
  rerank(query: string, candidates: string[]): Promise<number[]>
}
