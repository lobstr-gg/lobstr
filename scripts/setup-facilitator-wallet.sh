#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# setup-facilitator-wallet.sh
#
# Grants FACILITATOR_ROLE to the dedicated X402 facilitator wallet, revokes
# Titus's facilitator access on the Bridge, and transfers Bridge admin to
# TreasuryGovernor.
#
# Prerequisites:
#   - cast (Foundry) installed
#   - TITUS_KEY env var set (Titus's private key — admin of X402EscrowBridge)
#   - A TreasuryGovernor multisig proposal for X402CreditFacility (Step 2)
#
# Usage:
#   export TITUS_KEY=0x...
#   bash scripts/setup-facilitator-wallet.sh
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ─── Addresses ────────────────────────────────────────────────────────────────

FACILITATOR_WALLET="0x97876BD417f919Bd7fcF194Db274Ae68E703407B"
TITUS_WALLET="0x8a1C742A8A2F4f7C1295443809acE281723650fb"
TREASURY_GOVERNOR="0x905f8b6bd8264cca4d7f5a5b834af45a1b9fce27"
X402_CREDIT_FACILITY="0x124dd81b5d0e903704e5854a6fbc2dc8f954e6ca"
X402_ESCROW_BRIDGE="0x62baf62c541fa1c1d11c4a9dad733db47485ca12"

RPC="https://mainnet.base.org"

# FACILITATOR_ROLE = keccak256("FACILITATOR_ROLE")
FACILITATOR_ROLE=$(cast keccak "FACILITATOR_ROLE")
# DEFAULT_ADMIN_ROLE = 0x00...00
DEFAULT_ADMIN_ROLE="0x0000000000000000000000000000000000000000000000000000000000000000"

echo "═══════════════════════════════════════════════════════════════"
echo "  X402 Dedicated Facilitator Wallet Setup"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "  Facilitator wallet:  $FACILITATOR_WALLET"
echo "  FACILITATOR_ROLE:    $FACILITATOR_ROLE"
echo ""

# ─── Verify env ──────────────────────────────────────────────────────────────

if [ -z "${TITUS_KEY:-}" ]; then
  echo "ERROR: TITUS_KEY env var not set"
  echo "  export TITUS_KEY=0x..."
  exit 1
fi

# ─── Step 2: CreditFacility — requires multisig proposal ────────────────────

echo "─── Step 2: X402CreditFacility (TreasuryGovernor multisig) ──────"
echo ""
echo "Admin = TreasuryGovernor. This requires a multisig proposal."
echo ""

GRANT_CALLDATA=$(cast calldata "grantRole(bytes32,address)" "$FACILITATOR_ROLE" "$FACILITATOR_WALLET")
echo "Encoded calldata for grantRole:"
echo "  $GRANT_CALLDATA"
echo ""

read -p "Submit multisig proposal now? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo "Submitting createAdminProposal to TreasuryGovernor..."
  cast send "$TREASURY_GOVERNOR" \
    "createAdminProposal(address,bytes,string)" \
    "$X402_CREDIT_FACILITY" \
    "$GRANT_CALLDATA" \
    "Grant FACILITATOR_ROLE to dedicated x402 facilitator wallet (0x97876BD417f919Bd7fcF194Db274Ae68E703407B)" \
    --rpc-url "$RPC" \
    --private-key "$TITUS_KEY"
  echo "✓ Proposal submitted. Needs 3/4 signer approvals + 24h timelock."
else
  echo "Skipped. You can submit the proposal manually:"
  echo "  cast send $TREASURY_GOVERNOR \\"
  echo "    \"createAdminProposal(address,bytes,string)\" \\"
  echo "    $X402_CREDIT_FACILITY \\"
  echo "    $GRANT_CALLDATA \\"
  echo "    \"Grant FACILITATOR_ROLE to dedicated x402 facilitator wallet\" \\"
  echo "    --rpc-url $RPC --private-key \$SIGNER_KEY"
fi
echo ""

# ─── Step 3: Grant FACILITATOR_ROLE on Bridge ───────────────────────────────

echo "─── Step 3: Grant FACILITATOR_ROLE on X402EscrowBridge ──────────"
echo "Admin = Titus (direct grant, no multisig needed)"
echo ""

read -p "Grant FACILITATOR_ROLE to $FACILITATOR_WALLET on Bridge? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
  cast send "$X402_ESCROW_BRIDGE" \
    "grantRole(bytes32,address)" \
    "$FACILITATOR_ROLE" \
    "$FACILITATOR_WALLET" \
    --rpc-url "$RPC" \
    --private-key "$TITUS_KEY"
  echo "✓ FACILITATOR_ROLE granted on Bridge."
