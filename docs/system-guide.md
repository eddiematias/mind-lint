# Mind-Lint v2: The Complete Walkthrough

---

## TL;DR

Mind-Lint is a personal knowledge operating system that lives on top of Claude Code. It makes your AI remember everything: who you are, how you work, what you've learned, what mistakes to avoid, and what you're building. Every session starts with full context. Every correction makes the system smarter. Every piece of work becomes potential content.

**The setup:** Your `~/.claude/` directory is simultaneously a Git repo, an Obsidian vault, and Claude Code's config directory. Same files, three tools, zero sync. Markdown in, markdown out.

**The architecture:** Five layers. Raw sources (articles, transcripts, notes) get compiled into wiki pages (cross-linked, confidence-scored, self-maintaining). Learnings and decisions flow through a four-tier memory model (working → episodic → semantic → procedural). Error rules accumulate from every AI mistake. Skills load on-demand based on what you're doing. A content pipeline turns all of it into blog posts, social threads, and video scripts.

**What makes it different from just a CLAUDE.md file:**
- A living wiki that strengthens, decays, and self-heals (not just static notes)
- An error-to-rule pipeline where every AI mistake becomes a permanent rule (the system literally gets smarter when it fails)
- Modular context loading so you're not burning tokens on irrelevant context every session
- Event-driven automation (session start shows system status, session end auto-commits, privacy filtering on ingest)
- A content pipeline baked in (the process of building things IS the content)
- 14 slash commands for everything from logging to linting to publishing

**The stack:** Claude Code + Obsidian + Git + markdown. No databases, no APIs, no vendor lock-in. Works offline. Grep-searchable. Diff-friendly. Portable to any AI tool that reads markdown.

---

## How It's Installed

Mind-Lint uses a **dotfile-style install**. The source repo lives at `~/mindlint/` (or any location you clone it to) and `setup.sh` symlinks framework files into `~/.claude/` where Claude Code looks for them. Your knowledge data (memory, wiki, rules, content) is owned by `~/.claude/` and never touched by upstream updates.

Files are classified into three categories:

| Category | Mechanism | Examples |
|---|---|---|
| 1. Framework (symlinked) | Symlink from `~/.claude/X` to `~/mindlint/X` | `commands/*.md`, `scripts/*.sh`, `templates/`, `docs/` |
| 2. User-editable templates (copied) | Copied once on install; updatable via `--sync` | `rules/workflows.md`, `rules/boundaries.md`, generic skills |
| 3. User-owned | Wizard-generated or user-accumulated; never touched | `context/*.md`, `memory/`, `wiki/`, `raw/`, `content/`, `rules/preferences.md`, `rules/error-rules.md` |

See `setup.sh --help` for all modes (install / sync / migrate / uninstall / relink).

---

## The Problem This Solves

Every Claude Code session starts from zero. Without a system, you:

- Waste tokens re-explaining who you are, what you're working on, and how you like things done
- Lose insights from past sessions (that gotcha you discovered last week? Gone.)
- Have no record of decisions or why they were made
- Repeat the same mistakes because the AI doesn't remember being corrected
- Can't share what you've learned without manually writing it up

Mind-Lint fixes all of this. It creates a persistent knowledge layer that loads automatically, evolves with every session, and compounds over time.

---

## How It's Organized

Everything lives in `~/.claude/`, which serves triple duty:

| Tool | How It Sees ~/.claude/ |
|---|---|
| Claude Code | Its global config directory. Reads CLAUDE.md and all @path references at session start. |
| Obsidian | A vault of interconnected markdown notes with visual graph, templates, and hotkey capture. |
| Git | A version-controlled repo. Every change is tracked, diffable, and pushable to a remote. |

### The Folder Structure

