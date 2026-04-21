#!/usr/bin/env bash
# Install mode: the default setup.sh flow.
# Expects these globals set by the caller (setup.sh):
#   SOURCE_ROOT  - path to the cloned repo (e.g., ~/mindlint/)
#   CLAUDE_DIR   - path to the target dotfile dir (~/.claude/)
#   NON_INTERACTIVE - "1" to skip interactive prompts (tests)
#   SKIP_WIZARD  - "1" to skip the user wizard (tests)
#
# shellcheck disable=SC2153  # SOURCE_ROOT/CLAUDE_DIR are set by setup.sh

[ -n "${INSTALL_SH_LOADED+x}" ] && return 0
readonly INSTALL_SH_LOADED=1

# shellcheck source-path=SCRIPTDIR source=logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/logging.sh"
# shellcheck source-path=SCRIPTDIR source=fs.sh
source "$(dirname "${BASH_SOURCE[0]}")/fs.sh"
# shellcheck source-path=SCRIPTDIR source=prompts.sh
source "$(dirname "${BASH_SOURCE[0]}")/prompts.sh"
# shellcheck source-path=SCRIPTDIR source=settings.sh
source "$(dirname "${BASH_SOURCE[0]}")/settings.sh"
# shellcheck source-path=SCRIPTDIR source=manifest.sh
source "$(dirname "${BASH_SOURCE[0]}")/manifest.sh"

install_run() {
    log_step "Installing Mind-Lint"

    mkdir -p "$CLAUDE_DIR/.mindlint"

    _install_cat1_per_file
    _install_cat1_dir_symlinks
    _install_cat2_templates
    _install_cat3_seeds
    _install_wizard
    _install_claude_md
    _install_settings
    _install_git
    _install_version_marker

    log_done "Mind-Lint installed"
    _install_report
}

_install_cat1_per_file() {
    log_info "Linking framework files (commands, scripts)"
    for_each_cat1_per_file "$SOURCE_ROOT" _link_per_file
}

_link_per_file() {
    local source_file="$1"
    local rel_path="${source_file#"$SOURCE_ROOT/"}"
    local dest="$CLAUDE_DIR/$rel_path"

    if is_symlink_to "$dest" "$source_file"; then
        return 0
    fi

    if [ ! -e "$dest" ] && [ ! -L "$dest" ]; then
        mkdir -p "$(dirname "$dest")"
        ln -s "$source_file" "$dest"
        log_done "linked $rel_path"
        return 0
    fi

    if [ "${NON_INTERACTIVE:-}" = "1" ]; then
        log_warn "skipping $rel_path (collision, non-interactive mode)"
        return 0
    fi
    _resolve_cat1_collision "$source_file" "$dest" "$rel_path"
}

_resolve_cat1_collision() {
    local source_file="$1"
    local dest="$2"
    local rel_path="$3"
    echo "" >&2
    log_warn "$rel_path exists at $dest and is not our symlink"
    local choice
    choice="$(prompt_menu "  [d]iff / [r]ename yours to .user / [s]kip / [o]verwrite" "d r s o")"
    case "$choice" in
        d)
            diff "$dest" "$source_file" >&2 || true
            _resolve_cat1_collision "$source_file" "$dest" "$rel_path"
            ;;
        r)
            local renamed
            if [[ "$dest" == *.md ]]; then
                renamed="${dest%.md}.user.md"
            else
                renamed="${dest}.user"
            fi
            # If a prior .user backup already exists, append a timestamp
            # so we never silently clobber an earlier rename.
            if [ -e "$renamed" ]; then
                if [[ "$renamed" == *.md ]]; then
                    renamed="${renamed%.md}.$(date +%s).md"
                else
                    renamed="${renamed}.$(date +%s)"
                fi
            fi
            mv "$dest" "$renamed"
            ln -s "$source_file" "$dest"
            log_done "renamed yours to $renamed and linked ours"
            ;;
        s)
            log_warn "skipped $rel_path (your version remains, ours is unreachable)"
            ;;
        o)
            rm -f "$dest"
            ln -s "$source_file" "$dest"
            log_done "overwrote $rel_path with our symlink"
            ;;
    esac
}

