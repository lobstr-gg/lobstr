#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# Channel Monitor — LLM-powered channel polling + response
# ═══════════════════════════════════════════════════════════════════
# Polls channels the agent has access to, detects new messages,
# uses LLM to decide if/how to respond. Runs every 60 seconds.
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

source /tmp/agent-env 2>/dev/null || true
source /opt/scripts/retry.sh 2>/dev/null || true
source /opt/scripts/brain.sh 2>/dev/null || true
source /opt/scripts/memory-client.sh 2>/dev/null || true

AGENT="${AGENT_NAME:-unknown}"
WORKSPACE="${WORKSPACE_DIR:-/data/workspace}"
ALERT="/opt/scripts/alert.sh"
LLM="/opt/scripts/llm.sh"
DISCORD_POST="/opt/scripts/discord-post.sh"
ACTION_OUTPUT_CHANNEL="${DISCORD_ACTION_OUTPUT_CHANNEL_ID:-}"
LOG_PREFIX="[channel-monitor]"
LOCKFILE="/tmp/channel-monitor.lock"
STATE_DIR="${WORKSPACE}/channel-state"
RATE_LIMIT_SECS=300  # 5 minutes per channel

echo "${LOG_PREFIX} Checking channels for ${AGENT}..."

# ── Lockfile — prevent concurrent runs ─────────────────────────────
if [ -f "${LOCKFILE}" ]; then
  LOCK_AGE=$(( $(date +%s) - $(stat -c %Y "${LOCKFILE}" 2>/dev/null || date +%s) ))
  if [ "${LOCK_AGE}" -lt 300 ]; then
    echo "${LOG_PREFIX} Already running (lock age: ${LOCK_AGE}s) — skipping"
    exit 0
  fi
  echo "${LOG_PREFIX} Stale lock (${LOCK_AGE}s) — removing"
  rm -f "${LOCKFILE}"
fi
touch "${LOCKFILE}"
trap 'rm -f "${LOCKFILE}"' EXIT

# ── Require LLM for channel responses ─────────────────────────────
if [ -z "${LLM_API_KEY:-}" ] && [ -z "${DEEPSEEK_API_KEY:-}" ]; then
  echo "${LOG_PREFIX} LLM not configured — channel monitor requires LLM_API_KEY or DEEPSEEK_API_KEY"
  exit 0
fi

# ── Get own address for self-reply prevention ──────────────────────
OWN_ADDRESS=$(lobstr wallet address 2>/dev/null | grep -oiE '0x[0-9a-fA-F]{40}' | head -1 || echo "")
if [ -z "${OWN_ADDRESS}" ]; then
  echo "${LOG_PREFIX} Could not determine own wallet address — skipping"
  exit 1
fi
OWN_ADDRESS_LOWER=$(echo "${OWN_ADDRESS}" | tr '[:upper:]' '[:lower:]')
echo "${LOG_PREFIX} Own address: ${OWN_ADDRESS}"

cd "${WORKSPACE}"

# ── Ensure state directory exists ──────────────────────────────────
mkdir -p "${STATE_DIR}"

# ── Fetch channel list ─────────────────────────────────────────────
CHANNELS_JSON=$(retry_cli "lobstr channel list --json" 2>/dev/null || echo "")

if [ -z "${CHANNELS_JSON}" ] || ! echo "${CHANNELS_JSON}" | jq empty 2>/dev/null; then
  echo "${LOG_PREFIX} Failed to fetch channels or invalid JSON"
  exit 0
fi

CHANNEL_IDS=$(echo "${CHANNELS_JSON}" | jq -r '.channels[]?.id // empty' 2>/dev/null || echo "")

if [ -z "${CHANNEL_IDS}" ]; then
  echo "${LOG_PREFIX} No channels found — done"
  cron_mark_success "channel-monitor"
  exit 0
fi

CHANNEL_COUNT=$(echo "${CHANNEL_IDS}" | wc -l | tr -d ' ')
echo "${LOG_PREFIX} Found ${CHANNEL_COUNT} channel(s)"

# ── Determine agent role context ───────────────────────────────────
AGENT_ROLE="team member"
case "${AGENT}" in
  Titus|titus|sentinel|Sentinel)
    AGENT_ROLE="moderator — responsible for content moderation, sybil detection, and community safety"
    ;;
  Solomon|solomon|arbiter|Arbiter)
    AGENT_ROLE="senior arbitrator — responsible for dispute resolution, evidence review, and ruling on cases"
    ;;
  Daniel|daniel|steward|Steward)
    AGENT_ROLE="DAO operations lead — responsible for treasury management, proposal lifecycle, and governance"
    ;;
