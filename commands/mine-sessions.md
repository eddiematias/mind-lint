# /mine-sessions — Extract Knowledge from Claude Code Sessions
# Inspired by Simon Willison's claude-code-transcripts tool

Read through past Claude Code session transcripts and extract knowledge.

## Steps
1. Read ~/.claude/projects/ for project directories
2. Read sessions-index.json for available sessions
3. Check memory/mined-sessions.md to skip already-processed sessions
4. Display sessions: date, project, summary, message count
5. Ask which to mine (all, specific, or last N days)
6. For each session, read .jsonl transcript and extract:
   - **Learnings** → memory/learnings/
   - **Decisions** → memory/decisions/
   - **Corrections** → rules/error-rules.md + memory/corrections/index.md
   - **Preferences** → rules/preferences.md (check duplicates)
   - **Content ideas** → content/ideas/ + content/_pipeline.md
7. Run privacy filter before writing. Auto-redact sensitive data.
8. Show summary per session, ask for confirmation before writing
9. After all sessions: offer /compile and /reindex
10. Track processed sessions in memory/mined-sessions.md
11. Final report: totals by category
