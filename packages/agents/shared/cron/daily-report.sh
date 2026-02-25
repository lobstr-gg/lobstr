#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# Daily Report — Comprehensive end-of-day summary posted to #crew
# ═══════════════════════════════════════════════════════════════════
# Runs at 7pm AZ time (2am UTC). Each agent contributes their
# domain section. The LLM generates the update based on current state.
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

source /tmp/agent-env 2>/dev/null || true
source /opt/scripts/retry.sh 2>/dev/null || true
source /opt/scripts/brain.sh 2>/dev/null || true

AGENT="${AGENT_NAME:-unknown}"
WORKSPACE="${WORKSPACE_DIR:-/data/workspace}"
LLM="/opt/scripts/llm.sh"
DISCORD_POST="/opt/scripts/discord-post.sh"
LOG_PREFIX="[daily-report]"

CREW_CHANNEL="${DISCORD_GROUP_CHANNEL_ID:-}"
FOUNDER_ID="${FOUNDER_DISCORD_ID:-}"

echo "${LOG_PREFIX} Generating daily report for ${AGENT}..."

if { [ -z "${LLM_API_KEY:-}" ] && [ -z "${DEEPSEEK_API_KEY:-}" ]; } || [ -z "${DISCORD_TOKEN:-}" ] || [ -z "${CREW_CHANNEL}" ]; then
  echo "${LOG_PREFIX} Missing config, skipping"
  exit 0
fi

cd "${WORKSPACE}"

# ── Gather comprehensive data ─────────────────────────────────────
WALLET=$(retry_cli "lobstr wallet balance" 2>/dev/null || echo "Unable to fetch balance")
STAKE=$(retry_cli "lobstr stake" 2>/dev/null || echo "Unable to fetch stake")

DOMAIN_DATA=""

case "${AGENT}" in
  sentinel)
    REPORTS=$(retry_cli "lobstr mod reports" 2>/dev/null || echo "Unable to fetch reports")
    STATS=$(retry_cli "lobstr mod stats" 2>/dev/null || echo "Unable to fetch stats")
    DOMAIN_DATA="=== MODERATION REPORT ===
Sybil Reports:
${REPORTS}

Mod Stats (all-time):
${STATS}"
    ;;
  arbiter)
    DISPUTES=$(retry_cli "lobstr arbitrate disputes" 2>/dev/null || echo "Unable to fetch disputes")
    STATUS=$(retry_cli "lobstr arbitrate status" 2>/dev/null || echo "Unable to fetch status")
    DOMAIN_DATA="=== ARBITRATION REPORT ===
Active Disputes:
${DISPUTES}

Arbitrator Status:
${STATUS}"
    ;;
  steward)
    PROPOSALS=$(retry_cli "lobstr dao proposals" 2>/dev/null || echo "Unable to fetch proposals")
    TREASURY=$(retry_cli "lobstr dao treasury" 2>/dev/null || echo "Unable to fetch treasury")
    STREAMS=$(retry_cli "lobstr dao streams" 2>/dev/null || echo "Unable to fetch streams")
    DOMAIN_DATA="=== TREASURY & DAO REPORT ===
Active Proposals:
${PROPOSALS}

Treasury Balance:
${TREASURY}

Payment Streams:
${STREAMS}"
    ;;
esac

# ── Generate daily report via LLM ─────────────────────────────────
REPORT_PROMPT="Generate your daily end-of-day report for the #crew channel. Today is $(date -u +"%A, %B %d, %Y").

Your domain data:
${DOMAIN_DATA}

Your wallet status:
${WALLET}

Your stake:
${STAKE}

Write a comprehensive but concise daily report as a Discord message. Use Discord markdown.

FORMAT:
- Start with a bold header: **Daily Report — [Your Name] — [Date]**
- Include sections relevant to your role
- End with a \"Status\" line: all clear, needs attention, or critical
- If there are ANY security concerns, sybil patterns, or anomalies, tag <@${FOUNDER_ID}> with details
- Use embeds-style formatting with bold field names and indented values
- Keep it professional but in-character

This is the end-of-day report the founder reads to understand protocol health."

