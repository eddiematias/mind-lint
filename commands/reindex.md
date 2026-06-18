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

4. Scan wiki/ for compiled wiki pages: all .md files EXCEPT _index.md, _log.md, and
   everything under the roster-managed entity subtrees wiki/people/, wiki/companies/,
   and wiki/projects/ (those are handled in Step 5, not here).
   - Compare against wiki/_index.md
   - Add any missing entries
   - Flag any stale entries
   - Do NOT add entity files (wiki/people/**, wiki/companies/**, wiki/projects/**) to
     wiki/_index.md. They are entities, not compiled pages, and have their own rosters.

5. Reconcile the roster-managed entity subtrees. For EACH of wiki/people/,
   wiki/companies/, and wiki/projects/:
   - Scan the subtree for all .md files except its own _index.md.
   - Compare against that subtree's _index.md roster table.
   - Add a row for any entity file missing from the roster; flag any roster row whose
     file no longer exists.
   - Maintain the columns that subtree's roster defines:
     - wiki/people/_index.md: Name | Relationship | Category | Status | Last Synced
       (iMessage) | Last Synced (Calendar) | Last Synced (Journal). Read each profile's
       frontmatter for relationship (multi-valued → comma-joined), category, status,
       and the last-synced-* fields.
     - wiki/companies/_index.md and wiki/projects/_index.md: Name | Relationship |
       Category | Status. Read each entity's frontmatter for relationship (multi-valued
       → comma-joined), category, status.
   - Update each subtree's Stats block (totals + per-status counts) to match.
   - Affiliation `target:` wikilinks that point at an entity with no file yet are valid
     write-once dangling edges (Phase 2 populates edges before some target profiles exist).
     Do NOT create roster rows for them and do NOT flag them as missing — they are
     intentional unresolved links, not roster members. Only files that actually exist under
     the subtree become roster rows.

6. Report what was added, what was flagged, and confirm all indexes (compiled-pages and
   the three entity rosters) are current.
