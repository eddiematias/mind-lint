---
description: Enumerate a person/company/project's graph connections via the brain service
---

The user wants the complete set of graph connections for an entity. Steps:

## Arguments

- `entity` (required): a `[[Name]]`, a bare name, or an entity path. The rest of `$ARGUMENTS`
  after the entity name is checked for flags below.
- `--includeMentions` (optional flag): opt in to the lower-trust mention layer (see step 5).
  Default: omitted (mention layer hidden).

## Steps

1. Call the `connections` MCP tool (server `mind-lint-brain`) with `entity` = the entity portion
   of `$ARGUMENTS`. Pass `direction: "both"` unless the user asked for a specific direction; pass
   `depth` only if the user asked for a multi-hop walk. If `--includeMentions` was given in the
   arguments, also pass `includeMentions: true`; otherwise omit it entirely (tool default is false,
   which hides derived mention edges from the result).
2. If the tool is unavailable, tell the user the brain service is not running and how to start it
   (`cd ~/.claude/brain && npm run serve`), then stop.
3. The tool returns `{ entity, resolved, seed, rows }` where each row has `from`, `to`, `role`,
   `source`, `category`, `hop`, `resolved`. Handle the three cases distinctly:
   - **`resolved: false`** → the entity was not found. Say "No such entity: <name>. (Did you mean a
     person/company/project that exists under wiki/?)" and stop. Do NOT conflate this with edgeless.
   - **`resolved: true` and `rows` is empty** → the entity exists but has no edges. Say
     "<name> has no connections recorded yet." (It is a real, edgeless entity, e.g. a solo project
     or a person with `affiliations: []`.)
   - **`resolved: true` and `rows` non-empty** → present a readable rollup, grouped and LABELED
     BY PROVENANCE (each row carries a `source` field):
     - Hand-authored affiliations (`source: "human"`): "JBR is affiliated with: Jeff Perera
       (founded), Danielle Perera (founded), Justin Wetherill (president), Otus Coffee (acquired),
       JBR website (owns)."
     - Derived references (`source: "derived"`, `role: "references"`): list these SEPARATELY under
       "also referenced in:" with a count and the source files, e.g. "also referenced in: 12 notes
       (journal/2026-06-19.md, memory/decisions/..., ...)." These are auto-derived from prose
       `[[wikilinks]]`; they are trustworthy (a human wrote the link) but are shown distinctly from
       curated affiliations so the two are never conflated.
4. List any unresolved targets (`resolved: false` on a ROW, `to` is null) separately as
   "+ N unprofiled targets: [[Name]], ..." (these name who/what deserves a profile). (Note: a row's
   `resolved` field is per-edge-target; the top-level `resolved` field is whether the SEED entity
   itself was found — don't confuse the two.)
5. **Mention layer (opt-in only, `--includeMentions`):** when `--includeMentions` was passed,
   `rows` will also include `source: "derived", role: "mentions"` entries. These are bare-prose
   mentions: the entity name appeared in plain text without a wikilink. They are lower-trust than
   references (no human wikilink, auto-derived by name-scan) and are quarantined by default.
   Render them in a SEPARATE block, clearly labeled and visually distinct from affiliations and
   references. Use wording like:

     "also mentioned in (unlinked): 4 notes
      (journal/2026-06-10.md, content/ideas/..., ...)"

   Omit this block entirely when `--includeMentions` was not given (default path: no mention rows
   will be present in `rows`; do not add any mention section).
6. This is enumeration, not best-match: report every row, completely. Do not summarize away edges.
