#!/usr/bin/env bash
# insurance-monitor.sh — Monitor InsurancePool health metrics
set -euo pipefail
source /tmp/agent-env 2>/dev/null || true

LOG="/var/log/agent/insurance-monitor.log"

echo "[$(date -u +%FT%TZ)] Checking InsurancePool health..." >> "$LOG"

STATUS=$(npx lobstr insurance status --format json 2>/dev/null || echo '{}')
RESERVE_RATIO=$(echo "$STATUS" | jq -r '.reserveRatio // "0"' 2>/dev/null || echo "0")
TOTAL_DEPOSITS=$(echo "$STATUS" | jq -r '.totalDeposits // "0"' 2>/dev/null || echo "0")
TOTAL_CLAIMS=$(echo "$STATUS" | jq -r '.totalClaims // "0"' 2>/dev/null || echo "0")

echo "[$(date -u +%FT%TZ)] Pool — Deposits: $TOTAL_DEPOSITS, Claims: $TOTAL_CLAIMS, Reserve: ${RESERVE_RATIO}%" >> "$LOG"

RATIO_INT=$(echo "$RESERVE_RATIO" | cut -d. -f1)
if [ "$RATIO_INT" -lt 15 ] 2>/dev/null; then
  /opt/scripts/alert.sh critical "$AGENT_NAME" "InsurancePool CRITICAL — Reserve ratio: ${RESERVE_RATIO}% (below 15%)"
elif [ "$RATIO_INT" -lt 20 ] 2>/dev/null; then
  /opt/scripts/alert.sh warning "$AGENT_NAME" "InsurancePool WARNING — Reserve ratio: ${RESERVE_RATIO}% (below 20%)"
else
  echo "[$(date -u +%FT%TZ)] Pool health OK — Reserve: ${RESERVE_RATIO}%" >> "$LOG"
fi
