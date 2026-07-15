import { describe, it, expect } from 'vitest'
import { relKey, renderProposals, parseProposals, type ProposalsDoc } from '../src/facts/supersession.js'

describe('relKey', () => {
  it('is order-independent and printable (no NUL)', () => {
    expect(relKey('a.md', 'b.md')).toBe(relKey('b.md', 'a.md'))
    expect(relKey('a.md', 'b.md')).not.toContain('\0')
  })
})

describe('proposals round-trip with relKey and retired', () => {
  it('persists and re-parses relKey on a proposal and a retired lifecycle line (paths with spaces)', () => {
    const spaced = relKey('wiki/people/Amara Markovic.md', 'journal/2026-06-18.md')
    const doc: ProposalsDoc = {
      proposals: [{
        id: 'abc123', relKey: relKey('d1.md', 'd2.md'),
        loser: { sourcePath: 'd1.md', claim: 'old' }, winner: { sourcePath: 'd2.md', claim: 'new' },
        verdict: 'supersedes', confidence: 0.95, axis: 'x', loserDecided: false, proposedOn: '2026-07-15',
      }],
      lifecycle: [{ kind: 'retired', id: 'zzz999', relKey: spaced }],
    }
    const parsed = parseProposals(renderProposals(doc))
    expect(parsed.proposals[0].relKey).toBe(relKey('d1.md', 'd2.md'))
    expect(parsed.lifecycle[0]).toEqual({ kind: 'retired', id: 'zzz999', relKey: spaced })
  })
  it('computes relKey for a legacy proposal block with no relKey line', () => {
    const legacy = [
      '# Supersession proposals', '', '## abc123', '',
      '- verdict: `supersedes`', '- confidence: `0.95`',
      '- loser: `d1.md` :: old', '- winner: `d2.md` :: new',
      '- axis: x', '- loserDecided: `false`', '- proposedOn: `2026-07-15`', '',
    ].join('\n')
    expect(parseProposals(legacy).proposals[0].relKey).toBe(relKey('d1.md', 'd2.md'))
  })
})
