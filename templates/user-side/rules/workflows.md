# Workflows & Documentation Protocol

This file defines how you (Claude) capture, store, and organize knowledge as we work. The goal is to reduce friction, eliminate repetition, and build a shareable knowledge base over time.

The fuller mechanics of the people-profiles, reading-list, chat-mining, project-archival, session-hook, privacy-filtering, and content-creation workflows live in `rules/workflows-reference.md` (on-demand, to keep the always-loaded context lean). See "On-Demand Reference" at the bottom.

## Daily Notes Layer (read-only substrate)

Daily notes live in `journal/YYYY-MM-DD.md` (flat layout — Obsidian Daily Notes core plugin doesn't support date-based subfolders without the Periodic Notes plugin; see 2026-05-01 learning). They are the temporal/episodic substrate for Mind-Lint, complementing the project-knowledge layer (`memory/`, `wiki/`, `rules/`).

**Structure** (per `templates/daily-note.md`):
- `## Calendar` — populated on demand by `/today`. Pulls iCloud via `scripts/icloud-events.sh` (AppleScript on Calendar.app, excluding Google-account calendars) and Google Workspace via the Anthropic Google Calendar MCP connector.
- `## Plan` — populated by `/today` after the calendar block is filled.
- `## Notes` — free-form prose, the daily writing canvas. Inline `#idea` tags and `[[wikilinks]]` to people, projects, concepts.
- `## Tasks` — free-form, your shape.
- `## Review` — populated by `/close-day` at end of day. Agent-owned section.

**The agent-doesn't-write rule (load-bearing).** `## Notes` and `## Tasks` are pure-human substrate; agents never write into them. Three agent-owned exceptions are structural and command-named: `/today` writes `## Calendar` and `## Plan`; `/close-day` writes `## Review`. No other command (`/graduate`, future pattern-detection commands) writes into `journal/` at all — their outputs go to chat or user-gated capture flows.

**Why this rule exists.** Pattern-detection commands (`/drift`, `/trace`, `/connect`, `/ideas`, `/emerge`, `/ghost`, `/challenge`) only produce useful signal on uncontaminated human input. If the agent paraphrases its own summaries back into the vault, future pattern detection picks up agent compressions instead of authentic thinking. The exceptions are narrow and conventional (structured sections the agent owns by name) so the rule is unambiguous.

**Triggers for daily note creation:**
- SessionStart hook (creates today's note shell when Claude Code starts).
- `/today` (creates the shell on demand if it's still missing, then populates `## Calendar` and `## Plan`).
- Manual: `bash scripts/daily-note.sh` or Obsidian's "Open today's daily note" button.

The 10:30 AM launchd cron was retired on 2026-05-01. Calendar fetch is now on-demand through `/today`, so there is no need for a deterministic morning fire.

**Promotion path from journal to project knowledge:** `/graduate` (human-gated review surfaces candidates, user decides what to promote and writes it). Or conversational capture (mention an insight in a session, the existing `/log` flow fires).

See error rule #11 for the codified convention.

## Auto-Logging (Always Active)

The following auto-logging applies to Mind-Lint's **project-knowledge** layer (`memory/`, `wiki/`, `rules/`), not the daily-notes substrate. Daily notes follow the read-only rule above.

You should automatically detect and log the following WITHOUT the user asking:

### Preference Corrections
**Trigger:** the user corrects your output, says "always do X," "never do Y," "I prefer X," or expresses frustration with a repeated behavior.
**Action:** Two things happen:
1. Add an entry to `~/.claude/rules/preferences.md` under "Things the user Has Corrected" with the date, what was wrong, and the new rule.
2. Add a numbered rule to `~/.claude/rules/error-rules.md` with the date and the specific, actionable rule. Also log the correction to `~/.claude/memory/corrections/index.md` with what was wrong and the rule number created.
**Format (preferences.md):** `- [YYYY-MM-DD] Correction: "what the user said" → Rule: "what to do going forward"`
**Format (error-rules.md):** `[next number]. [YYYY-MM-DD] [specific rule]`

### Learnings
**Trigger:** We discover something new together: a technique, a gotcha, a workaround, a pattern, a tool behavior, or an insight that would be useful in future sessions or other projects.
**Action:** Add the full entry (the Format block below) to the appropriate category file in `~/.claude/memory/learnings/`. If no category fits, create a new file. Then add a **one-line pointer only** to `~/.claude/memory/learnings/index.md` "Recent Entries": `- [YYYY-MM-DD] **Title** (project) [category.md](category.md)` (no em dashes). The index never carries the prose, only the pointer; the category file is the store. When logging a significant learning, offer to compile it into a wiki page via /compile.
**Format:**
```markdown
### [YYYY-MM-DD] Short Title
**Project:** project-name (or "general")
**Context:** Brief description of what we were doing
**Learning:** The actual insight, technique, or pattern
**Topics:** [[category]] [[other-category]]
**Tags:** #subcategory #cross-cutting-attribute
```

**Topics vs Tags rule (important — they look similar but Obsidian treats them differently):**

- **`**Topics:**`** uses `[[wikilinks]]` to topic notes that exist as files in `memory/learnings/` or `wiki/`. Examples: `[[frontend]]`, `[[backend]]`, `[[ai-workflows]]`, `[[design]]`, `[[devops]]`, `[[mobile]]`, `[[business-strategy]]`, `[[collaboration-tools]]`. Wikilinks become real graph edges in Obsidian — clicking the topic node in the graph view opens the topic file and shows backlinks from every learning that links to it.
- **`**Tags:**`** uses `#hashtag` syntax for cross-cutting attributes that don't have their own page. Examples: `#prompting`, `#claude-code`, `#architecture`, `#performance`, `#testing`, `#security`, `#scope`, `#migration`, `#mcp`. Tags drive Obsidian's Tags pane (filter view) and don't appear as nodes in the graph.

**The rule for choosing:** if there's a file in `memory/learnings/` or `wiki/` whose name matches the term, use a wikilink. Otherwise use a tag. Putting topic terms in `**Tags:**` (e.g. `#frontend` instead of `[[frontend]]`) is the bug we hit on 2026-04-29 — see error rule #10.

### Decisions
**Trigger:** A meaningful choice is made: architecture, tool selection, approach, strategy, design direction, or anything where we weighed options and picked one.
**Action:** Create a new file in `~/.claude/memory/decisions/` named `YYYY-MM-DD-short-topic.md` holding the full Context / Options / Decision / Consequences (the Format block below). Then add a **one-line pointer only** to `~/.claude/memory/decisions/index.md` "Recent Decisions": `- [YYYY-MM-DD] **Title** (project, type) [doc](YYYY-MM-DD-short-topic.md)` (no em dashes). The index never carries the prose, only the pointer; the dated file is the store.
**Format:**
```markdown
# Decision: Short Title
**Date:** YYYY-MM-DD
**Project:** project-name (or "general")
**Status:** decided | revisiting | superseded

## Context
What prompted this decision?

## Options Considered
1. **Option A** - pros/cons
2. **Option B** - pros/cons

## Decision
What we chose and why.

## Consequences
What this means going forward.
```

### Content Opportunities
**Trigger:** Completing a project milestone or wrapping a significant build session.
**Action:** Suggest capturing content ideas to `~/.claude/content/ideas/` and updating `~/.claude/content/_pipeline.md`.

### When NOT to auto-log
- Trivial fixes (typos, formatting, simple bugs)
- Things already captured in the current file
- Conversations that are purely exploratory with no conclusion

## Manual Logging (User-Triggered)

The user can trigger logging explicitly with these phrases:

- **"Log this"** or **"Remember this"**: Prompt the user for where it should go (learning, decision, or preference), then write it.
- **"Update preferences"**: Add or modify an entry in preferences.md.
- **"Publish this"**: Triggers the /publish workflow for exporting content to external platforms.
- **"What have we logged?"**: Summarize recent entries across learnings, decisions, and preferences.

## Memory Index Maintenance (context-budget discipline)

Both `~/.claude/memory/learnings/index.md` and `~/.claude/memory/decisions/index.md` are imported into every session via `CLAUDE.md`. They are pointers, not stores, and must stay lean. The full detail always lives elsewhere (learnings in the category file; decisions in the dated `YYYY-MM-DD-*.md` file).

**Two rules keep them lean:**
1. **One line per entry.** Every entry is a single-line pointer (date, bold title, project, link), never a paragraph. This is the bigger cost driver: a paragraph-per-entry index balloons even while it stays under the count cap. The auto-logging steps above already write one-liners; never re-expand them inline.
2. **Cap: 50 recent entries per index.** When "Recent" exceeds 50, move the oldest one-liners out. Learnings get archived to `~/.claude/archive/old-learnings/` (detail already lives in the category file). Decisions get archived to `~/.claude/memory/decisions/_archive-index.md`, a non-loaded file (the dated doc stays in place). `/prune` runs both passes (format + count) across both indexes.

**The always-loaded budget.** The whole `CLAUDE.md` import chain has a target ceiling of ~25K tokens. Keep indexes one-line, and keep reference material (content pipeline, per-channel skills, client context) as on-demand pointers under "Modular Context" with NO leading `@` (an `@` there forces eager load into every session, defeating "load when relevant"). `/lint` Phase 0.5 measures the budget and the SessionStart hook prints it. If you notice an index growing long or going paragraph-y mid-session, proactively suggest `/prune`.

## Session Habits

- At the start of a session, check `~/.claude/memory/learnings/index.md` for relevant context if the current task relates to past work.
- At the end of a significant session, prompt the user: "Anything from this session worth logging?"
- When switching projects, note if any learnings from the current session apply globally.

## On-Demand Reference (load when relevant)

Full mechanics of the people-profiles, reading-list, chat-mining, project-archival, session-hook, privacy-filtering, and content-creation workflows live in `rules/workflows-reference.md` (kept out of the always-loaded budget). Load it when working on any of those. Quick reminders kept here so nothing is a surprise:

- **Session hooks:** `session-start.sh` surfaces system status; session-end runs `auto-commit.sh`. They are wired in `settings.json` and fired by the Claude Code harness, so they run regardless of what's loaded into context. Full detail in the reference.
- **Privacy filtering:** `/compile`, `/mine-sessions`, `/mine-chats` scan for secrets (API keys, tokens, connection strings) before writing and offer to redact. Full detail in the reference.
- **People profiles:** `## Snapshot`, `## How I show up`, `## How they show up` in `wiki/people/<Name>.md` are 100% human-authored. Agents never characterize a relationship; surface observations in chat, never as a profile write. See `/people-sync`; full layer in the reference.
