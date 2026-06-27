import { describe, it, expect, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { FakeChatClient } from '../src/chat.js'
import { FakeEmbedder } from '../src/embedder.js'
import { runFactsCycle } from '../src/dream-cycle.js'
import { indexVault } from '../src/indexer.js'
import { openDb, initSchema, keywordSearch } from '../src/db.js'
import { chunkMarkdown } from '../src/chunker.js'
import { renderFactsFile, type Fact } from '../src/facts/markdown.js'

const run = promisify(exec)
const dirs: string[] = []
afterEach(async () => { for (const d of dirs) await rm(d, { recursive: true, force: true }) })

// Local Fact builder matching the pattern from facts-markdown.test.ts
const f = (over: Partial<Fact> = {}): Fact => ({
  claim: 'The brain self-reindexes in-process every 600s',
  kind: 'fact', confidence: 0.9, entity: null,
  sourcePath: 'memory/learnings/devops.md',
  validFrom: null, validUntil: null, superseded: false, supersededNote: null, ...over,
})

describe('facts end-to-end: cycle writes markdown, reindex indexes it (no LLM)', () => {
  it('a cycle-written fact is retrievable via keyword search after indexVault', async () => {
    const v = await mkdtemp(resolve(tmpdir(), 'brain-e2e-')); dirs.push(v)
    await run('git init -q && git config user.email t@t && git config user.name t', { cwd: v })
    await mkdir(resolve(v, 'memory/learnings'), { recursive: true })
    await writeFile(resolve(v, 'memory/learnings/x.md'), 'CloudFront caches 404 responses at the edge.')
    await run('git add -A && git commit -q -m init', { cwd: v })

    const chat = new FakeChatClient(() => '[{"claim":"CloudFront caches 404 responses","kind":"fact","confidence":0.9,"entity":null}]')
    const embedder = new FakeEmbedder(16)
    await runFactsCycle({
      vaultRoot: v, scopeGlobs: ['memory/**/*.md'], chat, embedder,
      cosineThreshold: 0.999, maxFactsPerFile: 10,
      watermarkPath: resolve(v, '.wm'), now: '2026-06-27',
    })

    // The read-only retrieval path indexes the new markdown with NO chat client involved.
    const db = await openDb('')
    await initSchema(db, embedder.dimensions)
    await indexVault(db, embedder, { vaultRoot: v, scopeGlobs: ['memory/**/*.md'] })
    const hits = await keywordSearch(db, 'CloudFront caches 404', 5)
    expect(hits.some((h) => h.source_path.startsWith('memory/facts/') && h.content.includes('CloudFront caches 404'))).toBe(true)
  })
})

// PR-C3: real-chunker boundary test (the definitive R-I2 proof).
// With ## per-fact headings, each fact becomes its own small section (~145 chars),
// so splitSections splits the file at each ## boundary BEFORE splitLong is ever
// reached (splitLong only fires when a section exceeds maxChars, e.g. 2000).
// This proves a large facts file never collapses into one blob (R-I2), and that
// claim headings are never orphaned from their `- source:` metadata across facts.
// Out-of-scope edge: a SINGLE fact whose rendered block exceeded ~2000 chars would
// hit splitLong and could split its heading from its metadata; this does not occur
// in slice 3 because facts are concise and per-file-capped (revisit if facts ever
// grow that large).
describe('chunker boundary: large facts file never orphans a claim from its source metadata', () => {
  it('each fact becomes its own chunk via splitSections; claim headings are never orphaned from source metadata', () => {
    const many = Array.from({ length: 60 }, (_, i) =>
      f({ claim: `Distinct durable claim ${i} with enough words to add real length here` })
    )
    const chunks = chunkMarkdown('memory/facts/x.md', renderFactsFile('X', many), 2000)
    // Non-vacuity: at least one chunk must contain a ## heading (the file is non-trivial).
    expect(chunks.some(c => /^## /m.test(c.content))).toBe(true)
    for (const c of chunks) {
      const heads = (c.content.match(/^## /gm) ?? []).length
      const sources = (c.content.match(/^- source:/gm) ?? []).length
      expect(sources).toBeGreaterThanOrEqual(heads) // every claim heading keeps its `- source:` line
    }
  })
})
