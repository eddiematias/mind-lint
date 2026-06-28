// tests/supersession-apply.test.ts
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { applyConfirmedSupersessions, parseProposals, pairId } from '../src/facts/supersession.js'

const dirs: string[] = []
afterEach(async () => { for (const d of dirs) await rm(d, { recursive: true, force: true }) })

const A = { sourcePath: 'journal/2026-05-04.md', claim: 'Eddie income goal anchored to May 27 2026' }
const B = { sourcePath: 'journal/2026-05-13.md', claim: 'Eddie removed the timeline from the income goal' }
const ID = pairId(A, B)

async function seed(strikeApplied = false): Promise<string> {
  const d = await mkdtemp(resolve(tmpdir(), 'apply-')); dirs.push(d)
  await mkdir(resolve(d, 'memory/facts'), { recursive: true })
  // strikeApplied=true simulates the human un-striking the loser after the cycle applied it:
  // the lifecycle says "applied" but the file's claim no longer has strikethrough.
  const loserClaim = A.claim
  await writeFile(resolve(d, 'memory/facts/_general.md'),
    '# Facts (unattached)\n\n' +
    `## ${loserClaim}\n\n- kind: \`belief\`\n- confidence: \`0.9\`\n- source: \`${A.sourcePath}\`\n- valid: \`2026-05-04\` -> \`\`\n\n` +
    `## ${B.claim}\n\n- kind: \`belief\`\n- confidence: \`0.9\`\n- source: \`${B.sourcePath}\`\n- valid: \`2026-05-13\` -> \`\`\n`)
  await writeFile(resolve(d, 'memory/facts/_supersession-proposals.md'),
    '# Supersession proposals\n\n' +
    `## ${ID}\n\n- verdict: \`supersedes\`\n- confidence: \`0.92\`\n- loser: \`${A.sourcePath}\` :: ${A.claim}\n- winner: \`${B.sourcePath}\` :: ${B.claim}\n- axis: the timeline\n- loserDecided: \`true\`\n- proposedOn: \`2026-06-28\`\n` +
    (strikeApplied ? `\n## lifecycle\n\n- applied: ${ID}\n` : ''))
  return d
}
const deps = (v: string) => ({
  vaultRoot: v, proposalsPath: resolve(v, 'memory/facts/_supersession-proposals.md'),
  decisionsPath: resolve(v, 'memory/facts/_supersession-decisions.md'),
})

describe('applyConfirmedSupersessions', () => {
  it('strikes the loser on a confirmed decision and records applied', async () => {
    const v = await seed()
    await writeFile(deps(v).decisionsPath, `${ID}: confirmed\n`)
    const res = await applyConfirmedSupersessions(deps(v))
    expect(res.applied).toBe(1)
    const g = await readFile(resolve(v, 'memory/facts/_general.md'), 'utf8')
    expect(g).toContain(`## ~~${A.claim}~~`)
    expect(g).toContain('superseded by:')
    const doc = parseProposals(await readFile(deps(v).proposalsPath, 'utf8'))
    expect(doc.lifecycle).toContainEqual({ kind: 'applied', id: ID })
  })

  it('records stale when the confirmed loser no longer resolves (reworded)', async () => {
    const v = await seed()
    // rewrite the loser claim text so its factKey no longer matches the proposal
    const g0 = await readFile(resolve(v, 'memory/facts/_general.md'), 'utf8')
    await writeFile(resolve(v, 'memory/facts/_general.md'), g0.replace(A.claim, 'Eddie goal tied to Amara school start'))
    await writeFile(deps(v).decisionsPath, `${ID}: confirmed\n`)
    const res = await applyConfirmedSupersessions(deps(v))
    expect(res.stale).toBe(1); expect(res.applied).toBe(0)
  })

  it('records reverted when an applied strike was un-struck by hand (R-I4)', async () => {
    const v = await seed(true) // file has loser UN-struck but lifecycle says applied
    const res = await applyConfirmedSupersessions(deps(v))
    expect(res.reverted).toBe(1)
    const doc = parseProposals(await readFile(deps(v).proposalsPath, 'utf8'))
    expect(doc.lifecycle).toContainEqual({ kind: 'reverted', id: ID })
  })

  it('which-wins: honors the human chosen loser, striking the winner side (PR-6)', async () => {
    const d = await mkdtemp(resolve(tmpdir(), 'apply-')); dirs.push(d)
    await mkdir(resolve(d, 'memory/facts'), { recursive: true })
    const LA = { sourcePath: 'memory/learnings/a.md', claim: 'Claim A' }
    const LB = { sourcePath: 'memory/learnings/b.md', claim: 'Claim B' }
    const id = pairId(LA, LB)
    await writeFile(resolve(d, 'memory/facts/_general.md'),
      '# Facts (unattached)\n\n' +
      `## ${LA.claim}\n\n- kind: \`fact\`\n- confidence: \`0.9\`\n- source: \`${LA.sourcePath}\`\n\n` +
      `## ${LB.claim}\n\n- kind: \`fact\`\n- confidence: \`0.9\`\n- source: \`${LB.sourcePath}\`\n`)
    await writeFile(resolve(d, 'memory/facts/_supersession-proposals.md'),
      '# Supersession proposals\n\n' +
      `## ${id}\n\n- verdict: \`supersedes\`\n- confidence: \`0.9\`\n- loser: \`${LA.sourcePath}\` :: ${LA.claim}\n- winner: \`${LB.sourcePath}\` :: ${LB.claim}\n- axis: x\n- loserDecided: \`false\`\n- proposedOn: \`2026-06-28\`\n`)
    const dep = { vaultRoot: d, proposalsPath: resolve(d, 'memory/facts/_supersession-proposals.md'), decisionsPath: resolve(d, 'memory/facts/_supersession-decisions.md') }
    await writeFile(dep.decisionsPath, `${id}: confirmed loser=${LB.sourcePath}\n`)
    const res = await applyConfirmedSupersessions(dep)
    expect(res.applied).toBe(1)
    const g = await readFile(resolve(d, 'memory/facts/_general.md'), 'utf8')
    expect(g).toContain('## ~~Claim B~~')   // the human's chosen loser (the proposal's winner side) is struck
    expect(g).toContain('## Claim A')        // the proposal's placeholder loser stays live
    expect(g).not.toContain('## ~~Claim A~~')
  })
})
