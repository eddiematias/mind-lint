The user wants to log something. Ask what type of entry this is:

1. **Learning** - A technique, pattern, gotcha, or insight discovered during this session
2. **Decision** - A meaningful choice that was made (architecture, tooling, approach, strategy)
3. **Preference/Correction** - A correction to how Claude should behave, or a new preference to remember

Based on the type:

### If Learning:
- Ask which category it fits: frontend, backend, ai-workflows, devops, mobile, business-strategy, design, collaboration-tools, or a new category
- Write the entry to the appropriate file in ~/.claude/memory/learnings/ using this format:
  ```
  ### [TODAY'S DATE] Short Title
  **Project:** current project name (or "general")
  **Context:** What we were doing when we learned this
  **Learning:** The actual insight
  **Topics:** [[category]] [[other-category-if-applicable]]
  **Tags:** #subcategory #cross-cutting-attribute
  ```
- **Topics vs Tags (do not skip this classification step):**
  - **Topics** are `[[wikilinks]]` to topic notes that exist as files in `memory/learnings/` or `wiki/`. The chosen category file always belongs in Topics (e.g. an entry filed in `frontend.md` gets `[[frontend]]`). Add additional topic links if the learning genuinely spans multiple topic files.
  - **Tags** are `#hashtag`-syntax cross-cutting attributes that do NOT have their own page. Examples: `#prompting`, `#claude-code`, `#architecture`, `#performance`, `#testing`, `#security`, `#migration`, `#mcp`.
  - Why this matters: Obsidian's graph view treats `[[wikilinks]]` as graph edges (clickable, navigable, surface backlinks) and treats `#tags` as filter-pane labels (no graph node). Putting topic terms in Tags breaks graph navigation. See error rule #10.
- Add a one-line summary to ~/.claude/memory/learnings/index.md under "Recent Entries"
- If the learning is significant, offer to compile it into a wiki page via /compile

### If Decision:
- Create a new file in ~/.claude/memory/decisions/ named with today's date and a short topic slug
- Use the decision template format with Context, Options Considered, Decision, and Consequences
- Add a one-line summary to ~/.claude/memory/decisions/index.md

### If Preference/Correction:
- Add a dated entry to ~/.claude/rules/preferences.md under "Things the user Has Corrected"
- Format: `- [TODAY'S DATE] Correction: "what was wrong" → Rule: "what to do going forward"`
- Add a numbered rule to ~/.claude/rules/error-rules.md
- Log the correction to ~/.claude/memory/corrections/index.md

After logging, confirm what was written and where.
