# /search-knowledge — Search All Knowledge

Search across the entire Mind-Lint knowledge base for a topic, keyword, or concept.

## Search Order (prioritized)

1. **Wiki first** (wiki/) — Compiled, cross-linked knowledge. Most reliable and comprehensive.
2. **Memory second** (memory/learnings/, memory/decisions/) — Individual learnings and decisions. May have details not yet compiled into wiki.
3. **Raw sources third** (raw/) — Unprocessed source material. May contain info not yet extracted.

## Ranking

Search results should be ranked by:
1. Confidence score (higher = shown first)
2. Decay status (active > cooling > cold)
3. Recency (more recently compiled = higher)

When displaying results, show the confidence score and decay status:
  [0.85 | Active] wiki/ai-workflows.md — "Summary of key points..."
  [0.65 | Cooling] wiki/frontend-patterns.md — "Summary..."
  [0.40 | Cold] wiki/old-topic.md — "Summary..."

Search order remains: wiki/ first, then memory/, then raw/.
Wiki results are sorted by confidence. Memory results are sorted by date. Raw results are sorted by date.

## Steps

1. Ask the user what they're looking for (or use the argument passed to the command)
2. Search wiki/ files for matches — show relevant excerpts with confidence and decay status
3. Search memory/learnings/ category files for matches — show relevant entries sorted by date
4. Search memory/decisions/ for matches — show relevant decisions sorted by date
5. Search raw/ for matches — note these are uncompiled sources
6. Present results organized by source layer (wiki > memory > raw), with wiki ranked by confidence
7. If results come from raw/ but not wiki/, suggest running /compile to integrate that knowledge
8. If no results found, suggest alternative search terms or offer to check context/ and rules/ files
