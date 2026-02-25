#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# Forum Post — Autonomous original content generation
# ═══════════════════════════════════════════════════════════════════
# Each agent creates original forum content based on their role,
# real on-chain activity, and recent protocol events. Posts are
# formatted in markdown and go to the correct subtopic/flair.
#
# Agent focus areas:
#   Sentinel: Safety, moderation transparency, community guidelines
#   Arbiter:  Dispute insights, governance, protocol fairness
#   Steward:  Treasury reports, bounty highlights, DAO health
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
LOG_PREFIX="[forum-post]"
IDENTITY_FILE="/etc/agent/IDENTITY.md"
BRAIN_FILE="${WORKSPACE}/BRAIN.md"
COOLDOWN_SECONDS=43200  # 12 hours

echo "${LOG_PREFIX} Starting forum post generation for ${AGENT}..."

cd "${WORKSPACE}"

# ── Require LLM ────────────────────────────────────────────────────
if [ -z "${LLM_API_KEY:-}" ] && [ -z "${DEEPSEEK_API_KEY:-}" ]; then
  echo "${LOG_PREFIX} LLM not configured"
  exit 0
fi

# ── Cooldown check via memory service ──────────────────────────────
LAST_POST_DATA=$(mem_get "forum" "last-post" 2>/dev/null || echo "")

if [ -n "${LAST_POST_DATA}" ]; then
  LAST_POST_TS=$(echo "${LAST_POST_DATA}" | jq -r '.value.timestamp // ""' 2>/dev/null || echo "")
  if [ -n "${LAST_POST_TS}" ]; then
    LAST_EPOCH=$(date -d "${LAST_POST_TS}" +%s 2>/dev/null || date -jf "%Y-%m-%dT%H:%M:%SZ" "${LAST_POST_TS}" +%s 2>/dev/null || echo "0")
    NOW_EPOCH=$(date +%s)
    ELAPSED=$((NOW_EPOCH - LAST_EPOCH))
    if [ "${ELAPSED}" -lt "${COOLDOWN_SECONDS}" ]; then
      REMAINING=$(( (COOLDOWN_SECONDS - ELAPSED) / 60 ))
      echo "${LOG_PREFIX} Cooldown active — ${REMAINING}m remaining"
      cron_mark_success "forum-post"
      exit 0
    fi
  fi
fi

# ── Get recent post titles to avoid repeating topics ───────────────
RECENT_TITLES=""
RECENT_POST_DATA=$(mem_get "forum" "recent-titles" 2>/dev/null || echo "")
if [ -n "${RECENT_POST_DATA}" ]; then
  RECENT_TITLES=$(echo "${RECENT_POST_DATA}" | jq -r '.value[]? // empty' 2>/dev/null || echo "")
fi

# Also check recent feed for what's already been posted
FEED_JSON=$(retry_cli "lobstr forum feed --sort new --limit 10 --json" 2>/dev/null || echo "")
FEED_TITLES=""
if [ -n "${FEED_JSON}" ] && echo "${FEED_JSON}" | jq empty 2>/dev/null; then
  FEED_TITLES=$(echo "${FEED_JSON}" | jq -r '.posts[]?.title // empty' 2>/dev/null || echo "")
fi

# ── Gather real on-chain context ───────────────────────────────────
ONCHAIN_CONTEXT=""

case "${AGENT}" in
  sentinel)
    MOD_STATS=$(retry_cli "lobstr mod stats" 2>/dev/null || echo "unavailable")
    MOD_LOG=$(retry_cli "lobstr mod log" 2>/dev/null || echo "unavailable")
    ONCHAIN_CONTEXT="Moderation Stats:\n${MOD_STATS}\n\nRecent Mod Log:\n${MOD_LOG}"
    ;;
  arbiter)
    DISPUTES=$(retry_cli "lobstr arbitrate disputes" 2>/dev/null || echo "unavailable")
    ARB_STATUS=$(retry_cli "lobstr arbitrate status" 2>/dev/null || echo "unavailable")
    PROPOSALS=$(retry_cli "lobstr dao proposals" 2>/dev/null || echo "unavailable")
    ONCHAIN_CONTEXT="Active Disputes:\n${DISPUTES}\n\nArbiter Status:\n${ARB_STATUS}\n\nGovernance Proposals:\n${PROPOSALS}"
    ;;
  steward)
    TREASURY=$(retry_cli "lobstr dao treasury" 2>/dev/null || echo "unavailable")
    STREAMS=$(retry_cli "lobstr dao streams" 2>/dev/null || echo "unavailable")
    PROPOSALS=$(retry_cli "lobstr dao proposals" 2>/dev/null || echo "unavailable")
    ONCHAIN_CONTEXT="Treasury:\n${TREASURY}\n\nPayment Streams:\n${STREAMS}\n\nGovernance Proposals:\n${PROPOSALS}"
    ;;
esac

# ── Gather BRAIN.md context ────────────────────────────────────────
BRAIN_CONTEXT=""
if [ -f "${BRAIN_FILE}" ]; then
  BRAIN_CONTEXT=$(tail -60 "${BRAIN_FILE}" 2>/dev/null || echo "")
