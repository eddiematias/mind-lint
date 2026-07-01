// brain/tests/chunker.test.ts
import { describe, it, expect } from 'vitest'
import { chunkMarkdown, CHUNKER_VERSION, scanProseWikilinks } from '../src/chunker.js'

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
  it('exports a non-empty CHUNKER_VERSION used to key the reindex skip cache', () => {
    expect(typeof CHUNKER_VERSION).toBe('string')
    expect(CHUNKER_VERSION.length).toBeGreaterThan(0)
  })

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

  it('splits on H3 (###) so per-entry sections like learnings become separate chunks', () => {
    // learnings live as `### [date] Title` entries inside a category file (one H1, no H2s).
    // Splitting on H3 makes each learning its own retrieval unit instead of a blind
    // 2000-char slice that straddles unrelated entries.
    const learnings = [
      '# Backend Learnings',
      '',
      'APIs and server-side patterns.',
      '',
      '### [2026-01-01] First insight',
      'Body of the first learning.',
      '',
      '### [2026-01-02] Second insight',
      'Body of the second learning.',
    ].join('\n')
    const chunks = chunkMarkdown('memory/learnings/backend.md', learnings, 2000)
    const first = chunks.find((c) => c.content.includes('First insight'))
    const second = chunks.find((c) => c.content.includes('Second insight'))
    expect(first).toBeDefined()
    expect(second).toBeDefined()
    expect(first).not.toBe(second) // the two learnings land in different chunks
    expect(first!.content).not.toContain('Second insight')
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

  it('does not throw on malformed frontmatter; indexes the body with empty metadata', () => {
    // regression: real vault files can have unparseable YAML frontmatter (unterminated
    // quotes, stray null bytes). One bad file must not abort the whole reindex.
    const broken = '---\ntitle: "unterminated\n---\n## Heading\nbody text here.\n'
    const chunks = chunkMarkdown('memory/bad.md', broken, 2000)
    expect(chunks.length).toBeGreaterThanOrEqual(1)
    expect(chunks.some((c) => c.content.includes('body text here.'))).toBe(true)
    expect(chunks[0].metadata).toEqual({})
  })

  it('serializes entity frontmatter (incl. affiliations) into the first chunk text', () => {
    const entity = [
      '---',
      'type: company',
      'relationship: employer',
      'category: business',
      'status: active',
      'affiliations:',
      '  - target: "[[Jeff Perera]]"',
      '    role: founded',
      '    category: business',
      '    source: human',
      '    context: ""',
      '---',
      '',
      '## Snapshot',
      'A bagel company.',
    ].join('\n')
    const chunks = chunkMarkdown('wiki/companies/JBR.md', entity, 2000)
    // the first chunk carries a readable serialization of the structured edges
    expect(chunks[0].content).toContain('type: company')
    expect(chunks[0].content).toContain('relationship: employer')
    expect(chunks[0].content).toContain('affiliated with [[Jeff Perera]] (founded, business)')
    // the body is still present and still searchable
    expect(chunks.some((c) => c.content.includes('A bagel company.'))).toBe(true)
    // metadata is unchanged (single source of truth still parsed from frontmatter)
    expect(chunks[0].metadata.type).toBe('company')
    expect(Array.isArray(chunks[0].metadata.affiliations)).toBe(true)
  })

  it('multi-valued relationship is comma-joined in the serialized header', () => {
    const entity = [
      '---',
      'type: person',
      'relationship: [friend, co-worker]',
      'category: mixed',
      'status: active',
      '---',
      '',
      '## Snapshot',
      'Body.',
    ].join('\n')
    const chunks = chunkMarkdown('wiki/people/X.md', entity, 2000)
    expect(chunks[0].content).toContain('relationship: friend, co-worker')
  })

  it('files without entity frontmatter are unchanged (no serialized header)', () => {
    const plain = '---\ntitle: Note\n---\n## Heading\nbody.\n'
    const chunks = chunkMarkdown('memory/x.md', plain, 2000)
    // no entity `type:` ⇒ no serialized affiliations header is prepended
    expect(chunks[0].content).not.toContain('affiliated with')
    expect(chunks[0].content.startsWith('type:')).toBe(false)
  })

  it('non-entity typed files (e.g. type: daily-note) get NO serialized header', () => {
    // journal notes carry `type: daily-note`; content ideas carry e.g.
    // `type: business-exploration`. They have a non-empty `type:` but are NOT entities,
    // so the gate (ENTITY_TYPES) must leave them byte-for-byte unchanged.
    const dailyNote = '---\ntype: daily-note\ndate: 2026-06-17\n---\n## Notes\nsome thoughts.\n'
    const chunks = chunkMarkdown('journal/2026-06-17.md', dailyNote, 2000)
    expect(chunks[0].content).not.toContain('affiliated with')
    expect(chunks[0].content.startsWith('type:')).toBe(false)
    // the body is the only thing present, exactly as the pre-change chunker produced
    expect(chunks[0].content).toContain('some thoughts.')
  })
})

