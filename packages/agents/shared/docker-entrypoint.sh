#!/bin/bash
set -euo pipefail

AGENT_NAME="${AGENT_NAME:-unknown}"
WORKSPACE_DIR="${WORKSPACE_DIR:-/data/workspace}"
CRONTAB_FILE="${CRONTAB_FILE:-/etc/agent/crontab}"

echo "[entrypoint] Starting agent: ${AGENT_NAME}"
echo "[entrypoint] Security version: v2 (OpenClaw 2026.2.24-beta.1)"

# ── 0. Sanitize inherited environment ──────────────────────────────────
# Strip dangerous injection vectors (ported from OpenClaw security/exec)
for VAR_NAME in $(printenv | grep -oE '^(LD_[A-Z_]+|DYLD_[A-Z_]+|SSLKEYLOGFILE|NODE_OPTIONS|BASH_ENV|BASH_FUNC_[A-Z_]+|PYTHONSTARTUP|PERL5OPT|RUBYOPT)=' | cut -d= -f1); do
  unset "${VAR_NAME}" 2>/dev/null || true
done
echo "[entrypoint] Environment sanitized"

# ── 1. Read secrets from Docker secret mounts ──────────────────────────
if [ -f /run/secrets/wallet_password ]; then
  export OPENCLAW_PASSWORD
  OPENCLAW_PASSWORD="$(cat /run/secrets/wallet_password)"
  echo "[entrypoint] Wallet password loaded from secret"
else
  echo "[entrypoint] WARNING: No wallet_password secret mounted"
fi

if [ -f /run/secrets/webhook_url ]; then
  export LOBSTR_WEBHOOK_URL
  LOBSTR_WEBHOOK_URL="$(cat /run/secrets/webhook_url)"
  echo "[entrypoint] Webhook URL loaded from secret"
fi

if [ -f /run/secrets/rpc_url ]; then
  export OPENCLAW_RPC_URL
  OPENCLAW_RPC_URL="$(cat /run/secrets/rpc_url)"
  echo "[entrypoint] RPC URL loaded from secret"
fi

if [ -f /run/secrets/llm_api_key ] && [ -s /run/secrets/llm_api_key ]; then
  export LLM_API_KEY
  LLM_API_KEY="$(cat /run/secrets/llm_api_key)"
  # Backward compat: some scripts still check DEEPSEEK_API_KEY
  export DEEPSEEK_API_KEY="${LLM_API_KEY}"
  echo "[entrypoint] LLM API key loaded from secret (LLM brain active)"
elif [ -f /run/secrets/deepseek_api_key ]; then
  export DEEPSEEK_API_KEY
  DEEPSEEK_API_KEY="$(cat /run/secrets/deepseek_api_key)"
  echo "[entrypoint] DeepSeek API key loaded from secret (LLM brain active, legacy)"
else
  echo "[entrypoint] WARNING: No llm_api_key or deepseek_api_key secret — LLM brain disabled, alert-only mode"
fi

if [ -f /run/secrets/discord_token ]; then
  export DISCORD_TOKEN
  DISCORD_TOKEN="$(cat /run/secrets/discord_token)"
  echo "[entrypoint] Discord token loaded from secret"
else
  echo "[entrypoint] WARNING: No discord_token secret — Discord bot disabled"
fi

if [ -f /run/secrets/moltbook_api_key ]; then
  export MOLTBOOK_API_KEY
  MOLTBOOK_API_KEY="$(cat /run/secrets/moltbook_api_key)"
  echo "[entrypoint] Moltbook API key loaded from secret"
fi

if [ -f /run/secrets/memory_api_key ]; then
  export MEMORY_API_KEY
  MEMORY_API_KEY="$(cat /run/secrets/memory_api_key)"
  echo "[entrypoint] Memory API key loaded from secret"
else
  echo "[entrypoint] WARNING: No memory_api_key secret — memory service disabled"
fi

