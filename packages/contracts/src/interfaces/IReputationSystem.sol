// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IReputationSystem {
    enum ReputationTier { Bronze, Silver, Gold, Platinum }

    struct ReputationData {
        uint256 score;
        uint256 completions;
        uint256 disputesLost;
        uint256 disputesWon;
        uint256 firstActivityTimestamp;
    }

    event ScoreUpdated(address indexed user, uint256 newScore, ReputationTier newTier);
    event CompletionRecorded(address indexed provider, address indexed client, uint256 deliveryTime, uint256 estimatedTime);

    function recordCompletion(address provider, address client, uint256 deliveryTime, uint256 estimatedTime) external;
    function recordDispute(address provider, bool providerWon) external;
    function getScore(address user) external view returns (uint256 score, ReputationTier tier);
    function getReputationData(address user) external view returns (ReputationData memory);
}