_install_cat1_dir_symlinks() {
    log_info "Linking framework directories (templates, docs)"
    local dir
    for dir in templates docs; do
        local dest="$CLAUDE_DIR/$dir"
        if is_symlink_to "$dest" "$SOURCE_ROOT/$dir"; then
            continue
        fi
        if [ ! -e "$dest" ] && [ ! -L "$dest" ]; then
            ln -s "$SOURCE_ROOT/$dir" "$dest"
            log_done "linked $dir/"
            continue
        fi
        if [ "${NON_INTERACTIVE:-}" = "1" ]; then
            log_warn "skipping $dir/ (exists as non-symlink, non-interactive)"
            continue
        fi
        _resolve_cat1_dir_collision "$dir"
    done
}

_resolve_cat1_dir_collision() {
    local dir="$1"
    local dest="$CLAUDE_DIR/$dir"
    local count
    count="$(find "$dest" -type f 2>/dev/null | wc -l | tr -d ' ')"
    log_warn "$dir/ exists as a regular directory with $count files"
    local choice
    choice="$(prompt_menu "  [l]ist / [r]ename yours to .user/ / [s]kip / [o]verwrite" "l r s o")"
    case "$choice" in
        l) find "$dest" -type f >&2; _resolve_cat1_dir_collision "$dir" ;;
        r) mv "$dest" "$dest.user"; ln -s "$SOURCE_ROOT/$dir" "$dest"; log_done "renamed and linked" ;;
        s) log_warn "skipped $dir/" ;;
        o) rm -rf "$dest"; ln -s "$SOURCE_ROOT/$dir" "$dest"; log_done "overwrote $dir/" ;;
    esac
}

_install_cat2_templates() {
    log_info "Seeding user-editable templates"
    for_each_manifest_entry "2" "" _copy_template
}

_copy_template() {
    local glob="$1"
    local _cat="$2"
    local _sub="$3"
    local tgt="$4"
    local source="$SOURCE_ROOT/$glob"
    local dest="$CLAUDE_DIR/$tgt"
    local stash="$CLAUDE_DIR/.mindlint/templates-installed/$tgt"

    if [ -e "$dest" ]; then
        return 0
    fi
    mkdir -p "$(dirname "$dest")"
    cp "$source" "$dest"
    mkdir -p "$(dirname "$stash")"
    cp "$source" "$stash"
    log_done "seeded $tgt"
}

_install_cat3_seeds() {
    log_info "Seeding starter indexes"
    for_each_manifest_entry "3" "seed" _seed_index
}

_seed_index() {
    local glob="$1"
    local _cat="$2"
    local _sub="$3"
    local tgt="$4"
    local dest="$CLAUDE_DIR/$tgt"
    if [ ! -e "$dest" ]; then
        mkdir -p "$(dirname "$dest")"
        cp "$SOURCE_ROOT/$glob" "$dest"
        log_done "seeded $tgt"
    fi
}

_install_claude_md() {
    local claude_md="$CLAUDE_DIR/CLAUDE.md"
    if [ -f "$claude_md" ]; then
        log_warn "CLAUDE.md already exists, leaving it alone"
        echo "" >&2
        echo "Paste these imports into your CLAUDE.md where they fit:" >&2
        echo "" >&2
        grep '^@' "$SOURCE_ROOT/templates/claude-md/CLAUDE.md" >&2
        echo "" >&2
        return 0
    fi
    cp "$SOURCE_ROOT/templates/claude-md/CLAUDE.md" "$claude_md"
    log_done "wrote CLAUDE.md"
}

