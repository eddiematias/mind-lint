#!/usr/bin/env bats

load 'helpers'

setup() {
    make_fake_home
    # shellcheck source=/dev/null
    source "$BATS_TEST_DIRNAME/../lib/settings.sh"
    SETTINGS="$FAKE_HOME/.claude/settings.json"
}

@test "add_hook creates settings.json if missing" {
    add_hook "$SETTINGS" "SessionStart" "bash ~/.claude/scripts/session-start.sh"
    [ -f "$SETTINGS" ]
    jq -e '.hooks.SessionStart[0].command == "bash ~/.claude/scripts/session-start.sh"' "$SETTINGS"
}

@test "add_hook is idempotent (dedupe by command string)" {
    add_hook "$SETTINGS" "SessionStart" "bash ~/.claude/scripts/session-start.sh"
    add_hook "$SETTINGS" "SessionStart" "bash ~/.claude/scripts/session-start.sh"
    local count
    count="$(jq '.hooks.SessionStart | length' "$SETTINGS")"
    [ "$count" = "1" ]
}

@test "add_hook preserves existing user hooks" {
    cat > "$SETTINGS" <<'EOF'
{
  "hooks": {
    "SessionStart": [
      { "type": "command", "command": "bash ~/my-own-hook.sh" }
    ]
  }
}
EOF
    add_hook "$SETTINGS" "SessionStart" "bash ~/.claude/scripts/session-start.sh"
    local count
    count="$(jq '.hooks.SessionStart | length' "$SETTINGS")"
    [ "$count" = "2" ]
    jq -e '.hooks.SessionStart[] | select(.command == "bash ~/my-own-hook.sh")' "$SETTINGS"
    jq -e '.hooks.SessionStart[] | select(.command == "bash ~/.claude/scripts/session-start.sh")' "$SETTINGS"
}

@test "add_permission creates allow array if missing" {
    add_permission "$SETTINGS" "Edit(~/.claude/memory/**)"
    jq -e '.permissions.allow | index("Edit(~/.claude/memory/**)")' "$SETTINGS"
}

@test "add_permission dedupes" {
    add_permission "$SETTINGS" "Edit(~/.claude/memory/**)"
    add_permission "$SETTINGS" "Edit(~/.claude/memory/**)"
    local count
    count="$(jq '[.permissions.allow[] | select(. == "Edit(~/.claude/memory/**)")] | length' "$SETTINGS")"
    [ "$count" = "1" ]
}

@test "add_permission preserves user-added permissions" {
    cat > "$SETTINGS" <<'EOF'
{
  "permissions": {
    "allow": ["Bash(npm:*)"]
  }
}
EOF
    add_permission "$SETTINGS" "Edit(~/.claude/memory/**)"
    local len
    len="$(jq '.permissions.allow | length' "$SETTINGS")"
    [ "$len" = "2" ]
}

@test "remove_hook removes only the matching command" {
    add_hook "$SETTINGS" "SessionStart" "bash ~/own.sh"
    add_hook "$SETTINGS" "SessionStart" "bash ~/.claude/scripts/session-start.sh"
    remove_hook "$SETTINGS" "SessionStart" "bash ~/.claude/scripts/session-start.sh"
    local count
    count="$(jq '.hooks.SessionStart | length' "$SETTINGS")"
    [ "$count" = "1" ]
    jq -e '.hooks.SessionStart[0].command == "bash ~/own.sh"' "$SETTINGS"
}

@test "remove_permission removes only matching entry" {
    add_permission "$SETTINGS" "Bash(npm:*)"
    add_permission "$SETTINGS" "Edit(~/.claude/memory/**)"
    remove_permission "$SETTINGS" "Edit(~/.claude/memory/**)"
    local len
    len="$(jq '.permissions.allow | length' "$SETTINGS")"
    [ "$len" = "1" ]
    jq -e '.permissions.allow[0] == "Bash(npm:*)"' "$SETTINGS"
}

@test "remove_hook is a no-op on missing file" {
    run remove_hook "$SETTINGS" "SessionStart" "bash ~/whatever.sh"
    [ "$status" -eq 0 ]
}

@test "remove_permission is a no-op on missing file" {
    run remove_permission "$SETTINGS" "Edit(~/.claude/memory/**)"
    [ "$status" -eq 0 ]
}

@test "mindlint_permission_set emits 14 rules" {
    local count
    count="$(mindlint_permission_set | wc -l | tr -d ' ')"
    [ "$count" = "14" ]
}

@test "mindlint_permission_set contains key rules" {
    local set
    set="$(mindlint_permission_set)"
    echo "$set" | grep -q 'Edit(~/.claude/memory/\*\*)'
    echo "$set" | grep -q 'Write(~/.claude/memory/\*\*)'
    echo "$set" | grep -q 'Bash(git commit:\*)'
}
