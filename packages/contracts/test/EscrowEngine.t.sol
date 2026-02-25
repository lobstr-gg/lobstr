// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/LOBToken.sol";
import "../src/StakingManager.sol";
import "../src/ReputationSystem.sol";
import "../src/ServiceRegistry.sol";
import "../src/DisputeArbitration.sol";
import "../src/EscrowEngine.sol";
import "../src/SybilGuard.sol";

contract MockSybilGuard {
    function checkBanned(address) external pure returns (bool) { return false; }
    function checkAnyBanned(address[] calldata) external pure returns (bool) { return false; }
}

contract MockRewardDistributor {
    function creditArbitratorReward(address, address, uint256) external {}
    function creditWatcherReward(address, address, uint256) external {}
    function creditJudgeReward(address, address, uint256) external {}
    function deposit(address, uint256) external {}
    function availableBudget(address) external pure returns (uint256) { return type(uint256).max; }
}

contract EscrowEngineTest is Test {
    // Re-declare events for vm.expectEmit (Solidity 0.8.20 limitation)
    event JobCreated(uint256 indexed jobId, uint256 indexed listingId, address indexed buyer, address seller, uint256 amount, address token, uint256 fee);
    event DeliverySubmitted(uint256 indexed jobId, string metadataURI);
    event DeliveryConfirmed(uint256 indexed jobId, address indexed buyer);
    event FundsReleased(uint256 indexed jobId, address indexed seller, uint256 amount);
    event AutoReleased(uint256 indexed jobId, address indexed caller);
    LOBToken public token;
    StakingManager public staking;
    ReputationSystem public reputation;
    ServiceRegistry public registry;
    DisputeArbitration public dispute;
    EscrowEngine public escrow;
    MockSybilGuard public mockSybilGuard;
    MockRewardDistributor public mockRewardDist;

    address public admin = makeAddr("admin");
    address public distributor = makeAddr("distributor");
    address public treasury = makeAddr("treasury");
    address public buyer = makeAddr("buyer");
    address public seller = makeAddr("seller");
    address public arb1 = makeAddr("arb1");
    address public arb2 = makeAddr("arb2");
    address public arb3 = makeAddr("arb3");

    uint256 public listingId;

    function setUp() public {
        vm.startPrank(admin);
        token = new LOBToken();
        token.initialize(distributor);
        reputation = new ReputationSystem();
        reputation.initialize();
        staking = new StakingManager();
        staking.initialize(address(token));
        mockSybilGuard = new MockSybilGuard();
        mockRewardDist = new MockRewardDistributor();
        registry = new ServiceRegistry();
        registry.initialize(address(staking), address(reputation), address(mockSybilGuard));
        dispute = new DisputeArbitration();
        dispute.initialize(address(token), address(staking), address(reputation), address(mockSybilGuard), address(mockRewardDist));
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

        // Grant roles
        reputation.grantRole(reputation.RECORDER_ROLE(), address(escrow));
        reputation.grantRole(reputation.RECORDER_ROLE(), address(dispute));
        staking.grantRole(staking.SLASHER_ROLE(), address(dispute));
        dispute.grantRole(dispute.ESCROW_ROLE(), address(escrow));
        dispute.grantRole(dispute.CERTIFIER_ROLE(), admin);
        dispute.setEscrowEngine(address(escrow));
        vm.stopPrank();

        // Fund participants
        vm.startPrank(distributor);
        token.transfer(buyer, 100_000 ether);
        token.transfer(seller, 100_000 ether);
        token.transfer(arb1, 100_000 ether);
        token.transfer(arb2, 100_000 ether);
        token.transfer(arb3, 100_000 ether);
        vm.stopPrank();

        // Seller stakes
        vm.startPrank(seller);
        token.approve(address(staking), 1_000 ether);
        staking.stake(1_000 ether);
        vm.stopPrank();

        // Seller creates listing
        vm.prank(seller);
        listingId = registry.createListing(
            IServiceRegistry.ServiceCategory.DATA_SCRAPING,
            "Scraping Service",
            "I scrape stuff",
            50 ether,
            address(token),
            3600,
            ""
        );

        // Register arbitrators
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

    function test_CreateJob() public {
        vm.startPrank(buyer);
        token.approve(address(escrow), 50 ether);
        uint256 jobId = escrow.createJob(listingId, seller, 50 ether, address(token), 1 days);
        vm.stopPrank();

        assertEq(jobId, 1);

        IEscrowEngine.Job memory job = escrow.getJob(jobId);
        assertEq(job.buyer, buyer);
        assertEq(job.seller, seller);
        assertEq(job.amount, 50 ether);
        assertEq(job.fee, 0); // LOB = 0% fee
        assertEq(uint256(job.status), uint256(IEscrowEngine.JobStatus.Active));
    }

    function test_CreateJob_LOBZeroFee() public {
        vm.startPrank(buyer);
        token.approve(address(escrow), 1000 ether);
        uint256 jobId = escrow.createJob(listingId, seller, 1000 ether, address(token), 1 days);
        vm.stopPrank();

        IEscrowEngine.Job memory job = escrow.getJob(jobId);
        assertEq(job.fee, 0);
    }

    function test_CreateJob_RevertSelfHire() public {
        vm.startPrank(seller);
        token.approve(address(escrow), 50 ether);

        vm.expectRevert("EscrowEngine: self-hire");
        escrow.createJob(listingId, seller, 50 ether, address(token), 1 days);
        vm.stopPrank();
    }

    function test_CreateJob_RevertInactiveListing() public {
        vm.prank(seller);
        registry.deactivateListing(listingId);

        vm.startPrank(buyer);
        token.approve(address(escrow), 50 ether);

        vm.expectRevert("EscrowEngine: listing inactive");
        escrow.createJob(listingId, seller, 50 ether, address(token), 1 days);
        vm.stopPrank();
    }

    function test_SubmitDelivery() public {
        vm.startPrank(buyer);
        token.approve(address(escrow), 50 ether);
        uint256 jobId = escrow.createJob(listingId, seller, 50 ether, address(token), 1 days);
        vm.stopPrank();

        vm.prank(seller);
        escrow.submitDelivery(jobId, "ipfs://delivery");

        IEscrowEngine.Job memory job = escrow.getJob(jobId);
        assertEq(uint256(job.status), uint256(IEscrowEngine.JobStatus.Delivered));
        assertEq(job.deliveryMetadataURI, "ipfs://delivery");
        assertGt(job.disputeWindowEnd, block.timestamp);
    }

    function test_SubmitDelivery_RevertNotSeller() public {
        vm.startPrank(buyer);
        token.approve(address(escrow), 50 ether);
        uint256 jobId = escrow.createJob(listingId, seller, 50 ether, address(token), 1 days);

        vm.expectRevert("EscrowEngine: not seller");
        escrow.submitDelivery(jobId, "ipfs://delivery");
        vm.stopPrank();
    }

    function test_ConfirmDelivery() public {
        // Create and deliver job
        vm.startPrank(buyer);
        token.approve(address(escrow), 50 ether);
        uint256 jobId = escrow.createJob(listingId, seller, 50 ether, address(token), 1 days);
        vm.stopPrank();

        vm.prank(seller);
        escrow.submitDelivery(jobId, "ipfs://delivery");

        uint256 sellerBalBefore = token.balanceOf(seller);

        vm.prank(buyer);
        escrow.confirmDelivery(jobId);

        IEscrowEngine.Job memory job = escrow.getJob(jobId);
        assertEq(uint256(job.status), uint256(IEscrowEngine.JobStatus.Confirmed));

        // Seller receives full amount (0% LOB fee)
        assertEq(token.balanceOf(seller), sellerBalBefore + 50 ether);
    }

    function test_ConfirmDelivery_RevertNotBuyer() public {
        vm.startPrank(buyer);
        token.approve(address(escrow), 50 ether);
        uint256 jobId = escrow.createJob(listingId, seller, 50 ether, address(token), 1 days);
        vm.stopPrank();

        vm.prank(seller);
        escrow.submitDelivery(jobId, "ipfs://delivery");

        vm.prank(seller);
        vm.expectRevert("EscrowEngine: not buyer");
        escrow.confirmDelivery(jobId);
    }

    function test_AutoRelease() public {
        vm.startPrank(buyer);
        token.approve(address(escrow), 50 ether);
        uint256 jobId = escrow.createJob(listingId, seller, 50 ether, address(token), 1 days);
        vm.stopPrank();

        vm.prank(seller);
        escrow.submitDelivery(jobId, "ipfs://delivery");

        // Warp past dispute window (1 hour for < 500 LOB)
        vm.warp(block.timestamp + 2 hours);

        uint256 sellerBalBefore = token.balanceOf(seller);

        escrow.autoRelease(jobId); // anyone can call

        assertEq(token.balanceOf(seller), sellerBalBefore + 50 ether);

        IEscrowEngine.Job memory job = escrow.getJob(jobId);
        assertEq(uint256(job.status), uint256(IEscrowEngine.JobStatus.Released));
    }

    function test_AutoRelease_RevertWindowNotExpired() public {
        vm.startPrank(buyer);
        token.approve(address(escrow), 50 ether);
        uint256 jobId = escrow.createJob(listingId, seller, 50 ether, address(token), 1 days);
        vm.stopPrank();

        vm.prank(seller);
        escrow.submitDelivery(jobId, "ipfs://delivery");

        vm.expectRevert("EscrowEngine: window not expired");
        escrow.autoRelease(jobId);
    }

    function test_HighValueJob_LongerDisputeWindow() public {
        vm.startPrank(buyer);
        token.approve(address(escrow), 500 ether);
        uint256 jobId = escrow.createJob(listingId, seller, 500 ether, address(token), 1 days);
        vm.stopPrank();

        vm.prank(seller);
        escrow.submitDelivery(jobId, "ipfs://delivery");

        IEscrowEngine.Job memory job = escrow.getJob(jobId);
        // 24-hour window for >= 500 LOB
        assertEq(job.disputeWindowEnd, block.timestamp + 24 hours);
    }

    function test_InitiateDispute() public {
        vm.startPrank(buyer);
        token.approve(address(escrow), 50 ether);
        uint256 jobId = escrow.createJob(listingId, seller, 50 ether, address(token), 1 days);
        vm.stopPrank();

        vm.prank(seller);
        escrow.submitDelivery(jobId, "ipfs://delivery");

        vm.prank(buyer);
        escrow.initiateDispute(jobId, "ipfs://evidence");

        IEscrowEngine.Job memory job = escrow.getJob(jobId);
        assertEq(uint256(job.status), uint256(IEscrowEngine.JobStatus.Disputed));
        assertGt(escrow.getJobDisputeId(jobId), 0);
    }

    function test_InitiateDispute_RevertWindowClosed() public {
        vm.startPrank(buyer);
        token.approve(address(escrow), 50 ether);
        uint256 jobId = escrow.createJob(listingId, seller, 50 ether, address(token), 1 days);
        vm.stopPrank();

        vm.prank(seller);
        escrow.submitDelivery(jobId, "ipfs://delivery");

        vm.warp(block.timestamp + 2 hours);

        vm.prank(buyer);
        vm.expectRevert("EscrowEngine: dispute window closed");
        escrow.initiateDispute(jobId, "ipfs://evidence");
    }

    function test_InitiateDispute_RevertEmptyEvidence() public {
        vm.startPrank(buyer);
        token.approve(address(escrow), 50 ether);
        uint256 jobId = escrow.createJob(listingId, seller, 50 ether, address(token), 1 days);
        vm.stopPrank();

        vm.prank(seller);
        escrow.submitDelivery(jobId, "ipfs://delivery");

        vm.prank(buyer);
        vm.expectRevert("EscrowEngine: empty evidence");
        escrow.initiateDispute(jobId, "");
    }

    function test_GetJob_RevertNotFound() public {
        vm.expectRevert("EscrowEngine: job not found");
        escrow.getJob(999);
    }

    // --- A2: StakingManager slash proportional unstake reduction ---

    function test_Slash_ReducesPendingUnstakeProportionally() public {
        // Seller has 1000 staked. Request 500 unstake. Slash 300.
        // Remaining = 700. unstakeRequest = 500 * 700 / 1000 = 350
        vm.prank(seller);
        staking.requestUnstake(500 ether);

        IStakingManager.StakeInfo memory infoBefore = staking.getStakeInfo(seller);
        assertEq(infoBefore.unstakeRequestAmount, 500 ether);

        // Slash 300 from seller (dispute system has SLASHER_ROLE)
        vm.prank(address(dispute));
        staking.slash(seller, 300 ether, buyer);

        IStakingManager.StakeInfo memory infoAfter = staking.getStakeInfo(seller);
        assertEq(infoAfter.amount, 700 ether);
        // 500 * 700 / 1000 = 350
        assertEq(infoAfter.unstakeRequestAmount, 350 ether);
        // unstakeRequestTime should still be set
        assertGt(infoAfter.unstakeRequestTime, 0);
    }

    function test_Slash_CancelsPendingUnstakeWhenFullySlashed() public {
        vm.prank(seller);
        staking.requestUnstake(500 ether);

        // Slash all 1000 from seller
        vm.prank(address(dispute));
        staking.slash(seller, 1_000 ether, buyer);

        IStakingManager.StakeInfo memory infoAfter = staking.getStakeInfo(seller);
        assertEq(infoAfter.amount, 0);
        assertEq(infoAfter.unstakeRequestAmount, 0);
        assertEq(infoAfter.unstakeRequestTime, 0);
    }

    // --- A1: resolveDisputeDraw in EscrowEngine ---

    // --- Pause / Unpause Tests ---

    function test_Paused_CreateJobReverts() public {
        vm.prank(admin);
        escrow.pause();

        vm.startPrank(buyer);
        token.approve(address(escrow), 50 ether);
        vm.expectRevert("EnforcedPause()");
        escrow.createJob(listingId, seller, 50 ether, address(token), 1 days);
        vm.stopPrank();
    }

    function test_Paused_SubmitDeliveryReverts() public {
        vm.startPrank(buyer);
        token.approve(address(escrow), 50 ether);
        uint256 jobId = escrow.createJob(listingId, seller, 50 ether, address(token), 1 days);
        vm.stopPrank();

        vm.prank(admin);
        escrow.pause();

        vm.prank(seller);
        vm.expectRevert("EnforcedPause()");
        escrow.submitDelivery(jobId, "ipfs://delivery");
    }

    function test_Paused_ConfirmDeliveryReverts() public {
        vm.startPrank(buyer);
        token.approve(address(escrow), 50 ether);
        uint256 jobId = escrow.createJob(listingId, seller, 50 ether, address(token), 1 days);
        vm.stopPrank();

        vm.prank(seller);
        escrow.submitDelivery(jobId, "ipfs://delivery");

        vm.prank(admin);
        escrow.pause();

        vm.prank(buyer);
        vm.expectRevert("EnforcedPause()");
        escrow.confirmDelivery(jobId);
    }

    function test_Paused_AutoReleaseReverts() public {
        vm.startPrank(buyer);
        token.approve(address(escrow), 50 ether);
        uint256 jobId = escrow.createJob(listingId, seller, 50 ether, address(token), 1 days);
        vm.stopPrank();

        vm.prank(seller);
        escrow.submitDelivery(jobId, "ipfs://delivery");

        vm.warp(block.timestamp + 2 hours);

        vm.prank(admin);
        escrow.pause();

        vm.expectRevert("EnforcedPause()");
        escrow.autoRelease(jobId);
    }

    function test_Paused_InitiateDisputeReverts() public {
        vm.startPrank(buyer);
        token.approve(address(escrow), 50 ether);
        uint256 jobId = escrow.createJob(listingId, seller, 50 ether, address(token), 1 days);
        vm.stopPrank();

        vm.prank(seller);
        escrow.submitDelivery(jobId, "ipfs://delivery");

        vm.prank(admin);
        escrow.pause();

        vm.prank(buyer);
        vm.expectRevert("EnforcedPause()");
        escrow.initiateDispute(jobId, "ipfs://evidence");
    }

    function test_Unpause_ResumesOperations() public {
        vm.prank(admin);
        escrow.pause();

        vm.prank(admin);
        escrow.unpause();

        // Should work after unpause
        vm.startPrank(buyer);
        token.approve(address(escrow), 50 ether);
        uint256 jobId = escrow.createJob(listingId, seller, 50 ether, address(token), 1 days);
        vm.stopPrank();

        assertEq(jobId, 1);
    }

    // --- Event Emission Tests ---

    function test_EmitJobCreated() public {
        vm.startPrank(buyer);
        token.approve(address(escrow), 50 ether);

        vm.expectEmit(true, true, true, true);
        emit JobCreated(1, listingId, buyer, seller, 50 ether, address(token), 0);
        escrow.createJob(listingId, seller, 50 ether, address(token), 1 days);
        vm.stopPrank();
    }

    function test_EmitDeliverySubmitted() public {
        vm.startPrank(buyer);
        token.approve(address(escrow), 50 ether);
        uint256 jobId = escrow.createJob(listingId, seller, 50 ether, address(token), 1 days);
        vm.stopPrank();

        vm.prank(seller);
        vm.expectEmit(true, false, false, true);
        emit DeliverySubmitted(jobId, "ipfs://delivery");
        escrow.submitDelivery(jobId, "ipfs://delivery");
    }

    function test_EmitDeliveryConfirmed() public {
        vm.startPrank(buyer);
        token.approve(address(escrow), 50 ether);
        uint256 jobId = escrow.createJob(listingId, seller, 50 ether, address(token), 1 days);
        vm.stopPrank();

        vm.prank(seller);
        escrow.submitDelivery(jobId, "ipfs://delivery");

        vm.prank(buyer);
        vm.expectEmit(true, true, false, true);
        emit DeliveryConfirmed(jobId, buyer);
        escrow.confirmDelivery(jobId);
    }

    function test_EmitFundsReleased() public {
        vm.startPrank(buyer);
        token.approve(address(escrow), 50 ether);
        uint256 jobId = escrow.createJob(listingId, seller, 50 ether, address(token), 1 days);
        vm.stopPrank();

        vm.prank(seller);
        escrow.submitDelivery(jobId, "ipfs://delivery");

        vm.prank(buyer);
        vm.expectEmit(true, true, false, true);
        emit FundsReleased(jobId, seller, 50 ether);
        escrow.confirmDelivery(jobId);
    }

    function test_EmitAutoReleased() public {
        vm.startPrank(buyer);
        token.approve(address(escrow), 50 ether);
        uint256 jobId = escrow.createJob(listingId, seller, 50 ether, address(token), 1 days);
        vm.stopPrank();

        vm.prank(seller);
        escrow.submitDelivery(jobId, "ipfs://delivery");

        vm.warp(block.timestamp + 2 hours);

        vm.expectEmit(true, true, false, true);
        emit AutoReleased(jobId, address(this));
        escrow.autoRelease(jobId);
    }

    // --- A1: resolveDisputeDraw in EscrowEngine ---

    function test_ResolveDisputeDraw_Splits5050() public {
        // Create and deliver job
        vm.startPrank(buyer);
        token.approve(address(escrow), 100 ether);
        uint256 jobId = escrow.createJob(listingId, seller, 100 ether, address(token), 1 days);
        vm.stopPrank();

        vm.prank(seller);
        escrow.submitDelivery(jobId, "ipfs://delivery");

        // Initiate dispute
        vm.prank(buyer);
        escrow.initiateDispute(jobId, "ipfs://evidence");

        uint256 disputeId = escrow.getJobDisputeId(jobId);

        // Two-phase panel: seal after delay (strict > requires +11)
        vm.roll(block.number + 11);
        dispute.sealPanel(disputeId);

        IDisputeArbitration.Dispute memory d = dispute.getDispute(disputeId);

        // Submit counter evidence
        vm.prank(seller);
        dispute.submitCounterEvidence(disputeId, "ipfs://counter");

        // Vote tie: 1 for buyer, 1 for seller
        vm.prank(d.arbitrators[0]);
        dispute.vote(disputeId, true);
        vm.prank(d.arbitrators[1]);
        dispute.vote(disputeId, false);

        // Warp past voting deadline
        vm.warp(block.timestamp + 4 days);

        uint256 buyerBalBefore = token.balanceOf(buyer);
        uint256 sellerBalBefore = token.balanceOf(seller);

        dispute.executeRuling(disputeId);

        // Finalize ruling after appeal window
        vm.warp(block.timestamp + 49 hours);
        dispute.finalizeRuling(disputeId);

        // LOB has 0% fee, so each gets 50 ether
        uint256 buyerGain = token.balanceOf(buyer) - buyerBalBefore;
        uint256 sellerGain = token.balanceOf(seller) - sellerBalBefore;
        assertEq(buyerGain, 50 ether);
        assertEq(sellerGain, 50 ether);

        // Job should be resolved
        IEscrowEngine.Job memory job = escrow.getJob(jobId);
        assertEq(uint256(job.status), uint256(IEscrowEngine.JobStatus.Resolved));
    }

    // --- Skill Escrow Tests ---

    event SkillEscrowCreated(uint256 indexed jobId, uint256 indexed skillId, address indexed buyer, address seller, uint256 amount);

    address public skillRegistryAddr = makeAddr("skillRegistry");

    function _grantSkillRegistryRole() internal {
        bytes32 role = escrow.SKILL_REGISTRY_ROLE();
        vm.prank(admin);
        escrow.grantRole(role, skillRegistryAddr);
    }

    function test_CreateSkillEscrow_HappyPath() public {
        _grantSkillRegistryRole();

        vm.prank(buyer);
        token.approve(address(escrow), 50 ether);

        vm.prank(skillRegistryAddr);
        uint256 jobId = escrow.createSkillEscrow(42, buyer, seller, 50 ether, address(token));

        IEscrowEngine.Job memory job = escrow.getJob(jobId);
        assertEq(job.buyer, buyer);
        assertEq(job.seller, seller);
        assertEq(job.amount, 50 ether);
        assertEq(job.fee, 0); // LOB = 0%
        assertEq(uint256(job.status), uint256(IEscrowEngine.JobStatus.Delivered));
        assertEq(uint256(job.escrowType), uint256(IEscrowEngine.EscrowType.SKILL_PURCHASE));
        assertEq(job.skillId, 42);
        assertEq(job.disputeWindowEnd, block.timestamp + 72 hours);
    }

    function test_CreateSkillEscrow_RevertNotRole() public {
        vm.prank(buyer);
        token.approve(address(escrow), 50 ether);

        vm.prank(buyer);
        vm.expectRevert();
        escrow.createSkillEscrow(1, buyer, seller, 50 ether, address(token));
    }

    function test_CreateSkillEscrow_LOBZeroFee() public {
        _grantSkillRegistryRole();

        vm.prank(buyer);
        token.approve(address(escrow), 1000 ether);

        vm.prank(skillRegistryAddr);
        uint256 jobId = escrow.createSkillEscrow(1, buyer, seller, 1000 ether, address(token));

        IEscrowEngine.Job memory job = escrow.getJob(jobId);
        assertEq(job.fee, 0);
    }

    function test_SkillEscrow_AutoReleaseAfter72h() public {
        _grantSkillRegistryRole();

        vm.prank(buyer);
        token.approve(address(escrow), 50 ether);

        vm.prank(skillRegistryAddr);
        uint256 jobId = escrow.createSkillEscrow(1, buyer, seller, 50 ether, address(token));

        // Warp past 72h dispute window
        vm.warp(block.timestamp + 73 hours);

        uint256 sellerBalBefore = token.balanceOf(seller);
        escrow.autoRelease(jobId);
        assertEq(token.balanceOf(seller), sellerBalBefore + 50 ether);
    }

    function test_SkillEscrow_BuyerCanConfirmEarly() public {
        _grantSkillRegistryRole();

        vm.prank(buyer);
        token.approve(address(escrow), 50 ether);

        vm.prank(skillRegistryAddr);
        uint256 jobId = escrow.createSkillEscrow(1, buyer, seller, 50 ether, address(token));

        uint256 sellerBalBefore = token.balanceOf(seller);

        vm.prank(buyer);
        escrow.confirmDelivery(jobId);

        assertEq(token.balanceOf(seller), sellerBalBefore + 50 ether);
    }

    function test_SkillEscrow_BuyerCanDisputeWithin72h() public {
        _grantSkillRegistryRole();

        vm.prank(buyer);
        token.approve(address(escrow), 50 ether);

        vm.prank(skillRegistryAddr);
        uint256 jobId = escrow.createSkillEscrow(1, buyer, seller, 50 ether, address(token));

        vm.prank(buyer);
        escrow.initiateDispute(jobId, "ipfs://evidence");

        IEscrowEngine.Job memory job = escrow.getJob(jobId);
        assertEq(uint256(job.status), uint256(IEscrowEngine.JobStatus.Disputed));
    }

    function test_SubmitDelivery_RevertsOnSkillEscrow() public {
        _grantSkillRegistryRole();

        vm.prank(buyer);
        token.approve(address(escrow), 50 ether);

        vm.prank(skillRegistryAddr);
        uint256 jobId = escrow.createSkillEscrow(1, buyer, seller, 50 ether, address(token));

        vm.prank(seller);
        vm.expectRevert("EscrowEngine: not service job");
        escrow.submitDelivery(jobId, "ipfs://nope");
    }

    function test_CreateSkillEscrow_EmitEvent() public {
        _grantSkillRegistryRole();

        vm.prank(buyer);
        token.approve(address(escrow), 50 ether);

        vm.prank(skillRegistryAddr);
        vm.expectEmit(true, true, true, true);
        emit SkillEscrowCreated(1, 42, buyer, seller, 50 ether);
        escrow.createSkillEscrow(42, buyer, seller, 50 ether, address(token));
    }

    // ═══════════════════════════════════════════════════════════════
    //  V-002: TOKEN ALLOWLIST
    // ═══════════════════════════════════════════════════════════════

    function test_TokenAllowlist_LOBAutoAllowed() public view {
        assertTrue(escrow.isTokenAllowed(address(token)));
    }

    function test_TokenAllowlist_AddAndRemove() public {
        address fakeToken = makeAddr("fakeToken");

        assertFalse(escrow.isTokenAllowed(fakeToken));

        vm.prank(admin);
        escrow.allowlistToken(fakeToken);
        assertTrue(escrow.isTokenAllowed(fakeToken));

        vm.prank(admin);
        escrow.removeToken(fakeToken);
        assertFalse(escrow.isTokenAllowed(fakeToken));
    }

    function test_TokenAllowlist_CannotRemoveLOB() public {
        vm.prank(admin);
        vm.expectRevert("EscrowEngine: cannot remove LOB");
        escrow.removeToken(address(token));
    }

    function test_TokenAllowlist_OnlyAdmin() public {
        address fakeToken = makeAddr("fakeToken");

        vm.prank(buyer);
        vm.expectRevert();
        escrow.allowlistToken(fakeToken);
    }

    // ═══════════════════════════════════════════════════════════════
    //  GAME THEORY: MIN_ESCROW_AMOUNT
    // ═══════════════════════════════════════════════════════════════

    function test_CreateJob_RevertBelowMinimum() public {
        vm.startPrank(buyer);
        token.approve(address(escrow), 9 ether);
        vm.expectRevert("EscrowEngine: below minimum");
        escrow.createJob(listingId, seller, 9 ether, address(token), 1 days);
        vm.stopPrank();
    }

    function test_CreateSkillEscrow_RevertBelowMinimum() public {
        _grantSkillRegistryRole();

        vm.prank(buyer);
        token.approve(address(escrow), 5 ether);

        vm.prank(skillRegistryAddr);
        vm.expectRevert("EscrowEngine: below minimum");
        escrow.createSkillEscrow(1, buyer, seller, 5 ether, address(token));
    }

    // ═══════════════════════════════════════════════════════════════
    //  GAME THEORY: AUTO_RELEASE_GRACE PERIOD
    // ═══════════════════════════════════════════════════════════════

    function test_AutoRelease_SellerReleasesAtWindowEnd() public {
        vm.startPrank(buyer);
        token.approve(address(escrow), 50 ether);
        uint256 jobId = escrow.createJob(listingId, seller, 50 ether, address(token), 1 days);
        vm.stopPrank();

        vm.prank(seller);
        escrow.submitDelivery(jobId, "ipfs://delivery");

        // Warp to just past dispute window end (1hr for < 500 LOB)
        vm.warp(block.timestamp + 1 hours + 1);

        uint256 sellerBalBefore = token.balanceOf(seller);

        // Seller can release immediately at window expiry
        vm.prank(seller);
        escrow.autoRelease(jobId);

        assertEq(token.balanceOf(seller), sellerBalBefore + 50 ether);
    }

    function test_AutoRelease_NonSellerBlockedDuringGrace() public {
        vm.startPrank(buyer);
        token.approve(address(escrow), 50 ether);
        uint256 jobId = escrow.createJob(listingId, seller, 50 ether, address(token), 1 days);
        vm.stopPrank();

        vm.prank(seller);
        escrow.submitDelivery(jobId, "ipfs://delivery");

        // Warp to just past dispute window but within grace period
        vm.warp(block.timestamp + 1 hours + 1);

        vm.expectRevert("EscrowEngine: grace period active");
        escrow.autoRelease(jobId); // called by test contract (not seller)
    }

    function test_AutoRelease_NonSellerReleasesAfterGrace() public {
        vm.startPrank(buyer);
        token.approve(address(escrow), 50 ether);
        uint256 jobId = escrow.createJob(listingId, seller, 50 ether, address(token), 1 days);
        vm.stopPrank();

        vm.prank(seller);
        escrow.submitDelivery(jobId, "ipfs://delivery");

        // Warp past dispute window + grace period
        vm.warp(block.timestamp + 1 hours + 15 minutes + 1);

        uint256 sellerBalBefore = token.balanceOf(seller);

        escrow.autoRelease(jobId); // called by test contract (not seller)

        assertEq(token.balanceOf(seller), sellerBalBefore + 50 ether);
    }

    function test_CreateSkillEscrow_RevertTokenNotAllowed() public {
        _grantSkillRegistryRole();

        address badToken = makeAddr("badToken");

        vm.prank(skillRegistryAddr);
        vm.expectRevert("EscrowEngine: token not allowed");
        escrow.createSkillEscrow(1, buyer, seller, 50 ether, badToken);
    }

    // ═══════════════════════════════════════════════════════════════
    //  V-001b: MIN_REPUTATION_VALUE GATE
    // ═══════════════════════════════════════════════════════════════

    function test_ConfirmDelivery_SubThresholdNoReputation() public {
        // Create a small listing (below 50 LOB threshold)
        vm.prank(seller);
        uint256 smallListingId = registry.createListing(
            IServiceRegistry.ServiceCategory.DATA_SCRAPING,
            "Small Service",
            "Cheap job",
            10 ether,
            address(token),
            3600,
            ""
        );

        vm.startPrank(buyer);
        token.approve(address(escrow), 10 ether);
        uint256 jobId = escrow.createJob(smallListingId, seller, 10 ether, address(token), 1 days);
        vm.stopPrank();

        vm.prank(seller);
        escrow.submitDelivery(jobId, "ipfs://delivery");

        // Check reputation before
        IReputationSystem.ReputationData memory dataBefore = reputation.getReputationData(seller);
        uint256 completionsBefore = dataBefore.completions;

        vm.prank(buyer);
        escrow.confirmDelivery(jobId);

        // Reputation should NOT have been recorded (below 50 LOB threshold)
        IReputationSystem.ReputationData memory dataAfter = reputation.getReputationData(seller);
        assertEq(dataAfter.completions, completionsBefore, "Sub-threshold job should not record reputation");
    }

    function test_ConfirmDelivery_AboveThresholdRecordsReputation() public {
        vm.startPrank(buyer);
        token.approve(address(escrow), 50 ether);
        uint256 jobId = escrow.createJob(listingId, seller, 50 ether, address(token), 1 days);
        vm.stopPrank();

        vm.prank(seller);
        escrow.submitDelivery(jobId, "ipfs://delivery");

        IReputationSystem.ReputationData memory dataBefore = reputation.getReputationData(seller);
        uint256 completionsBefore = dataBefore.completions;

        vm.prank(buyer);
        escrow.confirmDelivery(jobId);

        IReputationSystem.ReputationData memory dataAfter = reputation.getReputationData(seller);
        assertEq(dataAfter.completions, completionsBefore + 1, "Above-threshold job should record reputation");
    }

    function test_AutoRelease_SubThresholdNoReputation() public {
        // Create a small listing
        vm.prank(seller);
        uint256 smallListingId = registry.createListing(
            IServiceRegistry.ServiceCategory.DATA_SCRAPING,
            "Small Service",
            "Cheap job",
            10 ether,
            address(token),
            3600,
            ""
        );

        vm.startPrank(buyer);
        token.approve(address(escrow), 10 ether);
        uint256 jobId = escrow.createJob(smallListingId, seller, 10 ether, address(token), 1 days);
        vm.stopPrank();

        vm.prank(seller);
        escrow.submitDelivery(jobId, "ipfs://delivery");

        vm.warp(block.timestamp + 2 hours);

        IReputationSystem.ReputationData memory dataBefore = reputation.getReputationData(seller);
        uint256 completionsBefore = dataBefore.completions;

        escrow.autoRelease(jobId);

        IReputationSystem.ReputationData memory dataAfter = reputation.getReputationData(seller);
        assertEq(dataAfter.completions, completionsBefore, "Sub-threshold auto-release should not record reputation");
    }
}
