import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createServer, type Server } from 'node:http'
import { createHash, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import type { PGlite } from '@electric-sql/pglite'
import type { Embedder, Reranker } from './types.js'
import { retrieve } from './retriever.js'
import { type GraphArmConfig } from './graph-arm.js'
import { traverseEdges, listDerivedEdges, listSuppressions, insertSuppression, deleteSuppression } from './db.js'

const SUBTREE_RANK: Record<string, number> = { 'wiki/people/': 0, 'wiki/companies/': 1, 'wiki/projects/': 2 }

// Resolve a "[[Name]]" or bare "Name" to a seed entity path, scoped to the three
// subtrees, with the people > companies > projects collision tiebreak. Resolves against
// the INDEXED FILE SET (the `files` table), which includes edgeless entity files — so a
// real-but-edgeless entity (e.g. Amara, affiliations: []) resolves and traversal returns
// an honest empty, distinguishable from a non-existent entity. Match is case-INsensitive.
async function resolveSeed(db: PGlite, entity: string): Promise<string | null> {
  if (entity.startsWith('wiki/') && entity.endsWith('.md')) return entity // already a path
  const base = entity.replace(/^\[\[/, '').replace(/\]\]$/, '').trim().toLowerCase()
  const res = await db.query<{ path: string }>(`SELECT path FROM files`)
  const candidates = res.rows
    .map((r) => r.path)
    .filter(
      (p) =>
        /^wiki\/(people|companies|projects)\//.test(p) &&
        !/\/_index\.md$/.test(p) && // roster files are not entities (and all share basename _index)
        p.replace(/\.md$/i, '').split('/').pop()!.toLowerCase() === base,
    )
  if (candidates.length === 0) return null
  candidates.sort((a, b) => {
    const ra = SUBTREE_RANK[Object.keys(SUBTREE_RANK).find((d) => a.startsWith(d))!]
    const rb = SUBTREE_RANK[Object.keys(SUBTREE_RANK).find((d) => b.startsWith(d))!]
    return ra - rb
  })
  return candidates[0]
}

const SYNTH_HINT =
  'These are ranked evidence chunks from the vault. Synthesize a cited answer (reference sourcePath) and end with a short gap analysis of what is missing or stale.'

export function buildServer(db: PGlite, embedder: Embedder, reranker: Reranker, graphArmCfg?: GraphArmConfig): McpServer {
  const server = new McpServer({ name: 'mind-lint-brain', version: '0.1.0' })

  server.tool('search', { query: z.string(), k: z.number().optional() }, async ({ query, k }) => {
    const hits = await retrieve(db, embedder, reranker, query, k ?? 8, { graphArm: graphArmCfg })
    return { content: [{ type: 'text', text: JSON.stringify(hits, null, 2) }] }
  })

  server.tool('recall', { query: z.string(), k: z.number().optional() }, async ({ query, k }) => {
    const hits = await retrieve(db, embedder, reranker, query, k ?? 8, { graphArm: graphArmCfg })
    return { content: [{ type: 'text', text: JSON.stringify({ instruction: SYNTH_HINT, evidence: hits }, null, 2) }] }
  })

  server.tool(
    'connections',
    {
      entity: z.string(),
      direction: z.enum(['out', 'in', 'both']).optional(),
      depth: z.number().optional(),
      role: z.string().optional(),
      source: z.string().optional(),
      category: z.string().optional(),
      includeMentions: z.boolean().optional(),
    },
    async ({ entity, direction, depth, role, source, category, includeMentions }) => {
      const seed = await resolveSeed(db, entity)
      if (!seed) {
        // Unresolved: no such entity file. Distinct from a resolved-but-edgeless entity.
        return { content: [{ type: 'text', text: JSON.stringify({ entity, resolved: false, seed: null, rows: [] }) }] }
      }
      // Resolved: real entity. `rows` may legitimately be empty (edgeless entity, e.g. Amara).
      const rows = await traverseEdges(db, seed, { direction, depth, role, source, category, includeMentions })
      return { content: [{ type: 'text', text: JSON.stringify({ entity, resolved: true, seed, rows }) }] }
    },
  )

  server.tool(
    'derived_edges',
    { since: z.string().optional(), limit: z.number().optional() },
    async ({ since, limit }) => {
      const rows = await listDerivedEdges(db, since ?? null, limit ?? 500)
      const suppressions = await listSuppressions(db)
      return { content: [{ type: 'text', text: JSON.stringify({ rows, suppressions }) }] }
    },
  )

  server.tool(
    'suppress_edge',
    {
      from_path: z.string(),
      to_raw: z.string(),
      role: z.string().optional(),
      reason: z.string().optional(),
      action: z.enum(['add', 'remove']).optional(),
    },
    async ({ from_path, to_raw, role, reason, action }) => {
      const r = role ?? 'references'
      if ((action ?? 'add') === 'remove') {
        await deleteSuppression(db, from_path, to_raw, r)
        return { content: [{ type: 'text', text: JSON.stringify({ ok: true, action: 'remove', from_path, to_raw, role: r }) }] }
      }
      await insertSuppression(db, from_path, to_raw, r, reason ?? '')
      return { content: [{ type: 'text', text: JSON.stringify({ ok: true, action: 'add', from_path, to_raw, role: r }) }] }
    },
  )

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
export function createMcpHttpServer(db: PGlite, embedder: Embedder, reranker: Reranker, opts: { authToken?: string; graphArm?: GraphArmConfig } = {}): Server {
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
      const server = buildServer(db, embedder, reranker, opts.graphArm)
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
