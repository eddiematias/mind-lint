# /prune — Keep the Memory Indexes Lean

Prune the memory indexes so the always-loaded context stays cheap. Covers BOTH `memory/learnings/index.md` and `memory/decisions/index.md`. Both are imported into every session via CLAUDE.md, so their job is to be lean pointers, not stores. The full detail lives elsewhere (learnings in the category file; decisions in the dated `YYYY-MM-DD-*.md` file).

Two things bloat an index, and prune handles both:
- **Format drift** — entries that grew from a one-line pointer into a paragraph. This is the bigger cost and is independent of count.
- **Count** — too many entries, even as one-liners.

## Steps

### 1. Format pass (both indexes)
For each index, scan the "Recent" section for entries that are NOT one-liners (bullet spans multiple lines, or exceeds ~300 chars). For each:
- Verify the full detail exists in the target file first (learnings → the named category file; decisions → the dated doc the link points to). If missing, copy it there before touching the index.
- Collapse the index entry to one line: `- [YYYY-MM-DD] **Title** (project) [link]`. Drop the prose (it lives in the target file now). No em dashes.

### 2. Count pass (both indexes)
- Learnings: keep the 50 most recent one-liners (trim toward 30 if you want it leaner). Confirm older entries exist in their category file, then remove the one-liner. Archive removed one-liners to `archive/old-learnings/`.
- Decisions: keep the 50 most recent one-liners. The dated docs always stay in place; only the index pointer moves. Archive removed one-liners to `memory/decisions/_archive-index.md` (a non-loaded, append-only file).

If an index is already at/under its cap and fully one-line, report it healthy and ask whether to prune anyway.

### 3. Budget check
After pruning, estimate the always-loaded total the way /lint Phase 0.5 does (sum `bytes/4` across every @import in CLAUDE.md). Report the new total vs the 25K target; if still over, name the largest remaining offenders.

### 4. Report
Entries collapsed per index, entries archived per index, new line count of each index, new always-loaded budget total.
