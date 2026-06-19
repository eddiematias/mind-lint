// brain/tests/edges.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { openDb, initSchema } from '../src/db.js'
import type { PGlite } from '@electric-sql/pglite'

describe('edges schema', () => {
  let db: PGlite
  beforeEach(async () => { db = await openDb(''); await initSchema(db, 768) })

  it('creates the edges table with the expected columns', async () => {
    const res = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'edges'`,
    )
    const cols = res.rows.map((r) => r.column_name).sort()
    expect(cols).toEqual(
      ['category', 'context', 'created_at', 'from_path', 'id', 'resolved', 'role', 'source', 'to_path', 'to_raw'].sort(),
    )
  })

  it('enforces the NULLS NOT DISTINCT unique constraint (two NULL to_path rows collide)', async () => {
    const ins = `INSERT INTO edges (from_path, to_path, to_raw, role, source) VALUES ($1, NULL, $2, $3, $4)`
    await db.query(ins, ['wiki/people/A.md', '[[Ghost]]', 'knows', 'human'])
    // same (from_path, to_raw, role, source) with NULL to_path must be deduped, not duplicated
    await db.query(ins + ` ON CONFLICT DO NOTHING`, ['wiki/people/A.md', '[[Ghost]]', 'knows', 'human'])
    const c = await db.query<{ c: number }>(`SELECT count(*)::int AS c FROM edges`)
    expect(c.rows[0].c).toBe(1)
  })
})
