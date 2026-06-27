import { describe, it, expect, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { FakeChatClient } from '../src/chat.js'
import { FakeEmbedder } from '../src/embedder.js'
import { runFactsCycle, readWatermark } from '../src/dream-cycle.js'

const run = promisify(exec)
const dirs: string[] = []
afterEach(async () => { for (const d of dirs) await rm(d, { recursive: true, force: true }) })

// PR-C2: fixture bodies MUST exceed MIN_BODY_CHARS (40) or the cycle skips them
// and the tests pass vacuously.
const AMARA_BODY = 'Amara is in school starting May 2026 and works part-time at a clinic.'
const X_BODY = 'The brain self-reindexes in-process every 600 seconds on the Mac Mini.'

async function vault(): Promise<string> {
  const d = await mkdtemp(resolve(tmpdir(), 'brain-cycle-')); dirs.push(d)
  await run('git init -q && git config user.email t@t && git config user.name t', { cwd: d })
  await mkdir(resolve(d, 'wiki/people'), { recursive: true })
  await mkdir(resolve(d, 'memory/learnings'), { recursive: true })
  await writeFile(resolve(d, 'wiki/people/Amara Markovic.md'), `---\ntype: person\nname: Amara Markovic\n---\n${AMARA_BODY}`)
  await writeFile(resolve(d, 'memory/learnings/x.md'), X_BODY)
  await run('git add -A && git commit -q -m init', { cwd: d })
  return d
}

const deps = (vaultRoot: string, chat: FakeChatClient) => ({
  vaultRoot, scopeGlobs: ['memory/**/*.md', 'wiki/**/*.md'], chat, embedder: new FakeEmbedder(16),
  cosineThreshold: 0.999, maxFactsPerFile: 10,
  watermarkPath: resolve(vaultRoot, '.brain-cycle-watermark'), now: '2026-06-27',
})

describe('runFactsCycle', () => {
  it('first run extracts from all fact-sources and writes per-entity + _general files', async () => {
    const v = await vault()
    const chat = new FakeChatClient((_s, u) =>
      u.includes('Amara')
        ? '[{"claim":"Amara is in school","kind":"fact","confidence":0.9,"entity":"Amara Markovic"}]'
        : '[{"claim":"The brain reindexes every 600s","kind":"fact","confidence":0.9,"entity":null}]')
    const res = await runFactsCycle(deps(v, chat))
    expect(res.skipped).toBe(false)
    expect(existsSync(resolve(v, 'memory/facts/amara-markovic.md'))).toBe(true)
    expect(existsSync(resolve(v, 'memory/facts/_general.md'))).toBe(true)
    const amara = await readFile(resolve(v, 'memory/facts/amara-markovic.md'), 'utf8')
    expect(amara).toContain('Amara is in school')
    expect(amara).toContain('[[Amara Markovic]]')
    expect(readWatermark(deps(v, chat).watermarkPath)).toBeTruthy()
  })

  it('a second run with no source change makes zero chat calls (change-gate)', async () => {
    const v = await vault()
    let calls = 0
    const chat = new FakeChatClient(() => { calls++; return '[]' })
    await runFactsCycle(deps(v, chat))
    const afterFirst = calls
    // PR-I3 positive control: the first run actually exercised the extraction path.
    expect(afterFirst).toBeGreaterThan(0)
    await runFactsCycle(deps(v, chat)) // nothing changed since watermark
    expect(calls).toBe(afterFirst) // no new extractions
    // PR-I3: editing + committing a source produces exactly one more chat call.
    await writeFile(resolve(v, 'memory/learnings/x.md'), `${X_BODY} Updated with a fresh sentence here.`)
    await run('git add -A && git commit -q -m edit', { cwd: v })
    await runFactsCycle(deps(v, chat))
    expect(calls).toBe(afterFirst + 1)
  })

  it('does not extract from memory/facts/ itself (self-loop guard)', async () => {
    const v = await vault()
    // PR-I3: pre-seed AND commit a real facts file with a ## seeded block, then assert
    // its body is NEVER passed to chat. Deleting the isFactSource memory/facts/ guard
    // would feed this body to the model and turn the test red.
    await mkdir(resolve(v, 'memory/facts'), { recursive: true })
    await writeFile(resolve(v, 'memory/facts/_general.md'),
      '# Facts (unattached)\n\n## seeded\n\n- kind: `fact`\n- confidence: `0.90`\n- source: `memory/learnings/x.md`\n')
    await run('git add -A && git commit -q -m seed', { cwd: v })
    const seen: string[] = []
    const chat = new FakeChatClient((_s, u) => { seen.push(u); return '[]' })
    await runFactsCycle(deps(v, chat))
    expect(seen.some((u) => u.includes('memory/facts/'))).toBe(false)
    expect(seen.some((u) => u.includes('## seeded'))).toBe(false)
  })

  // PR-C4: rewritten so it FAILS if the suppression filter is deleted. A sibling new
  // fact forces the write path; the struck-through claim must NOT come back live.
  it('honors a struck-through fact and still writes a new sibling', async () => {
    const v = await vault()
    await mkdir(resolve(v, 'memory/facts'), { recursive: true })
    await writeFile(resolve(v, 'memory/facts/_general.md'),
      '# Facts (unattached)\n\n## ~~The brain reindexes every 600s~~\n\n- kind: `fact`\n- confidence: `0.90`\n- source: `memory/learnings/x.md`\n- note: forgotten: wrong\n')
    const chat = new FakeChatClient((_s, u) => u.includes('Amara') ? '[]'
      : '[{"claim":"The brain reindexes every 600s","kind":"fact","confidence":0.9,"entity":null},{"claim":"A genuinely new unrelated fact","kind":"fact","confidence":0.9,"entity":null}]')
    await runFactsCycle(deps(v, chat))
    const g = await readFile(resolve(v, 'memory/facts/_general.md'), 'utf8')
    expect(g).toContain('A genuinely new unrelated fact')
    expect(g.match(/^## (?!~~)The brain reindexes/gm)).toBeNull()
  })

  // PR-C5 #1: merge-preservation across sources. A nightly writer must NEVER clobber
  // prior facts when a new fact for the same entity arrives from a different source.
  it('preserves an existing cross-source fact when a new one for the same entity arrives', async () => {
    const v = await vault()
    await mkdir(resolve(v, 'memory/facts'), { recursive: true })
    await writeFile(resolve(v, 'memory/facts/amara-markovic.md'),
      '# Facts: [[Amara Markovic]]\n\n## Amara loves espresso\n\n- kind: `preference`\n- confidence: `0.80`\n- source: `memory/learnings/other.md`\n- entity: [[Amara Markovic]]\n')
    const chat = new FakeChatClient((_s, u) => u.includes('Amara')
      ? '[{"claim":"Amara is in school","kind":"fact","confidence":0.9,"entity":"Amara Markovic"}]'
      : '[]')
    await runFactsCycle(deps(v, chat))
    const amara = await readFile(resolve(v, 'memory/facts/amara-markovic.md'), 'utf8')
    expect(amara).toContain('Amara loves espresso')
    expect(amara).toContain('Amara is in school')
  })

  // PR-C5 #2: graceful degrade. A chat throw for one file must not poison the cycle:
  // the other file still writes and the run is not marked skipped.
  it('degrades gracefully when extraction throws for one file', async () => {
    const v = await vault()
    const chat = new FakeChatClient((_s, u) => {
      if (u.includes('Amara')) throw new Error('boom')
      return '[{"claim":"The brain reindexes every 600s","kind":"fact","confidence":0.9,"entity":null}]'
    })
    const res = await runFactsCycle(deps(v, chat))
    expect(res.skipped).toBe(false)
    expect(existsSync(resolve(v, 'memory/facts/_general.md'))).toBe(true)
    expect(existsSync(resolve(v, 'memory/facts/amara-markovic.md'))).toBe(false)
    expect(readWatermark(deps(v, chat).watermarkPath)).toBeNull()
  })

  // PR-C5 #3: watermark advances on a clean run to the source HEAD the cycle processed.
  // The watermark records the sha that was HEAD when the cycle started (the source delta
  // it consumed), NOT the post-run HEAD. gitCommitAndPush creates a NEW facts commit on
  // top, but those files are isFactSource-excluded so they are never re-processed.
  it('advances the watermark to the processed source HEAD on a successful run', async () => {
    const v = await vault()
    const headBefore = (await run('git rev-parse HEAD', { cwd: v })).stdout.trim()
    const chat = new FakeChatClient((_s, u) => u.includes('Amara')
      ? '[{"claim":"Amara is in school","kind":"fact","confidence":0.9,"entity":"Amara Markovic"}]'
      : '[{"claim":"The brain reindexes every 600s","kind":"fact","confidence":0.9,"entity":null}]')
    await runFactsCycle(deps(v, chat))
    expect(readWatermark(deps(v, chat).watermarkPath)).toBe(headBefore)
    // And the next run sees no source delta -> zero new chat calls (the watermark is sound).
    let calls = 0
    const chat2 = new FakeChatClient(() => { calls++; return '[]' })
    await runFactsCycle(deps(v, chat2))
    expect(calls).toBe(0)
  })

  // PR-C5 #4: an entity with no resolvable page falls through to _general, never a
  // phantom per-entity file.
  it('routes an unresolvable entity to _general', async () => {
    const v = await vault()
    const chat = new FakeChatClient((_s, u) => u.includes('Amara') ? '[]'
      : '[{"claim":"Nobody did a thing once","kind":"fact","confidence":0.9,"entity":"Nobody Smith"}]')
    await runFactsCycle(deps(v, chat))
    expect(existsSync(resolve(v, 'memory/facts/nobody-smith.md'))).toBe(false)
    const g = await readFile(resolve(v, 'memory/facts/_general.md'), 'utf8')
    expect(g).toContain('Nobody did a thing once')
  })
})
