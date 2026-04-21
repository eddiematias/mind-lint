#!/usr/bin/env bash
# JSON merge helpers for ~/.claude/settings.json. Requires jq.
# Source this file, then call add_hook / remove_hook / add_permission / remove_permission.

[ -n "${SETTINGS_SH_LOADED+x}" ] && return 0
readonly SETTINGS_SH_LOADED=1

_ensure_settings() {
    local file="$1"
    if [ ! -f "$file" ]; then
        mkdir -p "$(dirname "$file")"
        echo '{}' > "$file"
    fi
}

# add_hook <file> <event> <command>
# Adds a hook entry, deduped by command string.
add_hook() {
    local file="$1"
    local event="$2"
    local command="$3"
    _ensure_settings "$file"
    local tmp
    tmp="$(mktemp)"
    jq --arg event "$event" --arg cmd "$command" '
        .hooks //= {} |
        .hooks[$event] //= [] |
        if ([.hooks[$event][] | select(.command == $cmd)] | length) > 0
        then .
        else .hooks[$event] += [{type: "command", command: $cmd}]
        end
    ' "$file" > "$tmp" && mv "$tmp" "$file"
}

# remove_hook <file> <event> <command>
remove_hook() {
    local file="$1"
    local event="$2"
    local command="$3"
    [ -f "$file" ] || return 0
    local tmp
    tmp="$(mktemp)"
    jq --arg event "$event" --arg cmd "$command" '
        if .hooks[$event] then
            .hooks[$event] |= map(select(.command != $cmd))
        else . end
    ' "$file" > "$tmp" && mv "$tmp" "$file"
}

# add_permission <file> <rule>
add_permission() {
    local file="$1"
    local rule="$2"
    _ensure_settings "$file"
    local tmp
    tmp="$(mktemp)"
    jq --arg rule "$rule" '
        .permissions //= {} |
        .permissions.allow //= [] |
        if (.permissions.allow | index($rule)) == null
        then .permissions.allow += [$rule]
        else . end
    ' "$file" > "$tmp" && mv "$tmp" "$file"
}

# remove_permission <file> <rule>
remove_permission() {
    local file="$1"
    local rule="$2"
    [ -f "$file" ] || return 0
    local tmp
    tmp="$(mktemp)"
    jq --arg rule "$rule" '
        if .permissions.allow then
            .permissions.allow |= map(select(. != $rule))
        else . end
    ' "$file" > "$tmp" && mv "$tmp" "$file"
}

# The canonical Mind-Lint permission set. One rule per line.
mindlint_permission_set() {
    cat <<'EOF'
Edit(~/.claude/memory/**)
Write(~/.claude/memory/**)
Edit(~/.claude/wiki/**)
Write(~/.claude/wiki/**)
Edit(~/.claude/raw/**)
Write(~/.claude/raw/**)
Edit(~/.claude/content/**)
Write(~/.claude/content/**)
Edit(~/.claude/rules/preferences.md)
Edit(~/.claude/rules/error-rules.md)
Edit(~/.claude/context/active-projects.md)
Bash(git add:*)
Bash(git commit:*)
Bash(git push:*)
EOF
}
