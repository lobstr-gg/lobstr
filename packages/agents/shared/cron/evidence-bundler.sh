#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# Evidence Bundler — On-demand on-chain evidence collection
# ═══════════════════════════════════════════════════════════════════
# Queries Alchemy Enhanced APIs for a target address, identifies
# common counterparties, funding sources, and timing patterns.
# Outputs a structured JSON evidence bundle.
#
# Usage: evidence-bundler.sh <target-address>
# Output: JSON bundle to stdout + saved to workspace
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

source /tmp/agent-env 2>/dev/null || true
source /opt/scripts/brain.sh 2>/dev/null || true

AGENT="${AGENT_NAME:-unknown}"
LOG_PREFIX="[evidence-bundler]"
WORKSPACE="${WORKSPACE_DIR:-/data/workspace}"
BUNDLES_DIR="${WORKSPACE}/evidence-bundles"
RPC_URL="${ALCHEMY_RPC_URL:-${OPENCLAW_RPC_URL:-$(cat /run/secrets/rpc_url 2>/dev/null || echo "")}}"

if [ -z "${RPC_URL}" ]; then
  echo "${LOG_PREFIX} ERROR: No RPC URL configured (need ALCHEMY_RPC_URL or rpc_url secret)"
  exit 1
fi

# ── Validate args ───────────────────────────────────────────────
TARGET="${1:-}"
if [ -z "${TARGET}" ]; then
  echo "${LOG_PREFIX} ERROR: No target address provided"
  echo "Usage: evidence-bundler.sh <target-address>"
  exit 1
fi

# Normalize to lowercase
TARGET=$(echo "${TARGET}" | tr '[:upper:]' '[:lower:]')

if ! echo "${TARGET}" | grep -qE '^0x[a-f0-9]{40}$'; then
  echo "${LOG_PREFIX} ERROR: Invalid Ethereum address: ${TARGET}"
  exit 1
fi

echo "${LOG_PREFIX} Collecting evidence for ${TARGET}..."

# ── Create output directory ─────────────────────────────────────
mkdir -p "${BUNDLES_DIR}" 2>/dev/null || true

TIMESTAMP=$(date +%s)
BUNDLE_FILE="${BUNDLES_DIR}/${TARGET}_${TIMESTAMP}.json"

# ── Helper: Alchemy JSON-RPC call ──────────────────────────────
alchemy_rpc() {
  local method="$1"
  local params="$2"
  curl -sf -X POST "${RPC_URL}" \
    -H "Content-Type: application/json" \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"${method}\",\"params\":${params}}" 2>/dev/null
}

# ── Query Alchemy Enhanced APIs for transfer history ────────────
echo "${LOG_PREFIX} Fetching transfer history from Alchemy..."

# Outbound transfers (from target)
TRANSFERS_FROM=$(alchemy_rpc "alchemy_getAssetTransfers" "[{
  \"fromBlock\": \"0x0\",
  \"fromAddress\": \"${TARGET}\",
  \"category\": [\"external\", \"internal\", \"erc20\"],
  \"maxCount\": \"0x64\",
  \"order\": \"asc\"
}]" || echo '{"result":{"transfers":[]}}')

# Inbound transfers (to target)
TRANSFERS_TO=$(alchemy_rpc "alchemy_getAssetTransfers" "[{
  \"fromBlock\": \"0x0\",
  \"toAddress\": \"${TARGET}\",
  \"category\": [\"external\", \"internal\", \"erc20\"],
  \"maxCount\": \"0x64\",
  \"order\": \"asc\"
}]" || echo '{"result":{"transfers":[]}}')

# ── Analyze transactions ────────────────────────────────────────
echo "${LOG_PREFIX} Analyzing transaction patterns..."

# Extract unique transaction hashes from both directions
TX_HASHES_FROM=$(echo "${TRANSFERS_FROM}" | jq -r '[.result.transfers[]?.hash // empty] | unique' 2>/dev/null || echo "[]")
TX_HASHES_TO=$(echo "${TRANSFERS_TO}" | jq -r '[.result.transfers[]?.hash // empty] | unique' 2>/dev/null || echo "[]")
TX_HASHES=$(echo "${TX_HASHES_FROM} ${TX_HASHES_TO}" | jq -s 'add | unique | .[0:50]' 2>/dev/null || echo "[]")

# Identify funding sources (inbound transfer senders)
FUNDING_SOURCES=$(echo "${TRANSFERS_TO}" | jq -r '[.result.transfers[]?.from // empty] | unique | .[0:10]' 2>/dev/null || echo "[]")

# Identify related addresses (all counterparties)
COUNTERPARTIES_FROM=$(echo "${TRANSFERS_FROM}" | jq -r '[.result.transfers[]?.to // empty] | unique' 2>/dev/null || echo "[]")
COUNTERPARTIES_TO=$(echo "${TRANSFERS_TO}" | jq -r '[.result.transfers[]?.from // empty] | unique' 2>/dev/null || echo "[]")
RELATED_ADDRESSES=$(echo "${COUNTERPARTIES_FROM} ${COUNTERPARTIES_TO}" | jq -s 'add | unique | map(select(. != "'"${TARGET}"'")) | .[0:20]' 2>/dev/null || echo "[]")

