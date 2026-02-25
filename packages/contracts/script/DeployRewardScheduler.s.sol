// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/RewardScheduler.sol";

/**
 * @title DeployRewardScheduler
 * @notice Standalone deploy script for RewardScheduler against existing protocol.
 *
 *   Required .env variables:
 *     PRIVATE_KEY
 *     STAKING_REWARDS_ADDRESS
 *     LIQUIDITY_MINING_ADDRESS
 *
 *   Usage:
 *     forge script script/DeployRewardScheduler.s.sol:DeployRewardScheduler \
 *       --rpc-url $BASE_RPC_URL \
 *       --broadcast --verify -vvvv
 *
 *   POST-DEPLOY (via TreasuryGovernor multisig):
 *     1. Grant REWARD_NOTIFIER_ROLE on StakingRewards to RewardScheduler
 *     2. Grant REWARD_NOTIFIER_ROLE on LiquidityMining to RewardScheduler
 *     3. Grant DEFAULT_ADMIN_ROLE on RewardScheduler to TreasuryGovernor
 *     4. Renounce deployer's DEFAULT_ADMIN_ROLE on RewardScheduler
 *     5. Fund RewardScheduler with LOB via topUp()
 *     6. Create streams via createStream()
 */
contract DeployRewardScheduler is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        address stakingRewards = vm.envAddress("STAKING_REWARDS_ADDRESS");
        address liquidityMining = vm.envAddress("LIQUIDITY_MINING_ADDRESS");

        vm.startBroadcast(deployerKey);

        RewardScheduler scheduler = new RewardScheduler();
        scheduler.initialize(stakingRewards, liquidityMining);

        vm.stopBroadcast();

        console.log("");
        console.log("========== REWARD SCHEDULER DEPLOYED ==========");
        console.log("Deployer:           ", deployer);
        console.log("RewardScheduler:    ", address(scheduler));
        console.log("");
        console.log("Connected contracts:");
        console.log("  StakingRewards:    ", stakingRewards);
        console.log("  LiquidityMining:   ", liquidityMining);
        console.log("=================================================");
        console.log("");
        console.log("POST-DEPLOY (via TreasuryGovernor multisig):");
        console.log("  1. Grant REWARD_NOTIFIER_ROLE on StakingRewards to RewardScheduler");
        console.log("  2. Grant REWARD_NOTIFIER_ROLE on LiquidityMining to RewardScheduler");
        console.log("  3. Grant DEFAULT_ADMIN_ROLE on RewardScheduler to TreasuryGovernor");
        console.log("  4. Renounce deployer DEFAULT_ADMIN_ROLE on RewardScheduler");
        console.log("  5. Fund RewardScheduler with LOB via topUp()");
        console.log("  6. Create streams via createStream()");
    }
}
