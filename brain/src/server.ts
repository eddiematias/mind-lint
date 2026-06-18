import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createServer, type Server } from 'node:http'
import { createHash, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import type { PGlite } from '@electric-sql/pglite'
import type { Embedder, Reranker } from './types.js'
import { retrieve } from './retriever.js'

const SYNTH_HINT =
  'These are ranked evidence chunks from the vault. Synthesize a cited answer (reference sourcePath) and end with a short gap analysis of what is missing or stale.'

export function buildServer(db: PGlite, embedder: Embedder, reranker: Reranker): McpServer {
  const server = new McpServer({ name: 'mind-lint-brain', version: '0.1.0' })

  server.tool('search', { query: z.string(), k: z.number().optional() }, async ({ query, k }) => {
    const hits = await retrieve(db, embedder, reranker, query, k ?? 8)
    return { content: [{ type: 'text', text: JSON.stringify(hits, null, 2) }] }
  })

  server.tool('recall', { query: z.string(), k: z.number().optional() }, async ({ query, k }) => {
    const hits = await retrieve(db, embedder, reranker, query, k ?? 8)
    return { content: [{ type: 'text', text: JSON.stringify({ instruction: SYNTH_HINT, evidence: hits }, null, 2) }] }
  })

  return server
}

// Constant-time bearer-token check (R-I2). Hash BOTH the presented and expected
// token to a fixed 32-byte sha256 digest, then timingSafeEqual the digests. Hashing
// to a fixed width means the comparison never throws on unequal input lengths AND
// never leaks the token's length. A missing/malformed Authorization header takes the
// same compute-then-fail path (it hashes the empty string), so timing is uniform.
// Returns true only on an exact `Bearer <token>` match.
function bearerOk(authHeader: string | undefined, expected: string): boolean {
  const prefix = 'Bearer '
  const presented = authHeader && authHeader.startsWith(prefix) ? authHeader.slice(prefix.length) : ''
  const a = createHash('sha256').update(presented).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

// Stateless MCP over HTTP per the SDK's documented pattern: a fresh McpServer +
// transport per POST request. Reusing a single connected transport across requests
// breaks the post-initialize lifecycle (notifications/initialized returns 500), which
// a strict client (Claude Code) trips over. db/embedder/reranker are reused via
// closure; only the thin server/transport wrapper is recreated per request.
export function createMcpHttpServer(db: PGlite, embedder: Embedder, reranker: Reranker, opts: { authToken?: string } = {}): Server {
  return createServer(async (req, res) => {
    // App-level bearer gate (layer C), R-I1: FIRST statement, BEFORE the 405 method gate
    // and BEFORE any body read. Only enforced when a token is configured, so the default
    // open/loopback mode is unchanged. A missing/bad token returns a uniform 401 for ANY
    // method/path (an unauthenticated GET must not leak "405 Method not allowed", and an
    // attacker body is never parsed pre-auth).
    if (opts.authToken && !bearerOk(req.headers.authorization, opts.authToken)) {
      console.warn(`[brain] ${new Date().toISOString()} 401 unauthorized from ${req.socket.remoteAddress ?? 'unknown'}`)
      res.writeHead(401, { 'content-type': 'application/json', 'www-authenticate': 'Bearer' })
      res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32001, message: 'Unauthorized' }, id: null }))
      return
    }
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
}