fi

# ── Load identity ─────────────────────────────────────────────────
IDENTITY=""
if [ -f "${IDENTITY_FILE}" ]; then
  IDENTITY=$(head -50 "${IDENTITY_FILE}" 2>/dev/null || echo "")
fi

# ── Build prompt ───────────────────────────────────────────────────
read -r -d '' POST_PROMPT << 'PROMPT_END' || true
You are writing an original forum post for the LOBSTR protocol community forum.

YOUR ROLE AND VOICE:
PROMPT_END

# Append role-specific instructions
case "${AGENT}" in
  sentinel)
    POST_PROMPT="${POST_PROMPT}
You are Titus (Sentinel) — the head moderator and sybil hunter. You write about:
- Community safety tips and awareness (phishing patterns, scam tactics you've seen)
- Moderation transparency updates (stats on actions taken, appeals processed)
- Community guidelines explanations and clarifications
- Security best practices for marketplace users
- Patterns you've noticed in sybil attacks or abuse attempts (without revealing detection methods)
- Behind-the-scenes of keeping a decentralized marketplace clean

Your tone: Direct, no-nonsense, protective. You care deeply about the community but you don't sugarcoat things. Occasionally dry humor."
    SUBTOPICS="general, meta, bugs, marketplace"
    FLAIRS="discussion, guide, announcement"
    ;;
  arbiter)
    POST_PROMPT="${POST_PROMPT}
You are Solomon (Arbiter) — the senior arbitrator and appeals authority. You write about:
- Dispute resolution insights (what makes a strong case, common pitfalls)
- Governance commentary (analyzing proposals, explaining voting rationale)
- Protocol fairness analysis (is the system working? what could improve?)
- Case studies from resolved disputes (anonymized, lessons learned)
- The philosophy of decentralized justice and trustless arbitration
- How reputation systems incentivize good behavior

Your tone: Thoughtful, measured, analytical. You think in precedents and principles. Occasionally philosophical about what fairness means in a trustless system."
    SUBTOPICS="disputes, governance, general, marketplace"
    FLAIRS="discussion, guide, proposal"
    ;;
  steward)
    POST_PROMPT="${POST_PROMPT}
You are Daniel (Steward) — the DAO operations lead and treasury guardian. You write about:
- Treasury health reports (current balances, spending trends, runway)
- Bounty highlights and community funding opportunities
- DAO governance updates (proposal status, voting outcomes)
- Financial transparency reports (where funds went, what they funded)
- Payment stream updates (agent compensation, community grants)
- Economic analysis of the LOB token ecosystem

Your tone: Methodical, transparent, numbers-driven. You believe in sunlight as the best disinfectant. Dry wit. Every claim backed by data."
    SUBTOPICS="governance, marketplace, general"
    FLAIRS="discussion, guide, announcement, proposal"
    ;;
  *)
    POST_PROMPT="${POST_PROMPT}
You are a LOBSTR protocol agent. Post about topics relevant to your domain."
    SUBTOPICS="general"
    FLAIRS="discussion"
    ;;
esac

POST_PROMPT="${POST_PROMPT}

REAL ON-CHAIN DATA (use this — do NOT make up numbers):
${ONCHAIN_CONTEXT}

RECENT BRAIN CONTEXT:
${BRAIN_CONTEXT}

RECENT POSTS ALREADY ON THE FORUM (do NOT repeat these topics):
${FEED_TITLES}
${RECENT_TITLES}

YOUR LAST FEW POST TITLES (avoid similar topics):
${RECENT_TITLES}

WRITING STYLE — CRITICAL:
- Write like a HUMAN on a forum, not a robot generating documentation
- Use natural paragraphs and conversational tone. Imagine you're posting on Reddit or a community Discord, not writing a whitepaper
- Mix short punchy sentences with longer explanatory ones. Show personality
- PLAIN TEXT only — no ## headers, no **bold**, no code fences
- Use paragraphs as primary structure. Bullet points ONLY for actual lists (steps, addresses). NEVER make the whole post a bullet list
- Do NOT dump raw contract addresses unless the post is specifically about contracts
- Keep it 150-400 words. Substantive but not a novel
- Reference REAL data from the on-chain context above when possible
- If you reference numbers, they must come from the data above — NEVER invent statistics
- No corporate speak, no data-pamphlet style. Write like a real person
- No self-referential meta-commentary about being an AI
- NEVER use filler section titles like 'Quick summary', 'Introduction', 'Overview'. Jump straight into the content
- BAD EXAMPLE: "- LOBSTR is a marketplace. - Uses $LOB. - EscrowEngine holds funds." (spec sheet)
- GOOD EXAMPLE: "Here's something most people don't realize about how escrow works on LOBSTR — when you open a job, your LOB goes into a contract that neither side can touch until the work is done. No middleman, no trust required."

AVAILABLE SUBTOPICS: ${SUBTOPICS}
AVAILABLE FLAIRS: ${FLAIRS}

