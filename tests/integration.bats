#!/usr/bin/env bats

load 'helpers'

setup() {
    make_fake_home
    stage_source_repo
}

@test "install -> upstream workflows change -> sync auto-updates" {
    run_setup --non-interactive --skip-wizard
    echo "# upstream new rule" >> "$FAKE_HOME/mindlint/templates/user-side/rules/workflows.md"
    run run_setup --sync --non-interactive
    [ "$status" -eq 0 ]
    grep -q "upstream new rule" "$FAKE_HOME/.claude/rules/workflows.md"
}

@test "install on non-mindlint ~/.claude/ with commands collision (non-interactive skips)" {
    mkdir -p "$FAKE_HOME/.claude/commands"
    echo "# my own lint command" > "$FAKE_HOME/.claude/commands/lint.md"
    run_setup --non-interactive --skip-wizard
    # Their lint.md stays (not a symlink)
    [ -f "$FAKE_HOME/.claude/commands/lint.md" ]
    [ ! -L "$FAKE_HOME/.claude/commands/lint.md" ]
    [ "$(cat "$FAKE_HOME/.claude/commands/lint.md")" = "# my own lint command" ]
    # Non-colliding commands got linked
    [ -L "$FAKE_HOME/.claude/commands/log.md" ]
}

@test "pre-dotfile install auto-migrates via setup.sh default mode" {
    # Simulate pre-dotfile: regular file copies of framework
    mkdir -p "$FAKE_HOME/.claude/commands" "$FAKE_HOME/.claude/rules" "$FAKE_HOME/.claude/memory/learnings"
    cp "$FAKE_HOME/mindlint/commands/lint.md" "$FAKE_HOME/.claude/commands/lint.md"
    cp "$FAKE_HOME/mindlint/templates/user-side/rules/workflows.md" "$FAKE_HOME/.claude/rules/workflows.md"
    echo "# Learnings" > "$FAKE_HOME/.claude/memory/learnings/index.md"
    cat > "$FAKE_HOME/.claude/CLAUDE.md" <<'EOF'
@rules/workflows.md
@memory/learnings/index.md
EOF
    # User data
    echo "# user data" > "$FAKE_HOME/.claude/memory/learnings/frontend.md"

    # Default setup.sh should auto-detect and migrate
    run_setup --non-interactive --skip-wizard

    # After migration: lint.md is a symlink (was identical to source)
    [ -L "$FAKE_HOME/.claude/commands/lint.md" ]
    # User data preserved
    [ "$(cat "$FAKE_HOME/.claude/memory/learnings/frontend.md")" = "# user data" ]
    # Version marker written
    [ -f "$FAKE_HOME/.claude/.mindlint/installed-version" ]
    # Backup created
    local backup_count
    backup_count="$(find "$FAKE_HOME" -maxdepth 1 -type d -name '.claude-backup-*' | wc -l | tr -d ' ')"
    [ "$backup_count" -ge 1 ]
}

@test "full lifecycle: install -> edit user template -> upstream change -> sync keeps edits" {
    run_setup --non-interactive --skip-wizard
    # User edits their workflows.md
    echo "# user custom rule" >> "$FAKE_HOME/.claude/rules/workflows.md"
    # Upstream also changes
    echo "# upstream rule" >> "$FAKE_HOME/mindlint/templates/user-side/rules/workflows.md"

    # Non-interactive sync: skips conflict (both edited)
    run run_setup --sync --non-interactive
    [ "$status" -eq 0 ]
    # User edit survives
    grep -q "user custom rule" "$FAKE_HOME/.claude/rules/workflows.md"
    # Upstream change NOT pulled in
    ! grep -q "upstream rule" "$FAKE_HOME/.claude/rules/workflows.md"
}

@test "settings.json hooks point to path-stable ~/.claude/scripts/..." {
    run_setup --non-interactive --skip-wizard
    # The recorded hook command should use ~/.claude/ (portable) when CLAUDE_DIR is the default
    local cmd
    cmd="$(jq -r '.hooks.SessionStart[0].command' "$FAKE_HOME/.claude/settings.json")"
    [[ "$cmd" == "bash ~/.claude/scripts/session-start.sh" ]]
}
