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

> **Production / upgrades:** the durable install runs the compiled `dist/` under launchd on the Mac Mini. See [`DEPLOYMENT.md`](DEPLOYMENT.md) for the runtime topology and the correct upgrade procedure for a chunker/embedder change (build is mandatory; pause the reindex job; force/auto re-chunk).

## Separate box (e.g. a Mac Mini), reached securely over Tailscale

Run the service on the box but keep it on loopback and front it with Tailscale Serve
(HTTPS, tailnet-only) plus an app-level bearer token. Do NOT bind to `0.0.0.0`: that
exposes the endpoint to the box's whole LAN/Wi-Fi unauthenticated.

`serve` fails closed: with no `authToken` set it REFUSES to start (exit 1) unless you
set `BRAIN_ALLOW_NO_AUTH=1`. So fronting the service with `tailscale serve` is always
authenticated unless you have deliberately opted out. Generate a token and chmod the
config so other users on the box cannot read it:

On the box:

```bash
# 1. Keep the bind on loopback (the default). Generate a token and store it in the
#    gitignored brain.config.json (PREFERRED over the launchd plist env, which other
#    processes in the session can read):
openssl rand -hex 32                     # copy the output into server.authToken
# brain.config.json: { ..., "server": { "host": "127.0.0.1", "port": 8765, "authToken": "<token>" } }
chmod 600 brain.config.json              # restrict the token at rest to your user

npm run serve                            # logs "(bearer auth required)"; refuses to start with no token

# 2. Expose it on the tailnet only, as HTTPS, with a real .ts.net cert (Tailscale v1.98.5):
tailscale serve --bg --https=443 http://127.0.0.1:8765
#    New endpoint: https://<box>.<tailnet>.ts.net/mcp  (port 443)
tailscale serve status                   # confirm the mapping; no stale entries
```

Enable with `tailscale serve --bg --https=443 http://127.0.0.1:8765`; to remove the
mapping run `tailscale serve reset` (tears down all serve mappings). This is the syntax
for Tailscale v1.98.5; if your version differs, confirm with `tailscale serve --help`
(older docs show the positional `tailscale serve --bg https / <target>` enable form and
`tailscale serve --https=443 off` to disable). Always `tailscale serve status` after a
change to confirm no stale mapping is left behind.

From your laptop (or any of your tailnet devices), register the MCP server with the
HTTPS endpoint AND the auth header:

```bash
claude mcp add --transport http mind-lint-brain \
  https://<box>.<tailnet>.ts.net/mcp \
  --header "Authorization: Bearer <token>"
```

Verify: `curl -sS https://<box>.<tailnet>.ts.net/mcp -X POST -d '{}'` returns **401**
without the header, and a normal MCP response with `-H "Authorization: Bearer <token>"`.
On the box, `lsof -nP -iTCP:8765 -sTCP:LISTEN` should show it bound to `127.0.0.1` only.

Keep the box's index fresh by pulling the vault repo + reindexing on a schedule (cron):

```bash
cd /path/to/vault && git pull && (cd brain && npm run reindex)
```

## Token rotation + at-rest

To rotate the bearer token:

1. Generate a new one on the box: `openssl rand -hex 32`.
2. Update `server.authToken` in the Mini's gitignored `brain.config.json` (or the
   `BRAIN_AUTH_TOKEN` launchd env), keeping `chmod 600` on the file.
3. Restart the serve job so it picks up the new token.
4. Re-register the laptop with the new token (`claude mcp remove mind-lint-brain` then
   `claude mcp add ... --header "Authorization: Bearer <new-token>"`). Until you do,
   the laptop will get `401`s, that is expected and confirms the old token is dead.

At-rest: the token is a NETWORK boundary, not a process boundary. Any local process on
the box that can read `brain.config.json` or the launchd env can authenticate, so the
threat model assumes a single-user, trusted-local box. `chmod 600` and preferring the
config file over the plist env reduce incidental exposure. On the laptop, the token
lives in `~/.claude.json`; FileVault (full-disk encryption) is the real at-rest control
there.

## Anywhere (Tailscale)

See "Separate box ... reached securely over Tailscale" above: bind to loopback, front
with `tailscale serve` (HTTPS on the tailnet), require a bearer token. For the full
production topology and upgrade procedure on the Mac Mini, see [`DEPLOYMENT.md`](DEPLOYMENT.md).

## Config knobs

- `embedder`: local Ollama (default) or point at an API provider.
- `reranker.enabled`: local cross-encoder rerank (default true) or RRF-only (false).
- `scopeGlobs`: which vault paths get indexed.
- `server.authToken`: when set, the MCP endpoint requires `Authorization: Bearer <token>` on every request. `serve` FAILS CLOSED: with no token set it refuses to start unless `BRAIN_ALLOW_NO_AUTH=1` is set (the explicit escape hatch for purely-local/no-Serve use). The token is a secret: put it in the gitignored `brain.config.json` (then `chmod 600` it) or the `BRAIN_AUTH_TOKEN` env var, NEVER in a committed file. Generate one with `openssl rand -hex 32`.
- **Env vars** (highest precedence, override `brain.config.json`): `BRAIN_HOST`, `BRAIN_PORT`, `BRAIN_AUTH_TOKEN`. Also `BRAIN_ALLOW_NO_AUTH=1` to opt into running with no auth. Prefer the gitignored `brain.config.json` over the launchd plist `EnvironmentVariables` for the token: plist env is readable by other processes in the session.
