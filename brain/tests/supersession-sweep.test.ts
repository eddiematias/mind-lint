// brain/tests/supersession-sweep.test.ts
import { describe, it, expect } from 'vitest'
import { retireBacklog, relKey, type ProposalsDoc, type Decision } from '../src/facts/supersession.js'

const P = (id: string, lp: string, wp: string, conf = 0.9, decided = false, on = '2026-07-01') => ({
  id, relKey: relKey(lp, wp),
  loser: { sourcePath: lp, claim: `loser ${id}` }, winner: { sourcePath: wp, claim: `winner ${id}` },
  verdict: 'supersedes' as const, confidence: conf, axis: '', loserDecided: decided, proposedOn: on,
})
const retiredIds = (doc: ProposalsDoc) => new Set(doc.lifecycle.filter(l => l.kind === 'retired').map(l => l.id))

describe('retireBacklog', () => {
  it('retires intra-doc proposals', () => {
    const { report } = retireBacklog({ proposals: [P('a', 'd.md', 'd.md')], lifecycle: [] }, [])
    expect(report.intraDocRetired).toBe(1)
  })
  it('collapses a cross-doc relKey group to one deterministic representative', () => {
    const doc: ProposalsDoc = { proposals: [P('a','x.md','y.md',0.8), P('b','x.md','y.md',0.95), P('c','x.md','y.md',0.95)], lifecycle: [] }
    const { doc: out, report } = retireBacklog(doc, [])
    expect(report.dupesRetired).toBe(2)
    const r = retiredIds(out)
    expect(r.has('b')).toBe(false)      // 0.95 beats 0.8; 'b' < 'c' -> keep b
    expect(r.has('a') && r.has('c')).toBe(true)
  })
  it('keeps the decided member and retires the undecided dupe (single-decided collapse)', () => {
    const doc: ProposalsDoc = { proposals: [P('a','x.md','y.md',0.99,false), P('b','x.md','y.md',0.7,false)], lifecycle: [] }
    const decisions: Decision[] = [{ id: 'b', status: 'confirmed', chosenLoserPath: 'x.md' }]
    const { doc: out } = retireBacklog(doc, decisions)
    const r = retiredIds(out)
    expect(r.has('b')).toBe(false)      // decided -> never retired, becomes the representative
    expect(r.has('a')).toBe(true)       // undecided dupe retired despite higher confidence
  })
  it('flags a cross-doc relKey group with >1 decided member and retires none of them', () => {
    const doc: ProposalsDoc = { proposals: [P('a','x.md','y.md'), P('b','x.md','y.md')], lifecycle: [] }
    const decisions: Decision[] = [{ id:'a', status:'confirmed', chosenLoserPath:'x.md' }, { id:'b', status:'confirmed', chosenLoserPath:'x.md' }]
    const { doc: out, report } = retireBacklog(doc, decisions)
    expect(report.conflicts).toEqual([{ relKey: relKey('x.md','y.md'), ids: ['a','b'] }])
    expect(retiredIds(out).size).toBe(0)
  })
  it('does NOT flag multiple decided same-file confirms in one doc as a conflict', () => {
    const doc: ProposalsDoc = { proposals: [P('a','d.md','d.md'), P('b','d.md','d.md')], lifecycle: [] }
    const decisions: Decision[] = [{ id:'a', status:'confirmed', chosenLoserPath:'d.md' }, { id:'b', status:'confirmed', chosenLoserPath:'d.md' }]
    const { report } = retireBacklog(doc, decisions)
    expect(report.conflicts).toEqual([])       // intra-doc skipped from grouping
    expect(report.intraDocRetired).toBe(0)     // both decided, so neither retired
  })
})
