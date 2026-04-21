#!/bin/bash
# Mind-Lint v2: Privacy Filter
# Scans a file for sensitive data patterns
# Usage: privacy-filter.sh <filepath>
# Returns: 0 if clean, 1 if sensitive data found

FILE="$1"
if [ ! -f "$FILE" ]; then
    echo "File not found: $FILE"
    exit 1
fi

FOUND=0

if grep -qEi '(api[_-]?key|apikey)\s*[:=]\s*["'"'"']?[a-zA-Z0-9_\-]{20,}' "$FILE"; then
    echo "⚠️  Possible API key detected"; FOUND=1
fi
if grep -qEi 'bearer\s+[a-zA-Z0-9_\-\.]{20,}' "$FILE"; then
    echo "⚠️  Possible Bearer token detected"; FOUND=1
fi
if grep -qE 'AKIA[0-9A-Z]{16}' "$FILE"; then
    echo "⚠️  Possible AWS access key detected"; FOUND=1
fi
if grep -q 'BEGIN.*PRIVATE KEY' "$FILE"; then
    echo "⚠️  Possible private key detected"; FOUND=1
fi
if grep -qEi '(password|passwd|secret)\s*[:=]\s*["'"'"']?[^\s"'"'"']{8,}' "$FILE"; then
    echo "⚠️  Possible password/secret detected"; FOUND=1
fi
if grep -qE 'eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}' "$FILE"; then
    echo "⚠️  Possible JWT token detected"; FOUND=1
fi
if grep -qEi '(mongodb|postgres|mysql|redis)://[^\s]{10,}' "$FILE"; then
    echo "⚠️  Possible connection string detected"; FOUND=1
fi

exit $FOUND
