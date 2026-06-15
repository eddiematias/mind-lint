---
date: <% tp.date.now("YYYY-MM-DD") %>
type: daily-note
---

# <% tp.date.now("dddd, MMMM D, YYYY") %>

[[<% tp.date.now("YYYY-MM-DD", -1) %>|← Yesterday]] | [[<% tp.date.now("YYYY-MM-DD", 1) %>|Tomorrow →]]

## Calendar

<!-- AUTO-CALENDAR-START -->
<!-- Populated on-demand by /today. Pulls iCloud/Calendar.app via scripts/icloud-events.sh (icalBuddy) and Google Workspace via the Anthropic Google Calendar MCP connector. Empty until /today runs. -->
<!-- AUTO-CALENDAR-END -->

## Plan

<!-- Run /today to populate this section with a prioritized day plan. -->

## Notes

<!-- Free-form prose. The daily writing canvas. Write whatever: ideas, reflections, observations, notes about people, projects, conversations. Use #idea inline tags for things to surface later via /graduate. Wikilink to people, projects, concepts: [[Greg Eisenberg]], [[mind-lint-system]], [[obsidian]]. -->

## Tasks

<!-- Free-form. Checkboxes, links, whatever shape works for the day. -->

## Review

<!-- Auto-populated by /close-day at end of day. Agent-owned section: /close-day is the only command that writes into a daily note. -->
