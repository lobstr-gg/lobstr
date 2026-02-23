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

// Resolve circuit files — checks workspace, Docker, and dev paths
function resolveCircuitPath(filename: string): string {
  let wsPath: string | undefined;
  try { wsPath = path.join(ensureWorkspace().path, 'circuits', filename); } catch {}
  const candidates = [
    ...(wsPath ? [wsPath] : []),
    path.join('/opt/lobstr/circuits', filename),
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
  // Downloads ptau and generates zkey from r1cs (trusted setup).
  // Each agent runs their own ceremony.

  att.command('setup')
    .description('Run trusted setup — download ptau and generate your own zkey')
    .option('--force', 'Re-generate even if zkey already exists')
    .action(async (opts) => {
      const spin = ui.spinner('Starting trusted setup...');
      try {
        // Use writable directory (workspace/circuits in Docker, circuits/build in dev)
        const circuitsDir = writableCircuitsDir();

        const r1csPath = resolveCircuitPath('airdropAttestation.r1cs');
        const zkeyPath = path.join(circuitsDir, 'airdropAttestation_0001.zkey');
        const ptauPath = path.join(circuitsDir, 'powersOfTau28_hez_final_17.ptau');

        // Check if zkey already exists
        if (fs.existsSync(zkeyPath) && !opts.force) {
          spin.succeed('zkey already exists');
          ui.info(`Path: ${zkeyPath}`);
          ui.info('Use --force to re-generate');
          return;
        }

        // Download ptau if not already cached
        if (!fs.existsSync(ptauPath)) {
          spin.text = 'Downloading powers of tau (144MB)...';
          await new Promise<void>((resolve, reject) => {
            const follow = (url: string) => {
              https.get(url, (res) => {
                if (res.statusCode === 301 || res.statusCode === 302) {
                  follow(res.headers.location!);
                  return;
                }
                if (res.statusCode !== 200) {
                  reject(new Error(`Download failed: HTTP ${res.statusCode}`));
                  return;
                }
                const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
                let downloaded = 0;
                const tmpPath = ptauPath + '.tmp';
                const file = fs.createWriteStream(tmpPath);
                res.on('data', (chunk: Buffer) => {
                  downloaded += chunk.length;
                  if (totalBytes > 0) {
                    const pct = Math.floor((downloaded / totalBytes) * 100);
                    spin.text = `Downloading powers of tau... ${pct}% (${Math.floor(downloaded / 1048576)}MB)`;
                  }
                });
                res.pipe(file);
                file.on('finish', () => {
                  file.close();
                  fs.renameSync(tmpPath, ptauPath);
                  resolve();
                });
                file.on('error', (err) => {
                  fs.unlinkSync(tmpPath);
                  reject(err);
                });
              }).on('error', reject);
            };
            follow(PTAU_URL);
          });
          spin.text = 'Powers of tau downloaded';
        } else {
          ui.info('ptau already cached, skipping download');
        }

        // Run groth16 setup
        spin.text = 'Running groth16 setup (this may take a few minutes)...';
        const snarkjs = require('snarkjs');
        const startTime = Date.now();

        await snarkjs.zKey.newZKey(r1csPath, ptauPath, zkeyPath);

        // Contribute to the ceremony (agent's own entropy)
        spin.text = 'Contributing to ceremony...';
        const contributedPath = zkeyPath.replace('.zkey', '_final.zkey');
        const entropy = crypto.randomBytes(32).toString('hex');
        await snarkjs.zKey.contribute(zkeyPath, contributedPath, 'agent-contribution', entropy);

        // Replace initial zkey with contributed one
        fs.unlinkSync(zkeyPath);
        fs.renameSync(contributedPath, zkeyPath);

        // Export verification key
        spin.text = 'Exporting verification key...';
        const vkeyPath = path.join(circuitsDir, 'verification_key.json');
        const vkey = await snarkjs.zKey.exportVerificationKey(zkeyPath);
        fs.writeFileSync(vkeyPath, JSON.stringify(vkey, null, 2));

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

        // Clean up ptau to save disk space
        spin.text = 'Cleaning up ptau...';
        fs.unlinkSync(ptauPath);

        spin.succeed(`Trusted setup complete in ${elapsed}s`);
        console.log();
        ui.info(`zkey: ${zkeyPath}`);
        ui.info(`vkey: ${vkeyPath}`);
        ui.info(`r1cs: ${r1csPath}`);
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
