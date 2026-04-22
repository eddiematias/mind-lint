# Mind-Lint Credits & Attribution

Mind-Lint draws on ideas, research, and open-source work from the following people and projects. If you're building something similar, check out their work.

---

## Core Architecture

### Andrej Karpathy: LLM Wiki Pattern
- **What:** Three-layer architecture (raw → wiki → schema), ingest/query/lint operations, "stop re-deriving, start compiling"
- **Source:** [LLM Wiki Gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) (April 2026)

### Rohit Ghumare: LLM Wiki v2 (Memory Lifecycle)
- **What:** Confidence scoring, supersession, forgetting/decay curves, four-tier memory model, entity extraction, event-driven automation
- **Source:** [LLM Wiki v2 Gist](https://gist.github.com/rohitg00/2067ab416f7bbe447c1977edaaa681e2), built on [agentmemory](https://github.com/rohitg00/agentmemory)

### Michael Tuszynski: Context Engineering
- **What:** Error-to-rule pipeline, modular context loading, context-as-code, cost-aware model routing
- **Source:** ["Context Engineering Is the New Prompt Engineering"](https://www.mpt.solutions/context-engineering-is-the-new-prompt-engineering/) (April 2026)

### Daniel Miessler: Personal AI Infrastructure
- **What:** Three-tier memory architecture, continuous learning loop, AI-as-infrastructure philosophy
- **Source:** [Personal_AI_Infrastructure](https://github.com/danielmiessler/Personal_AI_Infrastructure)

### The Agentic OS Pattern
- **What:** Folder-based markdown architecture, CLAUDE.md as router, skills as on-demand frameworks
- **Sources:** [MindStudio](https://www.mindstudio.ai/blog/agentic-os-architecture-claude-code-business-brain), community practitioners

## Research

### ETH Zurich: Context File Effectiveness
- **What:** Finding that large context files increase costs up to 159% with marginal gains. Models follow ~150-200 instructions reliably.
- **Source:** ["Evaluating AGENTS.md"](https://arxiv.org/html/2602.11988v1) (February 2026)

### Ebbinghaus Forgetting Curve
- **What:** Decay model for confidence scoring. Retention decays exponentially, reinforcement resets the curve.

## Tools

### Simon Willison: claude-code-transcripts
- **What:** Inspiration for /mine-sessions
- **Source:** [claude-code-transcripts](https://github.com/simonw/claude-code-transcripts)

### Anthropic: Claude Code
- **What:** CLAUDE.md, hooks, skills, slash commands
- **Source:** [Claude Code Docs](https://code.claude.com/docs/en/best-practices)

### Vinzent03: Obsidian Git Plugin
- **Source:** [obsidian-git](https://github.com/Vinzent03/obsidian-git)

### Testing and Tooling

- **[bats-core](https://github.com/bats-core/bats-core)** - Bash Automated Testing System. Test framework for the install/sync/migrate/uninstall modes.
- **[shellcheck](https://www.shellcheck.net/)** - static analysis for shell scripts. Catches common bugs (unquoted variables, `read` without `-r`, etc.) in CI.
- **[jq](https://jqlang.github.io/jq/)** - command-line JSON processor. Used by `lib/settings.sh` to safely merge Mind-Lint hooks and permissions into `~/.claude/settings.json` without clobbering user additions.

---

If you build on Mind-Lint, please credit the contributors above. They shared their work openly.
