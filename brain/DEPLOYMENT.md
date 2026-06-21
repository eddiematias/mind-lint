# Brain Deployment & Upgrade Runbook

Single source of truth for how the brain runs in production and how to upgrade it
safely. Read this fully before any chunker/embedder change reaches the live index.

## Runtime topology

The brain SERVICE runs on the **Mac Mini** (always-on box), not the laptop:

- **Mac Mini (the runtime):**
  - Runs the **compiled `dist/cli.js`** (NOT `tsx src/`): a single launchd job,
    `com.eddie.brain-serve` (`node dist/cli.js serve`).
  - **Reindexing is IN-PROCESS.** serve runs a reindex cycle on startup and then every
    `server.reindexIntervalMs` (default 600000ms = 10 min). Each cycle does a best-effort
    `git pull` of the vault, then an incremental reindex. serve is therefore the **sole
    owner** of the single-writer PGLite DB; nothing else writes it.
  - Runs **Ollama** locally (the embedding model).
  - Holds the **PGLite index** (`brain/data/brain.pglite`, gitignored, ~50MB, purely
    derived and fully rebuildable).
- **Laptop (dev + client only):**
  - No always-on local runtime. It is a development box and an MCP client.
  - The Claude Code MCP config points at the Mini over **Tailscale**
    (`http://<mini>.<tailnet>.ts.net:8765/mcp`), so recall on the laptop hits the Mini's
    service and index.
  - A dev run on the laptop uses `npm run serve` / `npm run reindex` (which run `tsx
    src/`, reading source directly, no build needed there). That is dev only; the
    durable install is the Mini's `dist/`-based one.

> The key consequence: **editing `brain/src/*` does nothing on the Mini until the Mini
> pulls and `npm run build`s `dist/`, then serve is restarted.** A plain restart without a
> rebuild re-runs the old compiled code.

### History: why there is only one job now (in-process reindex)

The brain previously ran TWO launchd jobs: `com.eddie.brain-serve` and a separate
periodic `com.eddie.brain-reindex` (`node dist/cli.js reindex` every 10 min). That second
process could NOT persist to the DB while serve held it (PGLite is single-writer): it
logged a clean `indexed=0 skipped=all` with no error, yet its writes never reached the
served instance, so the live index silently froze at the last serve-stopped reindex.
PR #11 moved reindexing in-process (serve is the only writer) and **retired the periodic
job** (its plist is parked at `~/Library/LaunchAgents/disabled/com.eddie.brain-reindex.plist`,
recoverable but not loaded). If you ever see a second brain job in `launchctl list`, it
should not be there.

## Why a code change needs `npm run build` on the Mini

serve runs `node dist/cli.js`. `git pull` updates `src/` but not `dist/`. Until
`npm run build` recompiles `dist/`, a restart loads the stale binary AND serve's
in-process reindex loop keeps running the OLD code. So `npm run build` is **mandatory**
on the Mini after any `brain/src` change, followed by a serve restart.

## Why a chunker/embedder change forces a re-chunk (and why it's automatic)

The reindex skip cache is keyed on `sha256(CHUNKER_VERSION \0 embedder.id \0 raw-bytes)`.
A chunker change bumps `CHUNKER_VERSION` (in `src/chunker.ts`); an embedder swap changes
`embedder.id` (`ollama:<model>:<dimensions>`). Either changes every file's stored hash,
so the next reindex (the in-process cycle that runs on serve startup) re-chunks every
file automatically, no manual DB wipe. Before this cache fix, a chunker change that
re-serialized the same source produced `indexed=0 skipped=all` and silently did nothing
(see the Phase-2 deploy post-mortem).

If you ever need to force a rebuild regardless of the cache: `node dist/cli.js reindex
--force` (also `--full`), run with serve stopped (see "Manual / forced reindex" below).

## Correct upgrade procedure (code, chunker, or embedder change) on the Mini

Because reindexing is in-process, the upgrade is just **pull, build, restart serve**.
serve runs an initial reindex cycle on startup (best-effort `git pull` of the vault, then
incremental index), so the new code reaches the index with no separate reindex step.

