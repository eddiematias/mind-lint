#!/bin/bash
# Mind-Lint v2: Session Start Hook
# Event-driven automation pattern from LLM Wiki v2 by Rohit Ghumare
# Context engineering principles from Michael Tuszynski (mpt.solutions)
# Runs automatically at the start of every Claude Code session
# Shows system status and flags anything that needs attention

CLAUDE_DIR="$HOME/.claude"

# SessionStart backup for the daily note: if launchd missed (machine asleep, traveling),
# create today's note now. Idempotent — exits early if note exists.
if [ -x "$CLAUDE_DIR/scripts/daily-note.sh" ]; then
    bash "$CLAUDE_DIR/scripts/daily-note.sh" >/dev/null 2>&1 || true
fi

echo ""
echo "  Mind-Lint v2 — Session Status"
echo "--------------------------------------"

# Check for uncompiled raw sources.
# Note: `grep -c` exits 1 when count is 0, so use `|| true` (not `|| echo "0"`,
# which would duplicate stdout and produce a multi-line value).
if [ -f "$CLAUDE_DIR/raw/_index.md" ]; then
    UNCOMPILED=$(grep -c "| No |" "$CLAUDE_DIR/raw/_index.md" 2>/dev/null || true)
    UNCOMPILED=${UNCOMPILED:-0}
    if [ "$UNCOMPILED" -gt 0 ]; then
        echo "  $UNCOMPILED uncompiled source(s) in raw/ -- run /compile"
    fi
fi

# Check content pipeline
if [ -f "$CLAUDE_DIR/content/_pipeline.md" ]; then
    IDEAS=$(grep -c "^|" "$CLAUDE_DIR/content/_pipeline.md" 2>/dev/null || true)
    IDEAS=${IDEAS:-0}
    # Subtract header rows (rough estimate)
    IDEAS=$((IDEAS > 3 ? IDEAS - 3 : 0))
    if [ "$IDEAS" -gt 0 ]; then
        echo "  $IDEAS item(s) in content pipeline"
    fi
fi

# Check when lint was last run
if [ -f "$CLAUDE_DIR/wiki/_log.md" ]; then
    LAST_LINT=$(grep -i "lint" "$CLAUDE_DIR/wiki/_log.md" | tail -1 | grep -oE "[0-9]{4}-[0-9]{2}-[0-9]{2}" | tail -1)
    if [ -n "$LAST_LINT" ]; then
        NOW_EPOCH=$(date +%s)
        LAST_LINT_EPOCH=$(date -j -f "%Y-%m-%d" "$LAST_LINT" +%s 2>/dev/null || date -d "$LAST_LINT" +%s 2>/dev/null || echo "$NOW_EPOCH")
        DAYS_SINCE=$(( (NOW_EPOCH - LAST_LINT_EPOCH) / 86400 ))
        if [ "$DAYS_SINCE" -gt 7 ]; then
            echo "  Last lint was $DAYS_SINCE days ago -- consider running /lint"
        fi
    else
        echo "  No lint on record -- consider running /lint"
    fi
fi

# Check for cold wiki pages
if [ -d "$CLAUDE_DIR/wiki" ]; then
    COLD=$(grep -rl "decay_status: cold" "$CLAUDE_DIR/wiki/" 2>/dev/null | wc -l | tr -d ' ')
    if [ "$COLD" -gt 0 ]; then
        echo "  $COLD cold wiki page(s) -- review during next /lint"
    fi
fi

# Count pending derived edges (the brain's auto-derived graph backlinks awaiting review).
# Reads the rendered artifact only (fast, offline). Counts "- " lines under ## Pending review,
# stopping at the <!-- END pending --> marker (the pinned marker boundary from Task 8) or the
# next ## heading, whichever comes first.
if [ -f "$CLAUDE_DIR/wiki/_derived-edges.md" ]; then
    PENDING=$(awk '
        /^## Pending review/ { inblock=1; next }
        /<!-- END pending -->/ { inblock=0 }
        /^## / { inblock=0 }
        inblock && /^- / { n++ }
        END { print n+0 }
    ' "$CLAUDE_DIR/wiki/_derived-edges.md")
    PENDING=${PENDING:-0}
    if [ "$PENDING" -gt 0 ]; then
        echo "  $PENDING derived edge(s) since last review -- run /review-derived"
    fi
fi

# Possible supersessions awaiting review. PR-4: the cycle writes an ACCURATE pending
# count (proposals minus resolved) to this file; the append-only proposals file alone
# would overcount forever. We just read the count.
SUP_COUNT_FILE="$CLAUDE_DIR/memory/facts/_supersession-pending-count"
if [ -f "$SUP_COUNT_FILE" ]; then
  SUP_PENDING=$(tr -dc '0-9' < "$SUP_COUNT_FILE")
  if [ -n "$SUP_PENDING" ] && [ "$SUP_PENDING" -gt 0 ]; then
    echo "  $SUP_PENDING possible supersession(s) -- run /review-derived"
  fi
fi

# Check error rules count
if [ -f "$CLAUDE_DIR/rules/error-rules.md" ]; then
    RULES=$(grep -cE "^[0-9]+\." "$CLAUDE_DIR/rules/error-rules.md" 2>/dev/null || true)
    RULES=${RULES:-0}
    echo "  $RULES error rule(s) active"
fi

# Context budget: estimate tokens loaded by CLAUDE.md @imports (bytes/4).
# Lean always-on context keeps sessions fast; this flags drift early.
# Target 25k, warn at 35k. Full audit lives in /lint Phase 0.5; trim with /prune.
if [ -f "$CLAUDE_DIR/CLAUDE.md" ]; then
    BUDGET_BYTES=0
    while IFS= read -r imp; do
        f="$CLAUDE_DIR/${imp#@}"
        [ -f "$f" ] && BUDGET_BYTES=$((BUDGET_BYTES + $(wc -c < "$f")))
    done < <(grep -oE '^@[^[:space:]]+' "$CLAUDE_DIR/CLAUDE.md")
    BUDGET_TOK=$((BUDGET_BYTES / 4))
    BUDGET_K=$((BUDGET_TOK / 1000))
    if [ "$BUDGET_TOK" -ge 35000 ]; then
        echo "  Context budget: ~${BUDGET_K}k tokens (ceiling 25k) -- WARN, run /lint then /prune"
    elif [ "$BUDGET_TOK" -ge 25000 ]; then
        echo "  Context budget: ~${BUDGET_K}k tokens (over 25k target) -- consider /prune"
    else
        echo "  Context budget: ~${BUDGET_K}k tokens (within 25k target)"
    fi
fi

# Surface pending follow-ups whose date is <= today.
# Format: YYYY-MM-DD|prompt-for-future-claude per line. Comments (#) and
# blank lines ignored. When Claude acts on a follow-up, it removes the line.
if [ -f "$CLAUDE_DIR/pending-followups.txt" ]; then
    TODAY_ISO=$(date +%Y-%m-%d)
    DUE=$(awk -F'|' -v today="$TODAY_ISO" '
        /^[[:space:]]*#/ { next }
        /^[[:space:]]*$/ { next }
        NF >= 2 && $1 <= today { print "  - " $0 }
    ' "$CLAUDE_DIR/pending-followups.txt")
    if [ -n "$DUE" ]; then
        echo ""
        echo "  Pending follow-ups due:"
        echo "$DUE"
    fi
fi

echo "--------------------------------------"
echo ""
