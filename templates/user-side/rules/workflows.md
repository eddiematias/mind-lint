# Workflows

## Auto-Logging (Always Active)

### Preference Corrections
When the user corrects Claude's output:
1. Add a numbered rule to `rules/error-rules.md` with the date and specific rule
2. Log the correction to `memory/corrections/index.md`
3. Update `rules/preferences.md` if the correction reveals a broader preference

### Learnings
When a new technique, gotcha, or pattern is discovered:
1. Create entry in `memory/learnings/` using the learning template format
2. Populate the `## Topics` section with `[[wikilinks]]` to category notes that exist as files in `memory/learnings/` or `wiki/` (e.g. `[[frontend]]`, `[[backend]]`, `[[ai-workflows]]`)
3. Set the frontmatter `tags:` array to cross-cutting attributes that don't have their own page (e.g. `prompting`, `payload-cms`, `nextjs`, `migration`, `scope`)
4. Update `memory/learnings/index.md`
5. If significant, offer to compile into wiki via /compile

**Topics vs Tags (the rule):** Obsidian's graph view treats `[[wikilinks]]` as graph edges (clickable nodes that open the topic file and show backlinks) and treats tags (frontmatter or inline) as filter-pane labels (no graph node, clicking opens the Tags pane instead of a topic note). Use Topics for terms that have a corresponding note; use Tags for cross-cutting attributes that don't. Putting topic terms in `tags:` silently breaks graph navigation. `/lint` Phase 1 auto-fixes this drift.

### Decisions
When a meaningful choice is made (architecture, tool selection, approach):
1. Create file in `memory/decisions/` using the decision template format
2. Update `memory/decisions/index.md`

## Manual Triggers

- "Log this" / "Remember this" → Claude asks where and writes it
- "Update preferences" → Updates rules/preferences.md
- "What have we logged?" → Summary of recent entries
- "Content idea" → Creates entry in content/ideas/ and updates content/_pipeline.md
- "Publish this" → Triggers the /publish workflow
- Run /reindex at the start of a session if files were created in Obsidian since the last Claude Code session.

## Session Hooks (Automatic)

### On Session Start
- session-start.sh runs automatically
- Shows: uncompiled sources count, content pipeline status, days since last lint, cold wiki pages, error rules count

### On Session End
- auto-commit.sh runs automatically
- Stages all changes, commits with descriptive message, pushes to remote
- Notes uncompiled sources in commit message if any exist

## Chat Mining (Periodic)
- Run /mine-sessions monthly to extract knowledge from past Claude Code sessions. Transcripts retained 30 days.
- Run /mine-chats after exporting Claude.ai conversations. Place files in raw/transcripts/ first.
- Both commands track processed sessions to avoid duplicates.

## Privacy Filtering (Automatic)
- /compile, /mine-sessions, and /mine-chats scan for sensitive data before writing
- Patterns: API keys, bearer tokens, AWS keys, private keys, passwords, JWTs, connection strings
- Default: flag and offer to redact. Redactions logged to wiki/_log.md.

## Crystallization (On Project Completion)
- /archive-project creates a structured digest of the completed project
- Digest becomes a wiki page and a content pipeline entry

## Index Maintenance
- Learnings index hard cap: 50 entries
- When index exceeds 50, Claude suggests running /prune
- /prune archives oldest entries to archive/old-learnings/, keeps 30 most recent
