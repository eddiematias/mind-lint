# Implements the LLM Wiki pattern by Andrej Karpathy, extended with
# memory lifecycle from LLM Wiki v2 by Rohit Ghumare (@rohitg00)

# /compile — Compile Raw Sources into Wiki (v2: with memory lifecycle)

Process uncompiled sources from raw/ and recent learnings from memory/ into wiki pages. Now includes confidence scoring, supersession detection, and entity extraction.

## Confidence Calculation

When creating or updating a wiki page, calculate confidence as:

```
base_confidence = min(source_count * 0.2, 1.0)     # More sources = higher (caps at 1.0)
recency_bonus = 0.1 if last_compiled < 30 days      # Recent confirmation boosts
contradiction_penalty = -0.2 per active contradiction # Contradictions lower score
time_decay = -0.05 per month since last_compiled     # Decays over time

confidence = clamp(base_confidence + recency_bonus + contradiction_penalty + time_decay, 0.1, 1.0)
```

Round to 2 decimal places. Store in frontmatter.

## Supersession Detection

When compiling new information that contradicts an existing wiki page claim:

1. Don't silently overwrite the old claim
2. Mark the old claim with strikethrough and a supersession note:
   `- New claim here ~~(previously: old claim, superseded YYYY-MM-DD, source: [source])~~`
3. Add an entry to the page's Supersession Log table
4. Update the page's `supersedes` frontmatter with a link to the source of the old claim
5. Recalculate confidence (the superseded claim lowers, the new one gets the source's confidence)

## Privacy Filtering

Before writing any content to wiki/:
1. Run scripts/privacy-filter.sh on the source content
2. If sensitive data is detected:
   - Show the user what was found
   - Offer to: auto-redact (replace with [REDACTED]), skip this source, or proceed anyway
   - If auto-redact chosen, replace the sensitive patterns before writing
   - Log the redaction to wiki/_log.md
3. If clean, proceed normally

## Steps

1. Read raw/_index.md to find uncompiled sources (Compiled? = No)
2. Read memory/learnings/index.md for recent learnings not yet reflected in wiki
3. For each uncompiled source:
   a. Read the full source content
   b. Extract key facts, insights, and claims
   c. Extract entities: people, projects, tools, concepts, decisions (for the Entities section)
   d. Check wiki/_index.md for existing pages on this topic

   IF existing page found:
   e. Read the existing page
   f. Compare new facts against existing claims
   g. If contradiction found: apply supersession (mark old claim, add new one, log in Supersession Log)
   h. If confirmation found: increase confidence (new source reinforces existing claim)
   i. If new information: add to Key Points
   j. Add new source to the sources frontmatter list
   k. Increment source_count
   l. Recalculate confidence score
   m. Update last_compiled date
   n. Update Change Log

   IF no existing page:
   o. Create new wiki page using templates/wiki-page.md format
   p. Populate all frontmatter fields (confidence starts at 0.5 for single-source pages)
   q. Extract entities into the Entities section
   r. Add [[cross-links]] to related wiki pages

4. For any wiki pages that were updated:
   - Check if the update affects other wiki pages (via cross-links or shared entities)
   - If so, flag those pages for review (don't auto-edit, just note in the report)

5. Update wiki/_index.md with new/updated pages (include confidence in the index table)
6. Update raw/_index.md to mark sources as compiled
7. Append operation details to wiki/_log.md including: sources processed, pages created, pages updated, supersessions applied, confidence changes
8. Report summary:
   - Sources compiled
   - Pages created (with initial confidence)
   - Pages updated (with confidence change: was X, now Y)
   - Supersessions applied
   - Entities extracted
   - Pages flagged for review (affected by updates to related pages)
9. If any source material suggests a content opportunity, mention it
