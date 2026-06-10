# /reindex — Update All Index Files

Scan directories and update index files to match what actually exists. Run this when files have been created outside of Claude Code (e.g., via Obsidian) or when indexes feel stale.

## Steps

1. Scan memory/learnings/ for all .md files except index.md
   - Compare against memory/learnings/index.md
   - Add any missing entries to the index
   - Flag any index entries pointing to files that no longer exist

2. Scan memory/decisions/ for all .md files except index.md
   - Compare against memory/decisions/index.md
   - Add any missing entries to the index
   - Flag any index entries pointing to files that no longer exist

3. Scan raw/notes/, raw/articles/, raw/transcripts/, raw/research/ for all .md files
   - Compare against raw/_index.md
   - Add any missing entries
   - Flag any stale entries

4. Scan wiki/ for all .md files except _index.md and _log.md
   - Compare against wiki/_index.md
   - Add any missing entries
   - Flag any stale entries

5. Report what was added, what was flagged, and confirm all indexes are current.
