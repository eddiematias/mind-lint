// tests/supersession-probe.test.ts
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { FakeChatClient } from '../src/chat.js'
import type { Embedder } from '../src/types.js'
import { runSupersessionProbe, parseProposals } from '../src/facts/supersession.js'

const dirs: string[] = []
afterEach(async () => { for (const d of dirs) await rm(d, { recursive: true, force: true }) })

// Embedder that puts the two goal claims close and the bagel claim far.
class GoalEmbedder implements Embedder {
  readonly id = 'goal'; readonly dimensions = 2
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => t.includes('bagel') ? [0, 1] : t.includes('timeline') ? [0.96, 0.28] : [1, 0])
  }
}

async function seedFacts(): Promise<string> {
  const d = await mkdtemp(resolve(tmpdir(), 'probe-')); dirs.push(d)
  await mkdir(resolve(d, 'memory/facts'), { recursive: true })
  await writeFile(resolve(d, 'memory/facts/_general.md'),
    '# Facts (unattached)\n\n' +
    '## Eddie income goal anchored to May 27 2026\n\n- kind: `belief`\n- confidence: `0.9`\n- source: `journal/2026-05-04.md`\n- valid: `2026-05-04` -> ``\n\n' +
    '## Eddie removed the timeline from the income goal\n\n- kind: `belief`\n- confidence: `0.9`\n- source: `journal/2026-05-13.md`\n- valid: `2026-05-13` -> ``\n\n' +
    '## Eddie likes bagels\n\n- kind: `preference`\n- confidence: `0.9`\n- source: `journal/2026-04-01.md`\n- valid: `2026-04-01` -> ``\n')
  return d
}
const deps = (v: string, chat: FakeChatClient) => ({
  vaultRoot: v, chat, embedder: new GoalEmbedder(),
  cachePath: resolve(v, 'data/facts-vectors.json'),
  proposalsPath: resolve(v, 'memory/facts/_supersession-proposals.md'),
  decisionsPath: resolve(v, 'memory/facts/_supersession-decisions.md'),
  neighborLo: 0.80, neighborHi: 0.985, maxPairsPerRun: 50, now: '2026-06-28',
})

describe('runSupersessionProbe', () => {
  it('surfaces the goal pair as pending, never touches a fact file', async () => {
    const v = await seedFacts()
    const before = await readFile(resolve(v, 'memory/facts/_general.md'), 'utf8')
    const chat = new FakeChatClient(() => '{"verdict":"supersedes","confidence":0.92,"axis":"the income-goal timeline"}')
    const res = await runSupersessionProbe(deps(v, chat))
    expect(res.proposed).toBe(1)
    const doc = parseProposals(await readFile(deps(v, chat).proposalsPath, 'utf8'))
    expect(doc.proposals[0].loser.sourcePath).toBe('journal/2026-05-04.md') // older loses
    expect(doc.proposals[0].verdict).toBe('supersedes')
    // fact file is untouched
    expect(await readFile(resolve(v, 'memory/facts/_general.md'), 'utf8')).toBe(before)
  })

  it('records a checked line for no_contradiction and does not re-judge next run', async () => {
    const v = await seedFacts()
    let calls = 0
    const chat = new FakeChatClient(() => { calls++; return '{"verdict":"no_contradiction","confidence":0.9,"axis":""}' })
    await runSupersessionProbe(deps(v, chat))
    const afterFirst = calls
    expect(afterFirst).toBeGreaterThan(0)
    await runSupersessionProbe(deps(v, chat))
    expect(calls).toBe(afterFirst) // judged set skips already-checked pairs
  })

  it('a chat throw skips the pair (NOT recorded checked) and retries next run (PR-5)', async () => {
    const v = await seedFacts()
    let calls = 0
    const throwing = new FakeChatClient(() => { calls++; throw new Error('boom') })
    const r1 = await runSupersessionProbe(deps(v, throwing))
    expect(r1.skipped).toBe(false)
    expect(r1.proposed).toBe(0)
    const afterFirst = calls
    expect(afterFirst).toBeGreaterThan(0)
    // The goal pair was NOT recorded checked, so the next run judges it again.
    await runSupersessionProbe(deps(v, throwing))
    expect(calls).toBeGreaterThan(afterFirst)
  })
})
