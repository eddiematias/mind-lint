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
  server: { host: '127.0.0.1', port: 8765, reindexIntervalMs: 600_000 },
  dreamCycle: {
    facts: {
      enabled: false,
      model: 'claude-haiku-4-5',
      apiKeyEnv: 'ANTHROPIC_API_KEY',
      maxTokens: 2000,
      cosineThreshold: 0.95,
      maxFactsPerFile: 20,
    },
    supersession: {
      enabled: false,
      neighborLo: 0.80,
      neighborHi: 0.985,
      maxPairsPerRun: 50,
    },
  },
}

export function loadConfig(raw: Partial<BrainConfig>, vaultRoot: string): BrainConfig {
  return {
    vaultRoot,
    dbPath: raw.dbPath ?? DEFAULTS.dbPath,
    scopeGlobs: raw.scopeGlobs ?? DEFAULTS.scopeGlobs,
    embedder: { ...DEFAULTS.embedder, ...(raw.embedder ?? {}) },
    reranker: { ...DEFAULTS.reranker, ...(raw.reranker ?? {}) },
    server: resolveServerConfig(raw.server),
    dreamCycle: {
      facts: { ...DEFAULTS.dreamCycle.facts, ...(raw.dreamCycle?.facts ?? {}) },
      supersession: { ...DEFAULTS.dreamCycle.supersession, ...(raw.dreamCycle?.supersession ?? {}) },
    },
  }
}

// Precedence for the server block: env vars (highest) > brain.config.json > code defaults.
// Env wins so the Mac Mini can set BRAIN_AUTH_TOKEN in the launchd plist's
// EnvironmentVariables without writing the token into any file. Unset/empty env vars
// are ignored, so a public-repo cloner with no env vars gets exactly the file/default
// behavior. The loopback default (127.0.0.1) is preserved.
function resolveServerConfig(raw: BrainConfig['server'] | undefined): BrainConfig['server'] {
  const merged = { ...DEFAULTS.server, ...(raw ?? {}) }
  if (process.env.BRAIN_HOST) merged.host = process.env.BRAIN_HOST
  if (process.env.BRAIN_PORT) {
    const p = parseInt(process.env.BRAIN_PORT, 10)
    if (!Number.isNaN(p)) merged.port = p // ignore an unparseable BRAIN_PORT; fall through to file/default
  }
  if (process.env.BRAIN_AUTH_TOKEN) merged.authToken = process.env.BRAIN_AUTH_TOKEN
  return merged
}

// Fail-closed serve guard (R-C1). serve requires a token unless the explicit
// BRAIN_ALLOW_NO_AUTH=1 escape hatch is set. The check is NOT gated on the bind
// address: the dangerous case is loopback + `tailscale serve` + no token, which a
// non-loopback heuristic misses. Returns an error message string when serving
// would be unauthenticated and disallowed; null when it is safe to proceed.
export function serveAuthError(authToken: string | undefined, allowNoAuth: boolean): string | null {
  if (authToken || allowNoAuth) return null
  return (
    'refusing to start: no server.authToken configured.\n' +
    'Set server.authToken in brain.config.json or the BRAIN_AUTH_TOKEN env var, or, only if you\n' +
    'really intend to run with NO authentication (purely local, no Tailscale Serve), set\n' +
    'BRAIN_ALLOW_NO_AUTH=1 to override. The MCP endpoint exposes the whole vault to anyone who\n' +
    'can reach it; fronting a no-auth server with `tailscale serve` exposes it to the tailnet.'
  )
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
