// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IReviewRegistry {
    struct Review {
        uint256 id;
        uint256 jobId;
        address reviewer;
        address subject;
        uint8 rating;
        string metadataURI;
        uint256 timestamp;
    }

    struct RatingStats {
        uint256 totalRatings;
        uint256 sumRatings;
    }

    event ReviewSubmitted(
        uint256 indexed reviewId,
        uint256 indexed jobId,
        address indexed reviewer,
        address subject,
        uint8 rating,
        string metadataURI
    );

    function submitReview(uint256 jobId, uint8 rating, string calldata metadataURI) external;
    function getReview(uint256 reviewId) external view returns (Review memory);
    function getReviewByJobAndReviewer(uint256 jobId, address reviewer) external view returns (Review memory);
    function getRatingStats(address subject) external view returns (RatingStats memory);
    function getAverageRating(address subject) external view returns (uint256 numerator, uint256 denominator);
}
