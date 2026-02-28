#!/usr/bin/env bash
#
# deploy-zkeys.sh — Push canonical ZK circuit artifacts to agent VPS boxes
#
# Copies the zkeys, wasm, and verification keys from the local circuits build
# into each agent's running Docker container via the writable workspace volume.
#
# Usage:
#   ./scripts/deploy-zkeys.sh                    # deploy to all agents
#   ./scripts/deploy-zkeys.sh arbiter            # deploy to one agent
#   ./scripts/deploy-zkeys.sh --sync-shared      # also update shared/circuits/ for future image builds
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_DIR="${REPO_ROOT}/packages/circuits/build"
SHARED_DIR="${REPO_ROOT}/packages/agents/shared/circuits"

# ── VPS Configuration ────────────────────────────────────────────────────
# Format: AGENT_NAME:SSH_HOST:CONTAINER_NAME
# Update these to match your VPS SSH hosts.
AGENTS=(
  "arbiter:vps-arbiter:lobstr-arbiter"
  "sentinel:vps-sentinel:lobstr-sentinel"
  "steward:vps-steward:lobstr-steward"
)

# SSH options for non-interactive use
SSH_OPTS="-o StrictHostKeyChecking=accept-new -o ConnectTimeout=10"

# ── Required artifacts ───────────────────────────────────────────────────
ARTIFACTS=(
  "airdropAttestation_0001.zkey"
  "airdropAttestation_js/airdropAttestation.wasm"
  "verification_key.json"
  "roleUptime_0001.zkey"
  "roleUptime_js/roleUptime.wasm"
  "roleUptime_verification_key.json"
)

# Flat names for the destination (no subdirectories inside /data/workspace/circuits/)
DEST_NAMES=(
  "airdropAttestation_0001.zkey"
  "airdropAttestation.wasm"
  "verification_key.json"
  "roleUptime_0001.zkey"
  "roleUptime.wasm"
  "roleUptime_verification_key.json"
)

# ── Helpers ──────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[deploy-zkeys]${NC} $*"; }
warn() { echo -e "${YELLOW}[deploy-zkeys]${NC} $*"; }
err()  { echo -e "${RED}[deploy-zkeys]${NC} $*" >&2; }

# ── Verify local build artifacts exist ───────────────────────────────────
verify_artifacts() {
  log "Verifying local build artifacts in ${BUILD_DIR}..."
  local missing=0
  for i in "${!ARTIFACTS[@]}"; do
    local src="${BUILD_DIR}/${ARTIFACTS[$i]}"
    if [ ! -f "$src" ]; then
      err "Missing: ${src}"
      missing=1
    fi
  done
  if [ "$missing" -eq 1 ]; then
    err "Build artifacts incomplete. Run the trusted setup first:"
    err "  cd packages/circuits && bash scripts/compile.sh && bash scripts/setup.sh"
    exit 1
  fi
  log "All artifacts present."
}

# ── Sync to shared/circuits/ (for future Docker image builds) ────────────
sync_shared() {
  log "Syncing artifacts to ${SHARED_DIR} (for future image builds)..."
  mkdir -p "$SHARED_DIR"
  for i in "${!ARTIFACTS[@]}"; do
    local src="${BUILD_DIR}/${ARTIFACTS[$i]}"
    local dst="${SHARED_DIR}/${DEST_NAMES[$i]}"
    cp "$src" "$dst"
    log "  $(basename "$dst") ($(du -h "$dst" | cut -f1))"
  done
  log "shared/circuits/ updated. Rebuild Docker image to bake these in."
}

