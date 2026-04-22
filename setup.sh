#!/usr/bin/env bash
# Mind-Lint installer. See docs/specs/ (internal) for design.

set -euo pipefail

SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_DIR="${MINDLINT_CLAUDE_DIR:-$HOME/.claude}"
MODE="install"
NON_INTERACTIVE=""
SKIP_WIZARD=""

while [ $# -gt 0 ]; do
    case "$1" in
        --sync)              MODE="sync" ;;
        --migrate)           MODE="migrate" ;;
        --uninstall)         MODE="uninstall" ;;
        --relink)            MODE="relink" ;;
        --non-interactive)   NON_INTERACTIVE="1" ;;
        --skip-wizard)       SKIP_WIZARD="1" ;;
        -h|--help)           MODE="help" ;;
        *) echo "Unknown flag: $1" >&2; exit 1 ;;
    esac
    shift
done

export SOURCE_ROOT CLAUDE_DIR NON_INTERACTIVE SKIP_WIZARD

# Auto-route pre-dotfile installs to migrate mode.
if [ "$MODE" = "install" ]; then
    # shellcheck source=lib/detect.sh
    source "$SOURCE_ROOT/lib/detect.sh"
    state="$(detect_state "$CLAUDE_DIR")"
    if [ "$state" = "pre-dotfile" ]; then
        MODE="migrate"
    fi
fi

case "$MODE" in
    install)
        # shellcheck source=lib/install.sh
        source "$SOURCE_ROOT/lib/install.sh"
        install_run
        ;;
    sync)
        # shellcheck source=lib/sync.sh
        source "$SOURCE_ROOT/lib/sync.sh"
        sync_run
        ;;
    migrate)
        # shellcheck source=lib/migrate.sh
        source "$SOURCE_ROOT/lib/migrate.sh"
        migrate_run
        ;;
    uninstall)
        # shellcheck source=lib/uninstall.sh
        source "$SOURCE_ROOT/lib/uninstall.sh"
        uninstall_run
        ;;
    relink)
        # shellcheck source=lib/install.sh
        source "$SOURCE_ROOT/lib/install.sh"
        # Remove every dangling symlink under $CLAUDE_DIR, then re-run install to recreate.
        # We intentionally do this BEFORE install_run's lockfile acquisition because
        # a stale broken symlink in the .mindlint dir could confuse things.
        if [ -d "$CLAUDE_DIR" ]; then
            find "$CLAUDE_DIR" -type l 2>/dev/null | while IFS= read -r link; do
                if [ ! -e "$link" ]; then
                    rm "$link"
                fi
            done
        fi
        install_run
        ;;
    help)
        cat <<EOF
Mind-Lint installer.

Usage:
  bash setup.sh                Install or re-sync (idempotent)
  bash setup.sh --sync         Update user-side templates (three-way merge) [coming soon]
  bash setup.sh --migrate      Migrate from pre-dotfile install [coming soon]
  bash setup.sh --uninstall    Remove framework, keep user data
  bash setup.sh --relink       Repair broken symlinks after moving the source repo

Flags:
  --non-interactive   Skip interactive collision prompts (tests)
  --skip-wizard       Skip the user-info wizard (tests)
  -h, --help          Show this help
EOF
        ;;
esac
