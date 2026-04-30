# /graduate — Surface Daily-Note Ideas for Promotion

Scan recent daily notes for ideas worth promoting to standalone notes, content pipeline entries, or learnings. **Human-gated:** the agent surfaces candidates and asks; the user decides and writes.

## Argument

Optional time window:
- `/graduate` — defaults to last 7 days
- `/graduate 14d` — last 14 days
- `/graduate 30d` — last 30 days
- `/graduate week` — current calendar week
- `/graduate since 2026-04-15` — explicit start date

## Inputs to read

- Daily notes in `journal/YYYY-MM/YYYY-MM-DD.md` within the window. Read each file's `## Notes` and `## Tasks` sections.
- Existing `content/_pipeline.md` (to avoid duplicate content idea suggestions).
- Existing `memory/learnings/index.md` (to detect candidate learnings already captured).
- Existing wiki/_index.md (to suggest cross-references to compiled topics).

## What to surface

Two kinds of candidates:

1. **Explicit `#idea` tags.** Any inline `#idea` (or `#idea-tool`, `#idea-content`, etc. — variants count) in `## Notes`. Pull the surrounding sentence or paragraph as context.

2. **Latent ideas the agent judges worth surfacing.** Patterns the agent notices the user is circling around without naming explicitly. Recurring themes across multiple days. A surprising connection between two topics. A confident claim worth promoting from a daily note to a learning. Be conservative: better to surface 5 strong candidates than 20 weak ones.

For each candidate, present:
- **Source:** `journal/YYYY-MM/YYYY-MM-DD.md`, section, line context.
- **Excerpt:** the relevant sentence or paragraph, verbatim.
- **Why it might be worth promoting:** one line.
- **Suggested destination:** standalone in `content/ideas/`, addition to existing learning in `memory/learnings/[category].md`, new decision file, or wiki page update.

## How to handle each candidate (the human-gated loop)

For each candidate, ask the user one of these dispositions:

1. **Promote to standalone.** The agent does NOT write the standalone. The agent prompts the user with a draft outline (title, source, key claim) and tells the user where the file should land (e.g., `content/ideas/2026-04-30-personal-life-os.md`). The user writes the file. After the user writes it, the agent updates `content/_pipeline.md` to include it.

2. **Add to existing.** The agent identifies the candidate target file (e.g., `memory/learnings/ai-workflows.md` if the candidate fits an existing category). Asks the user to confirm the target. Then asks the user to write the addition. The agent does not write into `memory/learnings/` directly.

3. **Promote as a learning via /log.** The agent suggests running `/log` with the candidate as input. The existing `/log` flow takes over (which is the canonical capture mechanism for project knowledge).

4. **Dismiss.** No action. The candidate is logged in this session's chat output for reference but does not get processed.

## What this command does NOT do

- It does not write to any file in `journal/`, `memory/`, `content/`, `wiki/`, or `rules/` automatically.
- It does not auto-promote anything. Every promotion is human-gated.
- It does not modify the daily notes it scanned. Daily notes are read-only substrate.

The single permitted writes:
- Updating `content/_pipeline.md` after the user has written a new content idea standalone (Disposition 1, after the user writes).

## Reasoning principles

- **Conservative surfacing.** False positives (suggesting things that aren't ideas) waste user attention. Better to under-surface than over-surface.
- **Verbatim quoting.** When presenting a candidate, quote the daily-note text exactly. Do not paraphrase. Paraphrase introduces agent voice into the loop the user is reasoning about.
- **The user is the editor, the agent is the scout.** The agent finds candidates; the user decides and writes. This is the load-bearing principle of the daily-notes layer (per error rule #11).

## Verification after running

- `git status` should show changes only in `content/_pipeline.md` (if Disposition 1 was used) and any standalone files the user wrote during the loop.
- No automatic writes to `journal/`, `memory/learnings/`, `memory/decisions/`, `wiki/`, or `rules/`.

## When to run

- Weekly or biweekly: enough daily notes have accumulated to surface patterns.
- After a focused project sprint: useful for graduating session-level reflections into durable notes.
- Not on every daily note: the command is expensive (reads many files) and should produce signal, not noise.
