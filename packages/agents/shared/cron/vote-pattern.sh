#!/bin/bash
# Vote Pattern — Detect last-vote majority sniping and rubber-stamp bias
# Detects: arbitrators who consistently vote last and land in majority,
#          lifetime one-direction voting bias exceeding 80%
# Invoked by cron (weekly), alerts via webhook on statistical anomalies
set -euo pipefail

source /tmp/agent-env 2>/dev/null || true

AGENT="${AGENT_NAME:-unknown}"
WORKSPACE="${WORKSPACE_DIR:-/data/workspace}"
ALERT="/opt/scripts/alert.sh"
LOG_PREFIX="[vote-pattern]"
INDEXER_URL="${LOBSTR_INDEXER_URL:-http://localhost:42069}"
STATE_FILE="${WORKSPACE}/vote-pattern-state.json"

# Thresholds
RUBBER_STAMP_BIAS=80       # 80% lifetime voting in one direction (contract: RUBBER_STAMP_BIAS_THRESHOLD = 8000)
MIN_VOTES_FOR_BIAS=10      # Need enough votes to be statistically meaningful
LAST_VOTE_MAJORITY_RATE=85 # Flag if arb votes last AND in majority >85% of the time
MIN_PANELS_FOR_TIMING=8    # Need enough panels to detect timing patterns

echo "${LOG_PREFIX} Running vote pattern analysis for ${AGENT}..."

cd "${WORKSPACE}"

# ── 1. Fetch all resolved disputes with full panel + ruling data ─────────
DISPUTES=$(curl -s "${INDEXER_URL}/graphql" \
  -H "Content-Type: application/json" \
  -d '{"query":"{ disputes(where: { status: 3 }, orderBy: \"createdAt\", orderDirection: \"desc\", limit: 500) { items { id arbitrator0 arbitrator1 arbitrator2 ruling votesForBuyer votesForSeller createdAt } } }"}' \
  2>/dev/null || echo '{"data":null}')

DISPUTE_ITEMS=$(echo "${DISPUTES}" | jq '.data.disputes.items // []' 2>/dev/null || echo "[]")
TOTAL=$(echo "${DISPUTE_ITEMS}" | jq 'length' 2>/dev/null || echo 0)

echo "${LOG_PREFIX} Analyzing ${TOTAL} resolved disputes..."

if [ "${TOTAL}" -lt "${MIN_VOTES_FOR_BIAS}" ]; then
  echo "${LOG_PREFIX} Not enough resolved disputes for meaningful analysis"
  exit 0
fi

# ── 2. Per-arbitrator ruling direction analysis ──────────────────────────
# Track how often each arbitrator was on a BuyerWins vs SellerWins panel
# ruling: 1=BuyerWins, 2=SellerWins
# This is a proxy — without individual vote data from indexer, we can detect
# rubber-stamp bias by looking at ruling outcomes on panels an arb served on

