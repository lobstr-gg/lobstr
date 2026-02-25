// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {RolePayroll} from "../src/RolePayroll.sol";
import {Groth16UptimeVerifier} from "../src/verifiers/Groth16UptimeVerifier.sol";
import {IRolePayroll} from "../src/interfaces/IRolePayroll.sol";

/**
 * @title DeployRolePayroll
 * @notice Standalone deploy script for Groth16UptimeVerifier + RolePayroll.
 *
 *   Required .env variables:
 *     PRIVATE_KEY
 *     LOB_TOKEN_ADDRESS
 *     USDC_TOKEN_ADDRESS
 *     STAKING_MANAGER_ADDRESS
 *     DISPUTE_ARBITRATION_ADDRESS
 *     TREASURY_ADDRESS                  — TreasuryGovernor address
 *     GENESIS_EPOCH                     — Sunday 00:00 UTC timestamp for epoch 0
 *     FOUNDER_SENTINEL                  — Sentinel agent address
 *     FOUNDER_ARBITER                   — Arbiter agent address
 *     FOUNDER_STEWARD                   — Steward agent address
 *
 *   Usage:
 *     forge script script/DeployRolePayroll.s.sol:DeployRolePayroll \
 *       --rpc-url $BASE_RPC_URL \
 *       --broadcast --verify -vvvv
 *
 *   POST-DEPLOY (via TreasuryGovernor multisig):
 *     1. Grant LOCKER_ROLE on StakingManager to RolePayroll
 *     2. Grant SLASHER_ROLE on StakingManager to RolePayroll
 *     3. Grant DISPUTE_ROLE on RolePayroll to DisputeArbitration
 *     4. Approve LOB spending: lobToken.approve(rolePayroll, <large_amount>)
 *        (so RolePayroll can pull LOB from treasury for weekly claims)
 *     5. Transfer DEFAULT_ADMIN_ROLE on RolePayroll to TreasuryGovernor
 *     6. Renounce deployer's DEFAULT_ADMIN_ROLE on RolePayroll
 */
