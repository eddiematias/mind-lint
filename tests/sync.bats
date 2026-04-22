#!/usr/bin/env bats

bats_require_minimum_version 1.5.0

load 'helpers'

setup() {
    make_fake_home
    stage_source_repo
    # Install first so category 2 files are in a known state
    run_setup --non-interactive --skip-wizard
}

@test "sync is a no-op when source and user copy match" {
    local before
    before="$(hash_file "$FAKE_HOME/.claude/rules/workflows.md")"
    run run_setup --sync --non-interactive
    [ "$status" -eq 0 ]
    local after
    after="$(hash_file "$FAKE_HOME/.claude/rules/workflows.md")"
    [ "$before" = "$after" ]
}

@test "sync auto-updates when user has not modified their copy" {
    # Modify upstream
    echo "# updated upstream" >> "$FAKE_HOME/mindlint/templates/user-side/rules/workflows.md"
    run run_setup --sync --non-interactive
    [ "$status" -eq 0 ]
    grep -q "updated upstream" "$FAKE_HOME/.claude/rules/workflows.md"
    # Pristine stash is also updated
    grep -q "updated upstream" "$FAKE_HOME/.claude/.mindlint/templates-installed/rules/workflows.md"
}

@test "sync in non-interactive mode skips when user has edited AND upstream changed" {
    echo "# my edit" >> "$FAKE_HOME/.claude/rules/workflows.md"
    echo "# upstream edit" >> "$FAKE_HOME/mindlint/templates/user-side/rules/workflows.md"
    run run_setup --sync --non-interactive
    [ "$status" -eq 0 ]
    # User's version untouched
    grep -q "my edit" "$FAKE_HOME/.claude/rules/workflows.md"
    ! grep -q "upstream edit" "$FAKE_HOME/.claude/rules/workflows.md"
}

@test "sync interactive mode: keep yours" {
    echo "# my edit" >> "$FAKE_HOME/.claude/rules/workflows.md"
    echo "# upstream edit" >> "$FAKE_HOME/mindlint/templates/user-side/rules/workflows.md"
    # Answer: k (keep yours)
    run bash -c "echo 'k' | bash '$FAKE_HOME/mindlint/setup.sh' --sync"
    [ "$status" -eq 0 ]
    grep -q "my edit" "$FAKE_HOME/.claude/rules/workflows.md"
    ! grep -q "upstream edit" "$FAKE_HOME/.claude/rules/workflows.md"
    # Pristine is updated to new upstream (so next sync won't re-prompt)
    grep -q "upstream edit" "$FAKE_HOME/.claude/.mindlint/templates-installed/rules/workflows.md"
}

@test "sync interactive mode: take upstream" {
    echo "# my edit" >> "$FAKE_HOME/.claude/rules/workflows.md"
    echo "# upstream edit" >> "$FAKE_HOME/mindlint/templates/user-side/rules/workflows.md"
    # Answer: t (take upstream)
    run bash -c "echo 't' | bash '$FAKE_HOME/mindlint/setup.sh' --sync"
    [ "$status" -eq 0 ]
    ! grep -q "my edit" "$FAKE_HOME/.claude/rules/workflows.md"
    grep -q "upstream edit" "$FAKE_HOME/.claude/rules/workflows.md"
    grep -q "upstream edit" "$FAKE_HOME/.claude/.mindlint/templates-installed/rules/workflows.md"
}

@test "sync skips files missing pristine stash (install required first)" {
    # Simulate a missing pristine (odd state, shouldn't normally happen)
    rm -f "$FAKE_HOME/.claude/.mindlint/templates-installed/rules/workflows.md"
    echo "# upstream change" >> "$FAKE_HOME/mindlint/templates/user-side/rules/workflows.md"
    run run_setup --sync --non-interactive
    # Without pristine, case 3/4 detection fails; the three-way merge needs it.
    # Expected behavior: when pristine is missing, treat as "install mode" would,
    # only act if current == source (case 1), otherwise interactive-or-skip per NON_INTERACTIVE.
    # So with non-interactive and no pristine: skip (no crash).
    [ "$status" -eq 0 ]
}

@test "sync skips category 2 files that don't exist in ~/.claude/ yet" {
    rm -f "$FAKE_HOME/.claude/rules/boundaries.md"
    run run_setup --sync --non-interactive
    [ "$status" -eq 0 ]
    # boundaries.md stays missing (sync doesn't install missing files; --install does)
    [ ! -f "$FAKE_HOME/.claude/rules/boundaries.md" ]
}
