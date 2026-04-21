#!/usr/bin/env bash
# Colored logging helpers. All output goes to stderr so stdout stays clean for data.
# Source this file, then call log_info / log_warn / log_err / log_done / log_step / log_dim.
#
# Colors are emitted only when stderr is a TTY; pipes and CI get plain text.

if [ -t 2 ]; then
    readonly LOG_RESET=$'\033[0m'
    readonly LOG_BOLD=$'\033[1m'
    readonly LOG_DIM=$'\033[2m'
    readonly LOG_RED=$'\033[0;31m'
    readonly LOG_YELLOW=$'\033[0;33m'
    readonly LOG_GREEN=$'\033[0;32m'
    readonly LOG_CYAN=$'\033[0;36m'
else
    readonly LOG_RESET=""
    readonly LOG_BOLD=""
    readonly LOG_DIM=""
    readonly LOG_RED=""
    readonly LOG_YELLOW=""
    readonly LOG_GREEN=""
    readonly LOG_CYAN=""
fi

log_info() { echo "${LOG_CYAN}[INFO]${LOG_RESET} $*" >&2; }
log_warn() { echo "${LOG_YELLOW}[WARN]${LOG_RESET} $*" >&2; }
log_err()  { echo "${LOG_RED}[ERR]${LOG_RESET} $*" >&2; }
log_done() { echo "${LOG_GREEN}[OK]${LOG_RESET} $*" >&2; }
log_step() {
    echo "" >&2
    echo "${LOG_BOLD}━━ $* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${LOG_RESET}" >&2
    echo "" >&2
}
log_dim() { echo "${LOG_DIM}$*${LOG_RESET}" >&2; }
