// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "./interfaces/IReputationSystem.sol";

contract ReputationSystem is IReputationSystem, AccessControl, Pausable {
    bytes32 public constant RECORDER_ROLE = keccak256("RECORDER_ROLE");

    uint256 public constant BASE_SCORE = 500;
    uint256 public constant COMPLETION_POINTS = 100;
    uint256 public constant DISPUTE_LOSS_PENALTY = 200;
    uint256 public constant DISPUTE_WIN_BONUS = 50;
    uint256 public constant TENURE_POINTS_PER_30_DAYS = 10;
    uint256 public constant MAX_TENURE_BONUS = 200;

    uint256 public constant SILVER_THRESHOLD = 1000;
    uint256 public constant GOLD_THRESHOLD = 5000;
    uint256 public constant PLATINUM_THRESHOLD = 10000;

    mapping(address => ReputationData) private _reputations;

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function recordCompletion(
        address provider,
        address client
    ) external onlyRole(RECORDER_ROLE) whenNotPaused {
        require(provider != address(0), "ReputationSystem: zero provider");
        require(client != address(0), "ReputationSystem: zero client");

        ReputationData storage rep = _reputations[provider];

        if (rep.firstActivityTimestamp == 0) {
            rep.firstActivityTimestamp = block.timestamp;
        }

        rep.completions += 1;

        emit CompletionRecorded(provider, client);

        uint256 newScore = _calculateScore(provider);
        rep.score = newScore;

        emit ScoreUpdated(provider, newScore, _tierFromScore(newScore));
    }

    function recordDispute(address provider, bool providerWon) external onlyRole(RECORDER_ROLE) whenNotPaused {
        require(provider != address(0), "ReputationSystem: zero provider");

        ReputationData storage rep = _reputations[provider];

        if (rep.firstActivityTimestamp == 0) {
            rep.firstActivityTimestamp = block.timestamp;
        }

        if (providerWon) {
            rep.disputesWon += 1;
        } else {
            rep.disputesLost += 1;
        }

        uint256 newScore = _calculateScore(provider);
        rep.score = newScore;

        emit ScoreUpdated(provider, newScore, _tierFromScore(newScore));
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function getScore(address user) external view returns (uint256 score, ReputationTier tier) {
        score = _calculateScore(user);
        tier = _tierFromScore(score);
    }

    function getReputationData(address user) external view returns (ReputationData memory) {
        return _reputations[user];
    }

    function _calculateScore(address user) internal view returns (uint256) {
        ReputationData storage rep = _reputations[user];

        uint256 score = BASE_SCORE;

        // Completion bonus
        score += rep.completions * COMPLETION_POINTS;

        // Dispute penalty/bonus
        uint256 penalty = rep.disputesLost * DISPUTE_LOSS_PENALTY;
        score += rep.disputesWon * DISPUTE_WIN_BONUS;

        if (penalty > score) {
            score = 0;
        } else {
            score -= penalty;
        }

        // Tenure bonus
        if (rep.firstActivityTimestamp > 0) {
            uint256 tenureDays = (block.timestamp - rep.firstActivityTimestamp) / 30 days;
            uint256 tenureBonus = tenureDays * TENURE_POINTS_PER_30_DAYS;
            if (tenureBonus > MAX_TENURE_BONUS) {
                tenureBonus = MAX_TENURE_BONUS;
            }
            score += tenureBonus;
        }

        return score;
    }

    function _tierFromScore(uint256 score) internal pure returns (ReputationTier) {
        if (score >= PLATINUM_THRESHOLD) return ReputationTier.Platinum;
        if (score >= GOLD_THRESHOLD) return ReputationTier.Gold;
        if (score >= SILVER_THRESHOLD) return ReputationTier.Silver;
        return ReputationTier.Bronze;
    }
}
