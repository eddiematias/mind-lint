#!/usr/bin/env bats

load 'helpers'

setup() {
    make_fake_home
    stage_source_repo
}

@test "install on empty ~/.claude/ creates symlinks for all category 1 files" {
    run run_setup --non-interactive --skip-wizard
    [ "$status" -eq 0 ]
    # Spot-check commands
    assert_symlink "$FAKE_HOME/.claude/commands/lint.md" "$FAKE_HOME/mindlint/commands/lint.md"
    assert_symlink "$FAKE_HOME/.claude/commands/log.md" "$FAKE_HOME/mindlint/commands/log.md"
    # Spot-check scripts
    assert_symlink "$FAKE_HOME/.claude/scripts/session-start.sh" "$FAKE_HOME/mindlint/scripts/session-start.sh"
    # Templates and docs are directory symlinks
    assert_symlink "$FAKE_HOME/.claude/templates" "$FAKE_HOME/mindlint/templates"
    assert_symlink "$FAKE_HOME/.claude/docs" "$FAKE_HOME/mindlint/docs"
}

@test "install copies category 2 templates as regular files" {
    run_setup --non-interactive --skip-wizard
    # Regular file (not symlink)
    [ -f "$FAKE_HOME/.claude/rules/workflows.md" ]
    [ ! -L "$FAKE_HOME/.claude/rules/workflows.md" ]
    [ -f "$FAKE_HOME/.claude/skills/code-review.md" ]
    [ ! -L "$FAKE_HOME/.claude/skills/code-review.md" ]
}

@test "install stashes pristine template copies in .mindlint/templates-installed/" {
    run_setup --non-interactive --skip-wizard
    [ -f "$FAKE_HOME/.claude/.mindlint/templates-installed/rules/workflows.md" ]
}

@test "install seeds starter indexes when missing" {
    run_setup --non-interactive --skip-wizard
    [ -f "$FAKE_HOME/.claude/memory/learnings/index.md" ]
    [ -f "$FAKE_HOME/.claude/wiki/_index.md" ]
    [ -f "$FAKE_HOME/.claude/content/_pipeline.md" ]
}

@test "install does not re-seed existing starter indexes" {
    mkdir -p "$FAKE_HOME/.claude/memory/learnings"
    echo "# existing user content" > "$FAKE_HOME/.claude/memory/learnings/index.md"
    run_setup --non-interactive --skip-wizard
    [ "$(cat "$FAKE_HOME/.claude/memory/learnings/index.md")" = "# existing user content" ]
}

@test "install writes CLAUDE.md when missing" {
    run_setup --non-interactive --skip-wizard
    [ -f "$FAKE_HOME/.claude/CLAUDE.md" ]
    grep -q "@rules/workflows.md" "$FAKE_HOME/.claude/CLAUDE.md"
}

@test "install leaves existing CLAUDE.md alone and prints imports to stderr" {
    echo "# my own claude.md" > "$FAKE_HOME/.claude/CLAUDE.md"
    run run_setup --non-interactive --skip-wizard
    [ "$status" -eq 0 ]
    [ "$(cat "$FAKE_HOME/.claude/CLAUDE.md")" = "# my own claude.md" ]
    # Stderr should mention @rules/workflows.md (the canonical import)
    [[ "$output" =~ "@rules/workflows.md" ]]
}

@test "install adds session-start and session-end hooks" {
    run_setup --non-interactive --skip-wizard
    jq -e '.hooks.SessionStart[0].command | contains("session-start.sh")' "$FAKE_HOME/.claude/settings.json"
    jq -e '.hooks.SessionEnd[0].command | contains("auto-commit.sh")' "$FAKE_HOME/.claude/settings.json"
}

@test "install adds all 14 Mind-Lint permissions" {
    run_setup --non-interactive --skip-wizard
    local count
    count="$(jq '.permissions.allow | length' "$FAKE_HOME/.claude/settings.json")"
    [ "$count" -eq 14 ]
}

@test "install preserves user-added hooks and permissions" {
    mkdir -p "$FAKE_HOME/.claude"
    cat > "$FAKE_HOME/.claude/settings.json" <<'EOF'
{
  "hooks": {
    "SessionStart": [{"type": "command", "command": "bash ~/user-own.sh"}]
  },
  "permissions": {
    "allow": ["Bash(npm:*)"]
  }
}
EOF
    run_setup --non-interactive --skip-wizard
    # User hook still there
    jq -e '.hooks.SessionStart[] | select(.command == "bash ~/user-own.sh")' "$FAKE_HOME/.claude/settings.json"
    # Mind-Lint hook added
    jq -e '.hooks.SessionStart[] | select(.command | contains("session-start.sh"))' "$FAKE_HOME/.claude/settings.json"
    # User permission still there
    jq -e '.permissions.allow | index("Bash(npm:*)")' "$FAKE_HOME/.claude/settings.json"
}

@test "install writes version marker" {
    run_setup --non-interactive --skip-wizard
    [ -f "$FAKE_HOME/.claude/.mindlint/installed-version" ]
    [ -n "$(cat "$FAKE_HOME/.claude/.mindlint/installed-version")" ]
}

@test "install writes placeholder context files in skip-wizard mode" {
    run_setup --non-interactive --skip-wizard
    [ -f "$FAKE_HOME/.claude/context/identity.md" ]
    [ -f "$FAKE_HOME/.claude/context/tech-stack.md" ]
    [ -f "$FAKE_HOME/.claude/context/active-projects.md" ]
}

@test "install is idempotent when re-run with no changes" {
    run_setup --non-interactive --skip-wizard
    local first_tree
    first_tree="$(find "$FAKE_HOME/.claude" -type f -o -type l | sort | xargs shasum -a 256 2>/dev/null | shasum -a 256 | cut -d' ' -f1)"
    run_setup --non-interactive --skip-wizard
    local second_tree
    second_tree="$(find "$FAKE_HOME/.claude" -type f -o -type l | sort | xargs shasum -a 256 2>/dev/null | shasum -a 256 | cut -d' ' -f1)"
    # The installed-version is regenerated each run (SHA from git), so exclude it.
    # Actually since both runs use the same repo state the SHA is identical. Hashes should match.
    [ "$first_tree" = "$second_tree" ]
}

@test "install skips cat1 collisions in non-interactive mode and reports" {
    mkdir -p "$FAKE_HOME/.claude/commands"
    echo "# my own lint" > "$FAKE_HOME/.claude/commands/lint.md"
    run run_setup --non-interactive --skip-wizard
    [ "$status" -eq 0 ]
    # User's file stays (not a symlink)
    [ -f "$FAKE_HOME/.claude/commands/lint.md" ]
    [ ! -L "$FAKE_HOME/.claude/commands/lint.md" ]
    [ "$(cat "$FAKE_HOME/.claude/commands/lint.md")" = "# my own lint" ]
    # Other commands still get linked
    assert_symlink "$FAKE_HOME/.claude/commands/log.md" "$FAKE_HOME/mindlint/commands/log.md"
}
