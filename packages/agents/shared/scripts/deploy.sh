#!/bin/bash
# Initial Deploy Script — Run from local machine to set up all 3 VPS
# Usage: bash deploy.sh
#
# Required env vars (or will prompt):
#   SENTINEL_HOST, ARBITER_HOST, STEWARD_HOST — VPS IPs
#   SSH_USER — default: lobstr
#   SSH_KEY_PATH — default: ~/.ssh/lobstr_agents
#   SSH_PORT — default: 2222
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
LOCAL_IMAGE="lobstr-agent:latest"

SSH_USER="${SSH_USER:-lobstr}"
SSH_KEY_PATH="${SSH_KEY_PATH:-$HOME/.ssh/lobstr_agents}"

echo "=== LOBSTR Agent Deploy ==="
echo ""
echo "Repo root: ${REPO_ROOT}"
echo "SSH user:  ${SSH_USER}"
echo "SSH key:   ${SSH_KEY_PATH}"
echo ""

# ── Prompt for VPS hosts if not set ─────────────────────────────────────
if [ -z "${SENTINEL_HOST:-}" ]; then
  read -rp "Sentinel VPS IP: " SENTINEL_HOST
fi
if [ -z "${ARBITER_HOST:-}" ]; then
  read -rp "Arbiter VPS IP: " ARBITER_HOST
fi
if [ -z "${STEWARD_HOST:-}" ]; then
  read -rp "Steward VPS IP: " STEWARD_HOST
fi

echo ""
echo "Hosts:"
echo "  Sentinel: ${SENTINEL_HOST}"
echo "  Arbiter:  ${ARBITER_HOST}"
echo "  Steward:  ${STEWARD_HOST}"
echo ""

# ── Build image locally ────────────────────────────────────────────────
echo "Building Docker image..."
docker build -t ${LOCAL_IMAGE} "${REPO_ROOT}/shared"
echo "Saving image tarball..."
docker save ${LOCAL_IMAGE} | gzip > /tmp/lobstr-agent.tar.gz
IMAGE_SIZE=$(du -h /tmp/lobstr-agent.tar.gz | cut -f1)
echo "Image saved: ${IMAGE_SIZE}"
echo ""

# ── Prompt for secrets ──────────────────────────────────────────────────
read -rsp "Discord webhook URL: " WEBHOOK_URL
echo ""
read -rsp "Base RPC URL: " RPC_URL
echo ""

SSH_PORT="${SSH_PORT:-2222}"
SSH_OPTS="-o StrictHostKeyChecking=accept-new -i ${SSH_KEY_PATH} -p ${SSH_PORT}"
SCP_OPTS="-o StrictHostKeyChecking=accept-new -i ${SSH_KEY_PATH} -P ${SSH_PORT}"

