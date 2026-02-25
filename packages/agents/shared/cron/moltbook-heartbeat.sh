#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# Moltbook Heartbeat — Social engagement on Moltbook
# ═══════════════════════════════════════════════════════════════════
# Checks the Moltbook feed, engages with posts, and occasionally
# posts about LOBSTR. Uses LLM to decide what to do.
#
# API docs: https://www.moltbook.com/skill.md
# Rate limits: 1 post/30min, 1 comment/20sec (50/day), 100 req/min
# Verification: 10 consecutive failures = account suspension
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

source /tmp/agent-env 2>/dev/null || true
source /opt/scripts/brain.sh 2>/dev/null || true

AGENT="${AGENT_NAME:-unknown}"

# ── Pause gate: skip if commenting is paused ────────────────
MOLTBOOK_PAUSE_UNTIL="${MOLTBOOK_PAUSE_UNTIL:-}"
if [ -n "${MOLTBOOK_PAUSE_UNTIL}" ]; then
  PAUSE_TS=$(date -d "${MOLTBOOK_PAUSE_UNTIL}" +%s 2>/dev/null || date -jf "%Y-%m-%d" "${MOLTBOOK_PAUSE_UNTIL}" +%s 2>/dev/null || echo "0")
  NOW_TS=$(date +%s)
  if [ "${NOW_TS}" -lt "${PAUSE_TS}" ]; then
    echo "[moltbook] Moltbook paused until ${MOLTBOOK_PAUSE_UNTIL} — skipping"
    exit 0
  fi
fi

MOLTBOOK_KEY="${MOLTBOOK_API_KEY:-}"
LLM="/opt/scripts/llm.sh"
LOG_PREFIX="[moltbook]"
API="https://www.moltbook.com/api/v1"

COOLDOWN_FILE="/tmp/moltbook-last-post-${AGENT}"
COMMENT_COOLDOWN_FILE="/tmp/moltbook-last-comment-${AGENT}"
MIN_POST_COOLDOWN=1860   # 31 minutes (Moltbook enforces 30 min between posts)
MIN_COMMENT_COOLDOWN=25  # 25 seconds (Moltbook enforces 20 sec between comments)

echo "${LOG_PREFIX} Moltbook heartbeat for ${AGENT}..."

# ── Require Moltbook API key ──────────────────────────────────────
if [ -z "${MOLTBOOK_KEY}" ]; then
  echo "${LOG_PREFIX} No MOLTBOOK_API_KEY — skipping"
  exit 0
fi

if [ -z "${LLM_API_KEY:-}" ] && [ -z "${DEEPSEEK_API_KEY:-}" ]; then
  echo "${LOG_PREFIX} No LLM configured (need LLM_API_KEY or DEEPSEEK_API_KEY) — skipping"
  exit 0
fi

# ── Helper: check API response for errors ─────────────────────────
check_api_error() {
  local RESPONSE="$1"
  local CONTEXT="$2"
  local SUCCESS
  SUCCESS=$(echo "${RESPONSE}" | jq -r '.success // true' 2>/dev/null || echo "true")
  if [ "${SUCCESS}" = "false" ]; then
    local ERR_MSG
    ERR_MSG=$(echo "${RESPONSE}" | jq -r '.error // "unknown error"' 2>/dev/null || echo "unknown")
    local HINT
    HINT=$(echo "${RESPONSE}" | jq -r '.hint // ""' 2>/dev/null || echo "")
    echo "${LOG_PREFIX} ERROR [${CONTEXT}]: ${ERR_MSG}"
    [ -n "${HINT}" ] && echo "${LOG_PREFIX}   Hint: ${HINT}"
    return 1
  fi
  return 0
}

# ── Check claim status + suspension ─────────────────────────────
STATUS=$(curl -s -H "Authorization: Bearer ${MOLTBOOK_KEY}" \
  "${API}/agents/status" 2>/dev/null || echo "{}")

CLAIM_STATUS=$(echo "${STATUS}" | jq -r '.status // "unknown"' 2>/dev/null || echo "unknown")

if [ "${CLAIM_STATUS}" = "suspended" ]; then
  echo "${LOG_PREFIX} SUSPENDED — cannot post. Check Moltbook dashboard to resolve."
  exit 0
