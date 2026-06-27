import { describe, it, expect } from 'vitest'
import { FakeChatClient } from '../src/chat.js'

describe('FakeChatClient', () => {
  it('returns the responder output and exposes a stable id', async () => {
    const c = new FakeChatClient((system, user) => `S:${system.length} U:${user}`)
    expect(c.id).toBe('fake-chat')
    expect(await c.complete('sys', 'hello')).toBe('S:3 U:hello')
  })
})
