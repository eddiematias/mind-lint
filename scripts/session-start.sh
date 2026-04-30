#!/bin/bash
# Mind-Lint v2: Session Start Hook
# Event-driven automation pattern from LLM Wiki v2 by Rohit Ghumare
# Context engineering principles from Michael Tuszynski (mpt.solutions)

CLAUDE_DIR="$HOME/.claude"

# SessionStart backup for the daily note: if launchd missed (machine asleep, traveling),
# create today's note now. Idempotent — exits early if note exists.
if [ -x "$CLAUDE_DIR/scripts/daily-note.sh" ]; then
    bash "$CLAUDE_DIR/scripts/daily-note.sh" >/dev/null 2>&1 || true
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Mind-Lint v2 — Session Status"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ -f "$CLAUDE_DIR/raw/_index.md" ]; then
    UNCOMPILED=$(grep -c "| No |" "$CLAUDE_DIR/raw/_index.md" 2>/dev/null || echo "0")
    if [ "$UNCOMPILED" -gt 0 ]; then
        echo "📥 $UNCOMPILED uncompiled source(s) in raw/ — run /compile"
    fi
fi

if [ -f "$CLAUDE_DIR/content/_pipeline.md" ]; then
    IDEAS=$(grep -c "^|" "$CLAUDE_DIR/content/_pipeline.md" 2>/dev/null || echo "0")
    IDEAS=$((IDEAS > 3 ? IDEAS - 3 : 0))
    if [ "$IDEAS" -gt 0 ]; then
        echo "💡 $IDEAS item(s) in content pipeline"
    fi
fi

if [ -f "$CLAUDE_DIR/wiki/_log.md" ]; then
    LAST_LINT=$(grep -i "lint" "$CLAUDE_DIR/wiki/_log.md" | tail -1 | grep -oE "[0-9]{4}-[0-9]{2}-[0-9]{2}" | tail -1)
    if [ -n "$LAST_LINT" ]; then
        LAST_LINT_EPOCH=$(date -j -f "%Y-%m-%d" "$LAST_LINT" +%s 2>/dev/null || date -d "$LAST_LINT" +%s 2>/dev/null || date +%s)
        NOW_EPOCH=$(date +%s)
        DAYS_SINCE=$(( (NOW_EPOCH - LAST_LINT_EPOCH) / 86400 ))
        if [ "$DAYS_SINCE" -gt 7 ]; then
            echo "🔍 Last lint was $DAYS_SINCE days ago — consider running /lint"
        fi
    else
        echo "🔍 No lint on record — consider running /lint"
    fi
fi

if [ -d "$CLAUDE_DIR/wiki" ]; then
    COLD=$(grep -rl "decay_status: cold" "$CLAUDE_DIR/wiki/" 2>/dev/null | wc -l | tr -d ' ')
    if [ "$COLD" -gt 0 ]; then
        echo "🧊 $COLD cold wiki page(s) — review during next /lint"
    fi
fi

if [ -f "$CLAUDE_DIR/rules/error-rules.md" ]; then
    RULES=$(grep -cE "^[0-9]+\." "$CLAUDE_DIR/rules/error-rules.md" 2>/dev/null || echo "0")
    echo "📏 $RULES error rule(s) active"
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
