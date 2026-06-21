import { describe, it, expect, vi, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { pullVault, makeGuardedTick, startReindexLoop } from '../src/reindex-loop.js'

afterEach(() => { vi.useRealTimers() })

describe('makeGuardedTick', () => {
  it('skips an overlapping invocation while one is in flight, then resets', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((r) => { release = r })
    let calls = 0
    const tick = makeGuardedTick(async () => { calls++; await gate })

    const p1 = tick() // starts the fn, now in-flight on the gate
    const p2 = tick() // guard: should skip without calling fn again
    expect(await p2).toBe(false)
    expect(calls).toBe(1)

    release()
    expect(await p1).toBe(true)

    const p3 = tick() // guard reset: runs again
    expect(await p3).toBe(true)
    expect(calls).toBe(2)
  })

  it('swallows a thrown error (a failed tick must not crash the caller) and reports it', async () => {
    const errors: unknown[] = []
    const tick = makeGuardedTick(async () => { throw new Error('boom') }, (e) => errors.push(e))
    await expect(tick()).resolves.toBe(false) // does not reject
    expect(errors).toHaveLength(1)
    // guard is released after the error, so a subsequent good tick runs
    let ran = false
    const tick2 = makeGuardedTick(async () => { ran = true })
    await tick2()
    expect(ran).toBe(true)
  })
})

describe('pullVault', () => {
  it('is best-effort: returns ok=false on a non-git directory without throwing', async () => {
    const dir = await mkdtemp(resolve(tmpdir(), 'brain-pull-'))
    try {
      const res = await pullVault(dir)
      expect(res.ok).toBe(false)
      expect(typeof res.output).toBe('string')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('startReindexLoop', () => {
  it('runs an initial cycle immediately and again on the interval, until stopped', async () => {
    vi.useFakeTimers()
    let cycles = 0
    const stop = startReindexLoop({ intervalMs: 1000, runCycle: async () => { cycles++ } })

    // initial tick fires synchronously (scheduled microtask); flush it
    await vi.advanceTimersByTimeAsync(0)
    expect(cycles).toBe(1)

    await vi.advanceTimersByTimeAsync(1000)
    expect(cycles).toBe(2)
    await vi.advanceTimersByTimeAsync(1000)
    expect(cycles).toBe(3)

    stop()
    await vi.advanceTimersByTimeAsync(5000)
    expect(cycles).toBe(3) // no more cycles after stop
  })
})
