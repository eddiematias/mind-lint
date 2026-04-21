#!/usr/bin/env bats

load 'helpers'

setup() {
    # shellcheck source=/dev/null
    source "$BATS_TEST_DIRNAME/../lib/logging.sh"
}

@test "log_info writes to stderr with [INFO] prefix" {
    run log_info "hello"
    [ "$status" -eq 0 ]
    [[ "$output" =~ \[INFO\].*hello ]]
}

@test "log_warn writes to stderr with [WARN] prefix" {
    run log_warn "careful"
    [ "$status" -eq 0 ]
    [[ "$output" =~ \[WARN\].*careful ]]
}

@test "log_err writes to stderr with [ERR] prefix" {
    run log_err "bad"
    [ "$status" -eq 0 ]
    [[ "$output" =~ \[ERR\].*bad ]]
}

@test "log_done writes with [OK] prefix" {
    run log_done "finished"
    [ "$status" -eq 0 ]
    [[ "$output" =~ \[OK\].*finished ]]
}

@test "log_step writes a section header" {
    run log_step "Step 1"
    [ "$status" -eq 0 ]
    [[ "$output" =~ Step\ 1 ]]
}

@test "log_dim writes dimmed text" {
    run log_dim "hint"
    [ "$status" -eq 0 ]
    [[ "$output" =~ hint ]]
}

@test "all log functions write to stderr not stdout" {
    # Capture stdout separately: stderr must contain output, stdout must be empty
    local out
    out="$(log_info 'to stderr' 2>/dev/null)"
    [ -z "$out" ]
    out="$(log_warn 'to stderr' 2>/dev/null)"
    [ -z "$out" ]
    out="$(log_err 'to stderr' 2>/dev/null)"
    [ -z "$out" ]
    out="$(log_done 'to stderr' 2>/dev/null)"
    [ -z "$out" ]
}
