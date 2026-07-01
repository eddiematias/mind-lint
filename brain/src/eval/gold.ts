import { readFile } from 'node:fs/promises'

export interface GoldEntry {
  id: string
  query: string
  relevant: string[]      // vault-relative sourcePaths that SHOULD surface (ground-truth)
  trimCandidate: boolean   // true = a Phase-4 move candidate (scored as its own class)
  note?: string
}

// Parse JSONL gold text. Skips blank lines and lines beginning with '#' (comments, e.g. the
// frozen-set Why: convention header). Throws (naming the line number) on invalid JSON or an entry
// missing id/query or with an empty relevant[] (a gold entry MUST assert at least one relevant path).
export function parseGoldSet(text: string): GoldEntry[] {
  const out: GoldEntry[] = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line || line.startsWith('#')) continue
    let raw: unknown
    try { raw = JSON.parse(line) } catch { throw new Error(`gold line ${i + 1}: invalid JSON`) }
    const e = raw as Record<string, unknown>
    if (typeof e.id !== 'string' || typeof e.query !== 'string' || !Array.isArray(e.relevant) || e.relevant.length === 0) {
      throw new Error(`gold line ${i + 1}: entry needs id, query, and a non-empty relevant[]`)
    }
    out.push({
      id: e.id,
      query: e.query,
      relevant: e.relevant.map(String),
      trimCandidate: e.trimCandidate === true,
      note: typeof e.note === 'string' ? e.note : undefined,
    })
  }
  return out
}

export async function loadGoldSet(path: string): Promise<GoldEntry[]> {
  return parseGoldSet(await readFile(path, 'utf8'))
}
