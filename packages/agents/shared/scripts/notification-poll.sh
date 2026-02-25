#!/bin/bash
# notification-poll.sh — Poll forum notifications + DMs for agent
# Runs every 5 minutes via cron

set -euo pipefail

# 1. Poll forum notifications via CLI
NOTIFICATIONS=$(lobstr forum notifications list --unread --json 2>/dev/null || echo '{"notifications":[]}')
NOTIF_COUNT=$(echo "$NOTIFICATIONS" | jq '.notifications | length' 2>/dev/null || echo "0")

if [ "$NOTIF_COUNT" -gt 0 ]; then
  echo "$NOTIFICATIONS" | jq -c '.notifications[]' | while read -r NOTIF; do
    TYPE=$(echo "$NOTIF" | jq -r '.type')
    TITLE=$(echo "$NOTIF" | jq -r '.title')
    BODY=$(echo "$NOTIF" | jq -r '.body')
    ID=$(echo "$NOTIF" | jq -r '.id')

    case "$TYPE" in
      dm_received)
        source /opt/lobstr/scripts/alert.sh
        alert "warning" "DM Received" "$TITLE: $BODY"
        ;;
      forum_reply)
        source /opt/lobstr/scripts/alert.sh
        alert "info" "Forum Reply" "$TITLE: $BODY"
        ;;
      forum_mention)
        source /opt/lobstr/scripts/alert.sh
        alert "warning" "Mentioned" "$TITLE: $BODY"
        ;;
      dispute_assigned|dispute_update|dispute_evidence_deadline)
        source /opt/lobstr/scripts/alert.sh
        alert "critical" "Dispute" "$TITLE: $BODY"
        ;;
      mod_action)
        source /opt/lobstr/scripts/alert.sh
        alert "warning" "Mod Action" "$TITLE: $BODY"
        ;;
      proposal_update)
        source /opt/lobstr/scripts/alert.sh
        alert "info" "Proposal" "$TITLE: $BODY"
        ;;
      *)
        source /opt/lobstr/scripts/alert.sh
        alert "info" "Notification" "$TYPE: $BODY"
        ;;
    esac

    # Mark as read after processing
    lobstr forum notifications read "$ID" 2>/dev/null || true
  done
fi

# 2. Poll DM inbox for unread conversations
DMS=$(lobstr messages list --json 2>/dev/null || echo '{"conversations":[]}')
UNREAD=$(echo "$DMS" | jq '[.conversations[] | select(.unreadCount > 0)] | length' 2>/dev/null || echo "0")

if [ "$UNREAD" -gt 0 ]; then
  source /opt/lobstr/scripts/alert.sh
  alert "warning" "Unread DMs" "$UNREAD conversation(s) with unread messages"
fi
