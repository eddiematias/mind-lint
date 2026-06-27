// brain/tests/config.test.ts
import { describe, it, expect, afterEach } from 'vitest'
import { loadConfig, requireVaultRoot, serveAuthError } from '../src/config.js'

describe('loadConfig', () => {
  it('applies defaults when given an empty object', () => {
    const cfg = loadConfig({}, '/vault')
    expect(cfg.vaultRoot).toBe('/vault')
    expect(cfg.embedder.type).toBe('ollama')
    expect(cfg.embedder.model).toBe('nomic-embed-text')
    expect(cfg.embedder.dimensions).toBe(768)
    expect(cfg.reranker.enabled).toBe(true)
    expect(cfg.server.port).toBe(8765)
    expect(cfg.scopeGlobs).toContain('memory/**/*.md')
  })

  it('lets overrides win over defaults', () => {
    const cfg = loadConfig({ reranker: { enabled: false, model: 'x' }, server: { host: '0.0.0.0', port: 9000 } }, '/v')
    expect(cfg.reranker.enabled).toBe(false)
    expect(cfg.server.port).toBe(9000)
    expect(cfg.embedder.model).toBe('nomic-embed-text') // untouched default
  })

  it('requireVaultRoot throws when vaultRoot is missing', () => {
    expect(() => requireVaultRoot({})).toThrow(/vaultRoot/)
  })

  it('requireVaultRoot returns the path when present', () => {
    expect(requireVaultRoot({ vaultRoot: '/v' })).toBe('/v')
  })
})

describe('loadConfig server block precedence', () => {
  const saved = { ...process.env }
  afterEach(() => { process.env = { ...saved } })

  it('BRAIN_AUTH_TOKEN env wins over file server.authToken', () => {
    process.env.BRAIN_AUTH_TOKEN = 'envtok'
    const cfg = loadConfig({ server: { host: '127.0.0.1', port: 8765, authToken: 'filetok' } }, '/tmp/v')
    expect(cfg.server.authToken).toBe('envtok')
  })

  it('with no env var set, the file server.authToken is used', () => {
    delete process.env.BRAIN_AUTH_TOKEN
    const cfg = loadConfig({ server: { host: '127.0.0.1', port: 8765, authToken: 'filetok' } }, '/tmp/v')
    expect(cfg.server.authToken).toBe('filetok')
  })
})

describe('dreamCycle config (slice 3)', () => {
  it('defaults facts.enabled to false and fills defaults', () => {
    const cfg = loadConfig({}, '/tmp/vault')
    expect(cfg.dreamCycle?.facts.enabled).toBe(false)
    expect(cfg.dreamCycle?.facts.model).toBe('claude-haiku-4-5')
    expect(cfg.dreamCycle?.facts.apiKeyEnv).toBe('ANTHROPIC_API_KEY')
    expect(cfg.dreamCycle?.facts.cosineThreshold).toBeCloseTo(0.95)
  })
  it('merges user overrides over defaults', () => {
    const cfg = loadConfig({ dreamCycle: { facts: { enabled: true, model: 'claude-haiku-4-5' } } } as never, '/tmp/vault')
    expect(cfg.dreamCycle?.facts.enabled).toBe(true)
    expect(cfg.dreamCycle?.facts.maxFactsPerFile).toBe(20) // default still applied
  })
})

describe('serveAuthError (fail-closed serve guard)', () => {
  it('errors when no token and no escape hatch (serve must refuse)', () => {
    expect(serveAuthError(undefined, false)).toBeTypeOf('string')
  })
  it('allows serve when a token is configured', () => {
    expect(serveAuthError('tok', false)).toBeNull()
  })
  it('allows serve with no token ONLY when BRAIN_ALLOW_NO_AUTH=1 (escape hatch)', () => {
    expect(serveAuthError(undefined, true)).toBeNull()
  })
})
