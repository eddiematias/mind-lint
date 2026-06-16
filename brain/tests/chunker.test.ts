// brain/tests/chunker.test.ts
import { describe, it, expect } from 'vitest'
import { chunkMarkdown } from '../src/chunker.js'

const doc = `---
title: Test Note
tags: ["a", "b"]
---

## Section One
Hello world.

## Section Two
More text here.
`

describe('chunkMarkdown', () => {
  it('parses frontmatter onto every chunk', () => {
    const chunks = chunkMarkdown('memory/x.md', doc, 2000)
    expect(chunks.length).toBe(2)
    expect(chunks[0].metadata.title).toBe('Test Note')
    expect(chunks[0].metadata.tags).toEqual(['a', 'b'])
    expect(chunks[1].metadata.title).toBe('Test Note')
  })

  it('ids are sourcePath#index and content is preserved', () => {
    const chunks = chunkMarkdown('memory/x.md', doc, 2000)
    expect(chunks[0].id).toBe('memory/x.md#0')
    expect(chunks[0].content).toContain('Hello world.')
    expect(chunks[1].content).toContain('More text here.')
  })

  it('splits an over-long section into multiple chunks', () => {
    const long = `## Big\n${'x '.repeat(3000)}`
    const chunks = chunkMarkdown('memory/y.md', long, 1000)
    expect(chunks.length).toBeGreaterThan(1)
  })

  it('hashes differ for different content', () => {
    const chunks = chunkMarkdown('memory/x.md', doc, 2000)
    expect(chunks[0].contentHash).not.toBe(chunks[1].contentHash)
  })

  it('does not split on # lines inside fenced code blocks', () => {
    const f = '`'.repeat(3) // a code fence, built at runtime to avoid literal backticks
    const fenced = ['## Real Heading', 'Intro text.', f + 'bash', '# not a heading, just a shell comment', 'echo hi', f, 'Closing text.'].join('\n')
    const chunks = chunkMarkdown('memory/z.md', fenced, 5000)
    expect(chunks.length).toBe(1)
    expect(chunks[0].content).toContain('# not a heading')
  })
})
