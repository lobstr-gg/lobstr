#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# Approval Request — Post structured embed to #founder-approval
# ═══════════════════════════════════════════════════════════════════
# Usage: approval-request.sh <type> <target_id> <tool_name> <tool_args> <confidence> <reasoning>
#
# Types: sybil_confirm, sybil_reject, dispute_vote, proposal_approve, proposal_execute
#
# Posts a structured embed to #founder-approval via discord-post.sh.
# The bot picks it up, registers in pendingActions, adds reactions.
# Founder reacts ✅/❌ to approve/deny — bot auto-executes.
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

TYPE="${1:-}"
TARGET_ID="${2:-}"
TOOL_NAME="${3:-}"
TOOL_ARGS="${4:-}"
CONFIDENCE="${5:-medium}"
REASONING="${6:-No reasoning provided}"

AGENT="${AGENT_NAME:-unknown}"
TIMESTAMP="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
APPROVAL_CHANNEL="${DISCORD_APPROVAL_CHANNEL_ID:-}"
DISCORD_POST="/opt/scripts/discord-post.sh"
ALERT="/opt/scripts/alert.sh"
LOG_PREFIX="[approval-request]"

# ── Validate inputs ──────────────────────────────────────────────
if [ -z "${TYPE}" ] || [ -z "${TARGET_ID}" ] || [ -z "${TOOL_NAME}" ]; then
  echo "${LOG_PREFIX} ERROR: Usage: approval-request.sh <type> <target_id> <tool_name> <tool_args> <confidence> <reasoning>" >&2
  exit 1
fi

# ── Fallback to alert.sh if approval channel not configured ──────
if [ -z "${APPROVAL_CHANNEL}" ] || [ ! -x "${DISCORD_POST}" ]; then
  echo "${LOG_PREFIX} No approval channel configured, falling back to alert.sh"
  "${ALERT}" "warning" "${AGENT}" "[${TYPE}] Target: ${TARGET_ID} | Tool: ${TOOL_NAME} ${TOOL_ARGS} | Confidence: ${CONFIDENCE} | ${REASONING}"
  exit 0
fi

# ── Deduplication (30min cooldown) ───────────────────────────────
DEDUP_DIR="/tmp/approval-dedup"
mkdir -p "${DEDUP_DIR}" 2>/dev/null || true
COOLDOWN=1800  # 30 minutes

DEDUP_SIG="${TYPE}:${TARGET_ID}"
DEDUP_HASH=$(echo -n "${DEDUP_SIG}" | md5sum 2>/dev/null | cut -d' ' -f1 || echo "${DEDUP_SIG}")
DEDUP_FILE="${DEDUP_DIR}/${DEDUP_HASH}"

NOW=$(date +%s)
if [ -f "${DEDUP_FILE}" ]; then
  LAST_SENT=$(cat "${DEDUP_FILE}" 2>/dev/null || echo "0")
  ELAPSED=$(( NOW - LAST_SENT ))
  if [ "${ELAPSED}" -lt "${COOLDOWN}" ]; then
    echo "${LOG_PREFIX} Suppressed duplicate: ${TYPE}:${TARGET_ID} (${ELAPSED}s/${COOLDOWN}s cooldown)"
    exit 0
  fi
fi

# ── Human-readable type labels ───────────────────────────────────
case "${TYPE}" in
  sybil_confirm)    LABEL="Confirm Sybil Report" ;;
  sybil_reject)     LABEL="Reject Sybil Report" ;;
  dispute_vote)     LABEL="Vote on Dispute" ;;
  proposal_approve) LABEL="Approve Proposal" ;;
  proposal_execute) LABEL="Execute Proposal" ;;
  *)                LABEL="${TYPE}" ;;
esac

# ── Agent display name mapping ───────────────────────────────────
case "${AGENT}" in
  sentinel) AGENT_DISPLAY="Titus" ;;
  arbiter)  AGENT_DISPLAY="Solomon" ;;
  steward)  AGENT_DISPLAY="Daniel" ;;
  *)        AGENT_DISPLAY="${AGENT}" ;;
esac

# ── Build embed payload ─────────────────────────────────────────
PAYLOAD=$(jq -n \
  --arg title "🔐 APPROVAL: ${LABEL}" \
  --arg type "${TYPE}" \
  --arg target "${TARGET_ID}" \
  --arg agent "${AGENT_DISPLAY}" \
  --arg confidence "${CONFIDENCE}" \
  --arg tool "${TOOL_NAME}" \
  --arg args "${TOOL_ARGS}" \
  --arg reasoning "${REASONING}" \
  --arg footer "${TIMESTAMP} | ${AGENT}" \
  '{
    embeds: [{
      title: $title,
      color: 16753920,
      fields: [
        { name: "Type", value: $type, inline: true },
        { name: "Target", value: $target, inline: true },
        { name: "Agent", value: $agent, inline: true },
        { name: "Confidence", value: $confidence, inline: true },
        { name: "Tool", value: ("`" + $tool + "`"), inline: true },
        { name: "Args", value: ("`" + $args + "`"), inline: true },
        { name: "Reasoning", value: $reasoning, inline: false }
      ],
      footer: { text: $footer }
    }]
  }')

echo "${LOG_PREFIX} Posting approval request: ${TYPE} ${TARGET_ID} → ${TOOL_NAME}(${TOOL_ARGS})"

# ── Post to #founder-approval ────────────────────────────────────
"${DISCORD_POST}" "${APPROVAL_CHANNEL}" --embed "${PAYLOAD}"

# ── Record for dedup ─────────────────────────────────────────────
echo "${NOW}" > "${DEDUP_FILE}" 2>/dev/null || true

# ── Cleanup old dedup files (>24h) ───────────────────────────────
find "${DEDUP_DIR}" -type f -mmin +1440 -delete 2>/dev/null || true

echo "${LOG_PREFIX} Approval request posted successfully"
