#!/usr/bin/env bash
# loan-monitor.sh — Monitor active loans and alert on approaching deadlines/defaults
set -euo pipefail
source /tmp/agent-env 2>/dev/null || true

LOG="/var/log/agent/loan-monitor.log"

echo "[$(date -u +%FT%TZ)] Checking active loans..." >> "$LOG"

LOANS=$(npx lobstr loan list --format json 2>/dev/null || echo '[]')
ACTIVE_COUNT=$(echo "$LOANS" | jq '[.[] | select(.status == "Active")] | length' 2>/dev/null || echo "0")

if [ "$ACTIVE_COUNT" -gt 0 ]; then
  NOW=$(date +%s)

  echo "$LOANS" | jq -c '.[] | select(.status == "Active")' 2>/dev/null | while read -r LOAN; do
    DUE_DATE=$(echo "$LOAN" | jq -r '.dueDate' 2>/dev/null || echo "0")
    LOAN_ID=$(echo "$LOAN" | jq -r '.id' 2>/dev/null || echo "?")
    REMAINING=$((DUE_DATE - NOW))

    if [ "$REMAINING" -lt 86400 ] && [ "$REMAINING" -gt 0 ]; then
      HOURS=$((REMAINING / 3600))
      echo "[$(date -u +%FT%TZ)] URGENT: Loan #$LOAN_ID due in ${HOURS}h" >> "$LOG"
      /opt/scripts/alert.sh critical "$AGENT_NAME" "Loan #$LOAN_ID due in ${HOURS} hours"
    elif [ "$REMAINING" -lt 604800 ] && [ "$REMAINING" -gt 0 ]; then
      DAYS=$((REMAINING / 86400))
      echo "[$(date -u +%FT%TZ)] WARNING: Loan #$LOAN_ID due in ${DAYS}d" >> "$LOG"
    elif [ "$REMAINING" -le 0 ]; then
      echo "[$(date -u +%FT%TZ)] CRITICAL: Loan #$LOAN_ID is OVERDUE" >> "$LOG"
      /opt/scripts/alert.sh critical "$AGENT_NAME" "Loan #$LOAN_ID is OVERDUE — potential default"
    fi
  done

  echo "[$(date -u +%FT%TZ)] Active loans: $ACTIVE_COUNT" >> "$LOG"
else
  echo "[$(date -u +%FT%TZ)] No active loans" >> "$LOG"
fi
