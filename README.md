# Mind-Lint

A personal knowledge operating system for Claude Code. Your AI remembers everything: who you are, how you work, what you've learned, and what mistakes to avoid.

Every session starts with full context. Every correction makes the system smarter. Every piece of work becomes potential content.

---

## What This Does

Mind-Lint turns your `~/.claude/` directory into a persistent knowledge layer that loads automatically at the start of every Claude Code session. Instead of re-explaining yourself every time, your AI shows up already knowing:

- **Who you are** and how you communicate
- **Your tech stack** and code standards
- **Your active projects** and client context
- **Every mistake it's ever made** (as permanent, numbered rules)
- **Everything you've learned** across all projects
- **Every decision you've made** and why

It also gives you a wiki that compiles and cross-links your knowledge, a content pipeline that turns your work into blog posts and social threads, and 14 slash commands for managing all of it.

## How It Works

Your `~/.claude/` directory becomes three things at once:

| Tool | What It Sees |
|---|---|
| **Claude Code** | Its config directory. Reads CLAUDE.md and all references at session start. |
| **Obsidian** | A vault of linked markdown notes with visual graph and hotkey capture. |
| **Git** | A version-controlled repo. Every change tracked, diffable, pushable. |

Same files. Three tools. Zero sync.

### The Architecture

Five layers:
1. **Raw**: immutable source materials (articles, transcripts, notes)
2. **Memory**: learnings, decisions, and corrections (per-event logs)
3. **Wiki**: AI-compiled knowledge pages (cross-linked, confidence-scored, self-maintaining)
4. **Skills & Rules**: reusable workflows and permanent error corrections
5. **Content**: pipeline from idea to draft to published

### Key Features

- **Modular context loading**: a lean base loads every session (~150 lines). Additional context loads only when the task calls for it.
- **Error-to-rule pipeline**: every AI mistake becomes a permanent numbered rule. The system gets smarter when it fails.
- **Confidence scoring**: wiki pages carry confidence scores based on source count, recency, and contradictions.
- **Supersession**: new info explicitly marks old claims as stale, not silently overwrites them.
- **Event-driven automation**: session start shows system health, session end auto-commits, privacy filtering strips sensitive data on ingest.
- **Content pipeline**: the process of building things IS content. Auto-captures ideas, tracks drafts, publishes to multiple formats.
- **Knowledge mining**: extract learnings from past Claude Code sessions and Claude.ai chat exports.
- **14 slash commands**: `/log`, `/compile`, `/lint`, `/search-knowledge`, `/reindex`, `/prune`, `/review-logs`, `/weekly-review`, `/init-project`, `/archive-project`, `/content`, `/publish`, `/mine-sessions`, `/mine-chats`

---

## Quick Start