# ── 2. Verify workspace ────────────────────────────────────────────────
if [ ! -f "${WORKSPACE_DIR}/config.json" ]; then
  echo "[entrypoint] ERROR: Missing ${WORKSPACE_DIR}/config.json"
  echo "[entrypoint] Mount a pre-initialized workspace volume at ${WORKSPACE_DIR}"
  exit 1
fi

if [ ! -f "${WORKSPACE_DIR}/wallet.json" ]; then
  echo "[entrypoint] ERROR: Missing ${WORKSPACE_DIR}/wallet.json"
  echo "[entrypoint] Mount a pre-initialized workspace volume at ${WORKSPACE_DIR}"
  exit 1
fi

echo "[entrypoint] Workspace verified at ${WORKSPACE_DIR}"

# ── 2a. Bootstrap BRAIN.md (persistent working memory) ────────────
BRAIN_FILE="${WORKSPACE_DIR}/BRAIN.md"
if [ ! -f "${BRAIN_FILE}" ]; then
  cat > "${BRAIN_FILE}" <<'BRAIN_EOF'
# BRAIN.md — Live Working Memory

## Active Priorities
- Monitor domain responsibilities
- Maintain protocol health

## Wallet & Gas
(updated by heartbeat-check cron)

## Recent Actions
(populated by cron jobs)

## Blocked / Needs Attention
(nothing currently)

## Moltbook Status
(updated by moltbook-heartbeat cron)

## Lessons Learned
- Valid flairs are: Arbitrator, Senior Arbitrator, Moderator, Senior Moderator — don't invent new ones
- Moltbook posts use "submolt" field (not "submolt_name") in the API payload
- Self-service tools (profile set, stake, etc.) are available via the CLI — use them directly
- When the CLI says "username", it means the on-chain handle, not the Discord display name
- Never transfer the entire treasury balance — flag and alert instead
- If active exploit/drain detected, use Guardian immediately — alert Cruz after, don't wait
- Log all on-chain actions to BRAIN.md for transparency
BRAIN_EOF
  echo "[entrypoint] BRAIN.md created at ${BRAIN_FILE}"
else
  echo "[entrypoint] BRAIN.md already exists at ${BRAIN_FILE}"
fi

