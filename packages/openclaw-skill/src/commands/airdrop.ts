import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { parseAbi, formatUnits, keccak256, encodePacked } from 'viem';
import {
  ensureWorkspace,
  createPublicClient,
  createWalletClient,
  getContractAddress,
  loadWallet,
  AIRDROP_CLAIM_V2_ABI,
  AttestationInput,
} from 'openclaw';
import * as ui from 'openclaw';
import { AIRDROP_TIERS, formatLob } from '../lib/format';

export function registerAirdropCommands(program: Command): void {
  const airdrop = program
    .command('airdrop')
    .description('Airdrop claim commands');

  airdrop
    .command('submit-attestation')
    .description('Submit ZK proof to claim airdrop')
    .option('--proof <path>', 'Path to proof JSON (from snarkjs)')
    .action(async (opts) => {
      try {
        const ws = ensureWorkspace();
        const airdropAbi = parseAbi(AIRDROP_CLAIM_V2_ABI as unknown as string[]);
        const airdropAddr = getContractAddress(ws.config, 'airdropClaimV2');

        // Read attestation input to show context
        const inputPath = path.join(ws.path, 'attestation', 'input.json');
        if (!fs.existsSync(inputPath)) {
          ui.error('No attestation found. Run: openclaw attestation generate');
          process.exit(1);
        }

        const attestation: AttestationInput = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));

        // Read proof file
        const proofPath = opts.proof || path.join(ws.path, 'attestation', 'proof.json');
        if (!fs.existsSync(proofPath)) {
          ui.error(`Proof file not found: ${proofPath}`);
          ui.info('Generate proof with: cd packages/circuits && pnpm prove');
          process.exit(1);
        }

        const proofData = JSON.parse(fs.readFileSync(proofPath, 'utf-8'));
        const { pA, pB, pC, pubSignals } = proofData.solidity || proofData;

        const publicClient = createPublicClient(ws.config);
        const { client: walletClient, address } = await createWalletClient(ws.config, ws.path);
        const workspaceHash = pubSignals[0];

        // A. Fetch IP approval from server
        const apiUrl = (ws.config as any).apiUrl || 'http://localhost:3000';
        const approvalSpin = ui.spinner('Requesting IP approval...');
        let approvalSig: string;
        try {
          const resp = await fetch(`${apiUrl}/api/airdrop/approve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address, workspaceHash: String(workspaceHash) }),
          });
          if (!resp.ok) {
            const err = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
            if (resp.status === 429) {
              approvalSpin.fail('IP already used for airdrop approval');
              process.exit(1);
            }
            throw new Error(err.error || `Approval failed: HTTP ${resp.status}`);
          }
          const data = await resp.json();
          approvalSig = data.signature;
          approvalSpin.succeed('IP approval received');
        } catch (err) {
          approvalSpin.fail((err as Error).message);
          process.exit(1);
        }

        // B. Compute PoW nonce
        const powSpin = ui.spinner('Computing proof-of-work nonce...');
        const DIFFICULTY_TARGET = await publicClient.readContract({
          address: airdropAddr,
          abi: airdropAbi,
          functionName: 'difficultyTarget',
        }) as bigint;
        let powNonce = 0n;
        const startTime = Date.now();
        while (true) {
          const hash = BigInt(keccak256(
            encodePacked(
              ['uint256', 'address', 'uint256'],
              [BigInt(workspaceHash), address as `0x${string}`, powNonce]
            )
          ));
          if (hash < DIFFICULTY_TARGET) break;
          powNonce++;
          if (powNonce % 10000n === 0n) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
            powSpin.text = `Computing PoW nonce... (${powNonce} iterations, ${elapsed}s)`;
          }
        }
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        powSpin.succeed(`PoW nonce found: ${powNonce} (${elapsed}s)`);

        // C. Submit proof with approval + PoW
        const spin = ui.spinner('Submitting proof on-chain...');

        const tx = await walletClient.writeContract({
          address: airdropAddr,
          abi: airdropAbi,
          functionName: 'submitProof',
          args: [pA, pB, pC, pubSignals, approvalSig, powNonce],
        });
        const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });

        spin.succeed('Proof submitted — airdrop claimed!');
        ui.info(`Claimant: ${attestation.claimantAddress}`);
        ui.info(`Uptime days: ${attestation.uptimeDays}`);
        ui.info(`Tx: ${tx}`);
        ui.info('Run "lobstr airdrop claim-info" to see your allocation');
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  airdrop
    .command('claim-info')
    .description('Check your airdrop claim status')
    .action(async () => {
      try {
        const ws = ensureWorkspace();
        const airdropAbi = parseAbi(AIRDROP_CLAIM_V2_ABI as unknown as string[]);
        const airdropAddr = getContractAddress(ws.config, 'airdropClaimV2');

        const publicClient = createPublicClient(ws.config);
        const wallet = loadWallet(ws.path);
        const address = wallet.address as `0x${string}`;

        const spin = ui.spinner('Fetching claim info...');

        const info = await publicClient.readContract({
          address: airdropAddr,
          abi: airdropAbi,
          functionName: 'getClaimInfo',
          args: [address],
        }) as any;

        spin.succeed('Claim Info');
        console.log(`  Address:    ${address}`);
        console.log(`  Claimed:    ${info.claimed ? 'Yes' : 'No'}`);

        if (info.claimed) {
          console.log(`  Tier:       ${AIRDROP_TIERS[Number(info.tier)] || 'Unknown'}`);
          console.log(`  Total:      ${formatLob(info.amount)}`);
          console.log(`  Vested:     ${formatLob(info.vestedAmount)}`);
          console.log(`  Claimed at: ${new Date(Number(info.claimedAt) * 1000).toISOString()}`);

          // Calculate vesting progress
          const vestingDuration = 180 * 24 * 3600; // 180 days in seconds
          const elapsed = Math.floor(Date.now() / 1000) - Number(info.claimedAt);
          const progress = Math.min(100, Math.floor((elapsed / vestingDuration) * 100));
          console.log(`  Vesting:    ${progress}% (${Math.floor(elapsed / 86400)} / 180 days)`);

          if (info.vestedAmount > 0n) {
            ui.info('Run "lobstr airdrop release" to claim vested tokens');
          }
        } else {
          ui.info('Not claimed yet. Run "openclaw attestation generate" first');
        }
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  airdrop
    .command('release')
    .description('Release vested airdrop tokens')
    .action(async () => {
      try {
        const ws = ensureWorkspace();
        const airdropAbi = parseAbi(AIRDROP_CLAIM_V2_ABI as unknown as string[]);
        const airdropAddr = getContractAddress(ws.config, 'airdropClaimV2');

        const spin = ui.spinner('Releasing vested tokens...');
        const publicClient = createPublicClient(ws.config);
        const { client: walletClient } = await createWalletClient(ws.config, ws.path);

        const tx = await walletClient.writeContract({
          address: airdropAddr,
          abi: airdropAbi,
          functionName: 'releaseVestedTokens',
          args: [],
        });
        await publicClient.waitForTransactionReceipt({ hash: tx });

        spin.succeed('Vested tokens released');
        ui.info(`Tx: ${tx}`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });
}