import { parseEntityFile } from '../src/chunker.js'

describe('parseEntityFile', () => {
  const jbr = [
    '---', 'type: company', 'affiliations:',
    '  - target: "[[Jeff Perera]]"', '    role: founded', '    category: business', '    source: human', '    context: ""',
    '  - target: "[[Otus Coffee]]"', '    role: acquired', '    category: business', '    source: human', '    context: ""',
    '---', '', '## Snapshot', 'A bagel company.',
  ].join('\n')

  it('returns chunks identical to chunkMarkdown plus parsed affiliations and type', () => {
    const parsed = parseEntityFile('wiki/companies/JBR.md', jbr, 2000)
    const direct = chunkMarkdown('wiki/companies/JBR.md', jbr, 2000)
    expect(parsed.chunks.map((c) => c.content)).toEqual(direct.map((c) => c.content))
    expect(parsed.type).toBe('company')
    expect(parsed.affiliations).toHaveLength(2)
    expect(parsed.affiliations[0]).toMatchObject({ target: '[[Jeff Perera]]', role: 'founded', category: 'business', source: 'human' })
  })

  it('entity with affiliations: [] returns an empty affiliations array', () => {
    const solo = ['---', 'type: project', 'affiliations: []', '---', '', '## X', 'body.'].join('\n')
    const parsed = parseEntityFile('wiki/projects/Solo.md', solo, 2000)
    expect(parsed.type).toBe('project')
    expect(parsed.affiliations).toEqual([])
  })

  it('non-entity file returns type null and no affiliations', () => {
    const note = '---\ntitle: Note\n---\n## H\nbody.\n'
    const parsed = parseEntityFile('memory/x.md', note, 2000)
    expect(parsed.type).toBeNull()
    expect(parsed.affiliations).toEqual([])
  })

  it('keeps an unresolved-looking target verbatim (resolution happens later, in the indexer)', () => {
    const e = ['---', 'type: person', 'affiliations:', '  - target: "[[Nobody]]"', '    role: knows', '---', '', '## S', 'b.'].join('\n')
    const parsed = parseEntityFile('wiki/people/P.md', e, 2000)
    expect(parsed.affiliations[0].target).toBe('[[Nobody]]')
  })
})

