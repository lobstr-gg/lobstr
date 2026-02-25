// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../../src/LOBToken.sol";
import "../../src/StakingManager.sol";
import "../../src/ReputationSystem.sol";
import "../../src/ServiceRegistry.sol";
import "../../src/DisputeArbitration.sol";
import "../../src/EscrowEngine.sol";
import "../../src/SkillRegistry.sol";
import "../../src/PipelineRouter.sol";
import "../../src/SybilGuard.sol";
import "../../src/StakingRewards.sol";
import "../../src/LiquidityMining.sol";
import "../../src/RewardScheduler.sol";

contract MockSybilGuard {
    function checkBanned(address) external pure returns (bool) { return false; }
    function checkAnyBanned(address[] calldata) external pure returns (bool) { return false; }
}

contract MockRewardDistributor {
    function creditArbitratorReward(address, address, uint256) external {}
    function deposit(address, uint256) external {}
    function availableBudget(address) external pure returns (uint256) { return type(uint256).max; }
}

contract FullFlowTest is Test {
    LOBToken public token;
    StakingManager public staking;
    ReputationSystem public reputation;
    ServiceRegistry public registry;
    DisputeArbitration public dispute;
    EscrowEngine public escrow;
    SkillRegistry public skillRegistry;
    PipelineRouter public pipelineRouter;
    MockSybilGuard public mockSybilGuard;
    MockRewardDistributor public mockRewardDist;

    address public admin = makeAddr("admin");
    address public distributor = makeAddr("distributor");
    address public treasury = makeAddr("treasury");

    address public agentA = makeAddr("agentA"); // buyer
    address public agentB = makeAddr("agentB"); // seller
    address public human = makeAddr("human");   // human buyer

    address public arb1 = makeAddr("arb1");
    address public arb2 = makeAddr("arb2");
    address public arb3 = makeAddr("arb3");
    address public gateway = makeAddr("gateway");

    function setUp() public {
        // --- Deploy all contracts in dependency order ---
        vm.startPrank(admin);

        // 1. LOBToken
        token = new LOBToken();
        token.initialize(distributor);

        // 2. ReputationSystem
        reputation = new ReputationSystem();
        reputation.initialize();

        // 3. StakingManager
        staking = new StakingManager();
        staking.initialize(address(token));

        // 3.5. MockSybilGuard + MockRewardDistributor
        mockSybilGuard = new MockSybilGuard();
        mockRewardDist = new MockRewardDistributor();

        // 4. ServiceRegistry
        registry = new ServiceRegistry();
        registry.initialize(address(staking), address(reputation), address(mockSybilGuard));

        // 5. DisputeArbitration
        dispute = new DisputeArbitration();
        dispute.initialize(address(token), address(staking), address(reputation), address(mockSybilGuard), address(mockRewardDist));

        // 6. EscrowEngine
        escrow = new EscrowEngine();
        escrow.initialize(
            address(token),
            address(registry),
            address(staking),
            address(dispute),
            address(reputation),
            treasury,
            address(mockSybilGuard)
        );

        // 7. SkillRegistry
        skillRegistry = new SkillRegistry();
        skillRegistry.initialize(
            address(token),
            address(staking),
            address(reputation),
            address(mockSybilGuard),
            address(escrow),
            treasury
        );

        // 8. PipelineRouter
        pipelineRouter = new PipelineRouter();
        pipelineRouter.initialize(
            address(skillRegistry),
            address(staking),
            address(reputation),
            address(mockSybilGuard),
            admin
        );

        // 9. Post-deploy role grants
        reputation.grantRole(reputation.RECORDER_ROLE(), address(escrow));
        reputation.grantRole(reputation.RECORDER_ROLE(), address(dispute));
        reputation.grantRole(reputation.RECORDER_ROLE(), address(skillRegistry));
        reputation.grantRole(reputation.RECORDER_ROLE(), admin);
        staking.grantRole(staking.SLASHER_ROLE(), address(dispute));
        dispute.grantRole(dispute.ESCROW_ROLE(), address(escrow));
        dispute.grantRole(dispute.CERTIFIER_ROLE(), admin);
        dispute.setEscrowEngine(address(escrow));
        escrow.grantRole(escrow.SKILL_REGISTRY_ROLE(), address(skillRegistry));
        skillRegistry.grantRole(skillRegistry.GATEWAY_ROLE(), gateway);

        vm.stopPrank();

        // --- Fund all participants ---
        vm.startPrank(distributor);
        token.transfer(agentA, 500_000 ether);
        token.transfer(agentB, 500_000 ether);
        token.transfer(human, 100_000 ether);
        token.transfer(arb1, 100_000 ether);
        token.transfer(arb2, 100_000 ether);
        token.transfer(arb3, 100_000 ether);
        vm.stopPrank();

        // --- Register arbitrators ---
        _stakeArbitrator(arb1, 100_000 ether);
        _stakeArbitrator(arb2, 100_000 ether);
        _stakeArbitrator(arb3, 100_000 ether);
    }

    function _stakeArbitrator(address arb, uint256 amount) internal {
        vm.startPrank(arb);
        token.approve(address(dispute), amount);
        dispute.stakeAsArbitrator(amount);
        vm.stopPrank();

        vm.prank(admin);
        dispute.certifyArbitrator(arb);
    }

    /// @dev Full happy path: list → job → deliver → confirm → check reputation
    function test_FullHappyPath_AgentToAgent() public {
        // 1. Agent B stakes to list services (Silver tier)
        vm.startPrank(agentB);
        token.approve(address(staking), 1_000 ether);
        staking.stake(1_000 ether);
        assertEq(uint256(staking.getTier(agentB)), uint256(IStakingManager.Tier.Silver));

        // 2. Agent B creates a listing
        uint256 listingId = registry.createListing(
            IServiceRegistry.ServiceCategory.DATA_SCRAPING,
            "Austin Real Estate Scraping",
            "1000 listings scraped and delivered as JSON",
            50 ether,
            address(token),
            3600, // 1 hour delivery
            "ipfs://QmMetadata"
        );
        vm.stopPrank();

        assertEq(listingId, 1);

        // 3. Agent A creates a job (locks 50 LOB in escrow)
        vm.startPrank(agentA);
        token.approve(address(escrow), 50 ether);
        uint256 jobId = escrow.createJob(listingId, agentB, 50 ether, address(token), 1 days);
        vm.stopPrank();

        assertEq(jobId, 1);
        assertEq(token.balanceOf(address(escrow)), 50 ether);

        // 4. Agent B delivers
        vm.prank(agentB);
        escrow.submitDelivery(jobId, "ipfs://QmDelivery");

        // 5. Agent A confirms delivery
        uint256 sellerBalBefore = token.balanceOf(agentB);

        vm.prank(agentA);
        escrow.confirmDelivery(jobId);

        // 6. Verify funds released (0% fee for LOB)
        assertEq(token.balanceOf(agentB), sellerBalBefore + 50 ether);
        assertEq(token.balanceOf(address(escrow)), 0);
        assertEq(token.balanceOf(treasury), 0); // no fee

        // 7. Check reputation increased
        (uint256 score, IReputationSystem.ReputationTier tier) = reputation.getScore(agentB);
        assertEq(score, 600); // 500 base + 100 completion
        assertEq(uint256(tier), uint256(IReputationSystem.ReputationTier.Bronze));

        IReputationSystem.ReputationData memory data = reputation.getReputationData(agentB);
        assertEq(data.completions, 1);
    }

    /// @dev Auto-release: seller delivers, buyer doesn't confirm, window expires
    function test_AutoRelease_Flow() public {
        // Setup seller
        vm.startPrank(agentB);
        token.approve(address(staking), 1_000 ether);
        staking.stake(1_000 ether);
        uint256 listingId = registry.createListing(
            IServiceRegistry.ServiceCategory.TRANSLATION,
            "Translation Service",
            "English to Spanish",
            100 ether,
            address(token),
            7200,
            ""
        );
        vm.stopPrank();

        // Create job
        vm.startPrank(agentA);
        token.approve(address(escrow), 100 ether);
        uint256 jobId = escrow.createJob(listingId, agentB, 100 ether, address(token), 1 days);
        vm.stopPrank();

        // Deliver
        vm.prank(agentB);
        escrow.submitDelivery(jobId, "ipfs://translated");

        // Warp past dispute window
        vm.warp(block.timestamp + 2 hours);

        uint256 sellerBalBefore = token.balanceOf(agentB);

        // Anyone can call auto-release
        escrow.autoRelease(jobId);

        assertEq(token.balanceOf(agentB), sellerBalBefore + 100 ether);
    }

    /// @dev Dispute flow: buyer disputes, arbitrators vote, ruling executed
    function test_DisputeFlow() public {
        // Setup seller
        vm.startPrank(agentB);
        token.approve(address(staking), 1_000 ether);
        staking.stake(1_000 ether);
        uint256 listingId = registry.createListing(
            IServiceRegistry.ServiceCategory.CODING,
            "Coding Service",
            "Smart contract dev",
            200 ether,
            address(token),
            86400,
            ""
        );
        vm.stopPrank();

        // Create job
        vm.startPrank(agentA);
        token.approve(address(escrow), 200 ether);
        uint256 jobId = escrow.createJob(listingId, agentB, 200 ether, address(token), 1 days);
        vm.stopPrank();

        // Deliver
        vm.prank(agentB);
        escrow.submitDelivery(jobId, "ipfs://code");

        // Buyer initiates dispute
        uint256 buyerBalBefore = token.balanceOf(agentA);
        uint256 escrowBalBefore = token.balanceOf(address(escrow));

        vm.prank(agentA);
        escrow.initiateDispute(jobId, "ipfs://evidence-buyer");

        uint256 disputeId = escrow.getJobDisputeId(jobId);
        assertGt(disputeId, 0);

        // Two-phase panel: seal after delay
        vm.roll(block.number + 11);
        dispute.sealPanel(disputeId);

        IDisputeArbitration.Dispute memory d = dispute.getDispute(disputeId);

        // Seller submits counter-evidence
        vm.prank(agentB);
        dispute.submitCounterEvidence(disputeId, "ipfs://evidence-seller");

        // Arbitrators vote (buyer wins 2-1)
        vm.prank(d.arbitrators[0]);
        dispute.vote(disputeId, true); // buyer

        vm.prank(d.arbitrators[1]);
        dispute.vote(disputeId, true); // buyer

        vm.prank(d.arbitrators[2]);
        dispute.vote(disputeId, false); // seller

        // Execute ruling
        dispute.executeRuling(disputeId);

        d = dispute.getDispute(disputeId);
        assertEq(uint256(d.ruling), uint256(IDisputeArbitration.Ruling.BuyerWins));

        // Finalize after appeal window
        vm.warp(block.timestamp + 49 hours);
        dispute.finalizeRuling(disputeId);

        // CRITICAL: Verify escrowed funds were actually returned to buyer
        // Buyer receives: 200 LOB (escrow refund) + 100 LOB (10% slash of seller's 1000 stake)
        uint256 slashAmount = 100 ether; // 10% of seller's 1000 ether stake
        assertEq(token.balanceOf(agentA), buyerBalBefore + 200 ether + slashAmount, "buyer should receive escrowed funds + slash");
        assertEq(token.balanceOf(address(escrow)), escrowBalBefore - 200 ether, "escrow should be drained");

        // Seller's reputation should be penalized
        (uint256 score,) = reputation.getScore(agentB);
        assertLt(score, 500); // below base score due to dispute loss
    }

    /// @dev Human-to-Agent flow
    function test_HumanToAgent_Flow() public {
        // Setup agent seller
        vm.startPrank(agentB);
        token.approve(address(staking), 1_000 ether);
        staking.stake(1_000 ether);
        uint256 listingId = registry.createListing(
            IServiceRegistry.ServiceCategory.RESEARCH,
            "Market Research",
            "Comprehensive market analysis",
            75 ether,
            address(token),
            86400,
            ""
        );
        vm.stopPrank();

        // Human creates job
        vm.startPrank(human);
        token.approve(address(escrow), 75 ether);
        uint256 jobId = escrow.createJob(listingId, agentB, 75 ether, address(token), 1 days);
        vm.stopPrank();

        // Agent delivers
        vm.prank(agentB);
        escrow.submitDelivery(jobId, "ipfs://research-report");

        // Human confirms
        vm.prank(human);
        escrow.confirmDelivery(jobId);

        IEscrowEngine.Job memory job = escrow.getJob(jobId);
        assertEq(uint256(job.status), uint256(IEscrowEngine.JobStatus.Confirmed));
    }

    /// @dev Multiple jobs build reputation over time
    function test_ReputationGrowth() public {
        vm.startPrank(agentB);
        token.approve(address(staking), 1_000 ether);
        staking.stake(1_000 ether);
        uint256 listingId = registry.createListing(
            IServiceRegistry.ServiceCategory.WRITING,
            "Writing Service",
            "Blog posts",
            50 ether,
            address(token),
            3600,
            ""
        );
        vm.stopPrank();

        // Complete 3 jobs via escrow from agentA (pair cap = 3)
        // Amount must be >= MIN_REPUTATION_VALUE (50 LOB) to record reputation
        for (uint256 i = 0; i < 3; i++) {
            vm.startPrank(agentA);
            token.approve(address(escrow), 50 ether);
            uint256 jobId = escrow.createJob(listingId, agentB, 50 ether, address(token), 1 days);
            vm.stopPrank();

            vm.prank(agentB);
            escrow.submitDelivery(jobId, "ipfs://delivery");

            vm.prank(agentA);
            escrow.confirmDelivery(jobId);
        }

        // Build additional rep via admin with unique counterparties to reach Silver
        vm.startPrank(admin);
        for (uint256 i = 0; i < 2; i++) {
            reputation.recordCompletion(agentB, address(uint160(0x7000 + i)));
        }
        vm.stopPrank();

        vm.warp(block.timestamp + 7 days); // V-006: SILVER_MIN_TENURE

        (uint256 score, IReputationSystem.ReputationTier tier) = reputation.getScore(agentB);
        // 500 base + 3 escrow completions (capped from agentA) + 2 admin completions = 500 + 500 = 1000
        assertEq(score, 1000);
        // 3 unique counterparties (agentA + 2 admin-added) = Silver
        assertEq(uint256(tier), uint256(IReputationSystem.ReputationTier.Silver));
    }

    /// @dev Staking tier limits listings
    function test_StakingTier_ListingLimits() public {
        // Bronze tier = max 3 listings
        vm.startPrank(agentB);
        token.approve(address(staking), 100 ether);
        staking.stake(100 ether);

        for (uint256 i = 0; i < 3; i++) {
            registry.createListing(
                IServiceRegistry.ServiceCategory.OTHER,
                "Service",
                "Desc",
                10 ether,
                address(token),
                3600,
                ""
            );
        }

        vm.expectRevert("ServiceRegistry: max listings reached");
        registry.createListing(
            IServiceRegistry.ServiceCategory.OTHER,
            "Fourth",
            "Desc",
            10 ether,
            address(token),
            3600,
            ""
        );

        // Upgrade to Silver by staking more
        token.approve(address(staking), 900 ether);
        staking.stake(900 ether);

        // Now can create more listings
        registry.createListing(
            IServiceRegistry.ServiceCategory.OTHER,
            "Fourth - now allowed",
            "Desc",
            10 ether,
            address(token),
            3600,
            ""
        );

        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════
    //  SKILL MARKETPLACE INTEGRATION TESTS
    // ═══════════════════════════════════════════════════════════════

    function _stakeAndBuildRep(address user, uint256 stakeAmount, uint256 completions) internal {
        vm.startPrank(user);
        token.approve(address(staking), stakeAmount);
        staking.stake(stakeAmount);
        vm.stopPrank();

        vm.startPrank(admin);
        for (uint256 i = 0; i < completions; i++) {
            reputation.recordCompletion(user, address(uint160(0x3000 + i)));
        }
        vm.stopPrank();

        // V-006: Warp to satisfy tenure requirement for the reputation tier being built
        uint256 score = 500 + completions * 100;
        if (score >= 10000 && completions >= 25) {
            vm.warp(block.timestamp + 90 days);
        } else if (score >= 5000 && completions >= 10) {
            vm.warp(block.timestamp + 30 days);
        } else if (score >= 1000 && completions >= 3) {
            vm.warp(block.timestamp + 7 days);
        }
    }

    function _defaultSkillParams() internal view returns (ISkillRegistry.ListSkillParams memory) {
        return ISkillRegistry.ListSkillParams({
            assetType: ISkillRegistry.AssetType.SKILL,
            deliveryMethod: ISkillRegistry.DeliveryMethod.HOSTED_API,
            pricingModel: ISkillRegistry.PricingModel.ONE_TIME,
            price: 50 ether,
            settlementToken: address(token),
            apiEndpointHash: keccak256("https://api.example.com"),
            packageHash: bytes32(0)
        });
    }

    function _emptyDeps() internal pure returns (uint256[] memory) {
        return new uint256[](0);
    }

    /// @dev Full ONE_TIME flow: stake → list → purchase → confirm → verify balances + rep
    function test_SkillMarketplace_OneTimeFullFlow() public {
        // 1. Agent B stakes to Silver (1000) and builds Silver rep (10 completions)
        _stakeAndBuildRep(agentB, 1_000 ether, 10);

        // 2. Agent B lists a skill
        vm.prank(agentB);
        uint256 skillId = skillRegistry.listSkill(
            _defaultSkillParams(),
            "Web Scraping Skill",
            "Scrapes any website",
            "ipfs://skill-metadata",
            _emptyDeps()
        );
        assertEq(skillId, 1);

        // 3. Agent A purchases the skill (one-time, goes through escrow)
        vm.startPrank(agentA);
        token.approve(address(escrow), 50 ether);
        uint256 accessId = skillRegistry.purchaseSkill(skillId);
        vm.stopPrank();

        // Verify escrow job created
        IEscrowEngine.Job memory job = escrow.getJob(1);
        assertEq(uint256(job.escrowType), uint256(IEscrowEngine.EscrowType.SKILL_PURCHASE));
        assertEq(job.skillId, skillId);
        assertEq(uint256(job.status), uint256(IEscrowEngine.JobStatus.Delivered));

        // 4. Agent A confirms delivery early
        uint256 sellerBalBefore = token.balanceOf(agentB);
        vm.prank(agentA);
        escrow.confirmDelivery(1);

        // 5. Verify seller got funds (0% LOB fee)
        assertEq(token.balanceOf(agentB), sellerBalBefore + 50 ether);

        // 6. Verify access is active
        assertTrue(skillRegistry.hasActiveAccess(agentA, skillId));

        // 7. Verify skill purchase count
        ISkillRegistry.SkillListing memory skill = skillRegistry.getSkill(skillId);
        assertEq(skill.totalPurchases, 1);
    }

    /// @dev PER_CALL flow: list → deposit credits → record usage → claim earnings
    function test_SkillMarketplace_PerCallFlow() public {
        _stakeAndBuildRep(agentB, 1_000 ether, 10);

        ISkillRegistry.ListSkillParams memory params = _defaultSkillParams();
        params.pricingModel = ISkillRegistry.PricingModel.PER_CALL;
        params.price = 1 ether; // 1 LOB per call

        vm.prank(agentB);
        uint256 skillId = skillRegistry.listSkill(params, "API Skill", "Per-call API", "ipfs://m", _emptyDeps());

        // Purchase access (no payment for per-call)
        vm.prank(agentA);
        uint256 accessId = skillRegistry.purchaseSkill(skillId);

        // Deposit credits
        vm.startPrank(agentA);
        token.approve(address(skillRegistry), 100 ether);
        skillRegistry.depositCallCredits(address(token), 100 ether);
        vm.stopPrank();

        assertEq(skillRegistry.getBuyerCredits(agentA, address(token)), 100 ether);

        // Gateway records 20 calls
        vm.prank(gateway);
        skillRegistry.recordUsage(accessId, 20);

        // Buyer credits reduced by 20 LOB
        assertEq(skillRegistry.getBuyerCredits(agentA, address(token)), 80 ether);

        // Seller claims earnings (0% LOB fee)
        uint256 sellerBalBefore = token.balanceOf(agentB);
        vm.prank(agentB);
        skillRegistry.claimEarnings(address(token));
        assertEq(token.balanceOf(agentB), sellerBalBefore + 20 ether);

        // Buyer withdraws remaining credits
        uint256 buyerBalBefore = token.balanceOf(agentA);
        vm.prank(agentA);
        skillRegistry.withdrawCallCredits(address(token), 80 ether);
        assertEq(token.balanceOf(agentA), buyerBalBefore + 80 ether);
    }

    /// @dev SUBSCRIPTION flow: list → subscribe → warp → renew
    function test_SkillMarketplace_SubscriptionFlow() public {
        _stakeAndBuildRep(agentB, 1_000 ether, 10);

        ISkillRegistry.ListSkillParams memory params = _defaultSkillParams();
        params.pricingModel = ISkillRegistry.PricingModel.SUBSCRIPTION;
        params.price = 10 ether;

        vm.prank(agentB);
        uint256 skillId = skillRegistry.listSkill(params, "Premium API", "Monthly sub", "ipfs://m", _emptyDeps());

        // Subscribe
        vm.startPrank(agentA);
        token.approve(address(skillRegistry), 30 ether); // enough for 3 months
        uint256 accessId = skillRegistry.purchaseSkill(skillId);
        vm.stopPrank();

        assertTrue(skillRegistry.hasActiveAccess(agentA, skillId));

        // Warp 25 days — still active
        vm.warp(block.timestamp + 25 days);
        assertTrue(skillRegistry.hasActiveAccess(agentA, skillId));

        // Renew before expiry (only buyer can renew)
        vm.prank(agentA);
        skillRegistry.renewSubscription(accessId);

        // Warp another 25 days (50 total) — still active because renewed
        vm.warp(block.timestamp + 25 days);
        assertTrue(skillRegistry.hasActiveAccess(agentA, skillId));

        // Warp past second period (65 days total from start)
        vm.warp(block.timestamp + 20 days);
        assertFalse(skillRegistry.hasActiveAccess(agentA, skillId));
    }

    /// @dev Dispute flow: list → purchase → dispute → resolve
    function test_SkillMarketplace_DisputeFlow() public {
        _stakeAndBuildRep(agentB, 1_000 ether, 10);

        vm.prank(agentB);
        uint256 skillId = skillRegistry.listSkill(
            _defaultSkillParams(),
            "Disputed Skill",
            "This will be disputed",
            "ipfs://m",
            _emptyDeps()
        );

        // Purchase
        vm.startPrank(agentA);
        token.approve(address(escrow), 50 ether);
        skillRegistry.purchaseSkill(skillId);
        vm.stopPrank();

        uint256 buyerBalBefore = token.balanceOf(agentA);

        // Buyer disputes within 72h window
        vm.prank(agentA);
        escrow.initiateDispute(1, "ipfs://skill-broken");

        IEscrowEngine.Job memory job = escrow.getJob(1);
        assertEq(uint256(job.status), uint256(IEscrowEngine.JobStatus.Disputed));

        uint256 disputeId = escrow.getJobDisputeId(1);

        // Two-phase panel: seal after delay
        vm.roll(block.number + 11);
        dispute.sealPanel(disputeId);

        IDisputeArbitration.Dispute memory d = dispute.getDispute(disputeId);

        // Counter evidence
        vm.prank(agentB);
        dispute.submitCounterEvidence(disputeId, "ipfs://counter");

        // Arbitrators vote buyer wins 2-0
        vm.prank(d.arbitrators[0]);
        dispute.vote(disputeId, true);
        vm.prank(d.arbitrators[1]);
        dispute.vote(disputeId, true);

        // Warp past voting deadline
        vm.warp(block.timestamp + 4 days);

        // Execute ruling
        dispute.executeRuling(disputeId);

        // Finalize after appeal window
        vm.warp(block.timestamp + 49 hours);
        dispute.finalizeRuling(disputeId);

        // Buyer gets full refund + slash
        assertGt(token.balanceOf(agentA), buyerBalBefore);
    }

    /// @dev Pipeline flow: list skills → purchase → create pipeline → execute
    function test_Pipeline_FullFlow() public {
        // Setup seller with Gold tier
        _stakeAndBuildRep(agentB, 10_000 ether, 25);

        // Setup buyer with Gold tier
        _stakeAndBuildRep(agentA, 10_000 ether, 25);

        ISkillRegistry.ListSkillParams memory params = _defaultSkillParams();
        params.pricingModel = ISkillRegistry.PricingModel.PER_CALL;
        params.price = 1 ether;

        vm.prank(agentB);
        uint256 skill1 = skillRegistry.listSkill(params, "Scraper", "Scrapes data", "ipfs://1", _emptyDeps());

        params.apiEndpointHash = keccak256("api2");
        vm.prank(agentB);
        uint256 skill2 = skillRegistry.listSkill(params, "Analyzer", "Analyzes data", "ipfs://2", _emptyDeps());

        // Agent A purchases both skills
        vm.startPrank(agentA);
        skillRegistry.purchaseSkill(skill1);
        skillRegistry.purchaseSkill(skill2);
        vm.stopPrank();

        // Create pipeline with both skills
        uint256[] memory steps = new uint256[](2);
        steps[0] = skill1;
        steps[1] = skill2;
        bytes[] memory configs = new bytes[](2);
        configs[0] = abi.encode("scrape config");
        configs[1] = abi.encode("analyze config");

        vm.prank(agentA);
        uint256 pipelineId = pipelineRouter.createPipeline("Scrape & Analyze", steps, configs, false);

        // Execute pipeline
        vm.prank(agentA);
        pipelineRouter.executePipeline(pipelineId);

        IPipelineRouter.Pipeline memory pipeline = pipelineRouter.getPipeline(pipelineId);
        assertEq(pipeline.executionCount, 1);

        // Verify steps
        uint256[] memory returnedSteps = pipelineRouter.getPipelineSteps(pipelineId);
        assertEq(returnedSteps.length, 2);
        assertEq(returnedSteps[0], skill1);
        assertEq(returnedSteps[1], skill2);
    }

    // ═══════════════════════════════════════════════════════════════
    //  REWARD SCHEDULER INTEGRATION
    // ═══════════════════════════════════════════════════════════════

    /// @dev Full RewardScheduler flow: deploy → create stream → stake → warp → drip → verify
    function test_RewardScheduler_FullFlow() public {
        // Deploy StakingRewards + LiquidityMining + RewardScheduler
        vm.startPrank(admin);
        StakingRewards stakingRewards = new StakingRewards();
        stakingRewards.initialize(address(staking), address(mockSybilGuard));
        stakingRewards.addRewardToken(address(token));

        // Use a simple mock LP token for liquidity mining
        MockLPTokenForFullFlow lpToken = new MockLPTokenForFullFlow();
        LiquidityMining liquidityMining = new LiquidityMining();
        liquidityMining.initialize(
            address(lpToken),
            address(token),
            address(staking),
            address(mockSybilGuard),
            admin
        );

        RewardScheduler scheduler = new RewardScheduler();
        scheduler.initialize(address(stakingRewards), address(liquidityMining));

        // Wire roles
        stakingRewards.grantRole(stakingRewards.REWARD_NOTIFIER_ROLE(), address(scheduler));
        liquidityMining.grantRole(liquidityMining.REWARD_NOTIFIER_ROLE(), address(scheduler));
        vm.stopPrank();

        // Fund scheduler with enough LOB for 14+ days at 1 LOB/sec
        uint256 schedulerBudget = 1_500_000 ether;
        vm.prank(distributor);
        token.transfer(address(scheduler), schedulerBudget);

        // Create LOB stream for StakingRewards at 1 LOB/sec
        vm.prank(admin);
        scheduler.createStream(
            IRewardScheduler.TargetType.STAKING_REWARDS,
            address(token),
            1 ether, // 1 LOB/sec
            0        // perpetual
        );

        // Agent B stakes LOB (already has balance from setUp)
        vm.startPrank(agentB);
        token.approve(address(staking), 1_000 ether);
        staking.stake(1_000 ether);
        vm.stopPrank();

        // Sync stake on StakingRewards
        vm.prank(agentB);
        stakingRewards.syncStake();

        // Warp 6 days and drip (stay within V-004 staleness window)
        vm.warp(block.timestamp + 6 days);
        scheduler.drip(1);

        // Verify StakingRewards received tokens
        uint256 expectedDrip = 6 days * 1 ether;
        assertEq(token.balanceOf(address(stakingRewards)), expectedDrip);

        // Warp 1 more second so rewardPerToken advances past notifyRewardAmount timestamp
        vm.warp(block.timestamp + 1);

        // Verify staker has earned rewards
        uint256 earned = stakingRewards.earned(agentB, address(token));
        assertGt(earned, 0);

        // Re-sync to reset staleness timer before next warp
        vm.prank(agentB);
        stakingRewards.syncStake();

        // Top up with more LOB
        vm.prank(distributor);
        token.transfer(address(scheduler), 50_000 ether);

        // Warp another 6 days, drip again
        vm.warp(block.timestamp + 6 days);
        scheduler.drip(1);

        // Verify stream continues (6 days + 1 sec + 6 days = 12 days + 1 sec total)
        uint256 expectedTotal = (12 days + 1) * 1 ether;
        assertEq(token.balanceOf(address(stakingRewards)), expectedTotal);

        // Staker claims rewards
        vm.prank(agentB);
        stakingRewards.claimRewards(address(token));

        uint256 claimedRewards = token.balanceOf(agentB);
        // agentB started with 500k, staked 1k, so base is 499k
        // Plus whatever rewards they earned
        assertGt(claimedRewards, 499_000 ether);
    }
}

contract MockLPTokenForFullFlow {
    string public name = "Mock LP";
    string public symbol = "MLP";
    uint8 public decimals = 18;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    uint256 public totalSupply;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}
