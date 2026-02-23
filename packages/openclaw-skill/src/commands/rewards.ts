import { Command } from 'commander';
import { parseAbi } from 'viem';
import {
  ensureWorkspace,
  createPublicClient,
  createWalletClient,
  getContractAddress,
  loadWallet,
} from 'openclaw';
import * as ui from 'openclaw';
import { formatLob } from '../lib/format';

const STAKING_REWARDS_ABI = parseAbi([
  'function earned(address account) view returns (uint256)',
  'function claimReward()',
  'function getRewardRate() view returns (uint256)',
  'function totalStaked() view returns (uint256)',
  'function rewardPerToken() view returns (uint256)',
]);

const REWARD_DISTRIBUTOR_ABI = parseAbi([
  'function pendingRewards(address account) view returns (uint256)',
  'function claimRewards()',
  'function getDistributionInfo() view returns (uint256 totalDistributed, uint256 currentEpoch, uint256 epochReward)',
]);

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

        const spin = ui.spinner('Fetching reward status...');

        const [earned, rewardRate, totalStaked, rewardPerToken, pending, distInfo] = await Promise.all([
          publicClient.readContract({
            address: stakingRewardsAddr,
            abi: STAKING_REWARDS_ABI,
            functionName: 'earned',
            args: [address],
          }) as Promise<bigint>,
          publicClient.readContract({
            address: stakingRewardsAddr,
            abi: STAKING_REWARDS_ABI,
            functionName: 'getRewardRate',
          }) as Promise<bigint>,
          publicClient.readContract({
            address: stakingRewardsAddr,
            abi: STAKING_REWARDS_ABI,
            functionName: 'totalStaked',
          }) as Promise<bigint>,
          publicClient.readContract({
            address: stakingRewardsAddr,
            abi: STAKING_REWARDS_ABI,
            functionName: 'rewardPerToken',
          }) as Promise<bigint>,
          publicClient.readContract({
            address: distributorAddr,
            abi: REWARD_DISTRIBUTOR_ABI,
            functionName: 'pendingRewards',
            args: [address],
          }) as Promise<bigint>,
          publicClient.readContract({
            address: distributorAddr,
            abi: REWARD_DISTRIBUTOR_ABI,
            functionName: 'getDistributionInfo',
          }) as Promise<any>,
        ]);

        const totalDistributed = distInfo.totalDistributed ?? distInfo[0];
        const currentEpoch = distInfo.currentEpoch ?? distInfo[1];
        const epochReward = distInfo.epochReward ?? distInfo[2];

        spin.succeed('Reward Status');
        console.log('  --- StakingRewards ---');
        console.log(`  Earned:          ${formatLob(earned)}`);
        console.log(`  Reward rate:     ${formatLob(rewardRate)}/s`);
        console.log(`  Total staked:    ${formatLob(totalStaked)}`);
        console.log(`  Reward/token:    ${formatLob(rewardPerToken)}`);
        console.log('  --- RewardDistributor ---');
        console.log(`  Pending:         ${formatLob(pending)}`);
        console.log(`  Total distributed: ${formatLob(totalDistributed)}`);
        console.log(`  Current epoch:   ${currentEpoch.toString()}`);
        console.log(`  Epoch reward:    ${formatLob(epochReward)}`);
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

        const spin = ui.spinner('Claiming staking rewards...');
        const tx1 = await walletClient.writeContract({
          address: stakingRewardsAddr,
          abi: STAKING_REWARDS_ABI,
          functionName: 'claimReward',
        });
        await publicClient.waitForTransactionReceipt({ hash: tx1 });

        spin.text = 'Claiming distributor rewards...';
        const tx2 = await walletClient.writeContract({
          address: distributorAddr,
          abi: REWARD_DISTRIBUTOR_ABI,
          functionName: 'claimRewards',
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

        const spin = ui.spinner('Fetching pending rewards...');

        const [earned, pending] = await Promise.all([
          publicClient.readContract({
            address: stakingRewardsAddr,
            abi: STAKING_REWARDS_ABI,
            functionName: 'earned',
            args: [address],
          }) as Promise<bigint>,
          publicClient.readContract({
            address: distributorAddr,
            abi: REWARD_DISTRIBUTOR_ABI,
            functionName: 'pendingRewards',
            args: [address],
          }) as Promise<bigint>,
        ]);

        spin.succeed('Pending Rewards');
        console.log(`  StakingRewards:    ${formatLob(earned)}`);
        console.log(`  RewardDistributor: ${formatLob(pending)}`);
        console.log(`  Total:             ${formatLob(earned + pending)}`);
      } catch (err) {
        ui.error((err as Error).message);
        process.exit(1);
      }
    });
}
