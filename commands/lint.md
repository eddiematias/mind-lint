# /lint — Knowledge Base Health Check
# Based on LLM Wiki v2 by Rohit Ghumare, extending Karpathy's original pattern

Full health check with confidence recalculation, decay management, and self-healing.

## Phase 0: Reindex
Run /reindex to sync all indexes with actual directory contents.

## Phase 0.5: Context Budget Audit
The always-loaded layer (everything CLAUDE.md pulls in via @imports) is what every session pays for before any work starts. The phases below check whether knowledge is fresh and true; this one checks the orthogonal axis: how much it costs to keep in context. The goal is to catch bloat here, not via an external "memory is large" warning.

1. Parse CLAUDE.md for every @import; estimate tokens as bytes / 4 (`wc -c` / 4); sum to a total.
2. Report:
   - Total always-loaded budget vs ceilings: target <= 25K tokens, warn >= 35K (tunable).
   - Per-file offenders: any single always-loaded file over 3K tokens (candidates to trim or move on-demand).
   - Index entries that aren't one-liners: scan the "Recent" sections of memory/learnings/index.md and memory/decisions/index.md; flag any bullet that spans multiple lines or exceeds ~300 chars. Each should be a one-line pointer; detail belongs in the linked file.
   - Eager-import footgun: flag any @path under a heading containing "Modular" or "Load When Relevant". Those should be on-demand pointers (no leading @); an @ there forces eager load every session, defeating the intent.
3. Report + recommend only (trimming is a judgment call). Route trims through Phase 5, or point to /prune for the indexes.

## Phase 1: Auto-Fix (no confirmation needed)
- Index files out of sync → fix indexes
- Wiki pages missing frontmatter fields → add defaults
- Broken [[cross-references]] → remove link, log removal
- Missing Supersession Log or Entities sections → add empty sections
- raw/_index.md entries for deleted files → remove entries
- **Topic-tags-in-frontmatter anti-pattern:** for any learning entry, scan the frontmatter `tags:` array for items whose name matches a file in `memory/learnings/` or `wiki/` (e.g. `frontend` matches `memory/learnings/frontend.md`). Move those items out of `tags:` and into the body's `## Topics` section as `[[wikilinks]]`. Why: Obsidian renders frontmatter tags as filter labels and `[[wikilinks]]` as graph nodes; topic terms in `tags:` break graph navigation.

## Phase 2: Confidence Recalculation
For every wiki page, recalculate confidence:
  base = min(source_count * 0.2, 1.0)
  recency = +0.1 if last_compiled within 30 days
  contradict = -0.2 per known contradiction
  decay = -0.05 per month since last_compiled
  confidence = clamp(result, 0.1, 1.0)
Report pages with significant changes (delta > 0.1).

## Phase 3: Decay Check
For every wiki page, assign decay status:
- Active: accessed/compiled within 30 days
- Cooling: 30-90 days
- Cold: 90+ days
Update frontmatter and wiki/_index.md.

## Phase 4: Contradiction Detection
Cross-reference wiki pages for conflicts. Propose resolutions based on source recency, count, and confidence. Present for approval.

## Phase 5: Standard Checks (ask before fixing)
- Orphan wiki pages → suggest linking or archiving
- Content pipeline stale entries (30+ days) → suggest action
- Error rules conflicts → suggest resolution
- Cold wiki pages → suggest refresh, archive, or leave

## Phase 6: Report
Auto-fixes applied, confidence changes, decay summary, contradictions, issues needing input, health score, context budget (always-loaded total vs 25K target, from Phase 0.5), stats. Append to wiki/_log.md.
