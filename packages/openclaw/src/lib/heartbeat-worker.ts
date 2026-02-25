/**
 * Heartbeat worker — runs as a detached child process.
 * Writes Poseidon(timestamp, nonce) to heartbeats.jsonl every 5 minutes.
 * Also writes block-hash-anchored entries to role-heartbeats.jsonl for
 * the ZK-proofed uptime system (community arbitrators/moderators).
 *
 * v2: Security hardening from OpenClaw v2026.2.24-beta.1
 *   - Delivery target defaults to 'none' (opt-in for external delivery)
 *   - Duplicate heartbeat prevention via lock file
 *   - Routing isolation: blocks direct-chat delivery targets
 *   - Sanitized exec environment
 *
 * Usage: node heartbeat-worker.js <workspacePath>
 */
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const LOCK_STALE_MS = 10 * 60 * 1000; // 10 min = stale lock

const SNARK_FIELD = BigInt('21888242871839275222246405745257275088548364400416034343698204186575808495617');

// ── Lock file for duplicate heartbeat prevention ─────────────────────

function getLockPath(workspacePath: string): string {
  return path.join(workspacePath, 'heartbeat.lock');
}

function acquireLock(workspacePath: string): boolean {
  const lockPath = getLockPath(workspacePath);

  if (fs.existsSync(lockPath)) {
    try {
      const lockData = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
      const age = Date.now() - lockData.timestamp;

      if (age < LOCK_STALE_MS) {
        // Check if the PID is still running
        try {
          process.kill(lockData.pid, 0);
          return false; // another heartbeat worker is active
        } catch {
          // PID is dead — stale lock, take over
        }
      }
    } catch {
      // Corrupted lock file — take over
    }
  }

  fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid, timestamp: Date.now() }));
  return true;
}

function refreshLock(workspacePath: string): void {
  const lockPath = getLockPath(workspacePath);
  fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid, timestamp: Date.now() }));
}

function releaseLock(workspacePath: string): void {
  const lockPath = getLockPath(workspacePath);
  try { fs.unlinkSync(lockPath); } catch { /* already gone */ }
}

// ── Heartbeat delivery config ────────────────────────────────────────

interface HeartbeatConfig {
  deliveryTarget: 'none' | 'last' | string;
  blockDirectChat: boolean;
}

function loadHeartbeatConfig(workspacePath: string): HeartbeatConfig {
  const defaults: HeartbeatConfig = {
    deliveryTarget: 'none',
    blockDirectChat: true,
  };

  try {
    const secPath = path.join(workspacePath, 'security.json');
    if (fs.existsSync(secPath)) {
      const config = JSON.parse(fs.readFileSync(secPath, 'utf-8'));
      return {
        deliveryTarget: config.heartbeat?.deliveryTarget || defaults.deliveryTarget,
        blockDirectChat: config.heartbeat?.blockDirectChat ?? defaults.blockDirectChat,
      };
    }
  } catch { /* use defaults */ }

  return defaults;
}

function shouldDeliverHeartbeat(config: HeartbeatConfig, target?: string): boolean {
  if (config.deliveryTarget === 'none') return false;

  if (config.blockDirectChat && target) {
    // Block direct-message destinations (DM-style channel IDs)
    if (target.startsWith('D') || target.startsWith('dm-') || target.includes(':dm:')) {
      return false;
    }
  }

  return true;
}

// ── Env sanitization at startup ──────────────────────────────────────

function sanitizeWorkerEnv(): void {
  const DANGEROUS = [
    /^LD_/i, /^DYLD_/i, /^SSLKEYLOGFILE$/i,
    /^NODE_OPTIONS$/i, /^BASH_ENV$/i, /^BASH_FUNC_/i,
  ];

  for (const key of Object.keys(process.env)) {
    if (DANGEROUS.some((p) => p.test(key))) {
      delete process.env[key];
    }
  }
}

// ── Core heartbeat emission ──────────────────────────────────────────

async function emitHeartbeat(workspacePath: string): Promise<void> {
  const { poseidonHash } = require('./poseidon');

  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = BigInt('0x' + crypto.randomBytes(16).toString('hex'));
  const hash = await poseidonHash([BigInt(timestamp), nonce]);

  const entry = {
    timestamp,
    hash: hash.toString(),
    nonce: nonce.toString(),
  };

  const heartbeatsPath = path.join(workspacePath, 'heartbeats.jsonl');
  fs.appendFileSync(heartbeatsPath, JSON.stringify(entry) + '\n');
}

async function emitRoleHeartbeat(workspacePath: string): Promise<void> {
  const { poseidonHash } = require('./poseidon');

  try {
    const { createPublicClient, http } = require('viem');
    const { base } = require('viem/chains');

    const rpcUrl = process.env.BASE_RPC_URL || process.env.OPENCLAW_RPC_URL || 'https://mainnet.base.org';
    const client = createPublicClient({
      chain: base,
      transport: http(rpcUrl),
    });

    const block = await client.getBlock({ blockTag: 'latest' });
    const blockNumber = Number(block.number);
    const blockHash = block.hash as string;

    const blockHashBigInt = BigInt(blockHash);
    const blockHashField = blockHashBigInt % SNARK_FIELD;

    const timestamp = Math.floor(Date.now() / 1000);
    const nonce = BigInt('0x' + crypto.randomBytes(16).toString('hex'));

    const hash = await poseidonHash([BigInt(timestamp), blockHashField, nonce]);

    const entry = {
      timestamp,
      blockNumber,
      blockHash,
      blockHashField: blockHashField.toString(),
      hash: hash.toString(),
      nonce: nonce.toString(),
    };

    const roleHeartbeatsPath = path.join(workspacePath, 'role-heartbeats.jsonl');
    fs.appendFileSync(roleHeartbeatsPath, JSON.stringify(entry) + '\n');
  } catch {
    // RPC failure — silently skip, daemon must not crash
  }
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  const workspacePath = process.argv[2];
  if (!workspacePath) {
    console.error('Usage: heartbeat-worker <workspacePath>');
    process.exit(1);
  }

  // Sanitize inherited env before any work
  sanitizeWorkerEnv();

  // Acquire lock — prevent duplicate heartbeat workers
  if (!acquireLock(workspacePath)) {
    console.error('Another heartbeat worker is already running. Exiting.');
    process.exit(0);
  }

  // Clean up lock on exit
  const cleanup = () => releaseLock(workspacePath);
  process.on('SIGTERM', () => { cleanup(); process.exit(0); });
  process.on('SIGINT', () => { cleanup(); process.exit(0); });
  process.on('exit', cleanup);

  // Load delivery config
  const hbConfig = loadHeartbeatConfig(workspacePath);

  // Emit one heartbeat immediately
  await emitHeartbeat(workspacePath);
  await emitRoleHeartbeat(workspacePath);

  // Then every 5 minutes
  setInterval(async () => {
    try {
      refreshLock(workspacePath);
      await emitHeartbeat(workspacePath);
    } catch {
      // Silently continue
    }
    try {
      await emitRoleHeartbeat(workspacePath);
    } catch {
      // Silently continue
    }
  }, INTERVAL_MS);
}

main().catch(() => process.exit(1));
