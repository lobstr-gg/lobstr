// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/X402CreditFacility.sol";

/**
 * @title DeployX402CreditFacility
 * @notice Standalone deploy script for X402CreditFacility.
 *         Reads existing contract addresses from env vars.
 *
 *   Required .env variables:
 *     PRIVATE_KEY, LOB_TOKEN, ESCROW_ENGINE, DISPUTE_ARBITRATION,
 *     REPUTATION_SYSTEM, STAKING_MANAGER, SYBIL_GUARD,
 *     TREASURY_ADDRESS, FACILITATOR_ADDRESS, POOL_MANAGER_ADDRESS
 *
 *   Usage:
 *     forge script script/DeployX402CreditFacility.s.sol:DeployX402CreditFacilityScript \
 *       --rpc-url $BASE_RPC_URL \
 *       --broadcast --verify -vvvv
 */
contract DeployX402CreditFacilityScript is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        address lobToken = vm.envAddress("LOB_TOKEN");
        address escrowEngine = vm.envAddress("ESCROW_ENGINE");
        address disputeArbitration = vm.envAddress("DISPUTE_ARBITRATION");
        address reputationSystem = vm.envAddress("REPUTATION_SYSTEM");
        address stakingManager = vm.envAddress("STAKING_MANAGER");
        address sybilGuard = vm.envAddress("SYBIL_GUARD");
        address treasury = vm.envAddress("TREASURY_ADDRESS");
        address facilitatorAddr = vm.envAddress("FACILITATOR_ADDRESS");
        address poolManagerAddr = vm.envAddress("POOL_MANAGER_ADDRESS");

        vm.startBroadcast(deployerKey);

        X402CreditFacility facility = new X402CreditFacility();
        facility.initialize(
            lobToken,
            escrowEngine,
            disputeArbitration,
            reputationSystem,
            stakingManager,
            sybilGuard,
            treasury,
            deployer
        );

        // Grant roles
        facility.grantRole(facility.FACILITATOR_ROLE(), facilitatorAddr);
        facility.grantRole(facility.POOL_MANAGER_ROLE(), poolManagerAddr);

        vm.stopBroadcast();

        console.log("");
        console.log("========== X402CreditFacility DEPLOYED ==========");
        console.log("Address:          ", address(facility));
        console.log("Deployer:         ", deployer);
        console.log("LOBToken:         ", lobToken);
        console.log("EscrowEngine:     ", escrowEngine);
        console.log("Facilitator:      ", facilitatorAddr);
        console.log("PoolManager:      ", poolManagerAddr);
        console.log("=================================================");
        console.log("");
        console.log("POST-DEPLOY CHECKLIST:");
        console.log("  1. Grant RECORDER_ROLE on ReputationSystem to CreditFacility");
        console.log("  2. Grant SLASHER_ROLE on StakingManager to CreditFacility");
        console.log("  3. Transfer DEFAULT_ADMIN_ROLE to TreasuryGovernor");
        console.log("  4. Seed pool: POOL_MANAGER calls depositToPool() with LOB");
        console.log("  5. Verify contract on BaseScan");
    }
}
