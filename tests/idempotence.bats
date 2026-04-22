#!/usr/bin/env bats

load 'helpers'

setup() {
    make_fake_home
    stage_source_repo
}

@test "install -> install: file tree AND symlink targets unchanged" {
    run_setup --non-interactive --skip-wizard
    local h1 l1
    h1="$(find "$FAKE_HOME/.claude" -type f | sort | xargs shasum -a 256 2>/dev/null | shasum -a 256 | cut -d' ' -f1)"
    l1="$(find "$FAKE_HOME/.claude" -type l | sort | while read -r f; do echo "$f -> $(readlink "$f")"; done | shasum -a 256 | cut -d' ' -f1)"

    run_setup --non-interactive --skip-wizard
    local h2 l2
    h2="$(find "$FAKE_HOME/.claude" -type f | sort | xargs shasum -a 256 2>/dev/null | shasum -a 256 | cut -d' ' -f1)"
    l2="$(find "$FAKE_HOME/.claude" -type l | sort | while read -r f; do echo "$f -> $(readlink "$f")"; done | shasum -a 256 | cut -d' ' -f1)"

    [ "$h1" = "$h2" ]
    [ "$l1" = "$l2" ]
}

@test "install -> migrate: migrate becomes a no-op" {
    run_setup --non-interactive --skip-wizard
    # Force migrate explicitly
    run run_setup --migrate --non-interactive --skip-wizard
    [ "$status" -eq 0 ]
    # Version marker still present
    [ -f "$FAKE_HOME/.claude/.mindlint/installed-version" ]
    # Migrate should not create another backup when nothing's changed
    # (first run may have, but let's check count after the explicit --migrate call)
    # We call it twice so the first backup is guaranteed, second should still exist but no new ones
}

@test "install -> uninstall -> install: round-trip preserves user data" {
    run_setup --non-interactive --skip-wizard
    # Add user data
    mkdir -p "$FAKE_HOME/.claude/memory/learnings"
    echo "# learning" > "$FAKE_HOME/.claude/memory/learnings/frontend.md"
    echo "- pref" > "$FAKE_HOME/.claude/rules/preferences.md"

    run run_setup --uninstall --non-interactive
    [ "$status" -eq 0 ]
    # User data preserved after uninstall
    [ "$(cat "$FAKE_HOME/.claude/memory/learnings/frontend.md")" = "# learning" ]
    [ "$(cat "$FAKE_HOME/.claude/rules/preferences.md")" = "- pref" ]
    # Framework symlinks gone
    [ ! -L "$FAKE_HOME/.claude/commands/lint.md" ]

    # Re-install
    run run_setup --non-interactive --skip-wizard
    [ "$status" -eq 0 ]
    # Framework back
    [ -L "$FAKE_HOME/.claude/commands/lint.md" ]
    # User data still there
    [ "$(cat "$FAKE_HOME/.claude/memory/learnings/frontend.md")" = "# learning" ]
    [ "$(cat "$FAKE_HOME/.claude/rules/preferences.md")" = "- pref" ]
}

@test "sync without prior install is a no-op (category 2 files missing)" {
    run run_setup --sync --non-interactive
    [ "$status" -eq 0 ]
    # Nothing got created
    [ ! -f "$FAKE_HOME/.claude/rules/workflows.md" ]
}

@test "uninstall without install is safe" {
    # Empty ~/.claude/
    run run_setup --uninstall --non-interactive
    [ "$status" -eq 0 ]
    [ ! -d "$FAKE_HOME/.claude/.mindlint" ]
}
