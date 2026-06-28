import { readFile, writeFile } from 'node:fs/promises'
import { resolve, basename } from 'node:path'
import fg from 'fast-glob'
import { parseFactsFile, renderFactsFile, type Fact } from './markdown.js'
import { sourceDate } from './source.js'

// Recover a facts file's title label from the file ITSELF (PR-3), not from the facts:
// renderFactsFile writes '# Facts: <label>' or '# Facts (unattached)'. Parsing the
// existing title round-trips losslessly even for entity files whose facts might carry
// a null entity, which "first fact with an entity" would mislabel.
export function parseFactsTitle(content: string): string | null {
  const first = content.split('\n').find((l) => l.startsWith('# Facts'))
  const m = first?.match(/^# Facts:\s*(.+)$/)
  return m ? m[1].trim() : null // '# Facts (unattached)' -> null
}

function isLedgerFile(rel: string): boolean {
  return basename(rel).startsWith('_supersession')
}

// Re-derive valid_from from sourcePath (path-only, no file read) for every fact
// file under memory/facts/. Idempotent: rewrites a file only if a value changed.
export async function restampValidFrom(vaultRoot: string): Promise<{ filesChanged: number }> {
  const files = await fg('memory/facts/*.md', { cwd: vaultRoot, dot: true })
  let filesChanged = 0
  for (const rel of files) {
    if (isLedgerFile(rel)) continue
    const abs = resolve(vaultRoot, rel)
    let raw: string
    try { raw = await readFile(abs, 'utf8') } catch { continue }
    const facts: Fact[] = parseFactsFile(raw)
    const title = parseFactsTitle(raw) // PR-3: preserve the file's own title
    let changed = false
    for (const f of facts) {
      const d = sourceDate(f.sourcePath, {})
      if (d && d !== f.validFrom) { f.validFrom = d; changed = true }
    }
    if (changed) { await writeFile(abs, renderFactsFile(title, facts)); filesChanged++ }
  }
  return { filesChanged }
}
