// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../../src/LOBToken.sol";
import "../../src/StakingManager.sol";
import "../../src/ReputationSystem.sol";
import "../../src/ServiceRegistry.sol";
import "../../src/DisputeArbitration.sol";
import "../../src/EscrowEngine.sol";

contract FullFlowTest is Test {
    LOBToken public token;
    StakingManager public staking;
    ReputationSystem public reputation;
    ServiceRegistry public registry;
    DisputeArbitration public dispute;
    EscrowEngine public escrow;

    address public admin = makeAddr("admin");
    address public distributor = makeAddr("distributor");
    address public treasury = makeAddr("treasury");

    address public agentA = makeAddr("agentA"); // buyer
    address public agentB = makeAddr("agentB"); // seller
    address public human = makeAddr("human");   // human buyer

    address public arb1 = makeAddr("arb1");
    address public arb2 = makeAddr("arb2");
    address public arb3 = makeAddr("arb3");

    function setUp() public {
        // --- Deploy all contracts in dependency order ---
        vm.startPrank(admin);

        // 1. LOBToken
        token = new LOBToken(distributor);

        // 2. ReputationSystem
        reputation = new ReputationSystem();

        // 3. StakingManager
        staking = new StakingManager(address(token));

        // 4. ServiceRegistry
        registry = new ServiceRegistry(address(staking), address(reputation));

        // 5. DisputeArbitration
        dispute = new DisputeArbitration(address(token), address(staking), address(reputation));

        // 6. EscrowEngine
        escrow = new EscrowEngine(
            address(token),
            address(registry),
            address(staking),
            address(dispute),
            address(reputation),
            treasury
        );

        // 7. Post-deploy role grants
        reputation.grantRole(reputation.RECORDER_ROLE(), address(escrow));
        reputation.grantRole(reputation.RECORDER_ROLE(), address(dispute));
        staking.grantRole(staking.SLASHER_ROLE(), address(dispute));
        dispute.grantRole(dispute.ESCROW_ROLE(), address(escrow));

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
        uint256 jobId = escrow.createJob(listingId, agentB, 50 ether, address(token));
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
        uint256 jobId = escrow.createJob(listingId, agentB, 100 ether, address(token));
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
        uint256 jobId = escrow.createJob(listingId, agentB, 200 ether, address(token));
        vm.stopPrank();

        // Deliver
        vm.prank(agentB);
        escrow.submitDelivery(jobId, "ipfs://code");

        // Buyer initiates dispute
        vm.prank(agentA);
        escrow.initiateDispute(jobId, "ipfs://evidence-buyer");

        uint256 disputeId = escrow.getJobDisputeId(jobId);
        assertGt(disputeId, 0);

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
        uint256 jobId = escrow.createJob(listingId, agentB, 75 ether, address(token));
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
            10 ether,
            address(token),
            3600,
            ""
        );
        vm.stopPrank();

        // Complete 10 jobs
        for (uint256 i = 0; i < 10; i++) {
            vm.startPrank(agentA);
            token.approve(address(escrow), 10 ether);
            uint256 jobId = escrow.createJob(listingId, agentB, 10 ether, address(token));
            vm.stopPrank();

            vm.prank(agentB);
            escrow.submitDelivery(jobId, "ipfs://delivery");

            vm.prank(agentA);
            escrow.confirmDelivery(jobId);
        }

        (uint256 score, IReputationSystem.ReputationTier tier) = reputation.getScore(agentB);
        // 500 base + 10*100 completions = 1500 → Silver tier
        assertEq(score, 1500);
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
}
