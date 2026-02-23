// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/AffiliateManager.sol";

/**
 * @title DeployAffiliateManager
 * @notice Standalone deploy script for AffiliateManager against existing protocol.
 *
 *   Required .env variables:
 *     PRIVATE_KEY
 *     SYBIL_GUARD_ADDRESS
 *
 *   Usage:
 *     forge script script/DeployAffiliateManager.s.sol:DeployAffiliateManager \
 *       --rpc-url $BASE_RPC_URL \
 *       --broadcast --verify -vvvv
 *
 *   POST-DEPLOY (via TreasuryGovernor multisig):
 *     1. Grant CREDITOR_ROLE on AffiliateManager to keeper bot
 *     2. Grant DEFAULT_ADMIN_ROLE on AffiliateManager to TreasuryGovernor
 *     3. Renounce deployer's DEFAULT_ADMIN_ROLE on AffiliateManager
 *     4. Fund AffiliateManager with LOB/USDC reward budget
 */
contract DeployAffiliateManager is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        address sybilGuard = vm.envAddress("SYBIL_GUARD_ADDRESS");

        vm.startBroadcast(deployerKey);

        AffiliateManager affiliateManager = new AffiliateManager(sybilGuard);

        vm.stopBroadcast();

        console.log("");
        console.log("========== AFFILIATE MANAGER DEPLOYED ==========");
        console.log("Deployer:            ", deployer);
        console.log("AffiliateManager:    ", address(affiliateManager));
        console.log("");
        console.log("Connected contracts:");
        console.log("  SybilGuard:          ", sybilGuard);
        console.log("=================================================");
        console.log("");
        console.log("POST-DEPLOY (via TreasuryGovernor multisig):");
        console.log("  1. Grant CREDITOR_ROLE on AffiliateManager to keeper bot");
        console.log("  2. Grant DEFAULT_ADMIN_ROLE on AffiliateManager to TreasuryGovernor");
        console.log("  3. Renounce deployer DEFAULT_ADMIN_ROLE on AffiliateManager");
        console.log("  4. Fund AffiliateManager with LOB/USDC reward budget");
    }
}
