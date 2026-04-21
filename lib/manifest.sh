#!/usr/bin/env bash
# Manifest reader. Maps source paths to (category, subtype, target).
# Source this file, then call category_for / target_for / for_each_cat1_per_file.
#
# $MANIFEST_PATH can be overridden by the caller (used in tests).

MANIFEST_PATH="${MANIFEST_PATH:-$(dirname "${BASH_SOURCE[0]}")/../manifest.conf}"

# Returns "<category>:<subtype>" on stdout and exits 0 on first match.
# Exits 1 if no manifest entry matches the given path.
category_for() {
    local path="$1"
    local glob cat sub _tgt
    while IFS='|' read -r glob cat sub _tgt; do
        [[ -z "$glob" || "$glob" =~ ^# ]] && continue
        # shellcheck disable=SC2053  # intentional unquoted glob match
        if [[ "$path" == $glob ]]; then
            echo "${cat}:${sub}"
            return 0
        fi
    done < "$MANIFEST_PATH"
    return 1
}

# Returns the target path (relative to ~/.claude/) for a category 2 or 3 source path.
# Exits 1 if no target is defined (category 1 entries have no target).
target_for() {
    local path="$1"
    local glob _cat _sub tgt
    while IFS='|' read -r glob _cat _sub tgt; do
        [[ -z "$glob" || "$glob" =~ ^# ]] && continue
        # shellcheck disable=SC2053
        if [[ "$path" == $glob ]]; then
            if [ -z "$tgt" ]; then
                return 1
            fi
            echo "$tgt"
            return 0
        fi
    done < "$MANIFEST_PATH"
    return 1
}

# Iterate every file that matches a category 1 per-file entry.
# Usage: for_each_cat1_per_file <source-root> <callback-function-name>
# The callback is invoked with the absolute path to each matching file.
for_each_cat1_per_file() {
    local source_dir="$1"
    local callback="$2"
    local glob cat sub _tgt
    while IFS='|' read -r glob cat sub _tgt; do
        [[ -z "$glob" || "$glob" =~ ^# ]] && continue
        [ "$cat" = "1" ] && [ "$sub" = "per-file" ] || continue
        local f
        # shellcheck disable=SC2086  # intentional glob expansion
        for f in "$source_dir"/$glob; do
            [ -e "$f" ] || continue
            "$callback" "$f"
        done
    done < "$MANIFEST_PATH"
}

# Iterate every manifest entry matching the given filters.
# Usage: for_each_manifest_entry <cat-filter> <sub-filter> <callback>
#   <cat-filter>: "1", "2", "3", or "" (any)
#   <sub-filter>: "per-file", "dir", "copy", "seed", "claude-md", or "" (any)
#   callback receives: glob cat sub tgt
for_each_manifest_entry() {
    local cat_filter="$1"
    local sub_filter="$2"
    local callback="$3"
    local glob cat sub tgt
    while IFS='|' read -r glob cat sub tgt; do
        [[ -z "$glob" || "$glob" =~ ^# ]] && continue
        if [ -n "$cat_filter" ] && [ "$cat" != "$cat_filter" ]; then continue; fi
        if [ -n "$sub_filter" ] && [ "$sub" != "$sub_filter" ]; then continue; fi
        "$callback" "$glob" "$cat" "$sub" "$tgt"
    done < "$MANIFEST_PATH"
}