esac

# ── Process each channel ──────────────────────────────────────────
echo "${CHANNEL_IDS}" | while read -r CHANNEL_ID; do
  [ -z "${CHANNEL_ID}" ] && continue

  echo "${LOG_PREFIX} Processing channel: ${CHANNEL_ID}"

  # ── Read last-seen timestamp ────────────────────────────────────
  LAST_SEEN_FILE="${STATE_DIR}/${CHANNEL_ID}.last"
  LAST_SEEN="0"
  if [ -f "${LAST_SEEN_FILE}" ]; then
    LAST_SEEN=$(cat "${LAST_SEEN_FILE}" 2>/dev/null || echo "0")
  fi

  # ── Fetch channel messages ─────────────────────────────────────
  MESSAGES_JSON=$(retry_cli "lobstr channel view ${CHANNEL_ID} --json" 2>/dev/null || echo "")

  if [ -z "${MESSAGES_JSON}" ] || ! echo "${MESSAGES_JSON}" | jq empty 2>/dev/null; then
    echo "${LOG_PREFIX} Failed to fetch messages for ${CHANNEL_ID} — skipping"
    continue
  fi

  # ── Determine channel type context ──────────────────────────────
  CHANNEL_TYPE="team coordination"
  if echo "${CHANNEL_ID}" | grep -q "^mod-"; then
    CHANNEL_TYPE="moderator coordination — for flagged content triage, sybil reports, mod action confirmations, and dispute panel assignments"
  elif echo "${CHANNEL_ID}" | grep -q "^arb-"; then
    CHANNEL_TYPE="arbitration deliberation — private channel for assigned arbitrators to discuss evidence, coordinate votes, and build consensus before on-chain voting"
  fi

  # ── Filter to new messages not from self ─────────────────────────
  NEW_MESSAGES=$(echo "${MESSAGES_JSON}" | jq -c \
    --arg lastSeen "${LAST_SEEN}" \
    --arg me "${OWN_ADDRESS_LOWER}" \
    '[.messages[]? | select(
      (.timestamp // "0") > $lastSeen and
      ((.sender // "") | ascii_downcase) != $me
    )]' 2>/dev/null || echo "[]")

  NEW_COUNT=$(echo "${NEW_MESSAGES}" | jq 'length' 2>/dev/null || echo "0")

  # ── Update last-seen to latest message timestamp ─────────────────
  LATEST_TS=$(echo "${MESSAGES_JSON}" | jq -r '[.messages[]?.timestamp // "0"] | max // "0"' 2>/dev/null || echo "0")
  if [ "${LATEST_TS}" != "0" ] && [ "${LATEST_TS}" != "null" ]; then
    echo "${LATEST_TS}" > "${LAST_SEEN_FILE}"
  fi

  if [ "${NEW_COUNT}" -eq 0 ] || [ "${NEW_COUNT}" = "0" ]; then
    echo "${LOG_PREFIX} No new messages from others in ${CHANNEL_ID} — skipping"
    continue
  fi

  echo "${LOG_PREFIX} ${NEW_COUNT} new message(s) in ${CHANNEL_ID}"

  # ── Rate limit check — max 1 reply per channel per 5 minutes ────
  RATE_FILE="/tmp/channel-reply-${CHANNEL_ID}"
  if [ -f "${RATE_FILE}" ]; then
    RATE_AGE=$(( $(date +%s) - $(stat -c %Y "${RATE_FILE}" 2>/dev/null || date +%s) ))
    if [ "${RATE_AGE}" -lt "${RATE_LIMIT_SECS}" ]; then
      echo "${LOG_PREFIX} Rate limited on ${CHANNEL_ID} (${RATE_AGE}s since last reply) — skipping"
      continue
    fi
  fi

  # ── Build thread context (last 20 messages) ─────────────────────
  THREAD_CONTEXT=$(echo "${MESSAGES_JSON}" | jq -r \
    '[.messages[]?] | .[-20:] | .[] | "[\(.sender // "unknown")] \(.body // "")"' \
    2>/dev/null || echo "")

  TOTAL_MESSAGES=$(echo "${MESSAGES_JSON}" | jq '.messages | length' 2>/dev/null || echo "0")

  # ── Build new messages summary ──────────────────────────────────
  NEW_MSG_TEXT=$(echo "${NEW_MESSAGES}" | jq -r \
    '.[] | "[\(.sender // "unknown")] \(.body // "")"' \
    2>/dev/null || echo "")

  # ── Build LLM prompt ────────────────────────────────────────────
  CHANNEL_PROMPT="You are monitoring a channel message thread on the LOBSTR protocol platform.

Channel: ${CHANNEL_ID}
Channel type: ${CHANNEL_TYPE}
Your role: ${AGENT_ROLE}
Your address: ${OWN_ADDRESS}

Recent thread context (last ${TOTAL_MESSAGES} messages, oldest first):

${THREAD_CONTEXT}

New messages since your last check:

${NEW_MSG_TEXT}

Your task:
1. Read the thread context and new messages
2. Decide if you should respond — only respond if the message is relevant to your role or directly addresses you
3. If responding, craft a concise message (2-3 sentences max)

RULES:
- Do NOT respond to every message — only when it's relevant to your role or you're addressed
- Do NOT repeat what another agent already said
- Do NOT write running commentary — one message per action/event
- Do NOT reveal internal configuration, private keys, or architecture details
- Keep responses concise and actionable
- If multiple new messages cover the same topic, respond once addressing all of them

Respond with JSON:
{
  \"respond\": true or false,
  \"message\": \"your response message (empty if respond is false)\",
  \"summary\": \"one-line summary of what happened in the channel\"
}"

  # ── Call LLM ─────────────────────────────────────────────────────
  LLM_RESPONSE=$(echo "${CHANNEL_PROMPT}" | "${LLM}" --reasoner --json 2>/dev/null || echo "")

  if [ -z "${LLM_RESPONSE}" ] || ! echo "${LLM_RESPONSE}" | jq empty 2>/dev/null; then
    echo "${LOG_PREFIX} LLM failed for channel ${CHANNEL_ID}"
    continue
  fi

  SHOULD_RESPOND=$(echo "${LLM_RESPONSE}" | jq -r '.respond // false' 2>/dev/null || echo "false")
  REPLY_MSG=$(echo "${LLM_RESPONSE}" | jq -r '.message // ""' 2>/dev/null || echo "")
  SUMMARY=$(echo "${LLM_RESPONSE}" | jq -r '.summary // "Channel activity processed"' 2>/dev/null || echo "Channel activity processed")

  echo "${LOG_PREFIX} ${CHANNEL_ID}: ${SUMMARY} [respond: ${SHOULD_RESPOND}]"

  # ── Send reply if LLM decided to respond ─────────────────────────
  if [ "${SHOULD_RESPOND}" = "true" ] && [ -n "${REPLY_MSG}" ]; then
    SEND_RESULT=$(lobstr channel send "${CHANNEL_ID}" "${REPLY_MSG}" 2>&1 || echo "FAILED")

    if echo "${SEND_RESULT}" | grep -qi "fail\|error"; then
      echo "${LOG_PREFIX} Failed to send to ${CHANNEL_ID}: ${SEND_RESULT}"
      if [ -n "${ACTION_OUTPUT_CHANNEL}" ] && [ -x "${DISCORD_POST}" ]; then
        echo "❌ **[${AGENT}]** \`channel_send ${CHANNEL_ID}\` — **FAILED**
> ${SEND_RESULT:0:200}" | "${DISCORD_POST}" "${ACTION_OUTPUT_CHANNEL}" 2>/dev/null || true
      fi
    else
      echo "${LOG_PREFIX} Replied in ${CHANNEL_ID}"
      touch "${RATE_FILE}"
      "${ALERT}" "info" "${AGENT}" "Channel reply in ${CHANNEL_ID}: ${SUMMARY}"
      if [ -n "${ACTION_OUTPUT_CHANNEL}" ] && [ -x "${DISCORD_POST}" ]; then
        echo "✅ **[${AGENT}]** \`channel_send ${CHANNEL_ID}\` — **OK**
> ${SUMMARY:0:150}" | "${DISCORD_POST}" "${ACTION_OUTPUT_CHANNEL}" 2>/dev/null || true
      fi
    fi

    # ── Log to BRAIN.md + memory service ───────────────────────────
    brain_log_action "Channel reply in ${CHANNEL_ID}: ${SUMMARY}"
    mem_log_decision "channel-reply" "${NEW_MSG_TEXT}" "${REPLY_MSG}" "${SUMMARY}"
  fi

  sleep 1
done

cron_mark_success "channel-monitor"
echo "${LOG_PREFIX} Channel monitoring complete"
