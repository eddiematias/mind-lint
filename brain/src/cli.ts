import { readFile } from 'node:fs/promises'
import { resolve, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadConfig, requireVaultRoot, serveAuthError } from './config.js'
import type { BrainConfig } from './types.js'
import { openDb, initSchema, setMeta } from './db.js'
import { OllamaEmbedder } from './embedder.js'
import { AnthropicChatClient } from './chat.js'
import { CHUNKER_VERSION } from './chunker.js'
import { makeReranker } from './reranker.js'
import { indexVault } from './indexer.js'
import { createMcpHttpServer } from './server.js'
import { pullVault, startReindexLoop } from './reindex-loop.js'
import { runFactsCycle } from './dream-cycle.js'
import { restampValidFrom, applyConfirmedSupersessions, runSupersessionProbe } from './facts/supersession.js'
import { gitCommitAndPush } from './git.js'
import fg from 'fast-glob'
import { parseFactsFile, type Fact } from './facts/markdown.js'
import { staleFacts, parseStaleArgs } from './facts/freshness.js'
import { captureSource, parseCaptureArgs } from './sources/capture.js'
import { loadGoldSet } from './eval/gold.js'
import { runEval, runCompare, parseEvalArgs, formatReport, formatCompareReport } from './eval/run.js'
import { runLabelEdges } from './eval/label.js'
import { DEFAULT_GRAPH_ARM } from './graph-arm.js'

// brain/ is symlinked into the vault from the public clone, so Node resolves
// import.meta.url to the CLONE's real path, not the vault. That's fine for locating
// brain.config.json and the db (they live next to the code in the clone). But it
// means vaultRoot CANNOT be inferred from this file's location and must be set
// explicitly in brain.config.json.
function brainDir(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..')
}

async function readConfig(): Promise<BrainConfig> {
  let raw: Partial<BrainConfig> = {}
  try { raw = JSON.parse(await readFile(resolve(brainDir(), 'brain.config.json'), 'utf8')) } catch { /* defaults */ }
  return loadConfig(raw, requireVaultRoot(raw)) // requireVaultRoot throws a clear error if vaultRoot is unset
}

