# Workflows Reference (on-demand companion to workflows.md)

The always-active capture protocol (auto-logging, manual triggers, memory-index discipline, daily-notes layer, session habits) lives in `rules/workflows.md`, which is always loaded. This file holds the fuller mechanics of the per-layer and per-command workflows, kept out of the always-loaded budget. Load it when working on people profiles, the reading list, chat mining, project archival, session hooks, privacy filtering, or content creation.

## People Profiles Layer (compiled, on-demand)

Per-person profiles live at `wiki/people/<Name>.md`. They capture **how the user connects with the person, how they show up with them, and the history of the relationship** so wikilinks like `[[Person Name]]` resolve to useful context. Profiles load on demand; the index at `wiki/people/_index.md` is lightweight and always loaded so the agent knows which profiles exist.

**Schema** (see `templates/people-profile.md`):
- `## Snapshot` — 1-2 sentence summary. **Human-authored.**
- `## How I show up` — the user's side of the dynamic with this person. **Human-authored.**
- `## How they show up` — their side. **Human-authored.**
- `## History` — dated narrative arc, append-only. **Human-authored**, with `/people-sync` permitted to nominate milestone candidates for per-candidate approval.
- `## Recent threads` — rolling 60-day window. **Refreshed by `/people-sync`** (still per-candidate approval, rewritten on each run).
- `## Connections` — wikilinks to other people, places, projects.

**The agent-doesn't-characterize rule (load-bearing).** `## Snapshot`, `## How I show up`, and `## How they show up` are 100% human-authored. `/people-sync` NEVER proposes content for them — characterizing a relationship from text data is partial, and the closer the agent gets to writing about how someone shows up in a relationship, the more wrong/off the profile reads. If `/people-sync` notices a pattern that would belong in one of those sections (e.g. "she initiates more often than he does"), it surfaces the observation in chat, never as a profile write.

