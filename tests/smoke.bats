#!/usr/bin/env bats

load 'helpers'

setup() {
    make_fake_home
}

@test "fake home is isolated" {
    [ -d "$FAKE_HOME/.claude" ]
    [ "$HOME" = "$FAKE_HOME" ]
}

@test "stage_source_repo copies the repo under test" {
    stage_source_repo
    [ -f "$FAKE_HOME/mindlint/setup.sh" ]
    [ ! -d "$FAKE_HOME/mindlint/.git" ]
}

@test "assert_symlink detects correct symlink" {
    touch "$FAKE_HOME/source.txt"
    ln -s "$FAKE_HOME/source.txt" "$FAKE_HOME/link.txt"
    assert_symlink "$FAKE_HOME/link.txt" "$FAKE_HOME/source.txt"
}

@test "assert_symlink fails on missing link" {
    run assert_symlink "$FAKE_HOME/nope.txt" "$FAKE_HOME/source.txt"
    [ "$status" -ne 0 ]
}
