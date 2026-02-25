#!/bin/bash
# Arb Health — Pool size, dispute volume anomalies, treasury drain detection
# Detects: pool dominance at small sizes, self-dispute farming, per-dispute LOB drain
# Invoked by cron (weekly), alerts via webhook on anomalies
set -euo pipefail

source /tmp/agent-env 2>/dev/null || true

AGENT="${AGENT_NAME:-unknown}"
WORKSPACE="${WORKSPACE_DIR:-/data/workspace}"
ALERT="/opt/scripts/alert.sh"
LOG_PREFIX="[arb-health]"
INDEXER_URL="${LOBSTR_INDEXER_URL:-http://localhost:42069}"
STATE_FILE="${WORKSPACE}/arb-health-state.json"

# Thresholds
MIN_POOL_SIZE=10           # Alert if active arbitrator count below this
DISPUTE_VOLUME_STDDEV=3    # Flag arbs with disputes > mean + 3*stddev
MIN_JOB_AMOUNT="1000000000000000000"  # 1 LOB — flag disputes on sub-1-LOB jobs

echo "${LOG_PREFIX} Running arbitrator pool health check for ${AGENT}..."

cd "${WORKSPACE}"

# ── 1. Pool size check ──────────────────────────────────────────────────
# Query indexer for active arbitrators
ARBS=$(curl -s "${INDEXER_URL}/graphql" \
  -H "Content-Type: application/json" \
  -d '{"query":"{ accounts(where: { isArbitrator: true }) { items { address arbitratorStake arbitratorRank } } }"}' \
  2>/dev/null || echo '{"data":null}')

POOL_SIZE=$(echo "${ARBS}" | jq '.data.accounts.items | length' 2>/dev/null || echo 0)
echo "${LOG_PREFIX} Active arbitrator pool size: ${POOL_SIZE}"

if [ "${POOL_SIZE}" -gt 0 ] && [ "${POOL_SIZE}" -lt "${MIN_POOL_SIZE}" ]; then
  "${ALERT}" "warning" "${AGENT}" "POOL DOMINANCE RISK: Only ${POOL_SIZE} active arbitrators. Minimum safe pool: ${MIN_POOL_SIZE}. Sybil multi-wallet attacks have higher probability."
fi

if [ "${POOL_SIZE}" -eq 0 ]; then
  echo "${LOG_PREFIX} No arbitrators indexed or indexer unreachable — skipping volume checks"
  exit 0
fi

# ── 2. Per-arbitrator dispute volume check ───────────────────────────────
# Query resolved disputes from the last 7 days
NOW=$(date +%s)
WEEK_AGO=$((NOW - 604800))

DISPUTES=$(curl -s "${INDEXER_URL}/graphql" \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"{ disputes(where: { status: 3 }, orderBy: \\\"createdAt\\\", orderDirection: \\\"desc\\\", limit: 500) { items { id jobId buyer seller amount arbitrator0 arbitrator1 arbitrator2 createdAt } } }\"}" \
  2>/dev/null || echo '{"data":null}')

