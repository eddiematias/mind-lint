# /compile — Compile Raw Sources into Wiki
# Implements the LLM Wiki pattern by Andrej Karpathy, extended with
# memory lifecycle from LLM Wiki v2 by Rohit Ghumare (@rohitg00)

Process uncompiled sources from raw/ and recent learnings into wiki pages with confidence scoring, supersession detection, and entity extraction.

## Confidence Calculation
base = min(source_count * 0.2, 1.0)
recency = +0.1 if confirmed within 30 days
contradict = -0.2 per active contradiction
decay = -0.05 per month since compiled
confidence = clamp(base + recency + contradict + decay, 0.1, 1.0)

## Steps
1. Run privacy filter (scripts/privacy-filter.sh) on source content before processing. If sensitive data found, show it and offer to redact.
2. Read raw/_index.md for uncompiled sources (Compiled? = No)
3. Read memory/learnings/index.md for recent learnings not yet in wiki
4. For each uncompiled source:
   a. Read full content, extract key facts/insights/claims
   b. Extract entities: people, projects, tools, concepts
   c. Check wiki/_index.md for existing pages on this topic
   d. IF existing page: compare new facts vs existing claims
      - Contradiction → apply supersession (strikethrough old, add new, log in Supersession Log)
      - Confirmation → increase confidence (new source reinforces)
      - New info → add to Key Points
      - Update sources list, source_count, confidence, last_compiled, Change Log
   e. IF no existing page: create new wiki page using templates/wiki-page.md
      - Initial confidence: 0.5 for single-source pages
      - Populate all frontmatter, entities, cross-links
5. Update wiki/_index.md (include confidence and decay status)
6. Mark sources as compiled in raw/_index.md
7. Append to wiki/_log.md: date, sources processed, pages created/updated, supersessions, confidence changes
8. Report summary
