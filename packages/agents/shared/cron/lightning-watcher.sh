#!/usr/bin/env bash
# lightning-watcher.sh — Monitor LightningGovernor proposals and alert on veto windows
set -euo pipefail
source /tmp/agent-env 2>/dev/null || true

LOG="/var/log/agent/lightning-watcher.log"

echo "[$(date -u +%FT%TZ)] Checking LightningGovernor proposals..." >> "$LOG"

PROPOSALS=$(npx lobstr governor list --format json 2>/dev/null || echo '[]')
ACTIVE_COUNT=$(echo "$PROPOSALS" | jq '[.[] | select(.status == "Active" or .status == "Pending" or .status == "Succeeded")] | length' 2>/dev/null || echo "0")

if [ "$ACTIVE_COUNT" -gt 0 ]; then
  NOW=$(date +%s)

  echo "$PROPOSALS" | jq -c '.[] | select(.status == "Active" or .status == "Pending" or .status == "Succeeded")' 2>/dev/null | while read -r PROP; do
    PROP_ID=$(echo "$PROP" | jq -r '.id' 2>/dev/null || echo "?")
    PROP_TYPE=$(echo "$PROP" | jq -r '.proposalType // "Standard"' 2>/dev/null || echo "Standard")
    PROP_STATUS=$(echo "$PROP" | jq -r '.status' 2>/dev/null || echo "?")
    DEADLINE=$(echo "$PROP" | jq -r '.deadline // "0"' 2>/dev/null || echo "0")
    REMAINING=$((DEADLINE - NOW))

    if [ "$PROP_TYPE" = "Emergency" ]; then
      /opt/scripts/alert.sh critical "$AGENT_NAME" "EMERGENCY proposal #$PROP_ID — Status: $PROP_STATUS — Requires immediate review"
    elif [ "$PROP_TYPE" = "FastTrack" ] && [ "$REMAINING" -lt 21600 ] && [ "$REMAINING" -gt 0 ]; then
      HOURS=$((REMAINING / 3600))
      /opt/scripts/alert.sh warning "$AGENT_NAME" "Fast-track proposal #$PROP_ID — ${HOURS}h until deadline"
    fi

    if [ "$PROP_STATUS" = "Succeeded" ]; then
      /opt/scripts/alert.sh warning "$AGENT_NAME" "Proposal #$PROP_ID ($PROP_TYPE) passed — veto window active"
    fi

    echo "[$(date -u +%FT%TZ)] Proposal #$PROP_ID — Type: $PROP_TYPE, Status: $PROP_STATUS" >> "$LOG"
  done
else
  echo "[$(date -u +%FT%TZ)] No active LightningGovernor proposals" >> "$LOG"
fi
