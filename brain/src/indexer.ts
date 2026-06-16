import fg from 'fast-glob'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import type { Embedder } from './types.js'
import { chunkMarkdown } from './chunker.js'
import { upsertChunk, getFileHash, setFileHash, deleteFileChunks, listIndexedPaths } from './db.js'

function fileHash(s: string): string {
  return createHash('sha256').update(s).digest('hex')
}

interface IndexCfg { vaultRoot: string; scopeGlobs: string[] }
export interface IndexResult { filesIndexed: number; filesSkipped: number; filesRemoved: number; chunksWritten: number }

export async function indexVault(db: PGlite, embedder: Embedder, cfg: IndexCfg, maxChars = 2000): Promise<IndexResult> {
  const matches = await fg(cfg.scopeGlobs, { cwd: cfg.vaultRoot, dot: true })
  const present = new Set(matches)
  let filesIndexed = 0, filesSkipped = 0, filesRemoved = 0, chunksWritten = 0

  // prune files that no longer exist
  for (const indexed of await listIndexedPaths(db)) {
    if (!present.has(indexed)) { await deleteFileChunks(db, indexed); filesRemoved++ }
  }

  for (const rel of matches) {
    const raw = await readFile(resolve(cfg.vaultRoot, rel), 'utf8')
    const hash = fileHash(raw)
    if ((await getFileHash(db, rel)) === hash) { filesSkipped++; continue }

    await deleteFileChunks(db, rel) // replace any stale chunks
    const chunks = chunkMarkdown(rel, raw, maxChars)
    if (chunks.length > 0) {
      const vectors = await embedder.embed(chunks.map((c) => c.content))
      for (let i = 0; i < chunks.length; i++) { await upsertChunk(db, chunks[i], vectors[i]); chunksWritten++ }
    }
    await setFileHash(db, rel, hash)
    filesIndexed++
  }
  return { filesIndexed, filesSkipped, filesRemoved, chunksWritten }
}
