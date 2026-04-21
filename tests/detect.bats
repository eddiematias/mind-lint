#!/usr/bin/env bats

load 'helpers'

setup() {
    make_fake_home
    # shellcheck source=/dev/null
    source "$BATS_TEST_DIRNAME/../lib/detect.sh"
}

@test "detect_state returns 'empty' for empty ~/.claude/" {
    run detect_state "$FAKE_HOME/.claude"
    [ "$output" = "empty" ]
}

@test "detect_state returns 'empty' for missing ~/.claude/" {
    rm -rf "$FAKE_HOME/.claude"
    run detect_state "$FAKE_HOME/.claude"
    [ "$output" = "empty" ]
}

@test "detect_state returns 'installed' when version marker exists" {
    mkdir -p "$FAKE_HOME/.claude/.mindlint"
    echo "abc123" > "$FAKE_HOME/.claude/.mindlint/installed-version"
    run detect_state "$FAKE_HOME/.claude"
    [ "$output" = "installed" ]
}

@test "detect_state returns 'pre-dotfile' when Mind-Lint markers exist but no version file" {
    # All three markers present
    mkdir -p "$FAKE_HOME/.claude/memory/learnings" "$FAKE_HOME/.claude/rules"
    echo "# Learnings Index" > "$FAKE_HOME/.claude/memory/learnings/index.md"
    echo "# Workflows" > "$FAKE_HOME/.claude/rules/workflows.md"
    cat > "$FAKE_HOME/.claude/CLAUDE.md" <<'EOF'
# My CLAUDE.md
@rules/workflows.md
@memory/learnings/index.md
EOF
    run detect_state "$FAKE_HOME/.claude"
    [ "$output" = "pre-dotfile" ]
}

@test "detect_state returns 'pre-dotfile' when only two of three markers exist" {
    # learnings + workflows (no CLAUDE.md with imports)
    mkdir -p "$FAKE_HOME/.claude/memory/learnings" "$FAKE_HOME/.claude/rules"
    echo "# Learnings" > "$FAKE_HOME/.claude/memory/learnings/index.md"
    echo "# Workflows" > "$FAKE_HOME/.claude/rules/workflows.md"
    run detect_state "$FAKE_HOME/.claude"
    [ "$output" = "pre-dotfile" ]
}

@test "detect_state returns 'non-mindlint' when only one marker exists" {
    echo "# My own CLAUDE.md" > "$FAKE_HOME/.claude/CLAUDE.md"
    run detect_state "$FAKE_HOME/.claude"
    [ "$output" = "non-mindlint" ]
}

@test "detect_state returns 'non-mindlint' when user has unrelated content" {
    mkdir -p "$FAKE_HOME/.claude/commands"
    echo "# my command" > "$FAKE_HOME/.claude/commands/mycommand.md"
    echo "# my claude" > "$FAKE_HOME/.claude/CLAUDE.md"
    run detect_state "$FAKE_HOME/.claude"
    [ "$output" = "non-mindlint" ]
}

@test "installed takes precedence over pre-dotfile markers" {
    # Even if all pre-dotfile markers present, version file wins
    mkdir -p "$FAKE_HOME/.claude/.mindlint" "$FAKE_HOME/.claude/memory/learnings" "$FAKE_HOME/.claude/rules"
    echo "sha" > "$FAKE_HOME/.claude/.mindlint/installed-version"
    echo "# Learnings" > "$FAKE_HOME/.claude/memory/learnings/index.md"
    echo "# Workflows" > "$FAKE_HOME/.claude/rules/workflows.md"
    run detect_state "$FAKE_HOME/.claude"
    [ "$output" = "installed" ]
}
