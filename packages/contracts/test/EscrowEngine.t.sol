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
        token = new LOBToken(distributor);
        reputation = new ReputationSystem();
        staking = new StakingManager(address(token));
        mockSybilGuard = new MockSybilGuard();
        registry = new ServiceRegistry(address(staking), address(reputation), address(mockSybilGuard));
        dispute = new DisputeArbitration(address(token), address(staking), address(reputation), address(mockSybilGuard));
        escrow = new EscrowEngine(
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
    }

    function test_CreateJob() public {
        vm.startPrank(buyer);
        token.approve(address(escrow), 50 ether);
        uint256 jobId = escrow.createJob(listingId, seller, 50 ether, address(token));
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
        uint256 jobId = escrow.createJob(listingId, seller, 1000 ether, address(token));
        vm.stopPrank();

        IEscrowEngine.Job memory job = escrow.getJob(jobId);
        assertEq(job.fee, 0);
    }

    function test_CreateJob_RevertSelfHire() public {
        vm.startPrank(seller);
        token.approve(address(escrow), 50 ether);

        vm.expectRevert("EscrowEngine: self-hire");
        escrow.createJob(listingId, seller, 50 ether, address(token));
        vm.stopPrank();
    }

    function test_CreateJob_RevertInactiveListing() public {
        vm.prank(seller);
        registry.deactivateListing(listingId);

        vm.startPrank(buyer);
        token.approve(address(escrow), 50 ether);

        vm.expectRevert("EscrowEngine: listing inactive");
        escrow.createJob(listingId, seller, 50 ether, address(token));
        vm.stopPrank();
    }

    function test_SubmitDelivery() public {
        vm.startPrank(buyer);
        token.approve(address(escrow), 50 ether);
        uint256 jobId = escrow.createJob(listingId, seller, 50 ether, address(token));
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
        uint256 jobId = escrow.createJob(listingId, seller, 50 ether, address(token));

        vm.expectRevert("EscrowEngine: not seller");
        escrow.submitDelivery(jobId, "ipfs://delivery");
        vm.stopPrank();
    }

    function test_ConfirmDelivery() public {
        // Create and deliver job
        vm.startPrank(buyer);
        token.approve(address(escrow), 50 ether);
        uint256 jobId = escrow.createJob(listingId, seller, 50 ether, address(token));
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
        uint256 jobId = escrow.createJob(listingId, seller, 50 ether, address(token));
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
        uint256 jobId = escrow.createJob(listingId, seller, 50 ether, address(token));
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
        uint256 jobId = escrow.createJob(listingId, seller, 50 ether, address(token));
        vm.stopPrank();

        vm.prank(seller);
        escrow.submitDelivery(jobId, "ipfs://delivery");

        vm.expectRevert("EscrowEngine: window not expired");
        escrow.autoRelease(jobId);
    }

    function test_HighValueJob_LongerDisputeWindow() public {
        vm.startPrank(buyer);
        token.approve(address(escrow), 500 ether);
        uint256 jobId = escrow.createJob(listingId, seller, 500 ether, address(token));
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
        uint256 jobId = escrow.createJob(listingId, seller, 50 ether, address(token));
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
        uint256 jobId = escrow.createJob(listingId, seller, 50 ether, address(token));
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
        uint256 jobId = escrow.createJob(listingId, seller, 50 ether, address(token));
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
        vm.expectRevert("Pausable: paused");
        escrow.createJob(listingId, seller, 50 ether, address(token));
        vm.stopPrank();
    }

    function test_Paused_SubmitDeliveryReverts() public {
        vm.startPrank(buyer);
        token.approve(address(escrow), 50 ether);
        uint256 jobId = escrow.createJob(listingId, seller, 50 ether, address(token));
        vm.stopPrank();

        vm.prank(admin);
        escrow.pause();

        vm.prank(seller);
        vm.expectRevert("Pausable: paused");
        escrow.submitDelivery(jobId, "ipfs://delivery");
    }

    function test_Paused_ConfirmDeliveryReverts() public {
        vm.startPrank(buyer);
        token.approve(address(escrow), 50 ether);
        uint256 jobId = escrow.createJob(listingId, seller, 50 ether, address(token));
        vm.stopPrank();

        vm.prank(seller);
        escrow.submitDelivery(jobId, "ipfs://delivery");

        vm.prank(admin);
        escrow.pause();

        vm.prank(buyer);
        vm.expectRevert("Pausable: paused");
        escrow.confirmDelivery(jobId);
    }

    function test_Paused_AutoReleaseReverts() public {
        vm.startPrank(buyer);
        token.approve(address(escrow), 50 ether);
        uint256 jobId = escrow.createJob(listingId, seller, 50 ether, address(token));
        vm.stopPrank();

        vm.prank(seller);
        escrow.submitDelivery(jobId, "ipfs://delivery");

        vm.warp(block.timestamp + 2 hours);

        vm.prank(admin);
        escrow.pause();

        vm.expectRevert("Pausable: paused");
        escrow.autoRelease(jobId);
    }

    function test_Paused_InitiateDisputeReverts() public {
        vm.startPrank(buyer);
        token.approve(address(escrow), 50 ether);
        uint256 jobId = escrow.createJob(listingId, seller, 50 ether, address(token));
        vm.stopPrank();

        vm.prank(seller);
        escrow.submitDelivery(jobId, "ipfs://delivery");

        vm.prank(admin);
        escrow.pause();

        vm.prank(buyer);
        vm.expectRevert("Pausable: paused");
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
        uint256 jobId = escrow.createJob(listingId, seller, 50 ether, address(token));
        vm.stopPrank();

        assertEq(jobId, 1);
    }

    // --- Event Emission Tests ---

    function test_EmitJobCreated() public {
        vm.startPrank(buyer);
        token.approve(address(escrow), 50 ether);

        vm.expectEmit(true, true, true, true);
        emit JobCreated(1, listingId, buyer, seller, 50 ether, address(token), 0);
        escrow.createJob(listingId, seller, 50 ether, address(token));
        vm.stopPrank();
    }

    function test_EmitDeliverySubmitted() public {
        vm.startPrank(buyer);
        token.approve(address(escrow), 50 ether);
        uint256 jobId = escrow.createJob(listingId, seller, 50 ether, address(token));
        vm.stopPrank();

        vm.prank(seller);
        vm.expectEmit(true, false, false, true);
        emit DeliverySubmitted(jobId, "ipfs://delivery");
        escrow.submitDelivery(jobId, "ipfs://delivery");
    }

    function test_EmitDeliveryConfirmed() public {
        vm.startPrank(buyer);
        token.approve(address(escrow), 50 ether);
        uint256 jobId = escrow.createJob(listingId, seller, 50 ether, address(token));
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
        uint256 jobId = escrow.createJob(listingId, seller, 50 ether, address(token));
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
        uint256 jobId = escrow.createJob(listingId, seller, 50 ether, address(token));
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
        uint256 jobId = escrow.createJob(listingId, seller, 100 ether, address(token));
        vm.stopPrank();

        vm.prank(seller);
        escrow.submitDelivery(jobId, "ipfs://delivery");

        // Initiate dispute
        vm.prank(buyer);
        escrow.initiateDispute(jobId, "ipfs://evidence");

        uint256 disputeId = escrow.getJobDisputeId(jobId);
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

        // LOB has 0% fee, so each gets 50 ether
        uint256 buyerGain = token.balanceOf(buyer) - buyerBalBefore;
        uint256 sellerGain = token.balanceOf(seller) - sellerBalBefore;
        assertEq(buyerGain, 50 ether);
        assertEq(sellerGain, 50 ether);

        // Job should be resolved
        IEscrowEngine.Job memory job = escrow.getJob(jobId);
        assertEq(uint256(job.status), uint256(IEscrowEngine.JobStatus.Resolved));
    }
}
