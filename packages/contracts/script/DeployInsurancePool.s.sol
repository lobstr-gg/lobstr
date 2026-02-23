// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {InsurancePool} from "../src/InsurancePool.sol";

/**
 * @title DeployInsurancePool
 * @notice Standalone deploy script for InsurancePool against existing protocol.
 *
 *   Required .env variables:
 *     PRIVATE_KEY
 *     LOB_TOKEN_ADDRESS
 *     ESCROW_ENGINE_ADDRESS
 *     DISPUTE_ARBITRATION_ADDRESS
 *     REPUTATION_SYSTEM_ADDRESS
 *     STAKING_MANAGER_ADDRESS
 *     SYBIL_GUARD_ADDRESS
 *     SERVICE_REGISTRY_ADDRESS
 *     TREASURY_ADDRESS
 *
 *   Usage:
 *     forge script script/DeployInsurancePool.s.sol:DeployInsurancePool \
 *       --rpc-url $BASE_RPC_URL \
 *       --broadcast --verify -vvvv
 *
 *   POST-DEPLOY (via TreasuryGovernor multisig):
 *     1. Grant GOVERNOR_ROLE on InsurancePool to TreasuryGovernor
 *     2. Grant DEFAULT_ADMIN_ROLE on InsurancePool to TreasuryGovernor
 *     3. Renounce deployer's DEFAULT_ADMIN_ROLE on InsurancePool
 */
contract DeployInsurancePool is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        address lobToken = vm.envAddress("LOB_TOKEN_ADDRESS");
        address escrowEngine = vm.envAddress("ESCROW_ENGINE_ADDRESS");
        address disputeArbitration = vm.envAddress("DISPUTE_ARBITRATION_ADDRESS");
        address reputationSystem = vm.envAddress("REPUTATION_SYSTEM_ADDRESS");
        address stakingManager = vm.envAddress("STAKING_MANAGER_ADDRESS");
        address sybilGuard = vm.envAddress("SYBIL_GUARD_ADDRESS");
        address serviceRegistry = vm.envAddress("SERVICE_REGISTRY_ADDRESS");
        address treasury = vm.envAddress("TREASURY_ADDRESS");

        vm.startBroadcast(deployerKey);

        InsurancePool insurancePool = new InsurancePool(
            lobToken,
            escrowEngine,
            disputeArbitration,
            reputationSystem,
            stakingManager,
            sybilGuard,
            serviceRegistry,
            treasury
        );

        vm.stopBroadcast();

        console.log("");
        console.log("========== INSURANCE POOL DEPLOYED ==========");
        console.log("Deployer:              ", deployer);
        console.log("InsurancePool:         ", address(insurancePool));
        console.log("");
        console.log("Connected contracts:");
        console.log("  LOBToken:              ", lobToken);
        console.log("  EscrowEngine:          ", escrowEngine);
        console.log("  DisputeArbitration:    ", disputeArbitration);
        console.log("  ReputationSystem:      ", reputationSystem);
        console.log("  StakingManager:        ", stakingManager);
        console.log("  SybilGuard:            ", sybilGuard);
        console.log("  ServiceRegistry:       ", serviceRegistry);
        console.log("  Treasury:              ", treasury);
        console.log("================================================");
        console.log("");
        console.log("POST-DEPLOY (via TreasuryGovernor multisig):");
        console.log("  1. Grant GOVERNOR_ROLE on InsurancePool to TreasuryGovernor");
        console.log("  2. Grant DEFAULT_ADMIN_ROLE on InsurancePool to TreasuryGovernor");
        console.log("  3. Renounce deployer DEFAULT_ADMIN_ROLE on InsurancePool");
    }
}
