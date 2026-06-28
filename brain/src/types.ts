export interface BrainConfig {
  dbPath: string                 // '' or ':memory:' for in-memory
  scopeGlobs: string[]           // globs relative to vaultRoot
  vaultRoot: string              // absolute path to the vault
  embedder: { type: 'ollama'; model: string; endpoint: string; dimensions: number }
  reranker: { enabled: boolean; model: string }
  // authToken: when set, createMcpHttpServer requires `Authorization: Bearer <token>`.
  // Optional so the default open/loopback mode (the public-repo cloner default) is unchanged.
  // Never committed: it comes from the gitignored brain.config.json or the BRAIN_AUTH_TOKEN env var.
  // reindexIntervalMs: how often the serve process reindexes IN-PROCESS (it is the sole
  // owner of the single-writer DB, so no separate reindex process can conflict). Default
  // 600000 (10 min). 0 disables the loop (dev, or when an external reindex is used).
  server: { host: string; port: number; authToken?: string; reindexIntervalMs?: number }
  // The autonomous dream-cycle (slice 3). Absent/disabled: the `dream` command is a no-op.
  // The cycle has an LLM (chat) for derivation; retrieval/serve stay zero-LLM.
  dreamCycle?: {
    facts: {
      enabled: boolean
      model: string        // e.g. 'claude-haiku-4-5'
      apiKeyEnv: string    // env var holding the Anthropic key, e.g. 'ANTHROPIC_API_KEY'
      maxTokens: number
      cosineThreshold: number   // dedup threshold against the existing embedder space
      maxFactsPerFile: number   // per-source extraction cap
    }
    supersession: {
      enabled: boolean
      neighborLo: number     // candidate cosine lower bound (similar enough to maybe conflict)
      neighborHi: number     // upper bound (exclude near-identical duplicates)
      maxPairsPerRun: number // hard cap on LLM judge calls per night (logged if hit)
    }
  }
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
