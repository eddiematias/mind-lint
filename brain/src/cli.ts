import { readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadConfig, requireVaultRoot, serveAuthError } from './config.js'
import type { BrainConfig } from './types.js'
import { openDb, initSchema, setMeta } from './db.js'
import { OllamaEmbedder } from './embedder.js'
import { AnthropicChatClient } from './chat.js'
import { CHUNKER_VERSION } from './chunker.js'
import { makeReranker } from './reranker.js'
import { indexVault } from './indexer.js'
import { createMcpHttpServer } from './server.js'
import { pullVault, startReindexLoop } from './reindex-loop.js'
import { runFactsCycle } from './dream-cycle.js'

// brain/ is symlinked into the vault from the public clone, so Node resolves
// import.meta.url to the CLONE's real path, not the vault. That's fine for locating
// brain.config.json and the db (they live next to the code in the clone). But it
// means vaultRoot CANNOT be inferred from this file's location and must be set
// explicitly in brain.config.json.
function brainDir(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..')
}

async function readConfig(): Promise<BrainConfig> {
  let raw: Partial<BrainConfig> = {}
  try { raw = JSON.parse(await readFile(resolve(brainDir(), 'brain.config.json'), 'utf8')) } catch { /* defaults */ }
  return loadConfig(raw, requireVaultRoot(raw)) // requireVaultRoot throws a clear error if vaultRoot is unset
}

async function main() {
  const cmd = process.argv[2]
  const cfg = await readConfig()
  const embedder = new OllamaEmbedder(cfg.embedder)

  if (cmd === 'reindex') {
    // DB is only needed for reindex and serve; open it here, not at the top of main.
    const db = await openDb(resolve(brainDir(), cfg.dbPath))
    await initSchema(db, cfg.embedder.dimensions)
    const force = process.argv.includes('--force') || process.argv.includes('--full')
    const res = await indexVault(db, embedder, { vaultRoot: cfg.vaultRoot, scopeGlobs: cfg.scopeGlobs, force })
    await setMeta(db, 'chunker_version', CHUNKER_VERSION)
    await setMeta(db, 'embedder_id', embedder.id)
    console.log(
      `indexed=${res.filesIndexed} skipped=${res.filesSkipped} removed=${res.filesRemoved} chunks=${res.chunksWritten} ` +
        `chunker=${CHUNKER_VERSION} embedder=${embedder.id}${force ? ' (forced)' : ''}`,
    )
    process.exit(0)
  }

  if (cmd === 'serve') {
    // DB is only needed for reindex and serve; open it here, not at the top of main.
    const db = await openDb(resolve(brainDir(), cfg.dbPath))
    await initSchema(db, cfg.embedder.dimensions)
    const reranker = makeReranker(cfg.reranker)
    const { host, port, authToken } = cfg.server
    const allowNoAuth = process.env.BRAIN_ALLOW_NO_AUTH === '1'
    const err = serveAuthError(authToken, allowNoAuth)
    if (err) {
      console.error(`[brain] ${err}`)
      process.exit(1) // fail closed (R-C1)
    }
    const http = createMcpHttpServer(db, embedder, reranker, { authToken })
    const mode = authToken ? ' (bearer auth required)' : ' (NO AUTH, BRAIN_ALLOW_NO_AUTH=1)'
    http.listen(port, host, () => console.log(`brain serving on http://${host}:${port}/mcp${mode}`))

    // In-process reindex (single DB owner). PGlite is single-writer, so a SEPARATE periodic
    // reindex process cannot persist while serve holds the DB; reindexing here makes serve the
    // only writer and removes that conflict (retire any external reindex cron). The cycle pulls
    // the vault then reindexes; both are guarded so a failure never crashes serve.
    const reindexIntervalMs = cfg.server.reindexIntervalMs ?? 600_000
    if (reindexIntervalMs > 0) {
      const runCycle = async () => {
        const pull = await pullVault(cfg.vaultRoot)
        if (!pull.ok) console.error(`[brain] vault pull failed (reindexing existing content anyway): ${pull.output}`)
        const res = await indexVault(db, embedder, { vaultRoot: cfg.vaultRoot, scopeGlobs: cfg.scopeGlobs })
        await setMeta(db, 'chunker_version', CHUNKER_VERSION)
        await setMeta(db, 'embedder_id', embedder.id)
        console.log(
          `[brain] reindex: indexed=${res.filesIndexed} skipped=${res.filesSkipped} removed=${res.filesRemoved} chunks=${res.chunksWritten}`,
        )
      }
      startReindexLoop({ intervalMs: reindexIntervalMs, runCycle, onError: (e) => console.error('[brain] reindex cycle error:', e) })
      console.log(`[brain] in-process reindex every ${Math.round(reindexIntervalMs / 1000)}s`)
    }
    return
  }

  if (cmd === 'dream') {
    const facts = cfg.dreamCycle?.facts
    if (!facts?.enabled) {
      console.log('[brain] dream: facts cycle disabled (dreamCycle.facts.enabled=false)')
      process.exit(0)
    }
    const apiKey = process.env[facts.apiKeyEnv]
    if (!apiKey) {
      console.log(`[brain] dream: ${facts.apiKeyEnv} not set, skipping facts cycle`)
      process.exit(0)
    }
    const chat = new AnthropicChatClient({ model: facts.model, apiKey, maxTokens: facts.maxTokens })
    const res = await runFactsCycle({
      vaultRoot: cfg.vaultRoot,
      scopeGlobs: cfg.scopeGlobs,
      chat,
      embedder,
      cosineThreshold: facts.cosineThreshold,
      maxFactsPerFile: facts.maxFactsPerFile,
      watermarkPath: resolve(brainDir(), 'data/last-cycle-commit'),
      // Local calendar date (YYYY-MM-DD via en-CA) so the commit message and each
      // fact's validFrom match the operator's wall clock, not UTC. toISOString() is
      // UTC and stamped tomorrow's date on late-evening-local runs.
      now: new Date().toLocaleDateString('en-CA'),
    })
    console.log(`[brain] dream: scanned=${res.filesScanned} facts+=${res.factsWritten} chatCalls=${res.chatCalls} skipped=${res.skipped}`)
    process.exit(0)
  }

  console.error('usage: brain <reindex|serve|dream>')
  process.exit(1)
}

main().catch((e) => { console.error(e); process.exit(1) })
