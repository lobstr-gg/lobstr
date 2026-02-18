#!/bin/bash
# Discord/Telegram webhook dispatcher
# Usage: alert.sh <level> <agent_name> <message>
#   level: info | warning | critical

set -euo pipefail

LEVEL="${1:-info}"
AGENT="${2:-unknown}"
MESSAGE="${3:-No message}"
WEBHOOK_URL="${LOBSTR_WEBHOOK_URL:-}"
TIMESTAMP="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

# Color mapping for Discord embeds
case "${LEVEL}" in
  info)     COLOR=3447003 ;;   # Blue
  warning)  COLOR=16776960 ;;  # Yellow
  critical) COLOR=15158332 ;;  # Red
  *)        COLOR=8421504 ;;   # Grey
esac

# Always log to stdout
echo "[${TIMESTAMP}] [${LEVEL^^}] [${AGENT}] ${MESSAGE}"

# Send to webhook if configured
if [ -n "${WEBHOOK_URL}" ]; then
  PAYLOAD=$(jq -n \
    --arg title "${LEVEL^^}: ${AGENT}" \
    --arg desc "${MESSAGE}" \
    --arg ts "${TIMESTAMP}" \
    --argjson color "${COLOR}" \
    '{
      embeds: [{
        title: $title,
        description: $desc,
        color: $color,
        footer: { text: $ts }
      }]
    }')

  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Content-Type: application/json" \
    -d "${PAYLOAD}" \
    "${WEBHOOK_URL}" 2>/dev/null || echo "000")

  if [ "${HTTP_CODE}" != "204" ] && [ "${HTTP_CODE}" != "200" ]; then
    echo "[${TIMESTAMP}] [WARNING] Webhook delivery failed (HTTP ${HTTP_CODE})"
  fi
else
  echo "[${TIMESTAMP}] [DEBUG] No webhook URL configured, stdout only"
fi
