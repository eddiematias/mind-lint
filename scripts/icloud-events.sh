#!/bin/bash
# Mind-Lint v2: iCloud / Calendar.app events for today
# On-demand lookup via icalBuddy. Called by /today (no longer cron-driven).
#
# Returns today's events as markdown bullets, one per line:
#   - **8:30 AM** — Team Standup _(Work)_
#   - **All day** — Conference _(Personal)_
#   - **All day** — Kory Gellinger's Birthday (age 39) _(Birthdays)_
#
# Returns empty output if no events. Exits non-zero on icalBuddy failure
# (caller should treat as "calendar unavailable" and continue).
#
# Source: icalBuddy reads the macOS Calendar database directly. It surfaces
# the Birthdays virtual feed (which AppleScript's `every event` cannot query)
# and reports calendars Calendar.app federates from iCloud + any other
# accounts. Google work calendar comes from the MCP connector path in /today,
# so this script intentionally excludes Google calendars by name to avoid
# double-counting if you've also added Google to Calendar.app.
#
# Replaces the AppleScript version which
# silently dropped birthdays and had a fragile account-type filter.

set -uo pipefail

# Calendars to exclude. Add Google calendar names here if you connect a
# Google account to Calendar.app — otherwise events would double-count with
# the MCP connector path. Currently no Google calendars present.
EXCLUDED_CALS=()

# Build -ec args for icalBuddy. The `+` expansion guards against bash 3.2's
# treatment of empty-array expansion under `set -u`.
EXCLUDE_ARGS=()
for cal in "${EXCLUDED_CALS[@]+"${EXCLUDED_CALS[@]}"}"; do
    EXCLUDE_ARGS+=("-ec" "$cal")
done

# Run icalBuddy with stable formatting:
#   -nrd     no relative dates ("today" / "tomorrow")
#   -b ""    no bullet (we add our own)
#   -ab ""   no alt bullet
# Note: do NOT pass -nc — it suppresses the inline "(Calendar)" suffix that
# this parser depends on, not just the section headers.
# Output shape per event:
#   <title> (<calendar>)
#       <start> - <end>
# The datetime line is indented and may be missing entirely (birthdays).
# Either side of "<start> - <end>" may be "..." meaning all-day on that side.
# Titles can themselves contain "(...)" (e.g. "Kory's Birthday (age 39)"),
# so the calendar is parsed as the LAST parenthesized group on the title line.
RAW=$(icalBuddy "${EXCLUDE_ARGS[@]+"${EXCLUDE_ARGS[@]}"}" -nrd -b "" -ab "" eventsToday 2>/dev/null) || exit 1

# Parse with awk:
#   - Top-level lines (no leading whitespace) start a new event: "Title (Calendar)"
#   - Indented lines belong to the previous event's datetime: "    start - end"
#   - Calendar is the LAST parenthesized group on the title line, since titles
#     can contain parens (e.g. "Kory Gellinger's Birthday (age 39)").
echo "$RAW" | awk '
function emit(t, c, s, e,    label) {
    if (t == "") return
    if (s == "" && e == "")        label = "All day"
    else if (s == "..." && e == "...") label = "All day"
    else if (s == "...")               label = "Until " e
    else if (e == "...")               label = "From " s
    else                               label = s
    printf("- **%s** — %s _(%s)_\n", label, t, c)
}

# Trim leading/trailing whitespace.
function trim(s) { sub(/^[[:space:]]+/, "", s); sub(/[[:space:]]+$/, "", s); return s }

# Find the LAST occurrence of " (" in s, return the index (1-based) or 0.
function last_paren_open(s,    i, last) {
    last = 0
    for (i = 1; i <= length(s) - 1; i++) {
        if (substr(s, i, 2) == " (") last = i
    }
    return last
}

BEGIN { title = ""; cal = ""; start = ""; end = "" }

/^[[:space:]]/ {
    # Datetime line for the current event. Format: "    start - end".
    line = trim($0)
    n = index(line, " - ")
    if (n > 0) {
        start = substr(line, 1, n - 1)
        end   = substr(line, n + 3)
    }
    next
}

/./ {
    # New event line. Emit any in-flight previous event first.
    emit(title, cal, start, end)
    title = ""; cal = ""; start = ""; end = ""

    line = trim($0)
    p = last_paren_open(line)
    if (p > 0 && substr(line, length(line), 1) == ")") {
        title = substr(line, 1, p - 1)
        cal   = substr(line, p + 2, length(line) - p - 2)
    } else {
        # No "(Calendar)" suffix — emit title with empty calendar.
        title = line
        cal   = "Calendar"
    }
}

END { emit(title, cal, start, end) }
'
