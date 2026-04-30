#!/bin/bash
# Mind-Lint v2: Daily Note Creator
# Creates today's daily note from templates/daily-note.md if it doesn't exist.
# Triggered by:
#   - launchd at 10:30 AM (com.eddie.mindlint-daily.plist)
#   - SessionStart hook (scripts/session-start.sh) as backup
#   - Manual invocation: bash scripts/daily-note.sh
#
# Idempotent: if today's note exists, exits without action.
#
# After creating the note, populates the ## Calendar section with today's events
# from both calendars (currently TODO; Phase 2 wires the calendar feeds).

set -euo pipefail

CLAUDE_DIR="$HOME/.claude"
TEMPLATE="$CLAUDE_DIR/templates/daily-note.md"
JOURNAL_DIR="$CLAUDE_DIR/journal"

# Date components for the note.
TODAY=$(date +%Y-%m-%d)
YEAR_MONTH=$(date +%Y-%m)
YESTERDAY=$(date -v-1d +%Y-%m-%d 2>/dev/null || date -d "yesterday" +%Y-%m-%d)
TOMORROW=$(date -v+1d +%Y-%m-%d 2>/dev/null || date -d "tomorrow" +%Y-%m-%d)
DATE_LONG=$(date +"%A, %B %-d, %Y")

NOTE_DIR="$JOURNAL_DIR/$YEAR_MONTH"
NOTE_PATH="$NOTE_DIR/$TODAY.md"

# Idempotence: exit early if today's note already exists.
if [ -f "$NOTE_PATH" ]; then
    echo "[daily-note] Today's note already exists at $NOTE_PATH"
    exit 0
fi

# Verify template exists.
if [ ! -f "$TEMPLATE" ]; then
    echo "[daily-note] ERROR: template not found at $TEMPLATE" >&2
    exit 1
fi

# Create the year-month directory if needed.
mkdir -p "$NOTE_DIR"

# Render the template by substituting Templater-style date patterns.
# This way the same template works for both this script and Obsidian's Templater plugin.
sed \
    -e "s|<% tp.date.now(\"YYYY-MM-DD\") %>|$TODAY|g" \
    -e "s|<% tp.date.now(\"YYYY-MM-DD\", -1) %>|$YESTERDAY|g" \
    -e "s|<% tp.date.now(\"YYYY-MM-DD\", 1) %>|$TOMORROW|g" \
    -e "s|<% tp.date.now(\"dddd, MMMM D, YYYY\") %>|$DATE_LONG|g" \
    "$TEMPLATE" > "$NOTE_PATH"

echo "[daily-note] Created $NOTE_PATH"

# Phase 2 will populate the ## Calendar section here. Placeholder for now.
# Implementation choice (per plan): use direct macOS APIs from this script
# (icalBuddy or AppleScript on Calendar.app) rather than calling MCPs, so the
# cron path doesn't need a Claude Code session in scope. MCPs remain the path
# for live calendar queries during chat.
