#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# DAO Orchestrator — Automated DAO Lifecycle Pipeline (Steward Only)
# ═══════════════════════════════════════════════════════════════════
# Runs every 15 minutes on Steward. Checks for pending DAO proposals
# and advances them through the lifecycle: setup → approve → execute.
# Broadcasts workflow_step relay messages to keep other agents informed.
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

source /tmp/agent-env 2>/dev/null || true

AGENT="${AGENT_NAME:-unknown}"
WORKSPACE="${WORKSPACE_DIR:-/data/workspace}"
ALERT="/opt/scripts/alert.sh"
LOG_PREFIX="[dao-orchestrator]"
LOCK_FILE="/tmp/dao-orchestrator.lock"

# ── Lockfile management ───────────────────────────────────────────
acquire_lock() {
  if [ -f "${LOCK_FILE}" ]; then
    LOCK_AGE=$(( $(date +%s) - $(stat -c %Y "${LOCK_FILE}" 2>/dev/null || stat -f %m "${LOCK_FILE}" 2>/dev/null || echo "0") ))
    if [ "${LOCK_AGE}" -lt 900 ]; then
      echo "${LOG_PREFIX} Lock held (${LOCK_AGE}s old) — skipping"
      return 1
    fi
    echo "${LOG_PREFIX} Stale lock (${LOCK_AGE}s) — removing"
    rm -f "${LOCK_FILE}"
  fi
  echo $$ > "${LOCK_FILE}"
  return 0
}

release_lock() {
  rm -f "${LOCK_FILE}"
}

trap release_lock EXIT

if ! acquire_lock; then
  exit 0
fi

echo "${LOG_PREFIX} Checking DAO proposal lifecycle..."

# ── Broadcast workflow step via relay ─────────────────────────────
broadcast_step() {
  local WORKFLOW="$1"
  local STEP="$2"
  local STATUS="$3"
  local NEXT_STEP="${4:-}"
  local NEXT_AGENT="${5:-broadcast}"

  STEP_PAYLOAD=$(jq -n \
    --arg workflow "${WORKFLOW}" \
    --arg step "${STEP}" \
    --arg status "${STATUS}" \
    --arg nextStep "${NEXT_STEP}" \
    --arg nextAgent "${NEXT_AGENT}" \
    '{workflow: $workflow, step: $step, status: $status, nextStep: $nextStep, nextAgent: $nextAgent}')

  lobstr relay send broadcast workflow_step "${STEP_PAYLOAD}" 2>/dev/null || true
}

# ── Check for pending proposals ──────────────────────────────────
PROPOSALS=$(lobstr dao admin-proposals --json 2>/dev/null || echo "")

if [ -z "${PROPOSALS}" ] || ! echo "${PROPOSALS}" | jq empty 2>/dev/null; then
  echo "${LOG_PREFIX} Could not fetch proposals or empty response — done"
  exit 0
fi

# Count proposals by state
NEED_SETUP=$(echo "${PROPOSALS}" | jq '[.proposals[]? | select(.status == "not_submitted" or .status == "needs_setup")] | length' 2>/dev/null || echo "0")
NEED_APPROVAL=$(echo "${PROPOSALS}" | jq '[.proposals[]? | select(.status == "pending" or .status == "needs_approval")] | length' 2>/dev/null || echo "0")
NEED_EXECUTION=$(echo "${PROPOSALS}" | jq '[.proposals[]? | select(.status == "ready" or .status == "past_timelock")] | length' 2>/dev/null || echo "0")
TOTAL=$(echo "${PROPOSALS}" | jq '[.proposals[]?] | length' 2>/dev/null || echo "0")

echo "${LOG_PREFIX} Proposals: ${TOTAL} total, ${NEED_SETUP} need setup, ${NEED_APPROVAL} need approval, ${NEED_EXECUTION} ready to execute"

