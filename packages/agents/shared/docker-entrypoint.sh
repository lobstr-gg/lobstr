#!/bin/bash
set -euo pipefail

AGENT_NAME="${AGENT_NAME:-unknown}"
WORKSPACE_DIR="${WORKSPACE_DIR:-/data/workspace}"
CRONTAB_FILE="${CRONTAB_FILE:-/etc/agent/crontab}"

echo "[entrypoint] Starting agent: ${AGENT_NAME}"

# ── 1. Read secrets from Docker secret mounts ──────────────────────────
if [ -f /run/secrets/wallet_password ]; then
  export OPENCLAW_PASSWORD
  OPENCLAW_PASSWORD="$(cat /run/secrets/wallet_password)"
  echo "[entrypoint] Wallet password loaded from secret"
else
  echo "[entrypoint] WARNING: No wallet_password secret mounted"
fi

if [ -f /run/secrets/webhook_url ]; then
  export LOBSTR_WEBHOOK_URL
  LOBSTR_WEBHOOK_URL="$(cat /run/secrets/webhook_url)"
  echo "[entrypoint] Webhook URL loaded from secret"
fi

if [ -f /run/secrets/rpc_url ]; then
  export OPENCLAW_RPC_URL
  OPENCLAW_RPC_URL="$(cat /run/secrets/rpc_url)"
  echo "[entrypoint] RPC URL loaded from secret"
fi

# ── 2. Verify workspace ────────────────────────────────────────────────
if [ ! -f "${WORKSPACE_DIR}/config.json" ]; then
  echo "[entrypoint] ERROR: Missing ${WORKSPACE_DIR}/config.json"
  echo "[entrypoint] Mount a pre-initialized workspace volume at ${WORKSPACE_DIR}"
  exit 1
fi

if [ ! -f "${WORKSPACE_DIR}/wallet.json" ]; then
  echo "[entrypoint] ERROR: Missing ${WORKSPACE_DIR}/wallet.json"
  echo "[entrypoint] Mount a pre-initialized workspace volume at ${WORKSPACE_DIR}"
  exit 1
fi

echo "[entrypoint] Workspace verified at ${WORKSPACE_DIR}"

# ── 3. Export env vars for cron jobs (cron doesn't inherit env) ────────
printenv | grep -E '^(OPENCLAW_|LOBSTR_|AGENT_|WORKSPACE_|PATH=)' > /etc/environment 2>/dev/null || true

# ── 4. Start heartbeat daemon ──────────────────────────────────────────
echo "[entrypoint] Starting heartbeat daemon..."
cd "${WORKSPACE_DIR}"
nohup npx lobstr heartbeat start > /var/log/agent/heartbeat.log 2>&1 &
HEARTBEAT_PID=$!
echo "[entrypoint] Heartbeat started (PID: ${HEARTBEAT_PID})"

# ── 5. Install agent-specific crontab ──────────────────────────────────
if [ -f "${CRONTAB_FILE}" ]; then
  crontab "${CRONTAB_FILE}"
  echo "[entrypoint] Crontab installed from ${CRONTAB_FILE}"
else
  echo "[entrypoint] WARNING: No crontab found at ${CRONTAB_FILE}"
fi

# ── 6. Send startup alert ─────────────────────────────────────────────
/opt/scripts/alert.sh "info" "${AGENT_NAME}" "Agent started successfully on $(hostname)"

echo "[entrypoint] Agent ${AGENT_NAME} is running. Starting cron..."

# ── 7. Run cron in foreground (keeps container alive) ──────────────────
exec cron -f
