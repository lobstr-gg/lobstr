// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

import {ReviewRegistry} from "../src/ReviewRegistry.sol";
import {DirectiveBoard} from "../src/DirectiveBoard.sol";
import {SubscriptionEngine} from "../src/SubscriptionEngine.sol";
import {BondingEngine} from "../src/BondingEngine.sol";
import {MultiPartyEscrow} from "../src/MultiPartyEscrow.sol";
import {SkillRegistry} from "../src/SkillRegistry.sol";
import {RolePayroll} from "../src/RolePayroll.sol";
import {PipelineRouter} from "../src/PipelineRouter.sol";
import {Groth16UptimeVerifier} from "../src/verifiers/Groth16UptimeVerifier.sol";
import {IRolePayroll} from "../src/interfaces/IRolePayroll.sol";

/**
 * @title DeployPhase2
 * @notice Deploys all 8 remaining Phase 2 contracts behind ERC1967Proxy (UUPS).
 *
 *   Contracts deployed:
 *     1. ReviewRegistry
 *     2. DirectiveBoard
 *     3. SubscriptionEngine
 *     4. BondingEngine
 *     5. MultiPartyEscrow
 *     6. SkillRegistry
 *     7. RolePayroll (+ Groth16UptimeVerifier)
 *     8. PipelineRouter (depends on SkillRegistry)
 *
 *   Required .env variables:
 *     PRIVATE_KEY
 *
 *   V5 dependency addresses are hardcoded constants (already deployed on Base Mainnet).
 *
 *   Usage:
 *     cd packages/contracts && source .env
 *     forge script script/DeployPhase2.s.sol:DeployPhase2 \
 *       --rpc-url $BASE_MAINNET_RPC_URL \
 *       --broadcast --verify \
 *       --etherscan-api-key $BASESCAN_API_KEY -vvvv
 *
 *   POST-DEPLOY (via TreasuryGovernor multisig):
 *     See console output for required role grants per contract.
 */
