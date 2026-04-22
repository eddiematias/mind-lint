#!/usr/bin/env bash
# Migrate from pre-dotfile install: convert regular-file framework files to symlinks,
# stash pristine templates, preserve user data, back up everything first.
#
# shellcheck disable=SC2153  # SOURCE_ROOT/CLAUDE_DIR are set by setup.sh

[ -n "${MIGRATE_SH_LOADED+x}" ] && return 0
readonly MIGRATE_SH_LOADED=1

# shellcheck source-path=SCRIPTDIR source=logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/logging.sh"
# shellcheck source-path=SCRIPTDIR source=fs.sh
source "$(dirname "${BASH_SOURCE[0]}")/fs.sh"
# shellcheck source-path=SCRIPTDIR source=prompts.sh
source "$(dirname "${BASH_SOURCE[0]}")/prompts.sh"
# shellcheck source-path=SCRIPTDIR source=settings.sh
source "$(dirname "${BASH_SOURCE[0]}")/settings.sh"
# shellcheck source-path=SCRIPTDIR source=manifest.sh
source "$(dirname "${BASH_SOURCE[0]}")/manifest.sh"
# shellcheck source-path=SCRIPTDIR source=install.sh
source "$(dirname "${BASH_SOURCE[0]}")/install.sh"

migrate_run() {
    log_step "Migrating to dotfile install"

    _migrate_announce
    _migrate_backup
    _migrate_cat1_per_file
    _migrate_cat1_dirs
    _migrate_stash_templates
    _install_settings       # reusable from install.sh, idempotent
    _install_version_marker # reusable from install.sh, idempotent
    _migrate_report
}

_migrate_announce() {
    echo "This will migrate your ~/.claude/ to the dotfile install layout:" >&2
    echo "  - Convert identical framework files to symlinks" >&2
    echo "  - For files you customized, prompt per-file" >&2
    echo "  - Stash pristine templates for future --sync" >&2
    echo "  - Back up your current ~/.claude/ first" >&2
    echo "" >&2
    if [ "${NON_INTERACTIVE:-}" != "1" ]; then
        if ! prompt_yn "Proceed?" n; then
            log_warn "cancelled"
            exit 0
        fi
    fi
}

_migrate_backup() {
    local stamp
    stamp="$(date +%Y%m%d-%H%M%S)"
    local backup="$HOME/.claude-backup-$stamp"
    # If backup already exists (same second), append a counter
    local i=0
    while [ -e "$backup" ]; do
        i=$((i + 1))
        backup="$HOME/.claude-backup-${stamp}-${i}"
    done
    cp -R "$CLAUDE_DIR" "$backup"
    log_done "backed up to $backup"
    export MIGRATE_BACKUP_PATH="$backup"
}

_migrate_cat1_per_file() {
    log_info "Converting framework files to symlinks"
    mkdir -p "$CLAUDE_DIR/.mindlint"
    for_each_manifest_entry "1" "per-file" _migrate_glob
}

_migrate_glob() {
    local glob="$1"
    # shellcheck disable=SC2086  # intentional glob expansion
    for f in "$SOURCE_ROOT"/$glob; do
        [ -e "$f" ] || continue
        _migrate_one_file "$f"
    done
}

_migrate_one_file() {
    local source_file="$1"
    local rel_path="${source_file#"$SOURCE_ROOT/"}"
    local dest="$CLAUDE_DIR/$rel_path"

    # Already correct symlink
    if is_symlink_to "$dest" "$source_file"; then
        return 0
    fi

    # Missing: just link
    if [ ! -e "$dest" ] && [ ! -L "$dest" ]; then
        mkdir -p "$(dirname "$dest")"
        ln -s "$source_file" "$dest"
        return 0
    fi

    # Regular file: compare
    if [ -f "$dest" ] && [ ! -L "$dest" ]; then
        if [ "$(hash_file "$dest")" = "$(hash_file "$source_file")" ]; then
            rm "$dest"
            ln -s "$source_file" "$dest"
            log_done "linked $rel_path (was identical copy)"
            return 0
        fi

        # Differs
        if [ "${NON_INTERACTIVE:-}" = "1" ]; then
            log_warn "$rel_path differs from source, kept as-is (non-interactive)"
            return 0
        fi
        _migrate_resolve_diff "$source_file" "$dest" "$rel_path"
        return 0
    fi

    # Symlink to something else: leave alone, warn
    log_warn "$rel_path is a symlink to something else, skipping"
}

_migrate_resolve_diff() {
    local source_file="$1"
    local dest="$2"
    local rel_path="$3"
    log_warn "$rel_path differs from the Mind-Lint version"
    local choice
    choice="$(prompt_menu "  [d]iff / [k]eep yours / [r]eplace with symlink / [s]ave yours as .custom and symlink" "d k r s")"
    case "$choice" in
        d)
            diff "$dest" "$source_file" >&2 || true
            _migrate_resolve_diff "$source_file" "$dest" "$rel_path"
            ;;
        k)
            log_warn "kept your $rel_path (unlinked from source)"
            ;;
        r)
            rm "$dest"
            ln -s "$source_file" "$dest"
            log_done "replaced $rel_path with symlink"
            ;;
        s)
            local custom
            if [[ "$dest" == *.md ]]; then
                custom="${dest%.md}.custom.md"
            else
                custom="${dest}.custom"
            fi
            if [ -e "$custom" ]; then
                if [[ "$custom" == *.md ]]; then
                    custom="${custom%.md}.$(date +%s).md"
                else
                    custom="${custom}.$(date +%s)"
                fi
            fi
            mv "$dest" "$custom"
            ln -s "$source_file" "$dest"
            log_done "saved yours as $custom, symlinked ours"
            ;;
    esac
}

_migrate_cat1_dirs() {
    # templates/ and docs/ may or may not exist in a pre-dotfile install.
    # Just create the directory symlinks where missing.
    local dir
    for dir in templates docs; do
        local dest="$CLAUDE_DIR/$dir"
        if is_symlink_to "$dest" "$SOURCE_ROOT/$dir"; then
            continue
        fi
        if [ ! -e "$dest" ] && [ ! -L "$dest" ]; then
            ln -s "$SOURCE_ROOT/$dir" "$dest"
            continue
        fi
        if [ "${NON_INTERACTIVE:-}" = "1" ]; then
            log_warn "$dir/ exists non-symlink, skipping"
            continue
        fi
        # Reuse install.sh's dir-collision resolver
        _resolve_cat1_dir_collision "$dir"
    done
}

_migrate_stash_templates() {
    log_info "Stashing pristine template copies for future --sync"
    for_each_manifest_entry "2" "" _migrate_stash_one
}

_migrate_stash_one() {
    local glob="$1"
    local _cat="$2"
    local _sub="$3"
    local tgt="$4"
    local stash="$CLAUDE_DIR/.mindlint/templates-installed/$tgt"
    mkdir -p "$(dirname "$stash")"
    cp "$SOURCE_ROOT/$glob" "$stash"
}

_migrate_report() {
    echo "" >&2
    echo "Migration complete." >&2
    echo "  Backup: $MIGRATE_BACKUP_PATH" >&2
    echo "  Run 'bash setup.sh --sync' to update user-side templates when upstream changes." >&2
}
