import Anthropic from '@anthropic-ai/sdk'

// A thin chat transport, mirroring the Embedder interface shape (types.ts:33). The cycle
// owns graceful-degrade by try/catching complete() at the job boundary — this client throws
// on failure (like OllamaEmbedder), it does not degrade itself.
export interface ChatClient {
  readonly id: string
  complete(system: string, user: string): Promise<string>
}

interface AnthropicCfg { model: string; apiKey: string; maxTokens?: number }

export class AnthropicChatClient implements ChatClient {
  readonly id: string
  private client: Anthropic
  constructor(private cfg: AnthropicCfg) {
    this.client = new Anthropic({ apiKey: cfg.apiKey })
    this.id = `anthropic:${cfg.model}`
  }
  async complete(system: string, user: string): Promise<string> {
    const res = await this.client.messages.create({
      model: this.cfg.model,
      max_tokens: this.cfg.maxTokens ?? 2000,
      system,
      messages: [{ role: 'user', content: user }],
    })
    return res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
  }
}

// Deterministic fake for tests (no network), mirroring FakeEmbedder.
export class FakeChatClient implements ChatClient {
  readonly id = 'fake-chat'
  constructor(private responder: (system: string, user: string) => string) {}
  async complete(system: string, user: string): Promise<string> {
    return this.responder(system, user)
  }
}
