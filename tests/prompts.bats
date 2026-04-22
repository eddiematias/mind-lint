#!/usr/bin/env bats

bats_require_minimum_version 1.5.0

load 'helpers'

setup() {
    # shellcheck source=/dev/null
    source "$BATS_TEST_DIRNAME/../lib/prompts.sh"
}

@test "prompt_yn returns 1 on empty input when default is n" {
    run bash -c 'source lib/prompts.sh; echo "" | prompt_yn "test?" n'
    [ "$status" -eq 1 ]
}

@test "prompt_yn returns 0 on empty input when default is y" {
    run bash -c 'source lib/prompts.sh; echo "" | prompt_yn "test?" y'
    [ "$status" -eq 0 ]
}

@test "prompt_yn returns 0 on y" {
    run bash -c 'source lib/prompts.sh; echo "y" | prompt_yn "test?" n'
    [ "$status" -eq 0 ]
}

@test "prompt_yn returns 0 on Y" {
    run bash -c 'source lib/prompts.sh; echo "Y" | prompt_yn "test?" n'
    [ "$status" -eq 0 ]
}

@test "prompt_yn returns 1 on n" {
    run bash -c 'source lib/prompts.sh; echo "n" | prompt_yn "test?" y'
    [ "$status" -eq 1 ]
}

@test "prompt_menu returns selected letter on stdout" {
    run --separate-stderr bash -c 'source lib/prompts.sh; echo "r" | prompt_menu "pick" "d r s o"'
    [ "$status" -eq 0 ]
    [ "$output" = "r" ]
}

@test "prompt_menu re-prompts on invalid choice then returns valid letter" {
    run --separate-stderr bash -c 'source lib/prompts.sh; printf "x\nd\n" | prompt_menu "pick" "d r s o"'
    [ "$status" -eq 0 ]
    [ "$output" = "d" ]
}

@test "prompt_read returns entered string" {
    run --separate-stderr bash -c 'source lib/prompts.sh; echo "Eddie" | prompt_read "Your name"'
    [ "$output" = "Eddie" ]
}

@test "prompt_read returns default when input is empty" {
    run --separate-stderr bash -c 'source lib/prompts.sh; echo "" | prompt_read "Your name" "Anon"'
    [ "$output" = "Anon" ]
}

@test "prompt_read returns empty when input and default are empty" {
    run --separate-stderr bash -c 'source lib/prompts.sh; echo "" | prompt_read "Your name"'
    [ "$output" = "" ]
}
