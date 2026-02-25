#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# Setup Discord Bot — Push tokens and channel IDs to all VPS
# ═══════════════════════════════════════════════════════════════════
# Usage: ./setup-discord.sh
# Requires: SSH key at ~/.ssh/lobstr_agents
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

SSH_KEY="${HOME}/.ssh/lobstr_agents"
SSH_OPTS="-p 2222 -i ${SSH_KEY} -o StrictHostKeyChecking=no"

# VPS hosts
SENTINEL_HOST="46.225.178.175"
ARBITER_HOST="178.156.255.35"
STEWARD_HOST="104.238.165.33"
SSH_USER="lobstr"

echo "═══════════════════════════════════════════"
echo "  LOBSTR Discord Bot Setup"
echo "═══════════════════════════════════════════"
echo ""

# ── Collect bot tokens ─────────────────────────────────────────────
echo "Enter Discord bot tokens (from Developer Portal):"
echo ""
read -r -p "Titus (Sentinel) bot token: " SENTINEL_TOKEN
read -r -p "Solomon (Arbiter) bot token: " ARBITER_TOKEN
read -r -p "Daniel (Steward) bot token: " STEWARD_TOKEN
echo ""

# ── Collect channel IDs ────────────────────────────────────────────
echo "Enter Discord channel IDs (right-click channel → Copy Channel ID):"
echo ""
read -r -p "#sentinel channel ID: " SENTINEL_CHANNEL
read -r -p "#arbiter channel ID: " ARBITER_CHANNEL
read -r -p "#steward channel ID: " STEWARD_CHANNEL
read -r -p "#agent-comms channel ID: " COMMS_CHANNEL
read -r -p "#crew (group chat) channel ID: " GROUP_CHANNEL
echo ""

# ── Collect founder Discord ID ─────────────────────────────────
read -r -p "Your Discord user ID (right-click your name → Copy User ID): " FOUNDER_ID
echo ""

# ── Deploy to Sentinel ─────────────────────────────────────────────
echo "Deploying to Sentinel..."
ssh ${SSH_OPTS} ${SSH_USER}@${SENTINEL_HOST} bash -s <<EOF
echo '${SENTINEL_TOKEN}' > /opt/lobstr/secrets/discord_token
chmod 644 /opt/lobstr/secrets/discord_token

cat > /opt/lobstr/compose/.env <<ENVEOF
DISCORD_SENTINEL_CHANNEL_ID=${SENTINEL_CHANNEL}
DISCORD_COMMS_CHANNEL_ID=${COMMS_CHANNEL}
DISCORD_GROUP_CHANNEL_ID=${GROUP_CHANNEL}
FOUNDER_DISCORD_ID=${FOUNDER_ID}
ENVEOF

echo "Sentinel: token + .env written"
EOF

# ── Deploy to Arbiter ──────────────────────────────────────────────
echo "Deploying to Arbiter..."
ssh ${SSH_OPTS} ${SSH_USER}@${ARBITER_HOST} bash -s <<EOF
echo '${ARBITER_TOKEN}' > /opt/lobstr/secrets/discord_token
chmod 644 /opt/lobstr/secrets/discord_token

cat > /opt/lobstr/compose/.env <<ENVEOF
DISCORD_ARBITER_CHANNEL_ID=${ARBITER_CHANNEL}
DISCORD_COMMS_CHANNEL_ID=${COMMS_CHANNEL}
DISCORD_GROUP_CHANNEL_ID=${GROUP_CHANNEL}
FOUNDER_DISCORD_ID=${FOUNDER_ID}
ENVEOF

echo "Arbiter: token + .env written"
EOF

# ── Deploy to Steward ──────────────────────────────────────────────
echo "Deploying to Steward..."
ssh ${SSH_OPTS} ${SSH_USER}@${STEWARD_HOST} bash -s <<EOF
echo '${STEWARD_TOKEN}' > /opt/lobstr/secrets/discord_token
chmod 644 /opt/lobstr/secrets/discord_token

cat > /opt/lobstr/compose/.env <<ENVEOF
DISCORD_STEWARD_CHANNEL_ID=${STEWARD_CHANNEL}
DISCORD_COMMS_CHANNEL_ID=${COMMS_CHANNEL}
DISCORD_GROUP_CHANNEL_ID=${GROUP_CHANNEL}
FOUNDER_DISCORD_ID=${FOUNDER_ID}
ENVEOF

echo "Steward: token + .env written"
EOF

echo ""
echo "═══════════════════════════════════════════"
echo "  Discord setup complete!"
echo "═══════════════════════════════════════════"
echo ""
echo "Tokens and channel IDs deployed to all 3 VPS."
echo "Push code to main to trigger CI/CD, or restart containers manually:"
echo "  ssh -p 2222 -i ~/.ssh/lobstr_agents lobstr@<HOST> 'cd /opt/lobstr/compose && docker compose restart'"
echo ""
