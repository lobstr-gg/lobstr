// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
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
import "../src/LightningGovernor.sol";
import "../src/verifiers/Groth16VerifierV5.sol";

/**
 * @title DeployAllScript
 * @notice Full protocol deploy for LOBSTR V5 on Base.
 *         All upgradeable contracts deployed behind ERC1967Proxy (UUPS pattern).
 *         Fresh LOBToken (1B supply) with proper token distribution.
 *         ZK airdrop with workspaceHash anti-Sybil + milestone unlocks.
 *
 *   Each upgradeable contract is deployed as:
 *     1. Deploy implementation contract (new Contract())
 *     2. Deploy ERC1967Proxy pointing to impl, with initialize() calldata
 *     3. Cast proxy address to contract type for subsequent calls
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
 *    13.  LightningGovernor
 *    14.  Groth16VerifierV5 (not proxied — pure view contract)
 *    15.  AirdropClaimV3 (ZK workspaceHash + milestones)
 *    16.  TeamVesting (3yr vest, 6mo cliff)
 *    17.  Role grants + admin transfer
 *    18.  Token distribution (750K direct to agents, rest to TeamVesting)
 *
 *   Required .env variables:
 *     PRIVATE_KEY,
 *     SIGNER_2_ADDRESS, SIGNER_3_ADDRESS, SIGNER_4_ADDRESS,
 *     APPROVAL_SIGNER_ADDRESS,
 *     TEAM_BENEFICIARY_ADDRESS, LP_WALLET_ADDRESS,
 *     SENTINEL_ADDRESS, ARBITER_ADDRESS,
 *     STEWARD_ADDRESS, GUARDIAN_ADDRESS
 *
 *   LP_TOKEN_ADDRESS NOT needed — LiquidityMining deployed separately after DEX pool creation.
 *
 *   Usage:
 *     forge script script/DeployAll.s.sol:DeployAllScript \
 *       --rpc-url $BASE_RPC_URL \
 *       --broadcast --verify -vvvv
 */