# Count disputes per arbitrator in last week
ARB_COUNTS=$(echo "${DISPUTES}" | jq --argjson since "${WEEK_AGO}" '
  [.data.disputes.items // [] | .[] | select(.createdAt >= ($since | tostring))] |
  (map(.arbitrator0) + map(.arbitrator1) + map(.arbitrator2)) |
  map(select(. != null)) |
  group_by(.) |
  map({address: .[0], count: length}) |
  sort_by(-.count)
' 2>/dev/null || echo "[]")

# Calculate mean and detect outliers
MEAN=$(echo "${ARB_COUNTS}" | jq '[.[].count] | if length > 0 then (add / length) else 0 end' 2>/dev/null || echo 0)
STDDEV=$(echo "${ARB_COUNTS}" | jq --argjson mean "${MEAN}" '
  [.[].count] |
  if length > 1 then
    (map(. - $mean | . * .) | add / (length - 1)) | sqrt
  else 0 end
' 2>/dev/null || echo 0)

THRESHOLD=$(echo "${MEAN} + ${DISPUTE_VOLUME_STDDEV} * ${STDDEV}" | bc -l 2>/dev/null || echo 999999)

echo "${LOG_PREFIX} Dispute volume — mean: ${MEAN}, stddev: ${STDDEV}, threshold: ${THRESHOLD}"

# Flag outliers
OUTLIERS=$(echo "${ARB_COUNTS}" | jq --argjson thresh "${THRESHOLD}" '
  [.[] | select(.count > $thresh)]
' 2>/dev/null || echo "[]")

OUTLIER_COUNT=$(echo "${OUTLIERS}" | jq 'length' 2>/dev/null || echo 0)

if [ "${OUTLIER_COUNT}" -gt 0 ]; then
  OUTLIER_LIST=$(echo "${OUTLIERS}" | jq -r '.[] | "\(.address): \(.count) disputes"' 2>/dev/null || echo "")
  "${ALERT}" "critical" "${AGENT}" "DISPUTE VOLUME ANOMALY: ${OUTLIER_COUNT} arbitrator(s) have abnormally high dispute counts this week (threshold: ${THRESHOLD}):\n${OUTLIER_LIST}"
fi

# ── 3. Self-dealing detection ────────────────────────────────────────────
# Check if any address appears as both dispute party AND arbitrator
RECENT_DISPUTES=$(echo "${DISPUTES}" | jq --argjson since "${WEEK_AGO}" '
  [.data.disputes.items // [] | .[] | select(.createdAt >= ($since | tostring))]
' 2>/dev/null || echo "[]")

SELF_DEAL=$(echo "${RECENT_DISPUTES}" | jq '
  . as $disputes |
  [.[] | {buyer, seller, arbs: [.arbitrator0, .arbitrator1, .arbitrator2] | map(select(. != null))}] |
  map(select(
    (.buyer as $b | .arbs | any(. == $b)) or
    (.seller as $s | .arbs | any(. == $s))
  )) |
  map({disputeId: .buyer, note: "party is also arbitrator"})
' 2>/dev/null || echo "[]")

SELF_DEAL_COUNT=$(echo "${SELF_DEAL}" | jq 'length' 2>/dev/null || echo 0)

if [ "${SELF_DEAL_COUNT}" -gt 0 ]; then
  "${ALERT}" "critical" "${AGENT}" "SELF-DEALING DETECTED: ${SELF_DEAL_COUNT} dispute(s) where buyer/seller is also on the arbitration panel. Investigate immediately."
fi

# ── 4. Micro-dispute farming detection ───────────────────────────────────
# Flag disputes on tiny job amounts (sub-threshold) — sign of self-dispute farming
MICRO=$(echo "${RECENT_DISPUTES}" | jq --arg min "${MIN_JOB_AMOUNT}" '
  [.[] | select((.amount | tonumber) < ($min | tonumber))]
' 2>/dev/null || echo "[]")

MICRO_COUNT=$(echo "${MICRO}" | jq 'length' 2>/dev/null || echo 0)

if [ "${MICRO_COUNT}" -gt 5 ]; then
  "${ALERT}" "warning" "${AGENT}" "MICRO-DISPUTE FARMING: ${MICRO_COUNT} disputes on jobs under 1 LOB this week. Potential treasury drain via perDisputeLob payouts on fake jobs."
fi

# ── 5. Cross-epoch address overlap detection ─────────────────────────────
# Track addresses that appear as buyer on some disputes AND seller on others
CROSS_ROLE=$(echo "${RECENT_DISPUTES}" | jq '
  (map(.buyer) | unique) as $buyers |
  (map(.seller) | unique) as $sellers |
  [$buyers[] as $b | $sellers[] | select(. == $b)] | unique
' 2>/dev/null || echo "[]")

CROSS_COUNT=$(echo "${CROSS_ROLE}" | jq 'length' 2>/dev/null || echo 0)

if [ "${CROSS_COUNT}" -gt 0 ]; then
  CROSS_LIST=$(echo "${CROSS_ROLE}" | jq -r '.[]' 2>/dev/null || echo "")
  "${ALERT}" "warning" "${AGENT}" "BUYER-SELLER OVERLAP: ${CROSS_COUNT} address(es) are both buyers and sellers in disputes this week — possible self-dealing ring:\n${CROSS_LIST}"
fi

# ── Save state snapshot ──────────────────────────────────────────────────
jq -n \
  --argjson pool_size "${POOL_SIZE}" \
  --argjson mean "${MEAN}" \
  --argjson outlier_count "${OUTLIER_COUNT}" \
  --argjson self_deal_count "${SELF_DEAL_COUNT}" \
  --argjson micro_count "${MICRO_COUNT}" \
  --argjson cross_count "${CROSS_COUNT}" \
  --arg timestamp "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
  '{
    lastRun: $timestamp,
    poolSize: $pool_size,
    meanDisputesPerArb: $mean,
    volumeOutliers: $outlier_count,
    selfDealFlags: $self_deal_count,
    microDisputeCount: $micro_count,
    crossRoleAddresses: $cross_count
  }' > "${STATE_FILE}" 2>/dev/null || true

echo "${LOG_PREFIX} Check complete: pool=${POOL_SIZE}, outliers=${OUTLIER_COUNT}, self-deal=${SELF_DEAL_COUNT}, micro=${MICRO_COUNT}, cross-role=${CROSS_COUNT}"
