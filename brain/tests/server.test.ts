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

describe('MCP HTTP bearer auth', () => {
  const TOKEN = 'test-secret-token'

  async function startServer(opts: { authToken?: string }) {
    const db: PGlite = await openDb('')
    await initSchema(db, 768)
    const server: Server = createMcpHttpServer(db, new FakeEmbedder(768), new NoopReranker(), opts)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const addr = server.address()
    const port = typeof addr === 'object' && addr ? addr.port : 0
    const url = `http://127.0.0.1:${port}/mcp`
    const close = () => new Promise<void>((resolve) => server.close(() => resolve()))
    return { url, close }
  }

  const initialize = {
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 't', version: '0' } },
  }
  const post = (url: string, headers: Record<string, string> = {}) =>
    fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers },
      body: JSON.stringify(initialize),
    })

  it('with a token configured, a request with NO Authorization header returns 401', async () => {
    const { url, close } = await startServer({ authToken: TOKEN })
    try {
      const res = await post(url)
      expect(res.status).toBe(401)
      expect(res.headers.get('www-authenticate')).toBe('Bearer')
    } finally {
      await close()
    }
  })

  it('with a token configured, a WRONG token (different length) returns 401', async () => {
    const { url, close } = await startServer({ authToken: TOKEN })
    try {
      const res = await post(url, { authorization: 'Bearer wrong-token' })
      expect(res.status).toBe(401)
    } finally {
      await close()
    }
  })

  it('with a token configured, a SAME-LENGTH wrong token returns 401 (exercises the digest compare)', async () => {
    const { url, close } = await startServer({ authToken: TOKEN })
    try {
      const sameLen = 'xxxx-xxxxxx-xxxxx'
      expect(sameLen.length).toBe(TOKEN.length)
      const res = await post(url, { authorization: `Bearer ${sameLen}` })
      expect(res.status).toBe(401)
    } finally {
      await close()
    }
  })

  it('with a token configured, an unauthenticated GET returns 401 (not 405), auth gate is above the method gate', async () => {
    const { url, close } = await startServer({ authToken: TOKEN })
    try {
      const res = await fetch(url, { method: 'GET' })
      expect(res.status).toBe(401)
      expect(res.headers.get('www-authenticate')).toBe('Bearer')
    } finally {
      await close()
    }
  })

  it('with a token configured, the CORRECT Bearer token returns a normal 200 MCP response', async () => {
    const { url, close } = await startServer({ authToken: TOKEN })
    try {
      const res = await post(url, { authorization: `Bearer ${TOKEN}` })
      expect(res.status).toBe(200)
      expect(await res.text()).toContain('mind-lint-brain')
    } finally {
      await close()
    }
  })

  it('with NO token configured (open mode), a request with no header still returns 200', async () => {
    const { url, close } = await startServer({})
    try {
      const res = await post(url)
      expect(res.status).toBe(200)
      expect(await res.text()).toContain('mind-lint-brain')
    } finally {
      await close()
    }
  })
})

import { insertEdge, upsertDerivedEdge, insertSuppression, deleteSuppression } from '../src/db.js'

