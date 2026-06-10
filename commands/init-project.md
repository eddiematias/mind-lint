Set up this project for the user's Claude Code knowledge system. You are in the current working directory and should scaffold it based on what you find here.

## Steps

1. **Detect the project context.** Look at the current directory: check for package.json, Cargo.toml, pyproject.toml, go.mod, or any other project config files. Check for existing README, .gitignore, and any existing CLAUDE.md, AGENTS.md, or .claude/ directory.

2. **Do NOT overwrite existing files.** If CLAUDE.md or .claude/ already exists, tell me what's already here and ask what I want to update instead of replacing anything.

3. **Handle existing AGENTS.md.** If the project has an AGENTS.md but no CLAUDE.md:
   - Read the AGENTS.md to understand what instructions are already there
   - Create CLAUDE.md that imports it with `@AGENTS.md` at the top, so Claude Code and other tools share the same instructions
   - Add Claude Code-specific sections below the import (project-specific context from the template)
   - Do NOT duplicate anything that's already in AGENTS.md
   - The resulting CLAUDE.md should look like:
     ```
     @AGENTS.md

     ## Claude Code
     [project-specific sections from template, minus anything already covered in AGENTS.md]
     ```
   If there is NO AGENTS.md, create a standalone CLAUDE.md normally (next step).

4. **Create CLAUDE.md at the project root** (if not already handled by step 3). Use the template from ~/.claude/templates/project-CLAUDE.md as a starting point, but fill in as much as you can by reading the project files:
   - Detect the tech stack from config files (package.json, tsconfig.json, etc.)
   - Find build/run/test commands from package.json scripts, Makefile, etc.
   - Identify the project structure from the directory layout
   - Leave sections you can't determine with clear TODOs for me to fill in

5. **Create .claude/rules/ directory** with a starter conventions.md file. If you can detect conventions from the codebase (ESLint config, Prettier config, tsconfig settings), document them. Otherwise create a minimal placeholder.

6. **Create CLAUDE.local.md** with a placeholder for my personal project preferences. Add CLAUDE.local.md to .gitignore if it's not already there.

7. **Add to .gitignore** if it exists:
   - CLAUDE.local.md

8. **Show me a summary** of everything you created and anything you auto-detected, plus a list of TODOs I should fill in manually. If an AGENTS.md was found, note that it's being imported and highlight any gaps between what AGENTS.md covers and what the template expects.

9. **Log this as a decision** in ~/.claude/memory/decisions/ with today's date, noting the project name and tech stack detected. Update the decisions index.

Remember: the project CLAUDE.md should be thin. Only project-specific context. Global preferences, learnings, workflows, and brand voice are already inherited from ~/.claude/.