_install_wizard() {
    if [ "${SKIP_WIZARD:-}" = "1" ]; then
        mkdir -p "$CLAUDE_DIR/context"
        local f
        for f in identity.md tech-stack.md active-projects.md; do
            if [ ! -f "$CLAUDE_DIR/context/$f" ]; then
                echo "# (placeholder, fill in via the wizard or edit directly)" > "$CLAUDE_DIR/context/$f"
            fi
        done
        return 0
    fi

    mkdir -p "$CLAUDE_DIR/context"
    if [ ! -f "$CLAUDE_DIR/context/identity.md" ]; then
        _wizard_identity
    else
        log_info "context/identity.md exists, skipping"
    fi
    if [ ! -f "$CLAUDE_DIR/context/tech-stack.md" ]; then
        _wizard_tech_stack
    fi
    if [ ! -f "$CLAUDE_DIR/context/active-projects.md" ]; then
        _wizard_projects
    fi
    _wizard_client_optional
}

_wizard_identity() {
    log_step "About you"
    local name role style_choice style_block
    name="$(prompt_read "Your name")"
    role="$(prompt_read "What you do (e.g., 'full-stack developer')")"
    echo "Communication style:" >&2
    echo "  1) Casual (friendly, conversational)" >&2
    echo "  2) Direct (efficient, no fluff)" >&2
    echo "  3) Thorough (detailed, show reasoning)" >&2
    style_choice="$(prompt_read "Choice (1-3)" "1")"
    case "$style_choice" in
        1) style_block="- Casual, friendly, conversational.
- Well-structured responses with headers and bullets.
- Push back when wrong. Honest and direct, but friendly." ;;
        2) style_block="- Direct and efficient. Skip preamble, get to the point.
- Bullet points and short paragraphs. No fluff.
- Push back when wrong. Do not sugarcoat." ;;
        3) style_block="- Detailed and thorough. Show reasoning.
- Explain the why behind every suggestion.
- Flag uncertainty. Explore edge cases." ;;
        *) style_block="- [Edit this file to set your style]" ;;
    esac

    cat > "$CLAUDE_DIR/context/identity.md" <<EOF
# Identity

${name} is a ${role}.

## Communication Style
${style_block}

## Working Patterns
- Ask clarifying questions upfront.
- Explain before fixing.
- Flag uncertainty rather than guessing.
EOF
    log_done "context/identity.md"
}

_wizard_tech_stack() {
    log_step "Tech stack"
    local langs frameworks tools
    langs="$(prompt_read "Languages (e.g., 'TypeScript, Python')" "[Add later]")"
    frameworks="$(prompt_read "Frameworks (e.g., 'React, Next.js')" "[Add later]")"
    tools="$(prompt_read "Tools (e.g., 'WebStorm, Docker')" "[Add later]")"

    cat > "$CLAUDE_DIR/context/tech-stack.md" <<EOF
# Tech Stack

## Languages
- ${langs}

## Frameworks
- ${frameworks}

## Tools
- Claude Code (CLI)
- ${tools}
EOF
    log_done "context/tech-stack.md"
}

_wizard_projects() {
    log_step "Active projects"
    local main others
    main="$(prompt_read "Main project right now")"
    others="$(prompt_read "Other active projects (comma-separated, optional)")"

    cat > "$CLAUDE_DIR/context/active-projects.md" <<EOF
# Active Projects

## ${main:-[Add your main project]}
- **Current focus:** [Update as your focus shifts]

## Other Projects
- ${others:-[Add as they come up]}
EOF
    log_done "context/active-projects.md"
}