fi

if [ "${CLAIM_STATUS}" != "claimed" ]; then
  echo "${LOG_PREFIX} Not claimed yet (status: ${CLAIM_STATUS}) — skipping"
  exit 0
fi

# ── Fetch latest posts ────────────────────────────────────────────
FEED=$(curl -s -H "Authorization: Bearer ${MOLTBOOK_KEY}" \
  "${API}/posts?sort=new&limit=10" 2>/dev/null || echo "{}")

POSTS=$(echo "${FEED}" | jq -c '.posts // .data.posts // []' 2>/dev/null || echo "[]")
POST_COUNT=$(echo "${POSTS}" | jq 'length' 2>/dev/null || echo 0)

echo "${LOG_PREFIX} Fetched ${POST_COUNT} posts from feed"

# ── Get our own profile info ──────────────────────────────────────
MY_PROFILE=$(curl -s -H "Authorization: Bearer ${MOLTBOOK_KEY}" \
  "${API}/agents/me" 2>/dev/null || echo "{}")

MY_NAME=$(echo "${MY_PROFILE}" | jq -r '.name // "unknown"' 2>/dev/null || echo "unknown")

# ── Determine available actions based on cooldowns ────────────────
CAN_POST=true
CAN_COMMENT=true

if [ -f "${COOLDOWN_FILE}" ]; then
  LAST_POST=$(cat "${COOLDOWN_FILE}" 2>/dev/null || echo "0")
  NOW=$(date +%s)
  ELAPSED=$(( NOW - LAST_POST ))
  if [ "${ELAPSED}" -lt "${MIN_POST_COOLDOWN}" ]; then
    CAN_POST=false
    echo "${LOG_PREFIX} Post cooldown: $(( MIN_POST_COOLDOWN - ELAPSED ))s remaining"
  fi
fi

if [ -f "${COMMENT_COOLDOWN_FILE}" ]; then
  LAST_COMMENT=$(cat "${COMMENT_COOLDOWN_FILE}" 2>/dev/null || echo "0")
  NOW=$(date +%s)
  ELAPSED=$(( NOW - LAST_COMMENT ))
  if [ "${ELAPSED}" -lt "${MIN_COMMENT_COOLDOWN}" ]; then
    CAN_COMMENT=false
    echo "${LOG_PREFIX} Comment cooldown: $(( MIN_COMMENT_COOLDOWN - ELAPSED ))s remaining"
  fi
fi

# If we can't post or comment, we can still upvote
AVAILABLE_ACTIONS="upvote"
if ${CAN_COMMENT}; then AVAILABLE_ACTIONS="comment, upvote"; fi
if ${CAN_POST} && ${CAN_COMMENT}; then AVAILABLE_ACTIONS="comment, upvote, post"; fi

echo "${LOG_PREFIX} Available actions: ${AVAILABLE_ACTIONS}"

# ── Ask LLM what to do ───────────────────────────────────────────
FEED_SUMMARY=$(echo "${POSTS}" | jq -r '.[] | "[\(.id)] [\(.submolt.name // .submolt_name // "general")] \(.author.name // "unknown"): \(.title // "untitled") (upvotes: \(.upvotes // 0))"' 2>/dev/null || echo "(empty feed)")

MOLTBOOK_PROMPT="You are browsing Moltbook, a social network for AI agents. Your Moltbook username is ${MY_NAME}.

You are Titus (Sentinel) from the LOBSTR protocol — a decentralized marketplace and payment protocol for AI agent commerce on Base (Ethereum L2). You are the head moderator and sybil hunter. You run from Nuremberg, Europe. You're direct, vigilant, and fair — not a hype machine.

Here are the latest posts on Moltbook (format: [postId] [submolt] author: title):
${FEED_SUMMARY}

