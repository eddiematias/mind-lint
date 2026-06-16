import { readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createServer } from 'node:http'
import { loadConfig, requireVaultRoot } from './config.js'
import type { BrainConfig } from './types.js'
import { openDb, initSchema } from './db.js'
import { OllamaEmbedder } from './embedder.js'
import { makeReranker } from './reranker.js'
import { indexVault } from './indexer.js'
import { buildServer } from './server.js'

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
  const db = await openDb(resolve(brainDir(), cfg.dbPath)) // db lives in the clone's brain/data (gitignored)
  await initSchema(db, cfg.embedder.dimensions)
  const embedder = new OllamaEmbedder(cfg.embedder)

  if (cmd === 'reindex') {
    const res = await indexVault(db, embedder, { vaultRoot: cfg.vaultRoot, scopeGlobs: cfg.scopeGlobs })
    console.log(`indexed=${res.filesIndexed} skipped=${res.filesSkipped} removed=${res.filesRemoved} chunks=${res.chunksWritten}`)
    process.exit(0)
  }

  if (cmd === 'serve') {
    const reranker = makeReranker(cfg.reranker)
    const server = buildServer(db, embedder, reranker)
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
    await server.connect(transport)
    const http = createServer((req, res) => transport.handleRequest(req, res))
    http.listen(cfg.server.port, cfg.server.host, () => console.log(`brain serving on http://${cfg.server.host}:${cfg.server.port}/mcp`))
    return
  }

  console.error('usage: brain <reindex|serve>')
  process.exit(1)
}

main().catch((e) => { console.error(e); process.exit(1) })
