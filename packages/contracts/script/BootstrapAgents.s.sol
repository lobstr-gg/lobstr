// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/LOBToken.sol";
import "../src/StakingManager.sol";
import "../src/SybilGuard.sol";
import "../src/TreasuryGovernor.sol";

/**
 * @title BootstrapAgents
 * @notice Three-phase script to bootstrap the founding agents.
 *
 *   Phase 1 (run tonight from Signer 1 = deployer):
 *     - Transfer LOB from distribution wallet to each agent
 *     - Create 4 admin proposals on TreasuryGovernor for SybilGuard roles
 *
 *   Phase 2 (run tonight from Signer 2):
 *     - Approve all 4 admin proposals → triggers 24h timelock
 *
 *   Phase 3 (run from each agent wallet):
 *     - Approve LOB spend to StakingManager
 *     - Stake LOB
 *
 *   Phase 4 (run 24h later from any signer):
 *     - Execute all 4 admin proposals → WATCHER + JUDGE roles granted
 *
 *   Usage:
 *     # Phase 1: Signer 1 funds agents + creates proposals
 *     forge script script/BootstrapAgents.s.sol:Phase1_CreateProposals \
 *       --rpc-url $BASE_MAINNET_RPC_URL --broadcast -vvvv
 *
 *     # Phase 2: Signer 2 approves proposals
 *     forge script script/BootstrapAgents.s.sol:Phase2_ApproveProposals \
 *       --rpc-url $BASE_MAINNET_RPC_URL --broadcast -vvvv
 *
 *     # Phase 3a: Sentinel stakes
 *     forge script script/BootstrapAgents.s.sol:Phase3_StakeSentinel \
 *       --rpc-url $BASE_MAINNET_RPC_URL --broadcast -vvvv
 *
 *     # Phase 3b: Arbiter stakes
 *     forge script script/BootstrapAgents.s.sol:Phase3_StakeArbiter \
 *       --rpc-url $BASE_MAINNET_RPC_URL --broadcast -vvvv
 *
 *     # Phase 3c: Steward stakes
 *     forge script script/BootstrapAgents.s.sol:Phase3_StakeSteward \
 *       --rpc-url $BASE_MAINNET_RPC_URL --broadcast -vvvv
 *
 *     # Phase 4: Execute proposals (24h after Phase 2)
 *     forge script script/BootstrapAgents.s.sol:Phase4_ExecuteProposals \
 *       --rpc-url $BASE_MAINNET_RPC_URL --broadcast -vvvv
 *
 *   Required .env variables:
 *     PRIVATE_KEY            — Signer 1 / deployer (also distribution wallet)
 *     SIGNER_2_KEY           — Signer 2 private key
 *     SENTINEL_KEY           — Sentinel agent private key (if different from deployer)
 *     ARBITER_KEY            — Arbiter agent private key
 *     STEWARD_KEY            — Steward agent private key
 */

// ═══════════════════════════════════════════════════════════════════════
// Shared addresses — update these to match your deployment
// ═══════════════════════════════════════════════════════════════════════

abstract contract AgentConfig {
    // Deployed contract addresses (Base mainnet)
    address constant LOB_TOKEN       = 0x7FaeC2536E2Afee56AcA568C475927F1E2521B37;
    address constant STAKING_MANAGER = 0x0c5bC27a3C3Eb7a836302320755f6B1645C49291;
    address constant SYBIL_GUARD     = 0xF43E6698cAAf3BFf422137F20541Cd24dfB3ff07;
    address constant TREASURY_GOV    = 0x9576dcf9909ec192FC136A12De293Efab911517f;

    // Agent wallet addresses (= multisig signers)
    // Signer 1 = deployer = Sentinel
    address constant SENTINEL = 0x8a1C742A8A2F4f7C1295443809acE281723650fb;
    // Signer 2 = Arbiter
    address constant ARBITER  = 0xb761530d346D39B2c10B546545c24a0b0a3285D0;
    // Signer 3 = Steward
    address constant STEWARD  = 0x443c4ff3CAa0E344b10CA19779B2E8AB1ACcd672;

    // Staking amounts
    uint256 constant SENTINEL_STAKE = 5_000 ether;   // Junior (Bronze+)
    uint256 constant ARBITER_STAKE  = 25_000 ether;   // Senior (Gold)
    uint256 constant STEWARD_STAKE  = 5_000 ether;    // Junior (Bronze+)

    // SybilGuard role hashes
    bytes32 constant WATCHER_ROLE = keccak256("WATCHER_ROLE");
    bytes32 constant JUDGE_ROLE   = keccak256("JUDGE_ROLE");
}

