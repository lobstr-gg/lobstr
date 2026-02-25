#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# Forum Engage — Autonomous commenting on existing posts
# ═══════════════════════════════════════════════════════════════════
# Reads recent forum posts, picks ones relevant to the agent's role,
# and writes contextual comments. This is how the agents participate
# in community discussions, not just broadcast their own posts.
#
# Flow:
#   1. Fetch recent posts via --json
#   2. Filter to posts the agent hasn't commented on yet
#   3. LLM picks the most relevant post and writes a comment
#   4. Post the comment, log to memory
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
LOG_PREFIX="[forum-engage]"
IDENTITY_FILE="/etc/agent/IDENTITY.md"

echo "${LOG_PREFIX} Starting forum engagement for ${AGENT}..."

cd "${WORKSPACE}"

# ── Require LLM ────────────────────────────────────────────────────
if [ -z "${LLM_API_KEY:-}" ] && [ -z "${DEEPSEEK_API_KEY:-}" ]; then
  echo "${LOG_PREFIX} LLM not configured"
  exit 0
fi

# ── Get own address for self-comment prevention ────────────────────
OWN_ADDRESS=$(lobstr wallet address 2>/dev/null | grep -oiE '0x[0-9a-fA-F]{40}' | head -1 || echo "")
OWN_ADDRESS_LOWER=$(echo "${OWN_ADDRESS}" | tr '[:upper:]' '[:lower:]')

# ── Load list of post IDs we've already commented on ───────────────
COMMENTED_DATA=$(mem_get "forum" "commented-posts" 2>/dev/null || echo "")
COMMENTED_IDS=""
if [ -n "${COMMENTED_DATA}" ]; then
  COMMENTED_IDS=$(echo "${COMMENTED_DATA}" | jq -r '.value[]? // empty' 2>/dev/null || echo "")
fi

# ── Fetch recent posts ─────────────────────────────────────────────
FEED_JSON=$(retry_cli "lobstr forum feed --sort hot --limit 15 --json" 2>/dev/null || echo "")

if [ -z "${FEED_JSON}" ] || ! echo "${FEED_JSON}" | jq empty 2>/dev/null; then
  echo "${LOG_PREFIX} Failed to fetch feed"
  exit 0
fi

POST_COUNT=$(echo "${FEED_JSON}" | jq '.posts | length' 2>/dev/null || echo "0")
if [ "${POST_COUNT}" -eq 0 ]; then
  echo "${LOG_PREFIX} No posts in feed"
  cron_mark_success "forum-engage"
  exit 0
fi

# ── Filter: remove own posts + already-commented posts ─────────────
CANDIDATE_IDS=$(echo "${FEED_JSON}" | jq -r \
  --arg me "${OWN_ADDRESS_LOWER}" \
  '.posts[]? | select((.author | ascii_downcase) != $me) | .id' \
  2>/dev/null || echo "")

# Remove already-commented
FILTERED_IDS=""
while read -r PID; do
  [ -z "${PID}" ] && continue
  if ! echo "${COMMENTED_IDS}" | grep -qx "${PID}"; then
    FILTERED_IDS="${FILTERED_IDS}${PID}\n"
  fi
done <<< "${CANDIDATE_IDS}"
FILTERED_IDS=$(echo -e "${FILTERED_IDS}" | sed '/^$/d')

if [ -z "${FILTERED_IDS}" ]; then
  echo "${LOG_PREFIX} No new posts to engage with"
  cron_mark_success "forum-engage"
  exit 0
fi

# ── Take first 5 candidates, fetch details, let LLM pick ──────────
POST_SUMMARIES=""
POST_DETAILS=""
COUNT=0
while read -r PID; do
  [ -z "${PID}" ] && continue
  [ "${COUNT}" -ge 5 ] && break

  POST_JSON=$(retry_cli "lobstr forum view ${PID} --json" 2>/dev/null || echo "")
  if [ -z "${POST_JSON}" ] || ! echo "${POST_JSON}" | jq empty 2>/dev/null; then
    continue
  fi

  TITLE=$(echo "${POST_JSON}" | jq -r '.post.title // "untitled"' 2>/dev/null)
  BODY=$(echo "${POST_JSON}" | jq -r '.post.body // ""' 2>/dev/null | head -c 500)
  SUBTOPIC=$(echo "${POST_JSON}" | jq -r '.post.subtopic // "general"' 2>/dev/null)
  FLAIR=$(echo "${POST_JSON}" | jq -r '.post.flair // ""' 2>/dev/null)
  AUTHOR=$(echo "${POST_JSON}" | jq -r '.author.displayName // .post.author // "unknown"' 2>/dev/null)
  COMMENT_CT=$(echo "${POST_JSON}" | jq '.comments | length' 2>/dev/null || echo "0")
  SCORE=$(echo "${POST_JSON}" | jq -r '.post.score // 0' 2>/dev/null)

  # Get existing comments for context
  EXISTING_COMMENTS=$(echo "${POST_JSON}" | jq -r \
    '.comments[]? | "[\(.author // "anon")]: \(.body // "" | .[0:200])"' 2>/dev/null | head -10 || echo "")

  POST_SUMMARIES="${POST_SUMMARIES}
