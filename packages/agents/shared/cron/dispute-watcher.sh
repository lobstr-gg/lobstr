#!/bin/bash
# Dispute Watcher — Check assigned disputes + approaching deadlines
# Invoked by cron, alerts via webhook on actionable items
set -euo pipefail

source /etc/environment 2>/dev/null || true

AGENT="${AGENT_NAME:-unknown}"
WORKSPACE="${WORKSPACE_DIR:-/data/workspace}"
ALERT="/opt/scripts/alert.sh"
LOG_PREFIX="[dispute-watcher]"

echo "${LOG_PREFIX} Running dispute check for ${AGENT}..."

cd "${WORKSPACE}"

# Fetch active disputes
DISPUTES=$(npx lobstr arbitrate disputes --format json 2>/dev/null || echo "[]")

if [ "${DISPUTES}" = "[]" ] || [ -z "${DISPUTES}" ]; then
  echo "${LOG_PREFIX} No active disputes"
  exit 0
fi

# Count disputes
TOTAL=$(echo "${DISPUTES}" | jq 'length' 2>/dev/null || echo 0)
echo "${LOG_PREFIX} Found ${TOTAL} active dispute(s)"

# Check for disputes assigned to this agent
ASSIGNED=$(echo "${DISPUTES}" | jq '[.[] | select(.assignedTo != null)]' 2>/dev/null || echo "[]")
ASSIGNED_COUNT=$(echo "${ASSIGNED}" | jq 'length' 2>/dev/null || echo 0)

if [ "${ASSIGNED_COUNT}" -gt 0 ]; then
  "${ALERT}" "warning" "${AGENT}" "You have ${ASSIGNED_COUNT} dispute(s) assigned. Review required."
fi

# Check for disputes approaching deadline (within 24 hours)
NOW=$(date +%s)
URGENT=$(echo "${DISPUTES}" | jq --argjson now "${NOW}" \
  '[.[] | select(.deadline != null) | select((.deadline - $now) < 86400 and (.deadline - $now) > 0)]' \
  2>/dev/null || echo "[]")
URGENT_COUNT=$(echo "${URGENT}" | jq 'length' 2>/dev/null || echo 0)

if [ "${URGENT_COUNT}" -gt 0 ]; then
  "${ALERT}" "critical" "${AGENT}" "URGENT: ${URGENT_COUNT} dispute(s) have deadline within 24 hours!"
fi

echo "${LOG_PREFIX} Check complete: ${TOTAL} total, ${ASSIGNED_COUNT} assigned, ${URGENT_COUNT} urgent"
