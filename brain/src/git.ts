import { exec } from 'node:child_process'
import { promisify } from 'node:util'

const execAsync = promisify(exec)

async function tryRun(cmd: string, cwd: string): Promise<{ ok: boolean; out: string }> {
  try {
    const { stdout, stderr } = await execAsync(cmd, { cwd, timeout: 60_000 })
    return { ok: true, out: `${stdout}${stderr}`.trim() }
  } catch (e) {
    return { ok: false, out: e instanceof Error ? e.message : String(e) }
  }
}

export async function gitHead(cwd: string): Promise<{ ok: boolean; sha: string; output: string }> {
  const r = await tryRun('git rev-parse HEAD', cwd)
  return { ok: r.ok, sha: r.ok ? r.out.trim() : '', output: r.out }
}

// Returns files changed between sinceSha and headSha. When sinceSha is null
// (first-run sentinel) returns ok:true with an empty files list; the caller
// treats null-since as "whole allowlist applies."
export async function gitChangedFiles(
  cwd: string,
  sinceSha: string | null,
  headSha: string,
): Promise<{ ok: boolean; files: string[]; output: string }> {
  if (!sinceSha) return { ok: true, files: [], output: '' }
  const r = await tryRun(`git diff --name-only ${sinceSha} ${headSha}`, cwd)
  if (!r.ok) return { ok: false, files: [], output: r.out }
  return {
    ok: true,
    files: r.out.split('\n').map((s) => s.trim()).filter(Boolean),
    output: r.out,
  }
}

// Commit + push memory/facts changes. fetch+rebase first to avoid a non-fast-forward
// push against a concurrent remote write. Two attempts; aborts a conflicted rebase so
// the working tree is never left mid-rebase. Tolerates no-upstream and rejected push.
export async function gitCommitAndPush(cwd: string, message: string): Promise<{ ok: boolean; output: string }> {
  const log: string[] = []
  for (let attempt = 0; attempt < 2; attempt++) {
    await tryRun('git fetch --quiet', cwd)
    const rebase = await tryRun('git rebase --quiet @{u}', cwd)
    if (!rebase.ok) {
      const aborted = await tryRun('git rebase --abort', cwd)
      log.push(rebase.out, aborted.out)
      if (/conflict|could not apply/i.test(rebase.out)) {
        return { ok: false, output: log.join('\n') }
      }
    }
    await tryRun('git add -A memory/facts', cwd)
    const status = await tryRun('git status --porcelain memory/facts', cwd)
    if (status.ok && status.out.trim() === '') return { ok: true, output: 'nothing to commit' }
    const commit = await tryRun(`git commit -q -m ${JSON.stringify(message)}`, cwd)
    log.push(commit.out)
    const push = await tryRun('git push --quiet', cwd)
    log.push(push.out)
    if (push.ok) return { ok: true, output: log.filter(Boolean).join('\n') }
  }
  return { ok: false, output: log.filter(Boolean).join('\n') }
}