describe('connections MCP tool', () => {
  let server: Server
  let db: PGlite
  let url: string

  beforeAll(async () => {
    db = await openDb('')
    await initSchema(db, 768)
    // resolveSeed resolves against the `files` table (so edgeless entities resolve too),
    // so register the entity files there — including the edgeless Amara — not just edges.
    const F = (path: string) =>
      db.query(`INSERT INTO files (path, file_hash) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [path, 'h'])
    await F('wiki/companies/JBR.md')
    await F('wiki/people/Jeff Perera.md')
    await F('wiki/people/Amara Markovic.md') // real but edgeless (affiliations: [])
    const E = (fromPath: string, toPath: string | null, toRaw: string, role: string, resolved: boolean) =>
      insertEdge(db, { fromPath, toPath, toRaw, role, category: 'business', source: 'human', context: '', resolved })
    await E('wiki/companies/JBR.md', 'wiki/people/Jeff Perera.md', '[[Jeff Perera]]', 'founded', true)
    await E('wiki/companies/JBR.md', null, '[[Nobody Profiled]]', 'mentions', false)
    await E('wiki/people/Jeff Perera.md', 'wiki/companies/JBR.md', '[[JBR]]', 'founded', true)
    server = createMcpHttpServer(db, new FakeEmbedder(768), new NoopReranker())
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const addr = server.address()
    const port = typeof addr === 'object' && addr ? addr.port : 0
    url = `http://127.0.0.1:${port}/mcp`
  })
  afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())) })

  async function callTool(name: string, args: Record<string, unknown>) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name, arguments: args } }),
    })
    return res
  }

  // The MCP Streamable-HTTP transport delivers tool results as an SSE frame whose
  // `data:` line is the JSON-RPC envelope; the handler's own JSON is double-stringified
  // into result.content[0].text. Assert on the PARSED payload (the consumer's contract),
  // not the escaped wire bytes.
  interface ConnPayload {
    entity: string
    resolved: boolean
    seed: string | null
    rows: Array<{ from: string; to: string | null; to_raw: string; role: string; resolved: boolean }>
  }
  async function callPayload(name: string, args: Record<string, unknown>): Promise<ConnPayload> {
    const body = await (await callTool(name, args)).text()
    const dataLine = body.split('\n').find((l) => l.startsWith('data:'))
    if (!dataLine) throw new Error(`no SSE data line in response: ${body}`)
    const envelope = JSON.parse(dataLine.slice('data:'.length).trim())
    return JSON.parse(envelope.result.content[0].text) as ConnPayload
  }

  it('lists the connections tool in tools/list', async () => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
    })
    expect(await res.text()).toContain('"name":"connections"')
  })

  it('connections direction:both on [[JBR]] enumerates both directions incl. the unprofiled target', async () => {
    const p = await callPayload('connections', { entity: '[[JBR]]', direction: 'both' })
    expect(p.resolved).toBe(true)
    expect(p.rows.some((r) => r.to === 'wiki/people/Jeff Perera.md')).toBe(true) // outgoing
    expect(p.rows.some((r) => r.to_raw === '[[Nobody Profiled]]' && !r.resolved)).toBe(true) // unprofiled target surfaced by name
  })

  it('a real-but-edgeless entity resolves and returns an honest empty (resolved:true, rows:[])', async () => {
    const p = await callPayload('connections', { entity: '[[Amara Markovic]]', direction: 'both' })
    // resolved:true + the seed path + empty rows distinguish edgeless from "no such entity".
    expect(p.resolved).toBe(true)
    expect(p.seed).toContain('Amara Markovic.md')
    expect(p.rows).toEqual([])
  })

  it('a non-existent entity returns resolved:false', async () => {
    const p = await callPayload('connections', { entity: '[[Definitely Not A Person]]', direction: 'both' })
    expect(p.resolved).toBe(false)
    expect(p.rows).toEqual([])
  })

  it('resolves a lowercase name (case-insensitive basename match)', async () => {
    const p = await callPayload('connections', { entity: 'jbr', direction: 'out' })
    expect(p.resolved).toBe(true) // 'jbr' resolved to wiki/companies/JBR.md
    expect(p.rows.some((r) => r.to === 'wiki/people/Jeff Perera.md')).toBe(true)
  })
})