// ═══════════════════════════════════════════════════════════════════════
// Phase 1: Signer 1 funds agents + creates admin proposals
// ═══════════════════════════════════════════════════════════════════════

contract Phase1_CreateProposals is Script, AgentConfig {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        vm.startBroadcast(deployerKey);

        LOBToken lob = LOBToken(LOB_TOKEN);
        TreasuryGovernor gov = TreasuryGovernor(TREASURY_GOV);

        // ── Fund agent wallets with LOB for staking ──────────────────
        // Deployer wallet (0x8a1C...) is also distribution address AND Sentinel
        // So Sentinel already has LOB. Just send to Arbiter and Steward.

        uint256 deployerBalance = lob.balanceOf(deployer);
        console.log("Deployer LOB balance:", deployerBalance / 1 ether);

        // Transfer LOB to Arbiter
        if (lob.balanceOf(ARBITER) < ARBITER_STAKE) {
            lob.transfer(ARBITER, ARBITER_STAKE);
            console.log("Sent 25,000 LOB to Arbiter:", ARBITER);
        } else {
            console.log("Arbiter already funded");
        }

        // Transfer LOB to Steward
        if (lob.balanceOf(STEWARD) < STEWARD_STAKE) {
            lob.transfer(STEWARD, STEWARD_STAKE);
            console.log("Sent 5,000 LOB to Steward:", STEWARD);
        } else {
            console.log("Steward already funded");
        }

        // ── Create 4 admin proposals for SybilGuard roles ───────────
        // Proposal 1: Grant WATCHER_ROLE to Sentinel
        bytes memory watcherCalldata = abi.encodeWithSelector(
            bytes4(keccak256("grantRole(bytes32,address)")),
            WATCHER_ROLE,
            SENTINEL
        );
        uint256 p1 = gov.createAdminProposal(
            SYBIL_GUARD,
            watcherCalldata,
            "Grant WATCHER_ROLE to Sentinel (Titus)"
        );
        console.log("Admin Proposal", p1, "created: WATCHER_ROLE -> Sentinel");

        // Proposal 2: Grant JUDGE_ROLE to Sentinel
        bytes memory judgeCalldata1 = abi.encodeWithSelector(
            bytes4(keccak256("grantRole(bytes32,address)")),
            JUDGE_ROLE,
            SENTINEL
        );
        uint256 p2 = gov.createAdminProposal(
            SYBIL_GUARD,
            judgeCalldata1,
            "Grant JUDGE_ROLE to Sentinel (Titus)"
        );
        console.log("Admin Proposal", p2, "created: JUDGE_ROLE -> Sentinel");

        // Proposal 3: Grant JUDGE_ROLE to Arbiter
        bytes memory judgeCalldata2 = abi.encodeWithSelector(
            bytes4(keccak256("grantRole(bytes32,address)")),
            JUDGE_ROLE,
            ARBITER
        );
        uint256 p3 = gov.createAdminProposal(
            SYBIL_GUARD,
            judgeCalldata2,
            "Grant JUDGE_ROLE to Arbiter (Solomon)"
        );
        console.log("Admin Proposal", p3, "created: JUDGE_ROLE -> Arbiter");

        // Proposal 4: Grant JUDGE_ROLE to Steward
        bytes memory judgeCalldata3 = abi.encodeWithSelector(
            bytes4(keccak256("grantRole(bytes32,address)")),
            JUDGE_ROLE,
            STEWARD
        );
        uint256 p4 = gov.createAdminProposal(
            SYBIL_GUARD,
            judgeCalldata3,
            "Grant JUDGE_ROLE to Steward (Daniel)"
        );
        console.log("Admin Proposal", p4, "created: JUDGE_ROLE -> Steward");

        vm.stopBroadcast();

        console.log("");
        console.log("========== PHASE 1 COMPLETE ==========");
        console.log("4 admin proposals created (auto-approved by Signer 1)");
        console.log("LOB sent to Arbiter and Steward");
        console.log("");
        console.log("NEXT: Run Phase2_ApproveProposals with SIGNER_2_KEY");
        console.log("  Proposal IDs:", p1, p2);
        console.log("                ", p3, p4);
    }
}

// ═══════════════════════════════════════════════════════════════════════
// Phase 2: Signer 2 approves all proposals → starts 24h timelock
// ═══════════════════════════════════════════════════════════════════════

