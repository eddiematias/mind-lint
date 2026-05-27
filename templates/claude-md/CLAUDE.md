# Your AI Operating System (Mind-Lint v2)

## Identity
@context/identity.md

## Rules (Always Loaded)
@rules/preferences.md
@rules/error-rules.md
@rules/boundaries.md

## Tech Defaults
@context/tech-stack.md

## Active Context (Always Loaded)
@context/active-projects.md

## Knowledge Indexes (Always Loaded, Lightweight)
# "Lightweight" is enforced, not aspirational: keep these one line per entry (full detail
# lives in the linked file). /lint Phase 0.5 audits the always-loaded budget (~25K target),
# /prune keeps the indexes one-line. See rules/workflows.md "Memory Index Maintenance".
@wiki/_index.md
@memory/learnings/index.md
@memory/decisions/index.md

## Modular Context (Load When Relevant)
# These are on-demand pointers, NOT @imports. The leading @ is omitted on purpose:
# an @path here loads eagerly into EVERY session, which defeats "Load When Relevant"
# and bloats the always-on context budget. Read the listed file only when its trigger applies.
# Code work → also load skills/code-review.md
# Content creation → also load skills/content-creation.md + content/_pipeline.md

## Workflows
@rules/workflows.md
