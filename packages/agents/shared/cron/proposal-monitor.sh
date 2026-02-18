#!/bin/bash
# Proposal Monitor — Check proposals needing approval or execution
# Invoked by cron, alerts via webhook on actionable items
set -euo pipefail

source /etc/environment 2>/dev/null || true

AGENT="${AGENT_NAME:-unknown}"
WORKSPACE="${WORKSPACE_DIR:-/data/workspace}"
ALERT="/opt/scripts/alert.sh"
LOG_PREFIX="[proposal-monitor]"

echo "${LOG_PREFIX} Running proposal check for ${AGENT}..."

cd "${WORKSPACE}"

# Fetch active proposals
PROPOSALS=$(npx lobstr dao proposals --format json 2>/dev/null || echo "[]")

if [ "${PROPOSALS}" = "[]" ] || [ -z "${PROPOSALS}" ]; then
  echo "${LOG_PREFIX} No active proposals"
  exit 0
fi

TOTAL=$(echo "${PROPOSALS}" | jq 'length' 2>/dev/null || echo 0)
echo "${LOG_PREFIX} Found ${TOTAL} active proposal(s)"

# Check for proposals in voting period (need this agent's vote)
VOTING=$(echo "${PROPOSALS}" | jq '[.[] | select(.state == "Active")]' 2>/dev/null || echo "[]")
VOTING_COUNT=$(echo "${VOTING}" | jq 'length' 2>/dev/null || echo 0)

if [ "${VOTING_COUNT}" -gt 0 ]; then
  "${ALERT}" "warning" "${AGENT}" "${VOTING_COUNT} proposal(s) in voting period — review and vote."
fi

# Check for proposals ready to execute (past timelock)
EXECUTABLE=$(echo "${PROPOSALS}" | jq '[.[] | select(.state == "Queued" or .state == "Ready")]' 2>/dev/null || echo "[]")
EXEC_COUNT=$(echo "${EXECUTABLE}" | jq 'length' 2>/dev/null || echo 0)

if [ "${EXEC_COUNT}" -gt 0 ]; then
  "${ALERT}" "info" "${AGENT}" "${EXEC_COUNT} proposal(s) ready for execution."
fi

# Check for proposals expiring soon (within 12 hours)
NOW=$(date +%s)
EXPIRING=$(echo "${PROPOSALS}" | jq --argjson now "${NOW}" \
  '[.[] | select(.state == "Active") | select(.voteEnd != null) | select((.voteEnd - $now) < 43200 and (.voteEnd - $now) > 0)]' \
  2>/dev/null || echo "[]")
EXPIRING_COUNT=$(echo "${EXPIRING}" | jq 'length' 2>/dev/null || echo 0)

if [ "${EXPIRING_COUNT}" -gt 0 ]; then
  "${ALERT}" "critical" "${AGENT}" "URGENT: ${EXPIRING_COUNT} proposal(s) expiring within 12 hours!"
fi

echo "${LOG_PREFIX} Check complete: ${TOTAL} total, ${VOTING_COUNT} voting, ${EXEC_COUNT} executable, ${EXPIRING_COUNT} expiring"
