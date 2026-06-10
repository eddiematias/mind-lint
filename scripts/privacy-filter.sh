#!/bin/bash
# Mind-Lint v2: Privacy Filter
# Scans a file for sensitive data patterns
# Usage: privacy-filter.sh <filepath>
# Returns: 0 if clean, 1 if sensitive data found (prints findings to stdout)

FILE="$1"

if [ ! -f "$FILE" ]; then
    echo "File not found: $FILE"
    exit 1
fi

FOUND=0

# API keys (common patterns)
if grep -qEi '(api[_-]?key|apikey)\s*[:=]\s*["'"'"']?[a-zA-Z0-9_\-]{20,}' "$FILE"; then
    echo "WARNING: Possible API key detected"
    FOUND=1
fi

# Bearer tokens
if grep -qEi 'bearer\s+[a-zA-Z0-9_\-\.]{20,}' "$FILE"; then
    echo "WARNING: Possible Bearer token detected"
    FOUND=1
fi

# AWS keys
if grep -qE 'AKIA[0-9A-Z]{16}' "$FILE"; then
    echo "WARNING: Possible AWS access key detected"
    FOUND=1
fi

# Private keys
if grep -q 'BEGIN.*PRIVATE KEY' "$FILE"; then
    echo "WARNING: Possible private key detected"
    FOUND=1
fi

# Passwords in common formats
if grep -qEi '(password|passwd|secret)\s*[:=]\s*["'"'"']?[^\s"'"'"']{8,}' "$FILE"; then
    echo "WARNING: Possible password/secret detected"
    FOUND=1
fi

# JWT tokens
if grep -qE 'eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}' "$FILE"; then
    echo "WARNING: Possible JWT token detected"
    FOUND=1
fi

# Connection strings
if grep -qEi '(mongodb|postgres|mysql|redis)://[^\s]{10,}' "$FILE"; then
    echo "WARNING: Possible connection string detected"
    FOUND=1
fi

if [ "$FOUND" -eq 0 ]; then
    exit 0
else
    echo ""
    echo "Run with --redact to auto-replace sensitive data with [REDACTED]"
    exit 1
fi
