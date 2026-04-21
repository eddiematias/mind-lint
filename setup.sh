#!/bin/bash
# Mind-Lint v2 — One-Command Setup
# Clone repo → run this → you're done.

set -e

CLAUDE_DIR="$HOME/.claude"

# ─── Colors ───
BOLD='\033[1m'
DIM='\033[2m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

print_header() {
    echo ""
    echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}  Mind-Lint v2 — Personal Knowledge OS${NC}"
    echo -e "${BOLD}  for Claude Code${NC}"
    echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

print_step() {
    echo -e "${CYAN}━━ $1 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

print_done() {
    echo -e "  ${GREEN}✓${NC} $1"
}

# ─── Pre-Flight ───

print_header

# Handle running from cloned repo vs ~/.claude/
if [ "$(pwd)" != "$CLAUDE_DIR" ]; then
    if [ -f "./setup.sh" ] && [ -f "./README.md" ]; then
        echo -e "${YELLOW}Moving Mind-Lint into ~/.claude/...${NC}"
        echo ""
        if [ -d "$CLAUDE_DIR" ]; then
            echo "  ~/.claude/ already exists."
            read -p "  Back it up and replace? (y/N): " REPLACE
            if [ "$REPLACE" = "y" ] || [ "$REPLACE" = "Y" ]; then
                BACKUP="$HOME/.claude-backup-$(date +%Y%m%d-%H%M%S)"
                cp -r "$CLAUDE_DIR" "$BACKUP"
                print_done "Backed up existing to $BACKUP"
                rm -rf "$CLAUDE_DIR"
            else
                echo "  Setup cancelled."
                exit 0
            fi
        fi
        cp -r "$(pwd)" "$CLAUDE_DIR"
        cd "$CLAUDE_DIR"
        print_done "Installed to ~/.claude/"
        echo ""
    else
        echo "Run from the cloned mind-lint repo or from ~/.claude/"
        echo ""
        echo "  git clone https://github.com/eddiematias/mind-lint.git"
        echo "  cd mind-lint && ./setup.sh"
        exit 1
    fi
fi

# Check for existing setup
if [ -f "$CLAUDE_DIR/context/identity.md" ]; then
    echo -e "${YELLOW}Mind-Lint is already set up.${NC}"
    echo "  1) Re-run setup (overwrites personalized files)"
    echo "  2) Cancel"
    read -p "  Choice: " EXISTING
    if [ "$EXISTING" != "1" ]; then exit 0; fi
    echo ""
fi

# Prerequisites
MISSING=""
if ! command -v git &> /dev/null; then MISSING="$MISSING git"; fi
if ! command -v claude &> /dev/null; then
    echo -e "${YELLOW}Note: Claude Code not detected. Install it from https://code.claude.com${NC}"
    echo "  Setup will continue, but you'll need Claude Code to use the system."
    echo ""
fi

if echo "$MISSING" | grep -q "git"; then
    echo -e "${YELLOW}Git is required. Install it first.${NC}"
    exit 1
fi

echo "This takes about 3 minutes. A few questions, then everything"
echo "gets set up automatically."
echo ""

# ─── Step 1: Seed or Fresh ───

print_step "Step 1 of 5: Starting Point"

echo "Mind-Lint can extract learnings, decisions, and patterns from your"
echo "past Claude Code sessions to seed the system with things you've"
echo "already learned. Or start with a clean slate."
echo ""
echo "  1) Seed from past sessions"
echo "     ${DIM}Recommended if you've been using Claude Code. Scans your recent${NC}"
echo "     ${DIM}sessions and pulls out knowledge automatically.${NC}"
echo ""
echo "  2) Start fresh"
echo "     ${DIM}Empty system that builds up as you work.${NC}"
echo ""
read -p "Choice (1-2): " SEED_CHOICE
echo ""

# ─── Step 2: About You ───

print_step "Step 2 of 5: About You"

read -p "What's your name? " USER_NAME
echo ""

read -p "What do you do? (e.g., 'full-stack developer', 'marketing strategist'): " USER_ROLE
echo ""

echo "How should Claude talk to you?"
echo "  1) Casual — friendly, conversational, light humor"
echo "  2) Direct — efficient, no fluff, straight answers"
echo "  3) Thorough — detailed, show reasoning, explore edge cases"
echo "  4) Custom — I'll edit the file myself later"
read -p "Choice (1-4): " STYLE_CHOICE
echo ""

case $STYLE_CHOICE in
    1) COMM_STYLE="- Casual, friendly, conversational. Light humor welcome.
