#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# Cron Lock — flock wrapper to prevent duplicate cron runs
# ═══════════════════════════════════════════════════════════════════
# Usage: cron-lock.sh <job_name> <timeout_sec> <command> [args...]
#
# - flock -n: non-blocking exclusive lock — skips if previous run is still going
# - timeout: kills stuck jobs after N seconds, fires alert
# - Lock files on /tmp (tmpfs) — vanish on restart, no stale locks
# ═══════════════════════════════════════════════════════════════════

JOB_NAME="${1:?Usage: cron-lock.sh <job_name> <timeout_sec> <command> [args...]}"
TIMEOUT_SEC="${2:?Usage: cron-lock.sh <job_name> <timeout_sec> <command> [args...]}"
shift 2

LOCK_FILE="/tmp/cron-${JOB_NAME}.lock"
ALERT="/opt/scripts/alert.sh"
AGENT="${AGENT_NAME:-unknown}"

# Try to acquire lock (non-blocking)
exec 200>"${LOCK_FILE}"
if ! flock -n 200; then
  echo "[cron-lock] ${JOB_NAME}: previous run still active, skipping"
  exit 0
fi

# Run the command with a timeout
if ! timeout "${TIMEOUT_SEC}" "$@"; then
  EXIT_CODE=$?
  if [ "${EXIT_CODE}" -eq 124 ]; then
    echo "[cron-lock] ${JOB_NAME}: KILLED after ${TIMEOUT_SEC}s timeout" >&2
    "${ALERT}" "warning" "${AGENT}" "Cron job '${JOB_NAME}' killed after ${TIMEOUT_SEC}s timeout"
  else
    echo "[cron-lock] ${JOB_NAME}: exited with code ${EXIT_CODE}" >&2
  fi
fi
