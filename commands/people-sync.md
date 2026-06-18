# /people-sync — Sync iMessage Threads into a Person's Profile

Refresh `## Recent threads` and propose `## History` candidates for the profile at `wiki/people/<Name>.md`. Honors the human-authored-relational-sections principle: NEVER writes `## Snapshot`, `## How I show up`, or `## How they show up`.

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

Two kinds of candidates:

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

## Disposition options per candidate

For each candidate, ask the user one of:

1. **Approve as proposed** — write the candidate verbatim into the target section.
2. **Approve with edit** — user supplies the final wording; agent writes that.
3. **Skip** — drop the candidate. Optionally log it in chat for reference.

## Writing rules (load-bearing)

- **Verbatim quotes from iMessage stay quoted.** When writing a Recent thread entry, distinguish topic summary (agent prose) from message quotes (in quotes, attributed by speaker).
- **History entries are dated.** Format: `- YYYY-MM-DD: <event description>`. The user confirms the date.
- **Recent threads is rewritten on each run.** Rolling window, not append-only.
- **History is append-only.** New entries match the existing convention in that profile (chronological top or bottom). Read the profile to detect the pattern; ask if ambiguous.
- **Always show the proposed diff** before writing.
- **Update `last-synced-imessage`** in frontmatter to today's date after the run.
- **Update `wiki/people/_index.md`** for this person. The roster is 7 columns:
  `Name | Relationship | Category | Status | Last Synced (iMessage) | Last Synced (Calendar) | Last Synced (Journal)`.
  **Category** sits between Relationship and Status (added in Phase 2 entity model). When
  rewriting a person's row, update only the `Last Synced (iMessage)` cell to today's date
  and **preserve the existing Relationship and Category cells verbatim** — never blank or
  reorder them. (Relationship/Category come from the profile frontmatter, not from this sync.)

## What this command does NOT do

- Does NOT write to `## Snapshot`, `## How I show up`, or `## How they show up`. These are 100% human-authored. If the agent surfaces an observation that would belong in one of these sections (e.g. "she initiates more often than I do"), surface it in chat as an observation, not as a write candidate.
- Does NOT modify any file other than `wiki/people/<Name>.md` and `wiki/people/_index.md` (last-synced timestamp).
- Does NOT auto-categorize messages by sentiment. The user decides what's a milestone, not the agent.
- Does NOT sync multiple profiles in one run. One person at a time.
- Does NOT write into `journal/` (read-only substrate per error rule #11).
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
- `last-synced-imessage` frontmatter equals today's date.