- Well-structured responses with headers and bullets where appropriate.
- Open responses by setting context. Close with next steps.
- Push back when wrong. Honest and direct, but friendly." ;;
    2) COMM_STYLE="- Direct and efficient. Skip preamble, get to the point.
- Bullet points and short paragraphs. No fluff.
- Lead with the answer, then context if needed.
- Push back when wrong. Don't sugarcoat." ;;
    3) COMM_STYLE="- Detailed and thorough. Think out loud, show reasoning.
- Explain the why behind every suggestion.
- Use examples and analogies.
- Flag uncertainty. Explore edge cases." ;;
    *) COMM_STYLE="- [Edit context/identity.md to set your style]" ;;
esac

# ─── Step 3: Tech Stack ───

print_step "Step 3 of 5: Tech Stack"

echo "What do you work with? (Press Enter to skip any)"
echo ""
read -p "Languages (e.g., 'TypeScript, Python'): " LANGUAGES
LANGUAGES=${LANGUAGES:-"[Add your languages here]"}

read -p "Frameworks (e.g., 'React, Next.js, Tailwind'): " FRAMEWORKS
FRAMEWORKS=${FRAMEWORKS:-"[Add your frameworks here]"}

read -p "Tools (e.g., 'VS Code, Docker, Figma'): " TOOLS
TOOLS=${TOOLS:-"[Add your tools here]"}
echo ""

# ─── Step 4: Projects & Clients ───

print_step "Step 4 of 5: Projects & Clients"

read -p "Main project right now? " MAIN_PROJECT
MAIN_PROJECT=${MAIN_PROJECT:-"[Add your main project]"}

read -p "Other active projects? (comma-separated, or Enter to skip): " OTHER_PROJECTS
echo ""

read -p "Work with specific clients or brands? (y/N): " HAS_CLIENTS

CLIENT_NAME=""
CLIENT_SLUG=""
if [ "$HAS_CLIENTS" = "y" ] || [ "$HAS_CLIENTS" = "Y" ]; then
    read -p "  Client/brand name: " CLIENT_NAME
    CLIENT_SLUG=$(echo "$CLIENT_NAME" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd 'a-z0-9-')
    read -p "  One-line description: " CLIENT_DESC
    echo ""
    echo -e "  ${DIM}Add more clients later: create directories under context/clients/${NC}"
fi
echo ""

# ─── Step 5: Git Backup ───

print_step "Step 5 of 5: Backup"

echo "Mind-Lint auto-commits after every Claude Code session."
echo "Create a private GitHub repo, then paste the URL here."
echo ""
read -p "GitHub repo URL (or Enter to skip): " GIT_REMOTE
echo ""

# ─── Generate ───

echo -e "${BOLD}Generating your system...${NC}"
echo ""

# Identity
cat > context/identity.md << EOF
# Identity

$USER_NAME is a $USER_ROLE.

## Communication Style
$COMM_STYLE

## Working Patterns
- Ask clarifying questions upfront before building anything.
- When reviewing work: explain what's wrong and why first, then suggest fixes.
- Brainstorming: start broad, then narrow. Include reasoning with every suggestion.
- Data/analysis: lead with the key takeaway. Reasoning after.
- Flag uncertainty clearly rather than guessing confidently.
EOF
print_done "context/identity.md"

# Tech Stack
cat > context/tech-stack.md << EOF
# Tech Stack

## Languages
- $LANGUAGES

## Frameworks
- $FRAMEWORKS

## Tools
- Claude Code (CLI)
- $TOOLS
EOF
print_done "context/tech-stack.md"

# Active Projects
if [ -z "$OTHER_PROJECTS" ]; then
    OTHER_SECTION="## Other Projects
