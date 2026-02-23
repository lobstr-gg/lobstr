// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/StakingRewards.sol";

/**
 * @title DeployStakingRewards
 * @notice Standalone deploy script for StakingRewards against existing protocol.
 *
 *   Required .env variables:
 *     PRIVATE_KEY
 *     STAKING_MANAGER_ADDRESS
 *     SYBIL_GUARD_ADDRESS
 *
 *   Usage:
 *     forge script script/DeployStakingRewards.s.sol:DeployStakingRewards \
 *       --rpc-url $BASE_RPC_URL \
 *       --broadcast --verify -vvvv
 *
 *   POST-DEPLOY (via TreasuryGovernor multisig):
 *     1. Grant REWARD_NOTIFIER_ROLE on StakingRewards to TreasuryGovernor
 *     2. Add reward tokens via addRewardToken()
 *     3. Grant DEFAULT_ADMIN_ROLE on StakingRewards to TreasuryGovernor
 *     4. Renounce deployer's DEFAULT_ADMIN_ROLE on StakingRewards
 *     5. Transfer reward tokens + call notifyRewardAmount()
 */
contract DeployStakingRewards is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        address stakingManager = vm.envAddress("STAKING_MANAGER_ADDRESS");
        address sybilGuard = vm.envAddress("SYBIL_GUARD_ADDRESS");

        vm.startBroadcast(deployerKey);

        StakingRewards stakingRewards = new StakingRewards(stakingManager, sybilGuard);

        vm.stopBroadcast();

        console.log("");
        console.log("========== STAKING REWARDS DEPLOYED ==========");
        console.log("Deployer:          ", deployer);
        console.log("StakingRewards:    ", address(stakingRewards));
        console.log("");
        console.log("Connected contracts:");
        console.log("  StakingManager:    ", stakingManager);
        console.log("  SybilGuard:        ", sybilGuard);
        console.log("================================================");
        console.log("");
        console.log("POST-DEPLOY (via TreasuryGovernor multisig):");
        console.log("  1. Grant REWARD_NOTIFIER_ROLE on StakingRewards to TreasuryGovernor");
        console.log("  2. Add reward tokens via addRewardToken()");
        console.log("  3. Grant DEFAULT_ADMIN_ROLE on StakingRewards to TreasuryGovernor");
        console.log("  4. Renounce deployer DEFAULT_ADMIN_ROLE on StakingRewards");
        console.log("  5. Transfer reward tokens + call notifyRewardAmount()");
    }
}
