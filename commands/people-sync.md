# /people-sync — Sync iMessage Threads into a Person's Profile

Refresh `## Recent threads`, propose `## Observed` cited facts, and propose `## History` candidates for the profile at `wiki/people/<Name>.md`. Honors the agent-doesn't-characterize principle: the agent writes only **discrete cited facts**, NEVER characterization. It NEVER writes `## Snapshot`, `## How I show up`, or `## How they show up`.

## Argument

- `/people-sync <Name>` — sync the named profile. `<Name>` must match a file at `wiki/people/<Name>.md`.
- `/people-sync <Name> --window 30d` — override the default 60-day recent-threads window.

## Inputs to read

1. `wiki/people/<Name>.md` — read frontmatter (`imessage-handle`, `last-synced-imessage`, `status`, `relationship`, `category`).
2. After running the export, the latest contents of `raw/imessage/<sanitized-handle>/`.

## Step 1 — Resolve the profile

- Read `wiki/people/<Name>.md`. If the file does not exist, bail with a hint to seed it from `templates/people-profile.md`.
- Pull `imessage-handle` from frontmatter. If missing or set to the placeholder (`<phone-or-email-here>`), bail and ask the user to fill it in.

## Step 2 — Refresh the export

Run the wrapper script. Default window is 60 days; override if the user passed `--window`.

```bash
bash ~/.claude/scripts/imessage-export.sh "<imessage-handle>" --since 60d
```

If the script errors with a missing-binary message, surface the install hint to the user and stop.

## Step 3 — Read the export

Read the txt file(s) in `raw/imessage/<sanitized-handle>/`. Filter to messages within the window. The export is the source of truth; do not infer from your own knowledge of the user's relationships.

## Step 4 — Surface candidates

Three kinds of candidates. Before generating any of them, apply the **primary filter (load-bearing)** to every potential item:

> "Would this belong in `## How they show up`?" If yes, it is **characterization**: surface it in chat as an observation, NEVER as a write candidate. This catches behavioral patterns ("initiates most threads"), emotional-state patterns ("mentioned work stress 3 times"), motivations, and character claims, **regardless of how many messages support them**. No instance count converts a pattern into a fact.

Then route each surviving item by this order: (1) a human-milestone-worthy life event -> History candidate; (2) a stable, discrete, stated fact -> Observed candidate; (3) else -> Recent threads. If a fact is already in `## History`, do not also propose it for `## Observed`.

### Recent threads candidates

Bulleted topic summaries of what's been talked about in the window. For each, include 1-2 verbatim quote anchors so the user can see the substance, not just the agent's gloss. Be conservative: 5 strong threads beats 20 weak ones.

Format per candidate:
```
**Topic:** <short topic phrase>
**Window:** <date range within the export>
**Quotes:**
  > "<verbatim quote from message>" — <speaker>
  > "<verbatim quote>" — <speaker>
**Proposed line for ## Recent threads:**
- <YYYY-MM-DD..YYYY-MM-DD>: <topic phrase> — <one-sentence context>
```

### History candidates (milestone nominations)

Thread sections that look like dateable milestones: move-in dates, big news, joy moments, hard moments, decisions. Default is to skip; the bar should be high. Most syncs surface zero history candidates.

Format per candidate:
```
**Milestone:** <event name>
**Date:** <YYYY-MM-DD as inferred from the messages>
**Quotes:**
  > "<verbatim>" — <speaker>
**Proposed line for ## History:**
- YYYY-MM-DD: <event description>
```

### Observed candidates (durable cited facts)

Discrete, checkable facts that persist beyond the rolling window: a role/job, a city, a named commitment (e.g. "running the Oct half-marathon"), a preference the person STATED (not one you infer from behavior). Each must pass the primary filter above (no characterization). Be conservative; most facts are Recent-threads material, not durable Observed facts.

**Labels (only two, no others):** `self-described` (the person stated it) or `observed` (a discrete event visible in the export). There is NO `inferred` label. The only facts you may infer at all are a birthday/anniversary date or a city; record each as `observed` and cite the messages it was inferred from. Nothing else may be inferred into `## Observed`.

**Dedup:** before surfacing a candidate, check the profile's existing `## Observed` for an entry with the same citation (handle + date) or the same fact; if present, skip it silently (do not re-prompt). This keeps overlapping windows from re-surfacing already-approved facts.

Format per candidate:
```
**Fact:** <discrete checkable fact, agent prose>
**Label:** <self-described | observed>
**Quote:**
  > "<verbatim quote that supports the fact>" (<speaker>)
**Proposed line for ## Observed:**
- <fact> [Source: <handle> | YYYY-MM-DD] (<label>)
```

