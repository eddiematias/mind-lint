# Inspired by Simon Willison's claude-code-transcripts tool

# /mine-sessions — Extract Knowledge from Past Claude Code Sessions

Read through Claude Code session transcripts and extract valuable knowledge into Mind-Lint.

## Steps

1. Read ~/.claude/projects/ to find all project directories
2. For each project, read sessions-index.json to list available sessions
3. Check ~/.claude/memory/mined-sessions.md to skip already-processed sessions
4. Display remaining sessions to the user: date, project, summary (from index), message count
5. Ask which sessions to mine (options: all, specific ones, or sessions from the last N days)
6. For each selected session, read the .jsonl transcript and extract:

   **Learnings** — new techniques, gotchas, patterns, discoveries
   → Write to memory/learnings/ using the format from templates/learning.md
   → Update memory/learnings/index.md

   **Decisions** — architecture choices, tool selections, approach decisions with rationale
   → Write to memory/decisions/ using the format from templates/decision.md
   → Update memory/decisions/index.md

   **Corrections** — times the user corrected Claude's output or pushed back on something
   → Add numbered rules to rules/error-rules.md (continue from last number)
   → Log to memory/corrections/index.md

   **Preferences** — working style patterns, formatting preferences, code standards not already captured
   → Append to rules/preferences.md (check for duplicates first)

   **Content Ideas** — interesting build sessions, problems solved, techniques worth sharing
   → Create in content/ideas/ using the format from templates/content-idea.md
   → Update content/_pipeline.md Ideas table

7. After each session, show the user a summary of what was extracted:
   - X learnings, X decisions, X corrections, X preferences, X content ideas
   Ask for confirmation before writing. the user can approve all, skip individual items, or edit before saving.

8. After all sessions are processed:
   - Offer to run /compile to process new entries into wiki pages
   - Offer to run /reindex to update all indexes

9. Append processed session IDs to memory/mined-sessions.md to prevent re-mining.

10. Final report: totals by category, files created, files updated.

## Privacy Filtering

Before writing extracted content to any Mind-Lint file:
1. Scan the extraction for sensitive data patterns (API keys, tokens, passwords, connection strings) using scripts/privacy-filter.sh
2. If found: auto-redact by default, show the user what was redacted
3. Log redactions to wiki/_log.md

## Extraction Guidelines
- Session transcripts are .jsonl format with one JSON object per line
- Look for "human" messages (the user's input) and "assistant" messages (Claude's response)
- Corrections often look like: the user saying something was wrong, asking for a redo, or specifying a preference after seeing output they didn't like
- Decisions involve discussing multiple options and choosing one
- Learnings involve discovering new patterns, techniques, or "I didn't know that" moments
- Be selective. Not every message is worth logging. Focus on durable, cross-project knowledge.
- Skip purely mechanical exchanges (routine file edits, build commands, debugging loops with no insight)
- When in doubt, extract it and let the user decide during the confirmation step
