# Obsidian Setup for Mind-Lint

Obsidian is optional but recommended. It gives you visual editing, hotkey capture, and a knowledge graph on top of the same markdown files Claude Code reads.

---

## Install

1. Download [Obsidian](https://obsidian.md) (free for personal use)
2. Open `~/.claude/` as a vault (press Cmd+Shift+. to show hidden files on Mac)

## Plugins

Install these from Settings → Community plugins → Browse:

| Plugin | Search For | Purpose |
|---|---|---|
| Templater | "Templater" | Template engine with date variables |
| Git | "Git" (by Vinzent03) | Visual git history, pull on startup |
| Dataview | "Dataview" | Query your vault like a database |
| QuickAdd | "QuickAdd" | Hotkey-triggered capture |
| Calendar | "Calendar" | Navigate notes by date |

## Configure Templater

1. Settings → Templater
2. Template folder: `templates`
3. Enable "Trigger Templater on new file creation"

## Configure QuickAdd

1. Settings → QuickAdd
2. Create 4 choices (type: Template for each):

| Choice Name | Template | Folder | File Name |
|---|---|---|---|
| New Learning | templates/learning.md | memory/learnings | {{DATE}}-{{VALUE}} |
| New Decision | templates/decision.md | memory/decisions | {{DATE}}-{{VALUE}} |
| Content Idea | templates/content-idea.md | content/ideas | {{DATE}}-{{VALUE}} |
| Raw Source | templates/raw-source.md | raw/notes | {{DATE}}-{{VALUE}} |

3. Click the ⚡ lightning bolt next to each choice (registers it as a command)
4. Settings → Hotkeys → search "QuickAdd" → assign hotkeys:
   - New Learning: `Cmd+Shift+L`
   - New Decision: `Cmd+Shift+D`
   - Content Idea: `Cmd+Shift+I`
   - Raw Source: `Cmd+Shift+R`

## Configure Git Plugin

1. Settings → Git (gear icon)
2. **Vault backup interval:** `0` (disabled, auto-commit.sh handles this)
3. **Auto pull interval:** `0` (disabled)
4. **Pull updates on startup:** `ON`
5. Everything else: defaults

**Important:** Don't enable auto-commit in the Git plugin. Your auto-commit.sh script owns the commit cycle. Two systems committing = merge conflicts.

## The Index Gap

Files created in Obsidian won't appear in Claude Code's indexes until you run `/reindex`. Make it a habit: if you edited in Obsidian, start your Claude Code session with `/reindex`.

## Useful Dataview Queries

Paste these into any note for dashboard views:

**Recent decisions:**
````
```dataview
TABLE date, status, category FROM "memory/decisions" SORT date DESC LIMIT 10
```
````

**Content ideas by priority:**
````
```dataview
TABLE format, audience, priority FROM "content/ideas" SORT priority ASC
```
````
