#!/bin/bash
# workspace-backup.sh — Daily workspace backup (excludes wallet/secrets)
# Runs via cron, staggered across agents

set -euo pipefail
source /tmp/agent-env 2>/dev/null || true
source /opt/scripts/brain.sh 2>/dev/null || true

AGENT_NAME="${AGENT_NAME:-unknown}"
WORKSPACE_DIR="${WORKSPACE_DIR:-/data/workspace}"
BACKUP_DIR="${WORKSPACE_DIR}/backups"
MAX_BACKUPS=7
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/workspace_${TIMESTAMP}.tar.gz"

echo "[backup] Starting workspace backup for ${AGENT_NAME}..."

# ── 1. Create backup directory ───────────────────────────────────────
mkdir -p "${BACKUP_DIR}"

# ── 2. Create tarball (exclude wallet, secrets, backups dir itself) ──
tar -czf "${BACKUP_FILE}" \
  --exclude='wallet.json' \
  --exclude='backups' \
  --exclude='*.key' \
  --exclude='*.pem' \
  -C "$(dirname "${WORKSPACE_DIR}")" \
  "$(basename "${WORKSPACE_DIR}")/" \
  2>/dev/null

if [ ! -f "${BACKUP_FILE}" ]; then
  echo "[backup] ERROR: Backup failed — tar did not create file"
  /opt/scripts/alert.sh "critical" "${AGENT_NAME}" "Workspace backup failed — tar error"
  exit 1
fi

BACKUP_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
echo "[backup] Backup created: ${BACKUP_FILE} (${BACKUP_SIZE})"

# ── 3. Rotate old backups (keep last N) ──────────────────────────────
BACKUP_COUNT=$(ls -1 "${BACKUP_DIR}"/workspace_*.tar.gz 2>/dev/null | wc -l)

if [ "${BACKUP_COUNT}" -gt "${MAX_BACKUPS}" ]; then
  TO_DELETE=$((BACKUP_COUNT - MAX_BACKUPS))
  ls -1t "${BACKUP_DIR}"/workspace_*.tar.gz | tail -n "${TO_DELETE}" | while read -r old; do
    rm -f "${old}"
    echo "[backup] Removed old backup: $(basename "${old}")"
  done
fi

# ── 4. Check disk space ─────────────────────────────────────────────
AVAIL_KB=$(df "${WORKSPACE_DIR}" | tail -1 | awk '{print $4}')
AVAIL_MB=$((AVAIL_KB / 1024))

if [ "${AVAIL_MB}" -lt 50 ]; then
  echo "[backup] WARNING: Low disk space — ${AVAIL_MB}MB remaining"
  /opt/scripts/alert.sh "warning" "${AGENT_NAME}" "Low disk space after backup: ${AVAIL_MB}MB remaining on workspace volume"
fi

cron_mark_success "workspace-backup"
echo "[backup] Backup complete. ${BACKUP_COUNT} backups stored, ${AVAIL_MB}MB free."
