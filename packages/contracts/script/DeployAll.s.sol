// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/LOBToken.sol";
import "../src/StakingManager.sol";
import "../src/ReputationSystem.sol";
import "../src/ServiceRegistry.sol";
import "../src/DisputeArbitration.sol";
import "../src/EscrowEngine.sol";
import "../src/LoanEngine.sol";
import "../src/X402CreditFacility.sol";
import "../src/AirdropClaimV3.sol";
import "../src/TeamVesting.sol";
import "../src/SybilGuard.sol";
import "../src/TreasuryGovernor.sol";
import "../src/RewardDistributor.sol";
import "../src/StakingRewards.sol";
import "../src/LiquidityMining.sol";
import "../src/RewardScheduler.sol";
import "../src/LightningGovernor.sol";
import "../src/verifiers/Groth16VerifierV4.sol";

/**
 * @title DeployAllScript
 * @notice Full protocol redeploy for LOBSTR V3 on Base.
 *         Fresh LOBToken (1B supply) with proper token distribution.
 *         ZK Merkle airdrop with milestone unlocks.
 *         Arbitrator/moderator reward system via RewardDistributor.
 *
 *   Deployment order:
 *     1.  LOBToken (1B minted to deployer)
 *     2.  ReputationSystem
 *     3.  StakingManager
 *     4.  TreasuryGovernor (multisig)
 *     5.  RewardDistributor
 *     6.  SybilGuard (with RewardDistributor)
 *     7.  ServiceRegistry
 *     8.  DisputeArbitration (with RewardDistributor)
 *     9.  EscrowEngine
 *    10.  LoanEngine
 *    11.  X402CreditFacility
 *    12.  StakingRewards
 *    13.  LiquidityMining
 *    14.  RewardScheduler
 *    15.  LightningGovernor
 *    16.  Groth16VerifierV4
 *    17.  AirdropClaimV3 (ZK Merkle + milestones)
 *    18.  TeamVesting (3yr vest, 6mo cliff)
 *    19.  Role grants + admin transfer
 *    20.  Token distribution
 *
 *   Required .env variables:
 *     PRIVATE_KEY,
 *     SIGNER_2_ADDRESS, SIGNER_3_ADDRESS, SIGNER_4_ADDRESS,
 *     APPROVAL_SIGNER_ADDRESS, ROOT_UPDATER_ADDRESS,
 *     TEAM_BENEFICIARY_ADDRESS, LP_WALLET_ADDRESS,
 *     LP_TOKEN_ADDRESS, SENTINEL_ADDRESS, ARBITER_ADDRESS,
 *     STEWARD_ADDRESS, GUARDIAN_ADDRESS
 *
 *   Usage:
 *     forge script script/DeployAll.s.sol:DeployAllScript \
 *       --rpc-url $BASE_RPC_URL \
 *       --broadcast --verify -vvvv
 */
