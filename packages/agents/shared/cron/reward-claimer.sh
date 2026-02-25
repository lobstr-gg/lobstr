#!/usr/bin/env bash
# reward-claimer.sh — Auto-claim StakingRewards + RewardDistributor payouts
set -euo pipefail
source /tmp/agent-env 2>/dev/null || true

LOG="/var/log/agent/reward-claimer.log"

echo "[$(date -u +%FT%TZ)] Checking reward balances..." >> "$LOG"

EARNED=$(npx lobstr rewards pending --format json 2>/dev/null || echo '{}')
STAKING_EARNED=$(echo "$EARNED" | jq -r '.stakingRewards // "0"' 2>/dev/null || echo "0")
DISTRIBUTOR_EARNED=$(echo "$EARNED" | jq -r '.rewardDistributor // "0"' 2>/dev/null || echo "0")

if [ "$STAKING_EARNED" != "0" ] || [ "$DISTRIBUTOR_EARNED" != "0" ]; then
  echo "[$(date -u +%FT%TZ)] Claimable — StakingRewards: $STAKING_EARNED, RewardDistributor: $DISTRIBUTOR_EARNED" >> "$LOG"

  RESULT=$(npx lobstr rewards claim 2>&1) || true

  if echo "$RESULT" | grep -q "Claimed"; then
    echo "[$(date -u +%FT%TZ)] SUCCESS: $RESULT" >> "$LOG"
    /opt/scripts/alert.sh info "$AGENT_NAME" "Rewards claimed — StakingRewards: $STAKING_EARNED, Distributor: $DISTRIBUTOR_EARNED"
  else
    echo "[$(date -u +%FT%TZ)] FAILED: $RESULT" >> "$LOG"
    /opt/scripts/alert.sh warning "$AGENT_NAME" "Reward claim failed: $RESULT"
  fi
else
  echo "[$(date -u +%FT%TZ)] No rewards to claim" >> "$LOG"
fi
