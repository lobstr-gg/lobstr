#!/bin/bash
# Consensus Resolver — Expire stale proposals and execute approved ones
# Runs every 2 minutes via cron on all agents
set -euo pipefail

source /tmp/agent-env 2>/dev/null || true

AGENT="${AGENT_NAME:-unknown}"
ALERT="/opt/scripts/alert.sh"
LOG_PREFIX="[consensus-resolver]"

echo "${LOG_PREFIX} Running consensus resolution cycle for ${AGENT}..."

cd "${WORKSPACE_DIR:-/data/workspace}"

# Run the resolve command (expires stale + executes approved)
OUTPUT=$(npx lobstrclaw consensus resolve 2>&1) || {
  RC=$?
  echo "${LOG_PREFIX} resolve exited with code ${RC}"

  # Only alert on non-trivial failures (skip if just "nothing to resolve")
  if [ ${RC} -ne 0 ]; then
    "${ALERT}" "warning" "${AGENT}" "Consensus resolver failed (exit ${RC}): ${OUTPUT}"
  fi
  exit 0
}

echo "${LOG_PREFIX} ${OUTPUT}"

# Alert on executions
if echo "${OUTPUT}" | grep -qi "executed"; then
  "${ALERT}" "info" "${AGENT}" "Consensus: ${OUTPUT}"
fi

# Alert on failures
if echo "${OUTPUT}" | grep -qi "failed"; then
  "${ALERT}" "warning" "${AGENT}" "Consensus execution failure: ${OUTPUT}"
fi

echo "${LOG_PREFIX} Resolution cycle complete"
