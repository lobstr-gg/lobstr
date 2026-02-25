#!/bin/bash
# Stream Claimer — Auto-claim vested payment streams
# Invoked by cron, primarily used by Steward but available to all
set -euo pipefail

source /tmp/agent-env 2>/dev/null || true

AGENT="${AGENT_NAME:-unknown}"
WORKSPACE="${WORKSPACE_DIR:-/data/workspace}"
ALERT="/opt/scripts/alert.sh"
LOG_PREFIX="[stream-claimer]"

echo "${LOG_PREFIX} Checking claimable streams for ${AGENT}..."

cd "${WORKSPACE}"

# Fetch streams with claimable amounts
STREAMS=$(npx lobstr dao streams --format json 2>/dev/null || echo "[]")

if [ "${STREAMS}" = "[]" ] || [ -z "${STREAMS}" ]; then
  echo "${LOG_PREFIX} No active streams"
  exit 0
fi

TOTAL=$(echo "${STREAMS}" | jq 'length' 2>/dev/null || echo 0)

# Filter for streams with claimable balance > 0
CLAIMABLE=$(echo "${STREAMS}" | jq '[.[] | select(.claimable != null) | select((.claimable | tonumber) > 0)]' 2>/dev/null || echo "[]")
CLAIM_COUNT=$(echo "${CLAIMABLE}" | jq 'length' 2>/dev/null || echo 0)

if [ "${CLAIM_COUNT}" -eq 0 ]; then
  echo "${LOG_PREFIX} No claimable streams (${TOTAL} total active)"
  exit 0
fi

echo "${LOG_PREFIX} Found ${CLAIM_COUNT} stream(s) with claimable funds"

# Claim each stream
echo "${CLAIMABLE}" | jq -r '.[].id' 2>/dev/null | while read -r STREAM_ID; do
  AMOUNT=$(echo "${CLAIMABLE}" | jq -r --arg id "${STREAM_ID}" '.[] | select(.id == $id) | .claimable' 2>/dev/null || echo "0")

  echo "${LOG_PREFIX} Claiming stream ${STREAM_ID}: ${AMOUNT} LOB"

  RESULT=$(npx lobstr dao claim-stream --id "${STREAM_ID}" 2>&1 || echo "FAILED")

  if echo "${RESULT}" | grep -qi "fail\|error\|revert"; then
    "${ALERT}" "warning" "${AGENT}" "Failed to claim stream ${STREAM_ID}: ${RESULT}"
  else
    "${ALERT}" "info" "${AGENT}" "Claimed ${AMOUNT} LOB from stream ${STREAM_ID}"
  fi
done

echo "${LOG_PREFIX} Stream claim cycle complete"
