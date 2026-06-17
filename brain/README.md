# Mind-Lint Brain (Phase 1)

Local semantic index + hybrid retrieval over the vault. Returns cited evidence; Claude synthesizes.

## Setup (same machine, default)

```bash
cd brain
npm install
ollama pull nomic-embed-text     # requires a recent Ollama (uses /api/embed): https://ollama.com
cp brain.config.example.json brain.config.json
# edit brain.config.json: set "vaultRoot" to the full absolute path of your vault
# (JSON does not expand ~, so use /Users/you/.claude, not ~/.claude)
npm run reindex
npm run serve
claude mcp add --transport http mind-lint-brain http://127.0.0.1:8765/mcp
```

> `brain/` ships inside the mind-lint framework clone and is symlinked to `~/.claude/brain` on install. Run these commands from the clone's `brain/` (or the symlink). `vaultRoot` in `brain.config.json` is what points the indexer at your content, so the service does not need to sit inside the vault.

## Separate box (e.g. a Mac Mini)

Run the service on the box. Set `server.host` to `0.0.0.0` in `brain.config.json`. From your laptop:

```bash
claude mcp add --transport http mind-lint-brain http://<box-lan-ip>:8765/mcp
```

Keep the box's index fresh by pulling the vault repo + reindexing on a schedule (cron):

```bash
cd /path/to/vault && git pull && (cd brain && npm run reindex)
```

## Anywhere (Tailscale)

Install Tailscale on the box and your laptop. Use the box's Tailscale hostname in the MCP URL:

```bash
claude mcp add --transport http mind-lint-brain http://<box>.<tailnet>.ts.net:8765/mcp
```

## Config knobs

- `embedder`: local Ollama (default) or point at an API provider.
- `reranker.enabled`: local cross-encoder rerank (default true) or RRF-only (false).
- `scopeGlobs`: which vault paths get indexed.
