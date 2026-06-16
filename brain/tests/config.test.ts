// brain/tests/config.test.ts
import { describe, it, expect } from 'vitest'
import { loadConfig, requireVaultRoot } from '../src/config.js'

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
