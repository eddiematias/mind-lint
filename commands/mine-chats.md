# /mine-chats — Extract Knowledge from Claude.ai Chat Exports

Process exported Claude.ai conversations from raw/transcripts/.

## Prerequisites
Export from claude.ai (Settings → Privacy → Export Data) or use Chrome extension.
Place files in raw/transcripts/.

## Steps
1. Scan raw/transcripts/ for unprocessed files
2. Check raw/_index.md to skip cataloged files
3. Display found files
4. For each selected file:
   - Parse JSON or read markdown
   - Extract: learnings, decisions, corrections, preferences, content ideas
5. Run privacy filter before writing
6. Show summary per conversation, ask for confirmation
7. Update raw/_index.md
8. Offer /compile and /reindex
9. Track in memory/mined-sessions.md
10. Final report