describe('scanProseWikilinks', () => {
  it('extracts a body wikilink with its first matching line as context', () => {
    const body = ['Worked on [[JBR]] today.', 'Then talked to [[Amara Markovic]].'].join('\n')
    const hits = scanProseWikilinks(body)
    expect(hits.map((h) => h.raw).sort()).toEqual(['[[Amara Markovic]]', '[[JBR]]'])
    expect(hits.find((h) => h.raw === '[[JBR]]')!.context).toBe('Worked on [[JBR]] today.')
  })

  it('de-dupes a wikilink that appears multiple times, keeping the FIRST line (M1)', () => {
    const body = ['First mention of [[JBR]] here.', 'noise', 'Second [[JBR]] mention.'].join('\n')
    const hits = scanProseWikilinks(body)
    expect(hits).toHaveLength(1)
    expect(hits[0].context).toBe('First mention of [[JBR]] here.') // first in document order, not last
  })

  it('SKIPS wikilinks inside fenced code blocks (I2 fence guard)', () => {
    const fence = String.fromCharCode(96, 96, 96)
    const body = [
      'Real mention of [[JBR]].',
      fence,
      'example: [[Not An Edge]] inside a fence',
      fence,
    ].join('\n')
    const hits = scanProseWikilinks(body)
    expect(hits.map((h) => h.raw)).toEqual(['[[JBR]]'])
    expect(hits.some((h) => h.raw === '[[Not An Edge]]')).toBe(false)
  })

  it('also skips tilde-fenced blocks', () => {
    const body = ['[[Kept]] line.', '~~~', '[[Dropped]] in tilde fence', '~~~'].join('\n')
    expect(scanProseWikilinks(body).map((h) => h.raw)).toEqual(['[[Kept]]'])
  })

  it('SKIPS wikilinks inside inline code spans but KEEPS a bare prose link on the same fixture (I-2)', () => {
    const body = [
      'the `[[JBR]]` syntax is just an example',  // inline code: no edge
      'but [[Amara Markovic]] is a real prose mention', // bare prose: edge
    ].join('\n')
    const hits = scanProseWikilinks(body)
    expect(hits.map((h) => h.raw)).toEqual(['[[Amara Markovic]]'])
    expect(hits.some((h) => h.raw === '[[JBR]]')).toBe(false)
  })

  it('truncates an over-long context line to <= 240 chars', () => {
    const body = `pre [[JBR]] ` + 'x'.repeat(400)
    const hits = scanProseWikilinks(body)
    expect(hits[0].context.length).toBeLessThanOrEqual(240)
  })

  it('returns [] when there are no body wikilinks', () => {
    expect(scanProseWikilinks('plain prose, no links')).toEqual([])
  })
})

import { buildGazetteer, scanMentions } from '../src/chunker.js'

// Helper: a gazetteer over a few entities the way the indexer will build it.
function gaz() {
  return buildGazetteer([
    { surface: 'JBR', targetPath: 'wiki/companies/JBR.md', canonicalRaw: '[[JBR]]' },
    { surface: 'Phase Rentals', targetPath: 'wiki/companies/Phase Rentals.md', canonicalRaw: '[[Phase Rentals]]' },
    { surface: 'Amara', targetPath: 'wiki/people/Amara Markovic.md', canonicalRaw: '[[Amara Markovic]]' },
  ])
}

describe('scanMentions', () => {
  it('matches a bare multi-token name but NOT a partial token', () => {
    const hits = scanMentions('We met about Phase Rentals today.\nThat was phase 1 of the rollout.', gaz())
    expect(hits.map((h) => h.canonicalRaw)).toEqual(['[[Phase Rentals]]'])
  })

  it('is case-sensitive (JBR matches, jbr does not)', () => {
    expect(scanMentions('Talked to JBR.', gaz()).length).toBe(1)
    expect(scanMentions('talked to jbr.', gaz()).length).toBe(0)
  })

  it('does NOT match a name inside [[wikilink]] syntax (C3) but DOES match a separate bare mention', () => {
    // wikilinked only -> no mention
    expect(scanMentions('See [[JBR]] for details.', gaz()).length).toBe(0)
    // wikilink AND a separate bare mention on another line -> one mention
    const hits = scanMentions('See [[JBR]] for details.\nJBR is hiring.', gaz())
    expect(hits.map((h) => h.canonicalRaw)).toEqual(['[[JBR]]'])
  })

  it('skips fenced code blocks and inline code spans', () => {
    const fenced = 'Before.\n```\nJBR inside a fence\n```\nAfter.'
    expect(scanMentions(fenced, gaz()).length).toBe(0)
    expect(scanMentions('The `JBR` token is code.', gaz()).length).toBe(0)
  })

  it('dedupes per target, keeping the first matching line as context', () => {
    const hits = scanMentions('Amara called.\nLater, Amara texted.', gaz())
    expect(hits.length).toBe(1)
    expect(hits[0].targetPath).toBe('wiki/people/Amara Markovic.md')
    expect(hits[0].context).toBe('Amara called.')
  })

  it('maximal-munch: longest entry wins at an offset', () => {
    const g = buildGazetteer([
      { surface: 'Phase', targetPath: 'wiki/people/Phase Person.md', canonicalRaw: '[[Phase Person]]' },
      { surface: 'Phase Rentals', targetPath: 'wiki/companies/Phase Rentals.md', canonicalRaw: '[[Phase Rentals]]' },
    ])
    const hits = scanMentions('Phase Rentals grew.', g)
    expect(hits.map((h) => h.canonicalRaw)).toEqual(['[[Phase Rentals]]'])
  })
})
