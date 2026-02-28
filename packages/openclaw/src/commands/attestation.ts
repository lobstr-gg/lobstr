import { Command } from 'commander';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { ensureWorkspace } from '../lib/workspace';
import { buildMerkleTree } from '../lib/merkle';
import { readActivity } from '../lib/activity';
import { loadWallet } from '../lib/wallet';
import { poseidonHash } from '../lib/poseidon';
import { HeartbeatEntry, AttestationInput } from '../types';
import * as ui from '../lib/ui';

const PTAU_URL = 'https://storage.googleapis.com/zkevm/ptau/powersOfTau28_hez_final_17.ptau';

// Writable directory for generated files (zkey, vkey) — workspace survives restarts
function writableCircuitsDir(): string {
  // Prefer workspace circuits dir (writable even with read-only rootfs)
  try {
    const ws = ensureWorkspace();
    const dir = path.join(ws.path, 'circuits');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  } catch {
    // Fallback to Docker circuits dir or dev build dir
    if (fs.existsSync('/opt/lobstr/circuits')) return '/opt/lobstr/circuits';
    const devDir = path.join(__dirname, '..', '..', '..', 'circuits', 'build');
    if (!fs.existsSync(devDir)) fs.mkdirSync(devDir, { recursive: true });
    return devDir;
  }
}

// Map production zkey filenames — the saved zkeys use versioned names
const ZKEY_PRODUCTION_MAP: Record<string, string> = {
  'airdropAttestation_0001.zkey': 'airdropAttestation_v5.zkey',
  'airdropAttestation.wasm': 'airdropAttestation.wasm',
  'verification_key_v5.json': 'verification_key_v5.json',
};