contract DeployAllScript is Script {
    // ── Deployed proxy addresses (what external callers interact with) ──
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
    LightningGovernor public lightningGov;
    Groth16VerifierV5 public verifier;
    AirdropClaimV3 public airdropV3;
    TeamVesting public teamVesting;
    address public deployer;

    // ── Token distribution amounts ───────────────────────────────
    uint256 constant AIRDROP_POOL   = 400_000_000 ether; // 40%
    uint256 constant TREASURY_ALLOC = 300_000_000 ether; // 30%
    uint256 constant TEAM_ALLOC     = 150_000_000 ether; // 15%
    uint256 constant LP_ALLOC       = 150_000_000 ether; // 15%

    // ── Agent allocations (carved out of TEAM_ALLOC) ─────────────
    uint256 constant SENTINEL_ALLOC = 250_000 ether; // Titus: 100K platinum stake + 100K principal arb + 50K buffer
    uint256 constant ARBITER_ALLOC  = 250_000 ether; // Solomon: 100K platinum stake + 100K principal arb + 50K buffer
    uint256 constant STEWARD_ALLOC  = 250_000 ether; // Daniel: 100K platinum stake + 100K principal arb + 50K buffer
    uint256 constant AGENT_TOTAL    = 750_000 ether; // Sum of agent allocations

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

        // 12: StakingRewards (LiquidityMining + RewardScheduler deferred until LP pool exists)
        _deployStakingRewards();

        // 13: LightningGovernor
        _deployLightningGovernor();

        // 14-15: Verifier + Airdrop
        _deployAirdrop();

        // 16: TeamVesting
        _deployTeamVesting();

        // 17: Roles + admin transfer
        _grantRoles();
        _transferAdmin();

        // 18: Token distribution
        _distributeTokens();

        vm.stopBroadcast();

        _logSummary();
    }

    // ── 1-3: Core ────────────────────────────────────────────────
    function _deployCore() internal {
        // LOBToken
        LOBToken tokenImpl = new LOBToken();
        ERC1967Proxy tokenProxy = new ERC1967Proxy(
            address(tokenImpl),
            abi.encodeCall(LOBToken.initialize, (deployer))
        );
        token = LOBToken(address(tokenProxy));
        console.log("LOBToken (proxy):", address(token));
        console.log("LOBToken (impl):", address(tokenImpl));

        // ReputationSystem
        ReputationSystem repImpl = new ReputationSystem();
        ERC1967Proxy repProxy = new ERC1967Proxy(
            address(repImpl),
            abi.encodeCall(ReputationSystem.initialize, ())
        );
        reputation = ReputationSystem(address(repProxy));
        console.log("ReputationSystem (proxy):", address(reputation));
        console.log("ReputationSystem (impl):", address(repImpl));

        // StakingManager
        StakingManager stakingImpl = new StakingManager();
        ERC1967Proxy stakingProxy = new ERC1967Proxy(
            address(stakingImpl),
            abi.encodeCall(StakingManager.initialize, (address(token)))
        );
        staking = StakingManager(address(stakingProxy));
        console.log("StakingManager (proxy):", address(staking));
        console.log("StakingManager (impl):", address(stakingImpl));
    }

    // ── 4: TreasuryGovernor ──────────────────────────────────────
    function _deployGovernance() internal {
        address[] memory signers = new address[](4);
        signers[0] = deployer;
        signers[1] = vm.envAddress("SIGNER_2_ADDRESS");
        signers[2] = vm.envAddress("SIGNER_3_ADDRESS");
        signers[3] = vm.envAddress("SIGNER_4_ADDRESS");

        TreasuryGovernor tgImpl = new TreasuryGovernor();
        ERC1967Proxy tgProxy = new ERC1967Proxy(
            address(tgImpl),
            abi.encodeCall(TreasuryGovernor.initialize, (signers, 3, address(token)))
        );
        treasuryGov = TreasuryGovernor(address(tgProxy));
        console.log("TreasuryGovernor (proxy):", address(treasuryGov));
        console.log("TreasuryGovernor (impl):", address(tgImpl));
    }

    // ── 5: RewardDistributor ─────────────────────────────────────
    function _deployRewardDistributor() internal {
        RewardDistributor rdImpl = new RewardDistributor();
        ERC1967Proxy rdProxy = new ERC1967Proxy(
            address(rdImpl),
            abi.encodeCall(RewardDistributor.initialize, ())
        );
        rewardDist = RewardDistributor(address(rdProxy));
        console.log("RewardDistributor (proxy):", address(rewardDist));
        console.log("RewardDistributor (impl):", address(rdImpl));
    }

    // ── 6: SybilGuard ────────────────────────────────────────────
    function _deploySybilGuard() internal {
        SybilGuard sgImpl = new SybilGuard();
        ERC1967Proxy sgProxy = new ERC1967Proxy(
            address(sgImpl),
            abi.encodeCall(SybilGuard.initialize, (
                address(token),
                address(staking),
                address(treasuryGov),
                address(rewardDist)
            ))
        );
        sybilGuard = SybilGuard(address(sgProxy));
        console.log("SybilGuard (proxy):", address(sybilGuard));
        console.log("SybilGuard (impl):", address(sgImpl));
    }

    // ── 7-9: Marketplace ─────────────────────────────────────────
    function _deployMarketplace() internal {
        // ServiceRegistry
        ServiceRegistry srImpl = new ServiceRegistry();
        ERC1967Proxy srProxy = new ERC1967Proxy(
            address(srImpl),
            abi.encodeCall(ServiceRegistry.initialize, (
                address(staking),
                address(reputation),
                address(sybilGuard)
            ))
        );
        registry = ServiceRegistry(address(srProxy));
        console.log("ServiceRegistry (proxy):", address(registry));
        console.log("ServiceRegistry (impl):", address(srImpl));

        // DisputeArbitration
        DisputeArbitration daImpl = new DisputeArbitration();
        ERC1967Proxy daProxy = new ERC1967Proxy(
            address(daImpl),
            abi.encodeCall(DisputeArbitration.initialize, (
                address(token),
                address(staking),
                address(reputation),
                address(sybilGuard),
                address(rewardDist)
            ))
        );
        dispute = DisputeArbitration(address(daProxy));
        console.log("DisputeArbitration (proxy):", address(dispute));
        console.log("DisputeArbitration (impl):", address(daImpl));

        // EscrowEngine
        EscrowEngine eeImpl = new EscrowEngine();
        ERC1967Proxy eeProxy = new ERC1967Proxy(
            address(eeImpl),
            abi.encodeCall(EscrowEngine.initialize, (
                address(token),
                address(registry),
                address(staking),
                address(dispute),
                address(reputation),
                address(treasuryGov),
                address(sybilGuard)
            ))
        );
        escrow = EscrowEngine(address(eeProxy));
        console.log("EscrowEngine (proxy):", address(escrow));
        console.log("EscrowEngine (impl):", address(eeImpl));
    }

    // ── 10: LoanEngine ────────────────────────────────────────────
    function _deployLoanEngine() internal {
        LoanEngine leImpl = new LoanEngine();
        ERC1967Proxy leProxy = new ERC1967Proxy(
            address(leImpl),
            abi.encodeCall(LoanEngine.initialize, (
                address(token),
                address(reputation),
                address(staking),
                address(sybilGuard),
                address(treasuryGov),
                deployer
            ))
        );
        loanEngine = LoanEngine(address(leProxy));
        console.log("LoanEngine (proxy):", address(loanEngine));
        console.log("LoanEngine (impl):", address(leImpl));
    }

    // ── 11: X402CreditFacility ───────────────────────────────────
    function _deployCreditFacility() internal {
        X402CreditFacility cfImpl = new X402CreditFacility();
        ERC1967Proxy cfProxy = new ERC1967Proxy(
            address(cfImpl),
            abi.encodeCall(X402CreditFacility.initialize, (
                address(token),
                address(escrow),
                address(dispute),
                address(reputation),
                address(staking),
                address(sybilGuard),
                address(treasuryGov),
                deployer
            ))
        );
        creditFacility = X402CreditFacility(address(cfProxy));
        console.log("X402CreditFacility (proxy):", address(creditFacility));
        console.log("X402CreditFacility (impl):", address(cfImpl));
    }

    // ── 12: StakingRewards only ──────────────────────────────────
    // LiquidityMining + RewardScheduler deployed separately after LP pool creation.
    // Order: Deploy LOB → Create DEX pool → Get LP token → Deploy LiquidityMining → Deploy RewardScheduler
    function _deployStakingRewards() internal {
        StakingRewards srImpl = new StakingRewards();
        ERC1967Proxy srProxy = new ERC1967Proxy(
            address(srImpl),
            abi.encodeCall(StakingRewards.initialize, (address(staking), address(sybilGuard)))
        );
        stakingRewards = StakingRewards(address(srProxy));
        console.log("StakingRewards (proxy):", address(stakingRewards));
        console.log("StakingRewards (impl):", address(srImpl));

        stakingRewards.addRewardToken(address(token));
    }

    // ── 13: LightningGovernor ─────────────────────────────────────
    function _deployLightningGovernor() internal {
        address sentinel = vm.envAddress("SENTINEL_ADDRESS");
        address arbiter = vm.envAddress("ARBITER_ADDRESS");
        address steward = vm.envAddress("STEWARD_ADDRESS");
        address lgGuardian = vm.envAddress("GUARDIAN_ADDRESS");

        address[] memory executors = new address[](3);
        executors[0] = sentinel;
        executors[1] = arbiter;
        executors[2] = steward;

        LightningGovernor lgImpl = new LightningGovernor();
        ERC1967Proxy lgProxy = new ERC1967Proxy(
            address(lgImpl),
            abi.encodeCall(LightningGovernor.initialize, (
                address(staking),
                address(treasuryGov),
                executors,
                lgGuardian
            ))
        );
        lightningGov = LightningGovernor(address(lgProxy));
        console.log("LightningGovernor (proxy):", address(lightningGov));
        console.log("LightningGovernor (impl):", address(lgImpl));
    }

    // ── 14-15: Verifier + Airdrop ────────────────────────────────
    function _deployAirdrop() internal {
        // Verifier is a pure view contract — no proxy needed
        verifier = new Groth16VerifierV5();
        console.log("Groth16VerifierV5:", address(verifier));

        address approvalSigner = vm.envAddress("APPROVAL_SIGNER_ADDRESS");
        uint256 difficultyTarget = type(uint256).max >> 26;

        AirdropClaimV3 adImpl = new AirdropClaimV3();
        ERC1967Proxy adProxy = new ERC1967Proxy(
            address(adImpl),
            abi.encodeCall(AirdropClaimV3.initialize, (
                address(token),
                address(verifier),
                approvalSigner,
                CLAIM_WINDOW_END,
                difficultyTarget,
                AIRDROP_POOL,
                address(reputation),
                address(registry),
                address(staking),
                address(dispute)
            ))
        );
        airdropV3 = AirdropClaimV3(address(adProxy));
        console.log("AirdropClaimV3 (proxy):", address(airdropV3));
        console.log("AirdropClaimV3 (impl):", address(adImpl));
    }

    // ── 16: TeamVesting ──────────────────────────────────────────
    function _deployTeamVesting() internal {
        address teamBeneficiary = vm.envAddress("TEAM_BENEFICIARY_ADDRESS");

        TeamVesting tvImpl = new TeamVesting();
        ERC1967Proxy tvProxy = new ERC1967Proxy(
            address(tvImpl),
            abi.encodeCall(TeamVesting.initialize, (
                address(token),
                teamBeneficiary,
                block.timestamp,
                VESTING_CLIFF,
                VESTING_DURATION
            ))
        );
        teamVesting = TeamVesting(address(tvProxy));
        console.log("TeamVesting (proxy):", address(teamVesting));
        console.log("TeamVesting (impl):", address(tvImpl));
    }

    // ── 17a: Role grants ─────────────────────────────────────────
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

        console.log("Roles granted, escrow wired, reward distributor wired");
    }

    // ── 17b: Transfer admin to TreasuryGovernor ──────────────────
    function _transferAdmin() internal {
        bytes32 adminRole = reputation.DEFAULT_ADMIN_ROLE();

        // LightningGovernor — grant admin on target contracts it can fast-track
        // NOTE: LiquidityMining + RewardScheduler admin grants deferred to post-LP-deploy
        staking.grantRole(adminRole, address(lightningGov));
        dispute.grantRole(adminRole, address(lightningGov));
        escrow.grantRole(adminRole, address(lightningGov));
        registry.grantRole(adminRole, address(lightningGov));
        stakingRewards.grantRole(adminRole, address(lightningGov));

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
        // NOTE: LiquidityMining + RewardScheduler admin grants deferred to post-LP-deploy
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
        // NOTE: LiquidityMining + RewardScheduler renounce deferred to post-LP-deploy
        airdropV3.renounceRole(adminRole, deployer);
        treasuryGov.renounceRole(adminRole, deployer);

        console.log("Admin transferred to TreasuryGovernor, deployer renounced");
    }

    // ── 18: Token distribution ───────────────────────────────────
    function _distributeTokens() internal {
        address lpWallet = vm.envAddress("LP_WALLET_ADDRESS");
        address sentinel = vm.envAddress("SENTINEL_ADDRESS");
        address arbiter = vm.envAddress("ARBITER_ADDRESS");
        address steward = vm.envAddress("STEWARD_ADDRESS");

        // 400M → AirdropClaimV3
        token.transfer(address(airdropV3), AIRDROP_POOL);
        console.log("Transferred 400M LOB to AirdropClaimV3");

        // 300M → TreasuryGovernor
        token.transfer(address(treasuryGov), TREASURY_ALLOC);
        console.log("Transferred 300M LOB to TreasuryGovernor");

        // 150M team: 750K direct to agents, rest to TeamVesting
        token.transfer(sentinel, SENTINEL_ALLOC);
        console.log("Transferred 250K LOB to Sentinel (Titus):", sentinel);
        token.transfer(arbiter, ARBITER_ALLOC);
        console.log("Transferred 250K LOB to Arbiter (Solomon):", arbiter);
        token.transfer(steward, STEWARD_ALLOC);
        console.log("Transferred 250K LOB to Steward (Daniel):", steward);

        token.transfer(address(teamVesting), TEAM_ALLOC - AGENT_TOTAL);
        teamVesting.setTotalAllocation(TEAM_ALLOC - AGENT_TOTAL);
        console.log("Transferred remaining team LOB to TeamVesting (minus 750K agent alloc)");

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
        console.log("========== V5 PROXY DEPLOYMENT COMPLETE ==========");
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
        console.log("LiquidityMining:     (deferred - deploy after LP pool)");
        console.log("RewardScheduler:     (deferred - deploy after LP pool)");
        console.log("LightningGovernor:  ", address(lightningGov));
        console.log("Groth16VerifierV5:  ", address(verifier));
        console.log("AirdropClaimV3:     ", address(airdropV3));
        console.log("TeamVesting:        ", address(teamVesting));
        console.log("====================================================");
        console.log("");
        console.log("ALL CONTRACTS DEPLOYED BEHIND ERC1967 UUPS PROXIES");
        console.log("(except Groth16VerifierV5 -- pure view, no proxy needed)");
        console.log("");
        console.log("TOKEN DISTRIBUTION:");
        console.log("  AirdropClaimV3:   400M LOB (40%)");
        console.log("  TreasuryGovernor: 300M LOB (30%)");
        console.log("  TeamVesting:      149.25M LOB (15% minus agent allocs)");
        console.log("  Agent direct:     750K LOB (Sentinel 250K, Arbiter 250K, Steward 250K)");
        console.log("  LP Wallet:        150M LOB (15%)");
        console.log("");
        console.log("POST-DEPLOY CHECKLIST:");
        console.log("  1. Verify all contracts on BaseScan (impl + proxy)");
        console.log("  2. Verify proxy impl slots: cast implementation <proxy>");
        console.log("  3. Test upgradeability: deploy dummy impl, call upgradeToAndCall");
        console.log("  4. Grant WATCHER_ROLE + JUDGE_ROLE on SybilGuard");
        console.log("  5. Grant FACILITATOR_ROLE + POOL_MANAGER_ROLE on X402CreditFacility");
        console.log("  6. Seed X402CreditFacility pool with LOB via depositToPool()");
        console.log("  7. Seed DEX LP with the 150M LOB in LP wallet");
        console.log("  8. Deposit initial reward budget to RewardDistributor");
        console.log("  9. Fund RewardScheduler with LOB via topUp() + create streams");
        console.log("  10. Smoke-test full claim flow: attest, prove, claim, milestones");
        console.log("  NOTE: DEFAULT_ADMIN_ROLE transferred to TreasuryGovernor");
    }
}
