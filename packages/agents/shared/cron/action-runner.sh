#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# Action Runner — Command Dispatch Executor
# ═══════════════════════════════════════════════════════════════════
# Polls relay inbox every 1 minute for command_dispatch messages,
# validates against a hardcoded whitelist, executes, and sends
# command_result back to the requester.
#
# Safety: whitelist is hardcoded (no injection), lockfile prevents
# concurrent execution, idempotency prevents duplicate runs,
# mark-as-read before execution prevents crash loops.
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

source /tmp/agent-env 2>/dev/null || true

AGENT="${AGENT_NAME:-unknown}"
WORKSPACE="${WORKSPACE_DIR:-/data/workspace}"
ALERT="/opt/scripts/alert.sh"
LOG_PREFIX="[action-runner]"
LOCK_FILE="/tmp/action-runner.lock"
ACTION_LOG="${WORKSPACE}/action-log.jsonl"

# ── Hardcoded command whitelist (security critical) ────────────────
ALLOWED_COMMANDS=(
  "lobstr dao setup-roles"
  "lobstr dao approve-pending"
  "lobstr dao execute-ready"
  "lobstr dao admin-proposals"
  "lobstr dao propose"
  "lobstr dao approve"
  "lobstr stake"
  "lobstr arbitrate stake"
  "lobstr arbitrate info"
  "lobstr arbitrate status"
  "lobstr rewards claim"
  "lobstr rewards check"
  "lobstr insurance check"
  "lobstr loan monitor"
  "lobstr loan list"
  "lobstr rep check"
  "lobstr relay broadcast"
  "lobstr heartbeat status"
  "lobstr airdrop submit-attestation"
  "lobstr airdrop status"
  "lobstr airdrop stats"
  "lobstr airdrop milestone"
  "lobstr attestation generate"
  "lobstr attestation prove"
  "lobstr attestation setup"
  "lobstr wallet balance"
  "lobstr wallet address"
)

# Commands that need extended timeout (12h) — PoW grinding, ZK setup, etc.
LONG_RUNNING_COMMANDS=(
  "lobstr airdrop submit-attestation"
  "lobstr attestation setup"
  "lobstr attestation prove"
)

