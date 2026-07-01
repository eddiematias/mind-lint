# Health check with memory lifecycle (confidence, decay, supersession)
# Based on LLM Wiki v2 by Rohit Ghumare, extending Karpathy's original pattern

# /lint — Knowledge Base Health Check (v2: with memory lifecycle)

Full health check with confidence recalculation, decay management, and self-healing.

## Steps

### Phase 0: Reindex
Run /reindex first to sync all indexes with actual directory contents.

### Phase 0.5: Context Budget Audit
The always-loaded layer (everything `CLAUDE.md` pulls in via `@imports`) is what every session pays for before any work starts. Knowledge freshness (confidence, decay) is checked below; this phase checks the orthogonal axis the system was previously blind to: how much that knowledge costs to keep in context. The goal is to catch bloat here, not via an external "memory is large" warning.

1. Parse `~/.claude/CLAUDE.md` for every `@import`. For each imported file, estimate tokens as bytes / 4 (`wc -c` / 4). Sum to a total.
2. Report:
   - **Total always-loaded budget** against ceilings: **target ≤ 25K tokens, warn ≥ 35K** (tunable). State the number and the status.
   - **Per-file offenders:** any single always-loaded file over **3K tokens** (candidates to trim or move on-demand).
   - **Index entries that aren't one-liners:** scan the "Recent" sections of `memory/learnings/index.md` and `memory/decisions/index.md`; flag any bullet that spans multiple lines or exceeds ~300 characters. Each should be a one-line pointer; full detail belongs in the dated/category file.
   - **Eager-import footgun:** flag any `@path` that appears under a heading containing "Modular" or "Load When Relevant". Those are meant to be on-demand pointers (no leading `@`); an `@` there forces eager load every session, defeating the "load when relevant" intent.
3. Report + recommend only (trimming is a judgment call). Route proposed trims through Phase 5's "ask before fixing" flow, or point to `/prune` for the indexes.

### Phase 1: Auto-Fix (no confirmation needed)
These are safe fixes applied automatically:
- Index files out of sync with directory contents → fix indexes
- Wiki pages missing frontmatter fields (confidence, access_count, etc.) → add defaults
- Broken [[cross-references]] (linked page doesn't exist) → remove link, log removal
- Missing Supersession Log or Entities sections in wiki pages → add empty sections
- raw/_index.md entries for files that no longer exist → remove entries
- **Topic-tags-in-Tags-line anti-pattern** → for any learning entry, scan its `**Tags:**` line for hashtags whose name matches a file in `memory/learnings/` or `wiki/` (e.g. `#frontend` matches `memory/learnings/frontend.md`). Move those terms out of `**Tags:**` and into a `**Topics:**` line as `[[wikilinks]]`. If a `**Topics:**` line already exists, merge into it. See error rule #10. Why: Obsidian renders tags as filter labels and wikilinks as graph nodes; topic terms in `**Tags:**` break graph navigation.

Report all auto-fixes applied.

### Phase 2: Confidence Recalculation
For every wiki page:
- Recalculate confidence using the formula:
  base_confidence = min(source_count * 0.2, 1.0)
  recency_bonus = 0.1 if last_compiled within 30 days
  contradiction_penalty = -0.2 per known contradiction
  time_decay = -0.05 per month since last_compiled
  confidence = clamp(result, 0.1, 1.0)
- If confidence changed, update the page frontmatter
- Report pages with significant confidence changes (delta > 0.1)

### Phase 3: Decay Check
For every wiki page:
- Calculate days since last_accessed (or last_compiled if never accessed)
- Assign decay status:
  - Active: accessed/compiled within 30 days
  - Cooling: 30-90 days
  - Cold: 90+ days
- Update decay_status in frontmatter
- Update wiki/_index.md with current decay statuses

### Phase 4: Contradiction Detection
Cross-reference all wiki pages for contradictions:
- Same entity with different attributes across pages
- Conflicting claims about the same topic
- Superseded claims that haven't been marked

For each contradiction found:
- Propose a resolution based on: source recency, source count, confidence scores
- Present to the user: "Page A says X (confidence 0.7, 2 sources). Page B says Y (confidence 0.85, 3 sources). Recommend keeping Y and superseding X. Approve?"
- Apply approved resolutions

### Phase 5: Standard Checks (ask before fixing)
- Decision docs (`memory/decisions/YYYY-MM-DD-*.md`) missing a `## Related` section, OR any `[[wikilink]]` inside a decision's `## Related` that does not resolve to a real file (a decision in `memory/decisions/`, or an entity in `wiki/projects/`|`wiki/companies/`) → flag the offending docs + dangling targets. Decisions should be born linked per the `## Related` convention in the decision template; this catches drift before it accumulates. Exclude docs whose `**Project:**` maps to no entity (e.g. `general`) or archived projects.
- Orphan wiki pages (no backlinks, no sources) → suggest linking or archiving
- Content pipeline stale entries (ideas sitting 30+ days) → suggest action
- Error rules that may conflict → suggest resolution
- Cold wiki pages → suggest: refresh with new sources, archive, or leave

### Phase 6: Report
Output:
- Auto-fixes applied (count and list)
- Confidence changes (pages with delta > 0.1)
- Decay status summary (X active, Y cooling, Z cold)
- Contradictions found and resolved
- Issues requiring the user's input
- Overall health score (percentage of checks passed)
- Context budget: always-loaded total vs 25K target (from Phase 0.5), with any offenders called out
- Stats: total files, total wiki pages, average confidence, total error rules, content pipeline status

Append results to wiki/_log.md.
