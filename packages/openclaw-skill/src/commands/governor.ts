import { Command } from 'commander';
import { parseAbi, type Address } from 'viem';
import {
  ensureWorkspace,
  createPublicClient,
  createWalletClient,
  getContractAddress,
} from 'openclaw';
import * as ui from 'openclaw';
import { formatLob, LIGHTNING_PROPOSAL_TYPE, LIGHTNING_PROPOSAL_STATUS } from '../lib/format';

const LIGHTNING_GOVERNOR_ABI = parseAbi([
  'function propose(string description, address target, bytes calldata_, uint8 proposalType) returns (uint256)',
  'function castVote(uint256 proposalId, bool support)',
  'function execute(uint256 proposalId)',
  'function cancel(uint256 proposalId)',
  'function getProposal(uint256 proposalId) view returns (uint256 id, address proposer, string description, address target, bytes calldataHash, uint8 proposalType, uint8 status, uint256 forVotes, uint256 againstVotes, uint256 deadline)',
  'function proposalCount() view returns (uint256)',
]);

const PROPOSAL_TYPE_MAP: Record<string, number> = {
  'standard': 0,
  'fast-track': 1,
  'emergency': 2,
};

export function registerGovernorCommands(program: Command): void {
  const governor = program
    .command('governor')
    .description('Lightning governor commands');

  // ── propose ─────────────────────────────────────────

  governor
    .command('propose')
    .description('Create a governance proposal')
    .requiredOption('--description <desc>', 'Proposal description')
    .requiredOption('--target <addr>', 'Target contract address')
    .requiredOption('--calldata <hex>', 'Encoded calldata (0x...)')
    .requiredOption('--type <standard|fast-track|emergency>', 'Proposal type')
    .action(async (opts) => {
      try {
        const ws = ensureWorkspace();
        const publicClient = createPublicClient(ws.config);
        const { client: walletClient } = await createWalletClient(ws.config, ws.path);
        const govAddr = getContractAddress(ws.config, 'lightningGovernor');

        const proposalType = PROPOSAL_TYPE_MAP[opts.type];
        if (proposalType === undefined) {
          ui.error(`Invalid proposal type: ${opts.type}. Use: standard, fast-track, emergency`);
          process.exit(1);
        }

        const spin = ui.spinner('Creating proposal...');
        const tx = await walletClient.writeContract({
          address: govAddr,
          abi: LIGHTNING_GOVERNOR_ABI,
          functionName: 'propose',
          args: [
            opts.description,
            opts.target as Address,
            opts.calldata as `0x${string}`,
            proposalType,
          ],
        });
        await publicClient.waitForTransactionReceipt({ hash: tx });

        spin.succeed('Proposal created');
        ui.info(`Type: ${LIGHTNING_PROPOSAL_TYPE[proposalType]}`);
        ui.info(`Target: ${opts.target}`);
        ui.info(`Tx: ${tx}`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  // ── vote ────────────────────────────────────────────

  governor
    .command('vote <id>')
    .description('Cast a vote on a proposal')
    .requiredOption('--support <yes|no>', 'Vote support (yes or no)')
    .action(async (id: string, opts) => {
      try {
        const ws = ensureWorkspace();
        const publicClient = createPublicClient(ws.config);
        const { client: walletClient } = await createWalletClient(ws.config, ws.path);
        const govAddr = getContractAddress(ws.config, 'lightningGovernor');

        const support = opts.support.toLowerCase() === 'yes';

        const spin = ui.spinner(`Voting ${support ? 'FOR' : 'AGAINST'} proposal #${id}...`);
        const tx = await walletClient.writeContract({
          address: govAddr,
          abi: LIGHTNING_GOVERNOR_ABI,
          functionName: 'castVote',
          args: [BigInt(id), support],
        });
        await publicClient.waitForTransactionReceipt({ hash: tx });

        spin.succeed(`Voted ${support ? 'FOR' : 'AGAINST'} proposal #${id}`);
        ui.info(`Tx: ${tx}`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  // ── execute ─────────────────────────────────────────

  governor
    .command('execute <id>')
    .description('Execute a passed proposal')
    .action(async (id: string) => {
      try {
        const ws = ensureWorkspace();
        const publicClient = createPublicClient(ws.config);
        const { client: walletClient } = await createWalletClient(ws.config, ws.path);
        const govAddr = getContractAddress(ws.config, 'lightningGovernor');

        const spin = ui.spinner(`Executing proposal #${id}...`);
        const tx = await walletClient.writeContract({
          address: govAddr,
          abi: LIGHTNING_GOVERNOR_ABI,
          functionName: 'execute',
          args: [BigInt(id)],
        });
        await publicClient.waitForTransactionReceipt({ hash: tx });

        spin.succeed(`Proposal #${id} executed`);
        ui.info(`Tx: ${tx}`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  // ── cancel ─────────────────────────────────────────

  governor
    .command('cancel <id>')
    .description('Cancel a proposal (proposer or guardian only)')
    .action(async (id: string) => {
      try {
        const ws = ensureWorkspace();
        const publicClient = createPublicClient(ws.config);
        const { client: walletClient } = await createWalletClient(ws.config, ws.path);
        const govAddr = getContractAddress(ws.config, 'lightningGovernor');

        const spin = ui.spinner(`Cancelling proposal #${id}...`);
        const tx = await walletClient.writeContract({
          address: govAddr,
          abi: LIGHTNING_GOVERNOR_ABI,
          functionName: 'cancel',
          args: [BigInt(id)],
        });
        await publicClient.waitForTransactionReceipt({ hash: tx });

        spin.succeed(`Proposal #${id} cancelled`);
        ui.info(`Tx: ${tx}`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  // ── list ────────────────────────────────────────────

  governor
    .command('list')
    .description('List active proposals')
    .action(async () => {
      try {
        const ws = ensureWorkspace();
        const publicClient = createPublicClient(ws.config);
        const govAddr = getContractAddress(ws.config, 'lightningGovernor');

        const spin = ui.spinner('Loading proposals...');

        const count = await publicClient.readContract({
          address: govAddr,
          abi: LIGHTNING_GOVERNOR_ABI,
          functionName: 'proposalCount',
        }) as bigint;

        if (count === 0n) {
          spin.succeed('No proposals found');
          return;
        }

        const proposals: any[] = [];
        for (let i = 1n; i <= count; i++) {
          try {
            const result = await publicClient.readContract({
              address: govAddr,
              abi: LIGHTNING_GOVERNOR_ABI,
              functionName: 'getProposal',
              args: [i],
            }) as any;

            proposals.push({
              id: result.id ?? result[0],
              proposer: result.proposer ?? result[1],
              description: result.description ?? result[2],
              target: result.target ?? result[3],
              calldataHash: result.calldataHash ?? result[4],
              proposalType: result.proposalType ?? result[5],
              status: result.status ?? result[6],
              forVotes: result.forVotes ?? result[7],
              againstVotes: result.againstVotes ?? result[8],
              deadline: result.deadline ?? result[9],
            });
          } catch {
            break;
          }
        }

        spin.succeed(`${proposals.length} proposal(s)`);
        ui.table(
          ['ID', 'Type', 'Proposer', 'For', 'Against', 'Status', 'Deadline'],
          proposals.map((p: any) => [
            p.id.toString(),
            LIGHTNING_PROPOSAL_TYPE[Number(p.proposalType)] || 'Unknown',
            p.proposer.slice(0, 10) + '...',
            formatLob(p.forVotes),
            formatLob(p.againstVotes),
            LIGHTNING_PROPOSAL_STATUS[Number(p.status)] || 'Unknown',
            new Date(Number(p.deadline) * 1000).toLocaleDateString(),
          ])
        );
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });
}
