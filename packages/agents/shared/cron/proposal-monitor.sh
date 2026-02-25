#!/bin/bash
# Proposal Monitor — Check proposals needing approval or execution
# Invoked by cron, alerts via webhook on actionable items
set -euo pipefail

source /tmp/agent-env 2>/dev/null || true

AGENT="${AGENT_NAME:-unknown}"
WORKSPACE="${WORKSPACE_DIR:-/data/workspace}"
ALERT="/opt/scripts/alert.sh"
LOG_PREFIX="[proposal-monitor]"

echo "${LOG_PREFIX} Running proposal check for ${AGENT}..."

cd "${WORKSPACE}"

# Fetch active proposals
PROPOSALS=$(npx lobstr dao proposals --format json 2>/dev/null || echo "[]")

if [ "${PROPOSALS}" = "[]" ] || [ -z "${PROPOSALS}" ]; then
  echo "${LOG_PREFIX} No active spending proposals"
else
  TOTAL=$(echo "${PROPOSALS}" | jq 'length' 2>/dev/null || echo 0)
  echo "${LOG_PREFIX} Found ${TOTAL} spending proposal(s)"

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

  echo "${LOG_PREFIX} Spending proposals: ${TOTAL} total, ${VOTING_COUNT:-0} voting, ${EXEC_COUNT:-0} executable, ${EXPIRING_COUNT:-0} expiring"
fi

# ── Admin proposals (role grants, contract calls) ────────────────────
echo "${LOG_PREFIX} Checking admin proposals..."

ADMIN_PROPOSALS=$(npx lobstr dao admin-proposals --format json 2>/dev/null || echo "[]")

if [ "${ADMIN_PROPOSALS}" != "[]" ] && [ -n "${ADMIN_PROPOSALS}" ]; then
  ADMIN_TOTAL=$(echo "${ADMIN_PROPOSALS}" | jq 'length' 2>/dev/null || echo 0)

  # Pending admin proposals (need approval)
  ADMIN_PENDING=$(echo "${ADMIN_PROPOSALS}" | jq '[.[] | select(.status == "Pending")]' 2>/dev/null || echo "[]")
  ADMIN_PENDING_COUNT=$(echo "${ADMIN_PENDING}" | jq 'length' 2>/dev/null || echo 0)

  # Approved admin proposals (ready to execute after timelock)
  ADMIN_APPROVED=$(echo "${ADMIN_PROPOSALS}" | jq '[.[] | select(.status == "Approved")]' 2>/dev/null || echo "[]")
  ADMIN_APPROVED_COUNT=$(echo "${ADMIN_APPROVED}" | jq 'length' 2>/dev/null || echo 0)

  if [ "${ADMIN_PENDING_COUNT}" -gt 0 ]; then
    PENDING_IDS=$(echo "${ADMIN_PENDING}" | jq -r '[.[].id] | join(", ")' 2>/dev/null || echo "?")
    "${ALERT}" "warning" "${AGENT}" "${ADMIN_PENDING_COUNT} admin proposal(s) pending approval (IDs: ${PENDING_IDS}). Run: lobstr dao admin-proposals"
  fi

  if [ "${ADMIN_APPROVED_COUNT}" -gt 0 ]; then
    NOW=$(date +%s)
    EXECUTABLE_ADMIN=$(echo "${ADMIN_APPROVED}" | jq --argjson now "${NOW}" \
      '[.[] | select(.timelockEnd > 0 and .timelockEnd <= $now)]' 2>/dev/null || echo "[]")
    EXEC_ADMIN_COUNT=$(echo "${EXECUTABLE_ADMIN}" | jq 'length' 2>/dev/null || echo 0)

    if [ "${EXEC_ADMIN_COUNT}" -gt 0 ]; then
      EXEC_IDS=$(echo "${EXECUTABLE_ADMIN}" | jq -r '[.[].id] | join(", ")' 2>/dev/null || echo "?")
      "${ALERT}" "info" "${AGENT}" "${EXEC_ADMIN_COUNT} admin proposal(s) ready for execution (IDs: ${EXEC_IDS}). Run: lobstr dao admin-execute <id>"
    fi
  fi

  echo "${LOG_PREFIX} Admin proposals: ${ADMIN_TOTAL} total, ${ADMIN_PENDING_COUNT} pending, ${ADMIN_APPROVED_COUNT} approved"
else
  echo "${LOG_PREFIX} No admin proposals"
fi

echo "${LOG_PREFIX} Check complete"
