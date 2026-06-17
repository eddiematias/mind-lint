import type { BrainConfig } from './types.js'

const DEFAULTS = {
  dbPath: 'data/brain.pglite',
  // rules/ and context/ are intentionally excluded: they are already always-loaded
  // every session, so indexing them would make recall return chunks the caller
  // already has in context. journal/ stays in for episodic recall.
  scopeGlobs: [
    'memory/**/*.md', 'wiki/**/*.md',
    'features/**/*.md', 'content/**/*.md', 'journal/**/*.md',
  ],
  embedder: { type: 'ollama' as const, model: 'nomic-embed-text', endpoint: 'http://localhost:11434', dimensions: 768 },
  reranker: { enabled: true, model: 'Xenova/bge-reranker-base' },
  server: { host: '127.0.0.1', port: 8765 },
}

export function loadConfig(raw: Partial<BrainConfig>, vaultRoot: string): BrainConfig {
  return {
    vaultRoot,
    dbPath: raw.dbPath ?? DEFAULTS.dbPath,
    scopeGlobs: raw.scopeGlobs ?? DEFAULTS.scopeGlobs,
    embedder: { ...DEFAULTS.embedder, ...(raw.embedder ?? {}) },
    reranker: { ...DEFAULTS.reranker, ...(raw.reranker ?? {}) },
    server: { ...DEFAULTS.server, ...(raw.server ?? {}) },
  }
}

// vaultRoot has no default: it must be an explicit absolute path to the vault to
// index. Because brain/ is symlinked from the clone, it cannot be inferred from the
// running file's location (see Task 11). The CLI calls this before loadConfig.
export function requireVaultRoot(raw: Partial<BrainConfig>): string {
  if (!raw.vaultRoot) {
    throw new Error('brain.config.json must set "vaultRoot" (absolute path to the vault to index). Copy brain.config.example.json and fill it in.')
  }
  return raw.vaultRoot
}
