#!/bin/bash
# Collusion Scan — Detect voting collusion between arbitrator pairs
# Detects: high pairwise agreement rates, SybilGuard watcher-judge rotation rings
# Invoked by cron (weekly), alerts via webhook on suspicious patterns
set -euo pipefail

source /tmp/agent-env 2>/dev/null || true

AGENT="${AGENT_NAME:-unknown}"
WORKSPACE="${WORKSPACE_DIR:-/data/workspace}"
ALERT="/opt/scripts/alert.sh"
LOG_PREFIX="[collusion-scan]"
INDEXER_URL="${LOBSTR_INDEXER_URL:-http://localhost:42069}"
STATE_FILE="${WORKSPACE}/collusion-scan-state.json"

# Thresholds (from contract constants)
AGREEMENT_THRESHOLD=90     # 90% agreement on shared disputes = suspicious
MIN_SHARED_DISPUTES=5      # Only flag pairs with enough shared history
WATCHER_JUDGE_MAX=3        # MAX_PAIR_COUNT_PER_EPOCH from SybilGuard

echo "${LOG_PREFIX} Running collusion scan for ${AGENT}..."

cd "${WORKSPACE}"

# ── 1. Check on-chain collusion flags ────────────────────────────────────
# Query CollusionFlagged events from the indexer
COLLUSION_FLAGS=$(curl -s "${INDEXER_URL}/graphql" \
  -H "Content-Type: application/json" \
  -d '{"query":"{ arbitrationEvents(where: { eventType: \"collusion_flagged\" }, orderBy: \"timestamp\", orderDirection: \"desc\", limit: 50) { items { arbitratorA arbitratorB metric timestamp } } }"}' \
  2>/dev/null || echo '{"data":null}')

FLAG_COUNT=$(echo "${COLLUSION_FLAGS}" | jq '.data.arbitrationEvents.items // [] | length' 2>/dev/null || echo 0)

