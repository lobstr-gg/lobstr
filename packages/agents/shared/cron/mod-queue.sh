#!/bin/bash
# Mod Queue — Check pending sybil reports needing review
# Invoked by cron, alerts via webhook on actionable items
set -euo pipefail

source /tmp/agent-env 2>/dev/null || true

AGENT="${AGENT_NAME:-unknown}"
WORKSPACE="${WORKSPACE_DIR:-/data/workspace}"
ALERT="/opt/scripts/alert.sh"
LOG_PREFIX="[mod-queue]"

echo "${LOG_PREFIX} Running mod queue check for ${AGENT}..."

cd "${WORKSPACE}"

# Fetch pending sybil reports
REPORTS=$(npx lobstr mod reports --status pending --format json 2>/dev/null || echo "[]")

if [ "${REPORTS}" = "[]" ] || [ -z "${REPORTS}" ]; then
  echo "${LOG_PREFIX} No pending reports"
  exit 0
fi

TOTAL=$(echo "${REPORTS}" | jq 'length' 2>/dev/null || echo 0)
echo "${LOG_PREFIX} Found ${TOTAL} pending report(s)"

# Check for high-priority reports (flagged or repeat offenders)
HIGH_PRIORITY=$(echo "${REPORTS}" | jq '[.[] | select(.priority == "high" or .repeated == true)]' 2>/dev/null || echo "[]")
HIGH_COUNT=$(echo "${HIGH_PRIORITY}" | jq 'length' 2>/dev/null || echo 0)

if [ "${HIGH_COUNT}" -gt 0 ]; then
  "${ALERT}" "critical" "${AGENT}" "${HIGH_COUNT} HIGH priority sybil report(s) need immediate review!"
elif [ "${TOTAL}" -gt 0 ]; then
  "${ALERT}" "warning" "${AGENT}" "${TOTAL} pending sybil report(s) in mod queue."
fi

# Check for stale reports (older than 48 hours)
NOW=$(date +%s)
STALE=$(echo "${REPORTS}" | jq --argjson now "${NOW}" \
  '[.[] | select(.createdAt != null) | select(($now - .createdAt) > 172800)]' \
  2>/dev/null || echo "[]")
STALE_COUNT=$(echo "${STALE}" | jq 'length' 2>/dev/null || echo 0)

if [ "${STALE_COUNT}" -gt 0 ]; then
  "${ALERT}" "warning" "${AGENT}" "${STALE_COUNT} report(s) stale for >48 hours — needs attention."
fi

echo "${LOG_PREFIX} Check complete: ${TOTAL} pending, ${HIGH_COUNT} high priority, ${STALE_COUNT} stale"
