import { PGlite } from '@electric-sql/pglite'
import { vector } from '@electric-sql/pglite/vector'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Chunk } from './types.js'

export async function openDb(path: string): Promise<PGlite> {
  if (!path) return new PGlite({ extensions: { vector } }) // in-memory (tests)
  // PGLite's nodefs creates only the leaf data dir, not missing parents, so a
  // configured dbPath like data/brain.pglite fails ENOENT on first run unless the
  // parent exists. Create it ourselves.
  mkdirSync(dirname(path), { recursive: true })
  return new PGlite(path, { extensions: { vector } })
}

export async function initSchema(db: PGlite, dims: number): Promise<void> {
  await db.exec(`CREATE EXTENSION IF NOT EXISTS vector;`)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS files (
      path TEXT PRIMARY KEY,
      file_hash TEXT NOT NULL,
      last_indexed TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      source_path TEXT NOT NULL,
      chunk_index INT NOT NULL,
      content TEXT NOT NULL,
      metadata JSONB,
      embedding vector(${dims}),
      tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
      content_hash TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS chunks_tsv_idx ON chunks USING GIN (tsv);
    CREATE INDEX IF NOT EXISTS chunks_source_idx ON chunks (source_path);
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS edges (
      id          SERIAL PRIMARY KEY,
      from_path   TEXT NOT NULL,
      to_path     TEXT,
      to_raw      TEXT NOT NULL,
      role        TEXT NOT NULL DEFAULT '',
      category    TEXT,
      source      TEXT NOT NULL DEFAULT 'human',
      context     TEXT NOT NULL DEFAULT '',
      resolved    BOOLEAN NOT NULL DEFAULT false,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT edges_unique UNIQUE NULLS NOT DISTINCT (from_path, to_raw, role, source)
    );
    CREATE INDEX IF NOT EXISTS edges_from_idx ON edges (from_path);
    CREATE INDEX IF NOT EXISTS edges_to_idx   ON edges (to_path);
    CREATE TABLE IF NOT EXISTS derived_suppressions (
      from_path  TEXT NOT NULL,
      to_raw     TEXT NOT NULL,
      role       TEXT NOT NULL DEFAULT 'references',
      reason     TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (from_path, to_raw, role)
    );
  `)
}

function toVectorLiteral(v: number[]): string {
  return `[${v.join(',')}]`
}

export async function upsertChunk(db: PGlite, c: Chunk, embedding: number[]): Promise<void> {
  await db.query(
    `INSERT INTO chunks (id, source_path, chunk_index, content, metadata, embedding, content_hash)
     VALUES ($1, $2, $3, $4, $5, $6::vector, $7)
     ON CONFLICT (id) DO UPDATE SET
       content = EXCLUDED.content, metadata = EXCLUDED.metadata,
       embedding = EXCLUDED.embedding, content_hash = EXCLUDED.content_hash`,
    [c.id, c.sourcePath, c.chunkIndex, c.content, JSON.stringify(c.metadata), toVectorLiteral(embedding), c.contentHash],
  )
}

interface Row { id: string; source_path: string; content: string; metadata: Record<string, unknown> }

export async function vectorSearch(db: PGlite, queryVec: number[], limit: number): Promise<Row[]> {
  const res = await db.query<Row>(
    `SELECT id, source_path, content, metadata FROM chunks
     ORDER BY embedding <=> $1::vector LIMIT $2`,
    [toVectorLiteral(queryVec), limit],
  )
  return res.rows
}

export async function keywordSearch(db: PGlite, query: string, limit: number): Promise<Row[]> {
  const res = await db.query<Row>(
    `SELECT id, source_path, content, metadata,
            ts_rank(tsv, plainto_tsquery('english', $1)) AS rank
     FROM chunks
     WHERE tsv @@ plainto_tsquery('english', $1)
     ORDER BY rank DESC LIMIT $2`,
    [query, limit],
  )
  return res.rows
}

export async function getFileHash(db: PGlite, path: string): Promise<string | null> {
  const res = await db.query<{ file_hash: string }>(`SELECT file_hash FROM files WHERE path = $1`, [path])
  return res.rows[0]?.file_hash ?? null
}

export async function setFileHash(db: PGlite, path: string, hash: string): Promise<void> {
  await db.query(
    `INSERT INTO files (path, file_hash, last_indexed) VALUES ($1, $2, now())
     ON CONFLICT (path) DO UPDATE SET file_hash = EXCLUDED.file_hash, last_indexed = now()`,
    [path, hash],
  )
}

export async function getMeta(db: PGlite, key: string): Promise<string | null> {
  const res = await db.query<{ value: string }>(`SELECT value FROM meta WHERE key = $1`, [key])
  return res.rows[0]?.value ?? null
}

export async function setMeta(db: PGlite, key: string, value: string): Promise<void> {
  await db.query(
    `INSERT INTO meta (key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, value],
  )
}

