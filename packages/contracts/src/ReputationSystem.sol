// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./interfaces/IReputationSystem.sol";

contract ReputationSystem is IReputationSystem, Initializable, UUPSUpgradeable, OwnableUpgradeable, AccessControlUpgradeable, PausableUpgradeable {
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

    // Anti-farming: per-pair completion cap
    uint256 public constant MAX_PAIR_COMPLETIONS = 3;

    // Anti-farming: minimum unique counterparties per tier
    uint256 public constant SILVER_MIN_COUNTERPARTIES = 3;
    uint256 public constant GOLD_MIN_COUNTERPARTIES = 10;
    uint256 public constant PLATINUM_MIN_COUNTERPARTIES = 25;

    // V-006: Anti-farming minimum tenure per tier
    uint256 public constant SILVER_MIN_TENURE = 7 days;
    uint256 public constant GOLD_MIN_TENURE = 30 days;
    uint256 public constant PLATINUM_MIN_TENURE = 90 days;

    mapping(address => ReputationData) private _reputations;

    // Anti-farming: track completions per provider→client pair
    mapping(address => mapping(address => uint256)) private _pairCompletions;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize() external initializer {
        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();
        __AccessControl_init();
        __Pausable_init();

        // Grant DEFAULT_ADMIN_ROLE to owner (can reassign and grant other roles)
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

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

        // Anti-farming: only count completions up to MAX_PAIR_COMPLETIONS per counterparty
        uint256 pairCount = _pairCompletions[provider][client];
        if (pairCount < MAX_PAIR_COMPLETIONS) {
            _pairCompletions[provider][client] = pairCount + 1;

            // Track unique counterparty on first interaction
            if (pairCount == 0) {
                rep.uniqueCounterparties++;
            }

            rep.completions += 1;
        }
        // else: completion event emitted but does NOT count toward score

        emit CompletionRecorded(provider, client);

        uint256 newScore = _calculateScore(provider);
        rep.score = newScore;

        emit ScoreUpdated(provider, newScore, _tierForUser(provider, newScore));
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

        emit ScoreUpdated(provider, newScore, _tierForUser(provider, newScore));
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function getScore(address user) external view returns (uint256 score, ReputationTier tier) {
        score = _calculateScore(user);
        tier = _tierForUser(user, score);
    }

    function getReputationData(address user) external view returns (ReputationData memory) {
        return _reputations[user];
    }

    function getPairCompletions(address provider, address client) external view returns (uint256) {
        return _pairCompletions[provider][client];
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

    /// @dev Tier is determined by score, unique counterparties, AND minimum tenure (V-006)
    function _tierForUser(address user, uint256 score) internal view returns (ReputationTier) {
        ReputationData storage rep = _reputations[user];
        uint256 uniqueCP = rep.uniqueCounterparties;
        uint256 tenure = rep.firstActivityTimestamp > 0
            ? block.timestamp - rep.firstActivityTimestamp
            : 0;

        if (score >= PLATINUM_THRESHOLD && uniqueCP >= PLATINUM_MIN_COUNTERPARTIES && tenure >= PLATINUM_MIN_TENURE) {
            return ReputationTier.Platinum;
        }
        if (score >= GOLD_THRESHOLD && uniqueCP >= GOLD_MIN_COUNTERPARTIES && tenure >= GOLD_MIN_TENURE) {
            return ReputationTier.Gold;
        }
        if (score >= SILVER_THRESHOLD && uniqueCP >= SILVER_MIN_COUNTERPARTIES && tenure >= SILVER_MIN_TENURE) {
            return ReputationTier.Silver;
        }
        return ReputationTier.Bronze;
    }

    // ─── Role Management ─────────────────────────────────────────────────────

    /// @notice Grant RECORDER_ROLE to contracts that need to record completions/disputes
    /// @dev Contracts like EscrowEngine, DisputeArbitration, LoanEngine, etc. need this role
    function grantRecorderRole(address recorder) external onlyRole(DEFAULT_ADMIN_ROLE) {
        grantRole(RECORDER_ROLE, recorder);
    }
}
