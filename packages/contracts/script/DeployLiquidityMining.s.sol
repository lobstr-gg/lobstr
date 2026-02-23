// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/LiquidityMining.sol";

/**
 * @title DeployLiquidityMining
 * @notice Standalone deploy script for LiquidityMining against existing protocol.
 *
 *   Required .env variables:
 *     PRIVATE_KEY
 *     LP_TOKEN_ADDRESS
 *     LOB_TOKEN_ADDRESS
 *     STAKING_MANAGER_ADDRESS
 *     SYBIL_GUARD_ADDRESS
 *
 *   Usage:
 *     forge script script/DeployLiquidityMining.s.sol:DeployLiquidityMining \
 *       --rpc-url $BASE_RPC_URL \
 *       --broadcast --verify -vvvv
 *
 *   POST-DEPLOY (via TreasuryGovernor multisig):
 *     1. Grant REWARD_NOTIFIER_ROLE on LiquidityMining to TreasuryGovernor
 *     2. Grant DEFAULT_ADMIN_ROLE on LiquidityMining to TreasuryGovernor
 *     3. Renounce deployer's DEFAULT_ADMIN_ROLE on LiquidityMining
 *     4. Transfer LOB + call notifyRewardAmount()
 */
contract DeployLiquidityMining is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        address lpToken = vm.envAddress("LP_TOKEN_ADDRESS");
        address lobToken = vm.envAddress("LOB_TOKEN_ADDRESS");
        address stakingManager = vm.envAddress("STAKING_MANAGER_ADDRESS");
        address sybilGuard = vm.envAddress("SYBIL_GUARD_ADDRESS");

        vm.startBroadcast(deployerKey);

        LiquidityMining liquidityMining = new LiquidityMining(
            lpToken,
            lobToken,
            stakingManager,
            sybilGuard
        );

        vm.stopBroadcast();

        console.log("");
        console.log("========== LIQUIDITY MINING DEPLOYED ==========");
        console.log("Deployer:            ", deployer);
        console.log("LiquidityMining:     ", address(liquidityMining));
        console.log("");
        console.log("Connected contracts:");
        console.log("  LP Token:            ", lpToken);
        console.log("  LOB Token:           ", lobToken);
        console.log("  StakingManager:      ", stakingManager);
        console.log("  SybilGuard:          ", sybilGuard);
        console.log("=================================================");
        console.log("");
        console.log("POST-DEPLOY (via TreasuryGovernor multisig):");
        console.log("  1. Grant REWARD_NOTIFIER_ROLE on LiquidityMining to TreasuryGovernor");
        console.log("  2. Grant DEFAULT_ADMIN_ROLE on LiquidityMining to TreasuryGovernor");
        console.log("  3. Renounce deployer DEFAULT_ADMIN_ROLE on LiquidityMining");
        console.log("  4. Transfer LOB + call notifyRewardAmount()");
    }
}