contract DeployRolePayroll is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        address lobToken = vm.envAddress("LOB_TOKEN_ADDRESS");
        address usdcToken = vm.envAddress("USDC_TOKEN_ADDRESS");
        address stakingManager = vm.envAddress("STAKING_MANAGER_ADDRESS");
        address disputeArbitration = vm.envAddress("DISPUTE_ARBITRATION_ADDRESS");
        address treasury = vm.envAddress("TREASURY_ADDRESS");
        uint256 genesisEpoch = vm.envUint("GENESIS_EPOCH");

        address founderSentinel = vm.envAddress("FOUNDER_SENTINEL");
        address founderArbiter = vm.envAddress("FOUNDER_ARBITER");
        address founderSteward = vm.envAddress("FOUNDER_STEWARD");

        vm.startBroadcast(deployerKey);

        // 1. Deploy verifier
        Groth16UptimeVerifier verifier = new Groth16UptimeVerifier();

        // 2. Deploy RolePayroll
        RolePayroll payroll = new RolePayroll();
        payroll.initialize(
            lobToken,
            usdcToken,
            stakingManager,
            disputeArbitration,
            address(verifier),
            treasury,
            treasury, // insurancePool - using treasury as placeholder
            genesisEpoch
        );

        // 3. Configure all 6 role ranks

        // Arbitrator Junior: 20 slots, $35 cert, 5K stake, 150 LOB/week
        payroll.setRoleConfig(0, 0, IRolePayroll.RoleConfig({
            maxSlots: 20,
            certFeeUsdc: 35_000_000,  // $35 (6 decimals)
            minStakeLob: 5_000 ether,
            weeklyBaseLob: 150 ether,
            perDisputeLob: 75 ether,
            majorityBonusLob: 25 ether
        }));

        // Arbitrator Senior: 10 slots, $75 cert, 15K stake, 350 LOB/week
        payroll.setRoleConfig(0, 1, IRolePayroll.RoleConfig({
            maxSlots: 10,
            certFeeUsdc: 75_000_000,
            minStakeLob: 15_000 ether,
            weeklyBaseLob: 350 ether,
            perDisputeLob: 175 ether,
            majorityBonusLob: 50 ether
        }));

        // Arbitrator Principal: 5 slots, $150 cert, 50K stake, 750 LOB/week
        payroll.setRoleConfig(0, 2, IRolePayroll.RoleConfig({
            maxSlots: 5,
            certFeeUsdc: 150_000_000,
            minStakeLob: 50_000 ether,
            weeklyBaseLob: 750 ether,
            perDisputeLob: 400 ether,
            majorityBonusLob: 100 ether
        }));

        // Moderator Junior: 15 slots, $25 cert, 3K stake, 200 LOB/week
        payroll.setRoleConfig(1, 0, IRolePayroll.RoleConfig({
            maxSlots: 15,
            certFeeUsdc: 25_000_000,
            minStakeLob: 3_000 ether,
            weeklyBaseLob: 200 ether,
            perDisputeLob: 0,
            majorityBonusLob: 0
        }));

        // Moderator Senior: 8 slots, $50 cert, 10K stake, 450 LOB/week
        payroll.setRoleConfig(1, 1, IRolePayroll.RoleConfig({
            maxSlots: 8,
            certFeeUsdc: 50_000_000,
            minStakeLob: 10_000 ether,
            weeklyBaseLob: 450 ether,
            perDisputeLob: 0,
            majorityBonusLob: 0
        }));

        // Moderator Lead: 3 slots, $100 cert, 30K stake, 900 LOB/week
        payroll.setRoleConfig(1, 2, IRolePayroll.RoleConfig({
            maxSlots: 3,
            certFeeUsdc: 100_000_000,
            minStakeLob: 30_000 ether,
            weeklyBaseLob: 900 ether,
            perDisputeLob: 0,
            majorityBonusLob: 0
        }));

        // 4. Mark founder agents as exempt
        payroll.setFounderAgent(founderSentinel, true);
        payroll.setFounderAgent(founderArbiter, true);
        payroll.setFounderAgent(founderSteward, true);

        vm.stopBroadcast();

        console.log("");
        console.log("========== ROLE PAYROLL DEPLOYED ==========");
        console.log("Deployer:                ", deployer);
        console.log("Groth16UptimeVerifier:   ", address(verifier));
        console.log("RolePayroll:             ", address(payroll));
        console.log("");
        console.log("Connected contracts:");
        console.log("  LOBToken:              ", lobToken);
        console.log("  USDC:                  ", usdcToken);
        console.log("  StakingManager:        ", stakingManager);
        console.log("  DisputeArbitration:    ", disputeArbitration);
        console.log("  Treasury:              ", treasury);
        console.log("  Genesis Epoch:         ", genesisEpoch);
        console.log("");
        console.log("Founder agents (exempt):");
        console.log("  Sentinel:              ", founderSentinel);
        console.log("  Arbiter:               ", founderArbiter);
        console.log("  Steward:               ", founderSteward);
        console.log("================================================");
        console.log("");
        console.log("POST-DEPLOY (via TreasuryGovernor multisig):");
        console.log("  1. Grant LOCKER_ROLE on StakingManager to RolePayroll");
        console.log("  2. Grant SLASHER_ROLE on StakingManager to RolePayroll");
        console.log("  3. Grant DISPUTE_ROLE on RolePayroll to DisputeArbitration");
        console.log("  4. lobToken.approve(RolePayroll, <budget>) from Treasury");
        console.log("  5. Grant DEFAULT_ADMIN_ROLE on RolePayroll to TreasuryGovernor");
        console.log("  6. Renounce deployer DEFAULT_ADMIN_ROLE on RolePayroll");
    }
}
