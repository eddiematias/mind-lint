import { exec } from 'node:child_process'
import { promisify } from 'node:util'

const execAsync = promisify(exec)

// Best-effort `git pull` of the vault content the brain indexes. NEVER throws: a
// network blip, an auth prompt, or a non-git vaultRoot must not stop the in-process
// reindex from running over the already-synced content. Returns ok=false + the error
// text so the caller can log it and continue.
export async function pullVault(vaultRoot: string): Promise<{ ok: boolean; output: string }> {
  try {
    const { stdout, stderr } = await execAsync('git pull --quiet', { cwd: vaultRoot, timeout: 60_000 })
    return { ok: true, output: `${stdout}${stderr}`.trim() }
  } catch (e) {
    return { ok: false, output: e instanceof Error ? e.message : String(e) }
  }
}

// Wraps an async fn so that (1) an invocation arriving while a previous one is still
// running is SKIPPED rather than stacked (a slow reindex must not pile up behind the
// timer), and (2) a thrown error is swallowed and reported via onError rather than
// propagated (a failed reindex tick must NEVER crash the always-on serve process).
// Returns whether the wrapped fn actually ran to completion this call.
export function makeGuardedTick(
  fn: () => Promise<void>,
  onError?: (e: unknown) => void,
): () => Promise<boolean> {
  let running = false
  return async () => {
    if (running) return false
    running = true
    try {
      await fn()
      return true
    } catch (e) {
      onError?.(e)
      return false
    } finally {
      running = false
    }
  }
}

export interface ReindexLoopDeps {
  intervalMs: number
  runCycle: () => Promise<void> // pull + indexVault + setMeta, composed by the caller (which owns db/embedder/cfg)
  onError?: (e: unknown) => void
}

// Starts an in-process reindex loop: runs one cycle immediately on startup (so a fresh
// serve catches up on anything changed while it was down), then every intervalMs. The
// tick is guarded (no overlap, no crash-on-error). Because this runs INSIDE the serve
// process, it is the single owner of the single-writer PGlite DB; there is no separate
// reindex process to conflict with it. Returns stop() to clear the interval (tests, shutdown).
export function startReindexLoop(deps: ReindexLoopDeps): () => void {
  const tick = makeGuardedTick(deps.runCycle, deps.onError)
  void tick() // initial catch-up run
  const handle = setInterval(() => { void tick() }, deps.intervalMs)
  if (typeof (handle as { unref?: () => void }).unref === 'function') {
    (handle as { unref: () => void }).unref() // don't keep the event loop alive on this timer alone
  }
  return () => clearInterval(handle)
}
