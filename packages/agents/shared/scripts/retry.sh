#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# retry.sh — Retry wrapper for CLI commands with exponential backoff
# ═══════════════════════════════════════════════════════════════════
# Usage: source /opt/scripts/retry.sh
#        retry_cli "lobstr wallet balance"
#        retry_cli "lobstr dao streams" 5   # custom max retries
#
# Returns: command output on success, "RETRY_FAILED" on all retries exhausted
# Exit code: 0 on success, 1 on failure

retry_cli() {
  local CMD="$1"
  local MAX_RETRIES="${2:-3}"
  local ATTEMPT=1
  local OUTPUT=""

  while [ "${ATTEMPT}" -le "${MAX_RETRIES}" ]; do
    OUTPUT=$(eval "${CMD}" 2>&1) && {
      # Check for common error patterns in output even on exit 0
      if echo "${OUTPUT}" | grep -qi "connection refused\|timeout\|ECONNRESET\|rate limit\|503\|502"; then
        echo "[retry] Attempt ${ATTEMPT}/${MAX_RETRIES}: soft error in output, retrying..." >&2
      else
        echo "${OUTPUT}"
        return 0
      fi
    }

    if [ "${ATTEMPT}" -lt "${MAX_RETRIES}" ]; then
      local BACKOFF=$(( ATTEMPT * 3 ))
      echo "[retry] Attempt ${ATTEMPT}/${MAX_RETRIES} failed, retrying in ${BACKOFF}s..." >&2
      sleep "${BACKOFF}"
    fi

    ATTEMPT=$(( ATTEMPT + 1 ))
  done

  echo "[retry] All ${MAX_RETRIES} attempts failed for: ${CMD}" >&2
  echo "RETRY_FAILED"
  return 1
}
