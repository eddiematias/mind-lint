# /lint — Knowledge Base Health Check
# Based on LLM Wiki v2 by Rohit Ghumare, extending Karpathy's original pattern

Full health check with confidence recalculation, decay management, and self-healing.

## Phase 0: Reindex
Run /reindex to sync all indexes with actual directory contents.

## Phase 1: Auto-Fix (no confirmation needed)
- Index files out of sync → fix indexes
- Wiki pages missing frontmatter fields → add defaults
- Broken [[cross-references]] → remove link, log removal
- Missing Supersession Log or Entities sections → add empty sections
- raw/_index.md entries for deleted files → remove entries

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
Auto-fixes applied, confidence changes, decay summary, contradictions, issues needing input, health score, stats. Append to wiki/_log.md.
