// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/LOBToken.sol";
import "../src/StakingManager.sol";
import "../src/ReputationSystem.sol";
import "../src/ServiceRegistry.sol";
import "../src/DisputeArbitration.sol";
import "../src/EscrowEngine.sol";
import "../src/SkillRegistry.sol";
import "../src/PipelineRouter.sol";
import "../src/LoanEngine.sol";
import "../src/X402CreditFacility.sol";
import "../src/AirdropClaimV2.sol";
import "../src/SybilGuard.sol";
import "../src/TreasuryGovernor.sol";
import "../src/RewardDistributor.sol";
import "../src/StakingRewards.sol";
import "../src/LiquidityMining.sol";
import "../src/RewardScheduler.sol";
import "../src/verifiers/Groth16Verifier.sol";

/**
 * @title DeployScript
 * @notice Full protocol deployment for LOBSTR on Base.
 *
 *   Deployment order (respects dependency graph):
 *     1. LOBToken
 *     2. ReputationSystem
 *     3. StakingManager
 *     4. TreasuryGovernor
 *     5. SybilGuard
 *     6. ServiceRegistry
 *     7. DisputeArbitration
 *     8. EscrowEngine
 *     9. SkillRegistry
 *    10. PipelineRouter
 *    11. LoanEngine
 *    12. X402CreditFacility
 *    13. Role grants
 *    14. Groth16Verifier
 *    15. AirdropClaimV2
 *
 *   Required .env variables:
 *     PRIVATE_KEY, TREASURY_ADDRESS, DISTRIBUTION_ADDRESS,
 *     SIGNER_2_ADDRESS, SIGNER_3_ADDRESS, APPROVAL_SIGNER_ADDRESS
 *
 *   Usage:
 *     forge script script/Deploy.s.sol:DeployScript \
 *       --rpc-url $BASE_SEPOLIA_RPC_URL \
 *       --broadcast --verify -vvvv
 */
