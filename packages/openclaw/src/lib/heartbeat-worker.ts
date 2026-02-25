/**
 * Heartbeat worker — runs as a detached child process.
 * Writes Poseidon(timestamp, nonce) to heartbeats.jsonl every 5 minutes.
 * Also writes block-hash-anchored entries to role-heartbeats.jsonl for
 * the ZK-proofed uptime system (community arbitrators/moderators).
 *
 * Usage: node heartbeat-worker.js <workspacePath>
 */
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// SNARK scalar field prime (BN254)
const SNARK_FIELD = BigInt('21888242871839275222246405745257275088548364400416034343698204186575808495617');

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
    // Fetch latest Base L2 block
    const { createPublicClient, http } = require('viem');
    const { base } = require('viem/chains');

    const rpcUrl = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
    const client = createPublicClient({
      chain: base,
      transport: http(rpcUrl),
    });

    const block = await client.getBlock({ blockTag: 'latest' });
    const blockNumber = Number(block.number);
    const blockHash = block.hash as string;

    // Reduce blockHash to fit SNARK field
    const blockHashBigInt = BigInt(blockHash);
    const blockHashField = blockHashBigInt % SNARK_FIELD;

    const timestamp = Math.floor(Date.now() / 1000);
    const nonce = BigInt('0x' + crypto.randomBytes(16).toString('hex'));

    // Poseidon(timestamp, blockHashField, nonce)
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
    // If RPC fails, silently skip this interval — daemon should not crash
  }
}

async function main() {
  const workspacePath = process.argv[2];
  if (!workspacePath) {
    console.error('Usage: heartbeat-worker <workspacePath>');
    process.exit(1);
  }

  // Emit one heartbeat immediately
  await emitHeartbeat(workspacePath);
  await emitRoleHeartbeat(workspacePath);

  // Then every 5 minutes
  setInterval(async () => {
    try {
      await emitHeartbeat(workspacePath);
    } catch {
      // Silently continue — daemon should not crash
    }
    try {
      await emitRoleHeartbeat(workspacePath);
    } catch {
      // Silently continue — daemon should not crash
    }
  }, INTERVAL_MS);
}

main().catch(() => process.exit(1));
