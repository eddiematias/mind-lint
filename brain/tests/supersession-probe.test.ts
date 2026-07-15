// tests/supersession-probe.test.ts
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { FakeChatClient } from '../src/chat.js'
import type { Embedder } from '../src/types.js'
import {
  runSupersessionProbe, parseProposals, renderProposals, relKey,
  type ProposalsDoc,
} from '../src/facts/supersession.js'

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

// Two facts on d1.md / d2.md whose claim text is reworded relative to any prior proposal
// (a fresh pairId every time), but which still keep the 'timeline' keyword so the
// GoalEmbedder lands them in-band (same cosine story as seedFacts' goal pair).
async function seedRewordedPair(): Promise<string> {
  const d = await mkdtemp(resolve(tmpdir(), 'probe-relkey-')); dirs.push(d)
  await mkdir(resolve(d, 'memory/facts'), { recursive: true })
  await writeFile(resolve(d, 'memory/facts/_general.md'),
    '# Facts (unattached)\n\n' +
    '## Eddie wants to hit an income independence milestone\n\n- kind: `belief`\n- confidence: `0.9`\n- source: `d1.md`\n- valid: `2026-05-04` -> ``\n\n' +
    '## Eddie dropped the specific timeline from that goal\n\n- kind: `belief`\n- confidence: `0.9`\n- source: `d2.md`\n- valid: `2026-05-13` -> ``\n')
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

  it('does not re-propose a relationship already covered by a pending proposal (reworded claims)', async () => {
    const v = await seedRewordedPair()
    const rk = relKey('d1.md', 'd2.md')
    const seedDoc: ProposalsDoc = {
      proposals: [{
        id: 'seedpair1',
        loser: { sourcePath: 'd1.md', claim: 'Eddie anchored the goal to a date' },
        winner: { sourcePath: 'd2.md', claim: 'Eddie removed the date anchor' },
        verdict: 'supersedes', confidence: 0.9, axis: 'timeline', loserDecided: true,
        proposedOn: '2026-06-01', relKey: rk,
      }],
      lifecycle: [],
    }
    const proposalsPath = deps(v, new FakeChatClient(() => '')).proposalsPath
    await writeFile(proposalsPath, renderProposals(seedDoc))
    let calls = 0
    const chat = new FakeChatClient(() => { calls++; return '{"verdict":"supersedes","confidence":0.92,"axis":"the income-goal timeline"}' })
    const res = await runSupersessionProbe(deps(v, chat))
    expect(res.proposed).toBe(0)
    expect(calls).toBe(0) // the pair never reached the judge: relKey dedup filtered it pre-cap
  })

  it('does not re-propose a relationship covered by a RETIRED proposal', async () => {
    const v = await seedRewordedPair()
    const rk = relKey('d1.md', 'd2.md')
    const seedDoc: ProposalsDoc = {
      proposals: [{
        id: 'retiredpair1',
        loser: { sourcePath: 'd1.md', claim: 'Eddie anchored the goal to a date' },
        winner: { sourcePath: 'd2.md', claim: 'Eddie removed the date anchor' },
        verdict: 'supersedes', confidence: 0.9, axis: 'timeline', loserDecided: true,
        proposedOn: '2026-06-01', relKey: rk,
      }],
      lifecycle: [{ kind: 'retired', id: 'retiredpair1', relKey: rk }],
    }
    const proposalsPath = deps(v, new FakeChatClient(() => '')).proposalsPath
    await writeFile(proposalsPath, renderProposals(seedDoc))
    let calls = 0
    const chat = new FakeChatClient(() => { calls++; return '{"verdict":"supersedes","confidence":0.92,"axis":"the income-goal timeline"}' })
    const res = await runSupersessionProbe(deps(v, chat))
    expect(res.proposed).toBe(0)
    expect(calls).toBe(0)
  })

  it('does not re-propose when a checked line carries the relKey; DOES re-judge a legacy checked line without relKey', async () => {
    const rk = relKey('d1.md', 'd2.md')

    // Case A: checked line carries the relKey -> suppressed.
    const vA = await seedRewordedPair()
    const docA: ProposalsDoc = { proposals: [], lifecycle: [{ kind: 'checked', id: 'oldpairhashA', relKey: rk }] }
    const proposalsPathA = deps(vA, new FakeChatClient(() => '')).proposalsPath
    await writeFile(proposalsPathA, renderProposals(docA))
    let callsA = 0
    const chatA = new FakeChatClient(() => { callsA++; return '{"verdict":"no_contradiction","confidence":0.9,"axis":""}' })
    const resA = await runSupersessionProbe(deps(vA, chatA))
    expect(resA.proposed).toBe(0)
    expect(callsA).toBe(0)

    // Case B: legacy checked line, no relKey stored -> NOT suppressed, gets re-judged.
    const vB = await seedRewordedPair()
    const docB: ProposalsDoc = { proposals: [], lifecycle: [{ kind: 'checked', id: 'oldpairhashB' }] }
    const proposalsPathB = deps(vB, new FakeChatClient(() => '')).proposalsPath
    await writeFile(proposalsPathB, renderProposals(docB))
    let callsB = 0
    const chatB = new FakeChatClient(() => { callsB++; return '{"verdict":"no_contradiction","confidence":0.9,"axis":""}' })
    const resB = await runSupersessionProbe(deps(vB, chatB))
    expect(resB.judged).toBeGreaterThan(0)
    expect(callsB).toBeGreaterThan(0)
  })
})