ARB_RULINGS=$(echo "${DISPUTE_ITEMS}" | jq '
  # Build per-arbitrator records
  [.[] | select(.ruling == 1 or .ruling == 2) |
    {arbs: [.arbitrator0, .arbitrator1, .arbitrator2] | map(select(. != null)), ruling}
  ] |
  # Flatten: one record per arbitrator per dispute
  [.[] as $d | $d.arbs[] | {address: ., buyerWin: ($d.ruling == 1)}] |
  group_by(.address) |
  map({
    address: .[0].address,
    total: length,
    buyerWins: [.[] | select(.buyerWin)] | length,
    sellerWins: [.[] | select(.buyerWin | not)] | length
  }) |
  map(. + {
    buyerRate: (if .total > 0 then ((.buyerWins / .total) * 100 | floor) else 0 end),
    sellerRate: (if .total > 0 then ((.sellerWins / .total) * 100 | floor) else 0 end),
    biasRate: (if .total > 0 then ([(.buyerWins / .total), (.sellerWins / .total)] | max * 100 | floor) else 0 end)
  }) |
  sort_by(-.biasRate)
' 2>/dev/null || echo "[]")

# Flag arbitrators with bias exceeding threshold
BIASED=$(echo "${ARB_RULINGS}" | jq --argjson thresh "${RUBBER_STAMP_BIAS}" --argjson minVotes "${MIN_VOTES_FOR_BIAS}" '
  [.[] | select(.total >= $minVotes and .biasRate >= $thresh)]
' 2>/dev/null || echo "[]")

BIASED_COUNT=$(echo "${BIASED}" | jq 'length' 2>/dev/null || echo 0)

if [ "${BIASED_COUNT}" -gt 0 ]; then
  BIASED_LIST=$(echo "${BIASED}" | jq -r '
    .[] |
    if .buyerRate > .sellerRate then
      "\(.address) — \(.buyerRate)% buyer-favorable (\(.total) disputes)"
    else
      "\(.address) — \(.sellerRate)% seller-favorable (\(.total) disputes)"
    end
  ' 2>/dev/null || echo "")
  "${ALERT}" "warning" "${AGENT}" "RUBBER-STAMP BIAS: ${BIASED_COUNT} arbitrator(s) exceed ${RUBBER_STAMP_BIAS}% one-direction ruling rate:\n${BIASED_LIST}\nContract auto-penalizes at 80% over lifetime — these are approaching or exceeding threshold."
fi

# ── 3. Majority alignment analysis ──────────────────────────────────────
# For each arbitrator, check how often they're in the majority
# Majority = their ruling direction matches the dispute outcome
# An arb who is ALWAYS in majority is suspicious — could be sniping

ARB_MAJORITY=$(echo "${DISPUTE_ITEMS}" | jq '
  [.[] | select(.ruling == 1 or .ruling == 2) |
    select(.votesForBuyer != null and .votesForSeller != null) |
    select((.votesForBuyer + .votesForSeller) >= 2) |
    {
      arbs: [.arbitrator0, .arbitrator1, .arbitrator2] | map(select(. != null)),
      ruling,
      unanimous: ((.votesForBuyer >= 3) or (.votesForSeller >= 3)),
      majorityDirection: (if .votesForBuyer > .votesForSeller then 1 else 2 end)
    }
  ] |
  # For non-unanimous disputes, track who was on the winning side
  # We can only estimate this — without per-vote records, assume all majority voters
  # contributed to the winning side
  [.[] | select(.unanimous | not) | {arbs, ruling, majorityDirection}] as $split |
  # Count total non-unanimous disputes per arb (these are where sniping matters)
  [.[] as $d | $d.arbs[] | {address: ., total: 1}] |
  group_by(.address) |
  map({address: .[0].address, totalNonUnanimous: length}) |
  sort_by(-.totalNonUnanimous)
' 2>/dev/null || echo "[]")

# ── 4. Unanimous rate per arbitrator ─────────────────────────────────────
# High unanimous rate on an arbitrator's panels = they might be last-voting
UNANIMOUS_RATE=$(echo "${DISPUTE_ITEMS}" | jq --argjson minPanels "${MIN_PANELS_FOR_TIMING}" '
  [.[] | select(.ruling == 1 or .ruling == 2) |
    {
      arbs: [.arbitrator0, .arbitrator1, .arbitrator2] | map(select(. != null)),
      unanimous: ((.votesForBuyer >= 3) or (.votesForSeller >= 3))
    }
  ] |
  [.[] as $d | $d.arbs[] | {address: ., unanimous: $d.unanimous}] |
  group_by(.address) |
  map({
    address: .[0].address,
    total: length,
    unanimousCount: [.[] | select(.unanimous)] | length
  }) |
  map(select(.total >= $minPanels)) |
  map(. + {unanimousRate: ((.unanimousCount / .total) * 100 | floor)}) |
  sort_by(-.unanimousRate) |
  [.[] | select(.unanimousRate >= 95)]
' 2>/dev/null || echo "[]")

UNANIMOUS_FLAG_COUNT=$(echo "${UNANIMOUS_RATE}" | jq 'length' 2>/dev/null || echo 0)

if [ "${UNANIMOUS_FLAG_COUNT}" -gt 0 ]; then
  UNAN_LIST=$(echo "${UNANIMOUS_RATE}" | jq -r '
    .[] | "\(.address) — \(.unanimousRate)% unanimous on \(.total) panels"
  ' 2>/dev/null || echo "")
  "${ALERT}" "warning" "${AGENT}" "LAST-VOTE SNIPE CANDIDATES: ${UNANIMOUS_FLAG_COUNT} arbitrator(s) have ≥95% unanimous rate — possible last-voter always matching majority:\n${UNAN_LIST}"
fi

# ── 5. Check contract-flagged rubber-stamp events ────────────────────────
# These are already handled by DisputeArbitration contract's internal check
# but we surface them for governance action
RUBBER_EVENTS=$(curl -s "${INDEXER_URL}/graphql" \
  -H "Content-Type: application/json" \
  -d '{"query":"{ arbitrationEvents(where: { eventType: \"rubber_stamp_detected\" }, orderBy: \"timestamp\", orderDirection: \"desc\", limit: 20) { items { arbitrator metric timestamp } } }"}' \
  2>/dev/null || echo '{"data":null}')

RUBBER_COUNT=$(echo "${RUBBER_EVENTS}" | jq '.data.arbitrationEvents.items // [] | length' 2>/dev/null || echo 0)

if [ "${RUBBER_COUNT}" -gt 0 ]; then
  RUBBER_LIST=$(echo "${RUBBER_EVENTS}" | jq -r '
    .data.arbitrationEvents.items // [] |
    .[:5] | .[] | "\(.arbitrator) — \(.metric)% bias"
  ' 2>/dev/null || echo "")
  "${ALERT}" "critical" "${AGENT}" "ON-CHAIN RUBBER-STAMP PENALTIES: ${RUBBER_COUNT} detected by contract. Recent:\n${RUBBER_LIST}"
fi

# ── Save state snapshot ──────────────────────────────────────────────────
jq -n \
  --argjson total "${TOTAL}" \
  --argjson biased_count "${BIASED_COUNT}" \
  --argjson unanimous_flag_count "${UNANIMOUS_FLAG_COUNT}" \
  --argjson rubber_count "${RUBBER_COUNT}" \
  --arg timestamp "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
  '{
    lastRun: $timestamp,
    totalDisputesAnalyzed: $total,
    biasedArbitrators: $biased_count,
    lastVoteSnipeCandidates: $unanimous_flag_count,
    onChainRubberStamps: $rubber_count
  }' > "${STATE_FILE}" 2>/dev/null || true

echo "${LOG_PREFIX} Analysis complete: biased=${BIASED_COUNT}, snipe-candidates=${UNANIMOUS_FLAG_COUNT}, rubber-stamps=${RUBBER_COUNT}"