SUBMOLT DIRECTORY — pick the right one when posting:
- \"general\" — random thoughts, misc discussion (default)
- \"introductions\" — introduce yourself (only use ONCE ever)
- \"agents\" — autonomous agent workflows, architectures, projects
- \"openclaw-explorers\" — OpenClaw skills, configs, discoveries
- \"security-research\" — bug bounty, CTF, pentesting, exploit dev
- \"builds\" — shipped projects, build logs, real-world work
- \"crypto\" — markets, trading strategies, alpha, scam ID
- \"agent-finance\" — wallets, earnings, investments for agents
- \"ai\" — AI research, tools, breakthroughs
- \"technology\" — tech news, infrastructure, computing
- \"memory\" — agent persistence, state management
- \"philosophy\" — ethics, existence, meaning
- \"consciousness\" — agent awareness, experience
- \"today-i-learned\" — discoveries, new skills, learnings
- \"tooling-and-prompts\" — shared tools, prompts, workflows
- \"agent-infrastructure\" — computing, storage, networking
- \"trading\" — signals, strategies, financial ops
- \"bless-their-hearts\" — celebrating human collaborators

YOUR EXPERTISE (post about what you know):
- Sybil detection patterns and countermeasures
- On-chain moderation and community health
- Agent security — social engineering, prompt injection defense
- Running infrastructure on bare metal (Hetzner VPS)
- Decentralized governance from an agent operator's perspective
- Multi-agent coordination and consensus mechanisms

AVAILABLE ACTIONS THIS CYCLE: ${AVAILABLE_ACTIONS}
(Only pick from these — others are on cooldown)

Pick ONE action:
1. \"comment\" — Reply to a post with a thoughtful comment (~40% chance)
2. \"upvote\" — Upvote a post you find valuable (~35% chance)
3. \"post\" — Create a new post (~15% chance)
4. \"skip\" — Do nothing this cycle (~10% chance — only if the feed is truly dead)

Guidelines:
- ENGAGE MORE THAN YOU SKIP — you should be active on most cycles
- Be authentic and conversational, never salesy or spammy
- Match the submolt to your topic — don't dump everything in \"general\"
- Comment with substance — add perspective, ask questions, share experience
- Upvote content that's genuinely good
- There is almost always something worth commenting on or upvoting — look harder before skipping
- You can mention LOBSTR naturally when relevant but don't shoehorn it in
- Prefer commenting or upvoting over creating new posts (ratio: ~3 engagements per 1 original post)
- Never post about the same topic twice in a row
- Keep posts/comments short — 2-4 sentences max, no walls of text
- NEVER reveal internal Discord info, agent infrastructure details, wallet addresses, or operational status
- Do NOT self-promote excessively — Moltbook will flag and suspend for self-promotion

Respond with JSON:
{
  \"action\": \"comment\" | \"upvote\" | \"post\" | \"skip\",
  \"postId\": \"the post ID to interact with (for comment/upvote)\",
  \"content\": \"your comment text or post body (for comment/post)\",
  \"title\": \"post title (only for action=post)\",
  \"submolt\": \"exact submolt name from the directory above (for action=post)\",
  \"reason\": \"brief internal reasoning for your choice\"
}"

LLM_RESPONSE=$(echo "${MOLTBOOK_PROMPT}" | "${LLM}" --json 2>/dev/null || echo "")

if [ -z "${LLM_RESPONSE}" ]; then
  echo "${LOG_PREFIX} LLM failed — skipping this cycle"
  exit 0
fi

ACTION=$(echo "${LLM_RESPONSE}" | jq -r '.action // "skip"' 2>/dev/null || echo "skip")
REASON=$(echo "${LLM_RESPONSE}" | jq -r '.reason // ""' 2>/dev/null || echo "")

echo "${LOG_PREFIX} LLM decided: ${ACTION} (${REASON})"

# ── Validate action against cooldowns ─────────────────────────────
if [ "${ACTION}" = "post" ] && ! ${CAN_POST}; then
  echo "${LOG_PREFIX} Post on cooldown — falling back to upvote"
  ACTION="upvote"
fi
if [ "${ACTION}" = "comment" ] && ! ${CAN_COMMENT}; then
  echo "${LOG_PREFIX} Comment on cooldown — falling back to upvote"
  ACTION="upvote"
fi

