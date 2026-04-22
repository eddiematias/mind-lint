#!/usr/bin/env bash
# Filesystem primitives. Each function is pure with respect to its documented effect.
# Source this file, then call the functions.

# Guard against re-sourcing.
[ -n "${FS_SH_LOADED+x}" ] && return 0
readonly FS_SH_LOADED=1

# Return 0 iff $1 is a symlink resolving (readlink, not -e) to exactly $2.
is_symlink_to() {
    local link="$1"
    local expected="$2"
    [ -L "$link" ] || return 1
    local actual
    actual="$(readlink "$link")"
    [ "$actual" = "$expected" ]
}

# Return 0 iff $1 is a symlink whose target is inside $2 (the source root).
is_our_symlink() {
    local link="$1"
    local source_root="$2"
    [ -L "$link" ] || return 1
    local target
    target="$(readlink "$link")"
    # Match either the exact root or a path below it.
    [[ "$target" == "$source_root"/* || "$target" == "$source_root" ]]
}

# Create a symlink at $2 pointing to $1. Creates parent dirs.
# Idempotent: no-op if $2 already links to $1.
# Returns 2 if $2 exists and is anything else (caller resolves).
safe_symlink() {
    local source="$1"
    local dest="$2"
    mkdir -p "$(dirname "$dest")"
    if [ -e "$dest" ] || [ -L "$dest" ]; then
        if is_symlink_to "$dest" "$source"; then
            return 0
        fi
        return 2
    fi
    ln -s "$source" "$dest"
}

# Copy $1 to $2 only if $2 doesn't exist. Creates parent dirs.
# Returns non-zero if $2 exists (non-destructive).
safe_copy() {
    local source="$1"
    local dest="$2"
    if [ -e "$dest" ]; then
        return 2
    fi
    mkdir -p "$(dirname "$dest")"
    cp "$source" "$dest"
}

# SHA-256 hash of a file's contents.
hash_file() {
    shasum -a 256 "$1" | cut -d' ' -f1
}

# Expand a leading ~ to $HOME. Paths without ~ are returned unchanged.
expand_tilde() {
    local path="$1"
    echo "${path/#\~/$HOME}"
}