else
  echo "Skipped."
fi
echo ""

# ─── Step 4: Revoke Titus FACILITATOR_ROLE on Bridge ────────────────────────

echo "─── Step 4: Revoke Titus's FACILITATOR_ROLE on Bridge ───────────"
echo ""

read -p "Revoke Titus ($TITUS_WALLET) FACILITATOR_ROLE on Bridge? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
  cast send "$X402_ESCROW_BRIDGE" \
    "revokeRole(bytes32,address)" \
    "$FACILITATOR_ROLE" \
    "$TITUS_WALLET" \
    --rpc-url "$RPC" \
    --private-key "$TITUS_KEY"
  echo "✓ Titus FACILITATOR_ROLE revoked on Bridge."
else
  echo "Skipped."
fi
echo ""

# ─── Step 5: Transfer Bridge admin to TreasuryGovernor ──────────────────────

echo "─── Step 5: Transfer Bridge admin to TreasuryGovernor ───────────"
echo ""

read -p "Grant DEFAULT_ADMIN_ROLE to TreasuryGovernor on Bridge? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo "Granting admin to TreasuryGovernor..."
  cast send "$X402_ESCROW_BRIDGE" \
    "grantRole(bytes32,address)" \
    "$DEFAULT_ADMIN_ROLE" \
    "$TREASURY_GOVERNOR" \
    --rpc-url "$RPC" \
    --private-key "$TITUS_KEY"
  echo "✓ TreasuryGovernor granted admin on Bridge."
  echo ""

  read -p "Renounce Titus admin on Bridge? (IRREVERSIBLE) (y/n) " -n 1 -r
  echo ""
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    cast send "$X402_ESCROW_BRIDGE" \
      "renounceRole(bytes32,address)" \
      "$DEFAULT_ADMIN_ROLE" \
      "$TITUS_WALLET" \
      --rpc-url "$RPC" \
      --private-key "$TITUS_KEY"
    echo "✓ Titus renounced admin on Bridge. TreasuryGovernor is now sole admin."
  else
    echo "Skipped renounce. Titus retains admin alongside TreasuryGovernor."
  fi
else
  echo "Skipped admin transfer."
fi
echo ""

# ─── Verification ───────────────────────────────────────────────────────────

echo "═══════════════════════════════════════════════════════════════"
echo "  Verification"
echo "═══════════════════════════════════════════════════════════════"
echo ""

echo "Checking FACILITATOR_ROLE on X402EscrowBridge..."
BRIDGE_HAS_ROLE=$(cast call "$X402_ESCROW_BRIDGE" "hasRole(bytes32,address)(bool)" "$FACILITATOR_ROLE" "$FACILITATOR_WALLET" --rpc-url "$RPC")
echo "  New wallet has FACILITATOR_ROLE on Bridge: $BRIDGE_HAS_ROLE"

echo ""
echo "Checking FACILITATOR_ROLE on X402CreditFacility..."
CREDIT_HAS_ROLE=$(cast call "$X402_CREDIT_FACILITY" "hasRole(bytes32,address)(bool)" "$FACILITATOR_ROLE" "$FACILITATOR_WALLET" --rpc-url "$RPC")
echo "  New wallet has FACILITATOR_ROLE on CreditFacility: $CREDIT_HAS_ROLE"

echo ""
echo "Checking Titus FACILITATOR_ROLE on Bridge (should be false)..."
TITUS_BRIDGE_ROLE=$(cast call "$X402_ESCROW_BRIDGE" "hasRole(bytes32,address)(bool)" "$FACILITATOR_ROLE" "$TITUS_WALLET" --rpc-url "$RPC")
echo "  Titus has FACILITATOR_ROLE on Bridge: $TITUS_BRIDGE_ROLE"

echo ""
echo "Checking TreasuryGovernor admin on Bridge..."
GOVERNOR_ADMIN=$(cast call "$X402_ESCROW_BRIDGE" "hasRole(bytes32,address)(bool)" "$DEFAULT_ADMIN_ROLE" "$TREASURY_GOVERNOR" --rpc-url "$RPC")
echo "  TreasuryGovernor has admin on Bridge: $GOVERNOR_ADMIN"

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Next steps:"
echo "  1. Fund $FACILITATOR_WALLET with ~0.01 ETH on Base"
echo "  2. Set FACILITATOR_PRIVATE_KEY in x402-facilitator production env"
echo "  3. Wait for CreditFacility multisig proposal (3/4 approve + 24h)"
echo "  4. Deploy facilitator service"
echo "═══════════════════════════════════════════════════════════════"
