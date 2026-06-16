import type { Reranker } from './types.js'

export class NoopReranker implements Reranker {
  async rerank(_query: string, candidates: string[]): Promise<number[]> {
    return candidates.map((_, i) => i)
  }
}

// Local cross-encoder via transformers.js (ONNX). Lazy-loads the model on first use.
export class CrossEncoderReranker implements Reranker {
  private modelPromise: Promise<unknown> | null = null
  constructor(private modelName: string) {}

  private async load() {
    if (!this.modelPromise) {
      const { AutoModelForSequenceClassification, AutoTokenizer } = await import('@xenova/transformers')
      this.modelPromise = Promise.all([
        AutoTokenizer.from_pretrained(this.modelName),
        AutoModelForSequenceClassification.from_pretrained(this.modelName, { quantized: true }),
      ])
    }
    return this.modelPromise as Promise<[any, any]>
  }

  async rerank(query: string, candidates: string[]): Promise<number[]> {
    if (candidates.length === 0) return []
    const [tokenizer, model] = await this.load()
    const scored: { i: number; score: number }[] = []
    for (let i = 0; i < candidates.length; i++) {
      const inputs = tokenizer(query, { text_pair: candidates[i], padding: true, truncation: true })
      const { logits } = await model(inputs)
      scored.push({ i, score: logits.data[0] as number })
    }
    return scored.sort((a, b) => b.score - a.score).map((s) => s.i)
  }
}

export function makeReranker(cfg: { enabled: boolean; model: string }): Reranker {
  return cfg.enabled ? new CrossEncoderReranker(cfg.model) : new NoopReranker()
}