async function main() {
  const cmd = process.argv[2]
  const cfg = await readConfig()
  const embedder = new OllamaEmbedder(cfg.embedder)

  if (cmd === 'reindex') {
    // DB is only needed for reindex and serve; open it here, not at the top of main.
    const db = await openDb(resolve(brainDir(), cfg.dbPath))
    await initSchema(db, cfg.embedder.dimensions)
    const force = process.argv.includes('--force') || process.argv.includes('--full')
    const res = await indexVault(db, embedder, { vaultRoot: cfg.vaultRoot, scopeGlobs: cfg.scopeGlobs, force })
    await setMeta(db, 'chunker_version', CHUNKER_VERSION)
    await setMeta(db, 'embedder_id', embedder.id)
    console.log(
      `indexed=${res.filesIndexed} skipped=${res.filesSkipped} removed=${res.filesRemoved} chunks=${res.chunksWritten} ` +
        `chunker=${CHUNKER_VERSION} embedder=${embedder.id}${force ? ' (forced)' : ''}`,
    )
    process.exit(0)
  }

  if (cmd === 'serve') {
    // DB is only needed for reindex and serve; open it here, not at the top of main.
    const db = await openDb(resolve(brainDir(), cfg.dbPath))
    await initSchema(db, cfg.embedder.dimensions)
    const reranker = makeReranker(cfg.reranker)
    const { host, port, authToken } = cfg.server
    const allowNoAuth = process.env.BRAIN_ALLOW_NO_AUTH === '1'
    const err = serveAuthError(authToken, allowNoAuth)
    if (err) {
      console.error(`[brain] ${err}`)
      process.exit(1) // fail closed (R-C1)
    }
    const http = createMcpHttpServer(db, embedder, reranker, { authToken, graphArm: cfg.retrieval?.graphArm })
    const mode = authToken ? ' (bearer auth required)' : ' (NO AUTH, BRAIN_ALLOW_NO_AUTH=1)'
    http.listen(port, host, () => console.log(`brain serving on http://${host}:${port}/mcp${mode}`))

    // In-process reindex (single DB owner). PGlite is single-writer, so a SEPARATE periodic
    // reindex process cannot persist while serve holds the DB; reindexing here makes serve the
    // only writer and removes that conflict (retire any external reindex cron). The cycle pulls
    // the vault then reindexes; both are guarded so a failure never crashes serve.
    const reindexIntervalMs = cfg.server.reindexIntervalMs ?? 600_000
    if (reindexIntervalMs > 0) {
      const runCycle = async () => {
        const pull = await pullVault(cfg.vaultRoot)
        if (!pull.ok) console.error(`[brain] vault pull failed (reindexing existing content anyway): ${pull.output}`)
        const res = await indexVault(db, embedder, { vaultRoot: cfg.vaultRoot, scopeGlobs: cfg.scopeGlobs })
        await setMeta(db, 'chunker_version', CHUNKER_VERSION)
        await setMeta(db, 'embedder_id', embedder.id)
        console.log(
          `[brain] reindex: indexed=${res.filesIndexed} skipped=${res.filesSkipped} removed=${res.filesRemoved} chunks=${res.chunksWritten}`,
        )
      }
      startReindexLoop({ intervalMs: reindexIntervalMs, runCycle, onError: (e) => console.error('[brain] reindex cycle error:', e) })
      console.log(`[brain] in-process reindex every ${Math.round(reindexIntervalMs / 1000)}s`)
    }
    return
  }

  if (cmd === 'dream') {
    const facts = cfg.dreamCycle?.facts
    if (!facts?.enabled) {
      console.log('[brain] dream: facts cycle disabled (dreamCycle.facts.enabled=false)')
      process.exit(0)
    }
    const apiKey = process.env[facts.apiKeyEnv]
    if (!apiKey) {
      console.log(`[brain] dream: ${facts.apiKeyEnv} not set, skipping facts cycle`)
      process.exit(0)
    }
    const chat = new AnthropicChatClient({ model: facts.model, apiKey, maxTokens: facts.maxTokens })
    const now = new Date().toLocaleDateString('en-CA')
    const proposalsPath = resolve(cfg.vaultRoot, 'memory/facts/_supersession-proposals.md')
    const decisionsPath = resolve(cfg.vaultRoot, 'memory/facts/_supersession-decisions.md')

    // Phase A+B: pull, re-stamp valid_from, apply confirmed supersessions (cycle = sole fact-file writer).
    await pullVault(cfg.vaultRoot)
    const restamp = await restampValidFrom(cfg.vaultRoot)
    const applyRes = await applyConfirmedSupersessions({ vaultRoot: cfg.vaultRoot, proposalsPath, decisionsPath })
    if (restamp.filesChanged > 0 || applyRes.applied + applyRes.stale + applyRes.reverted > 0) {
      await gitCommitAndPush(cfg.vaultRoot, `supersession: restamp ${restamp.filesChanged} apply ${applyRes.applied} stale ${applyRes.stale} reverted ${applyRes.reverted} ${now}`)
    }

    // Phase C: facts extraction (slice 3, commits + advances watermark internally).
    const res = await runFactsCycle({
      vaultRoot: cfg.vaultRoot,
      scopeGlobs: cfg.scopeGlobs,
      chat,
      embedder,
      cosineThreshold: facts.cosineThreshold,
      maxFactsPerFile: facts.maxFactsPerFile,
      watermarkPath: resolve(brainDir(), 'data/last-cycle-commit'),
      now,
    })
    console.log(`[brain] dream: scanned=${res.filesScanned} facts+=${res.factsWritten} chatCalls=${res.chatCalls} skipped=${res.skipped}`)

    // Phase E: supersession probe (gate-tier; appends proposals, writes no fact file), then commit.
    const sup = cfg.dreamCycle?.supersession
    if (sup?.enabled) {
      const probe = await runSupersessionProbe({
        vaultRoot: cfg.vaultRoot, chat, embedder,
        cachePath: resolve(brainDir(), 'data/facts-vectors.json'),
        proposalsPath, decisionsPath,
        neighborLo: sup.neighborLo, neighborHi: sup.neighborHi, maxPairsPerRun: sup.maxPairsPerRun, now,
      })
      await gitCommitAndPush(cfg.vaultRoot, `supersession: ${probe.proposed} candidate(s) ${now}`)
      console.log(`[brain] dream: supersession judged=${probe.judged} proposed=${probe.proposed} capped=${probe.capped} skipped=${probe.skipped}`)
    }
    process.exit(0)
  }

  if (cmd === 'sources') {
    const sub = process.argv[3]
    if (sub === 'capture') {
      const parsed = parseCaptureArgs(process.argv.slice(4))
      if (!parsed) {
        console.error('usage: brain sources capture <url> [--why "..."] [--tags a,b]')
        process.exit(1)
      }
      const now = new Date().toLocaleDateString('en-CA')
      const res = await captureSource(parsed.url, { vaultRoot: cfg.vaultRoot, why: parsed.why, tags: parsed.tags, now })
      console.log(`[brain] sources: ${res.created ? 'captured' : 'updated'} ${res.item.platform}${res.item.itemId ? ' ' + res.item.itemId : ''} og=${res.item.ogFetchStatus} -> ${res.path}`)
      process.exit(0)
    }
    console.error('usage: brain sources <capture>')
    process.exit(1)
  }

  if (cmd === 'facts') {
    const sub = process.argv[3]
    if (sub === 'stale') {
      const args = parseStaleArgs(process.argv.slice(4))
      const below = args.below ?? 0.25
      const asOf = args.asof ?? new Date().toLocaleDateString('en-CA')
      const files = await fg('memory/facts/*.md', { cwd: cfg.vaultRoot, dot: true })
      const facts: Fact[] = []
      for (const rel of files) {
        if (basename(rel).startsWith('_supersession')) continue // skip ledger files
        try { facts.push(...parseFactsFile(await readFile(resolve(cfg.vaultRoot, rel), 'utf8'))) } catch { /* skip unparseable */ }
      }
      const rows = staleFacts(facts, asOf, below)
      for (const r of rows) {
        console.log(`${r.freshness.toFixed(2)}  age=${r.ageDays}d  conf=${r.confidence.toFixed(2)}  ${r.kind}  ${r.sourcePath}  ${r.claim}`)
      }
      console.log(`[brain] ${rows.length} fact(s) below freshness ${below} as of ${asOf} (review for relevance; retire via the forget/supersede flow)`)
      process.exit(0)
    }
    console.error('usage: brain facts <stale>')
    process.exit(1)
  }

  if (cmd === 'eval') {
    const sub = process.argv[3]
    const args = parseEvalArgs(process.argv.slice(3))
    const goldPath = args.gold ? resolve(args.gold) : resolve(brainDir(), 'evals/gold-retrieval.jsonl')
    const k = args.k ?? 8
    const floor = args.floor ?? (process.env.BRAIN_EVAL_RECALL_FLOOR ? Number(process.env.BRAIN_EVAL_RECALL_FLOOR) : 0.85)
    const db = await openDb(resolve(brainDir(), cfg.dbPath))
    await initSchema(db, cfg.embedder.dimensions)
    const reranker = makeReranker(cfg.reranker)
    const gold = await loadGoldSet(goldPath)
    const rerankerLabel = cfg.reranker.enabled ? cfg.reranker.model : 'noop'
    if (sub === 'label-edges') {
      await runLabelEdges({ db, embedder, reranker, gold, k })
      process.exit(0)
    }
    if (args.compareGraphArm) {
      const result = await runCompare({ db, embedder, reranker, gold, k, rerankerLabel, graphArm: { ...DEFAULT_GRAPH_ARM, ...cfg.retrieval?.graphArm, enabled: true } })
      console.log(formatCompareReport(result))
      process.exit(0)
    }
    const result = await runEval({ db, embedder, reranker, gold, k, floor, rerankerLabel })
    console.log(formatReport(result))
    process.exit(result.pass ? 0 : 1)
  }

  console.error('usage: brain <reindex|serve|dream|sources|facts|eval>')
  process.exit(1)
}

main().catch((e) => { console.error(e); process.exit(1) })
