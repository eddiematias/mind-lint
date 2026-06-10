# Claude.ai Chat Summarization Prompt (Mind-Lint Ingestion Format)

The prompt below produces summaries that `/mine-chats` can extract cleanly. Paste it into a Claude.ai chat **after** the conversation you want summarized, or open a new chat and paste this prompt + the full conversation transcript below it. Save output as `YYYY-MM-DD-short-topic.md` in `~/.claude/raw/transcripts/`.

---

## The prompt

````markdown
Summarize this conversation for ingestion into my personal knowledge system. The summary will be machine-parsed to extract learnings, decisions, preferences, and content ideas, so structure matters more than prose.

**Output format:** a single markdown file, exactly the structure below. Fill in every section. If a section has nothing, write "None" under it. Do not add sections, do not add commentary outside the template.

**Attribution rules:**
- Distinguish between what I (the human) decided vs. what the assistant suggested. If I accepted a suggestion, phrase it as "I decided X (from assistant's suggestion)."
- Preserve the *why* behind every decision, not just the outcome. If the reasoning isn't in the chat, say "reasoning not captured" rather than inventing one.
- Quote me directly when I expressed a preference or correction. Verbatim quotes in `>` blockquotes.

**Content rules:**
- No em dashes anywhere. Use commas, colons, semicolons, or parentheses.
- Skip pleasantries, hedging, and back-and-forth iteration. Capture the landing point, not the path.
- Strip any API keys, tokens, passwords, or credentials you encounter. Replace with `[REDACTED]`.

---

# Chat Summary: [descriptive title]

**Date:** YYYY-MM-DD
**Project:** [project name, or "general" if cross-cutting]
**Topic:** [one sentence describing what this conversation was about]
**Outcome:** [one sentence on what was accomplished or resolved]

## Context
Two or three sentences on what prompted the conversation and what I was trying to accomplish. Include relevant background only if it shapes the decisions below.

## Learnings
Technical insights, gotchas, patterns, or tool behaviors that would be useful in future projects. One bullet each.

- **[Short title]**: [the insight]. Why it matters: [reasoning or context].

## Decisions
Moments where options were weighed and one was chosen. Preserve the alternatives even if they were rejected quickly.

- **Decision:** [what was chosen]
  - **Options considered:** [A, B, C]
  - **Chose because:** [reasoning]
  - **Trade-offs accepted:** [what was given up]

## Corrections & Preferences
Anything I corrected the assistant on, or explicit preferences I stated. These become permanent rules in my system, so precision matters.

- **I corrected:** "[verbatim quote or close paraphrase of what I said]"
  - **Rule going forward:** [the actionable rule this implies]
- **I prefer:** [preference] because [reasoning, if stated]

## Content Ideas
Moments where the work itself seemed worth turning into shareable content (blog post, social thread, video, etc.).

- **[Idea]**: [format suggestion] for [audience]. Hook: [what makes it interesting].

## Open Threads
Unresolved questions, follow-ups, or TODOs that came out of the conversation.

- [item]
````

---

## Why this format

- **Five named sections match what `/mine-chats` extracts** (learnings, decisions, corrections, preferences, content ideas). The miner has nowhere to get confused.
- **Verbatim quotes for corrections** protect the error-to-rule pipeline. A paraphrased correction can drift in meaning by the time it hits `error-rules.md`.
- **"Chose because" + "Trade-offs accepted"** is the thing plain summaries usually flatten. Forcing both fields means the `/compile` wiki pass later has real material.
- **Em-dash ban upstream** keeps style-strict downstream files clean without manual scrubbing.
- **Secret redaction at summary time** ensures nothing sensitive reaches the raw transcripts directory.

## When to use this vs. just exporting

Use this prompt when:
- You're on a Claude.ai team account where direct chat export isn't available.
- You want pre-structured input for `/mine-chats` instead of raw transcripts that take longer to mine.
- The conversations are long and a focused summary will mine faster than the full text.

Use direct chat export instead when:
- Personal Claude.ai account with full export available (Settings → Privacy → Export Data).
- You want the full transcript preserved, not the summary.
