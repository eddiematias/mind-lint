# People Index

Index of relationship profiles. Each profile captures **how you connect with the person, how they show up with you, and the history of the relationship** so wikilinks like `[[Person Name]]` resolve to useful context. Profiles load on demand; this index is lightweight and always loaded.

## Profiles

| Name | Relationship | Status | Last Synced (iMessage) | Last Synced (Calendar) | Last Synced (Journal) |
|---|---|---|---|---|---|

## Stats

- Total profiles: 0
- Active: 0
- Seeded (awaiting manual fill): 0

## How this works

- Profiles live at `wiki/people/<Name>.md` and follow `templates/people-profile.md`.
- **Manual seed pass:** you hand-author `## Snapshot`, `## How I show up`, `## How they show up`, and `## History`. These four sections are 100% human-authored.
- **Source enrichment:** `/people-sync <Name>` proposes additions to `## Recent threads` (rolling window, rewritten on each run) and nominates milestone candidates for `## History` (per-candidate approval). It never writes the four human-authored sections.
- **iMessage** is the first implemented source, via `imessage-exporter`. Contacts.app, Calendar, and daily-notes mentions are designed for in the schema (each has a `last-synced-<source>` field) but not yet wired up.
- See `rules/workflows-reference.md` (People Profiles Layer) for the full convention, including the agent-doesn't-characterize rule.

## Status legend

- **seeded** — file exists, frontmatter filled, human-authored sections empty
- **active** — human-authored sections filled, sources may or may not be synced
- **dormant** — relationship is paused or distant; profile retained for reference
