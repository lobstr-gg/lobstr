#!/bin/bash
# relay-check.sh — Poll relay inbox for unread messages and auto-ack
# Runs every 5 minutes via cron

set -euo pipefail

WORKSPACE_DIR="${WORKSPACE_DIR:-/workspace}"

MESSAGES=$(npx lobstr relay inbox --unread --json 2>/dev/null || echo '{"messages":[]}')
COUNT=$(echo "$MESSAGES" | jq '.messages | length' 2>/dev/null || echo "0")

if [ "$COUNT" -gt 0 ]; then
  echo "$MESSAGES" | jq -c '.messages[]' | while read -r MSG; do
    TYPE=$(echo "$MSG" | jq -r '.type')
    FROM=$(echo "$MSG" | jq -r '.from')
    ID=$(echo "$MSG" | jq -r '.id')

    case "$TYPE" in
      case_handoff)
        source /opt/lobstr/scripts/alert.sh
        alert "warning" "Case Handoff" "From: $FROM — check relay inbox"
        ;;
      consensus_request)
        source /opt/lobstr/scripts/alert.sh
        alert "critical" "Consensus Request" "From: $FROM — action required"
        ;;
      evidence_share)
        source /opt/lobstr/scripts/alert.sh
        alert "info" "Evidence Shared" "From: $FROM — new evidence in relay"
        ;;
      mod_escalation)
        source /opt/lobstr/scripts/alert.sh
        alert "critical" "Mod Escalation" "From: $FROM — review needed"
        ;;
      task_assignment)
        source /opt/lobstr/scripts/alert.sh
        alert "warning" "Task Assignment" "From: $FROM — new task"
        ;;
      heartbeat_alert)
        echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) HEARTBEAT from $FROM" >> "$WORKSPACE_DIR/relay-log.jsonl"
        ;;
    esac

    # Auto-ack all messages
    npx lobstr relay ack "$ID" 2>/dev/null || true
  done
fi
