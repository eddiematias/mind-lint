# /init-project — Scaffold Per-Project Config

Create a project-specific CLAUDE.md for the current project.

## Steps
1. Check if CLAUDE.md already exists in the project root
   - If yes: ask what to update, don't overwrite
2. Check if AGENTS.md exists
   - If yes: create CLAUDE.md that imports it with @AGENTS.md
3. If neither exists: create CLAUDE.md from templates/project-CLAUDE.md
4. Auto-detect: tech stack, build commands, test commands, project structure
5. Fill in detected values
6. Log the setup as a decision in memory/decisions/
