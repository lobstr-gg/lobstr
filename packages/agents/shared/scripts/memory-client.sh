#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# Memory Client — curl wrappers for the LOBSTR Memory Service
# ═══════════════════════════════════════════════════════════════════
# Usage: source /opt/scripts/memory-client.sh
#
# Requires: MEMORY_URL, MEMORY_API_KEY, AGENT_NAME env vars
# All functions are non-fatal — failures are logged but don't exit
# ═══════════════════════════════════════════════════════════════════

MEMORY_URL="${MEMORY_URL:-}"
MEMORY_API_KEY="${MEMORY_API_KEY:-}"
AGENT="${AGENT_NAME:-unknown}"

# Check if memory service is configured
mem_available() {
  [ -n "${MEMORY_URL}" ] && [ -n "${MEMORY_API_KEY}" ]
}

# GET /memory/:agent/:category/:key
mem_get() {
  mem_available || return 1
  local category="$1" key="$2"
  curl -sf -H "Authorization: Bearer ${MEMORY_API_KEY}" \
    "${MEMORY_URL}/memory/${AGENT}/${category}/${key}" 2>/dev/null || true
}

# PUT /memory/:agent/:category/:key
mem_set() {
  mem_available || return 1
  local category="$1" key="$2" value="$3"
  curl -sf -X PUT \
    -H "Authorization: Bearer ${MEMORY_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"value\":${value}}" \
    "${MEMORY_URL}/memory/${AGENT}/${category}/${key}" 2>/dev/null || true
}

# GET /memory/all/:category/:key — read across all agents
mem_get_all() {
  mem_available || return 1
  local category="$1" key="$2"
  curl -sf -H "Authorization: Bearer ${MEMORY_API_KEY}" \
    "${MEMORY_URL}/memory/all/${category}/${key}" 2>/dev/null || true
}

# POST /decisions — log a decision
mem_log_decision() {
  mem_available || return 1
  local action="$1" input="$2" decision="$3" reasoning="$4"
  curl -sf -X POST \
    -H "Authorization: Bearer ${MEMORY_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "$(jq -n \
      --arg agent "${AGENT}" \
      --arg action "${action}" \
      --arg input "${input}" \
      --arg decision "${decision}" \
      --arg reasoning "${reasoning}" \
      '{agent: $agent, action: $action, input: $input, decision: $decision, reasoning: $reasoning}')" \
    "${MEMORY_URL}/decisions" 2>/dev/null || true
}

# Write heartbeat to memory service
mem_heartbeat() {
  mem_available || return 1
  local status="${1:-alive}"
  local uptime_min=$(( $(cut -d. -f1 /proc/uptime 2>/dev/null || echo 0) / 60 ))
  mem_set "heartbeat" "status" "$(jq -n \
    --arg status "${status}" \
    --argjson uptime "${uptime_min}" \
    --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{status: $status, uptime_minutes: $uptime, timestamp: $ts}')"
}
