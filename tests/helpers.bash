#!/usr/bin/env bash
# Shared test helpers. Source from every .bats file via: load 'helpers'

# Create an isolated fake $HOME for a test. Sets FAKE_HOME and HOME.
# Returns 0 on success. The directory is auto-removed by teardown().
make_fake_home() {
    FAKE_HOME="$(mktemp -d -t mindlint-test-XXXXXX)"
    export FAKE_HOME
    export HOME="$FAKE_HOME"
    export ORIGINAL_HOME_BACKUP="${HOME_BEFORE_TEST:-}"
    mkdir -p "$FAKE_HOME/.claude"
}

# Copy the repo under test into the fake home as ~/mindlint/
stage_source_repo() {
    cp -R "$BATS_TEST_DIRNAME/.." "$FAKE_HOME/mindlint-staging"
    rm -rf "$FAKE_HOME/mindlint-staging/.git" "$FAKE_HOME/mindlint-staging/tests"
    mv "$FAKE_HOME/mindlint-staging" "$FAKE_HOME/mindlint"
}

# Run setup.sh from the staged source with the given args.
run_setup() {
    bash "$FAKE_HOME/mindlint/setup.sh" "$@"
}

# Assert that $1 is a symlink pointing to $2.
assert_symlink() {
    local link="$1"
    local expected_target="$2"
    [ -L "$link" ] || {
        echo "not a symlink: $link" >&2
        return 1
    }
    local actual_target
    actual_target="$(readlink "$link")"
    [ "$actual_target" = "$expected_target" ] || {
        echo "symlink target mismatch: $link -> $actual_target (expected $expected_target)" >&2
        return 1
    }
}

# Assert that $1 is a regular file (not a symlink) with content matching $2.
assert_file_contents() {
    local file="$1"
    local expected="$2"
    [ -f "$file" ] && [ ! -L "$file" ] || {
        echo "not a regular file: $file" >&2
        return 1
    }
    local actual
    actual="$(cat "$file")"
    [ "$actual" = "$expected" ] || {
        echo "content mismatch in $file" >&2
        diff <(echo "$actual") <(echo "$expected") >&2
        return 1
    }
}

# Hash a file for equality comparison.
hash_file() {
    shasum -a 256 "$1" | cut -d' ' -f1
}

# Default teardown removes the fake home.
teardown() {
    if [ -n "${FAKE_HOME:-}" ] && [ -d "$FAKE_HOME" ]; then
        rm -rf "$FAKE_HOME"
    fi
}