contract DeployScript is Script {
    // ── Deployed addresses (populated during run) ──────────────────────
    LOBToken public token;
    ReputationSystem public reputation;
    StakingManager public staking;
    TreasuryGovernor public treasuryGov;
    SybilGuard public sybilGuard;
    ServiceRegistry public registry;
    DisputeArbitration public dispute;
    EscrowEngine public escrow;
    SkillRegistry public skillRegistry;
    PipelineRouter public pipelineRouter;
    LoanEngine public loanEngine;
    X402CreditFacility public creditFacility;
    RewardDistributor public rewardDist;
    StakingRewards public stakingRewards;
    LiquidityMining public liquidityMining;
    RewardScheduler public rewardScheduler;
    Groth16Verifier public zkVerifier;
    AirdropClaimV2 public airdropV2;
    address public deployer;

    function run() external {
        address treasury = vm.envAddress("TREASURY_ADDRESS");
        address distributionAddress = vm.envAddress("DISTRIBUTION_ADDRESS");

        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        deployer = vm.addr(deployerKey);
        vm.startBroadcast(deployerKey);

        _deployCore(distributionAddress);
        _deployGovernance();
        _deployRewardDistributor();
        _deploySybilGuard();
        _deployMarketplace();
        _deploySkillMarketplace();
        _deployLoanEngine();
        _deployCreditFacility();
        _deployRewards();
        _grantRoles();
        _transferAdmin();
        _deployAirdrop(treasury);

        vm.stopBroadcast();

        _logSummary(treasury, distributionAddress);
    }

    // ── Step 1-3: Core token infrastructure ────────────────────────────
    function _deployCore(address distributionAddress) internal {
        // 1. LOBToken — mints 1B LOB to distributionAddress
        token = new LOBToken(distributionAddress);
        console.log("LOBToken:", address(token));

        // 2. ReputationSystem
        reputation = new ReputationSystem();
        console.log("ReputationSystem:", address(reputation));

        // 3. StakingManager
        staking = new StakingManager(address(token));
        console.log("StakingManager:", address(staking));
    }

    // ── Step 4: TreasuryGovernor (multisig) ────────────────────────────
    function _deployGovernance() internal {
        address[] memory signers = new address[](3);
        signers[0] = deployer;
        signers[1] = vm.envAddress("SIGNER_2_ADDRESS");
        signers[2] = vm.envAddress("SIGNER_3_ADDRESS");

        treasuryGov = new TreasuryGovernor(signers, 2, address(token));
        console.log("TreasuryGovernor:", address(treasuryGov));
    }

    // ── Step 4.5: RewardDistributor ──────────────────────────────────────
    function _deployRewardDistributor() internal {
        rewardDist = new RewardDistributor();
        console.log("RewardDistributor:", address(rewardDist));
    }

    // ── Step 5: SybilGuard ─────────────────────────────────────────────
    function _deploySybilGuard() internal {
        sybilGuard = new SybilGuard(
            address(token),
            address(staking),
            address(treasuryGov),
            address(rewardDist)
        );
        console.log("SybilGuard:", address(sybilGuard));
    }

    // ── Steps 6-8: Marketplace contracts ───────────────────────────────
    function _deployMarketplace() internal {
        // 6. ServiceRegistry
        registry = new ServiceRegistry(
            address(staking),
            address(reputation),
            address(sybilGuard)
        );
        console.log("ServiceRegistry:", address(registry));

        // 7. DisputeArbitration
        dispute = new DisputeArbitration(
            address(token),
            address(staking),
            address(reputation),
            address(sybilGuard),
            address(rewardDist)
        );
        console.log("DisputeArbitration:", address(dispute));

        // 8. EscrowEngine
        escrow = new EscrowEngine(
            address(token),
            address(registry),
            address(staking),
            address(dispute),
            address(reputation),
            vm.envAddress("TREASURY_ADDRESS"),
            address(sybilGuard)
        );
        console.log("EscrowEngine:", address(escrow));
    }

    // ── Steps 9-10: Skill Marketplace ──────────────────────────────────
    function _deploySkillMarketplace() internal {
        // 9. SkillRegistry
        skillRegistry = new SkillRegistry(
            address(token),
            address(staking),
            address(reputation),
            address(sybilGuard),
            address(escrow),
            vm.envAddress("TREASURY_ADDRESS")
        );
        console.log("SkillRegistry:", address(skillRegistry));

        // 10. PipelineRouter
        pipelineRouter = new PipelineRouter(
            address(skillRegistry),
            address(staking),
            address(reputation),
            address(sybilGuard)
        );
        console.log("PipelineRouter:", address(pipelineRouter));
    }

    // ── Step 11: LoanEngine ──────────────────────────────────────────────
    function _deployLoanEngine() internal {
        loanEngine = new LoanEngine(
            address(token),
            address(reputation),
            address(staking),
            address(sybilGuard),
            vm.envAddress("TREASURY_ADDRESS")
        );
        console.log("LoanEngine:", address(loanEngine));
    }

    // ── Step 10: X402CreditFacility ──────────────────────────────────────
    function _deployCreditFacility() internal {
        creditFacility = new X402CreditFacility(
            address(token),
            address(escrow),
            address(dispute),
            address(reputation),
            address(staking),
            address(sybilGuard),
            vm.envAddress("TREASURY_ADDRESS")
        );
        console.log("X402CreditFacility:", address(creditFacility));
    }

    // ── StakingRewards + LiquidityMining + RewardScheduler ────────────────
    function _deployRewards() internal {
        stakingRewards = new StakingRewards(address(staking), address(sybilGuard));
        console.log("StakingRewards:", address(stakingRewards));

        address lpToken = vm.envAddress("LP_TOKEN_ADDRESS");
        liquidityMining = new LiquidityMining(lpToken, address(token), address(staking), address(sybilGuard));
        console.log("LiquidityMining:", address(liquidityMining));

        rewardScheduler = new RewardScheduler(address(stakingRewards), address(liquidityMining));
        console.log("RewardScheduler:", address(rewardScheduler));

        stakingRewards.addRewardToken(address(token));
        stakingRewards.grantRole(stakingRewards.REWARD_NOTIFIER_ROLE(), address(rewardScheduler));
        liquidityMining.grantRole(liquidityMining.REWARD_NOTIFIER_ROLE(), address(rewardScheduler));
    }

    // ── Cross-contract role grants + wiring ─────────────────────────────
    function _grantRoles() internal {
        reputation.grantRole(reputation.RECORDER_ROLE(), address(escrow));
        reputation.grantRole(reputation.RECORDER_ROLE(), address(dispute));
        reputation.grantRole(reputation.RECORDER_ROLE(), address(loanEngine));
        reputation.grantRole(reputation.RECORDER_ROLE(), address(creditFacility));
        reputation.grantRole(reputation.RECORDER_ROLE(), address(skillRegistry));
        staking.grantRole(staking.SLASHER_ROLE(), address(dispute));
        staking.grantRole(staking.SLASHER_ROLE(), address(sybilGuard));
        staking.grantRole(staking.SLASHER_ROLE(), address(loanEngine));
        staking.grantRole(staking.SLASHER_ROLE(), address(creditFacility));
        dispute.grantRole(dispute.ESCROW_ROLE(), address(escrow));

        // SkillRegistry <-> EscrowEngine wiring
        escrow.grantRole(escrow.SKILL_REGISTRY_ROLE(), address(skillRegistry));

        // Wire circular dependency: DisputeArbitration <-> EscrowEngine
        dispute.setEscrowEngine(address(escrow));

        // Wire SybilGuard -> DisputeArbitration for banned arbitrator removal
        sybilGuard.setDisputeArbitration(address(dispute));
        dispute.grantRole(dispute.SYBIL_GUARD_ROLE(), address(sybilGuard));

        // Grant SYBIL_GUARD_ROLE on TreasuryGovernor to SybilGuard
        treasuryGov.grantRole(treasuryGov.SYBIL_GUARD_ROLE(), address(sybilGuard));

        // RewardDistributor role grants
        rewardDist.grantRole(rewardDist.DISPUTE_ROLE(), address(dispute));
        rewardDist.grantRole(rewardDist.SYBIL_GUARD_ROLE(), address(sybilGuard));

        console.log("Roles granted, escrow wired");
    }

    // ── Step 9.5: Transfer DEFAULT_ADMIN_ROLE to TreasuryGovernor ─────
    function _transferAdmin() internal {
        // Grant DEFAULT_ADMIN_ROLE to TreasuryGovernor on all AccessControl contracts
        reputation.grantRole(reputation.DEFAULT_ADMIN_ROLE(), address(treasuryGov));
        staking.grantRole(staking.DEFAULT_ADMIN_ROLE(), address(treasuryGov));
        dispute.grantRole(dispute.DEFAULT_ADMIN_ROLE(), address(treasuryGov));
        escrow.grantRole(escrow.DEFAULT_ADMIN_ROLE(), address(treasuryGov));
        skillRegistry.grantRole(skillRegistry.DEFAULT_ADMIN_ROLE(), address(treasuryGov));
        pipelineRouter.grantRole(pipelineRouter.DEFAULT_ADMIN_ROLE(), address(treasuryGov));
        loanEngine.grantRole(loanEngine.DEFAULT_ADMIN_ROLE(), address(treasuryGov));
        creditFacility.grantRole(creditFacility.DEFAULT_ADMIN_ROLE(), address(treasuryGov));
        sybilGuard.grantRole(sybilGuard.DEFAULT_ADMIN_ROLE(), address(treasuryGov));
        registry.grantRole(registry.DEFAULT_ADMIN_ROLE(), address(treasuryGov));
        rewardDist.grantRole(rewardDist.DEFAULT_ADMIN_ROLE(), address(treasuryGov));
        stakingRewards.grantRole(stakingRewards.DEFAULT_ADMIN_ROLE(), address(treasuryGov));
        liquidityMining.grantRole(liquidityMining.DEFAULT_ADMIN_ROLE(), address(treasuryGov));
        rewardScheduler.grantRole(rewardScheduler.DEFAULT_ADMIN_ROLE(), address(treasuryGov));

        // Renounce deployer's admin role on all contracts (including TreasuryGovernor)
        reputation.renounceRole(reputation.DEFAULT_ADMIN_ROLE(), deployer);
        staking.renounceRole(staking.DEFAULT_ADMIN_ROLE(), deployer);
        dispute.renounceRole(dispute.DEFAULT_ADMIN_ROLE(), deployer);
        escrow.renounceRole(escrow.DEFAULT_ADMIN_ROLE(), deployer);
        skillRegistry.renounceRole(skillRegistry.DEFAULT_ADMIN_ROLE(), deployer);
        pipelineRouter.renounceRole(pipelineRouter.DEFAULT_ADMIN_ROLE(), deployer);
        loanEngine.renounceRole(loanEngine.DEFAULT_ADMIN_ROLE(), deployer);
        creditFacility.renounceRole(creditFacility.DEFAULT_ADMIN_ROLE(), deployer);
        sybilGuard.renounceRole(sybilGuard.DEFAULT_ADMIN_ROLE(), deployer);
        registry.renounceRole(registry.DEFAULT_ADMIN_ROLE(), deployer);
        rewardDist.renounceRole(rewardDist.DEFAULT_ADMIN_ROLE(), deployer);
        stakingRewards.renounceRole(stakingRewards.DEFAULT_ADMIN_ROLE(), deployer);
        liquidityMining.renounceRole(liquidityMining.DEFAULT_ADMIN_ROLE(), deployer);
        rewardScheduler.renounceRole(rewardScheduler.DEFAULT_ADMIN_ROLE(), deployer);
        treasuryGov.renounceRole(treasuryGov.DEFAULT_ADMIN_ROLE(), deployer);

        console.log("Admin transferred to TreasuryGovernor, deployer renounced");
    }

    // ── Steps 10-11: ZK verifier + Airdrop ─────────────────────────────
    function _deployAirdrop(address treasury) internal {
        // 10. Groth16Verifier
        zkVerifier = new Groth16Verifier();
        console.log("Groth16Verifier:", address(zkVerifier));

        // 11. AirdropClaimV2
        address approvalSigner = vm.envAddress("APPROVAL_SIGNER_ADDRESS");
        uint256 difficultyTarget = type(uint256).max >> 26;
        uint256 maxAirdropPool = 400_000_000 ether;

        airdropV2 = new AirdropClaimV2(
            address(token),
            address(zkVerifier),
            block.timestamp,
            block.timestamp + 90 days,
            address(0), // no V1 migration
            approvalSigner,
            difficultyTarget,
            maxAirdropPool
        );
        console.log("AirdropClaimV2:", address(airdropV2));
        console.log("");
        console.log("IMPORTANT: Transfer", maxAirdropPool / 1 ether, "LOB to AirdropClaimV2 at", address(airdropV2));
        console.log("  From distribution address holding the 1B supply.");
        console.log("  Treasury:", treasury);
    }

    // ── Summary ────────────────────────────────────────────────────────
    function _logSummary(address treasury, address distributionAddress) internal view {
        console.log("");
        console.log("========== DEPLOYMENT COMPLETE ==========");
        console.log("Deployer:           ", deployer);
        console.log("Treasury:           ", treasury);
        console.log("Distribution:       ", distributionAddress);
        console.log("");
        console.log("LOBToken:           ", address(token));
        console.log("ReputationSystem:   ", address(reputation));
        console.log("StakingManager:     ", address(staking));
        console.log("TreasuryGovernor:   ", address(treasuryGov));
        console.log("SybilGuard:         ", address(sybilGuard));
        console.log("RewardDistributor:  ", address(rewardDist));
        console.log("ServiceRegistry:    ", address(registry));
        console.log("DisputeArbitration: ", address(dispute));
        console.log("EscrowEngine:       ", address(escrow));
        console.log("SkillRegistry:      ", address(skillRegistry));
        console.log("PipelineRouter:     ", address(pipelineRouter));
        console.log("LoanEngine:         ", address(loanEngine));
        console.log("X402CreditFacility: ", address(creditFacility));
        console.log("StakingRewards:     ", address(stakingRewards));
        console.log("LiquidityMining:    ", address(liquidityMining));
        console.log("RewardScheduler:    ", address(rewardScheduler));
        console.log("Groth16Verifier:    ", address(zkVerifier));
        console.log("AirdropClaimV2:     ", address(airdropV2));
        console.log("=========================================");
        console.log("");
        console.log("POST-DEPLOY CHECKLIST:");
        console.log("  1. Transfer 400M LOB to AirdropClaimV2 (agent airdrop)");
        console.log("  2. Transfer 300M LOB to TreasuryGovernor (protocol treasury)");
        console.log("  3. Seed DEX LP with 150M LOB (LP reserve); send LP tokens to TreasuryGovernor");
        console.log("  4. Grant WATCHER_ROLE + JUDGE_ROLE on SybilGuard");
        console.log("  5. Grant FACILITATOR_ROLE + POOL_MANAGER_ROLE on X402CreditFacility");
        console.log("  6. Seed X402CreditFacility pool with LOB via depositToPool()");
        console.log("  7. Verify all contracts on BaseScan");
        console.log("  8. Grant GATEWAY_ROLE on SkillRegistry to API gateway address");
        console.log("  9. Fund RewardScheduler with LOB via topUp() + create streams");
        console.log(" 10. Smoke-test: createListing, createJob, stake, listSkill");
        console.log("  NOTE: DEFAULT_ADMIN_ROLE already transferred to TreasuryGovernor");
    }
}
