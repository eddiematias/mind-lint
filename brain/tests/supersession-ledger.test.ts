import { describe, it, expect } from 'vitest'
import {
  pairId, parseProposals, renderProposals, parseDecisions, judgedIds,
  type Proposal, type ProposalsDoc,
} from '../src/facts/supersession.js'

const A = { sourcePath: 'journal/2026-05-04.md', claim: 'goal anchored to May 27' }
const B = { sourcePath: 'journal/2026-05-13.md', claim: 'timeline removed' }

describe('pairId', () => {
  it('is order-independent', () => {
    expect(pairId(A, B)).toBe(pairId(B, A))
  })
  it('differs for different pairs', () => {
    expect(pairId(A, B)).not.toBe(pairId(A, { sourcePath: 'x.md', claim: 'other' }))
  })
})

describe('proposals round-trip', () => {
  it('renders and parses proposals + lifecycle lines', () => {
    const doc: ProposalsDoc = {
      proposals: [{
        id: pairId(A, B), loser: A, winner: B, verdict: 'supersedes',
        confidence: 0.9, axis: 'the goal timeline', loserDecided: true, proposedOn: '2026-06-28',
      }],
      lifecycle: [{ kind: 'checked', id: 'deadbeef' }],
    }
    const back = parseProposals(renderProposals(doc))
    expect(back.proposals).toHaveLength(1)
    expect(back.proposals[0].id).toBe(pairId(A, B))
    expect(back.proposals[0].verdict).toBe('supersedes')
    expect(back.proposals[0].loser.claim).toBe('goal anchored to May 27')
    expect(back.lifecycle).toContainEqual({ kind: 'checked', id: 'deadbeef' })
  })
})

describe('decisions + judged set', () => {
  it('parses decisions and unions ids', () => {
    const id = pairId(A, B)
    const decisions = parseDecisions(`${id}: confirmed\notherid: dismissed loser=journal/2026-05-04.md`)
    expect(decisions.find((d) => d.id === id)?.status).toBe('confirmed')
    const doc: ProposalsDoc = { proposals: [], lifecycle: [{ kind: 'checked', id: 'cid' }] }
    const j = judgedIds(doc, decisions)
    expect(j.has('cid')).toBe(true)
    expect(j.has(id)).toBe(true)
    expect(j.has('otherid')).toBe(true)
  })
})
