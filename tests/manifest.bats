#!/usr/bin/env bats

load 'helpers'

setup() {
    make_fake_home
    stage_source_repo
    # shellcheck source=/dev/null
    source "$FAKE_HOME/mindlint/lib/manifest.sh"
    export MANIFEST_PATH="$FAKE_HOME/mindlint/manifest.conf"
}

@test "manifest categorizes commands as cat1 per-file" {
    run category_for "commands/lint.md"
    [ "$status" -eq 0 ]
    [ "$output" = "1:per-file" ]
}

@test "manifest categorizes scripts as cat1 per-file" {
    run category_for "scripts/session-start.sh"
    [ "$status" -eq 0 ]
    [ "$output" = "1:per-file" ]
}

@test "manifest categorizes templates dir as cat1 dir-symlink" {
    run category_for "templates"
    [ "$status" -eq 0 ]
    [ "$output" = "1:dir" ]
}

@test "manifest categorizes docs dir as cat1 dir-symlink" {
    run category_for "docs"
    [ "$status" -eq 0 ]
    [ "$output" = "1:dir" ]
}

@test "manifest categorizes user-side workflows as cat2 copy" {
    run category_for "templates/user-side/rules/workflows.md"
    [ "$status" -eq 0 ]
    [ "$output" = "2:copy" ]
}

@test "manifest categorizes user-side boundaries as cat2 copy" {
    run category_for "templates/user-side/rules/boundaries.md"
    [ "$output" = "2:copy" ]
}

@test "manifest categorizes user-side skills as cat2 copy" {
    run category_for "templates/user-side/skills/code-review.md"
    [ "$output" = "2:copy" ]
}

@test "manifest categorizes starter-indexes as cat3 seed" {
    run category_for "templates/starter-indexes/memory/learnings/index.md"
    [ "$output" = "3:seed" ]
}

@test "manifest categorizes claude-md template as cat3 claude-md" {
    run category_for "templates/claude-md/CLAUDE.md"
    [ "$output" = "3:claude-md" ]
}

@test "unknown path returns non-zero" {
    run category_for "random/unknown/file.md"
    [ "$status" -ne 0 ]
}

@test "target_for returns relative target path for cat2" {
    run target_for "templates/user-side/rules/workflows.md"
    [ "$output" = "rules/workflows.md" ]
}

@test "target_for returns relative target path for cat3 seed" {
    run target_for "templates/starter-indexes/memory/learnings/index.md"
    [ "$output" = "memory/learnings/index.md" ]
}

@test "target_for returns CLAUDE.md for cat3 claude-md" {
    run target_for "templates/claude-md/CLAUDE.md"
    [ "$output" = "CLAUDE.md" ]
}

@test "for_each_cat1_per_file iterates all commands and scripts" {
    # Collect callback invocations
    local collected=()
    _collect() { collected+=("$1"); }
    for_each_cat1_per_file "$FAKE_HOME/mindlint" _collect
    # Every file in commands/ should be visited
    local expected_commands
    expected_commands=$(find "$FAKE_HOME/mindlint/commands" -name '*.md' | wc -l | tr -d ' ')
    local actual_commands=0
    for f in "${collected[@]}"; do
        case "$f" in *"/commands/"*) actual_commands=$((actual_commands + 1)) ;; esac
    done
    [ "$actual_commands" -eq "$expected_commands" ]
}
