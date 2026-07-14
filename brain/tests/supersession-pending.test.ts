import { describe, it, expect } from 'vitest'
import { pendingProposals, parseDecisions, type ProposalsDoc, type Proposal } from '../src/facts/supersession.js'

function prop(id: string, conf: number, loserPath: string, winnerPath = 'memory/decisions/win.md'): Proposal {
  return {
    id, loser: { sourcePath: loserPath, claim: `loser ${id}` },
    winner: { sourcePath: winnerPath, claim: `winner ${id}` },
    verdict: 'supersedes', confidence: conf, axis: 'axis', loserDecided: true, proposedOn: '2026-06-28',
  }
}

describe('pendingProposals', () => {
  it('excludes lifecycle-actioned and decided; totalPending equals the hook count', () => {
    // Real proposal ids are 16-hex; parseDecisions requires >=6 word chars, so use realistic ids.
    const doc: ProposalsDoc = {
      proposals: [prop('aaaaaa01', 0.9, 'x.md'), prop('bbbbbb02', 0.8, 'y.md'), prop('cccccc03', 0.95, 'z.md')],
      lifecycle: [{ kind: 'applied', id: 'aaaaaa01' }],
    }
    const decisions = parseDecisions('bbbbbb02: dismissed')
    const r = pendingProposals(doc, decisions)
    expect(r.totalPending).toBe(1) // aaaaaa01 applied, bbbbbb02 dismissed, only cccccc03 pending
    expect(r.pending.map((p) => p.id)).toEqual(['cccccc03'])
    expect(r.hiddenByFilter).toBe(0)
  })

  it('sorts by confidence desc and respects limit', () => {
    const doc: ProposalsDoc = {
      proposals: [prop('a', 0.85, 'x.md'), prop('b', 0.95, 'y.md'), prop('c', 0.9, 'z.md')],
      lifecycle: [],
    }
    const r = pendingProposals(doc, [], { limit: 2 })
    expect(r.pending.map((p) => p.id)).toEqual(['b', 'c'])
    expect(r.totalPending).toBe(3)
  })

  it('applies minConfidence and excludePathSubstrings, counting hiddenByFilter', () => {
    const doc: ProposalsDoc = {
      proposals: [
        prop('a', 0.95, 'memory/decisions/2026-02-16-bakebot-x.md'),
        prop('b', 0.8, 'y.md'),
        prop('c', 0.92, 'z.md'),
      ],
      lifecycle: [],
    }
    const r = pendingProposals(doc, [], { minConfidence: 0.9, excludePathSubstrings: ['bakebot'] })
    expect(r.pending.map((p) => p.id)).toEqual(['c']) // a excluded by path, b by confidence
    expect(r.totalPending).toBe(3)
    expect(r.hiddenByFilter).toBe(2)
  })
})
