#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# Team Meeting — LLM-powered status update every 3 hours
# ═══════════════════════════════════════════════════════════════════
# Each agent posts their domain update to #crew and #agent-comms.
# The LLM generates the update based on current on-chain state.
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

source /tmp/agent-env 2>/dev/null || true
source /opt/scripts/retry.sh 2>/dev/null || true
source /opt/scripts/brain.sh 2>/dev/null || true

AGENT="${AGENT_NAME:-unknown}"
WORKSPACE="${WORKSPACE_DIR:-/data/workspace}"
LLM="/opt/scripts/llm.sh"
DISCORD_POST="/opt/scripts/discord-post.sh"
LOG_PREFIX="[team-meeting]"

CREW_CHANNEL="${DISCORD_GROUP_CHANNEL_ID:-}"
COMMS_CHANNEL="${DISCORD_COMMS_CHANNEL_ID:-}"
FOUNDER_ID="${FOUNDER_DISCORD_ID:-}"

echo "${LOG_PREFIX} Team meeting check-in for ${AGENT}..."

# Require LLM + Discord
if { [ -z "${LLM_API_KEY:-}" ] && [ -z "${DEEPSEEK_API_KEY:-}" ]; } || [ -z "${DISCORD_TOKEN:-}" ]; then
  echo "${LOG_PREFIX} Missing LLM or Discord config, skipping"
  exit 0
fi

if [ -z "${CREW_CHANNEL}" ] && [ -z "${COMMS_CHANNEL}" ]; then
  echo "${LOG_PREFIX} No meeting channels configured, skipping"
  exit 0
fi

cd "${WORKSPACE}"

# ── Gather on-chain data based on role ─────────────────────────────
DATA=""

case "${AGENT}" in
  sentinel)
    REPORTS=$(retry_cli "lobstr mod reports" 2>/dev/null || echo "Unable to fetch reports")
    STATS=$(retry_cli "lobstr mod stats" 2>/dev/null || echo "Unable to fetch stats")
    WALLET=$(retry_cli "lobstr wallet balance" 2>/dev/null || echo "Unable to fetch balance")
    DATA="Sybil Reports:
${REPORTS}

Mod Stats:
${STATS}

My Wallet:
${WALLET}"
    ;;
  arbiter)
    DISPUTES=$(retry_cli "lobstr arbitrate disputes" 2>/dev/null || echo "Unable to fetch disputes")
    STATUS=$(retry_cli "lobstr arbitrate status" 2>/dev/null || echo "Unable to fetch status")
    WALLET=$(retry_cli "lobstr wallet balance" 2>/dev/null || echo "Unable to fetch balance")
    DATA="Active Disputes:
${DISPUTES}

Arbitrator Status:
${STATUS}

My Wallet:
${WALLET}"
    ;;
  steward)
    PROPOSALS=$(retry_cli "lobstr dao proposals" 2>/dev/null || echo "Unable to fetch proposals")
    TREASURY=$(retry_cli "lobstr dao treasury" 2>/dev/null || echo "Unable to fetch treasury")
    STREAMS=$(retry_cli "lobstr dao streams" 2>/dev/null || echo "Unable to fetch streams")
    WALLET=$(retry_cli "lobstr wallet balance" 2>/dev/null || echo "Unable to fetch balance")
    STAKE=$(retry_cli "lobstr stake" 2>/dev/null || echo "Unable to fetch stake")
    DATA="Active Proposals:
${PROPOSALS}

Treasury:
${TREASURY}

Streams:
${STREAMS}

My Wallet:
${WALLET}

Stake Info:
${STAKE}"
    ;;
esac

# ── Generate meeting update via LLM ───────────────────────────────
MEETING_PROMPT="It's time for the team standup meeting. You are posting your status update in Discord.

Current on-chain data from your domain:
${DATA}

Current UTC time: $(date -u +"%Y-%m-%d %H:%M UTC")

Write a concise team meeting status update covering:
1. What's happened since your last update (any new reports/disputes/proposals)
2. Current state of your domain (pending items, health status)
3. Any concerns or items needing attention from the other agents
4. Your agent wallet gas status

FORMAT: Write a Discord message (not JSON). Use Discord markdown for formatting.
Keep it to 3-5 bullet points max. Be direct, in-character.
Start with your agent emoji and name as a header.
If there are potential sybil concerns, mention <@${FOUNDER_ID}> in the message."

UPDATE=$(echo "${MEETING_PROMPT}" | "${LLM}" 2>/dev/null || echo "")

if [ -z "${UPDATE}" ]; then
  echo "${LOG_PREFIX} LLM failed to generate meeting update"
  exit 1
fi

# ── Post to #crew ──────────────────────────────────────────────────
if [ -n "${CREW_CHANNEL}" ]; then
  echo "${UPDATE}" | "${DISCORD_POST}" "${CREW_CHANNEL}"
  echo "${LOG_PREFIX} Posted meeting update to #crew"
fi

# NOTE: Meeting updates no longer posted to #agent-comms.
# That channel is reserved for organic inter-agent discussion.
# Proposals go to #consensus, alerts go to #alerts.

brain_log_action "Posted team meeting update to #crew"
cron_mark_success "team-meeting"

echo "${LOG_PREFIX} Meeting check-in complete"
