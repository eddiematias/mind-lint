# /search-knowledge — Search All Knowledge

Search across all knowledge in the system. Results ranked by confidence and relevance.

## Search Order
1. **wiki/** — compiled knowledge, ranked by confidence score (highest first)
2. **memory/** — learnings and decisions, sorted by date (newest first)
3. **raw/** — uncompiled source materials, sorted by date

## Display Format
Show confidence and decay status for wiki results:
  [0.85 | Active] wiki/topic.md — "Summary..."
  [0.65 | Cooling] wiki/other.md — "Summary..."

Memory and raw results show date only.

## Steps
1. Take the search query
2. Search wiki/ pages (grep content + check titles), sort by confidence
3. Search memory/learnings/ and memory/decisions/ (grep content + check titles)
4. Search raw/ (grep content + check titles)
5. Display results grouped by source with the format above
6. Offer to open/read any result
