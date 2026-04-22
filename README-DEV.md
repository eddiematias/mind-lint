# Development

## Running tests locally

    brew install bats-core shellcheck jq   # macOS
    # or: sudo apt-get install -y bats shellcheck jq   # Linux

    # Lint
    find . -name '*.sh' -not -path './tests/*' | xargs shellcheck

    # Test
    bats tests/

Tests run against an isolated `$HOME` created in a temp dir. They never touch your real `~/.claude/`.
