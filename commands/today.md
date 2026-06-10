# /today — Morning Plan from Calendar + Notes + Active Projects

On-demand calendar federation + day plan. No cron, no AppleScript-at-creation. The agent fetches today's events from both calendar sources, writes the `## Calendar` block, then synthesizes a prioritized `## Plan` from the substrate.

## Step 1 — Ensure today's note exists

The daily note lives at `journal/$(date +%Y-%m-%d).md` (flat layout).

If it doesn't exist, create it by running:

```bash
bash ~/.claude/scripts/daily-note.sh
```

This is idempotent — if the note already exists, it's a no-op. The script renders the template at `templates/daily-note.md`. After this runs, the `## Calendar` block exists with empty `<!-- AUTO-CALENDAR-START -->` / `<!-- AUTO-CALENDAR-END -->` sentinels ready to populate.

## Step 2 — Fetch calendar events (both sources, in parallel)

Call both lookups in a single message so they run concurrently.

### iCloud / Calendar.app (personal, family, Exchange — anything Calendar.app federates except Google)

```bash
bash ~/.claude/scripts/icloud-events.sh
```

Returns markdown bullets, one per event (`- **TIME** — SUMMARY _(CALENDAR)_`). The script intentionally excludes Google-account calendars to avoid double-counting with the MCP path. Empty output = no iCloud events today.

### Google Workspace (your connected account)

Use the Google Calendar MCP tool `mcp__claude_ai_Google_Calendar__list_events` with:
- `startTime`: today at 00:00:00 in the user's local timezone
- `endTime`: tomorrow at 00:00:00 in the user's local timezone
- `pageSize`: 50
- (default `calendarId` = primary)

Format each event as `- **H:MM AM/PM** — SUMMARY _(Work)_`. Use the event's `start.dateTime` (or `start.date` for all-day → "All day"). Skip events where the user's `responseStatus` is `declined`.

If the connector is unavailable or returns an error, continue without Google events and note in chat that the work calendar wasn't reachable.

## Step 3 — Write the `## Calendar` block

Combine personal + work events, sort chronologically (all-day events first), and write between the `<!-- AUTO-CALENDAR-START -->` and `<!-- AUTO-CALENDAR-END -->` sentinels in today's note. Replace whatever's currently in that block.

If both sources returned zero events, write `_No events today._` between the sentinels.

## Step 4 — Read the rest of the substrate

- **Yesterday's daily note** at `journal/$(date -v-1d +%Y-%m-%d).md` if it exists — read `## Tasks` for rollover items and `## Review` for unfinished work.
- **Last 7 days of daily notes** — scan for recurring themes, ideas tagged `#idea`, and ongoing projects mentioned multiple times.
- **`context/active-projects.md`** — current focus items per project.
- **`context/personal-workflow.md`** if it exists — typical day structure.

## Step 5 — Write `## Plan`

Replace the placeholder comment in `## Plan` with structured plan content. Format:

```markdown
## Plan

**Top priority for today**
- [ ] [The single most important thing, named as a concrete outcome]

**Anchored to calendar**
- HH:MM — [Event from ## Calendar] — [What you should bring/prepare/do]

**Carry-over from yesterday**
- [ ] [Task or unfinished item from yesterday's ## Tasks or ## Review]

**Active project nudges**
- [Project from active-projects.md]: [next concrete step suggested by recent daily notes]

**Open questions**
- [Anything the substrate suggests is worth thinking about today, framed as a question]
```

Adapt the format to the day. If the calendar is empty, lead with project nudges. If today is a focus day with one big item, simplify.

## Reasoning principles

- **Prioritize, don't list.** A plan is a stack-rank, not an inventory.
- **Reference the substrate, do not paraphrase it.** If yesterday's review noted a stuck task, surface that exact phrasing.
- **Connect calendar to substance.** "10am team standup" is a calendar item; "10am team standup — bring updated launch timeline" is a plan item.
- **Honor declared focus.** If `active-projects.md` says current focus on X, the plan should reflect X. If the calendar says otherwise, surface the conflict explicitly.

## What this command writes

- `## Calendar` (between the sentinels)
- `## Plan`

## What this command does NOT do

- It does not write into `## Notes`, `## Tasks`, or `## Review`.
- It does not create, edit, or delete any file other than today's daily note.
- It does not auto-extract learnings, decisions, or content ideas. Capture happens through `/log` (manual) or `/graduate` (human-gated review).

## Verification after running

- `git status` should show only today's daily note modified.
- `## Calendar` and `## Plan` are populated; `## Notes`, `## Tasks`, `## Review` unchanged.
