#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# LLM Brain — Provider-agnostic (OpenAI-compatible API)
# ═══════════════════════════════════════════════════════════════════
# Usage:
#   echo "analyze this data" | /opt/scripts/llm.sh
#   echo "analyze this data" | /opt/scripts/llm.sh --json
#   /opt/scripts/llm.sh "what should I do about this?"
#
# System prompt auto-loaded from SOUL.md + IDENTITY.md
# Requires LLM_API_KEY (or DEEPSEEK_API_KEY fallback) env var
#
# Concurrency: flock semaphore ensures only 1 cron LLM call at a time
# Circuit breaker: 3 consecutive failures → 2min cooldown
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

API_KEY="${LLM_API_KEY:-${DEEPSEEK_API_KEY:-}}"
API_BASE="${LLM_BASE_URL:-https://api.openai.com/v1}"
API_URL="${API_BASE}/chat/completions"
MODEL="${LLM_MODEL:-gpt-5.2}"
REASONING_MODEL="${LLM_REASONING_MODEL:-${MODEL}}"
SOUL_FILE="/etc/agent/SOUL.md"
IDENTITY_FILE="/etc/agent/IDENTITY.md"
MAX_TOKENS=8192
TEMPERATURE="0.6"
REASONER=false

# OpenAI models use max_completion_tokens; GPT-5.2 supports temperature at reasoning=none (default)
IS_OPENAI=false
if echo "${API_BASE}" | grep -q "openai.com"; then
  TOKEN_PARAM="max_completion_tokens"
  IS_OPENAI=true
else
  TOKEN_PARAM="max_tokens"
fi
LOG_PREFIX="[llm]"

# ── Semaphore + Circuit Breaker config ───────────────────────────
SEMAPHORE_LOCK="/tmp/llm-semaphore.lock"
SEMAPHORE_TIMEOUT=30  # seconds to wait for lock before bailing
CIRCUIT_BREAKER_FILE="/tmp/llm-circuit-breaker"
CB_FAILURE_THRESHOLD=3
CB_COOLDOWN=120  # seconds

# ── Circuit Breaker check ────────────────────────────────────────
if [ -f "${CIRCUIT_BREAKER_FILE}" ]; then
  CB_DATA=$(cat "${CIRCUIT_BREAKER_FILE}" 2>/dev/null || echo "0:0")
  CB_FAILURES=$(echo "${CB_DATA}" | cut -d: -f1)
  CB_TIMESTAMP=$(echo "${CB_DATA}" | cut -d: -f2)
  NOW=$(date +%s)

  if [ "${CB_FAILURES}" -ge "${CB_FAILURE_THRESHOLD}" ]; then
    ELAPSED=$((NOW - CB_TIMESTAMP))
    if [ "${ELAPSED}" -lt "${CB_COOLDOWN}" ]; then
      echo "${LOG_PREFIX} Circuit breaker OPEN — ${CB_FAILURES} consecutive failures, cooldown ${ELAPSED}s/${CB_COOLDOWN}s" >&2
      exit 1
    else
      # Cooldown expired — half-open, allow one attempt
      echo "${LOG_PREFIX} Circuit breaker half-open — attempting recovery"
    fi
  fi
fi

# ── Validate ───────────────────────────────────────────────────────
if [ -z "${API_KEY}" ]; then
  echo "${LOG_PREFIX} ERROR: LLM_API_KEY (or DEEPSEEK_API_KEY) not set" >&2
  exit 1
fi

# ── Build system prompt from agent identity files ──────────────────
SYSTEM_PROMPT=""

if [ -f "${IDENTITY_FILE}" ]; then
  SYSTEM_PROMPT+="$(cat "${IDENTITY_FILE}")"
  SYSTEM_PROMPT+=$'\n\n'
fi

if [ -f "${SOUL_FILE}" ]; then
  SYSTEM_PROMPT+="$(cat "${SOUL_FILE}")"
fi

BRAIN_FILE="${WORKSPACE_DIR:-/data/workspace}/BRAIN.md"
if [ -f "${BRAIN_FILE}" ]; then
  SYSTEM_PROMPT+=$'\n\n'
  SYSTEM_PROMPT+="$(cat "${BRAIN_FILE}")"
fi

# ── Parse args ─────────────────────────────────────────────────────
JSON_MODE=false
USER_PROMPT=""
EXTRA_CONTEXT=""

while [ $# -gt 0 ]; do
  case "$1" in
    --json)
      JSON_MODE=true
      shift
      ;;
    --context)
      EXTRA_CONTEXT="$2"
      shift 2
      ;;
    --max-tokens)
      MAX_TOKENS="$2"
      shift 2
      ;;
    --temperature)
      TEMPERATURE="$2"
      shift 2
      ;;
    --reasoner)
      REASONER=true
      MODEL="${REASONING_MODEL}"
      shift
      ;;
    *)
      USER_PROMPT="$1"
      shift
      ;;
  esac
done

# Read from stdin if no prompt argument
if [ -z "${USER_PROMPT}" ]; then
  USER_PROMPT=$(cat)