# Build timeline of key events (merge both directions, sort by block)
TIMELINE_FROM=$(echo "${TRANSFERS_FROM}" | jq '[.result.transfers[] | {
  blockNum: .blockNum,
  from: .from,
  to: .to,
  value: (.value // 0 | tostring),
  asset: (.asset // "ETH"),
  hash: .hash
}]' 2>/dev/null || echo "[]")

TIMELINE_TO=$(echo "${TRANSFERS_TO}" | jq '[.result.transfers[] | {
  blockNum: .blockNum,
  from: .from,
  to: .to,
  value: (.value // 0 | tostring),
  asset: (.asset // "ETH"),
  hash: .hash
}]' 2>/dev/null || echo "[]")

TIMELINE=$(echo "${TIMELINE_FROM} ${TIMELINE_TO}" | jq -s 'add | unique_by(.hash) | sort_by(.blockNum) | .[0:30]' 2>/dev/null || echo "[]")

# ── Detect signals ──────────────────────────────────────────────
echo "${LOG_PREFIX} Detecting sybil signals..."

SIGNALS="[]"

# Signal: Check if funded by a single source
UNIQUE_FUNDERS=$(echo "${FUNDING_SOURCES}" | jq 'length' 2>/dev/null || echo "0")
if [ "${UNIQUE_FUNDERS}" -le 1 ] && [ "${UNIQUE_FUNDERS}" -gt 0 ]; then
  SIGNALS=$(echo "${SIGNALS}" | jq '. + ["Shared Funding Source"]')
fi

# Signal: Check for rapid creation timing (many tx in first few blocks)
FIRST_BLOCK=$(echo "${TIMELINE}" | jq -r '.[0]?.blockNum // "0x0"' 2>/dev/null)
FIRST_BLOCK_DEC=$(printf "%d" "${FIRST_BLOCK}" 2>/dev/null || echo "0")
EARLY_BLOCK_LIMIT=$((FIRST_BLOCK_DEC + 1200)) # ~1 hour of blocks at 3s/block
EARLY_TX_COUNT=$(echo "${TIMELINE}" | jq '[.[] | select((.blockNum | ltrimstr("0x") | explode | map(if . >= 97 then . - 87 elif . >= 65 then . - 55 else . - 48 end) | reduce .[] as $x (0; . * 16 + $x)) < '"${EARLY_BLOCK_LIMIT}"')] | length' 2>/dev/null || echo "0")
if [ "${EARLY_TX_COUNT}" -gt 5 ]; then
  SIGNALS=$(echo "${SIGNALS}" | jq '. + ["Creation Timing Cluster"]')
fi

# Signal: Check for circular transfers (target sent to address that sent back)
SENT_TO=$(echo "${TRANSFERS_FROM}" | jq -r '[.result.transfers[]?.to // empty] | unique' 2>/dev/null || echo "[]")
RECEIVED_FROM=$(echo "${TRANSFERS_TO}" | jq -r '[.result.transfers[]?.from // empty] | unique' 2>/dev/null || echo "[]")
CIRCULAR=$(echo "${SENT_TO} ${RECEIVED_FROM}" | jq -s '(.[0] // []) as $s | (.[1] // []) as $r | [$s[] | select(. as $a | $r | index($a))] | length' 2>/dev/null || echo "0")
if [ "${CIRCULAR}" -gt 2 ] 2>/dev/null; then
  SIGNALS=$(echo "${SIGNALS}" | jq '. + ["Circular Transfers"]')
fi

# Signal: Check for minimal unique interaction partners
TOTAL_UNIQUE=$(echo "${RELATED_ADDRESSES}" | jq 'length' 2>/dev/null || echo "0")
TOTAL_TX=$(echo "${TX_HASHES}" | jq 'length' 2>/dev/null || echo "0")
if [ "${TOTAL_TX}" -gt 10 ] && [ "${TOTAL_UNIQUE}" -le 3 ]; then
  SIGNALS=$(echo "${SIGNALS}" | jq '. + ["Single-Service Engagement"]')
fi

# ── Build the final evidence bundle ─────────────────────────────
echo "${LOG_PREFIX} Building evidence bundle..."

BUNDLE=$(jq -n \
  --arg subject "${TARGET}" \
  --argjson txHashes "${TX_HASHES}" \
  --argjson fundingSources "${FUNDING_SOURCES}" \
  --argjson relatedAddresses "${RELATED_ADDRESSES}" \
  --argjson timeline "${TIMELINE}" \
  --argjson signals "${SIGNALS}" \
  --arg collectedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg collectedBy "${AGENT}" \
  '{
    subject: $subject,
    txHashes: $txHashes,
    fundingSources: $fundingSources,
    relatedAddresses: $relatedAddresses,
    timeline: $timeline,
    signals: $signals,
    collectedAt: $collectedAt,
    collectedBy: $collectedBy
  }')

# Save to file
echo "${BUNDLE}" > "${BUNDLE_FILE}"
echo "${LOG_PREFIX} Bundle saved to ${BUNDLE_FILE}"

# ── Append summary to BRAIN.md ──────────────────────────────────
SIGNAL_COUNT=$(echo "${SIGNALS}" | jq 'length')
SIGNAL_LIST=$(echo "${SIGNALS}" | jq -r 'join(", ")')
TX_COUNT=$(echo "${TX_HASHES}" | jq 'length')
FUNDER_COUNT=$(echo "${FUNDING_SOURCES}" | jq 'length')

SUMMARY="- **${TARGET}** ($(date -u +%Y-%m-%d)): ${TX_COUNT} txs, ${FUNDER_COUNT} funders, ${SIGNAL_COUNT} signals [${SIGNAL_LIST:-none}]"
brain_append_section "Evidence Bundles" "${SUMMARY}" 2>/dev/null || true
brain_trim_section "Evidence Bundles" 20 2>/dev/null || true

echo "${LOG_PREFIX} Done. ${SIGNAL_COUNT} signals detected, ${TX_COUNT} transactions analyzed."

# Output the bundle to stdout for piping
echo "${BUNDLE}"
