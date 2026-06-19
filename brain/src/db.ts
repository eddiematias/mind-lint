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

export async function deleteFileChunks(db: PGlite, path: string): Promise<void> {
  await db.query(`DELETE FROM chunks WHERE source_path = $1`, [path])
  await db.query(`DELETE FROM files WHERE path = $1`, [path])
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
