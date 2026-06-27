import type { ChatClient } from '../chat.js'
import { FACT_KINDS, type FactKind } from './markdown.js'

export interface ExtractedRow {
  claim: string
  kind: FactKind
  confidence: number
  entity: string | null
}

// PR-I4: instructs the model to use the full canonical name so entity resolution
// can key on the same basename used in wiki/people/<Name>.md.
export function buildExtractionPrompt(): { system: string } {
  return {
    system: [
      'You extract durable, self-contained FACTS from a note. A fact is a standalone statement',
      'that would still be meaningful months later. Ground every fact ONLY in the given text;',
      'never use outside knowledge. Prefer a few high-value facts over many trivial ones.',
      '',
      'For each fact assign:',
      '- kind: one of event | preference | commitment | belief | fact',
      '- confidence: 0.0-1.0 (how strongly the text supports it)',
      '- entity: the person/company/project the fact is ABOUT. Use the FULL canonical name',
      '  as it would title a page (e.g. "Amara Markovic", not "Amara"), or null if the fact',
      '  is not about a specific named entity.',
      '',
      'Respond with ONLY a JSON array, no prose:',
      '[{"claim": "...", "kind": "fact", "confidence": 0.9, "entity": "Amara Markovic"}]',
      'If there are no durable facts, respond with [].',
    ].join('\n'),
  }
}

// PR-I5: normalize claim to a single line so the ## -split round-trip from Task 4 stays total.
export function parseExtractionJson(raw: string): ExtractedRow[] {
  const start = raw.indexOf('[')
  const end = raw.lastIndexOf(']')
  if (start === -1 || end === -1 || end < start) return []
  let arr: unknown
  try { arr = JSON.parse(raw.slice(start, end + 1)) } catch { return [] }
  if (!Array.isArray(arr)) return []
  const out: ExtractedRow[] = []
  for (const r of arr) {
    if (!r || typeof r !== 'object') continue
    const o = r as Record<string, unknown>
    // PR-I5: collapse any internal whitespace to a single space so the ## split round-trip works
    const claim = typeof o.claim === 'string' ? o.claim.trim().replace(/\s+/g, ' ') : ''
    if (!claim) continue
    const kind = (typeof o.kind === 'string' && FACT_KINDS.includes(o.kind as FactKind))
      ? (o.kind as FactKind)
      : null
    if (!kind) continue
    let confidence = typeof o.confidence === 'number' ? o.confidence : 1
    if (Number.isNaN(confidence)) confidence = 1
    confidence = Math.max(0, Math.min(1, confidence))
    const entity = typeof o.entity === 'string' && o.entity.trim() ? o.entity.trim() : null
    out.push({ claim, kind, confidence, entity })
  }
  return out
}

export async function extractFromFile(
  chat: ChatClient,
  sourcePath: string,
  body: string,
  cap: number,
): Promise<ExtractedRow[]> {
  const { system } = buildExtractionPrompt()
  const user = `<note path="${sourcePath}">\n${body}\n</note>\n\nExtract up to ${cap} durable facts.`
  const raw = await chat.complete(system, user)
  return parseExtractionJson(raw).slice(0, cap)
}
