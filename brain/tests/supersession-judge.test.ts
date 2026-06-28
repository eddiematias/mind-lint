import { describe, it, expect } from 'vitest'
import { parseJudgeJson, assignLoser } from '../src/facts/supersession.js'
import { type Fact } from '../src/facts/markdown.js'

const mk = (source: string): Fact => ({
  claim: 'c', kind: 'fact', confidence: 1, entity: null, sourcePath: source,
  validFrom: '2026-01-01', validUntil: null, superseded: false, supersededNote: null,
})

describe('parseJudgeJson', () => {
  it('parses a supersedes verdict above the floor', () => {
    const r = parseJudgeJson('{"verdict":"supersedes","confidence":0.9,"axis":"the goal timeline"}')
    expect(r.verdict).toBe('supersedes'); expect(r.axis).toBe('the goal timeline')
  })
  it('downgrades supersedes below the 0.7 floor to no_contradiction', () => {
    expect(parseJudgeJson('{"verdict":"supersedes","confidence":0.5,"axis":"x"}').verdict).toBe('no_contradiction')
  })
  it('coexist below the floor is left as coexist (floor only guards supersedes)', () => {
    expect(parseJudgeJson('{"verdict":"coexist","confidence":0.4,"axis":"x"}').verdict).toBe('coexist')
  })
  it('returns no_contradiction on unparseable output', () => {
    expect(parseJudgeJson('the model rambled').verdict).toBe('no_contradiction')
  })
})

describe('assignLoser', () => {
  it('older valid_from loses', () => {
    const r = assignLoser(mk('journal/2026-05-04.md'), mk('journal/2026-05-13.md'))!
    expect(r.loser.sourcePath).toBe('journal/2026-05-04.md'); expect(r.decided).toBe(true)
  })
  it('equal dates -> which-wins (decided:false)', () => {
    const r = assignLoser(mk('journal/2026-05-13.md'), mk('journal/2026-05-13.md'))!
    expect(r.decided).toBe(false)
  })
  it('both undated -> which-wins (decided:false), never null (PR-7)', () => {
    const r = assignLoser(mk('rules/preferences.md'), mk('memory/learnings/x.md'))!
    expect(r.decided).toBe(false)
    expect(r.loser).toBeDefined(); expect(r.winner).toBeDefined()
  })
})
