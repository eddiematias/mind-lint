import type { Embedder } from './types.js'

interface OllamaCfg { model: string; endpoint: string; dimensions: number }
interface OllamaOpts { maxAttempts?: number; retryDelayMs?: number; batchSize?: number }

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export class OllamaEmbedder implements Embedder {
  readonly id: string
  readonly dimensions: number
  constructor(
    private cfg: OllamaCfg,
    private fetchImpl: typeof fetch = fetch,
    private opts: OllamaOpts = {},
  ) {
    this.dimensions = cfg.dimensions
    this.id = `ollama:${cfg.model}:${cfg.dimensions}`
  }

  // Embeds a single batch of texts with retry logic. Batch size must be
  // small enough that Ollama's model runner can handle it without crashing.
  private async embedBatch(batch: string[]): Promise<number[][]> {
    const maxAttempts = this.opts.maxAttempts ?? 3
    const retryDelayMs = this.opts.retryDelayMs ?? 250
    let lastError: Error = new Error('unreachable')
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let res: Response
      try {
        res = await this.fetchImpl(`${this.cfg.endpoint}/api/embed`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ model: this.cfg.model, input: batch }),
        })
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e))
        if (attempt < maxAttempts) { await sleep(retryDelayMs); continue }
        throw new Error(`Ollama embed failed after ${maxAttempts} attempt${maxAttempts === 1 ? '' : 's'}: ${lastError.message}`)
      }
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        lastError = new Error(`${res.status} ${body}`)
        if (attempt < maxAttempts) { await sleep(retryDelayMs); continue }
        throw new Error(`Ollama embed failed after ${maxAttempts} attempt${maxAttempts === 1 ? '' : 's'}: ${lastError.message}`)
      }
      // Successful response; dimension mismatch is a hard config error, not retried.
      const data = (await res.json()) as { embeddings: number[][] }
      const got = data.embeddings[0]?.length
      if (got !== undefined && got !== this.dimensions) {
        throw new Error(
          `Ollama model '${this.cfg.model}' returned ${got}-dim vectors but config embedder.dimensions=${this.dimensions}. ` +
            `Set embedder.dimensions to match the model; if the index was already built at the old dimension, delete data/ and reindex.`,
        )
      }
      return data.embeddings
    }
    // TypeScript path: unreachable because the loop always throws on final attempt.
    throw lastError
  }

  // Splits texts into consecutive batches and embeds each one sequentially.
  // Sequential (not parallel) because Ollama is a single-runner process:
  // concurrent requests worsen contention and can trigger the same EOF crash.
  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return []
    const batchSize = this.opts.batchSize ?? 64
    const results: number[][] = []
    for (let start = 0; start < texts.length; start += batchSize) {
      const batch = texts.slice(start, start + batchSize)
      const vecs = await this.embedBatch(batch)
      results.push(...vecs)
    }
    return results
  }
}

// Deterministic fake for tests/indexers without Ollama running.
export class FakeEmbedder implements Embedder {
  readonly id: string
  constructor(readonly dimensions = 768) {
    this.id = `fake:${dimensions}`
  }
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => {
      let seed = 0
      for (const ch of t) seed = (seed + ch.charCodeAt(0)) % 997
      return Array.from({ length: this.dimensions }, (_, i) => Math.sin((seed + 1) * (i + 1)))
    })
  }
}
