// brain/tests/server.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Server } from 'node:http'
import type { PGlite } from '@electric-sql/pglite'
import { openDb, initSchema } from '../src/db.js'
import { FakeEmbedder } from '../src/embedder.js'
import { NoopReranker } from '../src/reranker.js'
import { createMcpHttpServer } from '../src/server.js'

// Exercises the real MCP Streamable-HTTP wire contract (the consumer's contract,
// not our own output shape). Regression guard for the stateless-transport bug where
// a reused transport made notifications/initialized return 500 and broke the handshake.
// FakeEmbedder + NoopReranker => no Ollama / no model download needed in CI.
describe('MCP HTTP handshake', () => {
  let server: Server
  let db: PGlite
  let url: string

  beforeAll(async () => {
    db = await openDb('')
    await initSchema(db, 768)
    server = createMcpHttpServer(db, new FakeEmbedder(768), new NoopReranker())
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const addr = server.address()
    const port = typeof addr === 'object' && addr ? addr.port : 0
    url = `http://127.0.0.1:${port}/mcp`
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  const post = (body: unknown) =>
    fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify(body),
    })

  it('initialize returns 200 with server info', async () => {
    const res = await post({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 't', version: '0' } },
    })
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('mind-lint-brain')
  })

  it('notifications/initialized returns 202 (the bug returned 500)', async () => {
    const res = await post({ jsonrpc: '2.0', method: 'notifications/initialized' })
    expect(res.status).toBe(202)
  })

  it('tools/list returns the search and recall tools', async () => {
    const res = await post({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('"name":"search"')
    expect(text).toContain('"name":"recall"')
  })

  it('rejects non-POST with 405', async () => {
    const res = await fetch(url, { method: 'GET' })
    expect(res.status).toBe(405)
  })
})