_wizard_client_optional() {
    if prompt_yn "Add a client/brand now? (can skip and add later)" n; then
        local client_name client_desc slug
        client_name="$(prompt_read "Client/brand name")"
        client_desc="$(prompt_read "One-line description")"
        slug="$(echo "$client_name" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd 'a-z0-9-')"
        mkdir -p "$CLAUDE_DIR/context/clients/$slug"
        mkdir -p "$CLAUDE_DIR/skills"
        cat > "$CLAUDE_DIR/context/clients/$slug/overview.md" <<EOF
# ${client_name}, Current State

${client_desc}

## Key Facts
- [Add]

## Key Contacts
- [Add]
EOF
        cat > "$CLAUDE_DIR/context/clients/$slug/brand-voice.md" <<EOF
# ${client_name}, Brand Voice

## Tone
- [Describe]
EOF
        cat > "$CLAUDE_DIR/context/clients/$slug/vocabulary.md" <<EOF
# ${client_name} Vocabulary

## Always Use
- [Add]

## Never Use
- [Add]
EOF
        cat > "$CLAUDE_DIR/skills/${slug}-content.md" <<EOF
# Skill: ${client_name} Content

## When to Load
Writing content for ${client_name}.

## Rules
- Always also load @context/clients/${slug}/overview.md
- Always also load @context/clients/${slug}/brand-voice.md
- Always also load @context/clients/${slug}/vocabulary.md
EOF
        log_done "client: $slug"
    fi
}

_install_settings() {
    log_info "Updating settings.json"
    local settings="$CLAUDE_DIR/settings.json"
    # Use ~/.claude/... when CLAUDE_DIR is the default (portable across machines
    # that share the dotfile git repo). Use the absolute path when the user has
    # overridden CLAUDE_DIR via MINDLINT_CLAUDE_DIR (otherwise hooks would point
    # to the wrong location).
    local hook_base
    if [ "$CLAUDE_DIR" = "$HOME/.claude" ]; then
        # shellcheck disable=SC2088  # intentional: literal ~ stored in settings.json,
        # expanded at hook invocation time (portable across machines sharing the dotfile repo)
        hook_base="~/.claude/scripts"
    else
        hook_base="$CLAUDE_DIR/scripts"
    fi
    add_hook "$settings" "SessionStart" "bash $hook_base/session-start.sh"
    add_hook "$settings" "SessionEnd" "bash $hook_base/auto-commit.sh"
    local rule
    while IFS= read -r rule; do
        add_permission "$settings" "$rule"
    done < <(mindlint_permission_set)
    log_done "hooks + permissions merged"
}

_install_git() {
    if [ "${SKIP_WIZARD:-}" = "1" ] || [ "${NON_INTERACTIVE:-}" = "1" ]; then
        return 0
    fi

    if [ ! -d "$CLAUDE_DIR/.git" ]; then
        if prompt_yn "Initialize $CLAUDE_DIR as a git repo for auto-commit backup?" y; then
            (cd "$CLAUDE_DIR" && git init -q -b main)
            if [ ! -f "$CLAUDE_DIR/.gitignore" ]; then
                cat > "$CLAUDE_DIR/.gitignore" <<'EOF'
# Mind-Lint install metadata
.mindlint/install.lock
EOF
            fi
            log_done "git initialized in $CLAUDE_DIR"
        fi
    fi

    if [ -d "$CLAUDE_DIR/.git" ]; then
        if ! (cd "$CLAUDE_DIR" && git remote get-url origin >/dev/null 2>&1); then
            local url
            url="$(prompt_read "GitHub remote URL for backup (optional, press Enter to skip)")"
            if [ -n "$url" ]; then
                (cd "$CLAUDE_DIR" && git remote add origin "$url")
                log_done "remote 'origin' set to $url"
            fi
        fi
    fi
}

_install_version_marker() {
    local version
    if [ -d "$SOURCE_ROOT/.git" ]; then
        version="$(git -C "$SOURCE_ROOT" rev-parse HEAD 2>/dev/null || echo "unknown")"
    else
        version="unknown"
    fi
    echo "$version" > "$CLAUDE_DIR/.mindlint/installed-version"
    log_done "version marker: $version"
}

_install_report() {
    echo "" >&2
    echo "Done. Next:" >&2
    echo "  1. Open Claude Code and try /lint" >&2
    echo "  2. To update later: cd $SOURCE_ROOT && git pull && bash setup.sh" >&2
    echo "  3. To uninstall: bash $SOURCE_ROOT/setup.sh --uninstall" >&2
}