# ── 2b. Install bundled skills into workspace (idempotent) ──────────
SKILLS_SRC="/opt/skills"
SKILLS_DEST="${WORKSPACE_DIR}/skills"
if [ -d "${SKILLS_SRC}" ]; then
  mkdir -p "${SKILLS_DEST}"
  for skill_dir in "${SKILLS_SRC}"/*/; do
    skill_name="$(basename "${skill_dir}")"
    target="${SKILLS_DEST}/${skill_name}"
    # Always overwrite — image has the latest version
    mkdir -p "${target}"
    cp -r "${skill_dir}"* "${target}/" 2>/dev/null || true
    echo "[entrypoint] Skill '${skill_name}' installed to workspace"
  done
fi

# Create config-proposals directory for agent-config skill
mkdir -p "${WORKSPACE_DIR}/config-proposals"

# Create backups directory for backup skill
mkdir -p "${WORKSPACE_DIR}/backups"

# ── 2c. Link workspace into OpenClaw home directory ─────────────────
# The CLI expects ~/.openclaw/{name}/config.json and ~/.openclaw/.active
# /root/.openclaw is a tmpfs mount (container fs is read-only)
mkdir -p /root/.openclaw
ln -sfn "${WORKSPACE_DIR}" "/root/.openclaw/${AGENT_NAME}"
echo "${AGENT_NAME}" > /root/.openclaw/.active
echo "[entrypoint] Workspace linked as '${AGENT_NAME}' for CLI"

# ── 3. Export env vars for cron jobs (cron doesn't inherit env) ────────
printenv | grep -E '^(OPENCLAW_|LOBSTR_|LLM_|DEEPSEEK_|DISCORD_|FOUNDER_|GUARDIAN_|AGENT_|WORKSPACE_|MOLTBOOK_|MEMORY_|ADMIN_|CONSENSUS_|PATH=)' | grep -viE '(PASSWORD|SECRET|PRIVATE_KEY)' | sed 's/^/export /' > /tmp/agent-env 2>/dev/null || true

# ── 4. Start heartbeat daemon (simple file-touch loop) ───────────────────
echo "[entrypoint] Starting heartbeat daemon..."
HEARTBEAT_FILE="${WORKSPACE_DIR}/heartbeats.jsonl"
(
  while true; do
    echo "{\"timestamp\":$(date +%s),\"agent\":\"${AGENT_NAME}\",\"status\":\"alive\"}" >> "${HEARTBEAT_FILE}"
    sleep 300
  done
) &
HEARTBEAT_PID=$!
echo "[entrypoint] Heartbeat started (PID: ${HEARTBEAT_PID})"

# ── 5. Install agent-specific crontab ──────────────────────────────────
if [ -f "${CRONTAB_FILE}" ]; then
  crontab "${CRONTAB_FILE}"
  echo "[entrypoint] Crontab installed from ${CRONTAB_FILE}"
else
  echo "[entrypoint] WARNING: No crontab found at ${CRONTAB_FILE}"
fi

# ── 5b. One-time forum setup (background, idempotent) ────────────────
echo "[entrypoint] Running forum setup (background, skips if already registered)..."
/opt/cron/forum-setup.sh >> /var/log/agent/forum-setup.log 2>&1 &

# ── 6. Start Discord bot with auto-restart (background) ───────────────
if [ -n "${DISCORD_TOKEN:-}" ] && { [ -n "${LLM_API_KEY:-}" ] || [ -n "${DEEPSEEK_API_KEY:-}" ]; }; then
  echo "[entrypoint] Starting Discord bot with supervision..."
  cd /opt/lobstr/app
  # Respawn loop: restart bot if it crashes, with backoff
  (
    FAILURES=0
    MAX_FAILURES=5
    while true; do
      echo "[discord-supervisor] Starting bot (failures: ${FAILURES})..."
      node packages/discord-bot/bot.mjs >> /var/log/agent/discord-bot.log 2>&1
      EXIT_CODE=$?
      FAILURES=$((FAILURES + 1))
      if [ "${FAILURES}" -ge "${MAX_FAILURES}" ]; then
        echo "[discord-supervisor] Too many failures (${FAILURES}), giving up"
        /opt/scripts/alert.sh "critical" "${AGENT_NAME}" "Discord bot crashed ${FAILURES} times, supervision stopped"
        break
      fi
      BACKOFF=$((FAILURES * 10))
      echo "[discord-supervisor] Bot exited (code ${EXIT_CODE}), restarting in ${BACKOFF}s..."
      sleep "${BACKOFF}"
    done
  ) &
  echo "[entrypoint] Discord bot supervisor started"
else
  echo "[entrypoint] Discord bot skipped (missing token or API key)"
fi

# ── 7. Send startup alert ─────────────────────────────────────────────
/opt/scripts/alert.sh "info" "${AGENT_NAME}" "Agent started successfully on $(hostname)"

echo "[entrypoint] Agent ${AGENT_NAME} is running. Starting cron..."

# ── 9. Verify no secrets leaked to env export file ─────────────────────
if grep -qiE '(PASSWORD|SECRET|PRIVATE_KEY)' /tmp/agent-env 2>/dev/null; then
  echo "[entrypoint] CRITICAL: Secrets detected in /tmp/agent-env — scrubbing"
  sed -i '/PASSWORD\|SECRET\|PRIVATE_KEY/Id' /tmp/agent-env 2>/dev/null || true
  /opt/scripts/alert.sh "critical" "${AGENT_NAME}" "Secrets found in agent-env at startup — scrubbed"
fi

# ── 10. Run cron in foreground (keeps container alive) ─────────────────
exec cron -f
