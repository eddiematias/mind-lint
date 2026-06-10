#!/bin/bash
# Auto-commit changes to ~/.claude/ knowledge system
# Triggered by Claude Code SessionEnd hook
# Runs in background to avoid blocking session exit

cd ~/.claude || exit 0

# Only proceed if this is a git repo
[ -d .git ] || exit 0

# Check if there are any changes
if ! git diff --quiet || ! git diff --cached --quiet || [ -n "$(git ls-files --others --exclude-standard)" ]; then
    git add -A

    # Check for uncompiled sources and leave a reminder
    REMINDER=""
    if [ -f "raw/_index.md" ]; then
        UNCOMPILED=$(grep -c "| No |" "raw/_index.md" 2>/dev/null || echo "0")
        if [ "$UNCOMPILED" -gt 0 ]; then
            REMINDER=" [note: $UNCOMPILED uncompiled source(s) pending]"
        fi
    fi

    # Build a descriptive commit message from what changed
    CHANGED_FILES=$(git diff --cached --name-only)

    if echo "$CHANGED_FILES" | grep -q "rules/preferences.md"; then
        MSG="auto: updated preferences"
    elif echo "$CHANGED_FILES" | grep -q "rules/error-rules.md"; then
        MSG="auto: new error rule added"
    elif echo "$CHANGED_FILES" | grep -q "memory/learnings/"; then
        MSG="auto: new learnings logged"
    elif echo "$CHANGED_FILES" | grep -q "memory/decisions/"; then
        MSG="auto: new decision recorded"
    elif echo "$CHANGED_FILES" | grep -q "wiki/"; then
        MSG="auto: wiki updated"
    elif echo "$CHANGED_FILES" | grep -q "content/"; then
        MSG="auto: content pipeline updated"
    else
        MSG="auto: session updates"
    fi

    git commit -q -m "${MSG}${REMINDER}" 2>/dev/null

    # Push if remote is configured (silent fail if offline)
    if git remote get-url origin &>/dev/null; then
        git push -q 2>/dev/null &
    fi
fi
