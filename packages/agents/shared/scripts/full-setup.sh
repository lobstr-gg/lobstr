#!/bin/bash
# Full VPS Setup + Fort Knox Hardening — single pass as root
# Run once on fresh Ubuntu 22.04
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: Must run as root"
  exit 1
fi

LOBSTR_USER="lobstr"
SSH_PORT=2222

echo "=== LOBSTR VPS Full Setup + Fort Knox ==="
echo ""

# ══════════════════════════════════════════════════════════════════
# PHASE 1: Base Setup
# ══════════════════════════════════════════════════════════════════

echo "[1/12] Updating system packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update && apt-get upgrade -y -o Dpkg::Options::="--force-confdef"

echo "[2/12] Installing essentials..."
apt-get install -y -o Dpkg::Options::="--force-confdef" \
  ca-certificates curl gnupg jq \
  fail2ban ufw \
  unattended-upgrades apt-listchanges \
  auditd sudo

# Install Docker
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" > \
  /etc/apt/sources.list.d/docker.list

apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

echo "[3/12] Creating ${LOBSTR_USER} user with sudo..."
if ! id "${LOBSTR_USER}" &>/dev/null; then
  useradd -m -s /bin/bash "${LOBSTR_USER}"
fi
usermod -aG docker,sudo "${LOBSTR_USER}"

# Passwordless sudo for lobstr (needed for container ops)
echo "${LOBSTR_USER} ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/lobstr
chmod 440 /etc/sudoers.d/lobstr

# Copy root's authorized_keys
if [ -f /root/.ssh/authorized_keys ]; then
  mkdir -p /home/${LOBSTR_USER}/.ssh
  cp /root/.ssh/authorized_keys /home/${LOBSTR_USER}/.ssh/
  chown -R ${LOBSTR_USER}:${LOBSTR_USER} /home/${LOBSTR_USER}/.ssh
  chmod 700 /home/${LOBSTR_USER}/.ssh
  chmod 600 /home/${LOBSTR_USER}/.ssh/authorized_keys
fi

# ══════════════════════════════════════════════════════════════════
# PHASE 2: SSH Hardening (Fort Knox)
# ══════════════════════════════════════════════════════════════════

echo "[4/12] SSH hardening (port ${SSH_PORT}, key-only, lobstr-only)..."
SSHD="/etc/ssh/sshd_config"
cp "${SSHD}" "${SSHD}.bak"

sed -i "s/^#\?Port .*/Port ${SSH_PORT}/" "${SSHD}"
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' "${SSHD}"
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' "${SSHD}"
sed -i 's/^#\?MaxAuthTries.*/MaxAuthTries 3/' "${SSHD}"
sed -i 's/^#\?PubkeyAuthentication.*/PubkeyAuthentication yes/' "${SSHD}"
sed -i 's/^#\?X11Forwarding.*/X11Forwarding no/' "${SSHD}"
sed -i 's/^#\?AllowTcpForwarding.*/AllowTcpForwarding no/' "${SSHD}"
sed -i 's/^#\?AllowAgentForwarding.*/AllowAgentForwarding no/' "${SSHD}"
sed -i 's/^#\?ClientAliveInterval.*/ClientAliveInterval 300/' "${SSHD}"
sed -i 's/^#\?ClientAliveCountMax.*/ClientAliveCountMax 2/' "${SSHD}"
sed -i 's/^#\?LoginGraceTime.*/LoginGraceTime 30/' "${SSHD}"

if ! grep -q "^AllowUsers" "${SSHD}"; then
  echo "AllowUsers ${LOBSTR_USER}" >> "${SSHD}"
fi

# ══════════════════════════════════════════════════════════════════
# PHASE 3: Firewall
# ══════════════════════════════════════════════════════════════════

echo "[5/12] UFW firewall (port ${SSH_PORT} only, rate-limited)..."
ufw default deny incoming
ufw default allow outgoing
ufw allow ${SSH_PORT}/tcp
ufw limit ${SSH_PORT}/tcp
ufw --force enable

# NOW restart SSH (after UFW is configured)
systemctl restart sshd

# ══════════════════════════════════════════════════════════════════
# PHASE 4: fail2ban (aggressive)
# ══════════════════════════════════════════════════════════════════

echo "[6/12] fail2ban (2 attempts = 7-day ban)..."
cat > /etc/fail2ban/jail.local << JAILEOF
[DEFAULT]
bantime = 86400
findtime = 600
maxretry = 3
banaction = ufw

[sshd]
enabled = true
port = ${SSH_PORT}
filter = sshd
logpath = /var/log/auth.log
maxretry = 2
bantime = 604800
findtime = 3600
JAILEOF

systemctl enable fail2ban
systemctl restart fail2ban

# ══════════════════════════════════════════════════════════════════
# PHASE 5: Kernel Hardening
# ══════════════════════════════════════════════════════════════════

