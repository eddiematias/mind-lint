// tests/supersession-integration.test.ts
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile, readFile, appendFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { FakeChatClient } from '../src/chat.js'
import type { Embedder } from '../src/types.js'
import { runSupersessionProbe, applyConfirmedSupersessions, parseProposals } from '../src/facts/supersession.js'

const dirs: string[] = []
afterEach(async () => { for (const d of dirs) await rm(d, { recursive: true, force: true }) })

class GoalEmbedder implements Embedder {
  readonly id = 'goal'; readonly dimensions = 2
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => t.includes('bagel') ? [0, 1] : t.includes('removed') ? [0.96, 0.28] : [1, 0])
  }
}

async function vault(): Promise<string> {
  const d = await mkdtemp(resolve(tmpdir(), 'sup-int-')); dirs.push(d)
  await mkdir(resolve(d, 'memory/facts'), { recursive: true })
  // Two PRE-EXISTING facts (different journal days) + an unrelated one. Neither is "new tonight".
  await writeFile(resolve(d, 'memory/facts/_general.md'),
    '# Facts (unattached)\n\n' +
    '## Eddie income goal anchored to May 27 2026\n\n- kind: `belief`\n- confidence: `0.9`\n- source: `journal/2026-05-04.md`\n- valid: `2026-05-04` -> ``\n\n' +
    '## Eddie removed the May 27 timeline from the income goal\n\n- kind: `belief`\n- confidence: `0.9`\n- source: `journal/2026-05-13.md`\n- valid: `2026-05-13` -> ``\n\n' +
    '## Eddie likes bagels\n\n- kind: `preference`\n- confidence: `0.9`\n- source: `journal/2026-04-01.md`\n- valid: `2026-04-01` -> ``\n')
  return d
}
const pd = (v: string) => ({
  proposalsPath: resolve(v, 'memory/facts/_supersession-proposals.md'),
  decisionsPath: resolve(v, 'memory/facts/_supersession-decisions.md'),
})
const probeDeps = (v: string, chat: FakeChatClient) => ({
  vaultRoot: v, chat, embedder: new GoalEmbedder(),
  cachePath: resolve(v, 'data/facts-vectors.json'), ...pd(v),
  neighborLo: 0.80, neighborHi: 0.985, maxPairsPerRun: 50, now: '2026-06-28',
})

describe('supersession end-to-end', () => {
  it('first-run corpus pass surfaces a pre-existing pair, confirm -> next cycle strikes it', async () => {
    const v = await vault()
    const chat = new FakeChatClient((_s, u) =>
      u.includes('bagel') ? '{"verdict":"no_contradiction","confidence":0.9,"axis":""}'
        : '{"verdict":"supersedes","confidence":0.93,"axis":"the income-goal timeline"}')
    // Night 1: probe surfaces the pair (both facts pre-date the probe).
    const r1 = await runSupersessionProbe(probeDeps(v, chat))
    expect(r1.proposed).toBe(1)
    const doc = parseProposals(await readFile(pd(v).proposalsPath, 'utf8'))
    const id = doc.proposals[0].id
    expect(doc.proposals[0].loser.sourcePath).toBe('journal/2026-05-04.md')

    // Eddie confirms (writes the human-owned decisions file).
    await appendFile(pd(v).decisionsPath, `${id}: confirmed\n`)

    // Night 2: apply runs first, strikes the loser.
    const ap = await applyConfirmedSupersessions({ vaultRoot: v, ...pd(v) })
    expect(ap.applied).toBe(1)
    const g = await readFile(resolve(v, 'memory/facts/_general.md'), 'utf8')
    expect(g).toContain('## ~~Eddie income goal anchored to May 27 2026~~')
    expect(g).toContain('superseded by: Eddie removed the May 27 timeline')

    // The newer fact stays live; nothing deleted.
    expect(g).toContain('## Eddie removed the May 27 timeline from the income goal')

    // Night 2 probe: the pair is resolved (applied), so it is NOT re-proposed.
    const r2 = await runSupersessionProbe(probeDeps(v, chat))
    expect(r2.proposed).toBe(0)
  })

  it('a dismissed pair never re-surfaces', async () => {
    const v = await vault()
    const chat = new FakeChatClient((_s, u) =>
      u.includes('bagel') ? '{"verdict":"no_contradiction","confidence":0.9,"axis":""}'
        : '{"verdict":"supersedes","confidence":0.93,"axis":"x"}')
    const r1 = await runSupersessionProbe(probeDeps(v, chat))
    const id = parseProposals(await readFile(pd(v).proposalsPath, 'utf8')).proposals[0].id
    await appendFile(pd(v).decisionsPath, `${id}: dismissed\n`)
    const r2 = await runSupersessionProbe(probeDeps(v, chat))
    expect(r2.proposed).toBe(0)
  })
})
