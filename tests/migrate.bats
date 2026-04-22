#!/usr/bin/env bats

load 'helpers'

# Simulate a pre-dotfile install: framework files as regular-file copies in ~/.claude/,
# plus user data in memory/ that must be preserved.
_simulate_pre_dotfile() {
    mkdir -p "$FAKE_HOME/.claude/commands" "$FAKE_HOME/.claude/scripts"
    cp "$FAKE_HOME/mindlint/commands/"*.md "$FAKE_HOME/.claude/commands/"
    cp "$FAKE_HOME/mindlint/scripts/"*.sh "$FAKE_HOME/.claude/scripts/"
    mkdir -p "$FAKE_HOME/.claude/rules" "$FAKE_HOME/.claude/skills" "$FAKE_HOME/.claude/memory/learnings"
    cp "$FAKE_HOME/mindlint/templates/user-side/rules/workflows.md" "$FAKE_HOME/.claude/rules/workflows.md"
    cp "$FAKE_HOME/mindlint/templates/user-side/rules/boundaries.md" "$FAKE_HOME/.claude/rules/boundaries.md"
    echo "# Learnings Index" > "$FAKE_HOME/.claude/memory/learnings/index.md"
    cat > "$FAKE_HOME/.claude/CLAUDE.md" <<'EOF'
@rules/workflows.md
@memory/learnings/index.md
EOF
    # User data that MUST be preserved
    echo "# my accumulated learning" > "$FAKE_HOME/.claude/memory/learnings/frontend.md"
    mkdir -p "$FAKE_HOME/.claude/rules"
    echo "- my preferences" > "$FAKE_HOME/.claude/rules/preferences.md"
    echo "1. my error rule" > "$FAKE_HOME/.claude/rules/error-rules.md"
}

setup() {
    make_fake_home
    stage_source_repo
    _simulate_pre_dotfile
}

@test "migrate auto-detects pre-dotfile state when setup.sh runs in default mode" {
    run_setup --non-interactive --skip-wizard
    [ -f "$FAKE_HOME/.claude/.mindlint/installed-version" ]
    [ -L "$FAKE_HOME/.claude/commands/lint.md" ]
}

@test "migrate creates backup before touching anything" {
    run_setup --non-interactive --skip-wizard
    local backup_count
    backup_count="$(find "$FAKE_HOME" -maxdepth 1 -type d -name '.claude-backup-*' | wc -l | tr -d ' ')"
    [ "$backup_count" -eq 1 ]
}

@test "migrate converts identical framework files to symlinks" {
    run_setup --non-interactive --skip-wizard
    # These were regular files in the simulated pre-dotfile install, identical to source.
    # After migrate they should be symlinks.
    [ -L "$FAKE_HOME/.claude/commands/lint.md" ]
    [ -L "$FAKE_HOME/.claude/commands/log.md" ]
    [ -L "$FAKE_HOME/.claude/scripts/session-start.sh" ]
}

@test "migrate preserves user data (memory, preferences, error-rules)" {
    run_setup --non-interactive --skip-wizard
    [ -f "$FAKE_HOME/.claude/memory/learnings/frontend.md" ]
    [ "$(cat "$FAKE_HOME/.claude/memory/learnings/frontend.md")" = "# my accumulated learning" ]
    [ "$(cat "$FAKE_HOME/.claude/rules/preferences.md")" = "- my preferences" ]
    [ "$(cat "$FAKE_HOME/.claude/rules/error-rules.md")" = "1. my error rule" ]
}

@test "migrate leaves category 2 files in place as regular files" {
    run_setup --non-interactive --skip-wizard
    [ -f "$FAKE_HOME/.claude/rules/workflows.md" ]
    [ ! -L "$FAKE_HOME/.claude/rules/workflows.md" ]
    [ -f "$FAKE_HOME/.claude/rules/boundaries.md" ]
    [ ! -L "$FAKE_HOME/.claude/rules/boundaries.md" ]
}

@test "migrate stashes pristine templates for future --sync" {
    run_setup --non-interactive --skip-wizard
    [ -f "$FAKE_HOME/.claude/.mindlint/templates-installed/rules/workflows.md" ]
    [ -f "$FAKE_HOME/.claude/.mindlint/templates-installed/rules/boundaries.md" ]
}

@test "migrate re-run is a no-op (idempotent)" {
    run_setup --non-interactive --skip-wizard
    local backup_count_1
    backup_count_1="$(find "$FAKE_HOME" -maxdepth 1 -type d -name '.claude-backup-*' | wc -l | tr -d ' ')"

    # Re-run: should detect 'installed' state (version marker exists), not 'pre-dotfile'
    run_setup --non-interactive --skip-wizard
    local backup_count_2
    backup_count_2="$(find "$FAKE_HOME" -maxdepth 1 -type d -name '.claude-backup-*' | wc -l | tr -d ' ')"
    # Second run should NOT create another backup (not in migrate mode)
    [ "$backup_count_1" -eq "$backup_count_2" ]
}

@test "migrate skips differing framework files in non-interactive mode" {
    # User customized a framework file
    echo "# my customization" >> "$FAKE_HOME/.claude/commands/lint.md"
    run_setup --non-interactive --skip-wizard
    # Their customization survives (not converted to symlink)
    [ -f "$FAKE_HOME/.claude/commands/lint.md" ]
    [ ! -L "$FAKE_HOME/.claude/commands/lint.md" ]
    grep -q "my customization" "$FAKE_HOME/.claude/commands/lint.md"
    # Other identical files still get linked
    [ -L "$FAKE_HOME/.claude/commands/log.md" ]
}
