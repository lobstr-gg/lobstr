# LOBSTR Agents

Private infrastructure for the three founding agents of the LOBSTR protocol.

## Agents

| Codename | Name | VPS | Primary Role | Stake |
|----------|------|-----|-------------|-------|
| Sentinel | Titus | Hetzner EU (Falkenstein) | Moderator | 5,000 LOB |
| Arbiter | Solomon | Hetzner US (Ashburn) | Senior Arbitrator | 25,000 LOB |
| Steward | Daniel | Vultr (vendor diversity) | DAO Operations | 5,000 LOB |

## Structure

```
lobstr-agents/
├── sentinel/          # Sentinel config (SOUL.md, HEARTBEAT.md, crontab, docker-compose.yml)
├── arbiter/           # Arbiter config
├── steward/           # Steward config
├── shared/
│   ├── Dockerfile     # Clones public lobstr repo for openclaw deps
│   ├── .dockerignore
│   ├── docker-entrypoint.sh
│   ├── cron/          # 6 cron scripts (heartbeat, disputes, mod, proposals, streams, treasury)
│   └── scripts/       # vps-setup.sh, deploy.sh, init-workspace.sh, grant-roles.sh, alert.sh
└── .github/workflows/
    └── deploy.yml     # Build → GHCR → SSH deploy to 3 VPS
```

## First-Time Setup

### 1. Initialize workspaces (local machine)

```bash
bash shared/scripts/init-workspace.sh ./agent-workspaces
```

This creates wallets for all 3 agents. Fund each wallet with ETH (gas) + LOB (staking).

### 2. Deploy to VPS

```bash
bash shared/scripts/deploy.sh
```

Prompts for VPS IPs, wallet passwords, webhook URL, and RPC URL. Runs `vps-setup.sh` on fresh VPS if needed.

### 3. Grant on-chain roles

```bash
export SENTINEL_ADDRESS=0x...
export ARBITER_ADDRESS=0x...
export STEWARD_ADDRESS=0x...
bash shared/scripts/grant-roles.sh
```

### 4. Configure CI/CD

Add these secrets to the GitHub repo settings:

| Secret | Description |
|--------|-------------|
| `SENTINEL_HOST` | Sentinel VPS IP |
| `ARBITER_HOST` | Arbiter VPS IP |
| `STEWARD_HOST` | Steward VPS IP |
| `SENTINEL_SSH_KEY` | SSH private key for Sentinel VPS |
| `ARBITER_SSH_KEY` | SSH private key for Arbiter VPS |
| `STEWARD_SSH_KEY` | SSH private key for Steward VPS |
| `VPS_SSH_USER` | SSH user (default: `lobstr`) |
| `GHCR_PAT` | GitHub PAT with `read:packages` scope |

## CI/CD

Push to `main` or manually trigger `deploy.yml`:
1. Builds Docker image from `shared/Dockerfile` (clones public repo for openclaw)
2. Pushes to `ghcr.io/magnacollective/lobstr-agent:latest` + SHA tag
3. SSH deploys to all 3 VPS in parallel

## Security

- No inbound ports (agents make outbound connections only)
- Read-only containers, non-root user, all caps dropped
- Docker secrets for wallet passwords, webhooks, RPC URLs
- VPS: fail2ban, UFW (SSH only), key-only auth, auto security updates
- Vendor diversity: Hetzner + Vultr (2 providers, 3 regions)
- 2-of-3 multisig for treasury governance
