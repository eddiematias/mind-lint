#!/bin/bash
# Mind-Lint v2: iMessage Exporter Wrapper
# Wraps imessage-exporter (https://github.com/reagentx/imessage-exporter) for
# per-contact extraction into raw/imessage/<sanitized-handle>/.
#
# Usage:
#   bash scripts/imessage-export.sh <handle> [--since <YYYY-MM-DD or Nd>]
#
# Examples:
#   bash scripts/imessage-export.sh +15551234567
#   bash scripts/imessage-export.sh someone@example.com --since 2026-01-01
#   bash scripts/imessage-export.sh +15551234567 --since 90d
#
# Output: raw/imessage/<sanitized-handle>/ — gitignored, never committed.
#
# Requirements:
#   - imessage-exporter installed: `brew install imessage-exporter`
#                              or: `cargo install imessage-exporter`
#   - macOS Full Disk Access granted to the terminal running this script
#     (System Settings → Privacy & Security → Full Disk Access)

set -euo pipefail

CLAUDE_DIR="$HOME/.claude"
OUTPUT_BASE="$CLAUDE_DIR/raw/imessage"

# Adjust this if your imessage-exporter version uses a different flag for
# contact/conversation filtering. Recent versions accept `-t <handle>` (short)
# or `--conversation-filter <handle>` (long). If your run errors with an
# unknown-flag error, swap this value.
FILTER_FLAG="-t"

usage() {
    cat >&2 <<'EOF'
Usage: bash scripts/imessage-export.sh <handle> [--since <YYYY-MM-DD or Nd>]

Examples:
  bash scripts/imessage-export.sh +15551234567
  bash scripts/imessage-export.sh someone@example.com --since 2026-01-01
  bash scripts/imessage-export.sh +15551234567 --since 90d

Output lands in raw/imessage/<sanitized-handle>/. Default --since is 90 days.
EOF
    exit 1
}

if [ $# -lt 1 ]; then
    usage
fi

HANDLE="$1"
shift

SINCE=""
while [ $# -gt 0 ]; do
    case "$1" in
        --since)
            shift
            [ $# -gt 0 ] || usage
            SINCE="$1"
            shift
            ;;
        -h|--help)
            usage
            ;;
        *)
            echo "Unknown flag: $1" >&2
            usage
            ;;
    esac
done

# Default --since to 90 days ago if not provided.
if [ -z "$SINCE" ]; then
    SINCE="90d"
fi

# Resolve "Nd" relative dates to absolute YYYY-MM-DD.
if [[ "$SINCE" =~ ^([0-9]+)d$ ]]; then
    DAYS="${BASH_REMATCH[1]}"
    SINCE_DATE=$(date -v-"${DAYS}"d +%Y-%m-%d 2>/dev/null || date -d "$DAYS days ago" +%Y-%m-%d)
else
    SINCE_DATE="$SINCE"
fi

# Sanitize the handle for filesystem safety. Keep digits, letters, +, @, ., -.
# Replace anything else with _.
SANITIZED=$(printf '%s' "$HANDLE" | sed 's/[^A-Za-z0-9+@.\-]/_/g')

OUTPUT_DIR="$OUTPUT_BASE/$SANITIZED"
mkdir -p "$OUTPUT_DIR"

# Verify the binary up front so the error is friendly.
if ! command -v imessage-exporter >/dev/null 2>&1; then
    cat >&2 <<'EOF'
[imessage-export] ERROR: imessage-exporter not found on PATH.

Install with one of:
  brew install imessage-exporter
  cargo install imessage-exporter

Then grant macOS Full Disk Access to your terminal:
  System Settings → Privacy & Security → Full Disk Access → add Terminal/iTerm/WebStorm

EOF
    exit 1
fi

echo "[imessage-export] handle=$HANDLE sanitized=$SANITIZED since=$SINCE_DATE"
echo "[imessage-export] output=$OUTPUT_DIR"

# -f selects format (txt is easiest to parse downstream)
# -o sets export path
# -s sets start date (YYYY-MM-DD)
# $FILTER_FLAG filters by contact/conversation
imessage-exporter \
    "$FILTER_FLAG" "$HANDLE" \
    -f txt \
    -o "$OUTPUT_DIR" \
    -s "$SINCE_DATE"

echo "[imessage-export] done. Inspect output at: $OUTPUT_DIR"
