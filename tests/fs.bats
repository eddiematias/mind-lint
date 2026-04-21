#!/usr/bin/env bats

load 'helpers'

setup() {
    make_fake_home
    # shellcheck source=/dev/null
    source "$BATS_TEST_DIRNAME/../lib/fs.sh"
}

@test "is_symlink_to returns 0 when link points to target" {
    touch "$FAKE_HOME/target"
    ln -s "$FAKE_HOME/target" "$FAKE_HOME/link"
    run is_symlink_to "$FAKE_HOME/link" "$FAKE_HOME/target"
    [ "$status" -eq 0 ]
}

@test "is_symlink_to returns 1 when link points elsewhere" {
    touch "$FAKE_HOME/target" "$FAKE_HOME/other"
    ln -s "$FAKE_HOME/other" "$FAKE_HOME/link"
    run is_symlink_to "$FAKE_HOME/link" "$FAKE_HOME/target"
    [ "$status" -eq 1 ]
}

@test "is_symlink_to returns 1 when link doesn't exist" {
    run is_symlink_to "$FAKE_HOME/nope" "$FAKE_HOME/target"
    [ "$status" -eq 1 ]
}

@test "is_symlink_to returns 1 when path is regular file" {
    touch "$FAKE_HOME/reg"
    run is_symlink_to "$FAKE_HOME/reg" "$FAKE_HOME/target"
    [ "$status" -eq 1 ]
}

@test "safe_symlink creates missing parent dirs" {
    touch "$FAKE_HOME/source"
    safe_symlink "$FAKE_HOME/source" "$FAKE_HOME/a/b/c/link"
    [ -L "$FAKE_HOME/a/b/c/link" ]
}

@test "safe_symlink returns 2 when target exists and is not our symlink" {
    touch "$FAKE_HOME/source" "$FAKE_HOME/existing"
    run safe_symlink "$FAKE_HOME/source" "$FAKE_HOME/existing"
    [ "$status" -eq 2 ]
}

@test "safe_symlink returns 0 (idempotent) if target already links to source" {
    touch "$FAKE_HOME/source"
    ln -s "$FAKE_HOME/source" "$FAKE_HOME/link"
    run safe_symlink "$FAKE_HOME/source" "$FAKE_HOME/link"
    [ "$status" -eq 0 ]
}

@test "safe_copy creates parent dirs and copies file" {
    echo "hello" > "$FAKE_HOME/source.md"
    safe_copy "$FAKE_HOME/source.md" "$FAKE_HOME/a/b/dest.md"
    [ -f "$FAKE_HOME/a/b/dest.md" ]
    [ "$(cat "$FAKE_HOME/a/b/dest.md")" = "hello" ]
}

@test "safe_copy returns non-zero when target exists" {
    echo "new" > "$FAKE_HOME/source.md"
    echo "old" > "$FAKE_HOME/dest.md"
    run safe_copy "$FAKE_HOME/source.md" "$FAKE_HOME/dest.md"
    [ "$status" -ne 0 ]
    [ "$(cat "$FAKE_HOME/dest.md")" = "old" ]
}

@test "hash_file produces identical hashes for identical content" {
    echo "abc" > "$FAKE_HOME/a"
    echo "abc" > "$FAKE_HOME/b"
    [ "$(hash_file "$FAKE_HOME/a")" = "$(hash_file "$FAKE_HOME/b")" ]
}

@test "hash_file produces different hashes for different content" {
    echo "abc" > "$FAKE_HOME/a"
    echo "xyz" > "$FAKE_HOME/b"
    [ "$(hash_file "$FAKE_HOME/a")" != "$(hash_file "$FAKE_HOME/b")" ]
}

@test "is_our_symlink returns 0 for symlink into source_root" {
    mkdir "$FAKE_HOME/src"
    touch "$FAKE_HOME/src/f"
    ln -s "$FAKE_HOME/src/f" "$FAKE_HOME/link"
    run is_our_symlink "$FAKE_HOME/link" "$FAKE_HOME/src"
    [ "$status" -eq 0 ]
}

@test "is_our_symlink returns 1 for symlink pointing elsewhere" {
    mkdir "$FAKE_HOME/src" "$FAKE_HOME/other"
    touch "$FAKE_HOME/other/f"
    ln -s "$FAKE_HOME/other/f" "$FAKE_HOME/link"
    run is_our_symlink "$FAKE_HOME/link" "$FAKE_HOME/src"
    [ "$status" -eq 1 ]
}

@test "expand_tilde expands ~ to \$HOME" {
    run expand_tilde "~/foo/bar"
    [ "$output" = "$HOME/foo/bar" ]
}

@test "expand_tilde leaves paths without ~ unchanged" {
    run expand_tilde "/absolute/path"
    [ "$output" = "/absolute/path" ]
}
