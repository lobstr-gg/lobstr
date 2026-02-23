import { Command } from 'commander';
import { parseAbi } from 'viem';
import {
  ensureWorkspace,
  createPublicClient,
  createWalletClient,
  getContractAddress,
  loadWallet,
  STAKING_REWARDS_ABI,
  REWARD_DISTRIBUTOR_ABI,
} from 'openclaw';
import * as ui from 'openclaw';
import { formatLob } from '../lib/format';

const stakingRewardsAbi = parseAbi(STAKING_REWARDS_ABI as unknown as string[]);
const rewardDistributorAbi = parseAbi(REWARD_DISTRIBUTOR_ABI as unknown as string[]);

export function registerRewardsCommands(program: Command): void {
  const rewards = program
    .command('rewards')
    .description('Staking rewards and distribution commands');

  // ── status ──────────────────────────────────────────

  rewards
    .command('status')
    .description('Show earned rewards from StakingRewards and RewardDistributor')
    .action(async () => {
      try {
        const ws = ensureWorkspace();
        const publicClient = createPublicClient(ws.config);
        const wallet = loadWallet(ws.path);
        const address = wallet.address as `0x${string}`;

        const stakingRewardsAddr = getContractAddress(ws.config, 'stakingRewards');
        const distributorAddr = getContractAddress(ws.config, 'rewardDistributor');
        const lobToken = getContractAddress(ws.config, 'lobToken');

        const spin = ui.spinner('Fetching reward status...');

        const [earned, effectiveBalance, totalEffective, rewardPerToken, claimable, totalDistributed, availableBudget] = await Promise.all([
          publicClient.readContract({
            address: stakingRewardsAddr,
            abi: stakingRewardsAbi,
            functionName: 'earned',
            args: [address, lobToken],
          }) as Promise<bigint>,
          publicClient.readContract({
            address: stakingRewardsAddr,
            abi: stakingRewardsAbi,
            functionName: 'getEffectiveBalance',
            args: [address],
          }) as Promise<bigint>,
          publicClient.readContract({
            address: stakingRewardsAddr,
            abi: stakingRewardsAbi,
            functionName: 'getTotalEffectiveBalance',
          }) as Promise<bigint>,
          publicClient.readContract({
            address: stakingRewardsAddr,
            abi: stakingRewardsAbi,
            functionName: 'rewardPerToken',
            args: [lobToken],
          }) as Promise<bigint>,
          publicClient.readContract({
            address: distributorAddr,
            abi: rewardDistributorAbi,
            functionName: 'claimableBalance',
            args: [address, lobToken],
          }) as Promise<bigint>,
          publicClient.readContract({
            address: distributorAddr,
            abi: rewardDistributorAbi,
            functionName: 'totalDistributed',
          }) as Promise<bigint>,
          publicClient.readContract({
            address: distributorAddr,
            abi: rewardDistributorAbi,
            functionName: 'availableBudget',
            args: [lobToken],
          }) as Promise<bigint>,
        ]);

        spin.succeed('Reward Status');
        console.log('  --- StakingRewards ---');
        console.log(`  Earned (LOB):      ${formatLob(earned)}`);
        console.log(`  Effective balance: ${formatLob(effectiveBalance)}`);
        console.log(`  Total effective:   ${formatLob(totalEffective)}`);
        console.log(`  Reward/token:      ${formatLob(rewardPerToken)}`);
        console.log('  --- RewardDistributor ---');
        console.log(`  Claimable (LOB):   ${formatLob(claimable)}`);
        console.log(`  Total distributed: ${formatLob(totalDistributed)}`);
        console.log(`  Available budget:  ${formatLob(availableBudget)}`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  // ── claim ───────────────────────────────────────────

  rewards
    .command('claim')
    .description('Claim from both StakingRewards and RewardDistributor')
    .action(async () => {
      try {
        const ws = ensureWorkspace();
        const publicClient = createPublicClient(ws.config);
        const { client: walletClient } = await createWalletClient(ws.config, ws.path);

        const stakingRewardsAddr = getContractAddress(ws.config, 'stakingRewards');
        const distributorAddr = getContractAddress(ws.config, 'rewardDistributor');
        const lobToken = getContractAddress(ws.config, 'lobToken');

        const spin = ui.spinner('Claiming staking rewards...');
        const tx1 = await walletClient.writeContract({
          address: stakingRewardsAddr,
          abi: stakingRewardsAbi,
          functionName: 'claimRewards',
          args: [lobToken],
        });
        await publicClient.waitForTransactionReceipt({ hash: tx1 });

        spin.text = 'Claiming distributor rewards...';
        const tx2 = await walletClient.writeContract({
          address: distributorAddr,
          abi: rewardDistributorAbi,
          functionName: 'claim',
          args: [lobToken],
        });
        await publicClient.waitForTransactionReceipt({ hash: tx2 });

        spin.succeed('All rewards claimed');
        ui.info(`StakingRewards tx: ${tx1}`);
        ui.info(`RewardDistributor tx: ${tx2}`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  // ── pending ─────────────────────────────────────────

  rewards
    .command('pending')
    .description('Show pending amounts from both reward sources')
    .action(async () => {
      try {
        const ws = ensureWorkspace();
        const publicClient = createPublicClient(ws.config);
        const wallet = loadWallet(ws.path);
        const address = wallet.address as `0x${string}`;

        const stakingRewardsAddr = getContractAddress(ws.config, 'stakingRewards');
        const distributorAddr = getContractAddress(ws.config, 'rewardDistributor');
        const lobToken = getContractAddress(ws.config, 'lobToken');

        const spin = ui.spinner('Fetching pending rewards...');

        const [earned, claimable] = await Promise.all([
          publicClient.readContract({
            address: stakingRewardsAddr,
            abi: stakingRewardsAbi,
            functionName: 'earned',
            args: [address, lobToken],
          }) as Promise<bigint>,
          publicClient.readContract({
            address: distributorAddr,
            abi: rewardDistributorAbi,
            functionName: 'claimableBalance',
            args: [address, lobToken],
          }) as Promise<bigint>,
        ]);

        spin.succeed('Pending Rewards');
        console.log(`  StakingRewards:    ${formatLob(earned)}`);
        console.log(`  RewardDistributor: ${formatLob(claimable)}`);
        console.log(`  Total:             ${formatLob(earned + claimable)}`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });

  // ── sync ────────────────────────────────────────────

  rewards
    .command('sync')
    .description('Sync your effective staking balance (call periodically to avoid staleness)')
    .action(async () => {
      try {
        const ws = ensureWorkspace();
        const publicClient = createPublicClient(ws.config);
        const { client: walletClient } = await createWalletClient(ws.config, ws.path);

        const stakingRewardsAddr = getContractAddress(ws.config, 'stakingRewards');

        const spin = ui.spinner('Syncing stake...');
        const tx = await walletClient.writeContract({
          address: stakingRewardsAddr,
          abi: stakingRewardsAbi,
          functionName: 'syncStake',
        });
        await publicClient.waitForTransactionReceipt({ hash: tx });

        spin.succeed('Stake synced');
        ui.info(`Tx: ${tx}`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });
}
