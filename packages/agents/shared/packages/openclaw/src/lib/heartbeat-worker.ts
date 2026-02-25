/**
 * Heartbeat worker — runs as a detached child process.
 * Writes Poseidon(timestamp, nonce) to heartbeats.jsonl every 5 minutes.
 *
 * Usage: node heartbeat-worker.js <workspacePath>
 */
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

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

async function main() {
  const workspacePath = process.argv[2];
  if (!workspacePath) {
    console.error('Usage: heartbeat-worker <workspacePath>');
    process.exit(1);
  }

  // Emit one heartbeat immediately
  await emitHeartbeat(workspacePath);

  // Then every 5 minutes
  setInterval(async () => {
    try {
      await emitHeartbeat(workspacePath);
    } catch (err) {
      // Silently continue — daemon should not crash
    }
  }, INTERVAL_MS);
}

main().catch(() => process.exit(1));
