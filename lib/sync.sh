#!/usr/bin/env bash
# Sync mode: three-way merge for category 2 templates.
# Reads source_version (upstream), installed_version (pristine stash), current_version (user's copy).
#
# shellcheck disable=SC2153  # SOURCE_ROOT/CLAUDE_DIR are set by setup.sh

[ -n "${SYNC_SH_LOADED+x}" ] && return 0
readonly SYNC_SH_LOADED=1

# shellcheck source-path=SCRIPTDIR source=logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/logging.sh"
# shellcheck source-path=SCRIPTDIR source=fs.sh
source "$(dirname "${BASH_SOURCE[0]}")/fs.sh"
# shellcheck source-path=SCRIPTDIR source=prompts.sh
source "$(dirname "${BASH_SOURCE[0]}")/prompts.sh"
# shellcheck source-path=SCRIPTDIR source=manifest.sh
source "$(dirname "${BASH_SOURCE[0]}")/manifest.sh"

sync_run() {
    log_step "Syncing user-side templates"
    for_each_manifest_entry "2" "" _sync_one
    log_done "Sync complete"
}

_sync_one() {
    local glob="$1"
    local _cat="$2"
    local _sub="$3"
    local tgt="$4"

    local source="$SOURCE_ROOT/$glob"
    local current="$CLAUDE_DIR/$tgt"
    local pristine="$CLAUDE_DIR/.mindlint/templates-installed/$tgt"

    # User never installed this file (or deleted it). Skip.
    if [ ! -f "$current" ]; then
        log_warn "$tgt missing in user's ~/.claude/, skipping (run install first)"
        return 0
    fi

    local source_hash current_hash pristine_hash
    source_hash="$(hash_file "$source")"
    current_hash="$(hash_file "$current")"
    pristine_hash=""
    [ -f "$pristine" ] && pristine_hash="$(hash_file "$pristine")"

    # Case 1: user is up to date with upstream
    if [ "$source_hash" = "$current_hash" ]; then
        return 0
    fi

    # Case 2: source hasn't changed since last sync (user is ahead of pristine)
    if [ -n "$pristine_hash" ] && [ "$source_hash" = "$pristine_hash" ]; then
        return 0
    fi

    # Case 3: user hasn't modified (current == pristine); safe auto-update
    if [ -n "$pristine_hash" ] && [ "$current_hash" = "$pristine_hash" ]; then
        cp "$source" "$current"
        cp "$source" "$pristine"
        log_done "auto-updated $tgt (no local edits)"
        return 0
    fi

    # Case 4: all three differ, OR pristine is missing and user differs from upstream.
    # Either way, interactive three-way conflict.
    _sync_resolve_conflict "$source" "$current" "$pristine" "$tgt"
}

_sync_resolve_conflict() {
    local source="$1"
    local current="$2"
    local pristine="$3"
    local tgt="$4"

    if [ "${NON_INTERACTIVE:-}" = "1" ]; then
        log_warn "$tgt has conflicting changes, skipping (non-interactive)"
        return 0
    fi

    echo "" >&2
    log_warn "$tgt has upstream changes AND your local edits"
    local choice
    choice="$(prompt_menu "  [d]iff / [k]eep yours / [t]ake upstream / [m]anual merge / [s]kip" "d k t m s")"
    case "$choice" in
        d)
            diff "$current" "$source" >&2 || true
            _sync_resolve_conflict "$source" "$current" "$pristine" "$tgt"
            ;;
        k)
            log_warn "kept yours (upstream $tgt not applied)"
            # Update pristine so next sync won't re-prompt unless upstream changes again
            mkdir -p "$(dirname "$pristine")"
            cp "$source" "$pristine"
            ;;
        t)
            cp "$source" "$current"
            mkdir -p "$(dirname "$pristine")"
            cp "$source" "$pristine"
            log_done "took upstream $tgt"
            ;;
        m)
            _sync_manual_merge "$source" "$current" "$pristine" "$tgt"
            ;;
        s)
            log_warn "skipped $tgt for now"
            ;;
    esac
}

_sync_manual_merge() {
    local source="$1"
    local current="$2"
    local pristine="$3"
    local tgt="$4"
    local merge_file
    merge_file="$(mktemp "${TMPDIR:-/tmp}/mindlint-merge.XXXXXX")"
    {
        echo "<<<<<<< YOUR VERSION ($current)"
        cat "$current"
        echo "======="
        cat "$source"
        echo ">>>>>>> UPSTREAM"
    } > "$merge_file"
    "${EDITOR:-vi}" "$merge_file"
    cp "$merge_file" "$current"
    mkdir -p "$(dirname "$pristine")"
    cp "$source" "$pristine"
    rm -f "$merge_file"
    log_done "manual merge applied to $tgt"
}