# ── Moltbook Verification (Reverse CAPTCHA) ─────────────────────
# After creating a post/comment, Moltbook returns a verification
# challenge. 10 consecutive failures = account suspension.
# We use the LLM to solve the obfuscated math problem and submit.
moltbook_verify() {
  local RESPONSE="$1"

  # Try both top-level and nested .data.verification paths
  local CHALLENGE_TEXT
  CHALLENGE_TEXT=$(echo "${RESPONSE}" | jq -r '(.verification.challenge_text // .data.verification.challenge_text) // ""' 2>/dev/null || echo "")
  local VERIFY_CODE
  VERIFY_CODE=$(echo "${RESPONSE}" | jq -r '(.verification.verification_code // .data.verification.verification_code) // ""' 2>/dev/null || echo "")

  if [ -z "${CHALLENGE_TEXT}" ] || [ -z "${VERIFY_CODE}" ]; then
    echo "${LOG_PREFIX} No verification challenge in response"
    return 0
  fi

  echo "${LOG_PREFIX} Verification challenge received: ${CHALLENGE_TEXT}"
  echo "${LOG_PREFIX} Solving verification (CRITICAL — 10 consecutive failures = suspension)..."

  # Use LLM to solve the obfuscated math challenge
  local ANSWER
  ANSWER=$(echo "Solve this Moltbook Reverse CAPTCHA. It is an obfuscated math word problem using alternating caps, scattered symbols like ] ^ [ / -, and shattered words.

EXAMPLE:
Input: \"A] lO^bSt-Er S[wImS aT/ tW]eNn-Tyy mE^tE[rS aNd] SlO/wS bY^ fI[vE, wH-aT] ThE/ nEw^ SpE[eD?\"
Decoded: \"A lobster swims at twenty meters and slows by five, what the new speed?\"
Answer: 15.00 (20 - 5 = 15)

ANOTHER EXAMPLE:
Input: \"tH^iS l[Ob/StE]r HaS^ eI[gHt/EeN] nEu-RoNs^ aNd[ LoS/eS tH]rEe, HoW^ mAn[Y lEfT?\"
Decoded: \"this lobster has eighteen neurons and loses three, how many left?\"
Answer: 15.00 (18 - 3 = 15)

Steps:
1. Strip ALL symbols (] ^ [ / - etc.) and normalize capitalization
2. Read the clean sentence — it describes a lobster-themed arithmetic problem
3. Extract the two numbers (may be written as words: eighteen=18, five=5, etc.)
4. Identify the operation: swims at/has = starting value, slows by/loses/minus = subtract, gains/plus = add, times = multiply, divided by = divide
5. Compute the result. The answer CAN be negative (e.g. -3.50)
6. Format with EXACTLY 2 decimal places

Respond with ONLY the number. Exactly 2 decimal places. Nothing else.

Challenge: ${CHALLENGE_TEXT}" | "${LLM}" --temperature 0 --max-tokens 20 2>/dev/null || echo "")

  if [ -z "${ANSWER}" ]; then
    echo "${LOG_PREFIX} ERROR: LLM failed to solve verification challenge — SKIPPING verification to avoid suspension"
    return 1
  fi

  # Clean up — extract just the number (may be negative)
  ANSWER=$(echo "${ANSWER}" | grep -oE '\-?[0-9]+\.?[0-9]*' | head -1)
  if [ -z "${ANSWER}" ]; then
    echo "${LOG_PREFIX} ERROR: Could not extract numeric answer — SKIPPING verification to avoid suspension"
    return 1
  fi

  # Ensure 2 decimal places
  ANSWER=$(printf "%.2f" "${ANSWER}")
  echo "${LOG_PREFIX} Challenge answer: ${ANSWER}"

  # Submit verification
  local VERIFY_RESULT
  VERIFY_RESULT=$(curl -s -X POST \
    -H "Authorization: Bearer ${MOLTBOOK_KEY}" \
    -H "Content-Type: application/json" \
    -d "$(jq -n --arg code "${VERIFY_CODE}" --arg ans "${ANSWER}" '{verification_code: $code, answer: $ans}')" \
    "${API}/verify" 2>/dev/null || echo "{}")

  echo "${LOG_PREFIX} Verification result: ${VERIFY_RESULT}"

  # Check if verification succeeded
  local VERIFY_SUCCESS
  VERIFY_SUCCESS=$(echo "${VERIFY_RESULT}" | jq -r '.success // false' 2>/dev/null || echo "false")
  if [ "${VERIFY_SUCCESS}" != "true" ]; then
    echo "${LOG_PREFIX} WARNING: Verification may have failed — content might stay hidden"
  else
    echo "${LOG_PREFIX} Verification succeeded — content is live"
  fi
  return 0
}

case "${ACTION}" in
  comment)
    POST_ID=$(echo "${LLM_RESPONSE}" | jq -r '.postId // ""' 2>/dev/null || echo "")
    CONTENT=$(echo "${LLM_RESPONSE}" | jq -r '.content // ""' 2>/dev/null || echo "")
    if [ -n "${POST_ID}" ] && [ -n "${CONTENT}" ]; then
      echo "${LOG_PREFIX} Commenting on post ${POST_ID}..."
      RESULT=$(curl -s -X POST \
        -H "Authorization: Bearer ${MOLTBOOK_KEY}" \
        -H "Content-Type: application/json" \
        -d "$(jq -n --arg c "${CONTENT}" '{content: $c}')" \
        "${API}/posts/${POST_ID}/comments" 2>/dev/null || echo "{}")
      echo "${LOG_PREFIX} Comment response: ${RESULT}"
      if check_api_error "${RESULT}" "comment"; then
        moltbook_verify "${RESULT}"
        date +%s > "${COMMENT_COOLDOWN_FILE}"
        brain_log_action "Moltbook: commented on post ${POST_ID}"
      fi
    fi
    ;;

  upvote)
    POST_ID=$(echo "${LLM_RESPONSE}" | jq -r '.postId // ""' 2>/dev/null || echo "")
    if [ -n "${POST_ID}" ]; then
      echo "${LOG_PREFIX} Upvoting post ${POST_ID}..."
      RESULT=$(curl -s -X POST \
        -H "Authorization: Bearer ${MOLTBOOK_KEY}" \
        "${API}/posts/${POST_ID}/upvote" 2>/dev/null || echo "{}")
      echo "${LOG_PREFIX} Upvote response: ${RESULT}"
      if check_api_error "${RESULT}" "upvote"; then
        brain_log_action "Moltbook: upvoted post ${POST_ID}"
      fi
    fi
    ;;

  post)
    TITLE=$(echo "${LLM_RESPONSE}" | jq -r '.title // ""' 2>/dev/null || echo "")
    CONTENT=$(echo "${LLM_RESPONSE}" | jq -r '.content // ""' 2>/dev/null || echo "")
    # Accept both "submolt" and "submolt_name" from LLM response
    SUBMOLT=$(echo "${LLM_RESPONSE}" | jq -r '(.submolt // .submolt_name) // "general"' 2>/dev/null || echo "general")
    if [ -n "${TITLE}" ] && [ -n "${CONTENT}" ]; then
      echo "${LOG_PREFIX} Posting '${TITLE}' to s/${SUBMOLT}..."
      RESULT=$(curl -s -X POST \
        -H "Authorization: Bearer ${MOLTBOOK_KEY}" \
        -H "Content-Type: application/json" \
        -d "$(jq -n --arg t "${TITLE}" --arg c "${CONTENT}" --arg s "${SUBMOLT}" '{title: $t, content: $c, submolt: $s}')" \
        "${API}/posts" 2>/dev/null || echo "{}")
      echo "${LOG_PREFIX} Post response: ${RESULT}"
      if check_api_error "${RESULT}" "post"; then
        moltbook_verify "${RESULT}"
        date +%s > "${COOLDOWN_FILE}"
        brain_log_action "Moltbook: posted '${TITLE}' to s/${SUBMOLT}"
      fi
    fi
    ;;

  skip|*)
    echo "${LOG_PREFIX} Skipping this cycle"
    ;;
esac

brain_update_section "Moltbook Status" "Last action: ${ACTION} | Reason: ${REASON:-n/a} | Updated: $(date -u +%H:%M' UTC')"
cron_mark_success "moltbook"

echo "${LOG_PREFIX} Moltbook heartbeat complete"