contract DeployPhase2 is Script {
    // ── V5 deployed dependency addresses (Base Mainnet) ──
    address constant LOB_TOKEN           = 0xD2E0C513f70f0DdEF5f3EC9296cE3B5eB2799c5E;
    address constant REPUTATION_SYSTEM   = 0x80aB3BE1A18D6D9c79fD09B85ddA8cB6A280EAAd;
    address constant STAKING_MANAGER     = 0xcd9d96c85b4Cd4E91d340C3F69aAd80c3cb3d413;
    address constant TREASURY_GOVERNOR   = 0x66561329C973E8fEe8757002dA275ED1FEa56B95;
    address constant SYBIL_GUARD         = 0xd45202b192676BA94Df9C36bA4fF5c63cE001381;
    address constant DISPUTE_ARBITRATION = 0xF5FDA5446d44505667F7eA58B0dca687c7F82b81;
    address constant ESCROW_ENGINE       = 0xd8654D79C21Fb090Ef30C901db530b127Ef82b4E;
    address constant INSURANCE_POOL      = 0x10555bd849769583755281Ea75e409268A055Ba6;

    // USDC on Base Mainnet
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    // Agent addresses (from .env)
    address founderSentinel;
    address founderArbiter;
    address founderSteward;

    // Deployed proxy addresses
    address public reviewRegistryProxy;
    address public directiveBoardProxy;
    address public subscriptionEngineProxy;
    address public bondingEngineProxy;
    address public multiPartyEscrowProxy;
    address public skillRegistryProxy;
    address public rolePayrollProxy;
    address public pipelineRouterProxy;
    address public uptimeVerifierAddr;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        founderSentinel = vm.envAddress("SENTINEL_ADDRESS");
        founderArbiter  = vm.envAddress("ARBITER_ADDRESS");
        founderSteward  = vm.envAddress("STEWARD_ADDRESS");

        vm.startBroadcast(deployerKey);

        // ── 1. ReviewRegistry ──
        {
            ReviewRegistry impl = new ReviewRegistry();
            ERC1967Proxy proxy = new ERC1967Proxy(
                address(impl),
                abi.encodeCall(ReviewRegistry.initialize, (ESCROW_ENGINE, SYBIL_GUARD))
            );
            reviewRegistryProxy = address(proxy);
        }

        // ── 2. DirectiveBoard ──
        {
            DirectiveBoard impl = new DirectiveBoard();
            ERC1967Proxy proxy = new ERC1967Proxy(
                address(impl),
                abi.encodeCall(DirectiveBoard.initialize, (SYBIL_GUARD, deployer))
            );
            directiveBoardProxy = address(proxy);

            // Grant POSTER_ROLE to governance + deployer
            DirectiveBoard board = DirectiveBoard(address(proxy));
            board.grantRole(board.POSTER_ROLE(), TREASURY_GOVERNOR);
            board.grantRole(board.POSTER_ROLE(), deployer);

            // Grant EXECUTOR_ROLE to agents
            board.grantRole(board.EXECUTOR_ROLE(), founderSentinel);
            board.grantRole(board.EXECUTOR_ROLE(), founderArbiter);
            board.grantRole(board.EXECUTOR_ROLE(), founderSteward);
        }

        // ── 3. SubscriptionEngine ──
        {
            SubscriptionEngine impl = new SubscriptionEngine();
            ERC1967Proxy proxy = new ERC1967Proxy(
                address(impl),
                abi.encodeCall(SubscriptionEngine.initialize, (
                    LOB_TOKEN, REPUTATION_SYSTEM, SYBIL_GUARD, TREASURY_GOVERNOR
                ))
            );
            subscriptionEngineProxy = address(proxy);
        }

        // ── 4. BondingEngine ──
        {
            BondingEngine impl = new BondingEngine();
            ERC1967Proxy proxy = new ERC1967Proxy(
                address(impl),
                abi.encodeCall(BondingEngine.initialize, (
                    LOB_TOKEN, STAKING_MANAGER, SYBIL_GUARD, TREASURY_GOVERNOR
                ))
            );
            bondingEngineProxy = address(proxy);
        }

        // ── 5. MultiPartyEscrow ──
        {
            MultiPartyEscrow impl = new MultiPartyEscrow();
            ERC1967Proxy proxy = new ERC1967Proxy(
                address(impl),
                abi.encodeCall(MultiPartyEscrow.initialize, (
                    ESCROW_ENGINE, DISPUTE_ARBITRATION, LOB_TOKEN, SYBIL_GUARD
                ))
            );
            multiPartyEscrowProxy = address(proxy);
        }

        // ── 6. SkillRegistry ──
        {
            SkillRegistry impl = new SkillRegistry();
            ERC1967Proxy proxy = new ERC1967Proxy(
                address(impl),
                abi.encodeCall(SkillRegistry.initialize, (
                    LOB_TOKEN, STAKING_MANAGER, REPUTATION_SYSTEM,
                    SYBIL_GUARD, ESCROW_ENGINE, TREASURY_GOVERNOR
                ))
            );
            skillRegistryProxy = address(proxy);
        }

        // ── 7. RolePayroll (+ Groth16UptimeVerifier) ──
        {
            Groth16UptimeVerifier verifier = new Groth16UptimeVerifier();
            uptimeVerifierAddr = address(verifier);

            uint256 genesisEpoch = block.timestamp / 1 weeks;

            RolePayroll impl = new RolePayroll();
            ERC1967Proxy proxy = new ERC1967Proxy(
                address(impl),
                abi.encodeCall(RolePayroll.initialize, (
                    LOB_TOKEN, USDC, STAKING_MANAGER, DISPUTE_ARBITRATION,
                    address(verifier), TREASURY_GOVERNOR, INSURANCE_POOL, genesisEpoch
                ))
            );
            rolePayrollProxy = address(proxy);

            RolePayroll payroll = RolePayroll(address(proxy));

            // Configure all 6 role ranks

            // Arbitrator Junior: 20 slots, $35 cert, 5K stake, 150 LOB/week
            payroll.setRoleConfig(0, 0, IRolePayroll.RoleConfig({
                maxSlots: 20,
                certFeeUsdc: 35_000_000,
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

            // Mark founder agents as exempt
            payroll.setFounderAgent(founderSentinel, true);
            payroll.setFounderAgent(founderArbiter, true);
            payroll.setFounderAgent(founderSteward, true);
        }

        // ── 8. PipelineRouter (depends on SkillRegistry) ──
        {
            PipelineRouter impl = new PipelineRouter();
            ERC1967Proxy proxy = new ERC1967Proxy(
                address(impl),
                abi.encodeCall(PipelineRouter.initialize, (
                    skillRegistryProxy, STAKING_MANAGER, REPUTATION_SYSTEM,
                    SYBIL_GUARD, deployer
                ))
            );
            pipelineRouterProxy = address(proxy);
        }

        // ── Transfer DEFAULT_ADMIN_ROLE to TreasuryGovernor, deployer renounces ──
        bytes32 DEFAULT_ADMIN = 0x00;

        _transferAdmin(reviewRegistryProxy, deployer, DEFAULT_ADMIN);
        _transferAdmin(directiveBoardProxy, deployer, DEFAULT_ADMIN);
        _transferAdmin(subscriptionEngineProxy, deployer, DEFAULT_ADMIN);
        _transferAdmin(bondingEngineProxy, deployer, DEFAULT_ADMIN);
        _transferAdmin(multiPartyEscrowProxy, deployer, DEFAULT_ADMIN);
        _transferAdmin(skillRegistryProxy, deployer, DEFAULT_ADMIN);
        _transferAdmin(rolePayrollProxy, deployer, DEFAULT_ADMIN);
        _transferAdmin(pipelineRouterProxy, deployer, DEFAULT_ADMIN);

        vm.stopBroadcast();

        // ── Log summary ──
        _logSummary(deployer);
    }

    function _transferAdmin(address proxy, address deployer, bytes32 role) internal {
        IAccessControl ac = IAccessControl(proxy);
        ac.grantRole(role, TREASURY_GOVERNOR);
        ac.renounceRole(role, deployer);
    }

    function _logSummary(address deployer) internal view {
        console.log("");
        console.log("==========================================================");
        console.log("  PHASE 2 DEPLOYMENT COMPLETE - 8 CONTRACTS DEPLOYED");
        console.log("==========================================================");
        console.log("");
        console.log("Deployer:                    ", deployer);
        console.log("");
        console.log("ReviewRegistry (proxy):      ", reviewRegistryProxy);
        console.log("DirectiveBoard (proxy):      ", directiveBoardProxy);
        console.log("SubscriptionEngine (proxy):  ", subscriptionEngineProxy);
        console.log("BondingEngine (proxy):       ", bondingEngineProxy);
        console.log("MultiPartyEscrow (proxy):    ", multiPartyEscrowProxy);
        console.log("SkillRegistry (proxy):       ", skillRegistryProxy);
        console.log("RolePayroll (proxy):         ", rolePayrollProxy);
        console.log("PipelineRouter (proxy):      ", pipelineRouterProxy);
        console.log("Groth16UptimeVerifier:       ", uptimeVerifierAddr);
        console.log("");
        console.log("V5 dependencies:");
        console.log("  LOBToken:                  ", LOB_TOKEN);
        console.log("  ReputationSystem:          ", REPUTATION_SYSTEM);
        console.log("  StakingManager:            ", STAKING_MANAGER);
        console.log("  TreasuryGovernor:          ", TREASURY_GOVERNOR);
        console.log("  SybilGuard:                ", SYBIL_GUARD);
        console.log("  DisputeArbitration:        ", DISPUTE_ARBITRATION);
        console.log("  EscrowEngine:              ", ESCROW_ENGINE);
        console.log("  InsurancePool:             ", INSURANCE_POOL);
        console.log("  USDC:                      ", USDC);
        console.log("");
        console.log("Founder agents:");
        console.log("  Sentinel:                  ", founderSentinel);
        console.log("  Arbiter:                   ", founderArbiter);
        console.log("  Steward:                   ", founderSteward);
        console.log("");
        console.log("DEFAULT_ADMIN_ROLE transferred to TreasuryGovernor on all 8 contracts.");
        console.log("Deployer admin renounced on all 8 contracts.");
        console.log("");
        console.log("==========================================================");
        console.log("  POST-DEPLOY MULTISIG ROLE GRANTS (via TreasuryGovernor)");
        console.log("==========================================================");
        console.log("");
        console.log("SubscriptionEngine:");
        console.log("  - Grant RECORDER_ROLE on ReputationSystem to SubscriptionEngine");
        console.log("");
        console.log("BondingEngine:");
        console.log("  - Grant MARKET_ADMIN_ROLE on BondingEngine to TreasuryGovernor");
        console.log("  - lobToken.approve(BondingEngine, <budget>) from Treasury");
        console.log("");
        console.log("RolePayroll:");
        console.log("  - Grant LOCKER_ROLE on StakingManager to RolePayroll");
        console.log("  - Grant SLASHER_ROLE on StakingManager to RolePayroll");
        console.log("  - Grant DISPUTE_ROLE on RolePayroll to DisputeArbitration");
        console.log("  - lobToken.approve(RolePayroll, <budget>) from Treasury");
        console.log("");
        console.log("==========================================================");
    }
}
