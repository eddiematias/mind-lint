import { describe, it, expect, beforeEach } from 'vitest'
import { openDb, initSchema } from '../src/db.js'
import type { PGlite } from '@electric-sql/pglite'

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
