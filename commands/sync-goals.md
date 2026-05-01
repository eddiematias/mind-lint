# /sync-goals — Sync Daily-Note Goal Reflections into context/goals.md

Scan recent daily notes for goal-related content, surface candidates as **verbatim quotes**, route user-approved promotions into `context/goals.md`. Honors the agent-doesn't-write-user-authored-content principle by quoting verbatim and routing only on per-candidate user approval.

## Argument

Optional time window:
- `/sync-goals` — defaults to last 30 days
- `/sync-goals 7d` — last 7 days
- `/sync-goals 90d` — last 90 days
- `/sync-goals quarter` — current calendar quarter
- `/sync-goals since 2026-04-15` — explicit start date

## Inputs to read

- Daily notes in `journal/YYYY-MM-DD.md` within the window. Read each file's `## Notes` and `## Plan` sections.
- `context/goals.md` — to know current state, avoid suggesting things already in Current.

## What to surface

Two kinds of candidates:

1. **Explicit `[[goals]]` wikilink mentions.** Pull the surrounding sentence or paragraph as context. Highest signal — the user already flagged this as goal-related.

2. **Goal-shaped sentences the agent judges might be goals.** Aspirations, "I want to," "trying to," "by [date] I will," "the dream is." Be conservative — better to surface 3 strong candidates than 15 weak ones. The user's `## Notes` are deliberately free-form; not every aspirational phrase is a goal.

For each candidate, present:
- **Source:** `journal/YYYY-MM-DD.md`
- **Excerpt:** the verbatim sentence or paragraph (no paraphrasing)
- **Tentative classification:** new goal vs shift to an existing goal vs reflection-only
- **Suggested destination:** add to Current / log as Recent shift / archive an existing goal / skip

## Disposition options per candidate

For each candidate, ask the user one of these:

1. **Add to Current** — a new goal joining the active list. The user can confirm the proposed wording or edit it before write. Default wording is verbatim from the daily note.

2. **Log as Recent shift** — captures HOW a goal evolved. The shift entry uses the user's verbatim language. Format: `YYYY-MM-DD: <verbatim or user-edited line>`.

3. **Archive an existing goal** — if the candidate suggests retirement of a current goal (e.g. "I'm not really chasing X anymore," "I've stopped caring about Y"), move it from Current to Archived with today's date. Confirm which Current goal is being archived.

4. **Skip** — reflection that doesn't warrant a goals.md change. The candidate is logged in this session's chat output for reference but does not get processed.

## Writing rules (load-bearing)

- **Verbatim only.** Quote the user's daily-note language. The agent does not paraphrase into "agent voice."
- **The user can edit the proposed wording before write.** This is gating, not blind approval. The agent shows the proposed line; the user confirms or edits; the agent writes the final user-confirmed text.
- **Always show the proposed diff** (what gets added/changed/removed in `context/goals.md`) before writing.
- **Date every Recent shift entry** with today's date in `YYYY-MM-DD` format.
- **Newest-first in Recent shifts.** New shifts go at the top of the section.

## What this command does NOT do

- Does not auto-add goals without user approval per candidate.
- Does not modify daily notes (`journal/` stays read-only per error rule #11).
- Does not paraphrase. If the user's prose doesn't fit cleanly into the goals.md format, the agent asks the user to rephrase rather than rephrasing on their behalf.
- Does not write to any file other than `context/goals.md`.

## When to run

- **Quarterly** is the natural cadence. Goals don't churn daily — that produces noise.
- **After a major life event or project shift** that materially changes what you're chasing.
- **When goals.md feels stale** — drifted from what you actually believe right now when you read it.

Don't run daily. The substrate (`journal/`) accumulates over time; goals.md is the periodic snapshot. The whole point of the read-only-substrate convention is that the canonical state files don't churn.

## Verification after running

- `git status` shows changes only in `context/goals.md`.
- No writes to `journal/`, `memory/`, `wiki/`, `rules/`, or any other location.
- The user has approved every individual write that landed in `context/goals.md`.
