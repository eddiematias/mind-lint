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

## Possible supersessions (facts)

1. Call the `supersessions_pending` MCP tool (server `mind-lint-brain`) with `{ excludePathSubstrings: ["bakebot"], limit: 20 }`. It returns `{ pending, totalPending, hiddenByFilter }`, where each `pending` item has `id`, `verdict`, `confidence`, `loser {sourcePath, claim}`, `winner {sourcePath, claim}`, `axis`, `loserDecided`, `proposedOn`. The tool already drops ids that are decided (in `_supersession-decisions.md`) or settled in the proposals `## lifecycle`, sorts by confidence descending, hides archived-project proposals (the `excludePathSubstrings` filter), and caps the batch at `limit`. If the brain is unreachable, tell Eddie it is not running and stop this phase. (Adjust the args on request: raise `limit`, drop `minConfidence`, or clear `excludePathSubstrings` to include the archived pile.)
2. State the counts first: "showing `<pending.length>` of `<totalPending>` pending, `<hiddenByFilter>` archived/filtered hidden." NEVER imply the batch is the whole queue. Then present the WHOLE batch as a single scannable markdown table (this format is REQUIRED — Eddie reviews far faster from a table than from prose), one row per proposal:

   | # | What changed (struck -> kept) | Pick loser? | My lean |

   - **#** — 1-based index within the batch.
   - **What changed** — a terse one-line summary of `loser.claim` -> `winner.claim` (struck side left, surviving side right). Shape, not the full claims.
   - **Pick loser?** — a ⚠ marker when `loserDecided` is false (the engine did not lock direction, so a confirm must record `loser=<path>`); blank when true. Flag dups and same-file pairs inline.
   - **My lean** — the recommendation for that row (Confirm / Dismiss / Skip) + a 2-4 word reason. Sanity-check direction before recommending Confirm:
     - If the struck side is actually the CURRENT truth and the surviving side is the older/plan state, the pairing is INVERTED. Dismiss it — UNLESS `loser` and `winner` are DIFFERENT files, in which case Confirm with `loser` flipped to the correct path. A same-file inverted pair cannot be flipped via `loser=<path>`, so Dismiss.
     - If both claims are compatible (a rationale plus the change it explains, an origin story plus an added detail), it is NOT a real supersession. Dismiss.
     - Skip only when the call genuinely needs Eddie's input (e.g. a fact you cannot verify).

   `axis` and `confidence` are available on request but stay out of the default table (they are usually noise — most proposals sit at the same confidence).
3. Under the table, give a one-line recommended call summarizing the leans (e.g. "Confirm 13 (rows ...), Dismiss 6 (...), Skip 1 (...)"), then ask Eddie for a single go-ahead or per-row overrides. Do NOT walk the rows one at a time unless he asks. Confirm = apply the strike; dismiss = never propose again; skip = leave pending (no line written). Record decisions (step 4) only after he approves.
4. Write his decisions to `memory/facts/_supersession-decisions.md` (APPEND one line per decision; this file is human/laptop-owned, the cycle only reads it). Create it with this header on first write:
   ```
   # Supersession decisions
   <!-- Human-owned, append-only. One line per decision: <id>: confirmed|dismissed [loser=<path>]. The dream cycle applies confirmed strikes and records dismissals; never hand-edit the proposals file. -->
   ```
   Then one line per decision:
   - `<id>: confirmed` (or `<id>: confirmed loser=<sourcePath>` when `loserDecided` is false and Eddie picks the loser; if he will not pick, treat it as a skip and write nothing)
   - `<id>: dismissed`
   Do not double-decide within a run: track the ids you already wrote this session.
5. Do NOT edit `_supersession-proposals.md` or any `memory/facts/*.md` fact file. Because the decisions file is append-only and `supersessions_pending` excludes decided ids, re-running continues where you left off, tell Eddie how many remain (`totalPending` minus what he just decided) and that he can re-run to keep going. The next nightly cycle applies confirmed strikes (it is the sole fact-file writer), or he can run `brain dream` to apply sooner. Reversal later is: un-strike the fact in its file; the cycle records that as a dismissal.
6. SYNC CAVEAT (this file is written on the LAPTOP vault; the dream-cycle runs on the Mini against its own vault clone). Confirmed strikes only land after the decisions file reaches `origin` AND the Mini pulls it: the SessionEnd auto-commit hook commits + `pull --rebase` + pushes to `mind-lint-personal`, then the dream-cycle's `pullVault()` (its first step) pulls before dreaming. So the realistic path is: end session (or manually commit + push the vault) -> nightly cycle (or `brain dream`) picks it up. The `supersessions_pending` resume also depends on this: within one session, BEFORE the push, a plain re-run re-serves the SAME batch (the Mini can't see the new decisions yet). To keep going pre-sync, raise `limit` past what you have already decided and act only on the unseen tail.
