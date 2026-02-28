// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/ReviewRegistry.sol";
import "./helpers/ProxyTestHelper.sol";

contract MockEscrowForReviews {
    mapping(uint256 => IEscrowEngine.Job) private _jobs;

    function setJob(uint256 jobId, IEscrowEngine.Job memory job) external {
        _jobs[jobId] = job;
    }

    function getJob(uint256 jobId) external view returns (IEscrowEngine.Job memory) {
        return _jobs[jobId];
    }
}

contract MockSybilGuardForReviews {
    mapping(address => bool) public banned;

    function setBanned(address user, bool val) external {
        banned[user] = val;
    }

    function checkBanned(address user) external view returns (bool) {
        return banned[user];
    }

    function checkAnyBanned(address[] calldata) external pure returns (bool) {
        return false;
    }
}

contract ReviewRegistryTest is Test, ProxyTestHelper {
    event ReviewSubmitted(
        uint256 indexed reviewId,
        uint256 indexed jobId,
        address indexed reviewer,
        address subject,
        uint8 rating,
        string metadataURI
    );

    ReviewRegistry public registry;
    MockEscrowForReviews public escrow;
    MockSybilGuardForReviews public sybilGuard;

    address public admin = makeAddr("admin");
    address public buyer = makeAddr("buyer");
    address public seller = makeAddr("seller");
    address public thirdParty = makeAddr("thirdParty");

    function setUp() public {
        vm.startPrank(admin);
        escrow = new MockEscrowForReviews();
        sybilGuard = new MockSybilGuardForReviews();
        registry = ReviewRegistry(_deployProxy(address(new ReviewRegistry()), abi.encodeCall(ReviewRegistry.initialize, (address(escrow), address(sybilGuard)))));
        // Set up a confirmed job (id=1)
        _createJob(1, buyer, seller, IEscrowEngine.JobStatus.Confirmed);
        // Set up a released job (id=2)
        _createJob(2, buyer, seller, IEscrowEngine.JobStatus.Released);
        // Set up a resolved job (id=3)
        _createJob(3, buyer, seller, IEscrowEngine.JobStatus.Resolved);
        // Set up an active job (id=4) - should not be reviewable
        _createJob(4, buyer, seller, IEscrowEngine.JobStatus.Active);
        vm.stopPrank();
    }

    function _createJob(uint256 jobId, address _buyer, address _seller, IEscrowEngine.JobStatus status) internal {
        IEscrowEngine.Job memory job = IEscrowEngine.Job({
            id: jobId,
            listingId: 1,
            buyer: _buyer,
            seller: _seller,
            amount: 100 ether,
            token: address(0),
            fee: 1 ether,
            status: status,
            createdAt: block.timestamp,
            disputeWindowEnd: block.timestamp + 1 hours,
            deliveryMetadataURI: "",
            escrowType: IEscrowEngine.EscrowType.SERVICE_JOB,
            skillId: 0,
            deliveryDeadline: block.timestamp + 7 days
        });
        escrow.setJob(jobId, job);
    }

    // ═══════════════════════════════════════════════════════════════
    //  HAPPY PATH
    // ═══════════════════════════════════════════════════════════════

    function test_buyerReviewsSeller() public {
        vm.prank(buyer);
        registry.submitReview(1, 5, "ipfs://review1");

        IReviewRegistry.Review memory review = registry.getReview(1);
        assertEq(review.id, 1);
        assertEq(review.jobId, 1);
        assertEq(review.reviewer, buyer);
        assertEq(review.subject, seller);
        assertEq(review.rating, 5);
        assertEq(review.metadataURI, "ipfs://review1");
    }

    function test_sellerReviewsBuyer() public {
        vm.prank(seller);
        registry.submitReview(1, 4, "ipfs://review2");

        IReviewRegistry.Review memory review = registry.getReview(1);
        assertEq(review.subject, buyer);
        assertEq(review.reviewer, seller);
        assertEq(review.rating, 4);
    }

    function test_bothPartiesCanReviewSameJob() public {
        vm.prank(buyer);
        registry.submitReview(1, 5, "ipfs://buyer-review");

        vm.prank(seller);
        registry.submitReview(1, 3, "ipfs://seller-review");

        IReviewRegistry.Review memory buyerReview = registry.getReviewByJobAndReviewer(1, buyer);
        IReviewRegistry.Review memory sellerReview = registry.getReviewByJobAndReviewer(1, seller);

        assertEq(buyerReview.subject, seller);
        assertEq(sellerReview.subject, buyer);
    }

    function test_reviewOnReleasedJob() public {
        vm.prank(buyer);
        registry.submitReview(2, 4, "ipfs://released");

        IReviewRegistry.Review memory review = registry.getReview(1);
        assertEq(review.jobId, 2);
    }

    function test_reviewOnResolvedJob() public {
        vm.prank(buyer);
        registry.submitReview(3, 2, "ipfs://resolved");

        IReviewRegistry.Review memory review = registry.getReview(1);
        assertEq(review.jobId, 3);
    }

    // ═══════════════════════════════════════════════════════════════
    //  REVERTS
    // ═══════════════════════════════════════════════════════════════

    function test_revertOnActiveJob() public {
        vm.prank(buyer);
        vm.expectRevert("ReviewRegistry: job not completed");
        registry.submitReview(4, 5, "ipfs://too-early");
    }

    function test_revertOnDuplicateReview() public {
        vm.prank(buyer);
        registry.submitReview(1, 5, "ipfs://first");

        vm.prank(buyer);
        vm.expectRevert("ReviewRegistry: already reviewed");
        registry.submitReview(1, 4, "ipfs://second");
    }

    function test_revertOnInvalidRatingZero() public {
        vm.prank(buyer);
        vm.expectRevert("ReviewRegistry: invalid rating");
        registry.submitReview(1, 0, "ipfs://bad");
    }

    function test_revertOnInvalidRatingSix() public {
        vm.prank(buyer);
        vm.expectRevert("ReviewRegistry: invalid rating");
        registry.submitReview(1, 6, "ipfs://bad");
    }

    function test_revertOnBannedReviewer() public {
        sybilGuard.setBanned(buyer, true);

        vm.prank(buyer);
        vm.expectRevert("ReviewRegistry: reviewer banned");
        registry.submitReview(1, 5, "ipfs://banned");
    }

    function test_revertOnNonParticipant() public {
        vm.prank(thirdParty);
        vm.expectRevert("ReviewRegistry: not job participant");
        registry.submitReview(1, 5, "ipfs://intruder");
    }

    function test_revertGetNonexistentReview() public {
        vm.expectRevert("ReviewRegistry: review not found");
        registry.getReview(999);
    }

    function test_revertGetReviewByJobAndReviewerNotFound() public {
        vm.expectRevert("ReviewRegistry: review not found");
        registry.getReviewByJobAndReviewer(1, buyer);
    }

    // ═══════════════════════════════════════════════════════════════
    //  RATING STATS
    // ═══════════════════════════════════════════════════════════════

    function test_ratingStatsAccumulation() public {
        // Create multiple jobs for same seller
        _createJob(10, buyer, seller, IEscrowEngine.JobStatus.Confirmed);
        _createJob(11, buyer, seller, IEscrowEngine.JobStatus.Confirmed);

        vm.prank(buyer);
        registry.submitReview(1, 5, "ipfs://r1");

        vm.prank(buyer);
        registry.submitReview(10, 3, "ipfs://r2");

        vm.prank(buyer);
        registry.submitReview(11, 4, "ipfs://r3");

        IReviewRegistry.RatingStats memory stats = registry.getRatingStats(seller);
        assertEq(stats.totalRatings, 3);
        assertEq(stats.sumRatings, 12); // 5 + 3 + 4

        (uint256 num, uint256 den) = registry.getAverageRating(seller);
        assertEq(num, 12);
        assertEq(den, 3);
    }

    function test_averageRatingNoReviews() public view {
        (uint256 num, uint256 den) = registry.getAverageRating(thirdParty);
        assertEq(num, 0);
        assertEq(den, 0);
    }

    // ═══════════════════════════════════════════════════════════════
    //  EVENTS
    // ═══════════════════════════════════════════════════════════════

    function test_emitsReviewSubmitted() public {
        vm.expectEmit(true, true, true, true);
        emit ReviewSubmitted(1, 1, buyer, seller, 5, "ipfs://event");

        vm.prank(buyer);
        registry.submitReview(1, 5, "ipfs://event");
    }

    // ═══════════════════════════════════════════════════════════════
    //  PAUSE
    // ═══════════════════════════════════════════════════════════════

    function test_pauseBlocksReviews() public {
        vm.prank(admin);
        registry.pause();

        vm.prank(buyer);
        vm.expectRevert("EnforcedPause()");
        registry.submitReview(1, 5, "ipfs://paused");
    }

    function test_unpauseResumesReviews() public {
        vm.prank(admin);
        registry.pause();

        vm.prank(admin);
        registry.unpause();

        vm.prank(buyer);
        registry.submitReview(1, 5, "ipfs://resumed");
    }

    // ═══════════════════════════════════════════════════════════════
    //  CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════

    function test_revertZeroEscrowEngine() public {
        address impl = address(new ReviewRegistry());
        vm.expectRevert();
        _deployProxy(impl, abi.encodeCall(ReviewRegistry.initialize, (address(0), address(sybilGuard))));
    }

    function test_revertZeroSybilGuard() public {
        address impl = address(new ReviewRegistry());
        vm.expectRevert();
        _deployProxy(impl, abi.encodeCall(ReviewRegistry.initialize, (address(escrow), address(0))));
    }
}
