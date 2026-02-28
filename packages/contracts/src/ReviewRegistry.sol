// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "./interfaces/IReviewRegistry.sol";
import "./interfaces/IEscrowEngine.sol";
import "./interfaces/ISybilGuard.sol";

contract ReviewRegistry is IReviewRegistry, Initializable, UUPSUpgradeable, OwnableUpgradeable, AccessControlUpgradeable, ReentrancyGuardUpgradeable, PausableUpgradeable {
    IEscrowEngine public escrowEngine;
    ISybilGuard public sybilGuard;

    uint256 private _nextReviewId = 1;

    mapping(uint256 => Review) private _reviews;
    mapping(uint256 => mapping(address => uint256)) private _jobReviewIds;
    mapping(address => RatingStats) private _ratingStats;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _escrowEngine, address _sybilGuard) public virtual initializer {
        require(_escrowEngine != address(0), "ReviewRegistry: zero escrowEngine");
        require(_sybilGuard != address(0), "ReviewRegistry: zero sybilGuard");

        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();
        __AccessControl_init();
        __ReentrancyGuard_init();
        __Pausable_init();

        // OZ 5.x: grant DEFAULT_ADMIN_ROLE to owner for access control
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

        _nextReviewId = 1;

        escrowEngine = IEscrowEngine(_escrowEngine);
        sybilGuard = ISybilGuard(_sybilGuard);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    function submitReview(
        uint256 jobId,
        uint8 rating,
        string calldata metadataURI
    ) external nonReentrant whenNotPaused {
        require(rating >= 1 && rating <= 5, "ReviewRegistry: invalid rating");
        require(!sybilGuard.checkBanned(msg.sender), "ReviewRegistry: reviewer banned");

        IEscrowEngine.Job memory job = escrowEngine.getJob(jobId);

        require(
            job.status == IEscrowEngine.JobStatus.Confirmed ||
            job.status == IEscrowEngine.JobStatus.Released ||
            job.status == IEscrowEngine.JobStatus.Resolved,
            "ReviewRegistry: job not completed"
        );

        address subject;
        if (msg.sender == job.buyer) {
            subject = job.seller;
        } else if (msg.sender == job.seller) {
            subject = job.buyer;
        } else {
            revert("ReviewRegistry: not job participant");
        }

        require(_jobReviewIds[jobId][msg.sender] == 0, "ReviewRegistry: already reviewed");

        uint256 reviewId = _nextReviewId++;

        _reviews[reviewId] = Review({
            id: reviewId,
            jobId: jobId,
            reviewer: msg.sender,
            subject: subject,
            rating: rating,
            metadataURI: metadataURI,
            timestamp: block.timestamp
        });

        _jobReviewIds[jobId][msg.sender] = reviewId;

        RatingStats storage stats = _ratingStats[subject];
        stats.totalRatings++;
        stats.sumRatings += rating;

        emit ReviewSubmitted(reviewId, jobId, msg.sender, subject, rating, metadataURI);
    }

    function getReview(uint256 reviewId) external view returns (Review memory) {
        require(_reviews[reviewId].id != 0, "ReviewRegistry: review not found");
        return _reviews[reviewId];
    }

    function getReviewByJobAndReviewer(uint256 jobId, address reviewer) external view returns (Review memory) {
        uint256 reviewId = _jobReviewIds[jobId][reviewer];
        require(reviewId != 0, "ReviewRegistry: review not found");
        return _reviews[reviewId];
    }

    function getRatingStats(address subject) external view returns (RatingStats memory) {
        return _ratingStats[subject];
    }

    function getAverageRating(address subject) external view returns (uint256 numerator, uint256 denominator) {
        RatingStats memory stats = _ratingStats[subject];
        return (stats.sumRatings, stats.totalRatings);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
}
