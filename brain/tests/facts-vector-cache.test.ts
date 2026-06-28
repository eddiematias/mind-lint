// tests/facts-vector-cache.test.ts
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import type { Embedder } from '../src/types.js'
import { loadVectorCache, saveVectorCache, embedFactsCached, pruneVectorCache } from '../src/facts/vector-cache.js'
import { factKey, type Fact } from '../src/facts/markdown.js'

const dirs: string[] = []
afterEach(async () => { for (const d of dirs) await rm(d, { recursive: true, force: true }) })
const f = (claim: string, source = 's.md'): Fact => ({
  claim, kind: 'fact', confidence: 1, entity: null, sourcePath: source,
  validFrom: '2026-01-01', validUntil: null, superseded: false, supersededNote: null,
})
class CountingEmbedder implements Embedder {
  readonly id = 'count'; readonly dimensions = 4; calls = 0; embedded = 0
  async embed(texts: string[]): Promise<number[][]> {
    this.calls++; this.embedded += texts.length
    return texts.map((t) => [t.length, 1, 0, 0])
  }
}

describe('vector cache', () => {
  it('embeds only uncached facts, then nothing on a second pass', async () => {
    const e = new CountingEmbedder()
    const cache = new Map<string, number[]>()
    await embedFactsCached(e, [f('alpha'), f('beta')], cache)
    expect(e.embedded).toBe(2)
    await embedFactsCached(e, [f('alpha'), f('beta')], cache)
    expect(e.embedded).toBe(2) // no new embeds
    expect(cache.get(factKey(f('alpha')))).toEqual([5, 1, 0, 0])
  })
  it('is add-only: a second file does not evict the first file vectors (PR-2)', async () => {
    const e = new CountingEmbedder()
    const cache = new Map<string, number[]>()
    await embedFactsCached(e, [f('alpha', 'file1.md')], cache)
    await embedFactsCached(e, [f('beta', 'file2.md')], cache)
    expect(cache.has(factKey(f('alpha', 'file1.md')))).toBe(true)
    expect(cache.has(factKey(f('beta', 'file2.md')))).toBe(true)
  })
  it('pruneVectorCache drops keys not in the live set', async () => {
    const e = new CountingEmbedder()
    const cache = new Map<string, number[]>()
    await embedFactsCached(e, [f('alpha'), f('beta')], cache)
    pruneVectorCache(cache, new Set([factKey(f('alpha'))]))
    expect(cache.has(factKey(f('beta')))).toBe(false)
    expect(cache.has(factKey(f('alpha')))).toBe(true)
  })
  it('round-trips through disk', async () => {
    const d = await mkdtemp(resolve(tmpdir(), 'vc-')); dirs.push(d)
    const p = resolve(d, 'facts-vectors.json')
    const cache = new Map<string, number[]>([['k', [1, 2, 3]]])
    await saveVectorCache(p, cache)
    const back = await loadVectorCache(p)
    expect(back.get('k')).toEqual([1, 2, 3])
  })
  it('returns an empty cache when the file is absent', async () => {
    const d = await mkdtemp(resolve(tmpdir(), 'vc-')); dirs.push(d)
    const back = await loadVectorCache(resolve(d, 'missing.json'))
    expect(back.size).toBe(0)
  })
})
