import type { Embedder } from './types.js'

interface OllamaCfg { model: string; endpoint: string; dimensions: number }

export class OllamaEmbedder implements Embedder {
  readonly dimensions: number
  constructor(private cfg: OllamaCfg, private fetchImpl: typeof fetch = fetch) {
    this.dimensions = cfg.dimensions
  }

  async embed(texts: string[]): Promise<number[][]> {
    const res = await this.fetchImpl(`${this.cfg.endpoint}/api/embed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: this.cfg.model, input: texts }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Ollama embed failed: ${res.status} ${body}`)
    }
    const data = (await res.json()) as { embeddings: number[][] }
    return data.embeddings
  }
}

// Deterministic fake for tests/indexers without Ollama running.
export class FakeEmbedder implements Embedder {
  constructor(readonly dimensions = 768) {}
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => {
      let seed = 0
      for (const ch of t) seed = (seed + ch.charCodeAt(0)) % 997
      return Array.from({ length: this.dimensions }, (_, i) => Math.sin((seed + 1) * (i + 1)))
    })
  }
}