// Resolve circuit files — checks workspace, Docker, zkeys archive, and dev paths
function resolveCircuitPath(filename: string): string {
  let wsPath: string | undefined;
  try { wsPath = path.join(ensureWorkspace().path, 'circuits', filename); } catch {}
  const productionName = ZKEY_PRODUCTION_MAP[filename];
  const candidates = [
    ...(wsPath ? [wsPath] : []),
    path.join('/opt/lobstr/circuits', filename),
    // Production zkeys directory (version-controlled, matches on-chain verifier)
    ...(productionName ? [path.join(__dirname, '..', '..', '..', 'circuits', 'zkeys', productionName)] : []),
    path.join(__dirname, '..', '..', '..', 'circuits', 'zkeys', filename),
    path.join(__dirname, '..', '..', '..', 'circuits', 'build', filename),
    path.join(__dirname, '..', '..', '..', 'circuits', 'build', 'airdropAttestation_js', filename),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error(`Circuit file not found: ${filename}. Searched:\n  ${candidates.join('\n  ')}`);
}

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
        ui.info('Next: lobstr attestation prove');
      } catch (err) {
        spin.fail('Failed to generate attestation');
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  // ── setup ───────────────────────────────────────────
  // Copies the production zkey + WASM to the agent's workspace.
  // IMPORTANT: Agents must use the SAME zkey that matches the on-chain Groth16VerifierV5.
  // Generating a new zkey would produce different verification constants and proofs
  // would fail on-chain verification.

  att.command('setup')
    .description('Install production proving key (zkey + WASM) for airdrop proofs')
    .option('--force', 'Re-install even if files already exist')
    .action(async (opts) => {
      const spin = ui.spinner('Setting up proving environment...');
      try {
        const circuitsDir = writableCircuitsDir();
        const zkeyDest = path.join(circuitsDir, 'airdropAttestation_0001.zkey');
        const wasmDest = path.join(circuitsDir, 'airdropAttestation.wasm');
        const vkeyDest = path.join(circuitsDir, 'verification_key.json');

        // Check if already set up
        if (fs.existsSync(zkeyDest) && fs.existsSync(wasmDest) && !opts.force) {
          spin.succeed('Proving environment already set up');
          ui.info(`zkey: ${zkeyDest}`);
          ui.info(`WASM: ${wasmDest}`);
          ui.info('Use --force to re-install');
          return;
        }

        // Locate production zkey from bundled zkeys directory
        const productionZkeyPath = resolveCircuitPath('airdropAttestation_0001.zkey');
        const productionVkeyPath = (() => {
          try { return resolveCircuitPath('verification_key_v5.json'); } catch {
            // Try alternative names
            const alt = path.join(path.dirname(productionZkeyPath), 'verification_key_v5.json');
            if (fs.existsSync(alt)) return alt;
            const alt2 = path.join(path.dirname(productionZkeyPath), 'verification_key.json');
            if (fs.existsSync(alt2)) return alt2;
            return null;
          }
        })();

        // Copy zkey to workspace
        spin.text = 'Copying production zkey (67MB)...';
        if (path.resolve(productionZkeyPath) !== path.resolve(zkeyDest)) {
          fs.copyFileSync(productionZkeyPath, zkeyDest);
        }

        // Copy WASM
        spin.text = 'Copying circuit WASM...';
        try {
          const productionWasmPath = resolveCircuitPath('airdropAttestation.wasm');
          if (path.resolve(productionWasmPath) !== path.resolve(wasmDest)) {
            fs.copyFileSync(productionWasmPath, wasmDest);
          }
        } catch {
          spin.fail('WASM file not found in production bundle');
          process.exit(1);
        }

        // Copy verification key
        if (productionVkeyPath && path.resolve(productionVkeyPath) !== path.resolve(vkeyDest)) {
          fs.copyFileSync(productionVkeyPath, vkeyDest);
        }

        spin.succeed('Proving environment ready');
        console.log();
        ui.info(`zkey: ${zkeyDest}`);
        ui.info(`WASM: ${wasmDest}`);
        if (productionVkeyPath) ui.info(`vkey: ${vkeyDest}`);
        console.log();
        ui.success('Ready to generate proofs');
        ui.info('Next: lobstr attestation generate && lobstr attestation prove');
        process.exit(0);
      } catch (err) {
        spin.fail('Trusted setup failed');
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  // ── prove ───────────────────────────────────────────
  // Generates a groth16 ZK proof from the attestation input.json

  att.command('prove')
    .description('Generate ZK proof from attestation input')
    .option('--input <path>', 'Path to input.json (default: workspace/attestation/input.json)')
    .action(async (opts) => {
      const spin = ui.spinner('Preparing proof generation...');
      try {
        const ws = ensureWorkspace();

        // Load input
        const inputPath = opts.input || path.join(ws.path, 'attestation', 'input.json');
        if (!fs.existsSync(inputPath)) {
          spin.fail('No attestation input found');
          ui.error(`File not found: ${inputPath}`);
          ui.info('Run first: lobstr attestation generate');
          process.exit(1);
        }
        const attestation: AttestationInput = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));

        // Resolve circuit files
        spin.text = 'Locating circuit files...';
        const wasmPath = resolveCircuitPath('airdropAttestation.wasm');
        let zkeyPath: string;
        try {
          zkeyPath = resolveCircuitPath('airdropAttestation_0001.zkey');
        } catch {
          spin.fail('No zkey found — run trusted setup first');
          ui.info('Run: lobstr attestation setup');
          process.exit(1);
        }
        ui.info(`WASM: ${wasmPath}`);
        ui.info(`zkey: ${zkeyPath}`);

        // Build poseidon for workspace hash
        spin.text = 'Computing workspace hash...';
        const buildPoseidon = require('circomlibjs').buildPoseidon;
        const poseidon = await buildPoseidon();
        const F = poseidon.F;
        const workspaceHash = F.toString(
          poseidon([BigInt(attestation.workspaceId), BigInt(attestation.salt)])
        );

        // Determine tier
        let tierIndex = 0;
        if (attestation.uptimeDays >= 14 && attestation.channelCount >= 3 && attestation.toolCallCount >= 100) {
          tierIndex = 2;
        } else if (attestation.uptimeDays >= 7 && attestation.channelCount >= 2 && attestation.toolCallCount >= 50) {
          tierIndex = 1;
        }

        // Pad heartbeats to 64 slots
        const paddedLeaves: string[] = [];
        const paddedPathElements: string[][] = [];
        const paddedPathIndices: number[][] = [];
        for (let i = 0; i < 64; i++) {
          if (i < attestation.heartbeats.length) {
            paddedLeaves.push(attestation.heartbeats[i].leaf);
            paddedPathElements.push(attestation.heartbeats[i].pathElements);
            paddedPathIndices.push(attestation.heartbeats[i].pathIndices);
          } else {
            paddedLeaves.push('0');
            paddedPathElements.push(Array(8).fill('0'));
            paddedPathIndices.push(Array(8).fill(0));
          }
        }

        const circuitInput = {
          workspaceHash,
          claimantAddress: attestation.claimantAddress,
          tierIndex: tierIndex.toString(),
          workspaceId: attestation.workspaceId,
          salt: attestation.salt,
          uptimeDays: attestation.uptimeDays.toString(),
          channelCount: attestation.channelCount.toString(),
          toolCallCount: attestation.toolCallCount.toString(),
          heartbeatLeaves: paddedLeaves,
          heartbeatPathElements: paddedPathElements,
          heartbeatPathIndices: paddedPathIndices,
          numHeartbeats: attestation.heartbeats.length.toString(),
          heartbeatMerkleRoot: attestation.heartbeatMerkleRoot,
        };

        // Generate groth16 proof
        spin.text = 'Generating ZK proof (this may take a minute)...';
        const snarkjs = require('snarkjs');
        const startTime = Date.now();

        const { proof, publicSignals } = await snarkjs.groth16.fullProve(
          circuitInput,
          wasmPath,
          zkeyPath,
        );

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

        // Format for Solidity
        spin.text = 'Formatting proof for on-chain submission...';
        const calldata = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
        const [pA, pB, pC, pubSignals] = JSON.parse(`[${calldata}]`);

        const proofOutput = {
          proof,
          publicSignals,
          solidity: { pA, pB, pC, pubSignals },
          meta: { workspaceHash, tierIndex, provingTimeMs: Date.now() - startTime },
        };

        // Write proof
        const outputDir = path.join(ws.path, 'attestation');
        fs.mkdirSync(outputDir, { recursive: true });
        const outputPath = path.join(outputDir, 'proof.json');
        fs.writeFileSync(outputPath, JSON.stringify(proofOutput, null, 2));

        spin.succeed(`ZK proof generated in ${elapsed}s`);
        console.log();
        ui.info(`Workspace hash: ${workspaceHash.toString().slice(0, 20)}...`);
        ui.info(`Tier: ${tierIndex}`);
        ui.info(`Public signals: ${publicSignals.length}`);
        console.log();
        ui.success(`Output: ${outputPath}`);
        ui.info('Next: lobstr airdrop submit-attestation');
        process.exit(0);
      } catch (err) {
        spin.fail('Failed to generate proof');
        ui.error((err as Error).message);
        process.exit(1);
      }
    });
}
