---
description: Review the brain's derived (auto-generated) graph edges; mark reviewed or reject
---

The user wants to review derived edges (prose `[[wikilinks]]` the brain auto-derived into the
graph as `source: derived, role: references`). Steps:

1. Read `wiki/_derived-edges.md` DIRECTLY (do not query the brain; this is the instant-surface
   path). If the file does not exist, say "No derived-edges artifact yet. Run /reindex (with the
   brain running) to generate it." and stop.
2. Show the `## Pending review` section (the `<!-- BEGIN pending -->` region) as-is, grouped by
   target entity. These are edges created after the `last-reviewed:` watermark (the "new since you
   last looked" set). If empty, say "Nothing pending. All derived edges have been reviewed." and stop.
3. For each pending edge, offer the two-way reject UX (only when the user wants to reject):
   - If the WIKILINK ITSELF is wrong (typo, wrong target): nudge the user to FIX THE SOURCE TEXT
     (open the `from_path` file and correct the `[[...]]`). This is the clean, durable fix; the
     next /reindex drops the bad edge automatically. Do NOT suppress in this case.
   - If the TEXT IS CORRECT but the edge is unwanted (a legitimate mention you do not want as a
     graph edge): call the `suppress_edge` MCP tool (server `mind-lint-brain`) with `from_path`,
     `to_raw`, `role: "references"`, and a short `reason`. This is the durable recourse for the
     residual case. Keep suppression for THIS case only, not a junk drawer.
4. Mark-reviewed: when the user is done (or says "mark all reviewed"), advance the watermark.
   - The new watermark = the file's CURRENT `pending-through:` value (read it directly from inside
     the `<!-- BEGIN watermark -->` region in `wiki/_derived-edges.md`, do NOT issue a fresh live
     `derived_edges` query). This is the load-bearing M2 fix: `pending-through` was computed by
     /reindex as the max `created_at` of the FULL pending set that was SHOWN, so setting
     `last-reviewed := pending-through` advances the watermark to the max of what was shown and
     NEVER past unshown edges (an edge created after this render carries a later `created_at` than
     `pending-through`, so it stays pending on the next /reindex). If `pending-through` is "never"
     (nothing was pending), leave `last-reviewed` unchanged.
   - Rewrite ONLY the `last-reviewed:` line inside the `<!-- BEGIN watermark -->` region to that
     value. Leave every other byte untouched (the `pending-through:` line, the markers, Pending,
     History, Suppressed) EXCEPT the History append below.
   - History append (marker contract, mirrors Task 8): copy the existing
     `<!-- BEGIN history -->` ... `<!-- END history -->` block BYTE-FOR-BYTE and INSERT the new
     line(s) immediately BEFORE the `<!-- END history -->` marker; never rewrite or reformat a
     prior History line. Append `- <today ISO date>: reviewed-through <new watermark>` (and, if any
     suppressions were added this session, also `- <today ISO date>: suppressed <from_path> -> <to_raw>`).
5. If the user only wants to suppress without marking reviewed, do step 3 and skip step 4.
6. The brain must be running ONLY for the suppress action (step 3 second branch); reading the
   artifact and advancing the mark-reviewed watermark are entirely vault-side (no brain needed).
   If the brain is down when a suppress is requested, tell the user it is unreachable and how to
   start it (`cd ~/.claude/brain && npm run serve`).
