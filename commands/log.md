# /log — Manual Knowledge Logging

Log a learning, decision, or preference manually.

## Steps
1. Ask: "What type? (learning, decision, or preference)"
2. Based on type:
   - **Learning**: Ask for context, the learning, and why it matters. Write to memory/learnings/ using templates/learning.md format. Populate the `## Topics` section with `[[wikilinks]]` to category notes (see "Topics vs Tags" below). Set the frontmatter `tags:` field to cross-cutting attributes only. Update memory/learnings/index.md.
   - **Decision**: Ask for context, options considered, what was chosen, and why. Write to memory/decisions/ using templates/decision.md format. Update memory/decisions/index.md.
   - **Preference**: Ask what the preference is. Append to rules/preferences.md.
3. After logging, offer to compile into wiki if the entry is significant.
4. Confirm what was written and where.

## Topics vs Tags (do not skip this classification step for Learnings)

Obsidian models tags and wikilinks as different objects:
- **`[[wikilinks]]`** in the body become graph edges. Clicking a topic node in the graph view opens the linked note and shows backlinks from every entry that links to it.
- **`#tags`** (in frontmatter or inline) drive the Tags pane (filter view). They are not graph nodes; clicking a tag in the graph opens the Tags pane, not the topic note.

The rule for choosing:
- If the term has a corresponding note (e.g. there's a `frontend.md` in `memory/learnings/` or a `frontend-craft-patterns.md` in `wiki/`), use a wikilink in the `## Topics` section.
- If the term is a cross-cutting attribute that doesn't have its own page (e.g. `#prompting`, `#payload-cms`, `#nextjs`, `#scope`, `#migration`), put it in the frontmatter `tags:` field.

Putting topic terms into `tags:` (instead of `## Topics` wikilinks) silently breaks graph navigation. The graph will show an isolated tag node with no link to the corresponding topic note.
