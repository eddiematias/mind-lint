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
        --non-interactive)   NON_INTERACTIVE="1" ;;
        --skip-wizard)       SKIP_WIZARD="1" ;;
        -h|--help)           MODE="help" ;;
        *) echo "Unknown flag: $1" >&2; exit 1 ;;
    esac
    shift
done

export SOURCE_ROOT CLAUDE_DIR NON_INTERACTIVE SKIP_WIZARD

# Auto-route pre-dotfile installs to migrate mode. Skipped for now since
# lib/migrate.sh is written in Task 11.
# TODO (Task 11): uncomment after migrate.sh exists
# if [ "$MODE" = "install" ]; then
#     source "$SOURCE_ROOT/lib/detect.sh"
#     state="$(detect_state "$CLAUDE_DIR")"
#     if [ "$state" = "pre-dotfile" ]; then
#         MODE="migrate"
#     fi
# fi

case "$MODE" in
    install)
        # shellcheck source=lib/install.sh
        source "$SOURCE_ROOT/lib/install.sh"
        install_run
        ;;
    sync|migrate|uninstall)
        echo "Mode '$MODE' not implemented yet (will be added in later tasks)" >&2
        exit 1
        ;;
    help)
        cat <<EOF
Mind-Lint installer.

Usage:
  bash setup.sh                Install or re-sync (idempotent)
  bash setup.sh --sync         Update user-side templates (three-way merge) [coming soon]
  bash setup.sh --migrate      Migrate from pre-dotfile install [coming soon]
  bash setup.sh --uninstall    Remove framework, keep user data [coming soon]

Flags:
  --non-interactive   Skip interactive collision prompts (tests)
  --skip-wizard       Skip the user-info wizard (tests)
  -h, --help          Show this help
EOF
        ;;
esac
