# Brain Deployment & Upgrade Runbook

Single source of truth for how the brain runs in production and how to upgrade it
safely. Read this fully before any chunker/embedder change reaches the live index.

## Runtime topology

The brain SERVICE runs on the **Mac Mini** (always-on box), not the laptop:

- **Mac Mini (the runtime):**
  - Runs the **compiled `dist/cli.js`** (NOT `tsx src/`): a launchd serve job
    (`node dist/cli.js serve`) and a separate periodic reindex job (`node dist/cli.js
    reindex`) on a ~10-minute cron/launchd interval.
  - Runs **Ollama** locally (the embedding model).
  - Holds the **PGLite index** (`brain/data/brain.pglite`, gitignored, ~50MB, purely
    derived and fully rebuildable).
  - **Vault content syncs to the Mini via `git`** (a pull job keeps the indexed content
    fresh; the index is rebuilt incrementally by the reindex job).
- **Laptop (dev + client only):**
  - No always-on local runtime. It is a development box and an MCP client.
  - The Claude Code MCP config points at the Mini over **Tailscale**
    (`http://<mini>.<tailnet>.ts.net:8765/mcp`), so recall on the laptop hits the Mini's
    service and index.
  - A dev run on the laptop uses `npm run serve` / `npm run reindex` (which run `tsx
    src/`, reading source directly -- no build needed there). That is dev only; the
    durable install is the Mini's `dist/`-based one.

> The key consequence: **editing `brain/src/*` does nothing on the Mini until the Mini
> pulls and `npm run build`s `dist/`.** A plain restart re-runs the old compiled code.

## Why a code change needs `npm run build` on the Mini

Both Mini jobs run `node dist/cli.js`. `git pull` updates `src/` but not `dist/`. Until
`npm run build` recompiles `dist/`, a restart loads the stale binary AND the periodic
reindex job keeps re-indexing with the OLD code on its next tick. So `npm run build` is
**mandatory** on the Mini after any `brain/src` change.

## Why a chunker/embedder change forces a re-chunk (and why it's now automatic)

The reindex skip cache is keyed on `sha256(CHUNKER_VERSION \0 embedder.id \0 raw-bytes)`.
A chunker change bumps `CHUNKER_VERSION` (in `src/chunker.ts`); an embedder swap changes
`embedder.id` (`ollama:<model>:<dimensions>`). Either changes every file's stored hash,
so the next reindex re-chunks every file automatically -- no manual DB wipe. Before this
fix, a chunker change that re-serialized the same source produced `indexed=0 skipped=all`
and silently did nothing (see the Phase-2 deploy post-mortem).

If you ever need to force a rebuild regardless of the cache: `node dist/cli.js reindex
--force` (also `--full`).

## Correct upgrade procedure (chunker or embedder change) on the Mini

Ordering matters. PGLite is **single-writer**, so a reindex cannot run while the serve
job holds the DB, and the periodic reindex job must not run with the old binary mid-upgrade.

```bash
# 1. Pull the new framework code (and let the vault content pull job catch up, or pull it).
cd ~/mind-lint && git pull origin main
cd ~/mind-lint-vault && git pull            # vault content the brain indexes

# 2. Build -- MANDATORY: the service runs dist/, not src/.
cd ~/mind-lint/brain && npm install         # only if deps changed; usually a no-op
npm run build                               # recompile dist/cli.js with the new code

# 3. STOP both launchd jobs (serve + periodic reindex). This releases the single-writer
#    DB and stops the 10-minute job from indexing with the old/new binary mid-upgrade.
launchctl bootout "gui/$(id -u)/<serve-job-label>"
launchctl bootout "gui/$(id -u)/<reindex-job-label>"
#   Find the job labels:   launchctl list | grep -i brain
#   Find the plist files:  ls ~/Library/LaunchAgents/ | grep -i brain
#   NOTE: bootout takes the JOB LABEL (from launchctl list); bootstrap (step 5) takes
#   the PLIST FILE PATH. The label and filename can differ -- confirm both before running.

# 4. Reindex. With the version-keyed cache this auto-re-chunks every file; --force is the
#    belt-and-suspenders full rebuild if you want to be certain.
node dist/cli.js reindex
#   (or: node dist/cli.js reindex --force)

# 5. Restart both jobs.
launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/<serve-job-label>.plist
launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/<reindex-job-label>.plist
```

**Correct ordering in one line:** `pull -> build -> stop jobs -> reindex -> restart jobs`.

## Expected delta (how to confirm success vs. the silent-skip failure)

After a chunker/embedder change, the reindex output line should show:

```
indexed=<all files> skipped=0 removed=0 chunks=<n> chunker=<version> embedder=<id>
```

- `indexed=<all files>` (NOT `0`) -- every file was re-chunked because the version-keyed
  hash changed.
- `chunker=` / `embedder=` print the active versions for observability.

**Red flag:** `indexed=0 skipped=<all>` immediately after a code change means the new code
did NOT reach the index. The cause depends on which deploy this is:

- **First deploy of this fix:** the re-chunk is forced by the new key formula itself (the
  key now folds in `CHUNKER_VERSION` + `embedder.id` + `\0` framing, so every stored hash
  differs from the old `sha256(raw)`-only hash regardless of the version digit). If you
  still see `indexed=0 skipped=all` on the first deploy, the `dist/` was not rebuilt or
  the pull was not applied -- check `npm run build` ran and `git log` shows the new commit.
  A missing `CHUNKER_VERSION` bump is NOT the cause on this first deploy.
- **Subsequent upgrades (once hashes are already version-keyed):** `indexed=0 skipped=all`
  after a serialization change means the `CHUNKER_VERSION` digit was not bumped. Bump it
  in `src/chunker.ts` and reindex again.

## Recovery: full rebuild from scratch

If the index is corrupt or you want a clean slate (the DB is purely derived):

```bash
cd ~/mind-lint/brain
launchctl bootout "gui/$(id -u)/<serve-job-label>"      # release the single-writer DB
launchctl bootout "gui/$(id -u)/<reindex-job-label>"
rm -rf data/brain.pglite                                # gitignored, fully rebuildable
node dist/cli.js reindex                                # rebuilds everything
launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/<serve-job-label>.plist
launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/<reindex-job-label>.plist
```

---

**Operator note:** the exact launchd job labels, plist filenames, and the vault/repo paths
on the Mini (`~/mind-lint`, `~/mind-lint-vault`) live outside the repo. Substitute the real
values using both discovery commands: `launchctl list | grep -i brain` (reveals the job
labels, used by `bootout`) and `ls ~/Library/LaunchAgents/ | grep -i brain` (reveals the
plist filenames, used by `bootstrap`). The label and the filename can differ. Confirm the
actual labels, plist paths, and repo paths with the Mini's launchd config before running
any upgrade.
