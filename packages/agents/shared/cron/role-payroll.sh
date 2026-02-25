#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# Role Payroll — Report heartbeat + weekly prove & claim
# ═══════════════════════════════════════════════════════════════════
# Every 6 hours: report heartbeat on-chain
# On Mondays:    generate ZK uptime proof + claim weekly pay
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

source /tmp/agent-env 2>/dev/null || true
source /opt/scripts/retry.sh 2>/dev/null || true
source /opt/scripts/brain.sh 2>/dev/null || true
source /opt/scripts/memory-client.sh 2>/dev/null || true

AGENT="${AGENT_NAME:-unknown}"
WORKSPACE="${WORKSPACE_DIR:-/data/workspace}"
ALERT="/opt/scripts/alert.sh"
DISCORD_POST="/opt/scripts/discord-post.sh"
ACTION_OUTPUT_CHANNEL="${DISCORD_ACTION_OUTPUT_CHANNEL_ID:-}"
LOG_PREFIX="[role-payroll]"

echo "${LOG_PREFIX} Running for ${AGENT}..."

cd "${WORKSPACE}"

# ── Report heartbeat on-chain (every run) ─────────────────────────
HB_RESULT=$(retry_cli "lobstr role heartbeat" 2>&1 || echo "FAILED")
echo "${LOG_PREFIX} Heartbeat: ${HB_RESULT}"

HB_SUCCESS=true
if echo "${HB_RESULT}" | grep -qi "fail\|error\|revert"; then
  HB_SUCCESS=false
fi

# ── Weekly claim (Mondays only) ──────────────────────────────────
DAY_OF_WEEK=$(date -u +%u) # 1=Monday
CLAIM_SUCCESS=false
PROVE_SUCCESS=false
CLAIM_ATTEMPTED=false

if [ "${DAY_OF_WEEK}" = "1" ]; then
  CLAIM_ATTEMPTED=true
  echo "${LOG_PREFIX} Monday — generating ZK uptime proof..."

  # Generate proof
  PROVE_RESULT=$(retry_cli "lobstr role prove" 2>&1 || echo "FAILED")
  echo "${LOG_PREFIX} Prove: ${PROVE_RESULT}"

  if echo "${PROVE_RESULT}" | grep -qi "fail\|error"; then
    PROVE_SUCCESS=false
    "${ALERT}" "warning" "${AGENT}" "Role uptime proof failed: ${PROVE_RESULT}"
  else
    PROVE_SUCCESS=true

    # Submit claim
    CLAIM_RESULT=$(retry_cli "lobstr role claim" 2>&1 || echo "FAILED")
    echo "${LOG_PREFIX} Claim: ${CLAIM_RESULT}"

    if echo "${CLAIM_RESULT}" | grep -qi "fail\|error\|revert"; then
      CLAIM_SUCCESS=false
      "${ALERT}" "warning" "${AGENT}" "Role pay claim failed: ${CLAIM_RESULT}"
    else
      CLAIM_SUCCESS=true
      "${ALERT}" "info" "${AGENT}" "Weekly pay claimed: ${CLAIM_RESULT}"
      brain_log_action "Claimed weekly role pay: ${CLAIM_RESULT}"
    fi
  fi
fi

# ── Report to Discord ────────────────────────────────────────────
if [ -n "${ACTION_OUTPUT_CHANNEL}" ] && [ -x "${DISCORD_POST}" ]; then
  if ${CLAIM_ATTEMPTED} && ${CLAIM_SUCCESS}; then
    echo "✅ **[${AGENT}]** \`role_payroll\` — Heartbeat + weekly claim **OK**" | \
      "${DISCORD_POST}" "${ACTION_OUTPUT_CHANNEL}" 2>/dev/null || true
  elif ${CLAIM_ATTEMPTED} && ! ${CLAIM_SUCCESS}; then
    echo "❌ **[${AGENT}]** \`role_payroll\` — Weekly claim **FAILED**" | \
      "${DISCORD_POST}" "${ACTION_OUTPUT_CHANNEL}" 2>/dev/null || true
  elif ! ${HB_SUCCESS}; then
    echo "⚠️ **[${AGENT}]** \`role_payroll\` — Heartbeat **FAILED**" | \
      "${DISCORD_POST}" "${ACTION_OUTPUT_CHANNEL}" 2>/dev/null || true
  fi
fi

# ── Log to memory ────────────────────────────────────────────────
mem_log_decision "role-payroll" "heartbeat+claim" \
  "hb=${HB_SUCCESS}, prove=${PROVE_SUCCESS}, claim=${CLAIM_SUCCESS}, monday=${CLAIM_ATTEMPTED}" \
  "Periodic role heartbeat and weekly pay claim"

cron_mark_success "role-payroll"
echo "${LOG_PREFIX} Complete"