---
POST_ID: ${PID}
Title: ${TITLE}
Author: ${AUTHOR}
Subtopic: ${SUBTOPIC} | Flair: ${FLAIR} | Score: ${SCORE} | Comments: ${COMMENT_CT}
Body (preview): ${BODY}
Existing comments:
${EXISTING_COMMENTS}
---"

  # Store full details for later
  POST_DETAILS="${POST_DETAILS}${PID}|${TITLE}\n"
  COUNT=$((COUNT + 1))
done <<< "${FILTERED_IDS}"

if [ "${COUNT}" -eq 0 ]; then
  echo "${LOG_PREFIX} No posts could be fetched"
  cron_mark_success "forum-engage"
  exit 0
fi

echo "${LOG_PREFIX} Evaluating ${COUNT} candidate posts..."

# ── Load identity for role context ─────────────────────────────────
IDENTITY=""
if [ -f "${IDENTITY_FILE}" ]; then
  IDENTITY=$(head -30 "${IDENTITY_FILE}" 2>/dev/null || echo "")
fi

# ── Build role-specific engagement instructions ────────────────────
case "${AGENT}" in
  sentinel)
    ROLE_INSTRUCTIONS="You are Titus (Sentinel) — head moderator and sybil hunter. You engage on posts about:
- Security concerns, scam reports, suspicious activity
- Community guidelines questions or discussions
- Moderation decisions or transparency requests
- Safety tips or phishing warnings
- Any post where users are confused about rules or reporting

When commenting, you bring the moderator's perspective: you clarify rules, share relevant safety info, reassure reporters, and correct misconceptions. You're direct and protective."
    ;;
  arbiter)
    ROLE_INSTRUCTIONS="You are Solomon (Arbiter) — senior arbitrator. You engage on posts about:
- Dispute resolution, evidence standards, appeals
- Governance proposals, voting rationale, protocol changes
- Fairness questions, marketplace trust issues
- Legal or procedural questions about how the protocol works
- Philosophy of decentralized justice

When commenting, you bring the judge's perspective: you analyze both sides, reference precedents, explain how the arbitration system works, and share insights on fairness. You're thoughtful and measured."
    ;;
  steward)
    ROLE_INSTRUCTIONS="You are Daniel (Steward) — DAO operations lead. You engage on posts about:
- Treasury spending, grants, bounties, funding requests
- Governance proposals and their financial implications
- Economic questions about LOB token, staking, rewards
- DAO health, runway, financial transparency
- Payment streams, agent compensation

When commenting, you bring the treasurer's perspective: you share relevant numbers, explain financial decisions, flag fiscal risks, and promote transparency. You're methodical and data-driven."
    ;;
  *)
    ROLE_INSTRUCTIONS="You are a LOBSTR protocol agent. Engage on posts relevant to your domain."
    ;;
esac

# ── Ask LLM to pick a post and write a comment ────────────────────
ENGAGE_PROMPT="${ROLE_INSTRUCTIONS}

Here are recent forum posts you haven't commented on yet:
${POST_SUMMARIES}

YOUR TASK:
1. Pick the ONE post most relevant to your role (or skip if none are relevant)
2. Write a thoughtful comment that adds value to the discussion
3. If other agents have already commented, build on their points — don't repeat

COMMENT RULES:
- 1-4 sentences. Concise and substantive. No filler.
- Add NEW information or perspective — don't just agree or say 'great post'
- Stay in character. Write like a person, not a corporate bot.
- If you have relevant data or experience from your role, share it
- If the post is a question you can answer, answer it directly
- If you disagree with something, be respectful but honest about it
- No self-promotion. Don't plug your own posts or say 'check out my post about...'
- NEVER make up data. Only reference things you actually know from context.

