import { describe, it, expect, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { restampValidFrom } from '../src/facts/supersession.js'

const dirs: string[] = []
afterEach(async () => { for (const d of dirs) await rm(d, { recursive: true, force: true }) })
async function vaultWithFact(validLine: string, source: string): Promise<string> {
  const d = await mkdtemp(resolve(tmpdir(), 'restamp-')); dirs.push(d)
  await mkdir(resolve(d, 'memory/facts'), { recursive: true })
  await writeFile(resolve(d, 'memory/facts/_general.md'),
    `# Facts (unattached)\n\n## A claim\n\n- kind: \`fact\`\n- confidence: \`0.90\`\n- source: \`${source}\`\n${validLine}`)
  return d
}

describe('restampValidFrom', () => {
  it('re-stamps a path-dated fact whose stored validFrom is the wrong (cycle) date', async () => {
    const v = await vaultWithFact('- valid: `2026-06-27` -> ``\n', 'journal/2026-05-13.md')
    const res = await restampValidFrom(v)
    expect(res.filesChanged).toBe(1)
    const g = await readFile(resolve(v, 'memory/facts/_general.md'), 'utf8')
    expect(g).toContain('`2026-05-13`')
    expect(g).not.toContain('`2026-06-27`')
  })
  it('is idempotent: a second run changes nothing', async () => {
    const v = await vaultWithFact('- valid: `2026-06-27` -> ``\n', 'journal/2026-05-13.md')
    await restampValidFrom(v)
    const res2 = await restampValidFrom(v)
    expect(res2.filesChanged).toBe(0)
  })
  it('leaves an undated-source fact untouched', async () => {
    const v = await vaultWithFact('- valid: `2026-06-27` -> ``\n', 'rules/preferences.md')
    const res = await restampValidFrom(v)
    expect(res.filesChanged).toBe(0)
    const g = await readFile(resolve(v, 'memory/facts/_general.md'), 'utf8')
    expect(g).toContain('`2026-06-27`')
  })
  it('preserves an entity file title on rewrite (PR-3)', async () => {
    const d = await mkdtemp(resolve(tmpdir(), 'restamp-')); dirs.push(d)
    await mkdir(resolve(d, 'memory/facts'), { recursive: true })
    await writeFile(resolve(d, 'memory/facts/amara-markovic.md'),
      '# Facts: Amara Markovic\n\n## A claim\n\n- kind: `fact`\n- confidence: `0.90`\n- source: `journal/2026-05-13.md`\n- entity: [[Amara Markovic]]\n- valid: `2026-06-27` -> ``\n')
    await restampValidFrom(d)
    const out = await readFile(resolve(d, 'memory/facts/amara-markovic.md'), 'utf8')
    expect(out).toContain('# Facts: Amara Markovic')
    expect(out).not.toContain('# Facts (unattached)')
    expect(out).toContain('`2026-05-13`')
  })
})