### Prerequisites
- [Claude Code](https://code.claude.com) installed
- Git installed and configured
- `jq` (for settings.json merging): `brew install jq` (macOS) or `apt install jq` (Linux)
- Mac or Linux (Windows via WSL). Native Windows is not supported.

### Install

```bash
# Clone anywhere you like (not into ~/.claude/)
git clone https://github.com/eddiematias/mind-lint.git ~/mindlint

# Run setup (safe even on populated ~/.claude/)
cd ~/mindlint
bash setup.sh
```

The setup script:
- **Never overwrites** your existing `~/.claude/` data. Uses symlinks for framework files and seeds user-editable templates only if missing.
- **Interactive wizard** for your name, role, tech stack, and first client (optional).
- **Collision-safe**: if you already have `~/.claude/commands/lint.md`, you're prompted per-file (diff / rename / skip / overwrite).
- **Auto-detects** pre-existing Mind-Lint installs and migrates them (with backup to `~/.claude-backup-<timestamp>`).

### Update

```bash
cd ~/mindlint && git pull && bash setup.sh
```

`git pull` updates all framework files live (they're symlinks). Re-running `setup.sh` picks up any new commands added upstream. Both are idempotent.

To update user-editable templates (`rules/workflows.md`, `rules/boundaries.md`, generic skills):

```bash
bash ~/mindlint/setup.sh --sync
```

Shows per-file diffs and lets you keep yours, take upstream, or manually merge.

### Uninstall

```bash
bash ~/mindlint/setup.sh --uninstall
```

Removes Mind-Lint's framework symlinks and `settings.json` entries. Your knowledge data (`memory/`, `wiki/`, `content/`, accumulated rules, etc.) is preserved.

### Repair

If you move `~/mindlint/` to a new location, the symlinks break. To repair:

```bash
bash <new-path>/setup.sh --relink
```

### Post-Install: Obsidian (Optional but Recommended)

1. Download [Obsidian](https://obsidian.md) (free)
2. Open `~/.claude/` as a vault
3. Install plugins: **Templater**, **Git** (by Vinzent03), **Dataview**, **QuickAdd**, **Calendar**
4. Point Templater to `templates/` directory
5. Set up QuickAdd hotkeys for rapid capture

See `docs/obsidian-setup.md` for the full walkthrough.

### Verify It Works

Open Claude Code in any project. You should see the session-start status display. Then try:
```
/lint
/log
/content
```

---

## Slash Commands

### Knowledge Management
| Command | What It Does |
|---|---|
| `/log` | Log a learning, decision, or preference |
| `/search-knowledge` | Search wiki (by confidence), then memory, then raw |
| `/compile` | Compile raw sources into wiki pages with confidence scoring |
| `/lint` | Full health check with auto-fix, confidence recalculation, decay checks |
| `/reindex` | Sync index files with actual directory contents |
| `/prune` | Archive old learnings when index exceeds 50 entries |

### Review
| Command | What It Does |
|---|---|
| `/review-logs` | See recent captures, compile to wiki |
| `/weekly-review` | Weekly retrospective with mini-lint and content ideas |

### Projects
| Command | What It Does |
|---|---|
| `/init-project` | Scaffold a per-project CLAUDE.md |
| `/archive-project` | Final knowledge sweep with crystallization |

### Content
| Command | What It Does |
|---|---|
| `/content` | Manage the pipeline: ideas, drafts, publishing |
| `/publish` | Export to blog, LinkedIn, social thread, video script, Notion |

### Knowledge Mining
| Command | What It Does |
|---|---|
| `/mine-sessions` | Extract knowledge from past Claude Code sessions |
| `/mine-chats` | Extract knowledge from exported Claude.ai conversations |

---

## The Memory Model

Knowledge flows through four tiers, each more compressed and durable:

| Tier | Location | Lifespan | Example |
|---|---|---|---|
| Working | raw/ | Days-weeks | A brain dump, an article you saved |
| Episodic | memory/ | Weeks-months | "I learned X while building Y" |
| Semantic | wiki/ | Months-years | "Here's everything we know about X" |
| Procedural | skills/, rules/ | Permanent | "When writing social copy, always..." |

`/compile` promotes working → semantic. `/weekly-review` suggests semantic → procedural. `/prune` handles natural decay.

---

## Customization

### Adding Clients

Create a directory under `context/clients/`:
```
context/clients/your-client/
├── overview.md
├── brand-voice.md
└── vocabulary.md
```

Then create skill files in `skills/` for each communication channel. Add modular loading comments to CLAUDE.md.

### Adding Skills

Any repeatable workflow can become a skill. Create a file in `skills/` with: When to Load, Tone, Format Guidelines, Rules, Examples.

### Error Rules

Every AI mistake becomes a numbered rule in `rules/error-rules.md`. Rules are permanent, never deleted, loaded every session. The system compounds.

---

## Documentation

- `docs/system-guide.md`: Complete walkthrough of the entire system
- `docs/obsidian-setup.md`: Step-by-step Obsidian configuration
- `docs/credits.md`: Attribution for all ideas and influences

---

## Credits

Mind-Lint builds on ideas shared openly by others:

- **Andrej Karpathy**: [LLM Wiki pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
- **Rohit Ghumare**: [LLM Wiki v2](https://gist.github.com/rohitg00/2067ab416f7bbe447c1977edaaa681e2) (memory lifecycle)
- **Michael Tuszynski**: [Context Engineering](https://www.mpt.solutions/context-engineering-is-the-new-prompt-engineering/) (error-to-rule pipeline)
- **Daniel Miessler**: [Personal AI Infrastructure](https://github.com/danielmiessler/Personal_AI_Infrastructure)
- **ETH Zurich**: [Context file research](https://arxiv.org/html/2602.11988v1)
- **Simon Willison**: [claude-code-transcripts](https://github.com/simonw/claude-code-transcripts)
- **Anthropic**: Claude Code architecture

Full credits: `docs/credits.md`

## License

MIT. Use it, fork it, adapt it. If you build on it, credit the people above.
