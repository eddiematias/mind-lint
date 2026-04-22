#!/usr/bin/env bats

load 'helpers'

setup() {
    make_fake_home
    stage_source_repo
    # Install first
    run_setup --non-interactive --skip-wizard
    # Add user data that must be preserved
    mkdir -p "$FAKE_HOME/.claude/memory/learnings"
    echo "# my learning" > "$FAKE_HOME/.claude/memory/learnings/frontend.md"
    echo "- my preferences" > "$FAKE_HOME/.claude/rules/preferences.md"
    echo "1. my error rule" > "$FAKE_HOME/.claude/rules/error-rules.md"
}

@test "uninstall removes framework symlinks" {
    run_setup --uninstall --non-interactive
    [ ! -L "$FAKE_HOME/.claude/commands/lint.md" ]
    [ ! -L "$FAKE_HOME/.claude/commands/log.md" ]
    [ ! -L "$FAKE_HOME/.claude/scripts/session-start.sh" ]
    [ ! -L "$FAKE_HOME/.claude/templates" ]
    [ ! -L "$FAKE_HOME/.claude/docs" ]
}

@test "uninstall removes .mindlint directory" {
    run_setup --uninstall --non-interactive
    [ ! -d "$FAKE_HOME/.claude/.mindlint" ]
}

@test "uninstall preserves user data" {
    run_setup --uninstall --non-interactive
    [ -f "$FAKE_HOME/.claude/memory/learnings/frontend.md" ]
    [ "$(cat "$FAKE_HOME/.claude/memory/learnings/frontend.md")" = "# my learning" ]
    [ "$(cat "$FAKE_HOME/.claude/rules/preferences.md")" = "- my preferences" ]
    [ "$(cat "$FAKE_HOME/.claude/rules/error-rules.md")" = "1. my error rule" ]
}

@test "uninstall preserves category 2 templates as user copies" {
    run_setup --uninstall --non-interactive
    [ -f "$FAKE_HOME/.claude/rules/workflows.md" ]
    [ -f "$FAKE_HOME/.claude/rules/boundaries.md" ]
    [ -f "$FAKE_HOME/.claude/skills/code-review.md" ]
    [ -f "$FAKE_HOME/.claude/skills/content-creation.md" ]
}

@test "uninstall removes Mind-Lint hooks from settings.json" {
    run_setup --uninstall --non-interactive
    local count
    count="$(jq '.hooks.SessionStart // [] | length' "$FAKE_HOME/.claude/settings.json")"
    [ "$count" = "0" ]
    count="$(jq '.hooks.SessionEnd // [] | length' "$FAKE_HOME/.claude/settings.json")"
    [ "$count" = "0" ]
}

@test "uninstall removes all 14 Mind-Lint permissions" {
    run_setup --uninstall --non-interactive
    local ml_count
    ml_count="$(jq '[.permissions.allow[] | select(contains("~/.claude/"))] | length' "$FAKE_HOME/.claude/settings.json")"
    [ "$ml_count" = "0" ]
    ml_count="$(jq '[.permissions.allow[] | select(. | startswith("Bash(git "))] | length' "$FAKE_HOME/.claude/settings.json")"
    [ "$ml_count" = "0" ]
}

@test "uninstall preserves user-added settings.json entries" {
    # Inject a user-owned hook and permission after install
    local tmp
    tmp="$(mktemp)"
    jq '.hooks.SessionStart += [{type: "command", command: "bash ~/my-hook.sh"}]' "$FAKE_HOME/.claude/settings.json" > "$tmp"
    mv "$tmp" "$FAKE_HOME/.claude/settings.json"
    tmp="$(mktemp)"
    jq '.permissions.allow += ["Bash(npm:*)"]' "$FAKE_HOME/.claude/settings.json" > "$tmp"
    mv "$tmp" "$FAKE_HOME/.claude/settings.json"

    run_setup --uninstall --non-interactive

    jq -e '.hooks.SessionStart[] | select(.command == "bash ~/my-hook.sh")' "$FAKE_HOME/.claude/settings.json"
    jq -e '.permissions.allow | index("Bash(npm:*)")' "$FAKE_HOME/.claude/settings.json"
}

@test "uninstall preserves CLAUDE.md" {
    run_setup --uninstall --non-interactive
    [ -f "$FAKE_HOME/.claude/CLAUDE.md" ]
}

@test "uninstall is safe to run when Mind-Lint isn't installed" {
    # Remove everything first
    rm -rf "$FAKE_HOME/.claude"
    mkdir -p "$FAKE_HOME/.claude"
    run run_setup --uninstall --non-interactive
    [ "$status" -eq 0 ]
}
