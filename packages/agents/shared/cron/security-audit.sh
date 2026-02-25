#!/bin/bash
# Security Audit — Daily automated security check
# Invoked by cron at 9:00 UTC
set -euo pipefail

source /tmp/agent-env 2>/dev/null || true

AGENT="${AGENT_NAME:-unknown}"
WORKSPACE="${WORKSPACE_DIR:-/data/workspace}"
ALERT="/opt/scripts/alert.sh"
LOG_PREFIX="[security-audit]"
ISSUES=0

echo "${LOG_PREFIX} Starting daily security audit for ${AGENT}..."

# ── 1. Running as correct user (not root) ────────────────────────────
CURRENT_UID="$(id -u)"
CURRENT_USER="$(id -un)"
if [ "${CURRENT_UID}" -eq 0 ]; then
  echo "${LOG_PREFIX} FAIL: Running as root (uid=0)"
  ISSUES=$((ISSUES + 1))
else
  echo "${LOG_PREFIX} OK: Running as ${CURRENT_USER} (uid=${CURRENT_UID})"
fi

# ── 2. Docker secrets exist and are readable ─────────────────────────
for SECRET in wallet_password webhook_url rpc_url; do
  SECRET_PATH="/run/secrets/${SECRET}"
  if [ -f "${SECRET_PATH}" ]; then
    if [ -r "${SECRET_PATH}" ]; then
      echo "${LOG_PREFIX} OK: Secret ${SECRET} exists and is readable"
    else
      echo "${LOG_PREFIX} FAIL: Secret ${SECRET} exists but is NOT readable"
      ISSUES=$((ISSUES + 1))
    fi
  else
    echo "${LOG_PREFIX} FAIL: Secret ${SECRET} is missing"
    ISSUES=$((ISSUES + 1))
  fi
done

# ── 3. No secrets leaked into /etc/environment ───────────────────────
if [ -f /tmp/agent-env ]; then
  if grep -qiE '(PRIVATE_KEY|PASSWORD|SECRET|WALLET_PASS)' /tmp/agent-env 2>/dev/null; then
    echo "${LOG_PREFIX} FAIL: /tmp/agent-env contains sensitive-looking variables"
    ISSUES=$((ISSUES + 1))
  else
    echo "${LOG_PREFIX} OK: /tmp/agent-env has no leaked secrets"
  fi
else
  echo "${LOG_PREFIX} OK: /tmp/agent-env does not exist (acceptable)"
fi

# ── 4. Heartbeat file exists and is recent ───────────────────────────
HEARTBEAT_FILE="${WORKSPACE}/heartbeats.jsonl"
if [ -f "${HEARTBEAT_FILE}" ]; then
  LAST_MOD=$(stat -c %Y "${HEARTBEAT_FILE}" 2>/dev/null || stat -f %m "${HEARTBEAT_FILE}" 2>/dev/null || echo "0")
  NOW=$(date +%s)
  AGE=$((NOW - LAST_MOD))
  if [ "${AGE}" -gt 1800 ]; then
    echo "${LOG_PREFIX} FAIL: Heartbeat file is stale (${AGE}s old, >1800s)"
    ISSUES=$((ISSUES + 1))
  else
    echo "${LOG_PREFIX} OK: Heartbeat file is fresh (${AGE}s old)"
  fi
else
  echo "${LOG_PREFIX} FAIL: Heartbeat file missing at ${HEARTBEAT_FILE}"
  ISSUES=$((ISSUES + 1))
fi

# ── 5. Workspace ownership ───────────────────────────────────────────
if [ -d "${WORKSPACE}" ]; then
  BAD_OWNER=$(find "${WORKSPACE}" -maxdepth 1 ! -user "$(id -un)" 2>/dev/null | head -5)
  if [ -n "${BAD_OWNER}" ]; then
    echo "${LOG_PREFIX} FAIL: Workspace has files not owned by $(id -un):"
    echo "${BAD_OWNER}"
    ISSUES=$((ISSUES + 1))
  else
    echo "${LOG_PREFIX} OK: Workspace ownership is correct"
  fi
else
  echo "${LOG_PREFIX} FAIL: Workspace directory missing"
  ISSUES=$((ISSUES + 1))
fi

# ── 6. No unexpected processes ───────────────────────────────────────
PROC_COUNT=$(ps aux 2>/dev/null | wc -l)
if [ "${PROC_COUNT}" -gt 50 ]; then
  echo "${LOG_PREFIX} FAIL: Unexpected process count (${PROC_COUNT} processes)"
  ISSUES=$((ISSUES + 1))
else
  echo "${LOG_PREFIX} OK: Process count normal (${PROC_COUNT})"
fi

# ── 7. Log directory size check ──────────────────────────────────────
LOG_DIR="/var/log/agent"
if [ -d "${LOG_DIR}" ]; then
  LOG_SIZE_KB=$(du -sk "${LOG_DIR}" 2>/dev/null | cut -f1)
  LOG_SIZE_MB=$((LOG_SIZE_KB / 1024))
  if [ "${LOG_SIZE_MB}" -gt 100 ]; then
    echo "${LOG_PREFIX} FAIL: Log directory is ${LOG_SIZE_MB}MB (>100MB)"
    ISSUES=$((ISSUES + 1))
  else
    echo "${LOG_PREFIX} OK: Log directory is ${LOG_SIZE_MB}MB"
  fi
else
  echo "${LOG_PREFIX} OK: No log directory (acceptable)"
fi

# ── 8. Disk usage check ─────────────────────────────────────────────
DISK_USAGE=$(df -h / 2>/dev/null | awk 'NR==2 {print $5}' | tr -d '%')
if [ -n "${DISK_USAGE}" ] && [ "${DISK_USAGE}" -gt 90 ]; then
  echo "${LOG_PREFIX} FAIL: Disk usage at ${DISK_USAGE}% (>90%)"
  ISSUES=$((ISSUES + 1))
else
  echo "${LOG_PREFIX} OK: Disk usage at ${DISK_USAGE:-unknown}%"
fi

# ── Report ───────────────────────────────────────────────────────────
echo "${LOG_PREFIX} Audit complete. Issues found: ${ISSUES}"

if [ "${ISSUES}" -gt 0 ]; then
  "${ALERT}" "warning" "${AGENT}" "Daily security audit found ${ISSUES} issue(s). Check security-audit.log for details."
else
  "${ALERT}" "info" "${AGENT}" "Daily security audit passed — all checks clean."
fi
