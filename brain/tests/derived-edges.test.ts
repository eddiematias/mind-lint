import { describe, it, expect, beforeEach } from 'vitest'
import { openDb, initSchema, insertEdge, listEdgesFrom, deleteFileChunks,
  upsertDerivedEdge, deleteDerivedFileEdges, isSuppressed, insertSuppression, deleteSuppression,
} from '../src/db.js'
import type { PGlite } from '@electric-sql/pglite'

const D = (fromPath: string, toRaw: string, context: string) => ({
  fromPath, toPath: 'wiki/companies/JBR.md', toRaw, role: 'references',
  category: null, source: 'derived', context, resolved: true,
})

describe('upsertDerivedEdge + source-aware delete', () => {
  let db: PGlite
  beforeEach(async () => { db = await openDb(''); await initSchema(db, 768) })

  it('upsert preserves created_at on re-derivation but refreshes context (C2 first-seen)', async () => {
    await upsertDerivedEdge(db, D('journal/x.md', '[[JBR]]', 'first line'))
    const first = await listEdgesFrom(db, 'journal/x.md')
    const createdAt = (first[0] as unknown as { created_at: Date | string }).created_at
    await new Promise((r) => setTimeout(r, 5))
    await upsertDerivedEdge(db, D('journal/x.md', '[[JBR]]', 'moved line'))
    const second = await listEdgesFrom(db, 'journal/x.md')
    expect(second).toHaveLength(1)
    // PGlite returns TIMESTAMPTZ as a fresh Date instance per query, so .toBe() (Object.is
    // identity) would FAIL even on a correct upsert. Compare by time value (works for Date or ISO).
    const secondCreatedAt = (second[0] as unknown as { created_at: Date | string }).created_at
    expect(new Date(secondCreatedAt).getTime()).toBe(new Date(createdAt).getTime()) // unchanged
    expect(second[0].context).toBe('moved line') // refreshed
  })

  it('deleteDerivedFileEdges removes only source=derived rows for the file (C1)', async () => {
    await insertEdge(db, { fromPath: 'wiki/companies/JBR.md', toPath: null, toRaw: '[[Jeff Perera]]', role: 'founded', category: 'business', source: 'human', context: '', resolved: false })
    await upsertDerivedEdge(db, D('wiki/companies/JBR.md', '[[Otus Coffee]]', 'ctx'))
    await deleteDerivedFileEdges(db, 'wiki/companies/JBR.md')
    const rows = await listEdgesFrom(db, 'wiki/companies/JBR.md')
    expect(rows).toHaveLength(1)
    expect(rows[0].source).toBe('human') // the human affiliation survived
  })

  it('deleteFileChunks no longer wipes derived edges (source-aware, C1)', async () => {
    await upsertDerivedEdge(db, D('journal/x.md', '[[JBR]]', 'ctx'))
    await insertEdge(db, { fromPath: 'journal/x.md', toPath: null, toRaw: '[[Manual]]', role: 'r', category: null, source: 'human', context: '', resolved: false })
    await deleteFileChunks(db, 'journal/x.md') // the per-changed-file path
    const rows = await listEdgesFrom(db, 'journal/x.md')
    expect(rows.map((r) => r.source).sort()).toEqual(['derived']) // human gone, derived survived
  })
})

describe('suppression CRUD', () => {
  let db: PGlite
  beforeEach(async () => { db = await openDb(''); await initSchema(db, 768) })

  it('insert then isSuppressed true; delete then false', async () => {
    expect(await isSuppressed(db, 'journal/x.md', '[[JBR]]', 'references')).toBe(false)
    await insertSuppression(db, 'journal/x.md', '[[JBR]]', 'references', 'wrong target')
    expect(await isSuppressed(db, 'journal/x.md', '[[JBR]]', 'references')).toBe(true)
    await deleteSuppression(db, 'journal/x.md', '[[JBR]]', 'references')
    expect(await isSuppressed(db, 'journal/x.md', '[[JBR]]', 'references')).toBe(false)
  })
})

describe('derived_suppressions schema', () => {
  let db: PGlite
  beforeEach(async () => { db = await openDb(''); await initSchema(db, 768) })

  it('creates the derived_suppressions table with the expected columns', async () => {
    const res = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'derived_suppressions'`,
    )
    const cols = res.rows.map((r) => r.column_name).sort()
    expect(cols).toEqual(['created_at', 'from_path', 'reason', 'role', 'to_raw'].sort())
  })

  it('the 3-tuple primary key dedupes a re-inserted suppression', async () => {
    const ins = `INSERT INTO derived_suppressions (from_path, to_raw, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`
    await db.query(ins, ['journal/2026-06-19.md', '[[JBR]]', 'references'])
    await db.query(ins, ['journal/2026-06-19.md', '[[JBR]]', 'references'])
    const c = await db.query<{ c: number }>(`SELECT count(*)::int AS c FROM derived_suppressions`)
    expect(c.rows[0].c).toBe(1)
  })
})
