export type FactKind = 'event' | 'preference' | 'commitment' | 'belief' | 'fact'
export const FACT_KINDS: FactKind[] = ['event', 'preference', 'commitment', 'belief', 'fact']

export interface Fact {
  claim: string
  kind: FactKind
  confidence: number
  entity: string | null      // canonical wikilink e.g. '[[Amara Markovic]]', or null
  sourcePath: string         // vault-relative path the claim was extracted from
  validFrom: string | null
  validUntil: string | null
  superseded: boolean
  supersededNote: string | null
}

// Stable key for dedup + suppression: source + normalized claim. Survives DB rebuilds
// (computed from the markdown, not a DB id). Facts get their own key shape, not
// the edge-shaped (from_path,to_raw,role).
export function factKey(f: Pick<Fact, 'sourcePath' | 'claim'>): string {
  return `${f.sourcePath}\0${f.claim.trim().replace(/\s+/g, ' ').toLowerCase()}`
}

const HEADER_NOTE =
  '<!-- Agent-derived facts (slice 3). To retire a claim, strike it ~~like this~~ and add a ' +
  '"superseded by ..." or "forgotten: ..." note; the nightly cycle honors it and will not re-add it. -->'

export function renderFactsFile(entityLabel: string | null, facts: Fact[]): string {
  const title = entityLabel ? `# Facts: ${entityLabel}` : '# Facts (unattached)'
  const blocks = facts.map((f) => {
    // PR-C1: use ## (h2) so the chunker's #{1,2}\s boundary fires on each fact heading
    const claimLine = f.superseded ? `## ~~${f.claim}~~` : `## ${f.claim}`
    const lines = [
      claimLine,
      '',
      `- kind: \`${f.kind}\``,
      `- confidence: \`${f.confidence.toFixed(2)}\``,
      `- source: \`${f.sourcePath}\``,
    ]
    if (f.entity) lines.push(`- entity: ${f.entity}`)
    if (f.validFrom || f.validUntil) lines.push(`- valid: \`${f.validFrom ?? ''}\` -> \`${f.validUntil ?? ''}\``)
    if (f.supersededNote) lines.push(`- note: ${f.supersededNote}`)
    return lines.join('\n')
  })
  return [title, '', HEADER_NOTE, '', ...interleaveBlank(blocks), ''].join('\n')
}

function interleaveBlank(blocks: string[]): string[] {
  const out: string[] = []
  blocks.forEach((b, i) => { if (i > 0) out.push(''); out.push(b) })
  return out
}

const BACKTICK_RE = /`([^`]*)`/
function backtickVal(line: string): string { return (line.match(BACKTICK_RE)?.[1] ?? '').trim() }

export function parseFactsFile(content: string): Fact[] {
  const facts: Fact[] = []
  // PR-C1: split on ^## (h2) to match chunker boundary; title line "# Facts: ..." starts
  // with "# " (single hash + space) so it does NOT match "## " and is correctly excluded.
  const parts = content.split(/^## /m).slice(1)
  for (const part of parts) {
    const lines = part.split('\n')
    let claim = lines[0].trim()
    const superseded = /^~~.*~~$/.test(claim)
    if (superseded) claim = claim.replace(/^~~/, '').replace(/~~$/, '').trim()
    let kind: FactKind = 'fact'
    let confidence = 1
    let sourcePath = ''
    let entity: string | null = null
    let validFrom: string | null = null
    let validUntil: string | null = null
    let supersededNote: string | null = null
    for (const raw of lines.slice(1)) {
      const line = raw.trim()
      if (line.startsWith('- kind:')) {
        const v = backtickVal(line)
        if (FACT_KINDS.includes(v as FactKind)) kind = v as FactKind
      } else if (line.startsWith('- confidence:')) {
        const n = parseFloat(backtickVal(line))
        if (!Number.isNaN(n)) confidence = n
      } else if (line.startsWith('- source:')) {
        sourcePath = backtickVal(line)
      } else if (line.startsWith('- entity:')) {
        entity = line.slice('- entity:'.length).trim() || null
      } else if (line.startsWith('- valid:')) {
        // Render uses '->' (arrow without emdash); tolerate optional spaces around it
        const m = line.match(/`([^`]*)`\s*->\s*`([^`]*)`/)
        validFrom = (m?.[1] || '').trim() || null
        validUntil = (m?.[2] || '').trim() || null
      } else if (line.startsWith('- note:')) {
        supersededNote = line.slice('- note:'.length).trim() || null
      }
    }
    if (claim) facts.push({ claim, kind, confidence, entity, sourcePath, validFrom, validUntil, superseded, supersededNote })
  }
  return facts
}