echo "[7/12] Kernel hardening (sysctl)..."
cat > /etc/sysctl.d/99-lobstr-hardening.conf << 'SYSEOF'
net.ipv4.ip_forward = 0
net.ipv6.conf.all.forwarding = 0
net.ipv4.tcp_syncookies = 1
net.ipv4.tcp_max_syn_backlog = 2048
net.ipv4.tcp_synack_retries = 2
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv6.conf.all.accept_redirects = 0
net.ipv6.conf.default.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.default.send_redirects = 0
net.ipv4.conf.all.accept_source_route = 0
net.ipv4.conf.default.accept_source_route = 0
net.ipv6.conf.all.accept_source_route = 0
net.ipv6.conf.default.accept_source_route = 0
net.ipv4.conf.all.log_martians = 1
net.ipv4.icmp_echo_ignore_broadcasts = 1
net.ipv4.tcp_rfc1337 = 1
fs.suid_dumpable = 0
kernel.kptr_restrict = 2
kernel.dmesg_restrict = 1
kernel.unprivileged_bpf_disabled = 1
kernel.randomize_va_space = 2
SYSEOF

sysctl -p /etc/sysctl.d/99-lobstr-hardening.conf 2>/dev/null || true

# ══════════════════════════════════════════════════════════════════
# PHASE 6: Services & Permissions
# ══════════════════════════════════════════════════════════════════

echo "[8/12] Disabling unnecessary services..."
for svc in snapd snapd.socket snap.lxd.daemon cups avahi-daemon bluetooth; do
  systemctl stop "${svc}" 2>/dev/null || true
  systemctl disable "${svc}" 2>/dev/null || true
  systemctl mask "${svc}" 2>/dev/null || true
done

echo "[9/12] File permission hardening..."
chmod 700 /home/${LOBSTR_USER}
chmod 600 /etc/crontab
chmod 700 /etc/cron.d /etc/cron.daily /etc/cron.hourly /etc/cron.weekly /etc/cron.monthly

# ══════════════════════════════════════════════════════════════════
# PHASE 7: Docker Hardening
# ══════════════════════════════════════════════════════════════════

echo "[10/12] Docker daemon hardening..."
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

# ══════════════════════════════════════════════════════════════════
# PHASE 8: Audit Logging
# ══════════════════════════════════════════════════════════════════

echo "[11/12] Audit logging..."
cat > /etc/audit/rules.d/lobstr.rules << 'AUDITEOF'
-w /opt/lobstr/secrets -p rwxa -k lobstr_secrets
-w /var/run/docker.sock -p rwxa -k docker_socket
-w /etc/ssh/sshd_config -p wa -k ssh_config
-w /etc/passwd -p wa -k user_changes
-w /etc/shadow -p wa -k shadow_changes
-w /etc/crontab -p wa -k cron_changes
-w /var/spool/cron -p wa -k cron_user_changes
AUDITEOF

systemctl enable auditd
systemctl restart auditd

# ══════════════════════════════════════════════════════════════════
# PHASE 9: LOBSTR Directories + Auto-Upgrades + Banner
# ══════════════════════════════════════════════════════════════════

echo "[12/12] Creating directories, auto-upgrades, banner..."

# Unattended security upgrades
cat > /etc/apt/apt.conf.d/20auto-upgrades << 'AUTOEOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
AUTOEOF

# LOBSTR directories
mkdir -p /opt/lobstr/secrets
mkdir -p /opt/lobstr/compose
mkdir -p /opt/lobstr/data
chmod 700 /opt/lobstr/secrets
chown -R ${LOBSTR_USER}:${LOBSTR_USER} /opt/lobstr

# Login banner
cat > /etc/motd << 'MOTDEOF'

  LOBSTR Agent Infrastructure — Authorized Access Only
  All sessions are monitored and logged via auditd.

MOTDEOF

# Clean up
rm -f /tmp/full-setup.sh

echo ""
echo "=== Setup Complete ==="
echo ""
echo "SSH port: ${SSH_PORT}"
echo "SSH user: ${LOBSTR_USER} (key-only, sudo enabled)"
echo "Root login: DISABLED"
echo ""
echo "Connect with:"
echo "  ssh -p ${SSH_PORT} -i ~/.ssh/lobstr_agents ${LOBSTR_USER}@<host>"
echo ""
echo "Hardening applied:"
echo "  - SSH: port ${SSH_PORT}, key-only, lobstr-only, no forwarding"
echo "  - fail2ban: 2 failed attempts = 7-day ban"
echo "  - UFW: deny all inbound except ${SSH_PORT}"
echo "  - Kernel: SYN flood protection, no redirects, ASLR, restricted /proc"
echo "  - Docker: no-new-privileges, json-file logging, live-restore"
echo "  - Audit: secrets, docker socket, SSH config, user changes"
echo "  - Services: snapd, cups, avahi, bluetooth disabled"
echo "  - Auto: unattended security upgrades enabled"