# ── Deploy to a single agent VPS ─────────────────────────────────────────
deploy_to_agent() {
  local agent_name="$1"
  local ssh_host="$2"
  local container="$3"

  log "━━━ Deploying to ${agent_name} (${ssh_host}) ━━━"

  # 1. Create staging dir on VPS
  log "  Creating staging directory on ${ssh_host}..."
  # shellcheck disable=SC2086
  ssh $SSH_OPTS "$ssh_host" "mkdir -p /tmp/zkey-deploy"

  # 2. SCP artifacts to VPS
  log "  Uploading artifacts..."
  for i in "${!ARTIFACTS[@]}"; do
    local src="${BUILD_DIR}/${ARTIFACTS[$i]}"
    local name="${DEST_NAMES[$i]}"
    log "    ${name} ($(du -h "$src" | cut -f1))..."
    # shellcheck disable=SC2086
    scp $SSH_OPTS "$src" "${ssh_host}:/tmp/zkey-deploy/${name}"
  done

  # 3. Docker cp into the running container's workspace
  log "  Copying into container ${container}..."
  # shellcheck disable=SC2086
  ssh $SSH_OPTS "$ssh_host" bash <<REMOTE
set -euo pipefail

# Create circuits dir in workspace volume
docker exec "${container}" mkdir -p /data/workspace/circuits

# Copy each artifact into the container
for f in /tmp/zkey-deploy/*; do
  name=\$(basename "\$f")
  docker cp "\$f" "${container}:/data/workspace/circuits/\${name}"
  echo "  [remote] Copied \${name}"
done

# Verify inside container
echo "  [remote] Verifying..."
docker exec "${container}" ls -lh /data/workspace/circuits/

# Cleanup staging
rm -rf /tmp/zkey-deploy
echo "  [remote] Staging cleaned up"
REMOTE

  log "  ${agent_name} done."
}

# ── Main ─────────────────────────────────────────────────────────────────
main() {
  local target_agent=""
  local do_sync=0

  for arg in "$@"; do
    case "$arg" in
      --sync-shared) do_sync=1 ;;
      --help|-h)
        echo "Usage: $0 [agent_name] [--sync-shared]"
        echo ""
        echo "Deploys ZK circuit artifacts (zkeys, wasm, verification keys) to agent VPS boxes."
        echo ""
        echo "Options:"
        echo "  agent_name      Deploy to a single agent (arbiter, sentinel, steward)"
        echo "  --sync-shared   Also copy artifacts to shared/circuits/ for future Docker builds"
        echo ""
        echo "Configure VPS hosts by editing the AGENTS array in this script,"
        echo "or set environment variables:"
        echo "  VPS_ARBITER=user@host  VPS_SENTINEL=user@host  VPS_STEWARD=user@host"
        exit 0
        ;;
      *) target_agent="$arg" ;;
    esac
  done

  # Allow env var overrides for SSH hosts
  if [ -n "${VPS_ARBITER:-}" ]; then
    AGENTS[0]="arbiter:${VPS_ARBITER}:lobstr-arbiter"
  fi
  if [ -n "${VPS_SENTINEL:-}" ]; then
    AGENTS[1]="sentinel:${VPS_SENTINEL}:lobstr-sentinel"
  fi
  if [ -n "${VPS_STEWARD:-}" ]; then
    AGENTS[2]="steward:${VPS_STEWARD}:lobstr-steward"
  fi

  verify_artifacts

  if [ "$do_sync" -eq 1 ]; then
    sync_shared
  fi

  local deployed=0
  for entry in "${AGENTS[@]}"; do
    IFS=':' read -r name host container <<< "$entry"
    if [ -n "$target_agent" ] && [ "$target_agent" != "$name" ]; then
      continue
    fi
    deploy_to_agent "$name" "$host" "$container"
    deployed=$((deployed + 1))
  done

  if [ "$deployed" -eq 0 ] && [ -n "$target_agent" ]; then
    err "Unknown agent: ${target_agent}"
    err "Available: arbiter, sentinel, steward"
    exit 1
  fi

  echo ""
  log "Deploy complete. ${deployed} agent(s) updated."
  log ""
  log "Agents can now run:"
  log "  lobstr attestation prove"
  log "  lobstr airdrop submit-attestation"
}

main "$@"
