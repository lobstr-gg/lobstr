# Maintaining the Claw Bots

Quick reference for keeping Sentinel, Arbiter, and Steward alive and healthy.

## Infrastructure

| Agent | Host | Location | Arch | SSH |
|-------|------|----------|------|-----|
| Sentinel | `46.225.178.175` | Hetzner Nuremberg EU | arm64 | `ssh -p 2222 -i ~/.ssh/lobstr_agents lobstr@46.225.178.175` |
| Arbiter | `178.156.255.35` | Hetzner Ashburn US | amd64 | `ssh -p 2222 -i ~/.ssh/lobstr_agents lobstr@178.156.255.35` |
| Steward | `104.238.165.33` | Vultr Chicago | amd64 | `ssh -p 2222 -i ~/.ssh/lobstr_agents lobstr@104.238.165.33` |

## Agent Wallets (Multisig Signers)

| Agent | Address | Role |
|-------|---------|------|
| Sentinel | `0x8a1C742A8A2F4f7C1295443809acE281723650fb` | Signer 1 (Deployer) |
| Arbiter | `0xb761530d346D39B2c10B546545c24a0b0a3285D0` | Signer 2 |
| Steward | `0x443c4ff3CAa0E344b10CA19779B2E8AB1ACcd672` | Signer 3 |

## Quick Commands

### Check if a bot is alive
```bash
ssh -p 2222 -i ~/.ssh/lobstr_agents lobstr@<HOST> "docker ps && docker logs lobstr-<agent> --tail 20"
```

### Restart a bot
```bash
ssh -p 2222 -i ~/.ssh/lobstr_agents lobstr@<HOST> "cd /opt/lobstr/compose && docker compose restart"
```

### View live logs
```bash
ssh -p 2222 -i ~/.ssh/lobstr_agents lobstr@<HOST> "docker logs -f lobstr-<agent>"
```

### Check disk/memory
```bash
ssh -p 2222 -i ~/.ssh/lobstr_agents lobstr@<HOST> "df -h && free -h && docker stats --no-stream"
```

### Pull latest image (after CI/CD runs)
The CI/CD pipeline handles this automatically on push to `main`. To manually redeploy:
```bash
gh workflow run deploy.yml --repo magnacollective/lobstr-agents
```

## Updating Secrets

Secrets live at `/opt/lobstr/secrets/` on each VPS (directory is 700, files are 644):

```bash
# Update wallet password
ssh -p 2222 -i ~/.ssh/lobstr_agents lobstr@<HOST> "echo 'NEW_PASSWORD' > /opt/lobstr/secrets/wallet_password"

# Update webhook URL
ssh -p 2222 -i ~/.ssh/lobstr_agents lobstr@<HOST> "echo 'https://discord.com/api/webhooks/...' > /opt/lobstr/secrets/webhook_url"

# Update RPC URL
ssh -p 2222 -i ~/.ssh/lobstr_agents lobstr@<HOST> "echo 'https://...' > /opt/lobstr/secrets/rpc_url"

# Restart container to pick up new secrets
ssh -p 2222 -i ~/.ssh/lobstr_agents lobstr@<HOST> "cd /opt/lobstr/compose && docker compose restart"
```

## CI/CD Pipeline

**Repo**: `magnacollective/lobstr-agents` (private)
**Trigger**: push to `main` or manual `workflow_dispatch`

Pipeline flow:
1. Build amd64 + arm64 Docker images (~6 min)
2. SCP images to each VPS (no GHCR needed)
3. `docker load` + `docker compose up -d`

To switch `gh` auth for the agents repo:
```bash
gh auth switch --user magnacollective
# ... do your thing ...
gh auth switch --user lobstr-gg  # switch back
```

## Workspace Files

Each agent's workspace is stored in a Docker volume (`compose_<agent>-data`).

To inspect workspace contents:
```bash
ssh -p 2222 -i ~/.ssh/lobstr_agents lobstr@<HOST> \
  "docker run --rm -v compose_<agent>-data:/data alpine ls -la /data"
```

To update workspace files:
```bash
# Copy new files to VPS
scp -P 2222 -i ~/.ssh/lobstr_agents config.json lobstr@<HOST>:/opt/lobstr/data/

# Copy into Docker volume
ssh -p 2222 -i ~/.ssh/lobstr_agents lobstr@<HOST> \
  "docker run --rm -v compose_<agent>-data:/data -v /opt/lobstr/data:/src alpine cp /src/config.json /data/"

# Restart
ssh -p 2222 -i ~/.ssh/lobstr_agents lobstr@<HOST> "cd /opt/lobstr/compose && docker compose restart"
```

## Updating Agent Code

1. Update source in `shared/packages/openclaw/` or `shared/packages/openclaw-skill/`
2. Push to `main` — CI/CD rebuilds and redeploys automatically
3. Verify: check logs on each VPS

## Troubleshooting

**Container crash-looping**
```bash
docker logs lobstr-<agent> --tail 50  # check what's failing
```

**"exec format error"**
Wrong architecture image. Sentinel is ARM, Arbiter/Steward are x86. CI builds both.

**"Permission denied" on secrets**
Secret files need mode 644 (not 600) because containers run with `cap_drop: ALL`:
```bash
chmod 644 /opt/lobstr/secrets/*
```

**fail2ban locked you out**
Wait 7 days, or rebuild the VPS from the Hetzner/Vultr dashboard and re-run `full-setup.sh`.

**Hetzner CLI**
```bash
# Two contexts: titus (Sentinel) and solomon (Arbiter)
hcloud context use titus    # for Sentinel ops
hcloud context use solomon  # for Arbiter ops
hcloud server list
```

**Vultr CLI**
```bash
vultr-cli instance list
```

## Security Hardening (Fort Knox)

All VPS have:
- SSH on port 2222 (key-only, `lobstr` user only)
- fail2ban: 2 failed attempts = 7-day ban
- UFW: deny all inbound except 2222
- Kernel hardening (SYN flood protection, ASLR, no redirects)
- Docker: no-new-privileges, read-only containers, dropped capabilities
- auditd: monitoring secrets, docker socket, SSH config changes
- Auto: unattended security upgrades
