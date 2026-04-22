#!/usr/bin/env bats

load 'helpers'

setup() {
    make_fake_home
    stage_source_repo
}

@test "dangling symlink cleanup: upstream removed a command, symlink detected" {
    run_setup --non-interactive --skip-wizard
    # Simulate upstream removing a command. The symlink now points to a missing file.
    rm "$FAKE_HOME/mindlint/commands/lint.md"
    # In non-interactive mode, cleanup is skipped with a warning; the symlink survives as dangling.
    # Re-run install: no crash, and the dangling link is flagged but not removed.
    run run_setup --non-interactive --skip-wizard
    [ "$status" -eq 0 ]
    # The symlink is still there but broken (readlink -e fails)
    [ -L "$FAKE_HOME/.claude/commands/lint.md" ]
    [ ! -e "$FAKE_HOME/.claude/commands/lint.md" ]
}

@test "dangling symlink cleanup interactive: user says yes" {
    run_setup --non-interactive --skip-wizard
    rm "$FAKE_HOME/mindlint/commands/lint.md"
    # Pipe 'y' to answer the cleanup prompt. The wizard would also prompt, so skip that.
    run bash -c "echo 'y' | bash '$FAKE_HOME/mindlint/setup.sh' --skip-wizard"
    [ "$status" -eq 0 ]
    # After interactive cleanup the dangling symlink is gone
    [ ! -L "$FAKE_HOME/.claude/commands/lint.md" ]
}

@test "--relink: repair broken symlinks after source repo moves" {
    run_setup --non-interactive --skip-wizard
    # Move the source to a new location
    mv "$FAKE_HOME/mindlint" "$FAKE_HOME/newlocation"
    # Old symlinks now broken (point to ~/mindlint/...)
    [ ! -e "$FAKE_HOME/.claude/commands/lint.md" ]
    # --relink from the new location rebuilds
    run bash "$FAKE_HOME/newlocation/setup.sh" --relink --non-interactive --skip-wizard
    [ "$status" -eq 0 ]
    [ -L "$FAKE_HOME/.claude/commands/lint.md" ]
    [ -e "$FAKE_HOME/.claude/commands/lint.md" ]
    [ "$(readlink "$FAKE_HOME/.claude/commands/lint.md")" = "$FAKE_HOME/newlocation/commands/lint.md" ]
}

@test "lockfile prevents concurrent runs" {
    # Pre-create a stale lockfile
    mkdir -p "$FAKE_HOME/.claude/.mindlint"
    touch "$FAKE_HOME/.claude/.mindlint/install.lock"
    run run_setup --non-interactive --skip-wizard
    [ "$status" -ne 0 ]
    # Error message should hint at a stale lock
    [[ "$output" == *"already running"* || "$output" == *"lock"* ]]
}

@test "lockfile is removed on successful exit" {
    run_setup --non-interactive --skip-wizard
    [ ! -f "$FAKE_HOME/.claude/.mindlint/install.lock" ]
}

@test "directory-overwrite (o) creates timestamped backup before rm -rf" {
    # Pre-populate a user directory at templates/ so install hits a dir collision
    mkdir -p "$FAKE_HOME/.claude/templates"
    echo "# user template" > "$FAKE_HOME/.claude/templates/my-own.md"
    # Interactive answer: 'o' (overwrite). Need a 'y' afterward for any subsequent prompts.
    # But --skip-wizard suppresses those. The dir-collision prompt is in install.sh:
    # prompt_menu "  [l]ist / [r]ename yours to .user/ / [s]kip / [o]verwrite" "l r s o"
    run bash -c "echo 'o' | bash '$FAKE_HOME/mindlint/setup.sh' --skip-wizard"
    [ "$status" -eq 0 ]
    # Our symlink is in place
    [ -L "$FAKE_HOME/.claude/templates" ]
    # A backup was created: ~/.claude/templates.backup-* contains the old content
    local backup_count
    backup_count="$(find "$FAKE_HOME/.claude" -maxdepth 1 -type d -name 'templates.backup-*' | wc -l | tr -d ' ')"
    [ "$backup_count" -eq 1 ]
    # Backup contains the user's file
    local backup
    backup="$(find "$FAKE_HOME/.claude" -maxdepth 1 -type d -name 'templates.backup-*' | head -1)"
    [ -f "$backup/my-own.md" ]
}
