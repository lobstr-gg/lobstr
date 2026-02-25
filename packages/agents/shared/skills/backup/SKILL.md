---
name: backup
description: Backup and restore agent workspace data. Automatically archives workspace state (config, activity, heartbeats, skills, proposals) to a timestamped tarball in the backup volume. Excludes sensitive wallet data. Runs daily via cron.
metadata: {"openclaw":{"emoji":"backup","requires":{"bins":["tar"],"env":[]}}}
---

# LOBSTR Agent Backup Skill

Automated backup and restore for agent workspace data running inside Docker containers.

## Overview

This skill manages backups of your workspace data at `/data/workspace/`. Backups are:
- Created automatically via daily cron job
- Stored as timestamped tarballs in `/data/backups/`
- Rotated to keep the last 7 days
- Exclude sensitive wallet data (private keys never leave the container)

## What Gets Backed Up

```
ALWAYS BACKED UP:
  /data/workspace/config.json          # Workspace configuration
  /data/workspace/activity.json        # Activity counters
  /data/workspace/heartbeats.jsonl     # Heartbeat history
  /data/workspace/skills/              # Installed skills + SKILL.md files
  /data/workspace/config-proposals/    # Pending config change proposals

NEVER BACKED UP:
  /data/workspace/wallet.json          # Encrypted private key — NEVER
  /run/secrets/*                       # Docker secrets — NEVER
  /tmp/*                               # Ephemeral data
  /var/log/agent/*                     # Logs (separate volume)
```

## Backup Location

Backups are stored in `/data/backups/` (a subdirectory of the workspace volume):

```
/data/backups/
├── workspace_20260219_020000.tar.gz
├── workspace_20260218_020000.tar.gz
├── workspace_20260217_020000.tar.gz
└── ... (last 7 days)
```

## Manual Backup Commands

### Create Backup Now

```bash
# From inside the container (via cron script)
/opt/cron/workspace-backup.sh

# Or manually with tar
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
tar -czf /data/backups/workspace_${TIMESTAMP}.tar.gz \
  --exclude='wallet.json' \
  --exclude='backups' \
  -C /data workspace/
```

### List Backups

```bash
ls -lh /data/backups/*.tar.gz
```

### Restore from Backup

```bash
# 1. List available backups
ls -lt /data/backups/

# 2. Preview contents (verify before restoring)
tar -tzvf /data/backups/workspace_20260219_020000.tar.gz

# 3. Restore specific files (non-destructive — extracts alongside existing)
tar -xzvf /data/backups/workspace_20260219_020000.tar.gz \
  -C /data \
  workspace/config.json \
  workspace/activity.json

# 4. Full restore (overwrites current workspace except wallet)
tar -xzvf /data/backups/workspace_20260219_020000.tar.gz \
  --exclude='wallet.json' \
  -C /data
```

### Verify Backup Integrity

```bash
# Test without extracting
tar -tzvf /data/backups/workspace_20260219_020000.tar.gz > /dev/null \
  && echo "Backup OK" \
  || echo "Backup CORRUPT"
```

## Cron Schedule

Backups run daily, staggered across agents:

| Agent    | Schedule (UTC) | Cron Expression |
|----------|---------------|-----------------|
| Sentinel | 3:00 AM       | `0 3 * * *`     |
| Arbiter  | 3:02 AM       | `2 3 * * *`     |
| Steward  | 3:04 AM       | `4 3 * * *`     |

## Retention Policy

- Keep last **7 daily backups**
- Older backups are automatically deleted by the cron script
- If disk space is critical (< 50MB free), warn via alert webhook

## Disaster Recovery

### Scenario: Container Destroyed, Volume Intact

Volume data persists. Just redeploy:
```bash
docker compose up -d
```
The workspace and backups are on the named volume.

### Scenario: Volume Lost

1. Cruz redeploys the container (configs are in Git)
2. Workspace is re-initialized via `init-workspace.sh`
3. Wallet must be re-imported from secure offline backup
4. Skills are auto-installed from the Docker image on next startup
5. Activity history and heartbeats are lost (acceptable — they rebuild over time)

### Scenario: Need to Roll Back a Config Change

1. Find the backup from before the change: `ls -lt /data/backups/`
2. Extract just `config.json` from the backup
3. Restart the container

## Security Notes

- **wallet.json is NEVER included in backups.** The encrypted keyfile stays only in the workspace volume and Docker secrets.
- Backups do not leave the container. They stay on the same Docker volume.
- No network calls are made during backup — pure local tar operations.
- If backup files need to be extracted for disaster recovery, Cruz handles it via SSH.
- Never expose backup tarballs via any API, webhook, or public endpoint.
