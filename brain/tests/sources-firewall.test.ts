import { describe, it, expect, afterEach } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import fg from 'fast-glob'
import { loadConfig } from '../src/config.js'

async function seed(dir: string, rels: string[]) {
  for (const rel of rels) {
    await mkdir(resolve(dir, rel, '..'), { recursive: true })
    await writeFile(resolve(dir, rel), '# t', 'utf8')
  }
}

describe('sources/ firewall (Corpus 2 never enters scopeGlobs)', () => {
  let dir = ''
  afterEach(async () => { if (dir) await rm(dir, { recursive: true, force: true }); dir = '' })

  it('default scopeGlobs excludes sources/ and raw/, includes journal/wiki/memory', async () => {
    dir = await mkdtemp(resolve(tmpdir(), 'brain-fw-'))
    await seed(dir, ['sources/x.md', 'raw/y.md', 'memory/facts/z.md', 'journal/j.md', 'wiki/w.md'])
    const cfg = loadConfig({}, dir)
    const matched = await fg(cfg.scopeGlobs, { cwd: dir, dot: true })
    expect(matched).toContain('journal/j.md')
    expect(matched).toContain('wiki/w.md')
    expect(matched).toContain('memory/facts/z.md')
    expect(matched).not.toContain('sources/x.md')
    expect(matched).not.toContain('raw/y.md')
  })

  it('the supersession hardcoded glob memory/facts/*.md never matches sources/', async () => {
    dir = await mkdtemp(resolve(tmpdir(), 'brain-fw2-'))
    await seed(dir, ['sources/x.md', 'memory/facts/z.md'])
    const matched = await fg('memory/facts/*.md', { cwd: dir, dot: true })
    expect(matched).toContain('memory/facts/z.md')
    expect(matched).not.toContain('sources/x.md')
  })
})
