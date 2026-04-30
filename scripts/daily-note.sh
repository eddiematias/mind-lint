#!/bin/bash
# Mind-Lint v2: Daily Note Creator
# Creates today's daily note from templates/daily-note.md if it doesn't exist.
# Triggered by:
#   - launchd at 10:30 AM (com.eddie.mindlint-daily.plist)
#   - SessionStart hook (scripts/session-start.sh) as backup
#   - Manual invocation: bash scripts/daily-note.sh
#
# Idempotent: if today's note exists, exits without action.
#
# After creating the note, populates the ## Calendar section with today's events
# from Calendar.app via AppleScript. Calendar.app federates iCloud + any added
# Google calendars, so a single AppleScript call returns events from all
# connected calendars.

set -euo pipefail

CLAUDE_DIR="$HOME/.claude"
TEMPLATE="$CLAUDE_DIR/templates/daily-note.md"
JOURNAL_DIR="$CLAUDE_DIR/journal"

# Date components for the note.
TODAY=$(date +%Y-%m-%d)
YEAR_MONTH=$(date +%Y-%m)
YESTERDAY=$(date -v-1d +%Y-%m-%d 2>/dev/null || date -d "yesterday" +%Y-%m-%d)
TOMORROW=$(date -v+1d +%Y-%m-%d 2>/dev/null || date -d "tomorrow" +%Y-%m-%d)
DATE_LONG=$(date +"%A, %B %-d, %Y")

NOTE_DIR="$JOURNAL_DIR/$YEAR_MONTH"
NOTE_PATH="$NOTE_DIR/$TODAY.md"

# Idempotence: exit early if today's note already exists.
if [ -f "$NOTE_PATH" ]; then
    echo "[daily-note] Today's note already exists at $NOTE_PATH"
    exit 0
fi

# Verify template exists.
if [ ! -f "$TEMPLATE" ]; then
    echo "[daily-note] ERROR: template not found at $TEMPLATE" >&2
    exit 1
fi

# Create the year-month directory if needed.
mkdir -p "$NOTE_DIR"

# Render the template by substituting Templater-style date patterns.
# This way the same template works for both this script and Obsidian's Templater plugin.
sed \
    -e "s|<% tp.date.now(\"YYYY-MM-DD\") %>|$TODAY|g" \
    -e "s|<% tp.date.now(\"YYYY-MM-DD\", -1) %>|$YESTERDAY|g" \
    -e "s|<% tp.date.now(\"YYYY-MM-DD\", 1) %>|$TOMORROW|g" \
    -e "s|<% tp.date.now(\"dddd, MMMM D, YYYY\") %>|$DATE_LONG|g" \
    "$TEMPLATE" > "$NOTE_PATH"

echo "[daily-note] Created $NOTE_PATH"

# ─── Calendar population ──────────────────────────────────────────────────────
# Fetch today's events from Calendar.app via AppleScript.
# Calendar.app federates all configured calendars (iCloud personal, Google work,
# Exchange, etc.), so this single call returns events from every connected source.
#
# First-run note: macOS prompts for AppleScript automation permission the first
# time osascript talks to Calendar.app. If the prompt is dismissed or denied,
# this function returns gracefully with a hint to grant access in
# System Settings → Privacy & Security → Automation.

EVENTS=$(osascript <<'APPLESCRIPT' 2>/dev/null || echo ""
on run
    set today_start to current date
    set hours of today_start to 0
    set minutes of today_start to 0
    set seconds of today_start to 0
    set today_end to today_start + (24 * hours)

    set output to ""

    tell application "Calendar"
        set cals to every calendar
        repeat with cal in cals
            try
                set events_today to (every event of cal whose start date is greater than or equal to today_start and start date is less than today_end)
                repeat with evt in events_today
                    set evt_summary to summary of evt
                    set evt_start to start date of evt
                    set evt_allday to allday event of evt
                    set cal_name to title of cal
                    if evt_allday then
                        set time_str to "All day"
                    else
                        set hh to hours of evt_start
                        set mm to minutes of evt_start
                        if hh < 12 then
                            set ampm to "AM"
                            if hh is 0 then set hh to 12
                        else
                            set ampm to "PM"
                            if hh > 12 then set hh to hh - 12
                        end if
                        set mm_str to mm as string
                        if (count of mm_str) is 1 then set mm_str to "0" & mm_str
                        set time_str to (hh as string) & ":" & mm_str & " " & ampm
                    end if
                    set output to output & "- **" & time_str & "** — " & evt_summary & " _(" & cal_name & ")_" & linefeed
                end repeat
            on error
                -- skip calendars that error (e.g., ones still loading)
            end try
        end repeat
    end tell

    if output is "" then
        return "_No events today._"
    end if
    return output
end run
APPLESCRIPT
)

# Inject events into the AUTO-CALENDAR sentinel block.
# Use awk for reliable multi-line replacement (sed on macOS is awkward with newlines).
if [ -n "$EVENTS" ]; then
    EVENTS_CONTENT="$EVENTS" awk '
        BEGIN { in_block = 0 }
        /<!-- AUTO-CALENDAR-START -->/ {
            print
            print ENVIRON["EVENTS_CONTENT"]
            in_block = 1
            next
        }
        /<!-- AUTO-CALENDAR-END -->/ {
            in_block = 0
            print
            next
        }
        !in_block { print }
    ' "$NOTE_PATH" > "$NOTE_PATH.tmp" && mv "$NOTE_PATH.tmp" "$NOTE_PATH"
    echo "[daily-note] Calendar populated"
else
    # AppleScript failed (likely automation permission not granted).
    # Replace sentinel content with an actionable hint instead of leaving placeholder.
    HINT="_Calendar unavailable. Grant AppleScript automation permission for Calendar.app in System Settings → Privacy & Security → Automation, then re-run \`bash ~/.claude/scripts/daily-note.sh\` after deleting this file._"
    HINT_CONTENT="$HINT" awk '
        BEGIN { in_block = 0 }
        /<!-- AUTO-CALENDAR-START -->/ {
            print
            print ENVIRON["HINT_CONTENT"]
            in_block = 1
            next
        }
        /<!-- AUTO-CALENDAR-END -->/ {
            in_block = 0
            print
            next
        }
        !in_block { print }
    ' "$NOTE_PATH" > "$NOTE_PATH.tmp" && mv "$NOTE_PATH.tmp" "$NOTE_PATH"
    echo "[daily-note] Calendar unavailable, placeholder hint inserted" >&2
fi
