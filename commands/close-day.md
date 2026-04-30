# /close-day — End-of-Day Review

Produce a structured EOD review and write it into today's daily note's `## Review` section. **This is the only command that writes into a daily note.**

## Inputs to read

- **Today's daily note** at `journal/$(date +%Y-%m)/$(date +%Y-%m-%d).md`. Read all sections: `## Calendar`, `## Plan`, `## Notes`, `## Tasks`. Use them as the substrate for the review.
- **Today's calendar** (live MCP query if needed, otherwise use the populated `## Calendar` section).
- Don't read other days. The review is about today.

## Output

Write into today's note's `## Review` section ONLY. Replace any existing content (the placeholder comment, or a prior review if the command is being re-run). Do not touch any other section, file, or content.

## Review format

```markdown
## Review

**What got done**
- [Concrete things that landed today, pulled from ## Tasks checkmarks, ## Notes signals, calendar events that produced outcomes]

**What didn't**
- [Items from ## Plan or ## Tasks that are unfinished, with one-line "why" if the daily note suggests it (got pulled into something else, blocked on X, deprioritized, etc.)]

**Action items rolling forward**
- [ ] [Concrete task to surface in tomorrow's ## Tasks section — the user copies these manually next morning, or future tooling promotes them automatically]

**Notable from today**
- [One or two observations from ## Notes worth flagging — interesting connections, tagged ideas worth /graduate-ing later, or a moment worth remembering. Brief.]
```

Scale the sections to the day's actual content. A light day gets a light review; a heavy day gets more.

## Reasoning principles

- **Reflect, don't editorialize.** The review is a structured surface of what the daily note already says, not a narrative essay.
- **Pull verbatim where possible.** If `## Notes` says "tried X, didn't work because Y," echo that phrasing in `What didn't`. Don't paraphrase into agent-voice.
- **Action items must be concrete.** "Continue work on Project X" is not actionable. "Send draft of section 3 to Y for review" is.
- **Notable items are signal, not summary.** This isn't a list of everything that happened; it's the one or two threads worth remembering.

## The strict scope rule (load-bearing)

This command writes into `journal/$(date +%Y-%m)/$(date +%Y-%m-%d).md` `## Review` section ONLY.

- Does NOT write to `memory/learnings/`, `memory/decisions/`, `wiki/`, `content/ideas/`, or any other location.
- Does NOT modify other sections of the daily note.
- Does NOT modify other daily notes (yesterday's, tomorrow's).
- Does NOT auto-extract learnings, decisions, or content ideas. Capture happens through `/log` (manual) or `/graduate` (human-gated review).

This rule exists because the daily-notes substrate must stay pure-human-input for future pattern-detection commands (`/drift`, `/trace`, `/connect`, etc.) to operate on uncontaminated signal. The single agent-owned section (`## Review`) is the narrow, conventional exception. See error rule #11.

## Verification after running

- `git status` should show only today's daily note modified.
- The `## Review` section is populated; other sections unchanged.
- No files in `memory/`, `wiki/`, `content/`, or `rules/` were touched.
