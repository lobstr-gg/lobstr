#!/bin/bash
# Initialize 3 OpenClaw workspaces + wallets locally
# Run this on your LOCAL machine before deploying to VPS
# Usage: bash init-workspace.sh <output_dir>
set -euo pipefail

OUTPUT_DIR="${1:-./agent-workspaces}"

echo "=== LOBSTR Agent Workspace Initializer ==="
echo "Output directory: ${OUTPUT_DIR}"
echo ""

AGENTS=("sentinel" "arbiter" "steward")

for AGENT in "${AGENTS[@]}"; do
  AGENT_DIR="${OUTPUT_DIR}/${AGENT}"
  echo "──────────────────────────────────────"
  echo "Creating workspace for: ${AGENT}"
  echo "──────────────────────────────────────"

  mkdir -p "${AGENT_DIR}"

  # Create workspace via OpenClaw CLI
  # This will generate config.json and prompt for wallet creation
  echo "Initializing OpenClaw workspace..."
  (cd "${AGENT_DIR}" && npx lobstr init --name "${AGENT}")

  echo ""
  echo "[${AGENT}] Workspace created at: ${AGENT_DIR}"

  # Extract wallet address if wallet.json exists
  if [ -f "${AGENT_DIR}/wallet.json" ]; then
    ADDRESS=$(jq -r '.address // "unknown"' "${AGENT_DIR}/wallet.json" 2>/dev/null || echo "unknown")
    echo "[${AGENT}] Wallet address: ${ADDRESS}"
  fi

  echo ""
done

echo "=== All Workspaces Created ==="
echo ""
echo "Wallet addresses to fund (need ETH for gas + LOB for staking):"
echo ""

for AGENT in "${AGENTS[@]}"; do
  WALLET="${OUTPUT_DIR}/${AGENT}/wallet.json"
  if [ -f "${WALLET}" ]; then
    ADDRESS=$(jq -r '.address // "check manually"' "${WALLET}" 2>/dev/null || echo "check manually")
    echo "  ${AGENT}: ${ADDRESS}"
  fi
done

echo ""
echo "Required funding per agent:"
echo "  - Sentinel: 0.05 ETH (gas) + 5,000 LOB (junior arbitrator stake)"
echo "  - Arbiter:  0.05 ETH (gas) + 25,000 LOB (senior arbitrator stake)"
echo "  - Steward:  0.05 ETH (gas) + 5,000 LOB (junior arbitrator stake)"
echo ""
echo "Next steps:"
echo "  1. Fund all 3 wallet addresses above"
echo "  2. Copy each workspace dir to its VPS at /opt/lobstr/data/"
echo "  3. Store wallet passwords in /opt/lobstr/secrets/wallet_password on each VPS"
echo "  4. Run grant-roles.sh to set up on-chain roles"
