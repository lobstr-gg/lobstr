#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# BRAIN.md Helper — Persistent working memory for agents
# ═══════════════════════════════════════════════════════════════════
# Source this from any cron script to read/write BRAIN.md sections.
#
# Usage:
#   source /opt/scripts/brain.sh
#   brain_update_section "Wallet & Gas" "ETH: 0.05\nBot: running"
#   brain_append_section "Recent Actions" "Claimed stream #42"
#   brain_trim_section "Recent Actions" 20
#   cron_mark_success "heartbeat-check"
# ═══════════════════════════════════════════════════════════════════

BRAIN_FILE="${WORKSPACE_DIR:-/data/workspace}/BRAIN.md"

# ── brain_update_section ──────────────────────────────────────────
# Atomically replace the content of a ## Section with new content.
# Creates the section at the end if it doesn't exist.
brain_update_section() {
  local section="$1"
  local content="$2"

  [ ! -f "${BRAIN_FILE}" ] && return 1

  local tmp="${BRAIN_FILE}.tmp.$$"

  if grep -q "^## ${section}$" "${BRAIN_FILE}" 2>/dev/null; then
    awk -v sec="## ${section}" -v new="${content}" '
      $0 == sec { print; printf "%s\n", new; skip=1; next }
      /^## / && skip { skip=0 }
      !skip { print }
    ' "${BRAIN_FILE}" > "${tmp}" && mv "${tmp}" "${BRAIN_FILE}"
  else
    # Section doesn't exist — append it
    printf '\n## %s\n%s\n' "${section}" "${content}" >> "${BRAIN_FILE}"
  fi
}

# ── brain_append_section ──────────────────────────────────────────
# Append a line to an existing ## Section (before the next section).
brain_append_section() {
  local section="$1"
  local line="$2"

  [ ! -f "${BRAIN_FILE}" ] && return 1

  local tmp="${BRAIN_FILE}.tmp.$$"

  if grep -q "^## ${section}$" "${BRAIN_FILE}" 2>/dev/null; then
    awk -v sec="## ${section}" -v line="${line}" '
      /^## / && found { print line; found=0 }
      { print }
      $0 == sec { found=1 }
      END { if (found) print line }
    ' "${BRAIN_FILE}" > "${tmp}" && mv "${tmp}" "${BRAIN_FILE}"
  else
    printf '\n## %s\n%s\n' "${section}" "${line}" >> "${BRAIN_FILE}"
  fi
}

# ── brain_trim_section ────────────────────────────────────────────
# Keep only the last N lines in a section.
brain_trim_section() {
  local section="$1"
  local max_lines="${2:-20}"

  [ ! -f "${BRAIN_FILE}" ] && return 1

  local tmp="${BRAIN_FILE}.tmp.$$"

  awk -v sec="## ${section}" -v max="${max_lines}" '
    $0 == sec { capture=1; header=$0; delete lines; n=0; print; next }
    /^## / && capture {
      # Flush last N lines of captured section
      start = (n > max) ? n - max : 0
      for (i = start; i < n; i++) print lines[i]
      capture=0
    }
    capture { lines[n++] = $0; next }
    { print }
    END {
      if (capture) {
        start = (n > max) ? n - max : 0
        for (i = start; i < n; i++) print lines[i]
      }
    }
  ' "${BRAIN_FILE}" > "${tmp}" && mv "${tmp}" "${BRAIN_FILE}"
}

# ── cron_mark_success ─────────────────────────────────────────────
# Write current timestamp to /tmp/cron-last-{name} for freshness checks.
cron_mark_success() {
  local job_name="$1"
  date +%s > "/tmp/cron-last-${job_name}"
}

# ── brain_log_action ──────────────────────────────────────────────
# Log an action to BRAIN.md "Recent Actions" AND post to #agent-comms.
# Usage: brain_log_action "Claimed stream #42 (150 LOB)"
brain_log_action() {
  local action="$1"
  local ts
  ts="$(date -u +%Y-%m-%d' '%H:%M' UTC')"

  # Append to BRAIN.md
  brain_append_section "Recent Actions" "- [${ts}] ${action}"
  brain_trim_section "Recent Actions" 20

  # Post to #agent-comms if discord is configured
  local comms_channel="${DISCORD_COMMS_CHANNEL_ID:-}"
  if [ -n "${comms_channel}" ] && [ -n "${DISCORD_TOKEN:-}" ]; then
    local agent="${AGENT_NAME:-unknown}"
    echo "[${agent}] ${action}" | /opt/scripts/discord-post.sh "${comms_channel}" 2>/dev/null || true
  fi
}