export interface EdgeInput {
  fromPath: string
  toPath: string | null
  toRaw: string
  role: string
  category: string | null
  source: string
  context: string
  resolved: boolean
}

export interface EdgeRow {
  id: number
  from_path: string
  to_path: string | null
  to_raw: string
  role: string
  category: string | null
  source: string
  context: string
  resolved: boolean
}

export async function insertEdge(db: PGlite, e: EdgeInput): Promise<void> {
  await db.query(
    `INSERT INTO edges (from_path, to_path, to_raw, role, category, source, context, resolved)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT ON CONSTRAINT edges_unique DO NOTHING`,
    [e.fromPath, e.toPath, e.toRaw, e.role, e.category, e.source, e.context, e.resolved],
  )
}

export async function deleteFileEdges(db: PGlite, fromPath: string): Promise<void> {
  await db.query(`DELETE FROM edges WHERE from_path = $1`, [fromPath])
}

export async function listEdgesFrom(db: PGlite, fromPath: string): Promise<EdgeRow[]> {
  const res = await db.query<EdgeRow>(`SELECT * FROM edges WHERE from_path = $1 ORDER BY id`, [fromPath])
  return res.rows
}

export async function deleteFileChunks(db: PGlite, path: string): Promise<void> {
  await db.query(`DELETE FROM chunks WHERE source_path = $1`, [path])
  await db.query(`DELETE FROM edges WHERE from_path = $1`, [path])
  await db.query(`DELETE FROM files WHERE path = $1`, [path])
}

export interface TraverseOpts {
  direction?: 'out' | 'in' | 'both'
  depth?: number
  role?: string
  source?: string
  category?: string
}
export interface TraverseRow {
  from: string
  to: string | null
  to_raw: string
  role: string
  source: string
  category: string | null
  hop: number
  resolved: boolean
}

export async function traverseEdges(db: PGlite, seed: string, opts: TraverseOpts = {}): Promise<TraverseRow[]> {
  const direction = opts.direction ?? 'both'
  const depth = opts.depth ?? 1
  // Edge-match predicate for the recursive step, parameterized by direction.
  // out:  e.from_path = frontier.node
  // in:   e.to_path   = frontier.node
  // both: either side matches; the "next node" is the OTHER endpoint.
  const res = await db.query<TraverseRow>(
    `
    WITH RECURSIVE walk AS (
      SELECT $1::text AS node, ARRAY[$1::text] AS visited, 0 AS hop
      UNION ALL
      SELECT
        CASE WHEN e.from_path = w.node THEN e.to_path ELSE e.from_path END AS node,
        w.visited || (CASE WHEN e.from_path = w.node THEN e.to_path ELSE e.from_path END),
        w.hop + 1
      FROM walk w
      JOIN edges e ON (
        ($2 = 'out'  AND e.from_path = w.node) OR
        ($2 = 'in'   AND e.to_path   = w.node) OR
        ($2 = 'both' AND (e.from_path = w.node OR e.to_path = w.node))
      )
      WHERE w.hop < $3
        AND (CASE WHEN e.from_path = w.node THEN e.to_path ELSE e.from_path END) IS NOT NULL
        AND NOT ((CASE WHEN e.from_path = w.node THEN e.to_path ELSE e.from_path END) = ANY (w.visited))
    )
    SELECT e.from_path AS "from", e.to_path AS "to", e.to_raw AS "to_raw", e.role, e.source, e.category, w.hop + 1 AS hop, e.resolved
    FROM walk w
    JOIN edges e ON (
      ($2 = 'out'  AND e.from_path = w.node) OR
      ($2 = 'in'   AND e.to_path   = w.node) OR
      ($2 = 'both' AND (e.from_path = w.node OR e.to_path = w.node))
    )
    WHERE w.hop < $3
      AND ($4::text IS NULL OR e.role = $4)
      AND ($5::text IS NULL OR e.source = $5)
      AND ($6::text IS NULL OR e.category = $6)
    `,
    [seed, direction, depth, opts.role ?? null, opts.source ?? null, opts.category ?? null],
  )
  return res.rows
}

export async function listIndexedPaths(db: PGlite): Promise<string[]> {
  const res = await db.query<{ path: string }>(`SELECT path FROM files`)
  return res.rows.map((r) => r.path)
}

export async function getChunkContents(db: PGlite, ids: string[]): Promise<Row[]> {
  if (ids.length === 0) return []
  const res = await db.query<Row>(
    `SELECT id, source_path, content, metadata FROM chunks WHERE id = ANY($1)`,
    [ids],
  )
  return res.rows
}
