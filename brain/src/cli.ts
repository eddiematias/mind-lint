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
    // Stateless MCP per the SDK's documented pattern: a fresh server + transport per
    // request. Reusing a single connected transport across requests breaks the
    // post-initialize lifecycle (notifications/initialized returns 500), which Claude
    // Code's client trips over. db/embedder/reranker are reused via closure; only the
    // thin McpServer/transport wrapper is recreated per request (cheap).
    const http = createServer(async (req, res) => {
      if (req.method !== 'POST') {
        res.writeHead(405, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed' }, id: null }))
        return
      }
      try {
        const chunks: Buffer[] = []
        for await (const c of req) chunks.push(c as Buffer)
        const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : undefined
        const server = buildServer(db, embedder, reranker)
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
        res.on('close', () => { void transport.close(); void server.close() })
        await server.connect(transport)
        await transport.handleRequest(req, res, body)
      } catch (e) {
        console.error(e)
        if (!res.headersSent) {
          res.writeHead(500, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null }))
        }
      }
    })
    http.listen(cfg.server.port, cfg.server.host, () => console.log(`brain serving on http://${cfg.server.host}:${cfg.server.port}/mcp`))
    return
  }

  console.error('usage: brain <reindex|serve>')
  process.exit(1)
}

main().catch((e) => { console.error(e); process.exit(1) })