```
~/.claude/
├── CLAUDE.md                    ← The router (loaded every session)
├── settings.json                ← Hooks config (SessionStart + SessionEnd)
│
├── rules/                       ← Behavioral rules (always loaded)
│   ├── preferences.md           ← Working style, code standards
│   ├── error-rules.md           ← Numbered rules from AI mistakes
│   ├── workflows.md             ← Logging triggers, session habits
│   └── boundaries.md            ← What goes in Mind-Lint vs. native auto memory
│
├── context/                     ← Current-state snapshots (loaded per task)
│   ├── identity.md              ← Who you are, communication style
│   ├── tech-stack.md            ← Languages, frameworks, tools
│   ├── active-projects.md       ← What's in flight right now
│   └── clients/jbr/             ← Client-specific context
│       ├── overview.md
│       ├── brand-voice.md
│       └── vocabulary.md
│
├── skills/                      ← Workflow frameworks (loaded on-demand)
│   ├── jbr-social.md
│   ├── jbr-franchise.md
│   ├── jbr-catering.md
│   ├── jbr-pr.md
│   ├── jbr-website.md
│   ├── code-review.md
│   └── content-creation.md
│
├── raw/                         ← Immutable source materials
│   ├── _index.md
│   ├── articles/
│   ├── transcripts/
│   ├── research/
│   └── notes/
│
├── wiki/                        ← AI-compiled knowledge pages
│   ├── _index.md
│   └── _log.md
│
├── memory/                      ← Dynamic logs
│   ├── learnings/
│   ├── decisions/
│   ├── corrections/
│   └── mined-sessions.md
│
├── content/                     ← Content pipeline
│   ├── _pipeline.md
│   ├── ideas/
│   ├── drafts/
│   └── published/
│
├── archive/                     ← Historical (not loaded)
├── templates/                   ← Obsidian templates
├── commands/                    ← 14 slash commands
├── scripts/                     ← Automation scripts
└── docs/
    ├── system-guide.md
    └── credits.md
```

---

## CLAUDE.md: The Router

This is the most important file. Claude Code reads it at the start of every session. In Mind-Lint v2, it's a **router**, not a container. It loads a lean base and tells Claude Code where to find additional context when needed.

### Always Loaded (Every Session)

These files are small and universally relevant:

- **identity.md** — Who you are, communication style, working patterns
- **preferences.md** — Code standards, formatting rules, style preferences
- **error-rules.md** — Every mistake the AI has ever made, as numbered rules
- **boundaries.md** — What belongs in Mind-Lint vs. Claude Code's native auto memory
- **tech-stack.md** — Your languages, frameworks, and tools
- **active-projects.md** — What you're currently working on
- **wiki/_index.md** — Lightweight pointer to compiled knowledge (just titles and confidence scores)
- **learnings/index.md** — Lightweight pointer to learnings
- **decisions/index.md** — Lightweight pointer to decisions
- **workflows.md** — Logging triggers and session habits

Total base context: ~150 lines. Well within the 150-200 instruction ceiling that research shows AI models can reliably follow.

### Loaded When Relevant (Modular)

These load only when the task calls for them, keeping the context window lean:

- **JBR work** → client overview, brand voice, vocabulary files
- **JBR social/franchise/catering/PR/website** → the specific channel skill file
- **Code work** → code review skill
- **Content creation** → content creation skill + pipeline tracker

This is why there are separate skill files per JBR channel. When you're writing a franchise email, the social media tone rules aren't burning context space.

### Why This Matters

ETH Zurich research (February 2026) found that oversized context files increase inference costs by up to 159% and can actually hurt AI performance. Modular loading solves this: you get full context for the task at hand without paying for context you don't need.

---

## The Five Layers

### Layer 1: Raw Sources

**Location:** `raw/`
**Memory tier:** Working Memory
**Lifespan:** Days to weeks

This is where unprocessed material enters the system. Articles you've read, meeting transcripts, research dumps, brain dumps, quick captures. Drop anything in here. It's immutable: once a source is in raw/, it doesn't get edited.

`raw/_index.md` catalogs every source with its type, date, and whether it's been compiled into the wiki yet.

### Layer 2: Memory (Learnings, Decisions, Corrections)

**Location:** `memory/`
**Memory tier:** Episodic Memory
**Lifespan:** Weeks to months

This is where per-event knowledge lives. Individual learnings, specific decisions with rationale, and corrections made during sessions.

Each entry follows a template:
- **Learnings** — what was learned, why it matters, related context
- **Decisions** — options considered, what was chosen, rationale, consequences, review date
- **Corrections** — what was wrong, the rule that was created

Index files track everything. When the learnings index exceeds 50 entries, `/prune` archives the oldest to keep things scannable.

### Layer 3: Wiki (Compiled Knowledge)

**Location:** `wiki/`
**Memory tier:** Semantic Memory
**Lifespan:** Months to years

This is the brain. Raw sources and learnings get compiled into structured, cross-linked wiki pages via `/compile`. Instead of re-reading raw documents every time Claude needs information, it reads the wiki: pre-synthesized, confidence-scored, and current.