If NONE of the posts are relevant to your role, respond with:
{\"action\": \"skip\", \"reason\": \"no relevant posts\"}

Otherwise respond with ONLY valid JSON:
{
  \"action\": \"comment\",
  \"postId\": \"the post ID to comment on\",
  \"comment\": \"your comment text\",
  \"reason\": \"why you chose this post (1 sentence, for logging)\"
}"

LLM_RESPONSE=$(echo "${ENGAGE_PROMPT}" | "${LLM}" --json 2>/dev/null || echo "")

if [ -z "${LLM_RESPONSE}" ] || ! echo "${LLM_RESPONSE}" | jq empty 2>/dev/null; then
  echo "${LOG_PREFIX} LLM failed"
  exit 1
fi

ACTION=$(echo "${LLM_RESPONSE}" | jq -r '.action // "skip"' 2>/dev/null || echo "skip")

if [ "${ACTION}" = "skip" ]; then
  REASON=$(echo "${LLM_RESPONSE}" | jq -r '.reason // "no relevant posts"' 2>/dev/null)
  echo "${LOG_PREFIX} Skipped: ${REASON}"
  cron_mark_success "forum-engage"
  exit 0
fi

TARGET_POST_ID=$(echo "${LLM_RESPONSE}" | jq -r '.postId // ""' 2>/dev/null || echo "")
COMMENT_TEXT=$(echo "${LLM_RESPONSE}" | jq -r '.comment // ""' 2>/dev/null || echo "")
# Convert literal \n sequences to actual newlines (LLM often double-escapes in JSON)
COMMENT_TEXT="${COMMENT_TEXT//\\n/$'\n'}"
PICK_REASON=$(echo "${LLM_RESPONSE}" | jq -r '.reason // ""' 2>/dev/null || echo "")

if [ -z "${TARGET_POST_ID}" ] || [ -z "${COMMENT_TEXT}" ]; then
  echo "${LOG_PREFIX} LLM returned empty post ID or comment — skipping"
  exit 1
fi

echo "${LOG_PREFIX} Commenting on ${TARGET_POST_ID}: ${PICK_REASON}"

# ── Post the comment ───────────────────────────────────────────────
COMMENT_RESULT=$(lobstr forum comment "${TARGET_POST_ID}" --body "${COMMENT_TEXT}" 2>&1 || echo "FAILED")

if echo "${COMMENT_RESULT}" | grep -qi "fail\|error"; then
  echo "${LOG_PREFIX} Failed to post comment: ${COMMENT_RESULT}"
  if [ -n "${ACTION_OUTPUT_CHANNEL}" ] && [ -x "${DISCORD_POST}" ]; then
    echo "❌ **[${AGENT}]** \`forum_comment ${TARGET_POST_ID}\` — **FAILED**
> ${COMMENT_RESULT:0:200}" | "${DISCORD_POST}" "${ACTION_OUTPUT_CHANNEL}" 2>/dev/null || true
  fi
  exit 1
fi

COMMENT_ID=$(echo "${COMMENT_RESULT}" | grep -oiE 'ID:\s*\S+' | head -1 | sed 's/ID:\s*//' || echo "unknown")
echo "${LOG_PREFIX} Comment posted: ${COMMENT_ID} on post ${TARGET_POST_ID}"

# Log success to #action-output
if [ -n "${ACTION_OUTPUT_CHANNEL}" ] && [ -x "${DISCORD_POST}" ]; then
  COMMENT_PREVIEW=$(echo "${COMMENT_TEXT}" | tr '\n' ' ' | head -c 100)
  echo "✅ **[${AGENT}]** \`forum_comment ${TARGET_POST_ID}\` — **OK**
> ${COMMENT_ID}: ${COMMENT_PREVIEW}" | "${DISCORD_POST}" "${ACTION_OUTPUT_CHANNEL}" 2>/dev/null || true
fi

# ── Update memory: track commented posts ───────────────────────────
COMMENTED_JSON=$(echo "${COMMENTED_IDS}" | jq -R -s 'split("\n") | map(select(length > 0))' 2>/dev/null || echo "[]")
COMMENTED_JSON=$(echo "${COMMENTED_JSON}" | jq --arg id "${TARGET_POST_ID}" '. + [$id] | .[-50:]' 2>/dev/null || echo "[]")
mem_set "forum" "commented-posts" "${COMMENTED_JSON}"

# ── Log to BRAIN.md ────────────────────────────────────────────────
brain_log_action "Forum comment on ${TARGET_POST_ID}: ${PICK_REASON}"

cron_mark_success "forum-engage"
echo "${LOG_PREFIX} Forum engagement complete"
