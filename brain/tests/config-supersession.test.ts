import { describe, it, expect } from 'vitest'
import { loadConfig } from '../src/config.js'

describe('dreamCycle.supersession config', () => {
  it('defaults are present and disabled', () => {
    const c = loadConfig({}, '/vault')
    expect(c.dreamCycle?.supersession).toEqual({
      enabled: false, neighborLo: 0.80, neighborHi: 0.985, maxPairsPerRun: 50,
    })
  })
  it('shallow-merges overrides', () => {
    const c = loadConfig({ dreamCycle: { facts: undefined as never, supersession: { enabled: true } as never } }, '/vault')
    expect(c.dreamCycle?.supersession.enabled).toBe(true)
    expect(c.dreamCycle?.supersession.maxPairsPerRun).toBe(50)
  })
})
