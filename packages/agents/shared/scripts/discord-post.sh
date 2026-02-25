#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# Discord Post — Send a message to a Discord channel via REST API
# ═══════════════════════════════════════════════════════════════════
# Usage: discord-post.sh <channel_id> <message>
#   or:  echo "message" | discord-post.sh <channel_id>
#
# For embeds: discord-post.sh <channel_id> --embed <json_payload>
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

CHANNEL_ID="${1:-}"
BOT_TOKEN="${DISCORD_TOKEN:-}"
LOG_PREFIX="[discord-post]"

if [ -z "${BOT_TOKEN}" ]; then
  echo "${LOG_PREFIX} ERROR: DISCORD_TOKEN not set" >&2
  exit 1
fi

if [ -z "${CHANNEL_ID}" ]; then
  echo "${LOG_PREFIX} ERROR: No channel ID provided" >&2
  exit 1
fi

shift

# Check for embed mode
if [ "${1:-}" = "--embed" ]; then
  shift
  PAYLOAD="${1:-}"
  if [ -z "${PAYLOAD}" ]; then
    echo "${LOG_PREFIX} ERROR: No embed payload" >&2
    exit 1
  fi
else
  # Plain text message
  if [ $# -gt 0 ]; then
    MESSAGE="$*"
  else
    MESSAGE=$(cat)
  fi

  if [ -z "${MESSAGE}" ]; then
    echo "${LOG_PREFIX} ERROR: No message content" >&2
    exit 1
  fi

  PAYLOAD=$(jq -n --arg content "${MESSAGE}" '{ content: $content }')
fi

# Send via Discord REST API
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "https://discord.com/api/v10/channels/${CHANNEL_ID}/messages" \
  -H "Authorization: Bot ${BOT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "${PAYLOAD}" 2>/dev/null || echo "000")

if [ "${HTTP_CODE}" = "200" ] || [ "${HTTP_CODE}" = "201" ]; then
  echo "${LOG_PREFIX} Message sent to channel ${CHANNEL_ID}"
else
  echo "${LOG_PREFIX} ERROR: Discord API returned HTTP ${HTTP_CODE}" >&2
  exit 1
fi
