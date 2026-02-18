#!/bin/bash
# On-chain role grant instructions for founding agents
# This script documents the admin proposal sequence.
# Execute each step via the DAO admin or deployer wallet.
set -euo pipefail

echo "=== LOBSTR Founding Agent Role Grants ==="
echo ""
echo "Prerequisites:"
echo "  - All 3 agent wallets are funded with ETH + LOB"
echo "  - You have deployer/admin access to the contracts"
echo "  - Contract addresses are configured in each workspace"
echo ""

if [ -z "${SENTINEL_ADDRESS:-}" ] || [ -z "${ARBITER_ADDRESS:-}" ] || [ -z "${STEWARD_ADDRESS:-}" ]; then
  echo "Usage: Set environment variables before running:"
  echo "  export SENTINEL_ADDRESS=0x..."
  echo "  export ARBITER_ADDRESS=0x..."
  echo "  export STEWARD_ADDRESS=0x..."
  echo ""
  echo "Then re-run this script."
  exit 1
fi

echo "Agent addresses:"
echo "  Sentinel: ${SENTINEL_ADDRESS}"
echo "  Arbiter:  ${ARBITER_ADDRESS}"
echo "  Steward:  ${STEWARD_ADDRESS}"
echo ""

cat << 'EOF'
─── Step 1: SybilGuard Role Grants ───────────────────────────────────

Grant WATCHER_ROLE to Sentinel (primary moderator):
  lobstr admin grant-role --contract SybilGuard --role WATCHER_ROLE --account $SENTINEL_ADDRESS

Grant JUDGE_ROLE to all 3 agents:
  lobstr admin grant-role --contract SybilGuard --role JUDGE_ROLE --account $SENTINEL_ADDRESS
  lobstr admin grant-role --contract SybilGuard --role JUDGE_ROLE --account $ARBITER_ADDRESS
  lobstr admin grant-role --contract SybilGuard --role JUDGE_ROLE --account $STEWARD_ADDRESS

─── Step 2: DisputeArbitration Staking ───────────────────────────────

Each agent must stake LOB tokens to become an arbitrator.
Run from each agent's workspace:

  Sentinel (Junior — 5,000 LOB):
    lobstr stake deposit --amount 5000

  Arbiter (Senior — 25,000 LOB):
    lobstr stake deposit --amount 25000

  Steward (Junior — 5,000 LOB):
    lobstr stake deposit --amount 5000

─── Step 3: TreasuryGovernor Multisig Setup ──────────────────────────

Add all 3 agents as GUARDIAN signers (2-of-3 multisig):
  lobstr admin grant-role --contract TreasuryGovernor --role GUARDIAN_ROLE --account $SENTINEL_ADDRESS
  lobstr admin grant-role --contract TreasuryGovernor --role GUARDIAN_ROLE --account $ARBITER_ADDRESS
  lobstr admin grant-role --contract TreasuryGovernor --role GUARDIAN_ROLE --account $STEWARD_ADDRESS

─── Step 4: Verification ────────────────────────────────────────────

Check roles from each agent's workspace:
  lobstr admin check-role --contract SybilGuard --role WATCHER_ROLE --account $SENTINEL_ADDRESS
  lobstr admin check-role --contract SybilGuard --role JUDGE_ROLE --account $SENTINEL_ADDRESS
  lobstr admin check-role --contract TreasuryGovernor --role GUARDIAN_ROLE --account $SENTINEL_ADDRESS
  (repeat for ARBITER and STEWARD)

Check stakes:
  lobstr stake info --account $SENTINEL_ADDRESS
  lobstr stake info --account $ARBITER_ADDRESS
  lobstr stake info --account $STEWARD_ADDRESS

EOF

echo "=== Done ==="