## Disposition options per candidate

For each candidate, ask the user one of:

1. **Approve as proposed** — write the candidate verbatim into the target section.
2. **Approve with edit** — user supplies the final wording; agent writes that.
3. **Skip** — drop the candidate. Optionally log it in chat for reference.

## Writing rules (load-bearing)

- **Verbatim quotes from iMessage stay quoted.** When writing a Recent thread entry, distinguish topic summary (agent prose) from message quotes (in quotes, attributed by speaker).
- **History entries are dated.** Format: `- YYYY-MM-DD: <event description>`. The user confirms the date.
- **Recent threads is rewritten on each run, strictly between the `<!-- BEGIN recent-threads -->` and `<!-- END recent-threads -->` markers.** Rolling window, not append-only. Never write outside the markers; never delete the markers. The markers are guaranteed present on every profile (new ones from the template, the 5 live ones from the marker migration), so /people-sync can assume them, it does NOT insert markers itself.
- **History is append-only.** New entries match the existing convention in that profile (chronological top or bottom). Read the profile to detect the pattern; ask if ambiguous.
- **Observed is append-only and every entry is cited + labeled.** Format: `- <fact> [Source: <handle> | YYYY-MM-DD] (<label>)` where `<label>` is exactly `self-described` or `observed`. Never rewrite or delete prior entries; a run adds only new approved facts. Never write a behavioral or emotional pattern here regardless of instance count (that is characterization, route to chat). Inference is limited to a date or a city, each citing its basis.
- **Always show the proposed diff** before writing.
- **Update `last-synced-imessage`** in frontmatter to today's date after the run.
- **Update `wiki/people/_index.md`** for this person. The roster is 7 columns:
  `Name | Relationship | Category | Status | Last Synced (iMessage) | Last Synced (Calendar) | Last Synced (Journal)`.
  **Category** sits between Relationship and Status (added in Phase 2 entity model). When
  rewriting a person's row, update only the `Last Synced (iMessage)` cell to today's date
  and **preserve the existing Relationship and Category cells verbatim** — never blank or
  reorder them. (Relationship/Category come from the profile frontmatter, not from this sync.)

## What this command does NOT do

This command WRITES exactly three sections (all per-candidate approval): `## Recent threads` (rolling rewrite between its markers), `## Observed` (append-only cited facts), and `## History` (dated milestone nominations). It does NOT write anything else. In particular:

- Does NOT write to `## Snapshot`, `## How I show up`, or `## How they show up`. These are 100% human-authored. If the agent surfaces an observation that would belong in one of these sections (e.g. "she initiates more often than I do"), surface it in chat as an observation, not as a write candidate.
- Does NOT modify any file other than `wiki/people/<Name>.md` and `wiki/people/_index.md` (last-synced timestamp).
- Does NOT auto-categorize messages by sentiment. The user decides what's a milestone, not the agent.
- Does NOT sync multiple profiles in one run. One person at a time.
- Does NOT write into `journal/` (read-only substrate per error rule #11).
- Does NOT touch the `## Connections` region (graph-managed, written by /reindex between its own `<!-- BEGIN/END connections -->` markers). /people-sync writes only between the recent-threads markers.
- Does NOT commit raw exports. `raw/imessage/` is gitignored; verify after each run.

## When to run

- **Periodically** for active relationships (e.g. monthly for the inner circle, quarterly for broader circle).
- **After a meaningful event** when you want Recent threads to reflect it.
- **Before a conversation** where context would help.

Don't run daily. The export is heavy and the signal-to-noise drops at short windows.

## Privacy notes

- iMessage exports stay in `raw/imessage/<handle>/` (gitignored). Never committed.
- Profile content (synthesized summaries + user-approved verbatim quotes) is the only thing that lands in tracked files.
- Other people's verbatim words enter the substrate only via per-candidate user approval.

## Verification after running

- `git status` shows changes only in `wiki/people/<Name>.md` and `wiki/people/_index.md`.
- No iMessage content in any tracked file outside the target profile (`git diff` audit).
- `## Snapshot`, `## How I show up`, `## How they show up` are byte-identical to before the run.
- Every new `## Observed` line is cited (`[Source: ... | YYYY-MM-DD]`) and labeled (`self-described` | `observed`), states a discrete fact, and contains no behavioral/emotional pattern or characterization.
- `last-synced-imessage` frontmatter equals today's date.
