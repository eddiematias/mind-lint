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

7. Regenerate the derived `## Connections` region for each entity file (net-new behavior;
   the brain service stays read-only on the vault, so this markdown transform runs here).
   For EACH .md file under wiki/people/, wiki/companies/, wiki/projects/ (excluding _index.md):
   - Read the file's `affiliations` frontmatter.
   - If `affiliations` is empty or absent: ensure NO `## Connections` region exists (remove a
     stale one if present, between its `<!-- BEGIN connections ... -->` / `<!-- END connections -->`
     markers, including the `## Connections` heading AND the single blank line that preceded it).
     Write nothing otherwise. (M4) An edgeless person keeps its recent-threads markers (from the
     marker migration) but gets NO Connections region.
   - Otherwise build the region body: group affiliations by `role`, and for each role emit
     `- <role> → [[Target1]], [[Target2]]` using each affiliation's verbatim `target` wikilink.
   - EXACT byte layout (pin it): the region is `<BEGIN-marker>\n## Connections\n<one line per role>\n<END-marker>`,
     i.e.
     ```
     <!-- BEGIN connections (auto-generated from affiliations: do not edit) -->
     ## Connections
     - <role> → [[...]], [[...]]
     <!-- END connections -->
     ```
   - Placement: the region goes at the BOTTOM of the file, separated from the preceding content by
     EXACTLY ONE blank line. For people files, that preceding content ends at the
     `<!-- END recent-threads -->` marker (guaranteed present by the marker migration), so the region
     goes after it. For companies/projects (no recent-threads region), it is simply the last block.
   - The file ends with EXACTLY ONE trailing `\n` after `<!-- END connections -->`. No second blank
     line, no trailing whitespace.
   - Write only the managed region (and its single leading blank line): if a region already exists,
     replace it in place and leave every other byte (frontmatter, human sections, the recent-threads
     region) byte-identical. If no region exists, append one with the layout above.
   - Normalize the file to end with exactly one trailing newline (M-newline), so repeated runs are
     byte-idempotent on files that today end without a trailing blank line (e.g. wiki/companies/JBR.md).
   - This region is a regenerated VIEW of the `affiliations` source of truth, not a second
     source: never hand-edit it, and never write wikilinks into human-authored prose sections.

