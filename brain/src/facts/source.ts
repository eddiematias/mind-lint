import { basename } from 'node:path'

// Facts may be extracted from ANY indexed prose INCLUDING entity pages (an entity's own
// profile is a prime fact source). Excludes: the agent-owned facts store (self-loop),
// underscore-prefixed agent artifacts, and _index.md rosters.
// This is the deliberate inverse of indexer.isDerivationSource for entity pages (R-I3).
export function isFactSource(rel: string): boolean {
  if (rel.startsWith('memory/facts/')) return false
  if (basename(rel).startsWith('_')) return false
  return true
}

export function slugForEntity(entityBasename: string): string {
  return entityBasename
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// entityLabel is a wikilink like '[[Amara Markovic]]' or null.
export function factFilePath(entityLabel: string | null): string {
  if (!entityLabel) return 'memory/facts/_general.md'
  const base = entityLabel.replace(/^\[\[/, '').replace(/\]\]$/, '').trim()
  return `memory/facts/${slugForEntity(base)}.md`
}
