#!/bin/bash
# Mod Activity — Cross-reference moderator pay claims with observable activity
# Detects: uptime farming (running heartbeat daemon with zero actual work)
# Invoked by cron (weekly), alerts via webhook on inactive mods collecting pay
set -euo pipefail

source /tmp/agent-env 2>/dev/null || true

AGENT="${AGENT_NAME:-unknown}"
WORKSPACE="${WORKSPACE_DIR:-/data/workspace}"
ALERT="/opt/scripts/alert.sh"
LOG_PREFIX="[mod-activity]"
INDEXER_URL="${LOBSTR_INDEXER_URL:-http://localhost:42069}"
STATE_FILE="${WORKSPACE}/mod-activity-state.json"

# Thresholds
MIN_TOOL_CALLS=5           # Minimum expected CLI tool calls per week for active mod
MIN_DISPUTES_VOTED=0       # At least some dispute participation expected
CONSECUTIVE_IDLE_WEEKS=2   # Flag after N consecutive weeks of zero activity

echo "${LOG_PREFIX} Running moderator activity audit for ${AGENT}..."

cd "${WORKSPACE}"

# ── 1. Fetch recent WeeklyPayClaimed events ──────────────────────────────
# These include uptimeCount as public input — high uptime with zero work = farming
NOW=$(date +%s)
WEEK_AGO=$((NOW - 604800))
TWO_WEEKS_AGO=$((NOW - 1209600))

# Query pay claims from indexer — RolePayroll events aren't in schema yet,
# so we fall back to CLI queries for each known enrolled address
echo "${LOG_PREFIX} Checking enrolled moderators via CLI..."

# Get arbitrator/moderator pool from indexed accounts
ENROLLED=$(curl -s "${INDEXER_URL}/graphql" \
  -H "Content-Type: application/json" \
  -d '{"query":"{ accounts(where: { isArbitrator: true }) { items { address arbitratorStake arbitratorRank } } }"}' \
  2>/dev/null || echo '{"data":null}')

ENROLLED_ADDRS=$(echo "${ENROLLED}" | jq -r '.data.accounts.items // [] | .[].address' 2>/dev/null || echo "")

if [ -z "${ENROLLED_ADDRS}" ]; then
  echo "${LOG_PREFIX} No enrolled moderators/arbitrators found — skipping"
  exit 0
fi

ENROLLED_COUNT=$(echo "${ENROLLED_ADDRS}" | wc -l | tr -d ' ')
echo "${LOG_PREFIX} Found ${ENROLLED_COUNT} enrolled address(es)"

# ── 2. Check dispute participation per enrolled address ──────────────────
# Query all resolved disputes and count per-arbitrator participation
DISPUTES=$(curl -s "${INDEXER_URL}/graphql" \
  -H "Content-Type: application/json" \
  -d '{"query":"{ disputes(where: { status: 3 }, orderBy: \"createdAt\", orderDirection: \"desc\", limit: 200) { items { arbitrator0 arbitrator1 arbitrator2 createdAt } } }"}' \
  2>/dev/null || echo '{"data":null}')

