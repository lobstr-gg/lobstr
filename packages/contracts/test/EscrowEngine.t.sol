// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/LOBToken.sol";
import "../src/StakingManager.sol";
import "../src/ReputationSystem.sol";
import "../src/ServiceRegistry.sol";
import "../src/DisputeArbitration.sol";
import "../src/EscrowEngine.sol";

contract EscrowEngineTest is Test {
    LOBToken public token;
    StakingManager public staking;
    ReputationSystem public reputation;
    ServiceRegistry public registry;
    DisputeArbitration public dispute;
    EscrowEngine public escrow;

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
        registry = new ServiceRegistry(address(staking), address(reputation));
        dispute = new DisputeArbitration(address(token), address(staking), address(reputation));
        escrow = new EscrowEngine(
            address(token),
            address(registry),
            address(staking),
            address(dispute),
            address(reputation),
            treasury
        );

        // Grant roles
        reputation.grantRole(reputation.RECORDER_ROLE(), address(escrow));
        reputation.grantRole(reputation.RECORDER_ROLE(), address(dispute));
        staking.grantRole(staking.SLASHER_ROLE(), address(dispute));
        dispute.grantRole(dispute.ESCROW_ROLE(), address(escrow));
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
}