Each wiki page carries metadata:
- **Confidence score** (0.1 to 1.0) — based on source count, recency, and contradictions
- **Decay status** (active / cooling / cold) — based on time since last access
- **Access count** — how often the page has been referenced
- **Source list** — which raw sources and learnings support the claims
- **Supersession log** — when old facts were replaced by newer ones

Confidence strengthens when new sources confirm existing claims. It decays when pages go unaccessed. Old claims get explicitly superseded (marked stale with links to the new claim), not silently overwritten. This is knowledge with a lifecycle, not a static pile of notes.

### Layer 4: Skills and Rules

**Location:** `skills/`, `rules/`
**Memory tier:** Procedural Memory
**Lifespan:** Permanent (until replaced)

Skills are reusable workflow frameworks. Each one defines how Claude should approach a specific type of work: the tone, format guidelines, hard rules, and examples. They're the "how we do things" layer.

Rules are behavioral guardrails: preferences, error corrections, workflow triggers, and memory boundaries. Error rules are especially powerful because they're cumulative and permanent. Every AI mistake becomes a numbered rule that's loaded in every future session.

### Layer 5: Content Pipeline

**Location:** `content/`
**Purpose:** Turn work into shareable content

Everything you build, learn, and decide is potential material. The content pipeline tracks ideas from capture through drafting to publication. Supported formats: blog posts, LinkedIn posts, social threads, video scripts, client-facing Notion pages, newsletter sections.

`_pipeline.md` is the master tracker with three tables: Ideas (backlog), In Progress, and Published.

---

## The Error-to-Rule Pipeline

This is the single most valuable mechanism in the system.

**How it works:**
1. Claude makes a mistake during a session
2. You correct it
3. Claude detects the correction (auto-log trigger)
4. Claude adds a numbered rule to `error-rules.md` with the date and specific fix
5. Claude logs the correction to `memory/corrections/index.md`
6. The rule loads in every future session, forever

**Example rules:**
```
1. [2026-04-14] Never use emdashes. Use commas, periods, parentheses, or colons.
2. [2026-04-14] JBR customers are "guests", "neighbors", or "community". Never "consumers".
3. [2026-04-14] JBR locations are "shops". Never "stores", "units", or "locations".
```

Rules are permanent. Never deleted, only added. Over time, error-rules.md becomes the most valuable file in the system because it encodes every lesson learned from actual failures. No retraining, no fine-tuning, no hoping the model "remembers."

---

## The Four-Tier Memory Model

Inspired by cognitive science and formalized by LLM Wiki v2, knowledge flows through four tiers:

| Tier | Location | Lifespan | What It Holds |
|---|---|---|---|
| Working Memory | raw/notes/, transcripts | Days to weeks | Unprocessed captures |
| Episodic Memory | memory/learnings/, memory/decisions/ | Weeks to months | Per-event summaries |
| Semantic Memory | wiki/ pages | Months to years | Cross-source synthesis |
| Procedural Memory | skills/, rules/ | Permanent | Reusable workflows and rules |

**Promotion path:** Raw sources get compiled into wiki pages (working → semantic). Repeated learnings get consolidated into wiki pages (episodic → semantic). Patterns across multiple wiki pages get extracted into skills (semantic → procedural). Old episodic memory gets pruned to archive.

The system handles this naturally through the slash commands: `/compile` promotes working and episodic memory to semantic. `/weekly-review` suggests skill extractions. `/prune` handles decay.

---

## Event-Driven Automation

### Session Start (Automatic)

Every time you open Claude Code, `session-start.sh` runs and displays:
- Uncompiled raw sources (prompts to run /compile)
- Content pipeline status
- Days since last lint (prompts if 7+ days)
- Cold wiki pages needing review
- Active error rule count

You see system health at a glance before typing a single command.

### Session End (Automatic)

Every time you close Claude Code, `auto-commit.sh`:
- Stages all changes in ~/.claude/
- Commits with a descriptive message (notes uncompiled sources if any exist)
- Pushes to the mind-lint Git remote
- Silently fails if offline (pushes next time)

Zero manual git work.

### Privacy Filtering (Automatic)

Before writing any content to the wiki or extracting knowledge from transcripts, the system scans for:
- API keys and tokens
- AWS credentials
- Private keys
- Passwords and secrets
- JWT tokens
- Database connection strings

If detected: shows what was found, offers to auto-redact. Redactions are logged.

### Crystallization (On Project Archive)

