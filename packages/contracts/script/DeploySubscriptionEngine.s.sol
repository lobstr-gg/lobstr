// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/SubscriptionEngine.sol";

/**
 * @title DeploySubscriptionEngine
 * @notice Standalone deploy script for SubscriptionEngine against existing protocol.
 *
 *   Required .env variables:
 *     PRIVATE_KEY
 *     LOB_TOKEN_ADDRESS
 *     REPUTATION_SYSTEM_ADDRESS
 *     SYBIL_GUARD_ADDRESS
 *     TREASURY_ADDRESS
 *
 *   Usage:
 *     forge script script/DeploySubscriptionEngine.s.sol:DeploySubscriptionEngine \
 *       --rpc-url $BASE_RPC_URL \
 *       --broadcast --verify -vvvv
 *
 *   POST-DEPLOY (via TreasuryGovernor multisig):
 *     1. Grant RECORDER_ROLE on ReputationSystem to SubscriptionEngine
 *     2. Grant DEFAULT_ADMIN_ROLE on SubscriptionEngine to TreasuryGovernor
 *     3. Renounce deployer's DEFAULT_ADMIN_ROLE on SubscriptionEngine
 */
contract DeploySubscriptionEngine is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        address lobToken = vm.envAddress("LOB_TOKEN_ADDRESS");
        address reputationSystem = vm.envAddress("REPUTATION_SYSTEM_ADDRESS");
        address sybilGuard = vm.envAddress("SYBIL_GUARD_ADDRESS");
        address treasury = vm.envAddress("TREASURY_ADDRESS");

        vm.startBroadcast(deployerKey);

        SubscriptionEngine subscriptionEngine = new SubscriptionEngine();
        subscriptionEngine.initialize(
            lobToken,
            reputationSystem,
            sybilGuard,
            treasury
        );

        vm.stopBroadcast();

        console.log("");
        console.log("========== SUBSCRIPTION ENGINE DEPLOYED ==========");
        console.log("Deployer:              ", deployer);
        console.log("SubscriptionEngine:    ", address(subscriptionEngine));
        console.log("");
        console.log("Connected contracts:");
        console.log("  LOBToken:              ", lobToken);
        console.log("  ReputationSystem:      ", reputationSystem);
        console.log("  SybilGuard:            ", sybilGuard);
        console.log("  Treasury:              ", treasury);
        console.log("====================================================");
        console.log("");
        console.log("POST-DEPLOY (via TreasuryGovernor multisig):");
        console.log("  1. Grant RECORDER_ROLE on ReputationSystem to SubscriptionEngine");
        console.log("  2. Grant DEFAULT_ADMIN_ROLE on SubscriptionEngine to TreasuryGovernor");
        console.log("  3. Renounce deployer DEFAULT_ADMIN_ROLE on SubscriptionEngine");
    }
}