if [ "${FLAG_COUNT}" -gt 0 ]; then
  RECENT_FLAGS=$(echo "${COLLUSION_FLAGS}" | jq -r '
    .data.arbitrationEvents.items // [] |
    .[:5] |
    .[] | "\(.arbitratorA) ↔ \(.arbitratorB) — \(.metric)% agreement"
  ' 2>/dev/null || echo "")
  "${ALERT}" "critical" "${AGENT}" "CONTRACT COLLUSION FLAGS: ${FLAG_COUNT} total. Recent:\n${RECENT_FLAGS}"
fi

# ── 2. Pairwise voting analysis from dispute data ────────────────────────
# Pull all resolved disputes with panel + ruling data
DISPUTES=$(curl -s "${INDEXER_URL}/graphql" \
  -H "Content-Type: application/json" \
  -d '{"query":"{ disputes(where: { status: 3 }, orderBy: \"createdAt\", orderDirection: \"desc\", limit: 500) { items { id arbitrator0 arbitrator1 arbitrator2 ruling votesForBuyer votesForSeller } } }"}' \
  2>/dev/null || echo '{"data":null}')

DISPUTE_ITEMS=$(echo "${DISPUTES}" | jq '.data.disputes.items // []' 2>/dev/null || echo "[]")
TOTAL_RESOLVED=$(echo "${DISPUTE_ITEMS}" | jq 'length' 2>/dev/null || echo 0)

echo "${LOG_PREFIX} Analyzing ${TOTAL_RESOLVED} resolved disputes for voting patterns..."

if [ "${TOTAL_RESOLVED}" -lt "${MIN_SHARED_DISPUTES}" ]; then
  echo "${LOG_PREFIX} Not enough resolved disputes for statistical analysis"
else
  # Build pairwise co-assignment counts and agreement scores
  # Two arbitrators "agree" if the ruling was unanimous (3-0) on their shared dispute
  # We can infer agreement from vote totals: if votesForBuyer=3 or votesForSeller=3, all agreed
  PAIR_ANALYSIS=$(echo "${DISPUTE_ITEMS}" | jq --argjson min "${MIN_SHARED_DISPUTES}" '
    # For each dispute, extract all arb pairs
    [.[] | select(.arbitrator0 != null and .arbitrator1 != null and .arbitrator2 != null) |
      {
        pairs: [
          [.arbitrator0, .arbitrator1],
          [.arbitrator0, .arbitrator2],
          [.arbitrator1, .arbitrator2]
        ],
        unanimous: ((.votesForBuyer == 3) or (.votesForSeller == 3))
      }
    ] |
    # Flatten to pair records
    [.[] as $d | $d.pairs[] | {pair: (sort | join("-")), unanimous: $d.unanimous}] |
    # Group by pair
    group_by(.pair) |
    # Calculate agreement rate per pair
    map({
      pair: .[0].pair,
      shared: length,
      unanimous: [.[] | select(.unanimous)] | length
    }) |
    # Filter to pairs with enough shared disputes
    map(select(.shared >= $min)) |
    # Calculate agreement rate
    map(. + {rate: ((.unanimous / .shared) * 100 | floor)}) |
    sort_by(-.rate)
  ' 2>/dev/null || echo "[]")

  SUSPICIOUS=$(echo "${PAIR_ANALYSIS}" | jq --argjson thresh "${AGREEMENT_THRESHOLD}" '
    [.[] | select(.rate >= $thresh)]
  ' 2>/dev/null || echo "[]")

  SUSPICIOUS_COUNT=$(echo "${SUSPICIOUS}" | jq 'length' 2>/dev/null || echo 0)

  if [ "${SUSPICIOUS_COUNT}" -gt 0 ]; then
    SUSPICIOUS_LIST=$(echo "${SUSPICIOUS}" | jq -r '
      .[] | "\(.pair | split("-") | join(" ↔ ")) — \(.rate)% unanimous on \(.shared) shared disputes"
    ' 2>/dev/null || echo "")
    "${ALERT}" "critical" "${AGENT}" "VOTING COLLUSION DETECTED: ${SUSPICIOUS_COUNT} arbitrator pair(s) with ≥${AGREEMENT_THRESHOLD}% unanimous agreement:\n${SUSPICIOUS_LIST}"
  fi

  echo "${LOG_PREFIX} Pair analysis: ${SUSPICIOUS_COUNT} suspicious pairs found"
fi

# ── 3. SybilGuard watcher-judge rotation rings ──────────────────────────
# Check for watcher-judge pairs that approach or exceed the 3-per-epoch limit
SYBIL_COLLUSION=$(curl -s "${INDEXER_URL}/graphql" \
  -H "Content-Type: application/json" \
  -d '{"query":"{ sybilEvents(where: { eventType: \"collusion_warning\" }, orderBy: \"timestamp\", orderDirection: \"desc\", limit: 50) { items { account actor reportId timestamp } } }"}' \
  2>/dev/null || echo '{"data":null}')

SYBIL_WARN_COUNT=$(echo "${SYBIL_COLLUSION}" | jq '.data.sybilEvents.items // [] | length' 2>/dev/null || echo 0)

if [ "${SYBIL_WARN_COUNT}" -gt 0 ]; then
  SYBIL_LIST=$(echo "${SYBIL_COLLUSION}" | jq -r '
    .data.sybilEvents.items // [] |
    .[:5] |
    .[] | "Watcher \(.actor) ↔ Judge \(.account) — report #\(.reportId)"
  ' 2>/dev/null || echo "")
  "${ALERT}" "warning" "${AGENT}" "SYBILGUARD ROTATION RING: ${SYBIL_WARN_COUNT} watcher-judge collusion warnings. Recent:\n${SYBIL_LIST}"
fi

# ── 4. Repeated panel co-assignment check ────────────────────────────────
# If the same 2+ arbitrators keep appearing on panels together, could indicate manipulation
CO_ASSIGN=$(echo "${DISPUTE_ITEMS}" | jq '
  [.[] | select(.arbitrator0 != null) |
    [[.arbitrator0, .arbitrator1] | sort | join("-"),
     [.arbitrator0, .arbitrator2] | sort | join("-"),
     [.arbitrator1, .arbitrator2] | sort | join("-")]
  ] | flatten |
  group_by(.) |
  map({pair: .[0], coAssignments: length}) |
  sort_by(-.coAssignments) |
  [.[] | select(.coAssignments >= 5)]
' 2>/dev/null || echo "[]")

CO_ASSIGN_COUNT=$(echo "${CO_ASSIGN}" | jq 'length' 2>/dev/null || echo 0)

if [ "${CO_ASSIGN_COUNT}" -gt 0 ]; then
  CO_LIST=$(echo "${CO_ASSIGN}" | jq -r '
    .[:5] | .[] | "\(.pair | split("-") | join(" ↔ ")) — co-assigned \(.coAssignments) times"
  ' 2>/dev/null || echo "")
  "${ALERT}" "warning" "${AGENT}" "REPEATED PANEL CO-ASSIGNMENT: ${CO_ASSIGN_COUNT} pair(s) appear on panels together unusually often (≥5 times):\n${CO_LIST}"
fi

# ── Save state snapshot ──────────────────────────────────────────────────
jq -n \
  --argjson flag_count "${FLAG_COUNT}" \
  --argjson suspicious_count "${SUSPICIOUS_COUNT:-0}" \
  --argjson sybil_warn_count "${SYBIL_WARN_COUNT}" \
  --argjson co_assign_count "${CO_ASSIGN_COUNT}" \
  --argjson total_resolved "${TOTAL_RESOLVED}" \
  --arg timestamp "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
  '{
    lastRun: $timestamp,
    onChainCollusionFlags: $flag_count,
    suspiciousVotingPairs: $suspicious_count,
    sybilGuardWarnings: $sybil_warn_count,
    repeatedCoAssignments: $co_assign_count,
    totalDisputesAnalyzed: $total_resolved
  }' > "${STATE_FILE}" 2>/dev/null || true

echo "${LOG_PREFIX} Scan complete: flags=${FLAG_COUNT}, suspicious=${SUSPICIOUS_COUNT:-0}, sybil-warn=${SYBIL_WARN_COUNT}, co-assign=${CO_ASSIGN_COUNT}"