# ── Lockfile management ───────────────────────────────────────────
acquire_lock() {
  if [ -f "${LOCK_FILE}" ]; then
    # Check if stale (>13 hours — must exceed longest command timeout of 12h)
    LOCK_AGE=$(( $(date +%s) - $(stat -c %Y "${LOCK_FILE}" 2>/dev/null || stat -f %m "${LOCK_FILE}" 2>/dev/null || echo "0") ))
    if [ "${LOCK_AGE}" -lt 46800 ]; then
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

# ── Check if command is whitelisted (prefix match) ────────────────
is_whitelisted() {
  local cmd="$1"
  for allowed in "${ALLOWED_COMMANDS[@]}"; do
    if [[ "${cmd}" == "${allowed}"* ]]; then
      return 0
    fi
  done
  return 1
}

# ── Check idempotency ────────────────────────────────────────────
already_executed() {
  local key="$1"
  if [ -f "${ACTION_LOG}" ]; then
    grep -q "\"idempotencyKey\":\"${key}\"" "${ACTION_LOG}" 2>/dev/null && return 0
  fi
  return 1
}

# ── Get own address ──────────────────────────────────────────────
OWN_ADDRESS=$(lobstr wallet address 2>/dev/null | grep -oiE '0x[0-9a-fA-F]{40}' | head -1 || echo "")
if [ -z "${OWN_ADDRESS}" ]; then
  echo "${LOG_PREFIX} Could not determine wallet address — skipping"
  exit 0
fi

echo "${LOG_PREFIX} Polling relay inbox for command_dispatch messages..."

# ── Fetch command_dispatch messages ──────────────────────────────
INBOX=$(lobstr relay inbox --type command_dispatch --unread --json 2>/dev/null || echo "")

if [ -z "${INBOX}" ] || ! echo "${INBOX}" | jq empty 2>/dev/null; then
  echo "${LOG_PREFIX} No messages or invalid response — done"
  exit 0
fi

# Extract messages array
MESSAGES=$(echo "${INBOX}" | jq -c '.messages // []' 2>/dev/null || echo "[]")
MSG_COUNT=$(echo "${MESSAGES}" | jq 'length' 2>/dev/null || echo "0")

if [ "${MSG_COUNT}" = "0" ]; then
  echo "${LOG_PREFIX} No pending command_dispatch messages — done"
  exit 0
fi

echo "${LOG_PREFIX} Found ${MSG_COUNT} command_dispatch message(s)"

# ── Process each message ─────────────────────────────────────────
echo "${MESSAGES}" | jq -c '.[]' | while read -r MSG; do
  MSG_ID=$(echo "${MSG}" | jq -r '.id // ""')
  FROM=$(echo "${MSG}" | jq -r '.from // ""')
  PAYLOAD_RAW=$(echo "${MSG}" | jq -r '.payload // "{}"')

  # Parse payload (it may be a JSON string or already an object)
  PAYLOAD=$(echo "${PAYLOAD_RAW}" | jq -r '.' 2>/dev/null || echo "${PAYLOAD_RAW}")
  COMMAND=$(echo "${PAYLOAD}" | jq -r '.command // ""' 2>/dev/null || echo "")
  REASON=$(echo "${PAYLOAD}" | jq -r '.reason // ""' 2>/dev/null || echo "")
  PRIORITY=$(echo "${PAYLOAD}" | jq -r '.priority // "normal"' 2>/dev/null || echo "normal")
  IDEM_KEY=$(echo "${PAYLOAD}" | jq -r '.idempotencyKey // ""' 2>/dev/null || echo "")

  if [ -z "${COMMAND}" ]; then
    echo "${LOG_PREFIX} Message ${MSG_ID} has no command — skipping"
    continue
  fi

  echo "${LOG_PREFIX} Processing: ${COMMAND} (from: ${FROM}, priority: ${PRIORITY}, key: ${IDEM_KEY})"

  # ── Mark as read FIRST (prevents crash-loop re-runs) ──────────
  lobstr relay ack "${MSG_ID}" 2>/dev/null || true

  # ── Idempotency check ─────────────────────────────────────────
  if [ -n "${IDEM_KEY}" ] && already_executed "${IDEM_KEY}"; then
    echo "${LOG_PREFIX} Already executed (key: ${IDEM_KEY}) — skipping"
    continue
  fi

  # ── Whitelist check ────────────────────────────────────────────
  if ! is_whitelisted "${COMMAND}"; then
    echo "${LOG_PREFIX} REJECTED: '${COMMAND}' not in whitelist"
    "${ALERT}" "warning" "${AGENT}" "Command dispatch REJECTED: '${COMMAND}' from ${FROM} — not in whitelist"

    # Send rejection result back
    RESULT_PAYLOAD=$(jq -n \
      --arg cmd "${COMMAND}" \
      --arg stderr "Command not in whitelist" \
      --arg key "${IDEM_KEY}" \
      --argjson exitCode -1 \
      --argjson ts "$(date +%s000)" \
      '{command: $cmd, exitCode: $exitCode, stdout: "", stderr: $stderr, executedAt: $ts, idempotencyKey: $key}')

    lobstr relay send "${FROM}" command_result "${RESULT_PAYLOAD}" 2>/dev/null || true
    continue
  fi

  # ── Execute command ────────────────────────────────────────────
  echo "${LOG_PREFIX} Executing: ${COMMAND}"
  EXEC_START=$(date +%s)

  # Split command into array (no eval — prevents injection)
  read -ra CMD_ARRAY <<< "${COMMAND}"

  STDOUT=""
  STDERR=""
  EXIT_CODE=0

  # Determine timeout — long-running commands get 12h, others get 120s
  CMD_TIMEOUT=120
  for long_cmd in "${LONG_RUNNING_COMMANDS[@]}"; do
    if [[ "${COMMAND}" == "${long_cmd}"* ]]; then
      CMD_TIMEOUT=43200
      echo "${LOG_PREFIX} Long-running command detected — timeout set to 12h"
      break
    fi
  done

  # Execute with timeout, capture stdout and stderr
  STDOUT=$(timeout ${CMD_TIMEOUT} "${CMD_ARRAY[@]}" 2>/tmp/action-runner-stderr.$$ || EXIT_CODE=$?)
  STDERR=$(cat /tmp/action-runner-stderr.$$ 2>/dev/null || echo "")
  rm -f /tmp/action-runner-stderr.$$

  EXEC_END=$(date +%s)
  DURATION=$(( EXEC_END - EXEC_START ))

  # Truncate stdout to last 500 chars
  if [ ${#STDOUT} -gt 500 ]; then
    STDOUT="...${STDOUT: -500}"
  fi
  if [ ${#STDERR} -gt 500 ]; then
    STDERR="...${STDERR: -500}"
  fi

  echo "${LOG_PREFIX} Completed: exit=${EXIT_CODE} duration=${DURATION}s"

  # ── Log to action-log.jsonl ────────────────────────────────────
  LOG_ENTRY=$(jq -n \
    --arg key "${IDEM_KEY}" \
    --arg cmd "${COMMAND}" \
    --argjson exitCode "${EXIT_CODE}" \
    --argjson ts "$(date +%s)" \
    --arg from "${FROM}" \
    --argjson duration "${DURATION}" \
    '{idempotencyKey: $key, command: $cmd, exitCode: $exitCode, timestamp: $ts, from: $from, duration: $duration}')
  echo "${LOG_ENTRY}" >> "${ACTION_LOG}"

  # ── Send command_result back to sender ─────────────────────────
  RESULT_PAYLOAD=$(jq -n \
    --arg cmd "${COMMAND}" \
    --argjson exitCode "${EXIT_CODE}" \
    --arg stdout "${STDOUT}" \
    --arg stderr "${STDERR}" \
    --arg key "${IDEM_KEY}" \
    --argjson ts "$(date +%s000)" \
    '{command: $cmd, exitCode: $exitCode, stdout: $stdout, stderr: $stderr, executedAt: $ts, idempotencyKey: $key}')

  lobstr relay send "${FROM}" command_result "${RESULT_PAYLOAD}" 2>/dev/null || true

  # ── Discord alert ──────────────────────────────────────────────
  if [ "${EXIT_CODE}" -eq 0 ]; then
    "${ALERT}" "info" "${AGENT}" "Command executed: ${COMMAND} (${DURATION}s, from ${FROM})"
  else
    "${ALERT}" "warning" "${AGENT}" "Command FAILED: ${COMMAND} exit=${EXIT_CODE} (${DURATION}s, from ${FROM})"
  fi

  sleep 1
done

echo "${LOG_PREFIX} Action runner cycle complete"