contract Phase2_ApproveProposals is Script, AgentConfig {
    function run() external {
        uint256 signer2Key = vm.envUint("SIGNER_2_KEY");
        vm.startBroadcast(signer2Key);

        TreasuryGovernor gov = TreasuryGovernor(TREASURY_GOV);

        // Approve proposals 1-4 (adjust IDs if these aren't the first admin proposals)
        uint256 startId = vm.envOr("FIRST_PROPOSAL_ID", uint256(1));

        for (uint256 i = 0; i < 4; i++) {
            uint256 pid = startId + i;
            gov.approveAdminProposal(pid);
            console.log("Approved admin proposal", pid, "-> 24h timelock started");
        }

        vm.stopBroadcast();

        console.log("");
        console.log("========== PHASE 2 COMPLETE ==========");
        console.log("All 4 proposals approved. 24h timelock started.");
        console.log("Execute after:", block.timestamp + 24 hours);
        console.log("");
        console.log("NEXT: Run Phase3 scripts to stake from each agent wallet");
        console.log("THEN: Wait 24h and run Phase4_ExecuteProposals");
    }
}

// ═══════════════════════════════════════════════════════════════════════
// Phase 3a: Sentinel stakes LOB
// ═══════════════════════════════════════════════════════════════════════

contract Phase3_StakeSentinel is Script, AgentConfig {
    function run() external {
        uint256 key = vm.envUint("PRIVATE_KEY"); // Sentinel = deployer
        vm.startBroadcast(key);

        IERC20(LOB_TOKEN).approve(STAKING_MANAGER, SENTINEL_STAKE);
        StakingManager(STAKING_MANAGER).stake(SENTINEL_STAKE);

        console.log("Sentinel staked", SENTINEL_STAKE / 1 ether, "LOB");
        vm.stopBroadcast();
    }
}

// ═══════════════════════════════════════════════════════════════════════
// Phase 3b: Arbiter stakes LOB
// ═══════════════════════════════════════════════════════════════════════

contract Phase3_StakeArbiter is Script, AgentConfig {
    function run() external {
        uint256 key = vm.envUint("SIGNER_2_KEY"); // Arbiter = Signer 2
        vm.startBroadcast(key);

        IERC20(LOB_TOKEN).approve(STAKING_MANAGER, ARBITER_STAKE);
        StakingManager(STAKING_MANAGER).stake(ARBITER_STAKE);

        console.log("Arbiter staked", ARBITER_STAKE / 1 ether, "LOB");
        vm.stopBroadcast();
    }
}

// ═══════════════════════════════════════════════════════════════════════
// Phase 3c: Steward stakes LOB
// ═══════════════════════════════════════════════════════════════════════

contract Phase3_StakeSteward is Script, AgentConfig {
    function run() external {
        uint256 key = vm.envUint("SIGNER_3_KEY"); // Steward = Signer 3
        vm.startBroadcast(key);

        IERC20(LOB_TOKEN).approve(STAKING_MANAGER, STEWARD_STAKE);
        StakingManager(STAKING_MANAGER).stake(STEWARD_STAKE);

        console.log("Steward staked", STEWARD_STAKE / 1 ether, "LOB");
        vm.stopBroadcast();
    }
}

// ═══════════════════════════════════════════════════════════════════════
// Phase 4: Execute all proposals (24h after Phase 2)
// ═══════════════════════════════════════════════════════════════════════

contract Phase4_ExecuteProposals is Script, AgentConfig {
    function run() external {
        uint256 key = vm.envUint("PRIVATE_KEY"); // Any signer can execute
        vm.startBroadcast(key);

        TreasuryGovernor gov = TreasuryGovernor(TREASURY_GOV);

        uint256 startId = vm.envOr("FIRST_PROPOSAL_ID", uint256(1));

        for (uint256 i = 0; i < 4; i++) {
            uint256 pid = startId + i;
            gov.executeAdminProposal(pid);
            console.log("Executed admin proposal", pid);
        }

        vm.stopBroadcast();

        console.log("");
        console.log("========== PHASE 4 COMPLETE ==========");
        console.log("All SybilGuard roles granted!");
        console.log("  Sentinel: WATCHER_ROLE + JUDGE_ROLE");
        console.log("  Arbiter:  JUDGE_ROLE");
        console.log("  Steward:  JUDGE_ROLE");
        console.log("");
        console.log("Protocol is fully operational.");
    }
}
