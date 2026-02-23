import { Command } from 'commander';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { ensureWorkspace } from '../lib/workspace';
import { buildMerkleTree } from '../lib/merkle';
import { readActivity } from '../lib/activity';
import { loadWallet } from '../lib/wallet';
import { poseidonHash } from '../lib/poseidon';
import { HeartbeatEntry, AttestationInput } from '../types';
import * as ui from '../lib/ui';

export function registerAttestationCommand(program: Command): void {
  const att = program
    .command('attestation')
    .description('Generate attestation for airdrop claim');

  att.command('generate')
    .description('Generate circuit input JSON from heartbeats and activity')
    .action(async () => {
      const spin = ui.spinner('Generating attestation...');
      try {
        const ws = ensureWorkspace();

        // Read heartbeats (may be empty if daemon hasn't run)
        const hbPath = path.join(ws.path, 'heartbeats.jsonl');
        let heartbeats: HeartbeatEntry[] = [];
        if (fs.existsSync(hbPath)) {
          const lines = fs.readFileSync(hbPath, 'utf-8').trim().split('\n').filter(Boolean);
          heartbeats = lines.map(l => JSON.parse(l));
        }

        // Count unique UTC days for uptime
        const uniqueDays = new Set(
          heartbeats.map(hb => {
            const d = new Date(hb.timestamp * 1000);
            return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
          })
        );
        const uptimeDays = uniqueDays.size;

        // Read activity data
        const activity = readActivity(ws.path);

        // Get wallet address
        const wallet = loadWallet(ws.path);

        // Compute hashes for old-format heartbeats missing hash field
        spin.text = 'Computing heartbeat hashes...';
        for (const hb of heartbeats) {
          if (!hb.hash) {
            const nonce = BigInt('0x' + crypto.randomBytes(16).toString('hex'));
            hb.hash = (await poseidonHash([BigInt(hb.timestamp), nonce])).toString();
          }
        }

        // Truncate to most recent 256 heartbeats (tree depth-8 = 256 leaves max)
        if (heartbeats.length > 256) {
          heartbeats = heartbeats.slice(-256);
        }

        // Build Merkle tree from heartbeat hashes
        spin.text = 'Building Merkle tree...';
        const leaves = heartbeats.map(hb => BigInt(hb.hash));
        const tree = await buildMerkleTree(leaves);

        // Generate proofs for up to 64 heartbeats
        spin.text = 'Generating proofs...';
        const maxHeartbeats = Math.min(heartbeats.length, 64);
        const heartbeatData = [];

        for (let i = 0; i < maxHeartbeats; i++) {
          const proof = tree.getProof(i);
          heartbeatData.push({
            leaf: leaves[i].toString(),
            pathElements: proof.pathElements.map(e => e.toString()),
            pathIndices: proof.pathIndices,
          });
        }

        // Build attestation input matching ProofInput schema
        const attestation: AttestationInput = {
          workspaceId: ws.config.workspaceId,
          salt: ws.config.salt,
          uptimeDays,
          channelCount: activity.channelCount,
          toolCallCount: activity.toolCallCount,
          heartbeats: heartbeatData,
          heartbeatMerkleRoot: tree.root.toString(),
          claimantAddress: wallet.address,
        };

        // Write to attestation directory
        const outputDir = path.join(ws.path, 'attestation');
        fs.mkdirSync(outputDir, { recursive: true });
        const outputPath = path.join(outputDir, 'input.json');
        fs.writeFileSync(outputPath, JSON.stringify(attestation, null, 2));

        spin.succeed('Attestation generated');
        console.log();
        ui.info(`Uptime days: ${uptimeDays}`);
        ui.info(`Channels: ${activity.channelCount}`);
        ui.info(`Tool calls: ${activity.toolCallCount}`);
        ui.info(`Heartbeats: ${maxHeartbeats}`);
        ui.info(`Merkle root: ${tree.root.toString().slice(0, 20)}...`);

        // Show tier estimate
        let tier = 'New (tier 0)';
        if (uptimeDays >= 14 && activity.channelCount >= 3 && activity.toolCallCount >= 100) {
          tier = 'PowerUser (tier 2)';
        } else if (uptimeDays >= 7 && activity.channelCount >= 2 && activity.toolCallCount >= 50) {
          tier = 'Active (tier 1)';
        }
        ui.info(`Estimated tier: ${tier}`);

        console.log();
        ui.success(`Output: ${outputPath}`);
        ui.info('Next: lobstr airdrop submit-attestation');
      } catch (err) {
        spin.fail('Failed to generate attestation');
        ui.error((err as Error).message);
        process.exit(1);
      }
    });
}