When `/archive-project` runs, it auto-generates a structured digest: what was built, key learnings, decisions made, entities involved, and content opportunities. The digest becomes both a wiki page and a content pipeline entry.

---

## Obsidian Integration

The Obsidian vault IS the ~/.claude/ directory. No sync, no duplication.

### What Obsidian Adds
- Visual editing with a polished UI
- `[[Bi-directional links]]` between notes
- Graph view showing how your knowledge connects
- One-hotkey capture via QuickAdd (learning, decision, content idea, raw source)
- Dataview queries for dashboard-style views
- Calendar navigation by date
- Visual git history via the Git plugin

### The Index Gap

When you create files in Claude Code (via `/log`), the file and index update together. When you create files in Obsidian (via QuickAdd), only the file gets created. The index doesn't know about it.

**Fix:** Run `/reindex` at the start of any Claude Code session where you've been editing in Obsidian. It scans all directories and updates every index file. Also runs automatically as part of `/lint`.

### Git Coordination
- `auto-commit.sh` owns the commit/push cycle (fires on Claude Code session end)
- Obsidian's Git plugin is for visual history and pull-on-startup only
- Don't let both systems auto-commit or you'll get conflicts

---

## All 14 Slash Commands

### Knowledge Management
| Command | What It Does |
|---|---|
| `/log` | Manually log a learning, decision, or preference |
| `/search-knowledge` | Search wiki (by confidence), then memory, then raw |
| `/compile` | Compile raw sources into wiki pages with confidence scoring, supersession, and entity extraction |
| `/lint` | Full health check: auto-fix, confidence recalculation, decay check, contradiction resolution |
| `/reindex` | Sync all index files with actual directory contents |
| `/prune` | Archive old learnings when index exceeds 50 entries |

### Review and Retrospective
| Command | What It Does |
|---|---|
| `/review-logs` | See recent captures, offer to compile to wiki |
| `/weekly-review` | Weekly retrospective with mini-lint and content idea suggestions |

### Project Management
| Command | What It Does |
|---|---|
| `/init-project` | Scaffold a per-project CLAUDE.md |
| `/archive-project` | Final knowledge sweep with crystallization digest |

### Content Pipeline
| Command | What It Does |
|---|---|
| `/content` | Manage the pipeline: capture ideas, develop drafts, check status |
| `/publish` | Export to Notion, blog, LinkedIn, social thread, video script |

### Knowledge Mining
| Command | What It Does |
|---|---|
| `/mine-sessions` | Extract knowledge from past Claude Code session transcripts |
| `/mine-chats` | Extract knowledge from exported Claude.ai conversations |

---

## Confidence, Decay, and Supersession

### Confidence Scoring

Every wiki page has a confidence score from 0.1 to 1.0:

```
base       = min(source_count × 0.2, 1.0)    ← more sources = higher
recency    = +0.1 if confirmed within 30 days ← recent = boost
contradict = -0.2 per active contradiction    ← conflicts = penalty
decay      = -0.05 per month since compiled   ← time erodes confidence

confidence = clamp(base + recency + contradict + decay, 0.1, 1.0)
```

`/compile` calculates confidence when creating or updating pages. `/lint` recalculates across all pages. `/search-knowledge` ranks results by confidence (highest first).

### Decay Status

Based on time since last access or update:
- **Active:** within 30 days
- **Cooling:** 30-90 days
- **Cold:** 90+ days

Cold pages aren't deleted. They're deprioritized in search results and flagged during `/lint` for review (refresh, archive, or leave as-is).

### Supersession

When new information contradicts an existing claim:
1. The old claim gets marked with strikethrough and a supersession note
2. The new claim replaces it with a source reference
3. Both versions are preserved in the Supersession Log
4. Confidence shifts from the old claim to the new one

No silent overwrites. Full auditability.

---

## The Content Pipeline

### How Content Flows

```
Capture → Develop → Publish
(ideas/)   (drafts/)  (published/)
```

**Capture happens three ways:**
- `/weekly-review` auto-suggests 2-3 content ideas from the week's work
- `/archive-project` flags build sessions as content opportunities
- Manual capture via `/content` or Obsidian QuickAdd hotkey

**Development follows the content-creation skill:**
1. Identify the key takeaway
2. Identify audience and format
3. Pull source material from wiki, memory, raw
4. Outline → draft → review → final edit
5. Update `_pipeline.md`

