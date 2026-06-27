import { describe, it, expect } from 'vitest'
import { FakeChatClient } from '../src/chat.js'
import { parseExtractionJson, extractFromFile } from '../src/facts/extract.js'

describe('parseExtractionJson', () => {
  it('extracts the first JSON array even with surrounding prose', () => {
    const out = parseExtractionJson('Sure!\n[{"claim":"X","kind":"fact","confidence":0.9,"entity":null}]\nDone')
    expect(out).toHaveLength(1)
    expect(out[0].claim).toBe('X')
  })
  it('drops rows with a bad kind or missing claim', () => {
    const out = parseExtractionJson('[{"claim":"ok","kind":"fact","confidence":1,"entity":null},{"kind":"fact"},{"claim":"y","kind":"bogus","confidence":1,"entity":null}]')
    expect(out.map((r) => r.claim)).toEqual(['ok'])
  })
  it('clamps confidence into [0,1]', () => {
    const out = parseExtractionJson('[{"claim":"a","kind":"fact","confidence":5,"entity":null}]')
    expect(out[0].confidence).toBe(1)
  })
})

describe('extractFromFile', () => {
  it('caps the number of facts returned', async () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({ claim: `c${i}`, kind: 'fact', confidence: 0.9, entity: null }))
    const chat = new FakeChatClient(() => JSON.stringify(rows))
    const out = await extractFromFile(chat, 'memory/learnings/x.md', 'body', 20)
    expect(out).toHaveLength(20)
    expect(out[0].claim).toBe('c0')
    expect(out[19].claim).toBe('c19')
  })
  it('returns [] when the model returns no array', async () => {
    const chat = new FakeChatClient(() => 'no facts here')
    expect(await extractFromFile(chat, 'a.md', 'b', 20)).toEqual([])
  })
})
