import type { Fact, FactKind } from './markdown.js'

// Per-kind recency halflives (days), seeded from gbrain src/core/facts/decay.ts as tunable
// starting values: events fade fast (momentary), beliefs/facts barely (durable). This is a
// RECENCY rate, not a confidence-decay rate.
export const HALFLIFE_DAYS: Record<FactKind, number> = {
  event: 7, commitment: 90, preference: 90, belief: 365, fact: 365,
}

// Whole-day difference between two YYYY-MM-DD dates, parsed as UTC midnight.
// new Date('YYYY-MM-DD') is UTC; do NOT use the 'YYYY-MM-DDT00:00:00' form (local time).
export function daysBetween(fromISO: string, toISO: string): number {
  return (new Date(toISO).getTime() - new Date(fromISO).getTime()) / 86_400_000
}

// Surfacing/review freshness as of a date. Pure, deterministic, range (0,1].
// 1 = brand new or unknown age; approaches 0 as the fact ages at its kind's rate.
// Does NOT read fact.confidence: freshness and confidence are orthogonal axes.
// True half-life: exactly 0.5 at one halflife (0.5 ^ (age/halflife)).
export function freshness(fact: Fact, asOf: string): number {
  if (!fact.validFrom) return 1
  const ageDays = daysBetween(fact.validFrom, asOf)
  if (ageDays <= 0) return 1
  return Math.exp(-Math.LN2 * ageDays / HALFLIFE_DAYS[fact.kind])
}
