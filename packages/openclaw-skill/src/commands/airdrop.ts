import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { parseAbi, keccak256, encodePacked } from 'viem';
import {
  ensureWorkspace,
  createPublicClient,
  createWalletClient,
  getContractAddress,
  loadWallet,
  AIRDROP_CLAIM_V3_ABI,
  AttestationInput,
} from 'openclaw';
import * as ui from 'openclaw';
import { formatLob, MILESTONE_NAMES, MILESTONE_DESC } from '../lib/format';

export function registerAirdropCommands(program: Command): void {
  const airdrop = program
    .command('airdrop')
    .description('Airdrop claim commands');

  airdrop
    .command('submit-attestation')
    .description('Submit ZK proof to claim airdrop (V3)')
    .option('--proof <path>', 'Path to proof JSON (from snarkjs)')
    .action(async (opts) => {
      try {
        const ws = ensureWorkspace();
        const airdropAbi = parseAbi(AIRDROP_CLAIM_V3_ABI as unknown as string[]);
        const airdropAddr = getContractAddress(ws.config, 'airdropClaimV3');

        // Read attestation input to show context
        const inputPath = path.join(ws.path, 'attestation', 'input.json');
        if (!fs.existsSync(inputPath)) {
          ui.error('No attestation found. Run: lobstr attestation generate');
          process.exit(1);
        }

        const attestation: AttestationInput = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));

        // Read proof file
        const proofPath = opts.proof || path.join(ws.path, 'attestation', 'proof.json');
        if (!fs.existsSync(proofPath)) {
          ui.error(`Proof file not found: ${proofPath}`);
          ui.info('Generate proof with: lobstr attestation prove');
          process.exit(1);
        }

        const proofData = JSON.parse(fs.readFileSync(proofPath, 'utf-8'));
        const { pA, pB, pC, pubSignals } = proofData.solidity || proofData;

        const publicClient = createPublicClient(ws.config);
        const { client: walletClient, address } = await createWalletClient(ws.config, ws.path);

        // A. Two-step V3 approval: attest → approve
        const apiUrl = (ws.config as any).apiUrl || 'https://lobstr.gg';

        // A1. Request attestation (registers address + tier, returns nonce)
        const attestSpin = ui.spinner('Requesting attestation...');
        let attestNonce: string;
        try {
          // Determine tier from proof metadata
          const tier = proofData.meta?.tierIndex ?? 0;
          const resp = await fetch(`${apiUrl}/api/airdrop/v3/attest`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address, tier }),
          });
          if (!resp.ok) {
            const err = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
            throw new Error(err.error || `Attestation failed: HTTP ${resp.status}`);
          }
          const data = await resp.json();
          attestNonce = data.nonce;
          attestSpin.succeed(`Attestation registered (nonce: ${attestNonce.slice(0, 10)}...)`);
        } catch (err) {
          attestSpin.fail((err as Error).message);
          process.exit(1);
        }

        // A2. Request IP approval (one per IP, returns signature for on-chain claim)
        const approvalSpin = ui.spinner('Requesting IP approval...');
        let approvalSig: string;
        try {
          const resp = await fetch(`${apiUrl}/api/airdrop/v3/approve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address, nonce: attestNonce }),
          });
          if (!resp.ok) {
            const err = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
            if (resp.status === 403) {
              approvalSpin.fail('IP banned from airdrop');
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

        // B. Compute PoW nonce — V3: keccak256(abi.encodePacked(sender, merkleRoot, nonce))
        const powSpin = ui.spinner('Computing proof-of-work nonce...');
        const merkleRoot = await publicClient.readContract({
          address: airdropAddr,
          abi: airdropAbi,
          functionName: 'getMerkleRoot',
        }) as bigint;
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
              ['address', 'uint256', 'uint256'],
              [address as `0x${string}`, merkleRoot, powNonce]
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

        // C. Submit proof — V3: claim() not submitProof(), pubSignals is uint256[2]
        const spin = ui.spinner('Submitting proof on-chain...');

        const tx = await walletClient.writeContract({
          address: airdropAddr,
          abi: airdropAbi,
          functionName: 'claim',
          args: [pA, pB, pC, pubSignals, approvalSig, powNonce],
        });
        await publicClient.waitForTransactionReceipt({ hash: tx });

        spin.succeed('Proof submitted — airdrop claimed!');
        ui.info(`Claimant: ${attestation.claimantAddress}`);
        ui.info(`Tx: ${tx}`);
        ui.info('Run "lobstr airdrop claim-info" to see your allocation');
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  // Shared handler for status/claim-info
  const claimInfoHandler = async () => {
    try {
      const ws = ensureWorkspace();
      const airdropAbi = parseAbi(AIRDROP_CLAIM_V3_ABI as unknown as string[]);
      const airdropAddr = getContractAddress(ws.config, 'airdropClaimV3');

      const publicClient = createPublicClient(ws.config);
      const wallet = loadWallet(ws.path);
      const address = wallet.address as `0x${string}`;

      const spin = ui.spinner('Fetching claim info...');

      const result = await publicClient.readContract({
        address: airdropAddr,
        abi: airdropAbi,
        functionName: 'getClaimInfo',
        args: [address],
      }) as any;

      const info = {
        claimed: result[0] as boolean,
        released: result[1] as bigint,
        milestonesCompleted: result[2] as bigint,
        claimedAt: result[3] as bigint,
      };

      spin.succeed('Claim Info');
      console.log(`  Address:     ${address}`);
      console.log(`  Claimed:     ${info.claimed ? 'Yes' : 'No'}`);

      if (info.claimed) {
        console.log(`  Released:    ${formatLob(info.released)} / 6,000 LOB`);
        console.log(`  Claimed at:  ${new Date(Number(info.claimedAt) * 1000).toISOString()}`);

        // Decode milestone bitmask
        const bitmask = Number(info.milestonesCompleted);
        const completed = [];
        const pending = [];
        for (let i = 0; i < 5; i++) {
          if (bitmask & (1 << i)) {
            completed.push(MILESTONE_NAMES[i]);
          } else {
            pending.push(MILESTONE_NAMES[i]);
          }
        }
        console.log(`  Milestones:  ${completed.length}/5 complete`);
        for (let i = 0; i < 5; i++) {
          const done = !!(bitmask & (1 << i));
          console.log(`    [${done ? 'x' : ' '}] ${MILESTONE_NAMES[i]} — ${MILESTONE_DESC[i]}`);
        }

        if (pending.length > 0) {
          console.log();
          ui.info('Complete milestones to unlock more LOB (1,000 each):');
          ui.info('  lobstr airdrop milestone list');
        }
      } else {
        ui.info('Not claimed yet. Run "lobstr attestation generate" first');
      }
    } catch (err) {
      ui.error((err as Error).message);
      process.exit(1);
    }
  };

  airdrop
    .command('status')
    .description('Check your airdrop claim status')
    .action(claimInfoHandler);

  airdrop
    .command('claim-info')
    .description('Check your airdrop claim status (alias for status)')
    .action(claimInfoHandler);

  airdrop
    .command('stats')
    .description('View airdrop stats (total claimed, claim window, pool usage)')
    .action(async () => {
      try {
        const ws = ensureWorkspace();
        const airdropAbi = parseAbi(AIRDROP_CLAIM_V3_ABI as unknown as string[]);
        const airdropAddr = getContractAddress(ws.config, 'airdropClaimV3');

        const publicClient = createPublicClient(ws.config);
        const spin = ui.spinner('Fetching airdrop stats...');

        const [totalClaimed, windowEnd, maxPool, lobBalance] = await Promise.all([
          publicClient.readContract({
            address: airdropAddr,
            abi: airdropAbi,
            functionName: 'totalClaimed',
          }) as Promise<bigint>,
          publicClient.readContract({
            address: airdropAddr,
            abi: airdropAbi,
            functionName: 'claimWindowEnd',
          }) as Promise<bigint>,
          publicClient.readContract({
            address: airdropAddr,
            abi: airdropAbi,
            functionName: 'maxAirdropPool',
          }) as Promise<bigint>,
          publicClient.readContract({
            address: getContractAddress(ws.config, 'lobToken'),
            abi: parseAbi(['function balanceOf(address) view returns (uint256)'] as unknown as string[]),
            functionName: 'balanceOf',
            args: [airdropAddr],
          }) as Promise<bigint>,
        ]);

        const now = Math.floor(Date.now() / 1000);
        const isOpen = now <= Number(windowEnd);
        const daysLeft = isOpen ? Math.ceil((Number(windowEnd) - now) / 86400) : 0;

        spin.succeed('Airdrop Stats');
        console.log(`  Contract:       ${airdropAddr}`);
        console.log(`  Total claimed:  ${formatLob(totalClaimed)}`);
        console.log(`  Pool max:       ${formatLob(maxPool)}`);
        console.log(`  Pool remaining: ${formatLob(lobBalance)}`);
        console.log(`  Window end:     ${new Date(Number(windowEnd) * 1000).toISOString().split('T')[0]}`);
        console.log(`  Status:         ${isOpen ? `Open (${daysLeft} days left)` : 'Closed'}`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  // ── milestone subcommands ────────────────────────────

  const milestone = airdrop
    .command('milestone')
    .description('Airdrop milestone commands');

  milestone
    .command('list')
    .description('View milestone progress')
    .action(async () => {
      try {
        const ws = ensureWorkspace();
        const airdropAbi = parseAbi(AIRDROP_CLAIM_V3_ABI as unknown as string[]);
        const airdropAddr = getContractAddress(ws.config, 'airdropClaimV3');
        const publicClient = createPublicClient(ws.config);
        const wallet = loadWallet(ws.path);
        const address = wallet.address as `0x${string}`;

        const spin = ui.spinner('Fetching milestones...');

        // Fetch claim info + individual milestone checks in parallel
        const [claimResult, ...milestoneResults] = await Promise.all([
          publicClient.readContract({
            address: airdropAddr,
            abi: airdropAbi,
            functionName: 'getClaimInfo',
            args: [address],
          }),
          ...Array.from({ length: 5 }, (_, i) =>
            publicClient.readContract({
              address: airdropAddr,
              abi: airdropAbi,
              functionName: 'isMilestoneComplete',
              args: [address, i],
            })
          ),
        ]) as [any, ...boolean[]];

        const claimed = claimResult[0] as boolean;
        if (!claimed) {
          spin.succeed('Milestones');
          ui.info('You have not claimed the airdrop yet.');
          ui.info('Run "lobstr attestation generate" to start');
          return;
        }

        spin.succeed('Milestones');
        ui.table(
          ['#', 'Name', 'Description', 'Status'],
          Array.from({ length: 5 }, (_, i) => [
            i.toString(),
            MILESTONE_NAMES[i],
            MILESTONE_DESC[i],
            milestoneResults[i] ? 'Done' : 'Pending',
          ])
        );

        const doneCount = milestoneResults.filter(Boolean).length;
        console.log();
        ui.info(`${doneCount}/5 milestones complete`);
        if (doneCount < 5) {
          ui.info('Complete a milestone: lobstr airdrop milestone complete <0-4>');
        }
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  milestone
    .command('complete <milestone>')
    .description('Complete a milestone to unlock 1,000 LOB (0=JobComplete, 1=ServiceListed, 2=StakeActive, 3=ReputationEarned, 4=GovernanceVote)')
    .action(async (milestoneStr: string) => {
      try {
        const milestoneIndex = parseInt(milestoneStr, 10);
        if (isNaN(milestoneIndex) || milestoneIndex < 0 || milestoneIndex > 4) {
          ui.error(`Invalid milestone: ${milestoneStr}. Must be 0-4`);
          for (let i = 0; i < 5; i++) {
            ui.info(`  ${i}: ${MILESTONE_NAMES[i]} — ${MILESTONE_DESC[i]}`);
          }
          process.exit(1);
        }

        const ws = ensureWorkspace();
        const airdropAbi = parseAbi(AIRDROP_CLAIM_V3_ABI as unknown as string[]);
        const airdropAddr = getContractAddress(ws.config, 'airdropClaimV3');
        const publicClient = createPublicClient(ws.config);
        const wallet = loadWallet(ws.path);
        const address = wallet.address as `0x${string}`;

        const spin = ui.spinner(`Completing milestone: ${MILESTONE_NAMES[milestoneIndex]}...`);

        // Check if already complete
        const alreadyDone = await publicClient.readContract({
          address: airdropAddr,
          abi: airdropAbi,
          functionName: 'isMilestoneComplete',
          args: [address, milestoneIndex],
        }) as boolean;

        if (alreadyDone) {
          spin.succeed(`Milestone ${MILESTONE_NAMES[milestoneIndex]} already complete`);
          return;
        }

        const { client: walletClient } = await createWalletClient(ws.config, ws.path);

        const tx = await walletClient.writeContract({
          address: airdropAddr,
          abi: airdropAbi,
          functionName: 'completeMilestone',
          args: [address, milestoneIndex],
        });
        await publicClient.waitForTransactionReceipt({ hash: tx });

        spin.succeed(`Milestone ${MILESTONE_NAMES[milestoneIndex]} completed!`);
        ui.info('Reward: 1,000 LOB released');
        ui.info(`Tx: ${tx}`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });
}