**Sources** (incremental enrichment via human-gated proposals, mirrors `/sync-goals`):
- **iMessage** — implemented via `/people-sync`. Wraps `imessage-exporter` (https://github.com/reagentx/imessage-exporter) through `scripts/imessage-export.sh`. Exports land in `raw/imessage/<sanitized-handle>/` (gitignored).
- **Contacts.app**, **Calendar**, **daily-notes mentions** — designed for in the schema (each has its own `last-synced-<source>` frontmatter field) but not yet implemented. Future commands: `/people-sync-contacts`, `/people-sync-calendar`, `/people-sync-journal`.

**Triggers for profile creation:** manual seed pass. the user picks the people who matter (target ~10-15: close personal + key work) and hand-authors `## Snapshot`, `## How I show up`, `## How they show up`, and `## History` for each. No agent involvement in the seed pass.

**Promotion path from iMessage to profile:** `/people-sync <Name>` (refreshes `## Recent threads`, nominates `## History` milestones, never touches the four human-authored sections).

## Reading List Layer

A running book tracker at `wiki/reading-list.md`. Single-file shape (table format), three buckets: Want to read / Currently reading / Read, plus a Shelved bucket for deliberate abandons. Each row has Cover (image embed), Title, Author wikilinked, Amazon link, Audible link, plus state-specific fields (Source/Added for want-to-read, Started for currently-reading, Finished/Rating for read).

**Capture paths:**

1. **Conversational (primary).** the user says "add X to my reading list" / "I'm reading X" / "I just finished Y, rate it Z" → agent appends or moves the row directly. Resolve Amazon and Audible URLs via web search if not provided; use Open Library (`https://covers.openlibrary.org/b/isbn/<ISBN-13>-M.jpg`) for cover URL by default, swap if the user names a different source.

2. **Wikilink (future `/sync-books`).** the user writes `[[Book Title]]` in a daily-note `## Notes` block. A `/sync-books` command will scan recent daily notes (rolling window) for unresolved book wikilinks and surface them as candidates for confirmation. Mirrors `/sync-goals` and `/people-sync`. Not yet implemented. When built, it must distinguish book wikilinks from people/project wikilinks (cross-reference `wiki/people/_index.md` + use surrounding context to infer).

3. **Manual.** the user edits the file directly.

**State transitions** happen via conversational moves: "I started [Book]" moves the row from Want-to-read to Currently-reading; "Finished [Book], 4/5" moves Currently-reading to Read with a rating.

**Per-book deep notes:** when a book warrants quotes/highlights/threads beyond a single-row entry, the agent spins off `wiki/books/<slug>.md` and links it from the table row. The reading list table stays the index; the per-book note is opt-in.

**The agent-may-write rule.** Unlike daily notes (`journal/`) which are pure-human substrate, `wiki/reading-list.md` is agent-writable. The agent appends/updates rows in response to conversational capture. the user can also edit the file directly. No special protection.

## Chat Mining (Periodic)
- Run /mine-sessions monthly (or when knowledge feels like it's missing from the system) to extract learnings, decisions, corrections, preferences, and content ideas from past Claude Code sessions. Session transcripts are retained for 30 days, so mine before they expire.
- Run /mine-chats after exporting conversations from Claude.ai. Place exported files in raw/transcripts/ first.
- Both commands track what's been processed to avoid duplicate mining.

## Project Archival

When a project wraps up or goes dormant, do a final knowledge sweep before moving on. the user can trigger this with `/archive-project` or by saying "archive this project." The process:

1. **Final learnings sweep**: Review the session history and native auto memory for this project. Anything cross-project worthy gets logged to `~/.claude/memory/learnings/`.
2. **Decision status check**: Review any decisions linked to this project in `~/.claude/memory/decisions/`. Update statuses if needed (decided > completed, or note outcomes).
3. **Project CLAUDE.md snapshot**: Note the final state of the project as a summary entry in the decisions log or a dedicated learnings entry tagged with the project name.
4. **Wiki compilation**: Offer to compile project-specific learnings into wiki pages via /compile.
5. **Content opportunities**: Flag any learnings or decisions from this project that would make good shareable content. Create entries in `~/.claude/content/ideas/` and update `~/.claude/content/_pipeline.md`.
6. **Clean up**: Note that the project is archived so future sessions don't reference active work items from it.

## Crystallization (On Project Completion)
- /archive-project creates a structured digest of the completed project
- Digest becomes a wiki page and a content pipeline entry
- Captures: summary, learnings, decisions, entities, metrics, content opportunities

## Session Hooks (Automatic)

### On Session Start
- session-start.sh runs automatically via SessionStart hook
- Shows: uncompiled sources count, content pipeline status, days since last lint, cold wiki pages, error rules count, always-loaded context budget
- /reindex runs if Obsidian edits detected (files exist that aren't in indexes)

### On Session End
- auto-commit.sh runs automatically via SessionEnd hook
- Stages all changes, commits with descriptive message, pushes to remote
- Notes uncompiled sources in commit message if any exist

## Privacy Filtering (Automatic)
- /compile, /mine-sessions, and /mine-chats auto-scan for sensitive data before writing
- Detected patterns: API keys, bearer tokens, AWS keys, private keys, passwords, JWTs, connection strings
- Default behavior: flag and offer to redact
- Redactions logged to wiki/_log.md

## Content Creation Workflow

When the user wants to create shareable content from logged knowledge:

1. Review relevant learnings and decisions in `~/.claude/memory/` and `~/.claude/wiki/`.
2. Ask about target format: blog post, social thread, video script, LinkedIn post, or newsletter.
3. Ask about audience: coworkers, clients, followers, or general.
4. Load the appropriate skill file (skills/content-creation.md).
5. Draft content using the appropriate voice (use the relevant brand voice for client content, ask for others).
6. Iterate based on feedback.
7. Final version goes to `~/.claude/content/published/` and `~/.claude/content/_pipeline.md` is updated.