contract DeployAllScript is Script {
    // ── Deployed addresses ───────────────────────────────────────
    LOBToken public token;
    ReputationSystem public reputation;
    StakingManager public staking;
    TreasuryGovernor public treasuryGov;
    RewardDistributor public rewardDist;
    SybilGuard public sybilGuard;
    ServiceRegistry public registry;
    DisputeArbitration public dispute;
    EscrowEngine public escrow;
    LoanEngine public loanEngine;
    X402CreditFacility public creditFacility;
    StakingRewards public stakingRewards;
    LiquidityMining public liquidityMining;
    RewardScheduler public rewardScheduler;
    LightningGovernor public lightningGov;
    Groth16VerifierV4 public verifierV4;
    AirdropClaimV3 public airdropV3;
    TeamVesting public teamVesting;
    address public deployer;

    // ── Token distribution amounts ───────────────────────────────
    uint256 constant AIRDROP_POOL   = 400_000_000 ether; // 40%
    uint256 constant TREASURY_ALLOC = 300_000_000 ether; // 30%
    uint256 constant TEAM_ALLOC     = 150_000_000 ether; // 15%
    uint256 constant LP_ALLOC       = 150_000_000 ether; // 15%

    // ── Airdrop claim window ─────────────────────────────────────
    // Ends 2026-12-31 23:59:00 MST (UTC-7) = 2027-01-01 06:59:00 UTC
    uint256 constant CLAIM_WINDOW_END = 1798786740;

    // ── Vesting params ───────────────────────────────────────────
    uint256 constant VESTING_CLIFF    = 180 days;  // 6 months
    uint256 constant VESTING_DURATION = 1095 days; // 3 years

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        deployer = vm.addr(deployerKey);
        vm.startBroadcast(deployerKey);

        // 1-3: Core
        _deployCore();

        // 4: TreasuryGovernor
        _deployGovernance();

        // 5: RewardDistributor
        _deployRewardDistributor();

        // 6: SybilGuard
        _deploySybilGuard();

        // 7-9: Marketplace
        _deployMarketplace();

        // 10: LoanEngine
        _deployLoanEngine();

        // 11: X402CreditFacility
        _deployCreditFacility();

        // 12-14: StakingRewards + LiquidityMining + RewardScheduler
        _deployRewards();

        // 15: LightningGovernor
        _deployLightningGovernor();

        // 16-17: Verifier + Airdrop
        _deployAirdrop();

        // 18: TeamVesting
        _deployTeamVesting();

        // 19: Roles + admin transfer
        _grantRoles();
        _transferAdmin();

        // 20: Token distribution
        _distributeTokens();

        vm.stopBroadcast();

        _logSummary();
    }

    // ── 1-3: Core ────────────────────────────────────────────────
    function _deployCore() internal {
        token = new LOBToken(deployer);
        console.log("LOBToken:", address(token));

        reputation = new ReputationSystem();
        console.log("ReputationSystem:", address(reputation));

        staking = new StakingManager(address(token));
        console.log("StakingManager:", address(staking));
    }

    // ── 4: TreasuryGovernor ──────────────────────────────────────
    function _deployGovernance() internal {
        address[] memory signers = new address[](4);
        signers[0] = deployer;
        signers[1] = vm.envAddress("SIGNER_2_ADDRESS");
        signers[2] = vm.envAddress("SIGNER_3_ADDRESS");
        signers[3] = vm.envAddress("SIGNER_4_ADDRESS");

        treasuryGov = new TreasuryGovernor(signers, 3, address(token));
        console.log("TreasuryGovernor:", address(treasuryGov));
    }

    // ── 5: RewardDistributor ─────────────────────────────────────
    function _deployRewardDistributor() internal {
        rewardDist = new RewardDistributor();
        console.log("RewardDistributor:", address(rewardDist));
    }

    // ── 6: SybilGuard ────────────────────────────────────────────
    function _deploySybilGuard() internal {
        sybilGuard = new SybilGuard(
            address(token),
            address(staking),
            address(treasuryGov),
            address(rewardDist)
        );
        console.log("SybilGuard:", address(sybilGuard));
    }

    // ── 7-9: Marketplace ─────────────────────────────────────────
    function _deployMarketplace() internal {
        registry = new ServiceRegistry(
            address(staking),
            address(reputation),
            address(sybilGuard)
        );
        console.log("ServiceRegistry:", address(registry));

        dispute = new DisputeArbitration(
            address(token),
            address(staking),
            address(reputation),
            address(sybilGuard),
            address(rewardDist)
        );
        console.log("DisputeArbitration:", address(dispute));

        escrow = new EscrowEngine(
            address(token),
            address(registry),
            address(staking),
            address(dispute),
            address(reputation),
            address(treasuryGov),
            address(sybilGuard)
        );
        console.log("EscrowEngine:", address(escrow));
    }

    // ── 10: LoanEngine ────────────────────────────────────────────
    function _deployLoanEngine() internal {
        loanEngine = new LoanEngine(
            address(token),
            address(reputation),
            address(staking),
            address(sybilGuard),
            address(treasuryGov)
        );
        console.log("LoanEngine:", address(loanEngine));
    }

    // ── 11: X402CreditFacility ───────────────────────────────────
    function _deployCreditFacility() internal {
        creditFacility = new X402CreditFacility(
            address(token),
            address(escrow),
            address(dispute),
            address(reputation),
            address(staking),
            address(sybilGuard),
            address(treasuryGov)
        );
        console.log("X402CreditFacility:", address(creditFacility));
    }

    // ── 12-14: StakingRewards + LiquidityMining + RewardScheduler
    function _deployRewards() internal {
        stakingRewards = new StakingRewards(address(staking), address(sybilGuard));
        console.log("StakingRewards:", address(stakingRewards));

        address lpToken = vm.envAddress("LP_TOKEN_ADDRESS");
        liquidityMining = new LiquidityMining(lpToken, address(token), address(staking), address(sybilGuard));
        console.log("LiquidityMining:", address(liquidityMining));

        rewardScheduler = new RewardScheduler(address(stakingRewards), address(liquidityMining));
        console.log("RewardScheduler:", address(rewardScheduler));

        // Add LOB as reward token on StakingRewards
        stakingRewards.addRewardToken(address(token));

        // Grant REWARD_NOTIFIER_ROLE to scheduler
        stakingRewards.grantRole(stakingRewards.REWARD_NOTIFIER_ROLE(), address(rewardScheduler));
        liquidityMining.grantRole(liquidityMining.REWARD_NOTIFIER_ROLE(), address(rewardScheduler));
    }

    // ── 15: LightningGovernor ─────────────────────────────────────
    function _deployLightningGovernor() internal {
        address sentinel = vm.envAddress("SENTINEL_ADDRESS");
        address arbiter = vm.envAddress("ARBITER_ADDRESS");
        address steward = vm.envAddress("STEWARD_ADDRESS");
        address lgGuardian = vm.envAddress("GUARDIAN_ADDRESS");

        address[] memory executors = new address[](3);
        executors[0] = sentinel;
        executors[1] = arbiter;
        executors[2] = steward;

        lightningGov = new LightningGovernor(
            address(staking),
            address(treasuryGov),
            executors,
            lgGuardian
        );
        console.log("LightningGovernor:", address(lightningGov));
    }

    // ── 16-17: Verifier + Airdrop ────────────────────────────────
    function _deployAirdrop() internal {
        verifierV4 = new Groth16VerifierV4();
        console.log("Groth16VerifierV4:", address(verifierV4));

        address approvalSigner = vm.envAddress("APPROVAL_SIGNER_ADDRESS");
        uint256 difficultyTarget = type(uint256).max >> 26;

        airdropV3 = new AirdropClaimV3(
            address(token),
            address(verifierV4),
            approvalSigner,
            CLAIM_WINDOW_END,
            difficultyTarget,
            AIRDROP_POOL,
            address(reputation),
            address(registry),
            address(staking),
            address(dispute)
        );
        console.log("AirdropClaimV3:", address(airdropV3));
    }

    // ── 14: TeamVesting ──────────────────────────────────────────
    function _deployTeamVesting() internal {
        address teamBeneficiary = vm.envAddress("TEAM_BENEFICIARY_ADDRESS");

        teamVesting = new TeamVesting(
            address(token),
            teamBeneficiary,
            block.timestamp,
            VESTING_CLIFF,
            VESTING_DURATION
        );
        console.log("TeamVesting:", address(teamVesting));
    }

    // ── 15a: Role grants ─────────────────────────────────────────
    function _grantRoles() internal {
        // ReputationSystem RECORDER_ROLE
        reputation.grantRole(reputation.RECORDER_ROLE(), address(escrow));
        reputation.grantRole(reputation.RECORDER_ROLE(), address(dispute));
        reputation.grantRole(reputation.RECORDER_ROLE(), address(loanEngine));
        reputation.grantRole(reputation.RECORDER_ROLE(), address(creditFacility));

        // StakingManager SLASHER_ROLE
        staking.grantRole(staking.SLASHER_ROLE(), address(dispute));
        staking.grantRole(staking.SLASHER_ROLE(), address(sybilGuard));
        staking.grantRole(staking.SLASHER_ROLE(), address(loanEngine));
        staking.grantRole(staking.SLASHER_ROLE(), address(creditFacility));

        // DisputeArbitration ESCROW_ROLE + wiring
        dispute.grantRole(dispute.ESCROW_ROLE(), address(escrow));
        dispute.setEscrowEngine(address(escrow));
        dispute.grantRole(dispute.SYBIL_GUARD_ROLE(), address(sybilGuard));

        // SybilGuard wiring
        sybilGuard.setDisputeArbitration(address(dispute));
        treasuryGov.grantRole(treasuryGov.SYBIL_GUARD_ROLE(), address(sybilGuard));

        // RewardDistributor roles
        rewardDist.grantRole(rewardDist.DISPUTE_ROLE(), address(dispute));
        rewardDist.grantRole(rewardDist.SYBIL_GUARD_ROLE(), address(sybilGuard));

        // AirdropClaimV3 ROOT_UPDATER_ROLE
        address rootUpdater = vm.envAddress("ROOT_UPDATER_ADDRESS");
        airdropV3.grantRole(airdropV3.ROOT_UPDATER_ROLE(), rootUpdater);

        console.log("Roles granted, escrow wired, reward distributor wired");
    }

    // ── 15b: Transfer admin to TreasuryGovernor ──────────────────
    function _transferAdmin() internal {
        bytes32 adminRole = reputation.DEFAULT_ADMIN_ROLE();

        // LightningGovernor — grant admin on target contracts it can fast-track
        staking.grantRole(adminRole, address(lightningGov));
        dispute.grantRole(adminRole, address(lightningGov));
        escrow.grantRole(adminRole, address(lightningGov));
        registry.grantRole(adminRole, address(lightningGov));
        rewardScheduler.grantRole(adminRole, address(lightningGov));
        stakingRewards.grantRole(adminRole, address(lightningGov));
        liquidityMining.grantRole(adminRole, address(lightningGov));

        reputation.grantRole(adminRole, address(treasuryGov));
        staking.grantRole(adminRole, address(treasuryGov));
        dispute.grantRole(adminRole, address(treasuryGov));
        escrow.grantRole(adminRole, address(treasuryGov));
        loanEngine.grantRole(adminRole, address(treasuryGov));
        creditFacility.grantRole(adminRole, address(treasuryGov));
        sybilGuard.grantRole(adminRole, address(treasuryGov));
        registry.grantRole(adminRole, address(treasuryGov));
        rewardDist.grantRole(adminRole, address(treasuryGov));
        stakingRewards.grantRole(adminRole, address(treasuryGov));
        liquidityMining.grantRole(adminRole, address(treasuryGov));
        rewardScheduler.grantRole(adminRole, address(treasuryGov));
        airdropV3.grantRole(adminRole, address(treasuryGov));

        reputation.renounceRole(adminRole, deployer);
        staking.renounceRole(adminRole, deployer);
        dispute.renounceRole(adminRole, deployer);
        escrow.renounceRole(adminRole, deployer);
        loanEngine.renounceRole(adminRole, deployer);
        creditFacility.renounceRole(adminRole, deployer);
        sybilGuard.renounceRole(adminRole, deployer);
        registry.renounceRole(adminRole, deployer);
        rewardDist.renounceRole(adminRole, deployer);
        stakingRewards.renounceRole(adminRole, deployer);
        liquidityMining.renounceRole(adminRole, deployer);
        rewardScheduler.renounceRole(adminRole, deployer);
        airdropV3.renounceRole(adminRole, deployer);
        treasuryGov.renounceRole(adminRole, deployer);

        console.log("Admin transferred to TreasuryGovernor, deployer renounced");
    }

    // ── 16: Token distribution ───────────────────────────────────
    function _distributeTokens() internal {
        address lpWallet = vm.envAddress("LP_WALLET_ADDRESS");

        // 400M → AirdropClaimV3
        token.transfer(address(airdropV3), AIRDROP_POOL);
        console.log("Transferred 400M LOB to AirdropClaimV3");

        // 300M → TreasuryGovernor
        token.transfer(address(treasuryGov), TREASURY_ALLOC);
        console.log("Transferred 300M LOB to TreasuryGovernor");

        // 150M → TeamVesting
        token.transfer(address(teamVesting), TEAM_ALLOC);
        teamVesting.setTotalAllocation(TEAM_ALLOC);
        console.log("Transferred 150M LOB to TeamVesting + set allocation");

        // 150M → LP wallet
        token.transfer(lpWallet, LP_ALLOC);
        console.log("Transferred 150M LOB to LP wallet:", lpWallet);

        // Verify deployer has 0 remaining
        uint256 remaining = token.balanceOf(deployer);
        console.log("Deployer remaining balance:", remaining / 1 ether, "LOB");
    }

    // ── Summary ──────────────────────────────────────────────────
    function _logSummary() internal view {
        console.log("");
        console.log("========== DEPLOYMENT COMPLETE ==========");
        console.log("Deployer:           ", deployer);
        console.log("");
        console.log("LOBToken:           ", address(token));
        console.log("ReputationSystem:   ", address(reputation));
        console.log("StakingManager:     ", address(staking));
        console.log("TreasuryGovernor:   ", address(treasuryGov));
        console.log("RewardDistributor:  ", address(rewardDist));
        console.log("SybilGuard:         ", address(sybilGuard));
        console.log("ServiceRegistry:    ", address(registry));
        console.log("DisputeArbitration: ", address(dispute));
        console.log("EscrowEngine:       ", address(escrow));
        console.log("LoanEngine:         ", address(loanEngine));
        console.log("X402CreditFacility: ", address(creditFacility));
        console.log("StakingRewards:     ", address(stakingRewards));
        console.log("LiquidityMining:    ", address(liquidityMining));
        console.log("RewardScheduler:    ", address(rewardScheduler));
        console.log("LightningGovernor:  ", address(lightningGov));
        console.log("Groth16VerifierV4:  ", address(verifierV4));
        console.log("AirdropClaimV3:     ", address(airdropV3));
        console.log("TeamVesting:        ", address(teamVesting));
        console.log("=========================================");
        console.log("");
        console.log("TOKEN DISTRIBUTION:");
        console.log("  AirdropClaimV3:   400M LOB (40%)");
        console.log("  TreasuryGovernor: 300M LOB (30%)");
        console.log("  TeamVesting:      150M LOB (15%) - 6mo cliff, 3yr vest");
        console.log("  LP Wallet:        150M LOB (15%)");
        console.log("");
        console.log("AIRDROP:");
        console.log("  Type: ZK Merkle membership + milestone unlocks");
        console.log("  Allocation: 6,000 LOB flat (1K immediate + 5x1K milestones)");
        console.log("  Claim window ends: 2026-12-31 23:59 MST (1798786740)");
        console.log("");
        console.log("REWARDS:");
        console.log("  Arbitrators: 20 LOB/1K LOB disputed, majority bonus, quality scoring");
        console.log("  Watchers: 10% of seized funds, 500 LOB bond per report");
        console.log("  Judges: 100 LOB flat per adjudication");
        console.log("");
        console.log("POST-DEPLOY CHECKLIST:");
        console.log("  1. Verify all contracts on BaseScan");
        console.log("  2. Grant WATCHER_ROLE + JUDGE_ROLE on SybilGuard");
        console.log("  3. Grant FACILITATOR_ROLE + POOL_MANAGER_ROLE on X402CreditFacility");
        console.log("  4. Seed X402CreditFacility pool with LOB via depositToPool()");
        console.log("  5. Seed DEX LP with the 150M LOB in LP wallet");
        console.log("  6. Push initial Merkle root via /update-root API");
        console.log("  7. Deposit initial reward budget to RewardDistributor");
        console.log("  8. Fund RewardScheduler with LOB via topUp() + create streams");
        console.log("  9. Smoke-test full claim flow: register, prove, claim, milestones");
        console.log("  NOTE: DEFAULT_ADMIN_ROLE transferred to TreasuryGovernor");
    }
}
