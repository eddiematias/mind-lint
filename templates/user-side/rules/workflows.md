# Workflows

## Daily Notes Layer (read-only substrate)

Daily notes live in `journal/YYYY-MM/YYYY-MM-DD.md`. They are the temporal/episodic substrate, complementing the project-knowledge layer (`memory/`, `wiki/`, `rules/`).

**Structure** (per `templates/daily-note.md`):
- `## Calendar` — auto-populated by `scripts/daily-note.sh` at 10:30 AM (or your configured time) via macOS Calendar APIs.
- `## Plan` — populated by `/today`.
- `## Notes` — free-form prose, the daily writing canvas. Inline `#idea` tags and `[[wikilinks]]`.
- `## Tasks` — free-form, your shape.
- `## Review` — populated by `/close-day` at end of day. The agent-owned section.

**The agent-doesn't-write rule (load-bearing).** `## Notes` and `## Tasks` are pure-human substrate; agents never write into them. The two agent-owned exceptions are structural and command-named: `/today` writes `## Plan`; `/close-day` writes `## Review`. `## Calendar` is populated by the deterministic `scripts/daily-note.sh`, not by an agent. No other command (`/graduate`, future pattern-detection commands) writes into `journal/` at all — their outputs go to chat or user-gated capture flows.

**Why this rule exists.** Pattern-detection commands (`/drift`, `/trace`, `/connect`, `/ideas`, `/emerge`, `/ghost`, `/challenge`, etc.) only produce useful signal on uncontaminated human input. If the agent paraphrases its own summaries back into the vault, future pattern detection picks up agent compressions instead of authentic thinking. The exception is narrow and conventional (a structured `## Review` section the agent owns by name) so the rule stays unambiguous. Pattern from Vin's vault-as-thinking-partner approach (see references for the 2026-02-23 podcast with Greg Isenberg).

**Triggers for daily note creation:**
- launchd at your configured time (template: `templates/com.example.mindlint-daily.plist.template`).
- SessionStart hook backup (creates today's note if launchd missed because the machine was asleep).
- Manual: `bash scripts/daily-note.sh` or Obsidian's "Open today's daily note" button.

**Promotion path from journal to project knowledge:** `/graduate` (human-gated review surfaces candidates, user decides what to promote and writes it). Or conversational capture (mention an insight in a session, the existing `/log` flow fires).

## Auto-Logging (Always Active)

The following auto-logging applies to the **project-knowledge** layer (`memory/`, `wiki/`, `rules/`), not the daily-notes substrate. Daily notes follow the read-only rule above.

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
4. Add a **one-line pointer only** to `memory/learnings/index.md` (`- [YYYY-MM-DD] **Title** (project) [category.md](category.md)`, no em dashes). The full entry lives in the category file, never inline in the index.
5. If significant, offer to compile into wiki via /compile

**Topics vs Tags (the rule):** Obsidian's graph view treats `[[wikilinks]]` as graph edges (clickable nodes that open the topic file and show backlinks) and treats tags (frontmatter or inline) as filter-pane labels (no graph node, clicking opens the Tags pane instead of a topic note). Use Topics for terms that have a corresponding note; use Tags for cross-cutting attributes that don't. Putting topic terms in `tags:` silently breaks graph navigation. `/lint` Phase 1 auto-fixes this drift.

### Decisions
When a meaningful choice is made (architecture, tool selection, approach):
1. Create file in `memory/decisions/` using the decision template format (full Context / Options / Decision / Consequences)
2. Add a **one-line pointer only** to `memory/decisions/index.md` (`- [YYYY-MM-DD] **Title** (project, type) [doc](YYYY-MM-DD-short-topic.md)`, no em dashes). The dated file is the store; the index never carries the prose.

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
- Shows: uncompiled sources count, content pipeline status, days since last lint, cold wiki pages, error rules count, always-loaded context budget

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

## Index Maintenance (context-budget discipline)
Both `memory/learnings/index.md` and `memory/decisions/index.md` are imported into every session via CLAUDE.md. They are pointers, not stores; the full detail lives elsewhere (learnings in the category file, decisions in the dated file). Two rules keep them lean:
- **One line per entry.** Never a paragraph. This is the bigger cost driver: a paragraph-per-entry index balloons even under the count cap. Auto-logging writes one-liners; never re-expand them inline.
- **Cap: 50 recent entries per index.** When "Recent" exceeds 50, /prune moves the oldest one-liners out. Learnings → `archive/old-learnings/`; decisions → `memory/decisions/_archive-index.md` (the dated file stays). /prune runs both passes (format + count) across both indexes.

**The always-loaded budget.** The whole CLAUDE.md import chain targets ~25K tokens. Keep indexes one-line, and keep reference material under "Modular Context" as on-demand pointers with NO leading `@` (an `@` there forces eager load every session). `/lint` Phase 0.5 audits the budget; the SessionStart hook prints it.

**Splitting this file when it grows.** This file is always-loaded, so keep only the always-active capture protocol here (daily-notes layer, auto-logging, manual triggers, index maintenance). When per-command or per-layer mechanics (people profiles, reading list, project archival, session hooks, privacy filtering, content creation) grow enough to make this a budget offender, move them verbatim into an on-demand `rules/workflows-reference.md` and add a no-`@` pointer to it under CLAUDE.md's "Modular Context". Split when it grows, not before.
