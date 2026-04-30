# /today — Morning Plan from Calendar + Notes + Active Projects

Read the substrate and produce a prioritized day plan into today's daily note's `## Plan` section.

## Inputs to read

- **Today's daily note** at `journal/$(date +%Y-%m)/$(date +%Y-%m-%d).md` — must already exist (created by launchd at 10:30 AM or by SessionStart hook). The `## Calendar` section should be populated with today's events.
- **Yesterday's daily note** at `journal/$(date -v-1d +%Y-%m)/$(date -v-1d +%Y-%m-%d).md` if it exists — read the `## Tasks` section for rollover items and the `## Review` section for unfinished work.
- **Last 7 days of daily notes** — scan for recurring themes, ideas tagged `#idea`, and ongoing projects mentioned multiple times.
- **`context/active-projects.md`** — current focus items per project.
- **`context/personal-workflow.md`** if it exists — typical day structure, focus windows, work preferences.
- **Live calendar queries** if conversational follow-ups need them (Apple EventKit MCP for personal, Anthropic Google Workspace connector for work).

## Output

Write into today's note's `## Plan` section ONLY. Do not modify any other section, file, or content elsewhere in the vault. Replace the placeholder comment in `## Plan` with structured plan content.

## Plan format

A prioritized list grouped by time block or theme, scaled to what the calendar and substrate suggest. Suggested shape:

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

Adapt the format to the day. If the calendar is empty, lead with project nudges. If today is a focus day with one big item, simplify accordingly.

## Reasoning principles

- **Prioritize, don't list.** A plan is a stack-rank, not an inventory.
- **Reference the substrate, do not paraphrase it.** If yesterday's review noted a stuck task, surface that exact phrasing.
- **Connect calendar to substance.** "10am team standup" is a calendar item; "10am team standup — bring updated launch timeline" is a plan item.
- **Honor declared focus.** If `active-projects.md` says current focus on X, the plan should reflect X. If the calendar says otherwise, surface the conflict explicitly rather than silently bias toward what the calendar dictates.

## What this command does NOT do

- It does not write into `## Notes`, `## Tasks`, `## Review`, `## Calendar`, or any section other than `## Plan`.
- It does not create, edit, or delete any file other than today's daily note.
- It does not auto-extract learnings, decisions, or content ideas. Capture happens through `/log` (manual) or `/graduate` (human-gated review).

## Verification after running

- `git status` should show only today's daily note modified.
- The `## Plan` section is populated; other sections unchanged.
