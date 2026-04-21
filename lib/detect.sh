#!/usr/bin/env bash
# Detect the state of ~/.claude/ to decide install path.
# Source this file, then call detect_state <path-to-claude-dir>.

[ -n "${DETECT_SH_LOADED+x}" ] && return 0
readonly DETECT_SH_LOADED=1

# detect_state <claude-dir>
# Prints one of: empty | installed | pre-dotfile | non-mindlint
detect_state() {
    local claude_dir="$1"

    # Empty or missing
    if [ ! -d "$claude_dir" ] || [ -z "$(ls -A "$claude_dir" 2>/dev/null)" ]; then
        echo "empty"
        return 0
    fi

    # Already installed via dotfile system
    if [ -f "$claude_dir/.mindlint/installed-version" ]; then
        echo "installed"
        return 0
    fi

    # Pre-dotfile Mind-Lint: count markers
    local marker_count=0
    [ -f "$claude_dir/memory/learnings/index.md" ] && marker_count=$((marker_count + 1))
    [ -f "$claude_dir/rules/workflows.md" ] && marker_count=$((marker_count + 1))
    if [ -f "$claude_dir/CLAUDE.md" ] && grep -q "@rules/workflows.md" "$claude_dir/CLAUDE.md" 2>/dev/null; then
        marker_count=$((marker_count + 1))
    fi
    if [ "$marker_count" -ge 2 ]; then
        echo "pre-dotfile"
        return 0
    fi

    echo "non-mindlint"
}
