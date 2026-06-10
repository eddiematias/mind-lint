# /publish — Export Content to External Platform

Export a finished or in-progress content piece to its target platform.

## Steps

1. Read content/_pipeline.md
2. Show items from "In Progress" table. If empty, show "Ideas" and offer to develop one first.
3. Ask: "Where should this go?" Options:
   - Notion page (requires Notion MCP connection)
   - Blog post (output as formatted markdown, ready for CMS)
   - LinkedIn post (formatted for LinkedIn, show character count)
   - Social thread (output as numbered tweets)
   - Video script (output as talking points with screen recording notes)
   - Multiple formats (generate several from the same source)
4. Load skills/content-creation.md for format-specific guidelines
5. Generate the formatted output for selected platform(s)
6. Present to the user for review and edits
7. After approval:
   - If not already there, copy final version to content/published/
   - Update content/_pipeline.md:
     - Move from "In Progress" to "Published" table
     - Add published URL (if applicable) and date
8. Ask if the user wants to capture any learnings from the content creation process