**Publishing via `/publish`:**
- Blog post (formatted markdown)
- LinkedIn post (1,300 char max, with count)
- Social thread (numbered tweets)
- Video script (talking points with screen recording notes)
- Notion page (client-facing, professional)
- Multiple formats from same source

### The Meta Feature

The system documents itself. Building Mind-Lint v2 generated six content ideas before it was even finished. The process of working IS the content. Every significant build session, every interesting problem solved, every decision made is raw material for sharing.

---

## Knowledge Mining

### Claude Code Sessions (`/mine-sessions`)

Session transcripts live at `~/.claude/projects/` as .jsonl files, retained for 30 days. `/mine-sessions` reads through them and extracts:
- Learnings → memory/learnings/
- Decisions → memory/decisions/
- Corrections → rules/error-rules.md
- Preferences → rules/preferences.md
- Content ideas → content/ideas/

Shows you what it found, asks for confirmation before writing. Tracks mined sessions to avoid re-processing.

### Claude.ai Chats (`/mine-chats`)

Export chats from Claude.ai (Settings → Privacy → Export Data, or Chrome extension). Place files in `raw/transcripts/`. `/mine-chats` processes them with the same extraction pipeline.

### The Habit

Going forward, Mind-Lint captures knowledge in real-time (auto-logging handles most of it). Mining is for backfilling: run `/mine-sessions` monthly to catch anything auto-logging missed, and `/mine-chats` after exporting valuable Claude.ai conversations.

---

## Daily Workflow

### Starting a Session
1. Open Claude Code. Session-start hook shows system status.
2. If you edited in Obsidian since last session, run `/reindex`.
3. Start working. Claude already knows who you are, your preferences, your projects.

### During a Session
- Claude auto-logs corrections, learnings, and decisions as they happen
- Say "log this" or "remember this" for manual captures
- Say "content idea" when something feels shareable
- Skills and context load automatically based on the task

### Ending a Session
- Close Claude Code. Auto-commit fires, stages, commits, pushes.

### Weekly
- Run `/weekly-review`
- Review learnings and decisions
- Mini-lint for system health
- Pick 1-2 content ideas to develop

### Monthly
- Run `/lint` for full health check
- Run `/compile` for any uncompiled sources
- Run `/mine-sessions` to extract knowledge from recent transcripts
- Run `/prune` if learnings index is growing
- Update `active-projects.md`

---

## Version Control

The entire system is a Git repo pushed to a private GitHub remote.

**Auto-commit** fires on every Claude Code session end. Zero manual git work.

**New machine setup:**
```
git clone https://github.com/eddiematias/mind-lint.git ~/.claude
```

Then open as an Obsidian vault and install the plugins (Templater, Git, Dataview, QuickAdd, Calendar).

**What gets committed:** All markdown, scripts, commands, templates, essential Obsidian config.

**What stays local:** Obsidian workspace state, plugin data caches, Claude Code's native auto memory.

---

## Credits

Mind-Lint builds on ideas shared openly by others:

- **Andrej Karpathy** — The LLM Wiki pattern (raw → wiki → schema, "stop re-deriving, start compiling")
- **Rohit Ghumare** — LLM Wiki v2 (confidence scoring, supersession, decay, four-tier memory model, event-driven automation)
- **Michael Tuszynski** — Error-to-rule pipeline, modular context loading, context-as-code principles
- **Daniel Miessler** — Personal AI Infrastructure, three-tier memory architecture
- **ETH Zurich** — Research showing oversized context files hurt performance (shaped the modular loading approach)
- **Simon Willison** — claude-code-transcripts tool (inspired /mine-sessions)
- **The Agentic OS community** — Folder-based markdown architecture for AI agent context
- **Anthropic** — Claude Code's CLAUDE.md, hooks, skills, and slash command architecture

Full credits with links: `docs/credits.md`

---

## What's Next

**Phase 5 (when wiki hits ~50-100 pages):**
- Obsidian MCP integration for smart semantic search from Claude.ai/Desktop
- Knowledge graph with typed entities and relationship traversal
- Hybrid search (BM25 + vector + graph)

**Installable package:**
- GitHub repo with setup script so others can install Mind-Lint
- Claude Code skill/plugin for conversational setup
- Content about the system drives discovery

The system is designed to evolve. New skills get added as workflows emerge. New error rules accumulate from every mistake. The wiki compounds with every compilation. The content pipeline keeps generating from the work itself. It gets better the more you use it.
