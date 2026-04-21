# /prune — Archive Old Learnings

Clean up the learnings index when it exceeds 50 entries.

## Steps
1. Read memory/learnings/index.md and count entries
2. If under 50, report "Index is healthy" and stop
3. If over 50, identify the oldest entries (keep 30 most recent)
4. Move old learning files to archive/old-learnings/
5. Update memory/learnings/index.md to reflect removals
6. Report what was archived