# Count disputes per arbitrator in the last 2 weeks
PARTICIPATION=$(echo "${DISPUTES}" | jq --argjson since "${TWO_WEEKS_AGO}" '
  [.data.disputes.items // [] | .[] | select((.createdAt | tonumber) >= $since)] |
  (map(.arbitrator0) + map(.arbitrator1) + map(.arbitrator2)) |
  map(select(. != null)) |
  group_by(.) |
  map({address: .[0], disputes: length})
' 2>/dev/null || echo "[]")

# ── 3. Check SybilGuard report participation ────────────────────────────
# Moderators with WATCHER_ROLE should be filing/judging sybil reports
SYBIL_ACTIVITY=$(curl -s "${INDEXER_URL}/graphql" \
  -H "Content-Type: application/json" \
  -d '{"query":"{ sybilEvents(where: { eventType_in: [\"report_created\", \"report_confirmed\", \"report_rejected\"] }, orderBy: \"timestamp\", orderDirection: \"desc\", limit: 200) { items { actor account eventType timestamp } } }"}' \
  2>/dev/null || echo '{"data":null}')

SYBIL_ACTORS=$(echo "${SYBIL_ACTIVITY}" | jq --argjson since "${TWO_WEEKS_AGO}" '
  [.data.sybilEvents.items // [] | .[] | select((.timestamp | tonumber) >= $since)] |
  (map(.actor) + map(.account)) |
  map(select(. != null)) |
  group_by(.) |
  map({address: .[0], sybilActions: length})
' 2>/dev/null || echo "[]")

# ── 4. Cross-reference: find zero-activity addresses ─────────────────────
IDLE_MODS=0
IDLE_LIST=""

while IFS= read -r addr; do
  [ -z "${addr}" ] && continue

  # Check dispute participation
  DISPUTE_COUNT=$(echo "${PARTICIPATION}" | jq --arg a "${addr}" '
    [.[] | select(.address == $a)] | .[0].disputes // 0
  ' 2>/dev/null || echo 0)

  # Check sybil activity
  SYBIL_COUNT=$(echo "${SYBIL_ACTORS}" | jq --arg a "${addr}" '
    [.[] | select(.address == $a)] | .[0].sybilActions // 0
  ' 2>/dev/null || echo 0)

  TOTAL_ACTIONS=$((DISPUTE_COUNT + SYBIL_COUNT))

  if [ "${TOTAL_ACTIONS}" -eq 0 ]; then
    IDLE_MODS=$((IDLE_MODS + 1))
    IDLE_LIST="${IDLE_LIST}\n${addr} — 0 disputes, 0 sybil actions (2 weeks)"
  fi
done <<< "${ENROLLED_ADDRS}"

if [ "${IDLE_MODS}" -gt 0 ]; then
  "${ALERT}" "warning" "${AGENT}" "UPTIME FARMING SUSPECTS: ${IDLE_MODS} enrolled address(es) with ZERO observable activity over 2 weeks while presumably claiming pay:${IDLE_LIST}\nRecommend: issue strike via RolePayroll or request activity proof."
fi

# ── 5. Load previous state for consecutive idle tracking ─────────────────
PREV_IDLE=""
if [ -f "${STATE_FILE}" ]; then
  PREV_IDLE=$(jq -r '.idleAddresses // [] | .[]' "${STATE_FILE}" 2>/dev/null || echo "")
fi

# Check for addresses idle in both this run and the previous run
REPEAT_IDLE=0
REPEAT_LIST=""

while IFS= read -r addr; do
  [ -z "${addr}" ] && continue
  if echo "${PREV_IDLE}" | grep -q "${addr}" 2>/dev/null; then
    REPEAT_IDLE=$((REPEAT_IDLE + 1))
    REPEAT_LIST="${REPEAT_LIST}\n${addr}"
  fi
done <<< "$(echo -e "${IDLE_LIST}" | grep -oE '0x[a-fA-F0-9]{40}' 2>/dev/null || echo "")"

if [ "${REPEAT_IDLE}" -gt 0 ]; then
  "${ALERT}" "critical" "${AGENT}" "CHRONIC UPTIME FARMING: ${REPEAT_IDLE} address(es) idle for 2+ consecutive scan periods. Governance action recommended:${REPEAT_LIST}"
fi

# ── Save state snapshot ──────────────────────────────────────────────────
IDLE_ADDRS_JSON=$(echo -e "${IDLE_LIST}" | grep -oE '0x[a-fA-F0-9]{40}' 2>/dev/null | jq -R -s 'split("\n") | map(select(length > 0))' 2>/dev/null || echo "[]")

jq -n \
  --argjson enrolled_count "${ENROLLED_COUNT}" \
  --argjson idle_mods "${IDLE_MODS}" \
  --argjson repeat_idle "${REPEAT_IDLE}" \
  --argjson idle_addrs "${IDLE_ADDRS_JSON}" \
  --arg timestamp "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
  '{
    lastRun: $timestamp,
    enrolledCount: $enrolled_count,
    idleModCount: $idle_mods,
    repeatIdleCount: $repeat_idle,
    idleAddresses: $idle_addrs
  }' > "${STATE_FILE}" 2>/dev/null || true

echo "${LOG_PREFIX} Audit complete: enrolled=${ENROLLED_COUNT}, idle=${IDLE_MODS}, repeat-idle=${REPEAT_IDLE}"
