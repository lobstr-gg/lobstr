// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/LoanEngine.sol";

/**
 * @title DeployLoanEngine
 * @notice Standalone deploy script for LoanEngine against existing protocol.
 *
 *   Required .env variables:
 *     PRIVATE_KEY
 *     LOB_TOKEN_ADDRESS
 *     REPUTATION_SYSTEM_ADDRESS
 *     STAKING_MANAGER_ADDRESS
 *     SYBIL_GUARD_ADDRESS
 *     TREASURY_ADDRESS
 *
 *   Usage:
 *     forge script script/DeployLoanEngine.s.sol:DeployLoanEngine \
 *       --rpc-url $BASE_RPC_URL \
 *       --broadcast --verify -vvvv
 *
 *   POST-DEPLOY (via TreasuryGovernor multisig):
 *     1. Grant RECORDER_ROLE on ReputationSystem to LoanEngine
 *     2. Grant SLASHER_ROLE on StakingManager to LoanEngine
 *     3. Grant DEFAULT_ADMIN_ROLE on LoanEngine to TreasuryGovernor
 *     4. Renounce deployer's DEFAULT_ADMIN_ROLE on LoanEngine
 */
contract DeployLoanEngine is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        address lobToken = vm.envAddress("LOB_TOKEN_ADDRESS");
        address reputationSystem = vm.envAddress("REPUTATION_SYSTEM_ADDRESS");
        address stakingManager = vm.envAddress("STAKING_MANAGER_ADDRESS");
        address sybilGuard = vm.envAddress("SYBIL_GUARD_ADDRESS");
        address treasury = vm.envAddress("TREASURY_ADDRESS");

        vm.startBroadcast(deployerKey);

        LoanEngine loanEngine = new LoanEngine();
        loanEngine.initialize(
            lobToken,
            reputationSystem,
            stakingManager,
            sybilGuard,
            treasury,
            deployer
        );

        vm.stopBroadcast();

        console.log("");
        console.log("========== LOAN ENGINE DEPLOYED ==========");
        console.log("Deployer:          ", deployer);
        console.log("LoanEngine:        ", address(loanEngine));
        console.log("");
        console.log("Connected contracts:");
        console.log("  LOBToken:          ", lobToken);
        console.log("  ReputationSystem:  ", reputationSystem);
        console.log("  StakingManager:    ", stakingManager);
        console.log("  SybilGuard:        ", sybilGuard);
        console.log("  Treasury:          ", treasury);
        console.log("===========================================");
        console.log("");
        console.log("POST-DEPLOY (via TreasuryGovernor multisig):");
        console.log("  1. Grant RECORDER_ROLE on ReputationSystem to LoanEngine");
        console.log("  2. Grant SLASHER_ROLE on StakingManager to LoanEngine");
        console.log("  3. Grant DEFAULT_ADMIN_ROLE on LoanEngine to TreasuryGovernor");
        console.log("  4. Renounce deployer DEFAULT_ADMIN_ROLE on LoanEngine");
    }
}
