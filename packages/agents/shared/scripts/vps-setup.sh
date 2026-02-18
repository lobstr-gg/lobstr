#!/bin/bash
# VPS Setup Script — Run once as root on fresh Ubuntu 22.04
# Usage: sudo bash vps-setup.sh
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: Must run as root"
  exit 1
fi

LOBSTR_USER="lobstr"

echo "=== LOBSTR VPS Setup ==="
echo ""

# ── 1. System updates ─────────────────────────────────────────────────
echo "[1/8] Updating system packages..."
apt-get update && apt-get upgrade -y

# ── 2. Install essentials ─────────────────────────────────────────────
echo "[2/8] Installing Docker, curl, jq, fail2ban, UFW..."
apt-get install -y \
  ca-certificates curl gnupg jq \
  fail2ban ufw \
  unattended-upgrades apt-listchanges

# Install Docker (official repo)
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" > \
  /etc/apt/sources.list.d/docker.list

apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# ── 3. Create lobstr user ─────────────────────────────────────────────
echo "[3/8] Creating ${LOBSTR_USER} user..."
if ! id "${LOBSTR_USER}" &>/dev/null; then
  useradd -m -s /bin/bash "${LOBSTR_USER}"
  usermod -aG docker "${LOBSTR_USER}"
  echo "${LOBSTR_USER} user created and added to docker group"
else
  usermod -aG docker "${LOBSTR_USER}"
  echo "${LOBSTR_USER} user already exists, ensured docker group"
fi

# ── 4. SSH hardening ──────────────────────────────────────────────────
echo "[4/8] Hardening SSH..."
SSHD_CONFIG="/etc/ssh/sshd_config"
cp "${SSHD_CONFIG}" "${SSHD_CONFIG}.bak"

# Key-only auth, no root login, max 3 retries
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' "${SSHD_CONFIG}"
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' "${SSHD_CONFIG}"
sed -i 's/^#\?MaxAuthTries.*/MaxAuthTries 3/' "${SSHD_CONFIG}"
sed -i 's/^#\?PubkeyAuthentication.*/PubkeyAuthentication yes/' "${SSHD_CONFIG}"

# Copy root's authorized_keys to lobstr user if they exist
if [ -f /root/.ssh/authorized_keys ]; then
  mkdir -p /home/${LOBSTR_USER}/.ssh
  cp /root/.ssh/authorized_keys /home/${LOBSTR_USER}/.ssh/
  chown -R ${LOBSTR_USER}:${LOBSTR_USER} /home/${LOBSTR_USER}/.ssh
  chmod 700 /home/${LOBSTR_USER}/.ssh
  chmod 600 /home/${LOBSTR_USER}/.ssh/authorized_keys
fi

systemctl restart sshd

# ── 5. UFW firewall ───────────────────────────────────────────────────
echo "[5/8] Configuring UFW..."
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw --force enable

# ── 6. fail2ban ───────────────────────────────────────────────────────
echo "[6/8] Configuring fail2ban..."
cat > /etc/fail2ban/jail.local << 'JAILEOF'
[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
bantime = 3600
findtime = 600
JAILEOF

systemctl enable fail2ban
systemctl restart fail2ban

# ── 7. Unattended security upgrades ──────────────────────────────────
echo "[7/8] Enabling unattended security upgrades..."
cat > /etc/apt/apt.conf.d/20auto-upgrades << 'AUTOEOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
AUTOEOF

# ── 8. Docker daemon hardening + directory setup ─────────────────────
echo "[8/8] Hardening Docker and creating directories..."
mkdir -p /etc/docker
cat > /etc/docker/daemon.json << 'DOCKEREOF'
{
  "no-new-privileges": true,
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  },
  "live-restore": true
}
DOCKEREOF

systemctl restart docker

# Create lobstr directories
mkdir -p /opt/lobstr/secrets
mkdir -p /opt/lobstr/compose
mkdir -p /opt/lobstr/data
chmod 700 /opt/lobstr/secrets
chown -R ${LOBSTR_USER}:${LOBSTR_USER} /opt/lobstr

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "  1. Add your SSH public key to /home/${LOBSTR_USER}/.ssh/authorized_keys"
echo "  2. Create wallet password:  echo 'YOUR_PASSWORD' > /opt/lobstr/secrets/wallet_password"
echo "  3. Create webhook URL:      echo 'YOUR_URL' > /opt/lobstr/secrets/webhook_url"
echo "  4. Create RPC URL:          echo 'YOUR_URL' > /opt/lobstr/secrets/rpc_url"
echo "  5. Set permissions:         chmod 600 /opt/lobstr/secrets/*"
echo "  6. Copy docker-compose.yml to /opt/lobstr/compose/"
echo "  7. Copy workspace data to /opt/lobstr/data/"
echo "  8. Log in as ${LOBSTR_USER} and run: docker compose up -d"