describe('derived_edges MCP tool', () => {
  let server: Server
  let db: PGlite
  let url: string

  beforeAll(async () => {
    db = await openDb(''); await initSchema(db, 768)
    await upsertDerivedEdge(db, { fromPath: 'journal/2026-06-19.md', toPath: 'wiki/companies/JBR.md', toRaw: '[[JBR]]', role: 'references', category: null, source: 'derived', context: 'on [[JBR]] launch', resolved: true })
    await insertSuppression(db, 'journal/old.md', '[[JBR]]', 'references', 'wrong target')
    server = createMcpHttpServer(db, new FakeEmbedder(768), new NoopReranker())
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const addr = server.address(); url = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}/mcp`
  })
  afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())) })

  const callTool = (name: string, args: Record<string, unknown>) =>
    fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name, arguments: args } }) })

  it('lists the derived_edges tool', async () => {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) })
    // Do NOT substring-match compact JSON (e.g. '"name":"derived_edges"') against the raw body:
    // the SDK's serialization and SSE framing add whitespace/event lines that break the match.
    // First log/inspect the raw body, then assert against the SDK's ACTUAL serialization by
    // parsing the JSON and checking the tool name is present in the tools array.
    const body = await res.text()
    // Helper: the streamable-HTTP transport may answer JSON or an SSE frame ("data: {json}\n\n").
    const json = JSON.parse(body.includes('data:') ? body.slice(body.indexOf('{'), body.lastIndexOf('}') + 1) : body)
    const names = (json.result?.tools ?? []).map((t: { name: string }) => t.name)
    expect(names).toContain('derived_edges')
  })

  it('returns derived edge rows and the suppression list', async () => {
    const text = await (await callTool('derived_edges', {})).text()
    expect(text).toContain('journal/2026-06-19.md')
    expect(text).toContain('[[JBR]]')
    expect(text).toContain('wrong target') // suppression surfaced
  })

  it('a since watermark in the future returns no pending rows', async () => {
    const body = await (await callTool('derived_edges', { since: '2999-01-01T00:00:00Z' })).text()
    // Parse the tool result and assert rows is empty, rather than substring-matching '"rows":[]'
    // against the framed body (whitespace/SSE framing make the substring brittle). The tool
    // result text is itself JSON.stringify({ rows, suppressions }).
    const json = JSON.parse(body.includes('data:') ? body.slice(body.indexOf('{'), body.lastIndexOf('}') + 1) : body)
    const payload = JSON.parse(json.result.content[0].text)
    expect(payload.rows).toEqual([]) // rows empty; suppressions still present
  })
})

describe('suppress_edge MCP tool', () => {
  let server: Server
  let db: PGlite
  let url: string

  beforeAll(async () => {
    db = await openDb(''); await initSchema(db, 768)
    server = createMcpHttpServer(db, new FakeEmbedder(768), new NoopReranker())
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const addr = server.address(); url = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}/mcp`
  })
  afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())) })
  const callTool = (name: string, args: Record<string, unknown>) =>
    fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name, arguments: args } }) })

  it('lists the suppress_edge tool', async () => {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) })
    // Same as the derived_edges tools/list test: do NOT substring-match compact JSON. Inspect the
    // raw body, then parse it and assert the tool name is in the SDK's tools array (whitespace +
    // SSE framing make a substring match brittle).
    const body = await res.text()
    const json = JSON.parse(body.includes('data:') ? body.slice(body.indexOf('{'), body.lastIndexOf('}') + 1) : body)
    const names = (json.result?.tools ?? []).map((t: { name: string }) => t.name)
    expect(names).toContain('suppress_edge')
  })

  it('add inserts a suppression; derived_edges reflects it', async () => {
    await callTool('suppress_edge', { from_path: 'journal/a.md', to_raw: '[[JBR]]', reason: 'wrong' })
    const text = await (await callTool('derived_edges', {})).text()
    expect(text).toContain('journal/a.md')
    expect(text).toContain('wrong')
  })

  it('remove deletes the suppression', async () => {
    await callTool('suppress_edge', { from_path: 'journal/a.md', to_raw: '[[JBR]]', action: 'remove' })
    const text = await (await callTool('derived_edges', {})).text()
    expect(text).not.toContain('journal/a.md')
  })
})
