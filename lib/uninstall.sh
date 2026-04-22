#!/usr/bin/env bash
# Uninstall: remove Mind-Lint symlinks, settings entries, and .mindlint/.
# Preserve all user data (memory, wiki, raw, content, preferences, error-rules, CLAUDE.md, etc.).
#
# shellcheck disable=SC2153  # SOURCE_ROOT/CLAUDE_DIR are set by setup.sh

[ -n "${UNINSTALL_SH_LOADED+x}" ] && return 0
readonly UNINSTALL_SH_LOADED=1

# shellcheck source-path=SCRIPTDIR source=logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/logging.sh"
# shellcheck source-path=SCRIPTDIR source=fs.sh
source "$(dirname "${BASH_SOURCE[0]}")/fs.sh"
# shellcheck source-path=SCRIPTDIR source=prompts.sh
source "$(dirname "${BASH_SOURCE[0]}")/prompts.sh"
# shellcheck source-path=SCRIPTDIR source=settings.sh
source "$(dirname "${BASH_SOURCE[0]}")/settings.sh"

uninstall_run() {
    log_step "Uninstalling Mind-Lint"

    if [ "${NON_INTERACTIVE:-}" != "1" ]; then
        echo "This will remove:" >&2
        echo "  - All Mind-Lint symlinks in $CLAUDE_DIR" >&2
        echo "  - $CLAUDE_DIR/.mindlint/" >&2
        echo "  - Mind-Lint hooks and permissions from settings.json" >&2
        echo "" >&2
        echo "Your user data (memory, wiki, raw, content, preferences, error-rules," >&2
        echo "CLAUDE.md, workflows.md, boundaries.md, client skills) will be preserved." >&2
        echo "" >&2
        if ! prompt_yn "Proceed?" n; then
            log_warn "cancelled"
            exit 0
        fi
    fi

    _uninstall_symlinks
    _uninstall_mindlint_dir
    _uninstall_settings

    log_done "Mind-Lint removed"
    echo "" >&2
    echo "Your user data is preserved at $CLAUDE_DIR/." >&2
    echo "Delete $SOURCE_ROOT to complete removal." >&2
}

_uninstall_symlinks() {
    log_info "Removing framework symlinks"
    # Find all symlinks under CLAUDE_DIR and remove those pointing into SOURCE_ROOT.
    local link
    while IFS= read -r link; do
        if [ -L "$link" ] && is_our_symlink "$link" "$SOURCE_ROOT"; then
            rm "$link"
            log_dim "  removed $link"
        fi
    done < <(find "$CLAUDE_DIR" -type l 2>/dev/null)
}

_uninstall_mindlint_dir() {
    if [ -d "$CLAUDE_DIR/.mindlint" ]; then
        rm -rf "$CLAUDE_DIR/.mindlint"
        log_done "removed .mindlint/"
    fi
}

_uninstall_settings() {
    local settings="$CLAUDE_DIR/settings.json"
    [ -f "$settings" ] || return 0

    # Remove both variants of hook paths (default ~/.claude/ and custom $CLAUDE_DIR/)
    remove_hook "$settings" "SessionStart" "bash ~/.claude/scripts/session-start.sh"
    remove_hook "$settings" "SessionStart" "bash $CLAUDE_DIR/scripts/session-start.sh"
    remove_hook "$settings" "SessionEnd" "bash ~/.claude/scripts/auto-commit.sh"
    remove_hook "$settings" "SessionEnd" "bash $CLAUDE_DIR/scripts/auto-commit.sh"

    local rule
    while IFS= read -r rule; do
        remove_permission "$settings" "$rule"
    done < <(mindlint_permission_set)
    log_done "cleaned settings.json"
}
