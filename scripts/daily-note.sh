#!/bin/bash
# Mind-Lint v2: Daily Note Creator
# Creates today's daily note from templates/daily-note.md if it doesn't exist.
#
# Triggered by:
#   - SessionStart hook (scripts/session-start.sh) — creates the shell so the
#     note is ready when Claude opens.
#   - Manual: bash scripts/daily-note.sh
#   - Obsidian Templater button (renders the same template).
#   - /today (creates the shell on demand if it's still missing).
#
# Idempotent: if today's note exists, exits without action.
#
# This script no longer populates ## Calendar. Calendar lookup is now on-demand
# via /today, which calls the iCloud and Google paths itself (see commands/today.md).

set -euo pipefail

CLAUDE_DIR="$HOME/.claude"
TEMPLATE="$CLAUDE_DIR/templates/daily-note.md"
JOURNAL_DIR="$CLAUDE_DIR/journal"

TODAY=$(date +%Y-%m-%d)
YESTERDAY=$(date -v-1d +%Y-%m-%d 2>/dev/null || date -d "yesterday" +%Y-%m-%d)
TOMORROW=$(date -v+1d +%Y-%m-%d 2>/dev/null || date -d "tomorrow" +%Y-%m-%d)
DATE_LONG=$(date +"%A, %B %-d, %Y")

# Flat layout: journal/YYYY-MM-DD.md. Matches Obsidian's core Daily Notes plugin
# default. Wikilinks like [[2026-04-29|← Yesterday]] resolve by basename, so flat
# layout doesn't break navigation.
NOTE_PATH="$JOURNAL_DIR/$TODAY.md"

if [ -f "$NOTE_PATH" ]; then
    echo "[daily-note] Today's note already exists at $NOTE_PATH"
    exit 0
fi

if [ ! -f "$TEMPLATE" ]; then
    echo "[daily-note] ERROR: template not found at $TEMPLATE" >&2
    exit 1
fi

mkdir -p "$JOURNAL_DIR"

# Render the template by substituting Templater-style date patterns. The same
# template works for both this script and Obsidian's Templater plugin.
sed \
    -e "s|<% tp.date.now(\"YYYY-MM-DD\") %>|$TODAY|g" \
    -e "s|<% tp.date.now(\"YYYY-MM-DD\", -1) %>|$YESTERDAY|g" \
    -e "s|<% tp.date.now(\"YYYY-MM-DD\", 1) %>|$TOMORROW|g" \
    -e "s|<% tp.date.now(\"dddd, MMMM D, YYYY\") %>|$DATE_LONG|g" \
    "$TEMPLATE" > "$NOTE_PATH"

echo "[daily-note] Created $NOTE_PATH"