# ── Per-agent deploy function ───────────────────────────────────────────
deploy_agent() {
  local AGENT_NAME="$1"
  local HOST="$2"

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  Deploying ${AGENT_NAME} → ${HOST}"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  # Check if VPS setup is needed
  echo "[${AGENT_NAME}] Checking VPS readiness..."
  VPS_READY=$(ssh ${SSH_OPTS} "${SSH_USER}@${HOST}" \
    "test -d /opt/lobstr/compose && echo 'yes' || echo 'no'" 2>/dev/null || echo "no")

  if [ "${VPS_READY}" != "yes" ]; then
    echo "[${AGENT_NAME}] ERROR: VPS not set up. Run full-setup.sh as root on the VPS first."
    echo "  scp -P ${SSH_PORT} shared/scripts/full-setup.sh root@${HOST}:/tmp/full-setup.sh"
    echo "  ssh -p ${SSH_PORT} root@${HOST} 'bash /tmp/full-setup.sh'"
    return 1
  else
    echo "[${AGENT_NAME}] VPS already set up"
  fi

  # Copy agent compose workspace
  echo "[${AGENT_NAME}] Copying compose files..."
  scp ${SCP_OPTS} "${REPO_ROOT}/${AGENT_NAME}/docker-compose.yml" "${SSH_USER}@${HOST}:/opt/lobstr/compose/docker-compose.yml"
  scp ${SCP_OPTS} "${REPO_ROOT}/${AGENT_NAME}/SOUL.md" "${SSH_USER}@${HOST}:/opt/lobstr/compose/SOUL.md"
  scp ${SCP_OPTS} "${REPO_ROOT}/${AGENT_NAME}/HEARTBEAT.md" "${SSH_USER}@${HOST}:/opt/lobstr/compose/HEARTBEAT.md"
  scp ${SCP_OPTS} "${REPO_ROOT}/${AGENT_NAME}/crontab" "${SSH_USER}@${HOST}:/opt/lobstr/compose/crontab"

  # Prompt for agent-specific wallet password
  read -rsp "[${AGENT_NAME}] Wallet password: " WALLET_PASSWORD
  echo ""

  # Write secrets on VPS
  echo "[${AGENT_NAME}] Writing secrets..."
  ssh ${SSH_OPTS} "${SSH_USER}@${HOST}" bash <<REMOTEOF
    echo '${WALLET_PASSWORD}' > /opt/lobstr/secrets/wallet_password
    echo '${WEBHOOK_URL}' > /opt/lobstr/secrets/webhook_url
    echo '${RPC_URL}' > /opt/lobstr/secrets/rpc_url
    chmod 644 /opt/lobstr/secrets/*
REMOTEOF

  # Check if workspace data exists
  WORKSPACE_EXISTS=$(ssh ${SSH_OPTS} "${SSH_USER}@${HOST}" \
    "docker volume ls -q | grep -q '${AGENT_NAME}-data' && echo 'yes' || echo 'no'" 2>/dev/null || echo "no")

  if [ "${WORKSPACE_EXISTS}" != "yes" ]; then
    echo "[${AGENT_NAME}] WARNING: No workspace volume found."
    echo "  You need to copy the initialized workspace to the VPS:"
    echo "  docker cp ./agent-workspaces/${AGENT_NAME}/. lobstr-${AGENT_NAME}:/data/workspace/"
    echo "  Or mount a pre-initialized workspace directory."
  fi

  # Transfer image and start container
  echo "[${AGENT_NAME}] Transferring image (this may take a minute)..."
  scp ${SCP_OPTS} /tmp/lobstr-agent.tar.gz "${SSH_USER}@${HOST}:/tmp/lobstr-agent.tar.gz"

  echo "[${AGENT_NAME}] Loading image and starting container..."
  ssh ${SSH_OPTS} "${SSH_USER}@${HOST}" bash <<REMOTEOF
    docker load < /tmp/lobstr-agent.tar.gz
    rm -f /tmp/lobstr-agent.tar.gz
    cd /opt/lobstr/compose
    docker compose up -d
REMOTEOF

  # Health check
  sleep 5
  echo "[${AGENT_NAME}] Health check..."
  RUNNING=$(ssh ${SSH_OPTS} "${SSH_USER}@${HOST}" \
    "docker ps --filter 'name=lobstr-${AGENT_NAME}' --filter 'status=running' -q" 2>/dev/null || echo "")

  if [ -n "${RUNNING}" ]; then
    echo "[${AGENT_NAME}] Container is running"
  else
    echo "[${AGENT_NAME}] ERROR: Container failed to start"
    ssh ${SSH_OPTS} "${SSH_USER}@${HOST}" "docker logs lobstr-${AGENT_NAME} --tail 20" 2>/dev/null || true
  fi
}

# ── Deploy all 3 agents ────────────────────────────────────────────────
deploy_agent "sentinel" "${SENTINEL_HOST}"
deploy_agent "arbiter"  "${ARBITER_HOST}"
deploy_agent "steward"  "${STEWARD_HOST}"

echo ""
echo "=== Deploy Complete ==="
echo ""
echo "Next steps:"
echo "  1. SSH into each VPS and verify: docker logs lobstr-<agent> --tail 20"
echo "  2. Check Discord for startup alerts from all 3 agents"
echo "  3. If workspace not initialized, run init-workspace.sh first,"
echo "     then copy workspace data to each VPS"
echo "  4. Run grant-roles.sh to set up on-chain roles"
echo "  5. Configure GH repo secrets for CI/CD deploys:"
echo "     SENTINEL_HOST, ARBITER_HOST, STEWARD_HOST"
echo "     SENTINEL_SSH_KEY, ARBITER_SSH_KEY, STEWARD_SSH_KEY"
echo "     VPS_SSH_USER"
