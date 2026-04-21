#!/bin/bash
# Mind-Lint v2: Auto-commit on session end
# Fires via SessionEnd hook in settings.json

CLAUDE_DIR="$HOME/.claude"
cd "$CLAUDE_DIR" || exit 0

# Check if anything changed
if [ -z "$(git status --porcelain 2>/dev/null)" ]; then
    exit 0
fi

# Check for uncompiled sources
REMINDER=""
if [ -f "$CLAUDE_DIR/raw/_index.md" ]; then
    UNCOMPILED=$(grep -c "| No |" "$CLAUDE_DIR/raw/_index.md" 2>/dev/null || echo "0")
    if [ "$UNCOMPILED" -gt 0 ]; then
        REMINDER=" [note: $UNCOMPILED uncompiled source(s) pending]"
    fi
fi

# Build commit message based on what changed
MSG="auto: session update"
if git status --porcelain | grep -q "rules/error-rules.md"; then
    MSG="auto: new error rule(s) added"
elif git status --porcelain | grep -q "memory/learnings/"; then
    MSG="auto: new learning(s) logged"
elif git status --porcelain | grep -q "memory/decisions/"; then
    MSG="auto: new decision(s) recorded"
elif git status --porcelain | grep -q "wiki/"; then
    MSG="auto: wiki updated"
elif git status --porcelain | grep -q "rules/preferences.md"; then
    MSG="auto: preferences updated"
elif git status --porcelain | grep -q "content/"; then
    MSG="auto: content pipeline updated"
fi

MSG="${MSG}${REMINDER}"

git add -A
git commit -m "$MSG" --quiet
git push --quiet 2>/dev/null &

exit 0