# If no actionable proposals, exit silently
if [ "${NEED_SETUP}" = "0" ] && [ "${NEED_APPROVAL}" = "0" ] && [ "${NEED_EXECUTION}" = "0" ]; then
  echo "${LOG_PREFIX} No actionable proposals — done"
  exit 0
fi

# ── Step 1: Setup roles if needed ─────────────────────────────────
if [ "${NEED_SETUP}" -gt 0 ]; then
  echo "${LOG_PREFIX} Running setup-roles for ${NEED_SETUP} proposal(s)..."
  broadcast_step "dao-role-grants" "setup-roles" "in_progress" "approve-pending"

  SETUP_OUTPUT=$(timeout 120 lobstr dao setup-roles 2>&1 || true)
  SETUP_EXIT=$?

  if [ ${SETUP_EXIT} -eq 0 ]; then
    echo "${LOG_PREFIX} setup-roles completed successfully"
    "${ALERT}" "info" "${AGENT}" "DAO setup-roles completed: ${NEED_SETUP} proposal(s) submitted"
    broadcast_step "dao-role-grants" "setup-roles" "completed" "approve-pending"
  else
    echo "${LOG_PREFIX} setup-roles failed (exit ${SETUP_EXIT}): ${SETUP_OUTPUT}"
    "${ALERT}" "warning" "${AGENT}" "DAO setup-roles FAILED (exit ${SETUP_EXIT})"
    broadcast_step "dao-role-grants" "setup-roles" "failed" ""
  fi

  sleep 2
fi

# ── Step 2: Approve pending proposals ─────────────────────────────
if [ "${NEED_APPROVAL}" -gt 0 ]; then
  echo "${LOG_PREFIX} Running approve-pending for ${NEED_APPROVAL} proposal(s)..."
  broadcast_step "dao-role-grants" "approve-pending" "in_progress" "execute-ready"

  APPROVE_OUTPUT=$(timeout 120 lobstr dao approve-pending 2>&1 || true)
  APPROVE_EXIT=$?

  if [ ${APPROVE_EXIT} -eq 0 ]; then
    echo "${LOG_PREFIX} approve-pending completed successfully"
    "${ALERT}" "info" "${AGENT}" "DAO approve-pending completed: ${NEED_APPROVAL} proposal(s) approved"
    broadcast_step "dao-role-grants" "approve-pending" "completed" "execute-ready"
  else
    echo "${LOG_PREFIX} approve-pending failed (exit ${APPROVE_EXIT}): ${APPROVE_OUTPUT}"
    "${ALERT}" "warning" "${AGENT}" "DAO approve-pending FAILED (exit ${APPROVE_EXIT})"
    broadcast_step "dao-role-grants" "approve-pending" "failed" ""
  fi

  sleep 2
fi

# ── Step 3: Execute proposals past timelock ───────────────────────
if [ "${NEED_EXECUTION}" -gt 0 ]; then
  echo "${LOG_PREFIX} Running execute-ready for ${NEED_EXECUTION} proposal(s)..."
  broadcast_step "dao-role-grants" "execute-ready" "in_progress" ""

  EXEC_OUTPUT=$(timeout 120 lobstr dao execute-ready 2>&1 || true)
  EXEC_EXIT=$?

  if [ ${EXEC_EXIT} -eq 0 ]; then
    echo "${LOG_PREFIX} execute-ready completed successfully"
    "${ALERT}" "info" "${AGENT}" "DAO execute-ready completed: ${NEED_EXECUTION} proposal(s) executed"
    broadcast_step "dao-role-grants" "execute-ready" "completed" ""
  else
    echo "${LOG_PREFIX} execute-ready failed (exit ${EXEC_EXIT}): ${EXEC_OUTPUT}"
    "${ALERT}" "warning" "${AGENT}" "DAO execute-ready FAILED (exit ${EXEC_EXIT})"
    broadcast_step "dao-role-grants" "execute-ready" "failed" ""
  fi
fi

echo "${LOG_PREFIX} DAO orchestrator cycle complete"
