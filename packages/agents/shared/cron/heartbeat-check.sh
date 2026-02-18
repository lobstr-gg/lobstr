#!/bin/bash
# Heartbeat Check — Alert if heartbeat stale > 15 min, auto-restart daemon
# Invoked by cron every 5 minutes
set -euo pipefail

source /etc/environment 2>/dev/null || true

AGENT="${AGENT_NAME:-unknown}"
WORKSPACE="${WORKSPACE_DIR:-/data/workspace}"
ALERT="/opt/scripts/alert.sh"
LOG_PREFIX="[heartbeat-check]"
STALE_THRESHOLD=900  # 15 minutes in seconds
HEARTBEAT_FILE="${WORKSPACE}/heartbeats.jsonl"

echo "${LOG_PREFIX} Checking heartbeat freshness for ${AGENT}..."

# Check if heartbeat file exists
if [ ! -f "${HEARTBEAT_FILE}" ]; then
  "${ALERT}" "critical" "${AGENT}" "Heartbeat file missing! Daemon may not be running."

  # Attempt restart
  echo "${LOG_PREFIX} Attempting heartbeat daemon restart..."
  cd "${WORKSPACE}"
  nohup npx lobstr heartbeat start > /var/log/agent/heartbeat.log 2>&1 &
  "${ALERT}" "info" "${AGENT}" "Heartbeat daemon restart attempted."
  exit 0
fi

# Get last heartbeat timestamp
LAST_LINE=$(tail -1 "${HEARTBEAT_FILE}" 2>/dev/null || echo "")

if [ -z "${LAST_LINE}" ]; then
  "${ALERT}" "warning" "${AGENT}" "Heartbeat file is empty."
  exit 0
fi

LAST_TS=$(echo "${LAST_LINE}" | jq -r '.timestamp // 0' 2>/dev/null || echo "0")
NOW=$(date +%s)
AGE=$((NOW - LAST_TS))

echo "${LOG_PREFIX} Last heartbeat: ${AGE}s ago (threshold: ${STALE_THRESHOLD}s)"

if [ "${AGE}" -gt "${STALE_THRESHOLD}" ]; then
  "${ALERT}" "critical" "${AGENT}" "Heartbeat stale! Last beat was ${AGE}s ago (>${STALE_THRESHOLD}s). Restarting daemon..."

  # Kill existing heartbeat process if any
  pkill -f "lobstr heartbeat" 2>/dev/null || true
  sleep 2

  # Restart
  cd "${WORKSPACE}"
  nohup npx lobstr heartbeat start > /var/log/agent/heartbeat.log 2>&1 &
  "${ALERT}" "info" "${AGENT}" "Heartbeat daemon restarted."
else
  echo "${LOG_PREFIX} Heartbeat healthy (${AGE}s old)"
fi
