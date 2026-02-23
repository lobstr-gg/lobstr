// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

interface ITreasuryGovernor {
    function createAdminProposal(
        address target,
        bytes calldata data,
        string calldata description
    ) external returns (uint256);
}

/**
 * @title GrantMissingRoles
 * @notice Submits admin proposals to TreasuryGovernor for all missing role grants.
 *         The deployer (a SIGNER_ROLE holder) calls createAdminProposal() which
 *         auto-approves (1/3). Then 2 more signers approve, wait 24h, execute.
 *
 *   Proposals created:
 *     ReputationSystem — RECORDER_ROLE:
 *       1. → EscrowEngine
 *       2. → DisputeArbitration
 *       3. → LoanEngine
 *       4. → X402CreditFacility
 *       5. → InsurancePool
 *
 *     StakingManager — SLASHER_ROLE:
 *       6. → DisputeArbitration
 *       7. → SybilGuard
 *       8. → LoanEngine
 *       9. → X402CreditFacility
 *
 *     StakingManager — LOCKER_ROLE:
 *      10. → LoanEngine
 *      11. → X402CreditFacility
 *
 *     X402CreditFacility — operational roles:
 *      12. FACILITATOR_ROLE → deployer (temp)
 *      13. POOL_MANAGER_ROLE → deployer (temp)
 *
 *   Required .env variables:
 *     PRIVATE_KEY
 *     INSURANCE_POOL_ADDRESS (deployed InsurancePool)
 *
 *   Usage:
 *     forge script script/GrantMissingRoles.s.sol:GrantMissingRoles \
 *       --rpc-url $BASE_RPC_URL \
 *       --broadcast -vvvv
 */
