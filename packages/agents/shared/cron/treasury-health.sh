#!/bin/bash
# Treasury Health — Balance, gas, and runway checks
# Invoked by cron, alerts on low balances
set -euo pipefail

source /etc/environment 2>/dev/null || true

AGENT="${AGENT_NAME:-unknown}"
WORKSPACE="${WORKSPACE_DIR:-/data/workspace}"
ALERT="/opt/scripts/alert.sh"
LOG_PREFIX="[treasury-health]"

# Thresholds
MIN_GAS_ETH="0.01"
MIN_LOB_BALANCE="1000"

echo "${LOG_PREFIX} Running treasury health check for ${AGENT}..."

cd "${WORKSPACE}"

# ── Agent wallet balance ───────────────────────────────────────────────
WALLET_INFO=$(npx lobstr wallet balance --format json 2>/dev/null || echo "{}")

ETH_BALANCE=$(echo "${WALLET_INFO}" | jq -r '.ethBalance // "0"' 2>/dev/null || echo "0")
LOB_BALANCE=$(echo "${WALLET_INFO}" | jq -r '.lobBalance // "0"' 2>/dev/null || echo "0")

echo "${LOG_PREFIX} Agent wallet: ${ETH_BALANCE} ETH, ${LOB_BALANCE} LOB"

# Check gas threshold
GAS_LOW=$(echo "${ETH_BALANCE} < ${MIN_GAS_ETH}" | bc -l 2>/dev/null || echo "0")
if [ "${GAS_LOW}" = "1" ]; then
  "${ALERT}" "critical" "${AGENT}" "LOW GAS: ${ETH_BALANCE} ETH — below ${MIN_GAS_ETH} ETH threshold. Refill immediately!"
fi

# ── DAO treasury balance ───────────────────────────────────────────────
TREASURY_INFO=$(npx lobstr dao treasury --format json 2>/dev/null || echo "{}")

if [ -n "${TREASURY_INFO}" ] && [ "${TREASURY_INFO}" != "{}" ]; then
  TREASURY_ETH=$(echo "${TREASURY_INFO}" | jq -r '.ethBalance // "unknown"' 2>/dev/null || echo "unknown")
  TREASURY_LOB=$(echo "${TREASURY_INFO}" | jq -r '.lobBalance // "unknown"' 2>/dev/null || echo "unknown")
  echo "${LOG_PREFIX} DAO treasury: ${TREASURY_ETH} ETH, ${TREASURY_LOB} LOB"
fi

# ── Stake health (for arbitrators) ────────────────────────────────────
STAKE_INFO=$(npx lobstr stake info --format json 2>/dev/null || echo "{}")

if [ -n "${STAKE_INFO}" ] && [ "${STAKE_INFO}" != "{}" ]; then
  STAKED=$(echo "${STAKE_INFO}" | jq -r '.stakedAmount // "0"' 2>/dev/null || echo "0")
  TIER=$(echo "${STAKE_INFO}" | jq -r '.tier // "none"' 2>/dev/null || echo "none")
  echo "${LOG_PREFIX} Stake: ${STAKED} LOB (tier: ${TIER})"
fi

# ── V3 contract balance checks ─────────────────────────────────────────
echo "${LOG_PREFIX} Checking V3 contract balances..."

REWARDS_STATUS=$(npx lobstr rewards status --format json 2>/dev/null || echo '{}')
REWARDS_EARNED=$(echo "$REWARDS_STATUS" | jq -r '.totalEarned // "0"' 2>/dev/null || echo "0")
echo "${LOG_PREFIX} StakingRewards earned: $REWARDS_EARNED"

INSURANCE_STATUS=$(npx lobstr insurance status --format json 2>/dev/null || echo '{}')
INSURANCE_DEPOSIT=$(echo "$INSURANCE_STATUS" | jq -r '.deposit // "0"' 2>/dev/null || echo "0")
echo "${LOG_PREFIX} InsurancePool deposit: $INSURANCE_DEPOSIT"

FARMING_STATUS=$(npx lobstr farming status --format json 2>/dev/null || echo '{}')
FARMING_STAKED=$(echo "$FARMING_STATUS" | jq -r '.staked // "0"' 2>/dev/null || echo "0")
echo "${LOG_PREFIX} LiquidityMining staked: $FARMING_STAKED"

echo "${LOG_PREFIX} Health check complete"