- [Add as they come up]"
else
    OTHER_SECTION="## Other Projects
- $OTHER_PROJECTS"
fi

cat > context/active-projects.md << EOF
# Active Projects

## $MAIN_PROJECT
- **Current focus:** [Update as your focus shifts]

$OTHER_SECTION
EOF
print_done "context/active-projects.md"

# Client
if [ -n "$CLIENT_NAME" ]; then
    mkdir -p "context/clients/$CLIENT_SLUG"

    cat > "context/clients/$CLIENT_SLUG/overview.md" << EOF
# $CLIENT_NAME — Current State

$CLIENT_DESC

## Key Facts
- [Add key facts]

## Key Contacts
- [Add contacts]
EOF

    cat > "context/clients/$CLIENT_SLUG/brand-voice.md" << EOF
# $CLIENT_NAME — Brand Voice

## Tone
- [Describe the brand's tone]

## Do's
- [What the brand should sound like]

## Don'ts
- [What to avoid]
EOF

    cat > "context/clients/$CLIENT_SLUG/vocabulary.md" << EOF
# $CLIENT_NAME — Vocabulary

## Always Use
- [Preferred terms]

## Never Use
- [Terms to avoid]
EOF

    cat > "skills/${CLIENT_SLUG}-content.md" << EOF
# Skill: $CLIENT_NAME Content

## When to Load
Writing content for $CLIENT_NAME.

## Tone
[Describe the tone]

## Rules
- Always also load @context/clients/$CLIENT_SLUG/overview.md
- Always also load @context/clients/$CLIENT_SLUG/brand-voice.md
- Always also load @context/clients/$CLIENT_SLUG/vocabulary.md

## Examples
[Add approved examples over time]
EOF

    print_done "context/clients/$CLIENT_SLUG/"
    print_done "skills/${CLIENT_SLUG}-content.md"
fi

# Rules
cat > rules/error-rules.md << EOF
# Error Rules
# Every AI mistake becomes a permanent rule. Never delete, only add.
# Inspired by Michael Tuszynski's error-to-rule pipeline (mpt.solutions)

# (Rules added automatically when $USER_NAME corrects Claude)
EOF
print_done "rules/error-rules.md"

cat > rules/preferences.md << EOF
# Preferences

## Working Style
- [Add formatting preferences, code style rules, etc.]

## Corrections Log
- [Auto-updated when Claude is corrected]
EOF
print_done "rules/preferences.md"

# CLAUDE.md
CLIENT_LOADING=""
if [ -n "$CLIENT_NAME" ]; then
    CLIENT_LOADING="# $CLIENT_NAME work → also load @context/clients/$CLIENT_SLUG/overview.md + @context/clients/$CLIENT_SLUG/brand-voice.md + @context/clients/$CLIENT_SLUG/vocabulary.md
# $CLIENT_NAME content → also load @skills/${CLIENT_SLUG}-content.md"
fi

cat > CLAUDE.md << EOF
# ${USER_NAME}'s AI Operating System (Mind-Lint v2)

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
@wiki/_index.md
@memory/learnings/index.md
@memory/decisions/index.md

## Modular Context (Load When Relevant)
$CLIENT_LOADING
# Code work → also load @skills/code-review.md
# Content creation → also load @skills/content-creation.md + @content/_pipeline.md

## Workflows
@rules/workflows.md
EOF
print_done "CLAUDE.md"

# Indexes
cat > memory/learnings/index.md << 'EOF'
# Learnings Index
| Date | Title | Category | File |
|---|---|---|---|
EOF

cat > memory/decisions/index.md << 'EOF'
# Decisions Index
| Date | Decision | Status | Category | File |
|---|---|---|---|---|
EOF

cat > memory/corrections/index.md << 'EOF'
# Corrections Index
| Date | What Was Wrong | Rule Created |
|---|---|---|
EOF

cat > memory/mined-sessions.md << 'EOF'
# Mined Sessions Tracker
## Processed Claude Code Sessions
| Session ID | Project | Date Mined | Items Extracted |
|---|---|---|---|

## Processed Claude.ai Chats
| Filename | Date Mined | Items Extracted |
|---|---|---|
EOF

cat > wiki/_index.md << 'EOF'
# Wiki Index
## Pages
| Page | Confidence | Decay Status | Last Compiled | Last Accessed | Sources |
|---|---|---|---|---|---|

## Stats
- Total pages: 0
- Last compile: never
- Last lint: never
EOF

cat > wiki/_log.md << 'EOF'
# Wiki Operations Log
EOF

cat > raw/_index.md << 'EOF'
# Raw Sources Index
| File | Type | Date Added | Compiled? |
|---|---|---|---|
EOF

cat > content/_pipeline.md << 'EOF'
# Content Pipeline
## Ideas (Backlog)
| Title | Format | Audience | Source | Priority | Date Added |
|---|---|---|---|---|---|

## In Progress
| Title | Format | Status | Draft Location | Target Date |
|---|---|---|---|---|

## Published
| Title | Format | Published URL | Date Published |
|---|---|---|---|
EOF

print_done "All indexes and starters"

# Scripts
chmod +x scripts/auto-commit.sh scripts/session-start.sh scripts/privacy-filter.sh 2>/dev/null || true
print_done "Scripts (executable)"

# Git
if [ -n "$GIT_REMOTE" ]; then
    if [ ! -d ".git" ]; then git init --quiet; fi
    git remote remove origin 2>/dev/null || true
    git remote add origin "$GIT_REMOTE"
    print_done "Git remote → $GIT_REMOTE"
elif [ ! -d ".git" ]; then
    git init --quiet
    print_done "Git initialized (add remote later)"
fi

echo ""

# ─── Seeding Instructions ───

if [ "$SEED_CHOICE" = "1" ]; then
    echo -e "${BOLD}━━ Next: Seed Your System ━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "  Your system is set up. Now let's fill it with what you already know."
    echo ""
    echo "  ${BOLD}Step 1: Commit the setup first${NC}"
    echo "    cd ~/.claude"
    echo "    git add -A && git commit -m 'mind-lint: initial setup'"
    if [ -n "$GIT_REMOTE" ]; then
    echo "    git push -u origin main"
    fi
    echo ""
    echo "  ${BOLD}Step 2: Open Claude Code and mine your past sessions${NC}"
    echo "    claude"
    echo "    /mine-sessions"
    echo ""
    echo "    This scans your recent Claude Code sessions (last 30 days)"
    echo "    and extracts learnings, decisions, corrections, and content ideas."
    echo "    You'll approve each extraction before it's saved."
    echo ""
    echo "  ${BOLD}Step 3: Compile into wiki${NC}"
    echo "    /compile"
    echo ""
    echo "    This takes everything that was mined and compiles it into"
    echo "    structured wiki pages with confidence scores and cross-links."
    echo ""
    echo "  ${BOLD}Optional: Mine Claude.ai chats too${NC}"
    echo "    1. Go to claude.ai → Settings → Privacy → Export Data"
    echo "    2. Download ZIP from email, extract JSON files"
    echo "    3. Put them in ~/.claude/raw/transcripts/"
    echo "    4. In Claude Code: /mine-chats"
    echo ""
else
    echo -e "${BOLD}━━ Getting Started ━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "  ${BOLD}Step 1: Commit${NC}"
    echo "    cd ~/.claude"
    echo "    git add -A && git commit -m 'mind-lint: initial setup'"
    if [ -n "$GIT_REMOTE" ]; then
    echo "    git push -u origin main"
    fi
    echo ""
    echo "  ${BOLD}Step 2: Open Claude Code and verify${NC}"
    echo "    claude"
    echo "    /lint"
    echo ""
fi

echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}  ${GREEN}✅ Mind-Lint v2 is ready.${NC}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  Commands to try in Claude Code:"
echo "    /lint              health check"
echo "    /log               log a learning or decision"
echo "    /content           manage content pipeline"
echo "    /search-knowledge  search everything you know"
echo ""
echo -e "  ${DIM}Full docs: docs/system-guide.md${NC}"
echo -e "  ${DIM}Obsidian setup: docs/obsidian-setup.md${NC}"
echo -e "  ${DIM}Credits: docs/credits.md${NC}"
echo ""