contract GrantMissingRoles is Script {
    // ── Deployed V3 addresses (Base mainnet) ──────────────────────
    address constant TREASURY_GOVERNOR    = 0x9b7E2b8cf7de5ef1f85038b050952DC1D4596319;
    address constant REPUTATION_SYSTEM    = 0xd41a40145811915075F6935A4755f8688e53c8dB;
    address constant STAKING_MANAGER      = 0xCB7790D3f9b5bfe171eb30C253Ab3007d43C441b;
    address constant ESCROW_ENGINE        = 0x576235a56e0e25feb95Ea198d017070Ad7f78360;
    address constant DISPUTE_ARBITRATION  = 0xFfBded2DbA5e27Ad5A56c6d4C401124e942Ada04;
    address constant LOAN_ENGINE          = 0xf5Ab9F1A5c6CC60e1A68d50B4C943D72fd97487a;
    address constant X402_CREDIT_FACILITY = 0x0d1d8583561310ADeEfe18cb3a5729e2666aC14C;
    address constant SYBIL_GUARD          = 0x545A01E48cFB6A76699Ef12Ec1e998C1a275c84E;

    // ── Role hashes ───────────────────────────────────────────────
    bytes32 constant RECORDER_ROLE     = keccak256("RECORDER_ROLE");
    bytes32 constant SLASHER_ROLE      = keccak256("SLASHER_ROLE");
    bytes32 constant LOCKER_ROLE       = keccak256("LOCKER_ROLE");
    bytes32 constant FACILITATOR_ROLE  = keccak256("FACILITATOR_ROLE");
    bytes32 constant POOL_MANAGER_ROLE = keccak256("POOL_MANAGER_ROLE");

    ITreasuryGovernor constant gov = ITreasuryGovernor(TREASURY_GOVERNOR);

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address insurancePool = vm.envAddress("INSURANCE_POOL_ADDRESS");

        console.log("Deployer (signer):", deployer);
        console.log("InsurancePool:    ", insurancePool);
        console.log("");

        vm.startBroadcast(deployerKey);

        _grantRecorderRoles(insurancePool);
        _grantSlasherRoles();
        _grantLockerRoles();
        _grantCreditFacilityRoles(deployer);

        vm.stopBroadcast();

        _logNextSteps();
    }

    function _grantRecorderRoles(address insurancePool) internal {
        console.log("ReputationSystem - RECORDER_ROLE:");

        uint256 id = gov.createAdminProposal(
            REPUTATION_SYSTEM,
            abi.encodeWithSelector(AccessControl.grantRole.selector, RECORDER_ROLE, ESCROW_ENGINE),
            "Grant RECORDER_ROLE on ReputationSystem to EscrowEngine"
        );
        console.log("  Proposal", id, "-> EscrowEngine");

        id = gov.createAdminProposal(
            REPUTATION_SYSTEM,
            abi.encodeWithSelector(AccessControl.grantRole.selector, RECORDER_ROLE, DISPUTE_ARBITRATION),
            "Grant RECORDER_ROLE on ReputationSystem to DisputeArbitration"
        );
        console.log("  Proposal", id, "-> DisputeArbitration");

        id = gov.createAdminProposal(
            REPUTATION_SYSTEM,
            abi.encodeWithSelector(AccessControl.grantRole.selector, RECORDER_ROLE, LOAN_ENGINE),
            "Grant RECORDER_ROLE on ReputationSystem to LoanEngine"
        );
        console.log("  Proposal", id, "-> LoanEngine");

        id = gov.createAdminProposal(
            REPUTATION_SYSTEM,
            abi.encodeWithSelector(AccessControl.grantRole.selector, RECORDER_ROLE, X402_CREDIT_FACILITY),
            "Grant RECORDER_ROLE on ReputationSystem to X402CreditFacility"
        );
        console.log("  Proposal", id, "-> X402CreditFacility");

        id = gov.createAdminProposal(
            REPUTATION_SYSTEM,
            abi.encodeWithSelector(AccessControl.grantRole.selector, RECORDER_ROLE, insurancePool),
            "Grant RECORDER_ROLE on ReputationSystem to InsurancePool"
        );
        console.log("  Proposal", id, "-> InsurancePool");
    }

    function _grantSlasherRoles() internal {
        console.log("");
        console.log("StakingManager - SLASHER_ROLE:");

        uint256 id = gov.createAdminProposal(
            STAKING_MANAGER,
            abi.encodeWithSelector(AccessControl.grantRole.selector, SLASHER_ROLE, DISPUTE_ARBITRATION),
            "Grant SLASHER_ROLE on StakingManager to DisputeArbitration"
        );
        console.log("  Proposal", id, "-> DisputeArbitration");

        id = gov.createAdminProposal(
            STAKING_MANAGER,
            abi.encodeWithSelector(AccessControl.grantRole.selector, SLASHER_ROLE, SYBIL_GUARD),
            "Grant SLASHER_ROLE on StakingManager to SybilGuard"
        );
        console.log("  Proposal", id, "-> SybilGuard");

        id = gov.createAdminProposal(
            STAKING_MANAGER,
            abi.encodeWithSelector(AccessControl.grantRole.selector, SLASHER_ROLE, LOAN_ENGINE),
            "Grant SLASHER_ROLE on StakingManager to LoanEngine"
        );
        console.log("  Proposal", id, "-> LoanEngine");

        id = gov.createAdminProposal(
            STAKING_MANAGER,
            abi.encodeWithSelector(AccessControl.grantRole.selector, SLASHER_ROLE, X402_CREDIT_FACILITY),
            "Grant SLASHER_ROLE on StakingManager to X402CreditFacility"
        );
        console.log("  Proposal", id, "-> X402CreditFacility");
    }

    function _grantLockerRoles() internal {
        console.log("");
        console.log("StakingManager - LOCKER_ROLE:");

        uint256 id = gov.createAdminProposal(
            STAKING_MANAGER,
            abi.encodeWithSelector(AccessControl.grantRole.selector, LOCKER_ROLE, LOAN_ENGINE),
            "Grant LOCKER_ROLE on StakingManager to LoanEngine"
        );
        console.log("  Proposal", id, "-> LoanEngine");

        id = gov.createAdminProposal(
            STAKING_MANAGER,
            abi.encodeWithSelector(AccessControl.grantRole.selector, LOCKER_ROLE, X402_CREDIT_FACILITY),
            "Grant LOCKER_ROLE on StakingManager to X402CreditFacility"
        );
        console.log("  Proposal", id, "-> X402CreditFacility");
    }

    function _grantCreditFacilityRoles(address deployer) internal {
        console.log("");
        console.log("X402CreditFacility - operational roles:");

        uint256 id = gov.createAdminProposal(
            X402_CREDIT_FACILITY,
            abi.encodeWithSelector(AccessControl.grantRole.selector, FACILITATOR_ROLE, deployer),
            "Grant FACILITATOR_ROLE on X402CreditFacility to deployer (temp)"
        );
        console.log("  Proposal", id, "-> FACILITATOR_ROLE to deployer");

        id = gov.createAdminProposal(
            X402_CREDIT_FACILITY,
            abi.encodeWithSelector(AccessControl.grantRole.selector, POOL_MANAGER_ROLE, deployer),
            "Grant POOL_MANAGER_ROLE on X402CreditFacility to deployer (temp)"
        );
        console.log("  Proposal", id, "-> POOL_MANAGER_ROLE to deployer");
    }

    function _logNextSteps() internal pure {
        console.log("");
        console.log("=============================================");
        console.log("");
        console.log("NEXT STEPS:");
        console.log("  1. Cruz approves each proposal:");
        console.log("     cast send 0x9b7E2b8cf7de5ef1f85038b050952DC1D4596319");
        console.log("       'approveAdminProposal(uint256)' <ID>");
        console.log("       --rpc-url $BASE_RPC_URL --private-key <CRUZ_KEY>");
        console.log("");
        console.log("  2. One agent wallet approves each (3/3 threshold):");
        console.log("     cast send 0x9b7E2b8cf7de5ef1f85038b050952DC1D4596319");
        console.log("       'approveAdminProposal(uint256)' <ID>");
        console.log("       --rpc-url $BASE_RPC_URL --private-key <AGENT_KEY>");
        console.log("");
        console.log("  3. After 24h timelock, anyone executes:");
        console.log("     cast send 0x9b7E2b8cf7de5ef1f85038b050952DC1D4596319");
        console.log("       'executeAdminProposal(uint256)' <ID>");
        console.log("       --rpc-url $BASE_RPC_URL --private-key <ANY_KEY>");
    }
}