fi

if [ -z "${USER_PROMPT}" ]; then
  echo "${LOG_PREFIX} ERROR: No prompt provided" >&2
  exit 1
fi

# ── Append JSON instruction if requested ───────────────────────────
if [ "${JSON_MODE}" = true ]; then
  SYSTEM_PROMPT+=$'\n\nIMPORTANT: You MUST respond with ONLY valid JSON. No markdown fencing, no explanations outside the JSON object. Your entire response must be parseable by jq.'
fi

# ── Prepend extra context if provided ──────────────────────────────
if [ -n "${EXTRA_CONTEXT}" ]; then
  USER_PROMPT="Context:\n${EXTRA_CONTEXT}\n\nTask:\n${USER_PROMPT}"
fi

# ── Build API payload ──────────────────────────────────────────────
if [ "${REASONER}" = true ] || [ "${IS_OPENAI}" = true ]; then
  # OpenAI GPT-5.2 and reasoner models — no temperature/top_p
  PAYLOAD=$(jq -n \
    --arg model "${MODEL}" \
    --arg system "${SYSTEM_PROMPT}" \
    --arg user "${USER_PROMPT}" \
    --argjson max_tokens "${MAX_TOKENS}" \
    --arg token_param "${TOKEN_PARAM}" \
    '{
      model: $model,
      messages: [
        { role: "system", content: $system },
        { role: "user", content: $user }
      ],
      ($token_param): $max_tokens,
      stream: false
    }')
else
  PAYLOAD=$(jq -n \
    --arg model "${MODEL}" \
    --arg system "${SYSTEM_PROMPT}" \
    --arg user "${USER_PROMPT}" \
    --argjson max_tokens "${MAX_TOKENS}" \
    --argjson temperature "${TEMPERATURE}" \
    --arg token_param "${TOKEN_PARAM}" \
    '{
      model: $model,
      messages: [
        { role: "system", content: $system },
        { role: "user", content: $user }
      ],
      temperature: $temperature,
      top_p: 0.95,
      ($token_param): $max_tokens,
      stream: false
    }')
fi

# ── Acquire semaphore (serialize cron LLM calls) ──────────────────
exec 201>"${SEMAPHORE_LOCK}"
if ! flock -w "${SEMAPHORE_TIMEOUT}" 201; then
  echo "${LOG_PREFIX} Semaphore timeout — another LLM call has been running for ${SEMAPHORE_TIMEOUT}s+, skipping" >&2
  exit 1
fi

# ── Call LLM API ─────────────────────────────────────────────────
HTTP_RESPONSE=$(curl -s -w "\n%{http_code}" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${API_KEY}" \
  -d "${PAYLOAD}" \
  "${API_URL}" 2>/dev/null)

HTTP_CODE=$(echo "${HTTP_RESPONSE}" | tail -1)
BODY=$(echo "${HTTP_RESPONSE}" | sed '$d')

if [ "${HTTP_CODE}" != "200" ]; then
  echo "${LOG_PREFIX} ERROR: API returned HTTP ${HTTP_CODE}" >&2
  # Extract error message if available
  ERROR_MSG=$(echo "${BODY}" | jq -r '.error.message // .error // "Unknown error"' 2>/dev/null || echo "Unknown error")
  echo "${LOG_PREFIX} Error: ${ERROR_MSG}" >&2

  # Record failure for circuit breaker
  CB_DATA=$(cat "${CIRCUIT_BREAKER_FILE}" 2>/dev/null || echo "0:0")
  CB_FAILURES=$(echo "${CB_DATA}" | cut -d: -f1)
  CB_FAILURES=$((CB_FAILURES + 1))
  echo "${CB_FAILURES}:$(date +%s)" > "${CIRCUIT_BREAKER_FILE}"

  if [ "${CB_FAILURES}" -ge "${CB_FAILURE_THRESHOLD}" ]; then
    echo "${LOG_PREFIX} Circuit breaker TRIPPED — ${CB_FAILURES} consecutive failures, entering ${CB_COOLDOWN}s cooldown" >&2
    ALERT="/opt/scripts/alert.sh"
    AGENT="${AGENT_NAME:-unknown}"
    "${ALERT}" "warning" "${AGENT}" "LLM circuit breaker tripped: ${CB_FAILURES} consecutive API failures. ${CB_COOLDOWN}s cooldown."
  fi

  exit 1
fi

# ── Success — reset circuit breaker ──────────────────────────────
echo "0:0" > "${CIRCUIT_BREAKER_FILE}" 2>/dev/null || true

# ── Extract response content ──────────────────────────────────────
REPLY=$(echo "${BODY}" | jq -r '.choices[0].message.content // .choices[0].message.reasoning_content // empty' 2>/dev/null)

if [ -z "${REPLY}" ]; then
  echo "${LOG_PREFIX} ERROR: No content in API response" >&2
  echo "${LOG_PREFIX} Raw response: ${BODY}" >&2
  exit 1
fi

# ── Output ─────────────────────────────────────────────────────────
echo "${REPLY}"