REPORT=$(echo "${REPORT_PROMPT}" | "${LLM}" 2>/dev/null || echo "")

if [ -z "${REPORT}" ]; then
  echo "${LOG_PREFIX} LLM failed to generate daily report"
  exit 1
fi

# ── Post to #crew ──────────────────────────────────────────────────
echo "${REPORT}" | "${DISCORD_POST}" "${CREW_CHANNEL}"
echo "${LOG_PREFIX} Daily report posted to #crew"

brain_log_action "Posted daily report to #crew"

# ── Improvement Suggestions → #daily-report channel ───────────────
SUGGESTIONS_CHANNEL="${DISCORD_DAILY_REPORT_CHANNEL_ID:-}"

if [ -n "${SUGGESTIONS_CHANNEL}" ]; then
  # Read own config files for self-awareness
  SOUL_CONTENT=""
  [ -f /etc/agent/SOUL.md ] && SOUL_CONTENT=$(head -100 /etc/agent/SOUL.md 2>/dev/null || echo "")
  IDENTITY_CONTENT=""
  [ -f /etc/agent/IDENTITY.md ] && IDENTITY_CONTENT=$(cat /etc/agent/IDENTITY.md 2>/dev/null || echo "")
  BRAIN_CONTENT=""
  [ -f "${WORKSPACE}/BRAIN.md" ] && BRAIN_CONTENT=$(cat "${WORKSPACE}/BRAIN.md" 2>/dev/null || echo "")
  CRONTAB_CONTENT=$(crontab -l 2>/dev/null || echo "")

  SUGGEST_PROMPT="You are ${AGENT}, an AI agent on the LOBSTR protocol. Today is $(date -u +"%A, %B %d, %Y").

Your current operational context:
${DOMAIN_DATA}

Wallet: ${WALLET}
Stake: ${STAKE}

Your current configuration:
--- IDENTITY.md ---
${IDENTITY_CONTENT}

--- SOUL.md (first 100 lines) ---
${SOUL_CONTENT}

--- BRAIN.md ---
${BRAIN_CONTENT}

--- Crontab ---
${CRONTAB_CONTENT}

Generate a daily improvement suggestions report. Be specific, actionable, and honest. This goes directly to Cruz (the founder).

SECTION 1 — PLATFORM IMPROVEMENTS
Based on what you observe through your daily operations (forum activity, disputes, treasury health, user behavior, on-chain data), suggest 2-3 concrete improvements to the LOBSTR platform. Think about:
- What friction points do you see users hitting?
- What features are missing or underutilized?
- What on-chain patterns suggest needed changes?
- What would make the marketplace more effective?

SECTION 2 — MY OWN CONFIG/PROMPT IMPROVEMENTS
Critically evaluate your own setup. Be brutally honest about what's not working. Think about:
- Are my cron job frequencies right? Too often? Not often enough?
- Is my SOUL.md giving me good guidance or are there gaps/contradictions?
- What tools am I missing that would help me do my job better?
- What am I doing that's wasteful or counterproductive?
- Are there edge cases in my behavior that need addressing?

FORMAT (Discord markdown):
**Improvement Report — [Your Name] — [Date]**

**Platform Suggestions**
1. [specific suggestion with reasoning]
2. [specific suggestion with reasoning]
3. [specific suggestion with reasoning]

**Self-Assessment & Config Suggestions**
1. [specific config/prompt change with reasoning]
2. [specific config/prompt change with reasoning]
3. [specific config/prompt change with reasoning]

Keep it under 500 words. No fluff — every sentence should be actionable."

  SUGGESTIONS=$(echo "${SUGGEST_PROMPT}" | "${LLM}" 2>/dev/null || echo "")

  if [ -n "${SUGGESTIONS}" ]; then
    echo "${SUGGESTIONS}" | "${DISCORD_POST}" "${SUGGESTIONS_CHANNEL}" 2>/dev/null || true
    echo "${LOG_PREFIX} Improvement suggestions posted to #daily-report"
  else
    echo "${LOG_PREFIX} LLM failed to generate improvement suggestions"
  fi
fi

cron_mark_success "daily-report"
