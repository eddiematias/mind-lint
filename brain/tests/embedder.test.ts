// brain/tests/embedder.test.ts
import { describe, it, expect, vi } from 'vitest'
import { OllamaEmbedder, FakeEmbedder } from '../src/embedder.js'

const okResponse = (vecs: number[][] = [[0.1, 0.2]]) => ({
  ok: true,
  json: async () => ({ embeddings: vecs }),
})

const errResponse = (status = 400) => ({
  ok: false,
  status,
  text: async () => `error body ${status}`,
})

describe('OllamaEmbedder', () => {
  it('posts to the embed endpoint and returns vectors', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ embeddings: [[0.1, 0.2], [0.3, 0.4]] }),
    })
    const e = new OllamaEmbedder({ model: 'nomic-embed-text', endpoint: 'http://localhost:11434', dimensions: 2 }, fetchMock as unknown as typeof fetch)
    const out = await e.embed(['a', 'b'])
    expect(out).toEqual([[0.1, 0.2], [0.3, 0.4]])
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://localhost:11434/api/embed')
    expect(JSON.parse(init.body)).toEqual({ model: 'nomic-embed-text', input: ['a', 'b'] })
  })

  it('throws a clear error on a non-ok response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' })
    const e = new OllamaEmbedder({ model: 'm', endpoint: 'http://x', dimensions: 2 }, fetchMock as unknown as typeof fetch, { maxAttempts: 1, retryDelayMs: 0 })
    await expect(e.embed(['a'])).rejects.toThrow(/Ollama embed failed after 1 attempt/)
  })

  // Retry tests (maxAttempts=3, retryDelayMs=0 for speed)
  it('retry: succeeds on the 2nd attempt after a transient 400', async () => {
    let calls = 0
    const fetchMock = vi.fn().mockImplementation(async () => {
      calls++
      return calls === 1 ? errResponse(400) : okResponse([[0.5, 0.6]])
    })
    const e = new OllamaEmbedder(
      { model: 'm', endpoint: 'http://x', dimensions: 2 },
      fetchMock as unknown as typeof fetch,
      { maxAttempts: 3, retryDelayMs: 0 },
    )
    const out = await e.embed(['a'])
    expect(out).toEqual([[0.5, 0.6]])
    expect(calls).toBe(2)
  })

  it('retry: throws after exhausting all attempts when every call returns a 400', async () => {
    let calls = 0
    const fetchMock = vi.fn().mockImplementation(async () => { calls++; return errResponse(400) })
    const e = new OllamaEmbedder(
      { model: 'm', endpoint: 'http://x', dimensions: 2 },
      fetchMock as unknown as typeof fetch,
      { maxAttempts: 3, retryDelayMs: 0 },
    )
    await expect(e.embed(['a'])).rejects.toThrow(/Ollama embed failed after 3 attempts/)
    expect(calls).toBe(3)
  })

  it('retry: succeeds on the 2nd attempt after a transient network throw', async () => {
    let calls = 0
    const fetchMock = vi.fn().mockImplementation(async () => {
      calls++
      if (calls === 1) throw new Error('network error')
      return okResponse([[0.7, 0.8]])
    })
    const e = new OllamaEmbedder(
      { model: 'm', endpoint: 'http://x', dimensions: 2 },
      fetchMock as unknown as typeof fetch,
      { maxAttempts: 3, retryDelayMs: 0 },
    )
    const out = await e.embed(['a'])
    expect(out).toEqual([[0.7, 0.8]])
    expect(calls).toBe(2)
  })

  it('retry: dimension mismatch is NOT retried (hard config error, counter stays at 1)', async () => {
    let calls = 0
    const fetchMock = vi.fn().mockImplementation(async () => {
      calls++
      return { ok: true, json: async () => ({ embeddings: [[1, 2, 3]] }) }
    })
    // dimensions: 2 but model returns 3-dim vectors -> dimension mismatch
    const e = new OllamaEmbedder(
      { model: 'm', endpoint: 'http://x', dimensions: 2 },
      fetchMock as unknown as typeof fetch,
      { maxAttempts: 3, retryDelayMs: 0 },
    )
    await expect(e.embed(['a'])).rejects.toThrow(/returned 3-dim/)
    expect(calls).toBe(1)
  })
})

describe('Embedder.id', () => {
  it('OllamaEmbedder.id encodes model + dimensions', () => {
    const e = new OllamaEmbedder({ model: 'nomic-embed-text', endpoint: 'http://localhost:11434', dimensions: 768 })
    expect(e.id).toBe('ollama:nomic-embed-text:768')
  })
  it('FakeEmbedder.id encodes dimensions', () => {
    expect(new FakeEmbedder(768).id).toBe('fake:768')
    expect(new FakeEmbedder(2).id).toBe('fake:2')
  })
})
