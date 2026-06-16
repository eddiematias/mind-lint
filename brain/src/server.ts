import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
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
