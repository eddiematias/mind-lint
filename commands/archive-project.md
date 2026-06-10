The user is wrapping up or shelving the current project. Do a final knowledge sweep to make sure nothing valuable gets lost.

## Steps

1. **Identify the project.** Read the current project's CLAUDE.md to get the project name, tech stack, and what was built.

2. **Final learnings sweep.** Review:
   - The current session's conversation for any unlogged insights
   - The project's native auto memory at ~/.claude/projects/<project>/memory/ for anything cross-project worthy
   - Ask the user: "Anything from this project we should capture before archiving?"
   
   Log any new cross-project learnings to the appropriate global category files in ~/.claude/memory/learnings/.

3. **Decision status check.** Read ~/.claude/memory/decisions/index.md and find any decisions tagged with this project. Ask the user if any statuses should be updated (decided > completed, or note actual outcomes vs. expected consequences).

4. **Create a project summary.** Write a decision-style entry in ~/.claude/memory/decisions/ titled "Project Archive: [Project Name]" with:
   - What was built (overview)
   - Tech stack used
   - Key decisions made during the project (link to existing decision docs)
   - Key learnings that came from this project
   - Final status (completed, shelved, handed off, etc.)
   - Update the decisions index

5. **Wiki compilation.** Offer to compile any unlogged project knowledge into wiki pages via /compile. Check if there are project-specific learnings that would benefit from being compiled into the wiki.

6. **Content opportunities.** Review the project's learnings and decisions. Ask the user:
   - "Any of these worth turning into content?"
   - If yes, suggest format (blog post, social thread, video script) and create entries in ~/.claude/content/ideas/ using templates/content-idea.md. Update ~/.claude/content/_pipeline.md.

7. **Mark project as archived.** If the project has a CLAUDE.md, add a note at the top:
   ```
   <!-- ARCHIVED: YYYY-MM-DD - See ~/.claude/memory/decisions/YYYY-MM-DD-archive-project-name.md -->
   ```

8. **Crystallization.** After archiving project knowledge, create a structured digest:
   a. Summarize: What was the project? What was built?
   b. Key learnings extracted (list with links to memory/learnings/ entries)
   c. Decisions made (list with links to memory/decisions/ entries)
   d. Entities involved (people, tools, technologies)
   e. Metrics if available (timeline, scope, outcome)
   f. Content opportunities (flag for content pipeline)

   Write the digest to wiki/ as a compiled project page (e.g., wiki/project-[name].md).
   Update wiki/_index.md.
   Auto-create a content idea in content/ideas/ titled "Build Story: [project name]" using templates/content-idea.md.
   Update content/_pipeline.md.

9. **Summary.** Show the user everything that was captured and where it lives.
