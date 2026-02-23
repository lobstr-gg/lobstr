import { Command } from 'commander';
import { parseAbi, parseUnits } from 'viem';
import {
  ensureWorkspace,
  createPublicClient,
  createWalletClient,
  getContractAddress,
  loadWallet,
} from 'openclaw';
import * as ui from 'openclaw';
import { formatLob } from '../lib/format';

const LIQUIDITY_MINING_ABI = parseAbi([
  'function stakeLp(uint256 amount)',
  'function unstakeLp(uint256 amount)',
  'function claimFarmRewards()',
  'function earned(address account) view returns (uint256)',
  'function getStakeInfo(address account) view returns (uint256 staked, uint256 earned, uint256 rewardRate)',
  'function totalStaked() view returns (uint256)',
]);

export function registerFarmingCommands(program: Command): void {
  const farming = program
    .command('farming')
    .description('Liquidity mining / yield farming commands');

  // ── stake-lp ────────────────────────────────────────

  farming
    .command('stake-lp <amount>')
    .description('Stake LP tokens (approve first)')
    .action(async (amount: string) => {
      try {
        const ws = ensureWorkspace();
        const publicClient = createPublicClient(ws.config);
        const { client: walletClient } = await createWalletClient(ws.config, ws.path);
        const farmAddr = getContractAddress(ws.config, 'liquidityMining');

        const parsedAmount = parseUnits(amount, 18);

        const spin = ui.spinner('Staking LP tokens...');
        const tx = await walletClient.writeContract({
          address: farmAddr,
          abi: LIQUIDITY_MINING_ABI,
          functionName: 'stakeLp',
          args: [parsedAmount],
        });
        await publicClient.waitForTransactionReceipt({ hash: tx });

        spin.succeed(`Staked ${amount} LP tokens`);
        ui.info(`Tx: ${tx}`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  // ── unstake-lp ──────────────────────────────────────

  farming
    .command('unstake-lp <amount>')
    .description('Unstake LP tokens')
    .action(async (amount: string) => {
      try {
        const ws = ensureWorkspace();
        const publicClient = createPublicClient(ws.config);
        const { client: walletClient } = await createWalletClient(ws.config, ws.path);
        const farmAddr = getContractAddress(ws.config, 'liquidityMining');

        const parsedAmount = parseUnits(amount, 18);

        const spin = ui.spinner('Unstaking LP tokens...');
        const tx = await walletClient.writeContract({
          address: farmAddr,
          abi: LIQUIDITY_MINING_ABI,
          functionName: 'unstakeLp',
          args: [parsedAmount],
        });
        await publicClient.waitForTransactionReceipt({ hash: tx });

        spin.succeed(`Unstaked ${amount} LP tokens`);
        ui.info(`Tx: ${tx}`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  // ── claim ───────────────────────────────────────────

  farming
    .command('claim')
    .description('Claim farming rewards')
    .action(async () => {
      try {
        const ws = ensureWorkspace();
        const publicClient = createPublicClient(ws.config);
        const { client: walletClient } = await createWalletClient(ws.config, ws.path);
        const farmAddr = getContractAddress(ws.config, 'liquidityMining');

        const spin = ui.spinner('Claiming farming rewards...');
        const tx = await walletClient.writeContract({
          address: farmAddr,
          abi: LIQUIDITY_MINING_ABI,
          functionName: 'claimFarmRewards',
        });
        await publicClient.waitForTransactionReceipt({ hash: tx });

        spin.succeed('Farming rewards claimed');
        ui.info(`Tx: ${tx}`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  // ── status ──────────────────────────────────────────

  farming
    .command('status')
    .description('View staked amount, earned, and reward rate')
    .action(async () => {
      try {
        const ws = ensureWorkspace();
        const publicClient = createPublicClient(ws.config);
        const wallet = loadWallet(ws.path);
        const address = wallet.address as `0x${string}`;
        const farmAddr = getContractAddress(ws.config, 'liquidityMining');

        const spin = ui.spinner('Fetching farming status...');

        const [stakeInfoResult, totalStaked] = await Promise.all([
          publicClient.readContract({
            address: farmAddr,
            abi: LIQUIDITY_MINING_ABI,
            functionName: 'getStakeInfo',
            args: [address],
          }) as Promise<any>,
          publicClient.readContract({
            address: farmAddr,
            abi: LIQUIDITY_MINING_ABI,
            functionName: 'totalStaked',
          }) as Promise<bigint>,
        ]);

        const stakeInfo = {
          staked: stakeInfoResult.staked ?? stakeInfoResult[0],
          earned: stakeInfoResult.earned ?? stakeInfoResult[1],
          rewardRate: stakeInfoResult.rewardRate ?? stakeInfoResult[2],
        };

        spin.succeed('Farming Status');
        console.log(`  Staked:       ${formatLob(stakeInfo.staked)}`);
        console.log(`  Earned:       ${formatLob(stakeInfo.earned)}`);
        console.log(`  Reward rate:  ${formatLob(stakeInfo.rewardRate)}/s`);
        console.log(`  Total staked: ${formatLob(totalStaked)}`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });
}
