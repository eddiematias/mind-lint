# /mine-chats — Extract Knowledge from Claude.ai Chat Exports

Process exported Claude.ai conversations (markdown or JSON) and extract valuable knowledge into Mind-Lint.

## Prerequisites
Export chats from Claude.ai first:
- Full export: claude.ai → Settings → Privacy → Export Data (gives JSON ZIP via email)
- Selective export: Use "AI Chat Exporter" Chrome extension to save specific chats as markdown
- Place exported files in ~/.claude/raw/transcripts/

## Steps

1. Scan ~/.claude/raw/transcripts/ for unprocessed files (.md, .json, or .txt)
2. Check raw/_index.md to skip already-cataloged files
3. Display found files to the user with filenames and approximate size
4. Ask which files to process (all, specific ones, or let the user pick)

5. For each selected file:
   a. If JSON format: parse the conversation structure, extract human/assistant message pairs
   b. If markdown format: read as-is
   c. If the conversation is very long, process in chunks (for a very large export, prefer the Heavy-input offload section below instead)

6. Extract the same categories as /mine-sessions:

   **Learnings** → memory/learnings/ + update index
   **Decisions** → memory/decisions/ + update index
   **Corrections** → rules/error-rules.md + memory/corrections/index.md
   **Preferences** → rules/preferences.md (check for duplicates)
   **Content Ideas** → content/ideas/ + content/_pipeline.md
   **Raw Source Material** — if the conversation itself is valuable reference material, keep it in raw/transcripts/ and mark it in raw/_index.md

7. After each conversation, show the user a summary of what was extracted
   Ask for confirmation before writing.

8. After all files are processed:
   - Update raw/_index.md to catalog the processed files
   - Offer to run /compile to process new entries into wiki pages
   - Offer to run /reindex

9. Final report: totals by category, files created, files updated.

## Privacy Filtering

Before writing extracted content to any Mind-Lint file:
1. Scan the extraction for sensitive data patterns (API keys, tokens, passwords, connection strings) using scripts/privacy-filter.sh
2. If found: auto-redact by default, show the user what was redacted
3. Log redactions to wiki/_log.md

## Handling JSON Exports
Claude.ai full exports contain JSON files with this structure:
- Each file is a conversation
- Messages have "role" (human/assistant) and "content" fields
- Convert to readable format before extracting knowledge
- Save the converted markdown version to raw/transcripts/ for future reference

## Heavy-input offload (optional)

For a very large export (a multi-month chat of thousands of lines, or a full-export ZIP with many conversations), dispatch a subagent to read-and-extract one source per subagent (one conversation, or one file) and return ONLY the structured candidates (learnings, decisions, corrections, preferences, content ideas, with quote anchors), not the raw conversation. The lead keeps everything that needs a gate or the whole picture: the privacy scan above, dedup against the existing indexes, and the per-category user confirmation before any write. For small exports, read inline. (Native subagents are our equivalent of gbrain's worker queue, which is Postgres-only infra we do not run, so there is no mode flag here: just offload heavy reads and keep the gating in the lead.)
