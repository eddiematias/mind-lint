import { describe, it, expect, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { gitHead, gitChangedFiles, gitCommitAndPush } from '../src/git.js'

const run = promisify(exec)
const dirs: string[] = []
afterEach(async () => { for (const d of dirs) await rm(d, { recursive: true, force: true }) })

async function tmpRepo(): Promise<string> {
  const d = await mkdtemp(resolve(tmpdir(), 'brain-git-')); dirs.push(d)
  await run('git init -q && git config user.email t@t && git config user.name t', { cwd: d })
  await writeFile(resolve(d, 'a.md'), 'one'); await run('git add -A && git commit -q -m init', { cwd: d })
  return d
}

describe('git helpers', () => {
  it('gitHead returns a sha in a repo and ok=false in a non-repo', async () => {
    const d = await tmpRepo()
    expect((await gitHead(d)).ok).toBe(true)
    const nd = await mkdtemp(resolve(tmpdir(), 'brain-nogit-')); dirs.push(nd)
    expect((await gitHead(nd)).ok).toBe(false)
  })

  it('gitChangedFiles lists files changed between two commits', async () => {
    const d = await tmpRepo()
    const first = (await gitHead(d)).sha
    await writeFile(resolve(d, 'b.md'), 'two'); await run('git add -A && git commit -q -m b', { cwd: d })
    const head = (await gitHead(d)).sha
    const res = await gitChangedFiles(d, first, head)
    expect(res.files).toContain('b.md')
  })

  it('gitChangedFiles with null since returns empty (first-run sentinel)', async () => {
    const d = await tmpRepo()
    const res = await gitChangedFiles(d, null, (await gitHead(d)).sha)
    expect(res).toEqual({ ok: true, files: [], output: '' })
  })

  it('gitCommitAndPush commits staged facts and is idempotent on a clean tree', async () => {
    const d = await tmpRepo()
    await mkdir(resolve(d, 'memory/facts'), { recursive: true })
    await writeFile(resolve(d, 'memory/facts/_general.md'), '# Facts\n\n## x\n')
    const r1 = await gitCommitAndPush(d, 'nightly facts')
    expect(r1.ok).toBe(true)
    const log = (await run('git log --oneline -1', { cwd: d })).stdout
    expect(log).toContain('nightly facts')
    const r2 = await gitCommitAndPush(d, 'nightly facts')
    expect(r2.output).toContain('nothing to commit')
  })
})
