The user wants to prune the memory indexes so the always-loaded context stays lean. This covers BOTH `~/.claude/memory/learnings/index.md` and `~/.claude/memory/decisions/index.md`. Both are imported into every session via CLAUDE.md, so their job is to be lean pointers, not stores. The full detail lives elsewhere (learnings → category file; decisions → dated `YYYY-MM-DD-*.md` file).

Two things make an index bloated, and prune handles both:
- **Format drift** — entries that grew from a one-line pointer into a multi-line paragraph. This is the bigger cost and is independent of count.
- **Count** — too many entries, even as one-liners.

## Steps

### 1. Format pass (both indexes)
For each of `learnings/index.md` and `decisions/index.md`, scan the "Recent" section for entries that are NOT one-liners (bullet spans multiple lines, or exceeds ~300 characters).

For each paragraph-style entry found:
- **Verify the full detail exists in the target file first.** Learnings: the named category file (`backend.md`, `ai-workflows.md`, etc.). Decisions: the dated `YYYY-MM-DD-*.md` file referenced by the link. If the detail is missing from the target file, copy it there before touching the index.
- Collapse the index entry to one line: `- [YYYY-MM-DD] **Title** (project) [link]`. For learnings the link is the category file; for decisions it is the dated doc. Drop the explanatory prose (it now lives only in the target file). No em dashes.

Report how many entries were collapsed per index.

### 2. Count pass (both indexes)
- **Learnings:** keep the 50 most recent one-liners (trim toward 30 if the user wants it leaner). Older entries: confirm they exist in their category file, then remove the one-liner from the index. Archive removed one-liners to `~/.claude/archive/old-learnings/` for reference.
- **Decisions:** keep the 50 most recent one-liners. The dated docs always stay in place; only the index pointer moves. Archive removed one-liners to `~/.claude/memory/decisions/_archive-index.md` (a non-loaded file, append-only) so they remain discoverable without costing session budget.

If an index is already at/under its cap and fully one-line, say it's healthy and ask whether to prune anyway.

### 3. Budget check
After pruning, estimate the always-loaded total the way `/lint` Phase 0.5 does (sum `bytes/4` across every `@import` in `~/.claude/CLAUDE.md`). Report the new total against the 25K target. If still over, point to the largest remaining offenders.

### 4. Summary
Show the user: entries collapsed per index, entries archived per index, the new line count of each index, and the new always-loaded budget total.
