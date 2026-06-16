// brain/tests/embedder.test.ts
import { describe, it, expect, vi } from 'vitest'
import { OllamaEmbedder } from '../src/embedder.js'

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
    const e = new OllamaEmbedder({ model: 'm', endpoint: 'http://x', dimensions: 2 }, fetchMock as unknown as typeof fetch)
    await expect(e.embed(['a'])).rejects.toThrow(/Ollama embed failed: 500/)
  })
})