```bash
# 1. Pull the new framework code.
cd ~/mind-lint && git pull origin main

# 2. Build -- MANDATORY: the service runs dist/, not src/.
cd ~/mind-lint/brain && npm install         # only if deps changed; usually a no-op
npm run build                               # recompile dist/cli.js with the new code

# 3. Restart serve (loads the new dist/ and runs an initial in-process reindex on boot).
launchctl bootout "gui/$(id -u)/<serve-job-label>"
launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/<serve-plist-filename>.plist
#   Find the job label:   launchctl list | grep -i brain   (expect ONLY com.eddie.brain-serve)
#   Find the plist file:  ls ~/Library/LaunchAgents/ | grep -i brain
#   NOTE: bootout takes the JOB LABEL (from launchctl list); bootstrap takes the PLIST
#   FILE PATH. The label and filename can differ -- confirm both before running.
```

**Correct ordering in one line:** `pull -> build -> restart serve`.

Confirm success in the serve log (`~/Library/Logs/brain-serve.log`): you should see
`[brain] in-process reindex every 600s` and a `[brain] reindex: indexed=... skipped=...`
line shortly after `brain serving on ...`. For a chunker/embedder change, that line should
show `indexed=<all files>` (see "Expected delta" below); for a plain code change with no
chunker bump, `skipped=all` is correct and expected.

## Manual / forced reindex (escape hatch)

For a deterministic full rebuild (`--force`) or any out-of-band reindex, run the CLI
directly. serve MUST be stopped first, because PGLite is single-writer and the running
serve process holds the DB:

```bash
launchctl bootout "gui/$(id -u)/<serve-job-label>"     # release the single-writer DB
cd ~/mind-lint/brain && node dist/cli.js reindex        # or: reindex --force
launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/<serve-plist-filename>.plist
```

Do NOT run `node dist/cli.js reindex` while serve is up: its writes will not persist to
the served instance (this is exactly the failure that retired the old periodic job).

## Expected delta (how to confirm success vs. the silent-skip failure)

After a chunker/embedder change, the reindex line (in the serve log, or the CLI output of
a manual run) should show:

```
indexed=<all files> skipped=0 removed=0 chunks=<n> chunker=<version> embedder=<id>
```

- `indexed=<all files>` (NOT `0`) -- every file was re-chunked because the version-keyed
  hash changed.
- `chunker=` / `embedder=` print the active versions for observability (CLI output only;
  the in-process log line prints `indexed/skipped/removed/chunks`).

**Red flag:** `indexed=0 skipped=<all>` immediately after a *chunker/embedder* change means
the new code did NOT reach the index:

- **First deploy of the cache fix:** the re-chunk is forced by the key formula itself (it
  folds in `CHUNKER_VERSION` + `embedder.id` + `\0` framing). If you still see
  `indexed=0 skipped=all`, the `dist/` was not rebuilt or the pull was not applied, check
  `npm run build` ran and `git log` shows the new commit.
- **Subsequent upgrades:** `indexed=0 skipped=all` after a serialization change means the
  `CHUNKER_VERSION` digit was not bumped. Bump it in `src/chunker.ts` and reindex again.

Note: for a plain code change that does NOT touch the chunker/embedder, `indexed=0
skipped=all` is the CORRECT, healthy result (nothing to re-chunk). Edge derivation and
other index-time passes still run unconditionally on every cycle.

## Recovery: full rebuild from scratch

If the index is corrupt or you want a clean slate (the DB is purely derived):

```bash
cd ~/mind-lint/brain
launchctl bootout "gui/$(id -u)/<serve-job-label>"      # release the single-writer DB
rm -rf data/brain.pglite                                # gitignored, fully rebuildable
node dist/cli.js reindex                                # rebuilds everything (serve stopped)
launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/<serve-plist-filename>.plist
```

(Alternatively, after `rm -rf data/brain.pglite`, just restart serve and let its initial
in-process cycle rebuild from scratch.)

---

**Operator note:** the exact launchd job label, plist filename, and the vault/repo paths
on the Mini (`~/mind-lint`, `~/mind-lint-vault`) live outside the repo. Substitute the real
values using both discovery commands: `launchctl list | grep -i brain` (reveals the job
label, used by `bootout`; expect ONLY `com.eddie.brain-serve`) and `ls ~/Library/LaunchAgents/
| grep -i brain` (reveals the plist filename, used by `bootstrap`). The label and the
filename can differ. Confirm the actual label, plist path, and repo paths with the Mini's
launchd config before running any upgrade.
