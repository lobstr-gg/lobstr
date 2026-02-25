// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/ReviewRegistry.sol";

/**
 * @title DeployReviewRegistry
 * @notice Standalone deploy script for ReviewRegistry against existing protocol.
 *
 *   Required .env variables:
 *     PRIVATE_KEY
 *     ESCROW_ENGINE_ADDRESS
 *     SYBIL_GUARD_ADDRESS
 *
 *   Usage:
 *     forge script script/DeployReviewRegistry.s.sol:DeployReviewRegistry \
 *       --rpc-url $BASE_RPC_URL \
 *       --broadcast --verify -vvvv
 *
 *   POST-DEPLOY (via TreasuryGovernor multisig):
 *     1. Grant DEFAULT_ADMIN_ROLE on ReviewRegistry to TreasuryGovernor
 *     2. Renounce deployer's DEFAULT_ADMIN_ROLE on ReviewRegistry
 */
contract DeployReviewRegistry is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        address escrowEngine = vm.envAddress("ESCROW_ENGINE_ADDRESS");
        address sybilGuard = vm.envAddress("SYBIL_GUARD_ADDRESS");

        vm.startBroadcast(deployerKey);

        ReviewRegistry reviewRegistry = new ReviewRegistry();
        reviewRegistry.initialize(escrowEngine, sybilGuard);

        vm.stopBroadcast();

        console.log("");
        console.log("========== REVIEW REGISTRY DEPLOYED ==========");
        console.log("Deployer:          ", deployer);
        console.log("ReviewRegistry:    ", address(reviewRegistry));
        console.log("");
        console.log("Connected contracts:");
        console.log("  EscrowEngine:      ", escrowEngine);
        console.log("  SybilGuard:        ", sybilGuard);
        console.log("===============================================");
        console.log("");
        console.log("POST-DEPLOY (via TreasuryGovernor multisig):");
        console.log("  1. Grant DEFAULT_ADMIN_ROLE on ReviewRegistry to TreasuryGovernor");
        console.log("  2. Renounce deployer DEFAULT_ADMIN_ROLE on ReviewRegistry");
    }
}