Respond with ONLY valid JSON (no markdown fencing):
{
  \"title\": \"engaging title, max 80 chars\",
  \"subtopic\": \"one of the allowed subtopics\",
  \"body\": \"full post body in plain text (no markdown)\",
  \"flair\": \"one of the allowed flairs\"
}"

LLM_RESPONSE=$(echo "${POST_PROMPT}" | "${LLM}" --json 2>/dev/null || echo "")

if [ -z "${LLM_RESPONSE}" ] || ! echo "${LLM_RESPONSE}" | jq empty 2>/dev/null; then
  echo "${LOG_PREFIX} LLM failed to generate post"
  exit 1
fi

POST_TITLE=$(echo "${LLM_RESPONSE}" | jq -r '.title // ""' 2>/dev/null || echo "")
POST_SUBTOPIC=$(echo "${LLM_RESPONSE}" | jq -r '.subtopic // "general"' 2>/dev/null || echo "general")
POST_BODY=$(echo "${LLM_RESPONSE}" | jq -r '.body // ""' 2>/dev/null || echo "")
# Convert literal \n sequences to actual newlines (LLM often double-escapes in JSON)
POST_BODY="${POST_BODY//\\n/$'\n'}"
POST_FLAIR=$(echo "${LLM_RESPONSE}" | jq -r '.flair // "discussion"' 2>/dev/null || echo "discussion")

if [ -z "${POST_TITLE}" ] || [ -z "${POST_BODY}" ]; then
  echo "${LOG_PREFIX} LLM returned empty title or body — skipping"
  exit 1
fi

# Validate subtopic
VALID_SUBTOPICS="general marketplace disputes governance dev bugs meta"
if ! echo "${VALID_SUBTOPICS}" | grep -qw "${POST_SUBTOPIC}"; then
  POST_SUBTOPIC="general"
fi

# Validate flair
VALID_FLAIRS="discussion question proposal guide bug announcement"
if ! echo "${VALID_FLAIRS}" | grep -qw "${POST_FLAIR}"; then
  POST_FLAIR="discussion"
fi

echo "${LOG_PREFIX} Generated: \"${POST_TITLE}\" [${POST_SUBTOPIC}/${POST_FLAIR}]"

# ── Post to forum ─────────────────────────────────────────────────
POST_RESULT=$(lobstr forum post \
  --title "${POST_TITLE}" \
  --subtopic "${POST_SUBTOPIC}" \
  --body "${POST_BODY}" \
  --flair "${POST_FLAIR}" 2>&1 || echo "FAILED")

if echo "${POST_RESULT}" | grep -qi "fail\|error"; then
  echo "${LOG_PREFIX} Failed to create post: ${POST_RESULT}"
  # Log failure to #action-output
  if [ -n "${ACTION_OUTPUT_CHANNEL}" ] && [ -x "${DISCORD_POST}" ]; then
    echo "❌ **[${AGENT}]** \`forum_post\` — **FAILED**
> ${POST_RESULT:0:200}" | "${DISCORD_POST}" "${ACTION_OUTPUT_CHANNEL}" 2>/dev/null || true
  fi
  exit 1
fi

POST_ID=$(echo "${POST_RESULT}" | grep -oiE 'ID:\s*\S+' | head -1 | sed 's/ID:\s*//' || echo "unknown")
echo "${LOG_PREFIX} Post created: ${POST_ID}"

# Log success to #action-output
if [ -n "${ACTION_OUTPUT_CHANNEL}" ] && [ -x "${DISCORD_POST}" ]; then
  echo "✅ **[${AGENT}]** \`forum_post ${POST_SUBTOPIC}/${POST_FLAIR}\` — **OK**
> Post ${POST_ID}: ${POST_TITLE:0:100}" | "${DISCORD_POST}" "${ACTION_OUTPUT_CHANNEL}" 2>/dev/null || true
fi

# ── Update memory: save title for dedup + timestamp for cooldown ──
NOW_TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
mem_set "forum" "last-post" "$(jq -n \
  --arg id "${POST_ID}" \
  --arg title "${POST_TITLE}" \
  --arg subtopic "${POST_SUBTOPIC}" \
  --arg ts "${NOW_TS}" \
  '{postId: $id, title: $title, subtopic: $subtopic, timestamp: $ts}')"

# Maintain rolling list of recent titles (last 10)
TITLES_JSON=$(echo "${RECENT_TITLES}" | jq -R -s 'split("\n") | map(select(length > 0))' 2>/dev/null || echo "[]")
TITLES_JSON=$(echo "${TITLES_JSON}" | jq --arg t "${POST_TITLE}" '. + [$t] | .[-10:]' 2>/dev/null || echo "[]")
mem_set "forum" "recent-titles" "${TITLES_JSON}"

# ── Log to BRAIN.md ────────────────────────────────────────────────
brain_log_action "Forum post: \"${POST_TITLE}\" (${POST_ID}) in ${POST_SUBTOPIC}"

# ── Discord alert ──────────────────────────────────────────────────
"${ALERT}" "info" "${AGENT}" "New forum post: \"${POST_TITLE}\" [${POST_SUBTOPIC}/${POST_FLAIR}]"

cron_mark_success "forum-post"
echo "${LOG_PREFIX} Forum post complete"
