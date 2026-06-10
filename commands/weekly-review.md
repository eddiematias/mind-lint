# /weekly-review — Weekly Retrospective

Run a weekly review of what was captured, what's changed, and what needs attention.

## Steps

1. **Learnings review.** Read ~/.claude/memory/learnings/index.md. Show entries from the past 7 days. If none, note that.

2. **Decisions review.** Read ~/.claude/memory/decisions/index.md. Show decisions from the past 7 days. Flag any with status "revisiting" or review dates approaching.

3. **Corrections review.** Read ~/.claude/memory/corrections/index.md and ~/.claude/rules/error-rules.md. Show any new corrections/rules from the past 7 days.

4. **Mini-lint.** Quick health scan:
   - Check wiki/_index.md against actual wiki/ files for index drift
   - Check memory/learnings/index.md entry count (warn if approaching 50)
   - Scan context/active-projects.md for potentially stale entries
   - Flag any obvious contradictions spotted during the review

5. **Content opportunities.** Analyze the week's learnings and decisions for content-worthy patterns:
   - Suggest 2-3 content ideas based on what was logged this week
   - Offer to add them to content/_pipeline.md and create files in content/ideas/

6. **Wiki compilation check.** Check raw/_index.md for uncompiled sources. If any exist, suggest running /compile.

7. **Summary.** Present a clean report:
   - Learnings this week: [count]
   - Decisions this week: [count]
   - New error rules: [count]
   - Wiki health: [status]
   - Content pipeline: [ideas count] ideas, [in progress count] in progress, [published count] published
   - Action items (if any)

8. Ask the user: "Anything from this week worth logging that we missed?"
