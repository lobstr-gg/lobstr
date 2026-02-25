#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# Notification Poll — Forum notification + DM inbox alerter
# ═══════════════════════════════════════════════════════════════════
# Polls forum notifications and DM inbox, routes alerts by type.
# Replaces the old scripts/notification-poll.sh with proper paths.
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

source /tmp/agent-env 2>/dev/null || true
source /opt/scripts/retry.sh 2>/dev/null || true
source /opt/scripts/brain.sh 2>/dev/null || true
source /opt/scripts/memory-client.sh 2>/dev/null || true

AGENT="${AGENT_NAME:-unknown}"
WORKSPACE="${WORKSPACE_DIR:-/data/workspace}"
ALERT="/opt/scripts/alert.sh"
LOG_PREFIX="[notification-poll]"

echo "${LOG_PREFIX} Polling notifications for ${AGENT}..."

cd "${WORKSPACE}"

# ── Poll forum notifications ────────────────────────────────────
NOTIFICATIONS=$(retry_cli "lobstr forum notifications list --unread --json" 2>/dev/null || echo '{"notifications":[]}')
NOTIF_COUNT=$(echo "${NOTIFICATIONS}" | jq '.notifications | length' 2>/dev/null || echo "0")

echo "${LOG_PREFIX} ${NOTIF_COUNT} unread notification(s)"

if [ "${NOTIF_COUNT}" -gt 0 ]; then
  echo "${NOTIFICATIONS}" | jq -c '.notifications[]' 2>/dev/null | while read -r NOTIF; do
    TYPE=$(echo "${NOTIF}" | jq -r '.type // "unknown"' 2>/dev/null || echo "unknown")
    TITLE=$(echo "${NOTIF}" | jq -r '.title // "No title"' 2>/dev/null || echo "No title")
    BODY=$(echo "${NOTIF}" | jq -r '.body // ""' 2>/dev/null || echo "")
    ID=$(echo "${NOTIF}" | jq -r '.id // ""' 2>/dev/null || echo "")

    # Route by notification type
    case "${TYPE}" in
      dm_received)
        "${ALERT}" "warning" "${AGENT}" "DM Received: ${TITLE}: ${BODY}"
        ;;
      channel_message)
        CHANNEL_ID=$(echo "${NOTIF}" | jq -r '.refId // ""')
        "${ALERT}" "info" "${AGENT}" "Channel Message: ${TITLE} (${CHANNEL_ID})"
        ;;
      dispute_assigned)
        "${ALERT}" "critical" "${AGENT}" "Dispute: ${TITLE}: ${BODY}"
        # Auto-create arb channel for the dispute
        DISPUTE_ID=$(echo "${NOTIF}" | jq -r '.refId // ""')
        if [ -n "${DISPUTE_ID}" ]; then
          DISPUTE_DATA=$(lobstr arbitrate disputes --json 2>/dev/null || echo "")
          ARBS=$(echo "${DISPUTE_DATA}" | jq -r --arg id "${DISPUTE_ID}" '.disputes[]? | select(.id == $id) | .arbitrators | join(",")' 2>/dev/null || echo "")
          if [ -n "${ARBS}" ]; then
            lobstr channel create-arb "${DISPUTE_ID}" --participants "${ARBS}" 2>/dev/null || true
          fi
        fi
        ;;
      dispute_update|dispute_evidence_deadline)
        "${ALERT}" "critical" "${AGENT}" "Dispute: ${TITLE}: ${BODY}"
        ;;
      forum_mention)
        "${ALERT}" "warning" "${AGENT}" "Mentioned: ${TITLE}: ${BODY}"
        ;;
      mod_action)
        "${ALERT}" "warning" "${AGENT}" "Mod Action: ${TITLE}: ${BODY}"
        ;;
      forum_reply)
        "${ALERT}" "info" "${AGENT}" "Forum Reply: ${TITLE}: ${BODY}"
        ;;
      proposal_update)
        "${ALERT}" "info" "${AGENT}" "Proposal: ${TITLE}: ${BODY}"
        ;;
      *)
        "${ALERT}" "info" "${AGENT}" "Notification (${TYPE}): ${BODY}"
        ;;
    esac

    # Mark as read after processing
    if [ -n "${ID}" ]; then
      lobstr forum notifications read "${ID}" 2>/dev/null || true
    fi
  done
fi

# ── Poll DM inbox for unread conversations ──────────────────────
DMS=$(retry_cli "lobstr messages list --json" 2>/dev/null || echo '{"conversations":[]}')
UNREAD=$(echo "${DMS}" | jq '[.conversations[]? | select(.unreadCount > 0)] | length' 2>/dev/null || echo "0")

if [ "${UNREAD}" -gt 0 ]; then
  "${ALERT}" "warning" "${AGENT}" "Unread DMs: ${UNREAD} conversation(s) with unread messages"
fi

cron_mark_success "notification-poll"
echo "${LOG_PREFIX} Poll complete"