8. Render the derived-edges review artifact at `wiki/_derived-edges.md` (the exception channel
   for slice-1 autonomous writes). The brain owns the edges; this step renders them vault-side
   (the brain stays read-only on the vault). The byte layout is PINNED with HTML-comment markers
   (see the "EXACT artifact layout" block below and the marker contract): a marker-fenced watermark
   header (last-reviewed, pending-through), then the marker-fenced ## Pending review / ## History
   / ## Suppressed / ## Mentions (current) regions.
   - Read the EXISTING `wiki/_derived-edges.md` if present, and extract its `last-reviewed: <ISO>`
     watermark line (from inside the `<!-- BEGIN watermark -->` region) and its ENTIRE
     `<!-- BEGIN history -->` ... `<!-- END history -->` block VERBATIM (markers, heading, and
     every existing `- ` line). If the file does not exist, the watermark is "never" (everything
     is pending) and the History block starts empty (just the markers + heading).
   - CALL 1 (references, push-tier): Call the `derived_edges` MCP tool (server `mind-lint-brain`)
     with `since` = the existing watermark (omit `since` if the watermark is "never"). It returns
     `{ rows, suppressions }`. After accumulating all pages (see paging below), filter the
     accumulated rows to `role === 'references'` before grouping into `## Pending review`. This
     one-line guard prevents mention rows from leaking into the references push surface (C5): since
     `listDerivedEdges` returns both roles, all references-only rendering logic (pending grouping,
     pending-through watermark, History delta gate) operates only on references rows.
   - RENDER THE FULL PENDING SET (references), not a truncated page (C-1, M2). The tool signature
     is `since` + `limit` (default 500). On the first run the whole historical vault derives at
     once (likely more than 500 edges), so a single capped call would drop the oldest pending
     edges below the fold; if `pending-through` were then set to the max of that truncated page,
     the dropped edges would fall behind the watermark and never be reviewed. To avoid that,
     PAGE until the result is exhausted: call `derived_edges` with an explicit large `limit`
     (e.g. 5000); if the call returns exactly `limit` rows, call again with the same `since` and
     a larger `limit` (the tool is a strict `created_at > since` lower-bound query with no offset
     cursor, so growing `limit` is the only correct way to page deeper, never re-passing `since`)
     and accumulate, repeating until fewer-than-`limit` rows come back. Accumulate ALL rows across
     pages before filtering and rendering. (For a single-human vault one large-limit call almost
     always suffices; the loop is the correctness guarantee that no edge is ever silently truncated.)
   - CALL 2 (mentions, pull-tier): After completing Call 1, make a SEPARATE `derived_edges` call
     with `since` OMITTED entirely (fetches the FULL current mentions set, not just new-since-watermark).
     Page this call the same way as Call 1 (same large `limit`, grow-and-retry loop). Filter the
     accumulated rows to `role === 'mentions'`. This is the source for the `## Mentions (current)`
     region. NO watermark is read or written for mentions (pull-tier, decision 7). If Call 1 was
     skipped because the brain was unreachable, skip Call 2 and the mentions region as well.
   - If the tool is UNAVAILABLE (brain not running): SKIP this step entirely, leave any existing
     `wiki/_derived-edges.md` untouched, and note in the /reindex report "derived-edges artifact
     skipped: brain unreachable." The rest of /reindex is unaffected. Do NOT write a partial file.
   - Otherwise rewrite `wiki/_derived-edges.md` with these marker-fenced regions (keep all
     `<!-- BEGIN ... -->` / `<!-- END ... -->` markers exactly as pinned):
     - The `<!-- BEGIN watermark -->` region (two lines):
       `last-reviewed: <the PRESERVED existing watermark, or "never">`. Never advance it here
       (that is /review-derived's job, M2): read it from the existing file and write it back unchanged.
       `pending-through: <the MAX created_at among the references rows rendered below>`. Compute it
       from the FULL accumulated references-only pending set (all pages), not a single truncated
       page. If the set is empty, carry the existing `last-reviewed` value forward (never regress
       below it). Because the artifact renders the full pending set, max(shown) equals max(all
       pending); no edge is ever advanced-past unshown.
     - The `<!-- BEGIN pending -->` region (`## Pending review`): the FULL accumulated rows
       filtered to `role === 'references'` (which are already `created_at > watermark`), grouped
       by target entity (`to_path` basename). Each line: `- <from_path>: "<context>"`, single line,
       `- ` prefix, NO per-edge timestamp in the visible line (pending-through is the machine-readable
       watermark). Lightweight: this is an audit surface, not a gate. If empty, write "None."
       Regenerated in full between the markers.
     - The `<!-- BEGIN history -->` region (`## History`): copy the PRESERVED existing History block
       BYTE-FOR-BYTE (markers, heading, every prior `- ` line), and append a new line ONLY when there
       is a delta (Att-6, see below). Insert any new line immediately BEFORE the `<!-- END history -->`
       marker. Never rewrite, reorder, or reformat a prior History line.
       - Delta gate (Att-6): append a History line ONLY when this render changed something:
         N>0 new pending references edges since the last render, OR a vanished/cleanup occurred (an
         edge or suppression appeared or disappeared). On a true no-op reindex (nothing new, nothing
         vanished, e.g. the scheduled Mini reindex on an unchanged corpus), append NOTHING, so
         History does not fill with "rendered 0 pending" noise. When a line IS appended, it reads:
         `- <today ISO date>: rendered N pending derived edge(s) across M source file(s); reviewed-through <watermark or never>`.
     - The `<!-- BEGIN suppressed -->` region (`## Suppressed`): the returned `suppressions` (from
       Call 1), one line each: `- <from_path> -> <to_raw> (<reason>)`. If empty, write "None."
       Regenerated in full between the markers.
     - The `<!-- BEGIN mentions -->` region (`## Mentions (current)`): the FULL current mentions set
       (from Call 2, filtered to `role === 'mentions'`), grouped by target entity (`to_path`
       basename). For each target group, render the group header as the basename (no punctuation),
       then each source file on its own line: `- <from_path>: "<context>"`. If the full set is
       empty, write "None." Regenerated in full between the markers on every reindex. NO watermark
       line, NO pending-through, NO history/delta gate for this region (pull-tier: mentions are
       inspected on demand, not pushed for review).
   - EXACT artifact layout (pinned, byte-identical across all three writers):
     ```
     <!-- BEGIN watermark (auto-managed: do not edit) -->
     last-reviewed: <ISO timestamp | never>
     pending-through: <ISO timestamp | never>
     <!-- END watermark -->

     <!-- BEGIN pending (auto-generated: do not edit) -->
     ## Pending review
     - <from_path>: "<context>"
     - <from_path>: "<context>"
     <!-- END pending -->

     <!-- BEGIN history (append-only: copy verbatim, only append before END) -->
     ## History
     - <ISO date>: <append-only log line>
     <!-- END history -->

     <!-- BEGIN suppressed (auto-generated: do not edit) -->
     ## Suppressed
     - <from_path> -> <to_raw> (<reason>)
     <!-- END suppressed -->

     <!-- BEGIN mentions (auto-generated: do not edit) -->
     ## Mentions (current)
     <target basename>
     - <from_path>: "<context>"
     <!-- END mentions -->
     ```
   - Marker contract (I-3, mirrors the Connections-region precedent above): three writers touch
     this file idempotently (/reindex rewrites watermark's pending-through + Pending + Suppressed
     + Mentions and PRESERVES History; /review-derived rewrites watermark's last-reviewed + appends
     one History line; the SessionStart hook only READS Pending). Every machine-managed region is
     wrapped in explicit `<!-- BEGIN <region> -->` / `<!-- END <region> -->` markers so no LLM
     rewrite silently drops or reformats prior content. The watermark's `last-reviewed:` line is
     strictly /review-derived's domain: /reindex reads it and writes it back UNCHANGED. The
     `## Mentions (current)` region has NO watermark of its own and NO history/delta gate: it is
     a full-set, pull-tier inspection view regenerated on every reindex from Call 2's results.
   - This file is agent-owned (like wiki/_log.md); never treated as human substrate, never
     hand-edited. It is the read surface for /review-derived and the SessionStart count.
