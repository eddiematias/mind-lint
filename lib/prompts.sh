#!/usr/bin/env bash
# Interactive prompts. All prompts read from stdin so tests can pipe answers.
# Source this file, then call prompt_yn / prompt_menu / prompt_read.

[ -n "${PROMPTS_SH_LOADED+x}" ] && return 0
readonly PROMPTS_SH_LOADED=1

# prompt_yn "question" <default: y|n>
# Prints question + hint to stderr, reads answer from stdin.
# Returns 0 for yes, 1 for no. Empty input uses the default.
prompt_yn() {
    local question="$1"
    local default="${2:-n}"
    local answer
    local hint
    if [ "$default" = "y" ]; then
        hint="(Y/n)"
    else
        hint="(y/N)"
    fi
    printf "%s %s: " "$question" "$hint" >&2
    read -r answer
    answer="${answer:-$default}"
    case "$answer" in
        y|Y) return 0 ;;
        *)   return 1 ;;
    esac
}

# prompt_menu "question" "letter1 letter2 letter3"
# Reads a single letter. Loops until a valid letter is given.
# Prints the chosen letter to stdout; prompts go to stderr.
prompt_menu() {
    local question="$1"
    local valid_letters="$2"
    local answer
    while true; do
        printf "%s [%s]: " "$question" "$(echo "$valid_letters" | tr ' ' '/')" >&2
        read -r answer
        for letter in $valid_letters; do
            if [ "$answer" = "$letter" ]; then
                echo "$letter"
                return 0
            fi
        done
        echo "Invalid choice. Pick one of: $valid_letters" >&2
    done
}

# prompt_read "question" [default]
# Reads a free-form string. If empty and default given, returns default.
# Prints answer on stdout; prompts go to stderr.
prompt_read() {
    local question="$1"
    local default="${2:-}"
    local answer
    if [ -n "$default" ]; then
        printf "%s (default: %s): " "$question" "$default" >&2
    else
        printf "%s: " "$question" >&2
    fi
    read -r answer
    echo "${answer:-$default}"
}
