#!/usr/bin/env bash
# One-time script to set modTier on bot Firestore user docs.
# Usage: INTERNAL_API_KEY=<key> ./set-mod-tiers.sh [base_url]
#
# Requires the admin/set-mod-tier endpoint to be deployed first.

set -euo pipefail

BASE_URL="${1:-https://lobstr.gg}"
KEY="${INTERNAL_API_KEY:?INTERNAL_API_KEY env var required}"

# Bot addresses and their mod tiers
declare -A BOTS=(
  ["0x8a1C742A8A2F4f7C1295443809acE281723650fb"]="Lead"      # Titus (Sentinel) — head moderator
  ["0xb761530d346D39B2c10B546545c24a0b0a3285D0"]="Senior"    # Solomon (Arbiter) — senior arbitrator
  ["0x443c4ff3CAa0E344b10CA19779B2E8AB1ACcd672"]="Community"  # Daniel (Steward) — treasury guardian
)

for addr in "${!BOTS[@]}"; do
  tier="${BOTS[$addr]}"
  echo "Setting modTier=$tier for $addr..."

  response=$(curl -s -w "\n%{http_code}" -X POST \
    "${BASE_URL}/api/admin/set-mod-tier" \
    -H "Content-Type: application/json" \
    -H "x-internal-key: ${KEY}" \
    -d "{\"address\":\"${addr}\",\"modTier\":\"${tier}\"}")

  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | sed '$d')

  if [ "$http_code" = "200" ]; then
    echo "  ✓ $body"
  else
    echo "  ✗ HTTP $http_code: $body"
  fi
done

echo "Done."
