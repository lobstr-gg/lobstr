export interface ContractSource {
  name: string;
  fileName: string;
  description: string;
  lines: number;
  source: string;
}

export const CONTRACT_SOURCES: ContractSource[] = [
  {
    name: "LOBToken",
    fileName: "LOBToken.sol",
    description:
      "ERC-20 token with 1B fixed supply. No mint, no burn, no pause. The simplest contract in the protocol.",
    lines: 13,
    source: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract LOBToken is ERC20 {
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 ether;

    constructor(address distributionAddress) ERC20("LOBSTR", "LOB") {
        require(distributionAddress != address(0), "LOBToken: zero address");
        _mint(distributionAddress, TOTAL_SUPPLY);
    }
}`,
  },
  {
    name: "ReputationSystem",
    fileName: "ReputationSystem.sol",
    description:
      "On-chain reputation scoring with completion tracking, dispute penalties, tenure bonuses, and tier classification.",
    lines: 129,
    source: `// SPDX-License-Identifier: MIT
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
    uint256 public constant FAST_DELIVERY_BONUS = 25;
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
        address client,
        uint256 deliveryTime,
        uint256 estimatedTime
    ) external onlyRole(RECORDER_ROLE) whenNotPaused {
        require(provider != address(0), "ReputationSystem: zero provider");
        require(client != address(0), "ReputationSystem: zero client");

        ReputationData storage rep = _reputations[provider];

        if (rep.firstActivityTimestamp == 0) {
            rep.firstActivityTimestamp = block.timestamp;
        }

        rep.completions += 1;

        emit CompletionRecorded(provider, client, deliveryTime, estimatedTime);

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

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }

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
        score += rep.completions * COMPLETION_POINTS;
        uint256 penalty = rep.disputesLost * DISPUTE_LOSS_PENALTY;
        score += rep.disputesWon * DISPUTE_WIN_BONUS;
        if (penalty > score) { score = 0; } else { score -= penalty; }
        if (rep.firstActivityTimestamp > 0) {
            uint256 tenureDays = (block.timestamp - rep.firstActivityTimestamp) / 30 days;
            uint256 tenureBonus = tenureDays * TENURE_POINTS_PER_30_DAYS;
            if (tenureBonus > MAX_TENURE_BONUS) { tenureBonus = MAX_TENURE_BONUS; }
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
}`,
  },
  {
    name: "StakingManager",
    fileName: "StakingManager.sol",
    description:
      "Four-tier staking system with 7-day cooldown, slashing support, and tier-gated listing capacity.",
    lines: 151,
    source: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IStakingManager.sol";

contract StakingManager is IStakingManager, AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    bytes32 public constant SLASHER_ROLE = keccak256("SLASHER_ROLE");
    uint256 public constant UNSTAKE_COOLDOWN = 7 days;
    uint256 public constant BRONZE_THRESHOLD = 100 ether;
    uint256 public constant SILVER_THRESHOLD = 1_000 ether;
    uint256 public constant GOLD_THRESHOLD = 10_000 ether;
    uint256 public constant PLATINUM_THRESHOLD = 100_000 ether;

    IERC20 public immutable lobToken;
    mapping(address => StakeInfo) private _stakes;

    constructor(address _lobToken) {
        require(_lobToken != address(0), "StakingManager: zero token");
        lobToken = IERC20(_lobToken);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function stake(uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "StakingManager: zero amount");
        Tier oldTier = getTier(msg.sender);
        _stakes[msg.sender].amount += amount;
        lobToken.safeTransferFrom(msg.sender, address(this), amount);
        Tier newTier = getTier(msg.sender);
        emit Staked(msg.sender, amount, newTier);
        if (oldTier != newTier) { emit TierChanged(msg.sender, oldTier, newTier); }
    }

    function requestUnstake(uint256 amount) external nonReentrant whenNotPaused {
        StakeInfo storage info = _stakes[msg.sender];
        require(amount > 0, "StakingManager: zero amount");
        require(info.amount >= amount, "StakingManager: insufficient stake");
        require(info.unstakeRequestAmount == 0, "StakingManager: pending unstake");
        info.unstakeRequestAmount = amount;
        info.unstakeRequestTime = block.timestamp;
        emit UnstakeRequested(msg.sender, amount, block.timestamp + UNSTAKE_COOLDOWN);
    }

    function unstake() external nonReentrant {
        StakeInfo storage info = _stakes[msg.sender];
        uint256 amount = info.unstakeRequestAmount;
        require(amount > 0, "StakingManager: no pending unstake");
        require(block.timestamp >= info.unstakeRequestTime + UNSTAKE_COOLDOWN, "StakingManager: cooldown active");
        Tier oldTier = getTier(msg.sender);
        info.amount -= amount;
        info.unstakeRequestAmount = 0;
        info.unstakeRequestTime = 0;
        lobToken.safeTransfer(msg.sender, amount);
        Tier newTier = getTier(msg.sender);
        emit Unstaked(msg.sender, amount, newTier);
        if (oldTier != newTier) { emit TierChanged(msg.sender, oldTier, newTier); }
    }

    function slash(address user, uint256 amount, address beneficiary) external onlyRole(SLASHER_ROLE) nonReentrant {
        require(user != address(0), "StakingManager: zero user");
        require(beneficiary != address(0), "StakingManager: zero beneficiary");
        require(amount > 0, "StakingManager: zero amount");
        StakeInfo storage info = _stakes[user];
        uint256 slashable = info.amount;
        if (amount > slashable) { amount = slashable; }
        info.amount -= amount;
        if (info.unstakeRequestAmount > info.amount) {
            info.unstakeRequestAmount = 0;
            info.unstakeRequestTime = 0;
        }
        lobToken.safeTransfer(beneficiary, amount);
        emit Slashed(user, amount, beneficiary);
        Tier newTier = getTier(user);
        emit TierChanged(user, Tier.None, newTier);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }

    function getTier(address user) public view returns (Tier) {
        uint256 amount = _stakes[user].amount;
        if (amount >= PLATINUM_THRESHOLD) return Tier.Platinum;
        if (amount >= GOLD_THRESHOLD) return Tier.Gold;
        if (amount >= SILVER_THRESHOLD) return Tier.Silver;
        if (amount >= BRONZE_THRESHOLD) return Tier.Bronze;
        return Tier.None;
    }

    function getStake(address user) external view returns (uint256) { return _stakes[user].amount; }
    function getStakeInfo(address user) external view returns (StakeInfo memory) { return _stakes[user]; }

    function tierThreshold(Tier tier) external pure returns (uint256) {
        if (tier == Tier.Platinum) return PLATINUM_THRESHOLD;
        if (tier == Tier.Gold) return GOLD_THRESHOLD;
        if (tier == Tier.Silver) return SILVER_THRESHOLD;
        if (tier == Tier.Bronze) return BRONZE_THRESHOLD;
        return 0;
    }

    function maxListings(Tier tier) external pure returns (uint256) {
        if (tier == Tier.Platinum) return type(uint256).max;
        if (tier == Tier.Gold) return 25;
        if (tier == Tier.Silver) return 10;
        if (tier == Tier.Bronze) return 3;
        return 0;
    }
}`,
  },
  {
    name: "ServiceRegistry",
    fileName: "ServiceRegistry.sol",
    description:
      "Marketplace listing CRUD with staking tier validation, ban enforcement, and category-based organization.",
    lines: 129,
    source: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "./interfaces/IServiceRegistry.sol";
import "./interfaces/IStakingManager.sol";
import "./interfaces/IReputationSystem.sol";
import "./interfaces/ISybilGuard.sol";

contract ServiceRegistry is IServiceRegistry, AccessControl, ReentrancyGuard, Pausable {
    IStakingManager public immutable stakingManager;
    IReputationSystem public immutable reputationSystem;
    ISybilGuard public immutable sybilGuard;

    uint256 private _nextListingId = 1;

    mapping(uint256 => Listing) private _listings;
    mapping(address => uint256) private _providerListingCount;

    constructor(address _stakingManager, address _reputationSystem, address _sybilGuard) {
        require(_stakingManager != address(0), "ServiceRegistry: zero staking");
        require(_reputationSystem != address(0), "ServiceRegistry: zero reputation");
        require(_sybilGuard != address(0), "ServiceRegistry: zero sybilGuard");
        stakingManager = IStakingManager(_stakingManager);
        reputationSystem = IReputationSystem(_reputationSystem);
        sybilGuard = ISybilGuard(_sybilGuard);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function createListing(
        ServiceCategory category,
        string calldata title,
        string calldata description,
        uint256 pricePerUnit,
        address settlementToken,
        uint256 estimatedDeliverySeconds,
        string calldata metadataURI
    ) external nonReentrant whenNotPaused returns (uint256 listingId) {
        require(bytes(title).length > 0 && bytes(title).length <= 256, "ServiceRegistry: invalid title");
        require(bytes(description).length <= 1024, "ServiceRegistry: description too long");
        require(pricePerUnit > 0, "ServiceRegistry: zero price");
        require(estimatedDeliverySeconds > 0, "ServiceRegistry: zero delivery time");

        // H-4: Ban check
        require(!sybilGuard.checkBanned(msg.sender), "ServiceRegistry: provider banned");

        IStakingManager.Tier tier = stakingManager.getTier(msg.sender);
        require(tier != IStakingManager.Tier.None, "ServiceRegistry: no active stake");

        uint256 maxAllowed = stakingManager.maxListings(tier);
        require(_providerListingCount[msg.sender] < maxAllowed, "ServiceRegistry: max listings reached");

        listingId = _nextListingId++;

        _listings[listingId] = Listing({
            id: listingId,
            provider: msg.sender,
            category: category,
            title: title,
            description: description,
            pricePerUnit: pricePerUnit,
            settlementToken: settlementToken,
            estimatedDeliverySeconds: estimatedDeliverySeconds,
            metadataURI: metadataURI,
            active: true,
            createdAt: block.timestamp
        });

        _providerListingCount[msg.sender] += 1;

        emit ListingCreated(listingId, msg.sender, category, pricePerUnit, settlementToken);
    }

    function updateListing(
        uint256 listingId,
        string calldata title,
        string calldata description,
        uint256 pricePerUnit,
        address settlementToken,
        uint256 estimatedDeliverySeconds,
        string calldata metadataURI
    ) external nonReentrant whenNotPaused {
        Listing storage listing = _listings[listingId];
        require(listing.provider == msg.sender, "ServiceRegistry: not owner");
        require(listing.active, "ServiceRegistry: listing inactive");
        require(bytes(title).length > 0 && bytes(title).length <= 256, "ServiceRegistry: invalid title");
        require(bytes(description).length <= 1024, "ServiceRegistry: description too long");
        require(pricePerUnit > 0, "ServiceRegistry: zero price");

        listing.title = title;
        listing.description = description;
        listing.pricePerUnit = pricePerUnit;
        listing.settlementToken = settlementToken;
        listing.estimatedDeliverySeconds = estimatedDeliverySeconds;
        listing.metadataURI = metadataURI;

        emit ListingUpdated(listingId, pricePerUnit, settlementToken);
    }

    function deactivateListing(uint256 listingId) external nonReentrant whenNotPaused {
        Listing storage listing = _listings[listingId];
        require(listing.provider == msg.sender, "ServiceRegistry: not owner");
        require(listing.active, "ServiceRegistry: already inactive");

        listing.active = false;
        _providerListingCount[msg.sender] -= 1;

        emit ListingDeactivated(listingId);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function getListing(uint256 listingId) external view returns (Listing memory) {
        require(_listings[listingId].provider != address(0), "ServiceRegistry: listing not found");
        return _listings[listingId];
    }

    function getProviderListingCount(address provider) external view returns (uint256) {
        return _providerListingCount[provider];
    }
}`,
  },
  {
    name: "DisputeArbitration",
    fileName: "DisputeArbitration.sol",
    description:
      "Three-arbitrator panel selection, evidence submission, voting with deadlines, ruling execution, and arbitrator staking.",
    lines: 386,
    source: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IDisputeArbitration.sol";
import "./interfaces/IEscrowEngine.sol";
import "./interfaces/IStakingManager.sol";
import "./interfaces/IReputationSystem.sol";
import "./interfaces/ISybilGuard.sol";

contract DisputeArbitration is IDisputeArbitration, AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    bytes32 public constant ESCROW_ROLE = keccak256("ESCROW_ROLE");

    uint256 public constant COUNTER_EVIDENCE_WINDOW = 24 hours;
    uint256 public constant VOTING_DEADLINE = 3 days; // C-3: Timeout for voting phase
    uint256 public constant JUNIOR_THRESHOLD = 5_000 ether;
    uint256 public constant SENIOR_THRESHOLD = 25_000 ether;
    uint256 public constant PRINCIPAL_THRESHOLD = 100_000 ether;
    uint256 public constant JUNIOR_MAX_DISPUTE = 500 ether;
    uint256 public constant SENIOR_MAX_DISPUTE = 5_000 ether;

    uint256 public constant JUNIOR_FEE_BPS = 500;   // 5%
    uint256 public constant SENIOR_FEE_BPS = 400;   // 4%
    uint256 public constant PRINCIPAL_FEE_BPS = 300; // 3%

    uint256 public constant SLASH_MIN_BPS = 1000; // 10%
    uint256 public constant SLASH_DISTRIBUTION_BPS = 5000; // 50% to buyer, 50% to arbitration pool

    IERC20 public immutable lobToken;
    IStakingManager public immutable stakingManager;
    IReputationSystem public immutable reputationSystem;
    ISybilGuard public immutable sybilGuard; // H-4: Ban checks
    IEscrowEngine public escrowEngine; // Set post-deploy (circular dependency)

    uint256 private _nextDisputeId = 1;
    uint256 private _arbitratorNonce;

    mapping(uint256 => Dispute) private _disputes;
    mapping(address => ArbitratorInfo) private _arbitrators;
    mapping(uint256 => mapping(address => bool)) private _hasVoted;

    // H-1: Per-vote storage for accurate arbitrator reputation tracking
    mapping(uint256 => mapping(address => bool)) private _votedForBuyer;

    // C-4: Track active dispute count per arbitrator to block unstaking
    mapping(address => uint256) private _activeDisputeCount;

    address[] private _activeArbitrators;
    mapping(address => uint256) private _arbitratorIndex;
    mapping(address => bool) private _isActiveArbitrator;

    constructor(
        address _lobToken,
        address _stakingManager,
        address _reputationSystem,
        address _sybilGuard
    ) {
        require(_lobToken != address(0), "DisputeArbitration: zero token");
        require(_stakingManager != address(0), "DisputeArbitration: zero staking");
        require(_reputationSystem != address(0), "DisputeArbitration: zero reputation");
        require(_sybilGuard != address(0), "DisputeArbitration: zero sybilGuard");

        lobToken = IERC20(_lobToken);
        stakingManager = IStakingManager(_stakingManager);
        reputationSystem = IReputationSystem(_reputationSystem);
        sybilGuard = ISybilGuard(_sybilGuard);

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function stakeAsArbitrator(uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "DisputeArbitration: zero amount");
        // H-4: Ban check
        require(!sybilGuard.checkBanned(msg.sender), "DisputeArbitration: banned");

        ArbitratorInfo storage info = _arbitrators[msg.sender];
        info.stake += amount;

        ArbitratorRank newRank = _rankFromStake(info.stake);
        require(newRank != ArbitratorRank.None, "DisputeArbitration: below minimum stake");

        info.rank = newRank;
        info.active = true;

        if (!_isActiveArbitrator[msg.sender]) {
            _arbitratorIndex[msg.sender] = _activeArbitrators.length;
            _activeArbitrators.push(msg.sender);
            _isActiveArbitrator[msg.sender] = true;
        }

        lobToken.safeTransferFrom(msg.sender, address(this), amount);

        emit ArbitratorStaked(msg.sender, amount, newRank);
    }

    function unstakeAsArbitrator(uint256 amount) external nonReentrant {
        ArbitratorInfo storage info = _arbitrators[msg.sender];
        require(amount > 0 && amount <= info.stake, "DisputeArbitration: invalid amount");
        // C-4: Block unstaking while assigned to active disputes
        require(_activeDisputeCount[msg.sender] == 0, "DisputeArbitration: active disputes pending");

        info.stake -= amount;

        ArbitratorRank newRank = _rankFromStake(info.stake);
        info.rank = newRank;

        if (newRank == ArbitratorRank.None) {
            info.active = false;
            _removeActiveArbitrator(msg.sender);
        }

        lobToken.safeTransfer(msg.sender, amount);

        emit ArbitratorUnstaked(msg.sender, amount);
    }

    function submitDispute(
        uint256 jobId,
        address buyer,
        address seller,
        uint256 amount,
        address token,
        string calldata buyerEvidenceURI,
        bytes32 salt
    ) external onlyRole(ESCROW_ROLE) nonReentrant returns (uint256 disputeId) {
        require(buyer != address(0) && seller != address(0), "DisputeArbitration: zero address");
        require(amount > 0, "DisputeArbitration: zero amount");

        disputeId = _nextDisputeId++;

        Dispute storage d = _disputes[disputeId];
        d.id = disputeId;
        d.jobId = jobId;
        d.buyer = buyer;
        d.seller = seller;
        d.amount = amount;
        d.token = token;
        d.buyerEvidenceURI = buyerEvidenceURI;
        d.status = DisputeStatus.EvidencePhase;
        d.ruling = Ruling.Pending;
        d.createdAt = block.timestamp;
        d.counterEvidenceDeadline = block.timestamp + COUNTER_EVIDENCE_WINDOW;

        // Select 3 arbitrators
        address[3] memory selected = _selectArbitrators(amount, salt);
        d.arbitrators = selected;

        // C-4: Increment active dispute count for selected arbitrators
        for (uint8 i = 0; i < 3; i++) {
            _activeDisputeCount[selected[i]] += 1;
        }

        emit DisputeCreated(disputeId, jobId, buyer, seller, amount);
        emit ArbitratorsAssigned(disputeId, selected);
    }

    function submitCounterEvidence(uint256 disputeId, string calldata sellerEvidenceURI) external nonReentrant {
        Dispute storage d = _disputes[disputeId];
        require(d.id != 0, "DisputeArbitration: dispute not found");
        require(msg.sender == d.seller, "DisputeArbitration: not seller");
        require(d.status == DisputeStatus.EvidencePhase, "DisputeArbitration: wrong status");
        require(block.timestamp <= d.counterEvidenceDeadline, "DisputeArbitration: deadline passed");

        d.sellerEvidenceURI = sellerEvidenceURI;

        // Move to voting phase with deadline
        d.status = DisputeStatus.Voting;
        d.votingDeadline = block.timestamp + VOTING_DEADLINE; // C-3

        emit CounterEvidenceSubmitted(disputeId, sellerEvidenceURI);
    }

    function advanceToVoting(uint256 disputeId) external {
        Dispute storage d = _disputes[disputeId];
        require(d.id != 0, "DisputeArbitration: dispute not found");
        require(d.status == DisputeStatus.EvidencePhase, "DisputeArbitration: wrong status");
        require(block.timestamp > d.counterEvidenceDeadline, "DisputeArbitration: deadline not passed");

        d.status = DisputeStatus.Voting;
        d.votingDeadline = block.timestamp + VOTING_DEADLINE; // C-3

        emit VotingAdvanced(disputeId); // L-3: Emit event
    }

    function vote(uint256 disputeId, bool favorBuyer) external nonReentrant {
        Dispute storage d = _disputes[disputeId];
        require(d.id != 0, "DisputeArbitration: dispute not found");
        require(d.status == DisputeStatus.Voting, "DisputeArbitration: not in voting");
        require(!_hasVoted[disputeId][msg.sender], "DisputeArbitration: already voted");
        require(_isAssignedArbitrator(disputeId, msg.sender), "DisputeArbitration: not assigned");
        require(block.timestamp <= d.votingDeadline, "DisputeArbitration: voting deadline passed");

        _hasVoted[disputeId][msg.sender] = true;
        // H-1: Store individual vote direction
        _votedForBuyer[disputeId][msg.sender] = favorBuyer;
        d.totalVotes += 1;

        if (favorBuyer) {
            d.votesForBuyer += 1;
        } else {
            d.votesForSeller += 1;
        }

        emit VoteCast(disputeId, msg.sender, favorBuyer);
    }

    /// @notice Execute ruling. Requires either all 3 votes OR voting deadline passed with >= 1 vote.
    function executeRuling(uint256 disputeId) external nonReentrant {
        Dispute storage d = _disputes[disputeId];
        require(d.id != 0, "DisputeArbitration: dispute not found");
        require(d.status == DisputeStatus.Voting, "DisputeArbitration: not in voting");

        // C-3: Allow resolution with partial votes after deadline, or all 3 votes anytime
        if (d.totalVotes < 3) {
            require(block.timestamp > d.votingDeadline, "DisputeArbitration: voting still open");
            require(d.totalVotes >= 1, "DisputeArbitration: no votes cast");
        }

        d.status = DisputeStatus.Resolved;

        // C-4: Decrement active dispute count for arbitrators
        for (uint8 i = 0; i < 3; i++) {
            if (_activeDisputeCount[d.arbitrators[i]] > 0) {
                _activeDisputeCount[d.arbitrators[i]] -= 1;
            }
        }

        // Determine ruling based on available votes (majority of cast votes)
        if (d.votesForBuyer > d.votesForSeller) {
            d.ruling = Ruling.BuyerWins;

            // Slash seller's stake (minimum 10%)
            uint256 slashAmount = (stakingManager.getStake(d.seller) * SLASH_MIN_BPS) / 10000;
            if (slashAmount > 0) {
                stakingManager.slash(d.seller, slashAmount, d.buyer);
            }

            // Record dispute loss for seller reputation
            reputationSystem.recordDispute(d.seller, false);
        } else {
            d.ruling = Ruling.SellerWins;

            // Record dispute win for seller reputation
            reputationSystem.recordDispute(d.seller, true);
        }

        // H-1: Update arbitrator stats using actual per-vote storage
        for (uint8 i = 0; i < 3; i++) {
            address arb = d.arbitrators[i];
            ArbitratorInfo storage arbInfo = _arbitrators[arb];

            // Only credit arbitrators who actually voted
            if (_hasVoted[disputeId][arb]) {
                arbInfo.disputesHandled += 1;

                bool votedBuyer = _votedForBuyer[disputeId][arb];
                bool majorityForBuyer = d.votesForBuyer > d.votesForSeller;
                if (votedBuyer == majorityForBuyer) {
                    arbInfo.majorityVotes += 1;
                }
            }
        }

        // Release escrowed funds back to the winner
        escrowEngine.resolveDispute(d.jobId, d.ruling == Ruling.BuyerWins);

        emit RulingExecuted(disputeId, d.ruling);
    }

    function getDispute(uint256 disputeId) external view returns (Dispute memory) {
        require(_disputes[disputeId].id != 0, "DisputeArbitration: not found");
        return _disputes[disputeId];
    }

    function getArbitratorInfo(address arbitrator) external view returns (ArbitratorInfo memory) {
        return _arbitrators[arbitrator];
    }

    function getActiveArbitratorCount() external view returns (uint256) {
        return _activeArbitrators.length;
    }

    function getActiveDisputeCount(address arbitrator) external view returns (uint256) {
        return _activeDisputeCount[arbitrator];
    }

    // --- Admin ---

    /// @notice One-time setter for EscrowEngine (circular deployment dependency).
    ///         Must be called immediately after EscrowEngine is deployed.
    function setEscrowEngine(address _escrowEngine) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(address(escrowEngine) == address(0), "DisputeArbitration: escrow already set");
        require(_escrowEngine != address(0), "DisputeArbitration: zero escrow");
        escrowEngine = IEscrowEngine(_escrowEngine);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // --- Internal ---

    function _selectArbitrators(uint256 disputeAmount, bytes32 salt) internal returns (address[3] memory selected) {
        uint256 count = _activeArbitrators.length;
        require(count >= 3, "DisputeArbitration: not enough arbitrators");

        // M-1: L2-safe randomness — buyer-provided salt replaces block.prevrandao
        // which is sequencer-controlled on L2s like Base
        uint256 seed = uint256(keccak256(abi.encodePacked(
            block.timestamp,
            salt,
            block.number,
            msg.sender,
            _arbitratorNonce++
        )));

        uint256 found = 0;
        uint256 attempts = 0;

        while (found < 3 && attempts < count * 10) {
            uint256 idx = uint256(keccak256(abi.encodePacked(seed, attempts))) % count;
            attempts++;

            // Skip if already selected
            bool duplicate = false;
            for (uint256 j = 0; j < found; j++) {
                if (_activeArbitrators[idx] == selected[j]) {
                    duplicate = true;
                    break;
                }
            }
            if (duplicate) continue;

            address candidate = _activeArbitrators[idx];
            ArbitratorInfo storage info = _arbitrators[candidate];

            // Check if arbitrator can handle this dispute value
            if (info.rank == ArbitratorRank.Junior && disputeAmount > JUNIOR_MAX_DISPUTE) continue;
            if (info.rank == ArbitratorRank.Senior && disputeAmount > SENIOR_MAX_DISPUTE) continue;

            selected[found] = candidate;
            found++;
        }

        require(found == 3, "DisputeArbitration: could not select 3 arbitrators");
    }

    function _isAssignedArbitrator(uint256 disputeId, address addr) internal view returns (bool) {
        Dispute storage d = _disputes[disputeId];
        return d.arbitrators[0] == addr || d.arbitrators[1] == addr || d.arbitrators[2] == addr;
    }

    function _rankFromStake(uint256 amount) internal pure returns (ArbitratorRank) {
        if (amount >= PRINCIPAL_THRESHOLD) return ArbitratorRank.Principal;
        if (amount >= SENIOR_THRESHOLD) return ArbitratorRank.Senior;
        if (amount >= JUNIOR_THRESHOLD) return ArbitratorRank.Junior;
        return ArbitratorRank.None;
    }

    function _removeActiveArbitrator(address arb) internal {
        if (!_isActiveArbitrator[arb]) return;

        uint256 idx = _arbitratorIndex[arb];
        uint256 lastIdx = _activeArbitrators.length - 1;

        if (idx != lastIdx) {
            address lastArb = _activeArbitrators[lastIdx];
            _activeArbitrators[idx] = lastArb;
            _arbitratorIndex[lastArb] = idx;
        }

        _activeArbitrators.pop();
        delete _arbitratorIndex[arb];
        _isActiveArbitrator[arb] = false;
    }
}`,
  },
  {
    name: "EscrowEngine",
    fileName: "EscrowEngine.sol",
    description:
      "Central hub contract. Fund locking, fee-on-transfer support, dispute window scaling, auto-release, and resolution routing.",
    lines: 258,
    source: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IEscrowEngine.sol";
import "./interfaces/IServiceRegistry.sol";
import "./interfaces/IStakingManager.sol";
import "./interfaces/IDisputeArbitration.sol";
import "./interfaces/IReputationSystem.sol";
import "./interfaces/ISybilGuard.sol";

contract EscrowEngine is IEscrowEngine, AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    uint256 public constant USDC_FEE_BPS = 150; // 1.5%
    uint256 public constant LOW_VALUE_DISPUTE_WINDOW = 1 hours;
    uint256 public constant HIGH_VALUE_DISPUTE_WINDOW = 24 hours;
    uint256 public constant HIGH_VALUE_THRESHOLD = 500 ether; // 500 LOB equivalent

    IERC20 public immutable lobToken;
    IServiceRegistry public immutable serviceRegistry;
    IStakingManager public immutable stakingManager;
    IDisputeArbitration public immutable disputeArbitration;
    IReputationSystem public immutable reputationSystem;
    ISybilGuard public immutable sybilGuard;

    address public immutable treasury;

    uint256 private _nextJobId = 1;

    mapping(uint256 => Job) private _jobs;
    mapping(uint256 => uint256) private _jobDisputeIds;

    constructor(
        address _lobToken,
        address _serviceRegistry,
        address _stakingManager,
        address _disputeArbitration,
        address _reputationSystem,
        address _treasury,
        address _sybilGuard
    ) {
        require(_lobToken != address(0), "EscrowEngine: zero lobToken");
        require(_serviceRegistry != address(0), "EscrowEngine: zero registry");
        require(_stakingManager != address(0), "EscrowEngine: zero staking");
        require(_disputeArbitration != address(0), "EscrowEngine: zero dispute");
        require(_reputationSystem != address(0), "EscrowEngine: zero reputation");
        require(_treasury != address(0), "EscrowEngine: zero treasury");
        require(_sybilGuard != address(0), "EscrowEngine: zero sybilGuard");

        lobToken = IERC20(_lobToken);
        serviceRegistry = IServiceRegistry(_serviceRegistry);
        stakingManager = IStakingManager(_stakingManager);
        disputeArbitration = IDisputeArbitration(_disputeArbitration);
        reputationSystem = IReputationSystem(_reputationSystem);
        treasury = _treasury;
        sybilGuard = ISybilGuard(_sybilGuard);

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function createJob(
        uint256 listingId,
        address seller,
        uint256 amount,
        address token
    ) external nonReentrant whenNotPaused returns (uint256 jobId) {
        require(seller != address(0), "EscrowEngine: zero seller");
        require(seller != msg.sender, "EscrowEngine: self-hire");
        require(amount > 0, "EscrowEngine: zero amount");

        // H-4: Ban checks for both parties
        require(!sybilGuard.checkBanned(msg.sender), "EscrowEngine: buyer banned");
        require(!sybilGuard.checkBanned(seller), "EscrowEngine: seller banned");

        // Verify listing exists and is active
        IServiceRegistry.Listing memory listing = serviceRegistry.getListing(listingId);
        require(listing.active, "EscrowEngine: listing inactive");
        require(listing.provider == seller, "EscrowEngine: seller mismatch");

        // C-2: Validate token matches listing's settlement token
        require(token == listing.settlementToken, "EscrowEngine: token mismatch");

        // Calculate fee: 0% for LOB, 1.5% for anything else
        uint256 fee = 0;
        if (token != address(lobToken)) {
            fee = (amount * USDC_FEE_BPS) / 10000;
        }

        // C-1: Measure actual received amount to handle fee-on-transfer tokens
        uint256 balanceBefore = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = IERC20(token).balanceOf(address(this)) - balanceBefore;
        require(received > 0, "EscrowEngine: zero received");

        // Recalculate fee based on actual received amount
        if (received != amount) {
            fee = 0;
            if (token != address(lobToken)) {
                fee = (received * USDC_FEE_BPS) / 10000;
            }
        }

        jobId = _nextJobId++;

        _jobs[jobId] = Job({
            id: jobId,
            listingId: listingId,
            buyer: msg.sender,
            seller: seller,
            amount: received,
            token: token,
            fee: fee,
            status: JobStatus.Active,
            createdAt: block.timestamp,
            disputeWindowEnd: 0, // Set when delivery is submitted
            deliveryMetadataURI: ""
        });

        emit JobCreated(jobId, listingId, msg.sender, seller, received, token, fee);
    }

    function submitDelivery(uint256 jobId, string calldata metadataURI) external nonReentrant whenNotPaused {
        Job storage job = _jobs[jobId];
        require(job.id != 0, "EscrowEngine: job not found");
        require(msg.sender == job.seller, "EscrowEngine: not seller");
        require(job.status == JobStatus.Active, "EscrowEngine: wrong status");

        job.status = JobStatus.Delivered;
        job.deliveryMetadataURI = metadataURI;

        // Start dispute window
        uint256 disputeWindow = job.amount >= HIGH_VALUE_THRESHOLD
            ? HIGH_VALUE_DISPUTE_WINDOW
            : LOW_VALUE_DISPUTE_WINDOW;
        job.disputeWindowEnd = block.timestamp + disputeWindow;

        emit DeliverySubmitted(jobId, metadataURI);
    }

    function confirmDelivery(uint256 jobId) external nonReentrant whenNotPaused {
        Job storage job = _jobs[jobId];
        require(job.id != 0, "EscrowEngine: job not found");
        require(msg.sender == job.buyer, "EscrowEngine: not buyer");
        require(job.status == JobStatus.Delivered, "EscrowEngine: wrong status");

        job.status = JobStatus.Confirmed;

        _releaseFunds(job);

        // Record completion for reputation
        uint256 deliveryTime = block.timestamp - job.createdAt;
        IServiceRegistry.Listing memory listing = serviceRegistry.getListing(job.listingId);
        reputationSystem.recordCompletion(job.seller, job.buyer, deliveryTime, listing.estimatedDeliverySeconds);

        emit DeliveryConfirmed(jobId, msg.sender);
    }

    function initiateDispute(uint256 jobId, string calldata evidenceURI, bytes32 disputeSalt) external nonReentrant whenNotPaused {
        Job storage job = _jobs[jobId];
        require(job.id != 0, "EscrowEngine: job not found");
        require(msg.sender == job.buyer, "EscrowEngine: not buyer");
        require(job.status == JobStatus.Delivered, "EscrowEngine: wrong status");
        require(block.timestamp <= job.disputeWindowEnd, "EscrowEngine: dispute window closed");
        require(bytes(evidenceURI).length > 0, "EscrowEngine: empty evidence");

        job.status = JobStatus.Disputed;

        // Route to dispute arbitration
        uint256 disputeId = disputeArbitration.submitDispute(
            jobId,
            job.buyer,
            job.seller,
            job.amount,
            job.token,
            evidenceURI,
            disputeSalt
        );

        _jobDisputeIds[jobId] = disputeId;

        emit DisputeInitiated(jobId, disputeId, evidenceURI);
    }

    function autoRelease(uint256 jobId) external nonReentrant whenNotPaused {
        Job storage job = _jobs[jobId];
        require(job.id != 0, "EscrowEngine: job not found");
        require(job.status == JobStatus.Delivered, "EscrowEngine: wrong status");
        require(block.timestamp > job.disputeWindowEnd, "EscrowEngine: window not expired");

        job.status = JobStatus.Released;

        _releaseFunds(job);

        // Record completion for reputation
        uint256 deliveryTime = block.timestamp - job.createdAt;
        IServiceRegistry.Listing memory listing = serviceRegistry.getListing(job.listingId);
        reputationSystem.recordCompletion(job.seller, job.buyer, deliveryTime, listing.estimatedDeliverySeconds);

        emit AutoReleased(jobId, msg.sender);
    }

    function resolveDispute(uint256 jobId, bool buyerWins) external nonReentrant {
        require(msg.sender == address(disputeArbitration), "EscrowEngine: not arbitration");

        Job storage job = _jobs[jobId];
        require(job.id != 0, "EscrowEngine: job not found");
        require(job.status == JobStatus.Disputed, "EscrowEngine: wrong status");

        job.status = JobStatus.Resolved;

        if (buyerWins) {
            // Return funds to buyer (full amount, no fee)
            IERC20(job.token).safeTransfer(job.buyer, job.amount);
            emit FundsReleased(jobId, job.buyer, job.amount);
        } else {
            // Release to seller (fee deducted via _releaseFunds, which emits its own event)
            _releaseFunds(job);
        }
    }

    function getJob(uint256 jobId) external view returns (Job memory) {
        require(_jobs[jobId].id != 0, "EscrowEngine: job not found");
        return _jobs[jobId];
    }

    function getJobDisputeId(uint256 jobId) external view returns (uint256) {
        return _jobDisputeIds[jobId];
    }

    // --- Admin ---

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // --- Internal ---

    function _releaseFunds(Job storage job) internal {
        uint256 sellerPayout = job.amount - job.fee;

        if (job.fee > 0) {
            IERC20(job.token).safeTransfer(treasury, job.fee);
        }

        IERC20(job.token).safeTransfer(job.seller, sellerPayout);

        emit FundsReleased(job.id, job.seller, sellerPayout);
    }
}`,
  },
  {
    name: "SybilGuard",
    fileName: "SybilGuard.sol",
    description:
      "Anti-sybil detection with multisig-confirmed bans, automatic stake seizure, linked account tracking, and appeals.",
    lines: 410,
    source: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IStakingManager.sol";

/**
 * @title SybilGuard
 * @notice Anti-sybil detection with auto-ban and staked fund seizure.
 *         Detects: sybil clusters, multisig abuse, self-dealing, coordinated
 *         voting, and reputation farming. Banned addresses have their staked
 *         funds seized and sent to the TreasuryGovernor.
 *
 *         Detection is reported by authorized watchers (off-chain agents or
 *         on-chain hooks). The contract maintains a ban registry and enforces
 *         bans across the protocol via the BANNED mapping.
 */
contract SybilGuard is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /* ═══════════════════════════════════════════════════════════════
       ROLES
       ═══════════════════════════════════════════════════════════════ */

    /// @notice Watchers can report sybil behavior (off-chain bots, agents)
    bytes32 public constant WATCHER_ROLE = keccak256("WATCHER_ROLE");

    /// @notice Judges can confirm reports and execute bans (multisig signers)
    bytes32 public constant JUDGE_ROLE = keccak256("JUDGE_ROLE");

    /// @notice Can unban addresses (appeals process)
    bytes32 public constant APPEALS_ROLE = keccak256("APPEALS_ROLE");

    /* ═══════════════════════════════════════════════════════════════
       CONSTANTS
       ═══════════════════════════════════════════════════════════════ */

    uint256 public constant REPORT_EXPIRY = 3 days;
    uint256 public constant MIN_JUDGES_FOR_BAN = 2;
    uint256 public constant MIN_JUDGES_FOR_REJECT = 2; // M-5: Require multiple judges to reject
    uint256 public constant COOLDOWN_AFTER_UNBAN = 30 days;

    /* ═══════════════════════════════════════════════════════════════
       TYPES
       ═══════════════════════════════════════════════════════════════ */

    enum ViolationType {
        SybilCluster,        // Multiple accounts from same origin
        SelfDealing,         // Buyer and seller are same entity
        CoordinatedVoting,   // Arbitrators colluding on votes
        ReputationFarming,   // Wash trading to build reputation
        MultisigAbuse,       // Misuse of multisig signer role
        StakeManipulation,   // Unstaking to avoid slashing
        EvidenceFraud,       // Fabricated dispute evidence
        IdentityFraud        // Fake OpenClaw attestation
    }

    enum ReportStatus { Pending, Confirmed, Rejected, Expired }

    struct SybilReport {
        uint256 id;
        address reporter;
        address[] subjects;         // Addresses involved
        ViolationType violation;
        string evidenceURI;         // IPFS link to evidence
        ReportStatus status;
        uint256 confirmations;
        uint256 createdAt;
        string notes;
    }

    struct BanRecord {
        bool banned;
        uint256 bannedAt;
        uint256 unbannedAt;
        ViolationType reason;
        uint256 reportId;
        uint256 seizedAmount;
        address seizedToken;
    }

    /* ═══════════════════════════════════════════════════════════════
       STATE
       ═══════════════════════════════════════════════════════════════ */

    IERC20 public immutable lobToken;
    IStakingManager public immutable stakingManager;
    address public immutable treasuryGovernor;

    uint256 private _nextReportId = 1;
    mapping(uint256 => SybilReport) public reports;
    mapping(uint256 => mapping(address => bool)) public reportConfirmations;
    // M-5: Track rejections per report
    mapping(uint256 => mapping(address => bool)) public reportRejections;
    mapping(uint256 => uint256) public reportRejectionCount;

    mapping(address => BanRecord) public banRecords;
    mapping(address => bool) public isBanned;
    address[] public bannedAddresses;
    // M-3: Track index for O(1) removal on unban
    mapping(address => uint256) private _bannedAddressIndex;

    // Linked accounts: maps address -> list of known linked addresses
    mapping(address => address[]) public linkedAccounts;

    // Stats
    uint256 public totalBans;
    uint256 public totalSeized;
    uint256 public totalReports;

    /* ═══════════════════════════════════════════════════════════════
       EVENTS
       ═══════════════════════════════════════════════════════════════ */

    event ReportCreated(
        uint256 indexed reportId,
        address indexed reporter,
        ViolationType violation,
        address[] subjects,
        string evidenceURI
    );
    event ReportConfirmed(uint256 indexed reportId, address indexed judge);
    event ReportRejected(uint256 indexed reportId, address indexed judge);

    event AddressBanned(
        address indexed account,
        ViolationType reason,
        uint256 indexed reportId,
        uint256 seizedAmount
    );
    event AddressUnbanned(address indexed account, address indexed unbannedBy);

    event FundsSeized(
        address indexed account,
        address indexed token,
        uint256 amount,
        uint256 indexed reportId
    );

    event LinkedAccountsRegistered(address indexed primary, address[] linked);

    /* ═══════════════════════════════════════════════════════════════
       CONSTRUCTOR
       ═══════════════════════════════════════════════════════════════ */

    constructor(
        address _lobToken,
        address _stakingManager,
        address _treasuryGovernor
    ) {
        require(_lobToken != address(0), "SybilGuard: zero lobToken");
        require(_stakingManager != address(0), "SybilGuard: zero staking");
        require(_treasuryGovernor != address(0), "SybilGuard: zero treasury");

        lobToken = IERC20(_lobToken);
        stakingManager = IStakingManager(_stakingManager);
        treasuryGovernor = _treasuryGovernor;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /* ═══════════════════════════════════════════════════════════════
       REPORTING
       ═══════════════════════════════════════════════════════════════ */

    /**
     * @notice Submit a sybil/abuse report against one or more addresses
     * @param subjects Addresses suspected of abuse
     * @param violation Type of violation
     * @param evidenceURI IPFS URI to evidence bundle
     * @param notes Additional context
     */
    function submitReport(
        address[] calldata subjects,
        ViolationType violation,
        string calldata evidenceURI,
        string calldata notes
    ) external onlyRole(WATCHER_ROLE) returns (uint256) {
        require(subjects.length > 0, "SybilGuard: no subjects");
        require(subjects.length <= 20, "SybilGuard: too many subjects");
        require(bytes(evidenceURI).length > 0, "SybilGuard: no evidence");

        // Verify none of the subjects are already banned
        for (uint256 i = 0; i < subjects.length; i++) {
            require(subjects[i] != address(0), "SybilGuard: zero address subject");
        }

        uint256 reportId = _nextReportId++;
        totalReports++;

        reports[reportId] = SybilReport({
            id: reportId,
            reporter: msg.sender,
            subjects: subjects,
            violation: violation,
            evidenceURI: evidenceURI,
            status: ReportStatus.Pending,
            confirmations: 0,
            createdAt: block.timestamp,
            notes: notes
        });

        emit ReportCreated(reportId, msg.sender, violation, subjects, evidenceURI);

        return reportId;
    }

    /**
     * @notice Judge confirms a report. When MIN_JUDGES_FOR_BAN confirmations
     *         are reached, all subjects are automatically banned and funds seized.
     */
    function confirmReport(uint256 reportId) external onlyRole(JUDGE_ROLE) nonReentrant {
        SybilReport storage r = reports[reportId];
        require(r.id != 0, "SybilGuard: report not found");
        require(r.status == ReportStatus.Pending, "SybilGuard: not pending");
        require(
            block.timestamp <= r.createdAt + REPORT_EXPIRY,
            "SybilGuard: report expired"
        );
        require(!reportConfirmations[reportId][msg.sender], "SybilGuard: already confirmed");

        reportConfirmations[reportId][msg.sender] = true;
        r.confirmations++;

        emit ReportConfirmed(reportId, msg.sender);

        // Auto-ban when threshold met
        if (r.confirmations >= MIN_JUDGES_FOR_BAN) {
            r.status = ReportStatus.Confirmed;
            _executeBan(reportId);
        }
    }

    /**
     * @notice Judge votes to reject a report. Requires MIN_JUDGES_FOR_REJECT to finalize.
     */
    function rejectReport(uint256 reportId) external onlyRole(JUDGE_ROLE) {
        SybilReport storage r = reports[reportId];
        require(r.id != 0, "SybilGuard: report not found");
        require(r.status == ReportStatus.Pending, "SybilGuard: not pending");
        require(!reportRejections[reportId][msg.sender], "SybilGuard: already rejected");

        reportRejections[reportId][msg.sender] = true;
        reportRejectionCount[reportId]++;

        // M-5: Only finalize rejection when enough judges agree
        if (reportRejectionCount[reportId] >= MIN_JUDGES_FOR_REJECT) {
            r.status = ReportStatus.Rejected;
        }

        emit ReportRejected(reportId, msg.sender);
    }

    /* ═══════════════════════════════════════════════════════════════
       BAN EXECUTION
       ═══════════════════════════════════════════════════════════════ */

    function _executeBan(uint256 reportId) private {
        SybilReport storage r = reports[reportId];

        for (uint256 i = 0; i < r.subjects.length; i++) {
            address subject = r.subjects[i];

            // Skip if already banned
            if (isBanned[subject]) continue;

            // Seize staked funds
            uint256 seized = _seizeStake(subject, reportId);

            // Record ban
            isBanned[subject] = true;
            _bannedAddressIndex[subject] = bannedAddresses.length;
            bannedAddresses.push(subject);
            totalBans++;

            banRecords[subject] = BanRecord({
                banned: true,
                bannedAt: block.timestamp,
                unbannedAt: 0,
                reason: r.violation,
                reportId: reportId,
                seizedAmount: seized,
                seizedToken: address(lobToken)
            });

            // Register linked accounts (all subjects linked to each other)
            if (r.subjects.length > 1) {
                linkedAccounts[subject] = r.subjects;
            }

            emit AddressBanned(subject, r.violation, reportId, seized);
        }

        // Emit linked accounts event if cluster detected
        if (r.subjects.length > 1) {
            emit LinkedAccountsRegistered(r.subjects[0], r.subjects);
        }
    }

    /**
     * @notice Seize staked LOB tokens from a banned address
     *         Calls StakingManager.slash() which transfers to beneficiary (treasury)
     */
    function _seizeStake(address account, uint256 reportId) private returns (uint256) {
        // Get the current stake amount
        IStakingManager.StakeInfo memory info = stakingManager.getStakeInfo(account);
        uint256 stakeAmount = info.amount;

        if (stakeAmount == 0) return 0;

        // Slash the entire stake, sending to treasury
        // Note: StakingManager.slash() requires SLASHER_ROLE which SybilGuard must have
        stakingManager.slash(account, stakeAmount, treasuryGovernor);

        totalSeized += stakeAmount;

        emit FundsSeized(account, address(lobToken), stakeAmount, reportId);

        return stakeAmount;
    }

    /* ═══════════════════════════════════════════════════════════════
       UNBAN (APPEALS)
       ═══════════════════════════════════════════════════════════════ */

    /**
     * @notice Unban an address after appeal review
     *         Seized funds are NOT returned (already in treasury)
     */
    function unban(address account) external onlyRole(APPEALS_ROLE) {
        require(isBanned[account], "SybilGuard: not banned");

        isBanned[account] = false;
        banRecords[account].banned = false;
        banRecords[account].unbannedAt = block.timestamp;

        // M-3: Remove from bannedAddresses array (swap-and-pop)
        uint256 idx = _bannedAddressIndex[account];
        uint256 lastIdx = bannedAddresses.length - 1;
        if (idx != lastIdx) {
            address lastAddr = bannedAddresses[lastIdx];
            bannedAddresses[idx] = lastAddr;
            _bannedAddressIndex[lastAddr] = idx;
        }
        bannedAddresses.pop();
        delete _bannedAddressIndex[account];

        emit AddressUnbanned(account, msg.sender);
    }

    /* ═══════════════════════════════════════════════════════════════
       BAN CHECK (Used by other contracts)
       ═══════════════════════════════════════════════════════════════ */

    /**
     * @notice Check if an address is banned (callable by any contract)
     */
    function checkBanned(address account) external view returns (bool) {
        return isBanned[account];
    }

    /**
     * @notice Check if any address in a set is banned
     */
    function checkAnyBanned(address[] calldata accounts) external view returns (bool) {
        for (uint256 i = 0; i < accounts.length; i++) {
            if (isBanned[accounts[i]]) return true;
        }
        return false;
    }

    /**
     * @notice Get full ban record for an address
     */
    function getBanRecord(address account) external view returns (BanRecord memory) {
        return banRecords[account];
    }

    /**
     * @notice Get linked accounts for an address
     */
    function getLinkedAccounts(address account) external view returns (address[] memory) {
        return linkedAccounts[account];
    }

    /* ═══════════════════════════════════════════════════════════════
       VIEW FUNCTIONS
       ═══════════════════════════════════════════════════════════════ */

    function getReport(uint256 reportId) external view returns (SybilReport memory) {
        return reports[reportId];
    }

    function getBannedCount() external view returns (uint256) {
        return bannedAddresses.length;
    }

    function getReportSubjects(uint256 reportId) external view returns (address[] memory) {
        return reports[reportId].subjects;
    }

    function isReportExpired(uint256 reportId) external view returns (bool) {
        SybilReport storage r = reports[reportId];
        return r.status == ReportStatus.Pending &&
               block.timestamp > r.createdAt + REPORT_EXPIRY;
    }
}`,
  },
  {
    name: "TreasuryGovernor",
    fileName: "TreasuryGovernor.sol",
    description:
      "Multisig treasury with M-of-N proposals, 24h timelock, payment streams, admin proposals, and signer management.",
    lines: 674,
    source: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title TreasuryGovernor
 * @notice Multisig treasury with automated payment streams for moderators,
 *         arbitrators, and grants. Receives protocol fees from EscrowEngine
 *         and slashed funds from SybilGuard. Distributes via M-of-N approval.
 */
contract TreasuryGovernor is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /* ═══════════════════════════════════════════════════════════════
       ROLES
       ═══════════════════════════════════════════════════════════════ */

    bytes32 public constant SIGNER_ROLE = keccak256("SIGNER_ROLE");
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");
    bytes32 public constant SYBIL_GUARD_ROLE = keccak256("SYBIL_GUARD_ROLE");

    /* ═══════════════════════════════════════════════════════════════
       CONSTANTS
       ═══════════════════════════════════════════════════════════════ */

    uint256 public constant MAX_SIGNERS = 9;
    uint256 public constant MIN_SIGNERS = 3;
    uint256 public constant PROPOSAL_EXPIRY = 7 days;
    uint256 public constant PROPOSAL_TIMELOCK = 24 hours;
    uint256 public constant STREAM_MAX_DURATION = 365 days;

    /* ═══════════════════════════════════════════════════════════════
       TYPES
       ═══════════════════════════════════════════════════════════════ */

    enum ProposalStatus { Pending, Approved, Executed, Cancelled, Expired }

    struct Proposal {
        uint256 id;
        address proposer;
        address token;
        address recipient;
        uint256 amount;
        string description;
        ProposalStatus status;
        uint256 approvalCount;
        uint256 createdAt;
        uint256 timelockEnd;
    }

    struct PaymentStream {
        uint256 id;
        address recipient;
        address token;
        uint256 totalAmount;
        uint256 claimedAmount;
        uint256 startTime;
        uint256 endTime;
        string role; // "moderator", "arbitrator", "grant"
        bool active;
    }

    /* ═══════════════════════════════════════════════════════════════
       STATE
       ═══════════════════════════════════════════════════════════════ */

    address public immutable lobToken; // M-4: For seized fund tracking

    uint256 public requiredApprovals;
    uint256 public signerCount;

    uint256 private _nextProposalId = 1;
    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => bool)) public proposalApprovals;

    uint256 private _nextStreamId = 1;
    mapping(uint256 => PaymentStream) public streams;
    mapping(address => uint256[]) public recipientStreams;

    // Seized funds tracking (from SybilGuard)
    uint256 public totalSeizedLOB;
    uint256 public totalSeizedUSDC;

    // M-3: Admin proposals — arbitrary contract calls via M-of-N + timelock
    struct AdminProposal {
        uint256 id;
        address proposer;
        address target;
        bytes callData;
        string description;
        ProposalStatus status;
        uint256 approvalCount;
        uint256 createdAt;
        uint256 timelockEnd;
    }

    uint256 private _nextAdminProposalId = 1;
    mapping(uint256 => AdminProposal) public adminProposals;
    mapping(uint256 => mapping(address => bool)) public adminProposalApprovals;

    /* ═══════════════════════════════════════════════════════════════
       EVENTS
       ═══════════════════════════════════════════════════════════════ */

    event ProposalCreated(
        uint256 indexed proposalId,
        address indexed proposer,
        address token,
        address recipient,
        uint256 amount,
        string description
    );
    event ProposalApproved(uint256 indexed proposalId, address indexed signer);
    event ProposalApprovedForExecution(uint256 indexed proposalId, uint256 timelockEnd);
    event ProposalExecuted(uint256 indexed proposalId, address indexed recipient, uint256 amount);
    event ProposalCancelled(uint256 indexed proposalId, address indexed canceller);

    event StreamCreated(
        uint256 indexed streamId,
        address indexed recipient,
        address token,
        uint256 totalAmount,
        uint256 startTime,
        uint256 endTime,
        string role
    );
    event StreamClaimed(uint256 indexed streamId, address indexed recipient, uint256 amount);
    event StreamCancelled(uint256 indexed streamId);

    event FundsReceived(address indexed token, address indexed from, uint256 amount);
    event FundsSeized(address indexed token, address indexed from, uint256 amount, string reason);

    event SignerAdded(address indexed signer);
    event SignerRemoved(address indexed signer);
    event RequiredApprovalsChanged(uint256 oldValue, uint256 newValue);

    event AdminProposalCreated(uint256 indexed proposalId, address indexed target, address indexed proposer);
    event AdminProposalApproved(uint256 indexed proposalId, address indexed signer);
    event AdminProposalApprovedForExecution(uint256 indexed proposalId, uint256 timelockEnd);
    event AdminProposalExecuted(uint256 indexed proposalId, address indexed target);
    event AdminProposalCancelled(uint256 indexed proposalId, address indexed canceller);

    /* ═══════════════════════════════════════════════════════════════
       CONSTRUCTOR
       ═══════════════════════════════════════════════════════════════ */

    /**
     * @param _signers Initial multisig signers (min 3)
     * @param _requiredApprovals Number of approvals needed (M-of-N)
     */
    constructor(address[] memory _signers, uint256 _requiredApprovals, address _lobToken) {
        require(_signers.length >= MIN_SIGNERS, "TreasuryGovernor: min 3 signers");
        require(_signers.length <= MAX_SIGNERS, "TreasuryGovernor: max 9 signers");
        require(_lobToken != address(0), "TreasuryGovernor: zero lobToken");
        require(
            _requiredApprovals >= 2 && _requiredApprovals <= _signers.length,
            "TreasuryGovernor: invalid approval threshold"
        );

        for (uint256 i = 0; i < _signers.length; i++) {
            require(_signers[i] != address(0), "TreasuryGovernor: zero signer");
            // Check for duplicates
            for (uint256 j = 0; j < i; j++) {
                require(_signers[i] != _signers[j], "TreasuryGovernor: duplicate signer");
            }
            _grantRole(SIGNER_ROLE, _signers[i]);
        }

        lobToken = _lobToken;
        signerCount = _signers.length;
        requiredApprovals = _requiredApprovals;

        _grantRole(DEFAULT_ADMIN_ROLE, address(this));
        _grantRole(GUARDIAN_ROLE, _signers[0]); // First signer gets guardian role
    }

    /* ═══════════════════════════════════════════════════════════════
       RECEIVE FUNDS
       ═══════════════════════════════════════════════════════════════ */

    /**
     * @notice Receive seized funds from SybilGuard
     */
    function receiveSeizedFunds(
        address token,
        uint256 amount,
        address from,
        string calldata reason
    ) external onlyRole(SYBIL_GUARD_ROLE) nonReentrant {
        require(amount > 0, "TreasuryGovernor: zero amount");

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        // M-4: Track seized amounts by actual token type
        if (token == lobToken) {
            totalSeizedLOB += amount;
        } else {
            totalSeizedUSDC += amount;
        }

        emit FundsSeized(token, from, amount, reason);
    }

    /**
     * @notice Accept ERC20 deposits (from protocol fees, etc.)
     */
    function deposit(address token, uint256 amount) external nonReentrant {
        require(amount > 0, "TreasuryGovernor: zero amount");
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        emit FundsReceived(token, msg.sender, amount);
    }

    /* ═══════════════════════════════════════════════════════════════
       MULTISIG PROPOSALS
       ═══════════════════════════════════════════════════════════════ */

    /**
     * @notice Create a spending proposal (requires M-of-N approval)
     * @param token ERC20 token to transfer
     * @param recipient Destination address
     * @param amount Amount to transfer
     * @param description Human-readable description
     */
    function createProposal(
        address token,
        address recipient,
        uint256 amount,
        string calldata description
    ) external onlyRole(SIGNER_ROLE) nonReentrant returns (uint256) {
        require(recipient != address(0), "TreasuryGovernor: zero recipient");
        require(amount > 0, "TreasuryGovernor: zero amount");
        require(
            IERC20(token).balanceOf(address(this)) >= amount,
            "TreasuryGovernor: insufficient balance"
        );

        uint256 proposalId = _nextProposalId++;

        proposals[proposalId] = Proposal({
            id: proposalId,
            proposer: msg.sender,
            token: token,
            recipient: recipient,
            amount: amount,
            description: description,
            status: ProposalStatus.Pending,
            approvalCount: 1, // Proposer auto-approves
            createdAt: block.timestamp,
            timelockEnd: 0
        });

        proposalApprovals[proposalId][msg.sender] = true;

        emit ProposalCreated(proposalId, msg.sender, token, recipient, amount, description);
        emit ProposalApproved(proposalId, msg.sender);

        // M-2: When threshold met, set Approved + timelock instead of instant execution
        if (proposals[proposalId].approvalCount >= requiredApprovals) {
            _approveForExecution(proposalId);
        }

        return proposalId;
    }

    /**
     * @notice Approve a pending proposal
     */
    function approveProposal(uint256 proposalId) external onlyRole(SIGNER_ROLE) nonReentrant {
        Proposal storage p = proposals[proposalId];
        require(p.id != 0, "TreasuryGovernor: proposal not found");
        require(p.status == ProposalStatus.Pending, "TreasuryGovernor: not pending");
        require(!proposalApprovals[proposalId][msg.sender], "TreasuryGovernor: already approved");
        require(
            block.timestamp <= p.createdAt + PROPOSAL_EXPIRY,
            "TreasuryGovernor: proposal expired"
        );

        proposalApprovals[proposalId][msg.sender] = true;
        p.approvalCount++;

        emit ProposalApproved(proposalId, msg.sender);

        // M-2: When threshold met, set Approved + timelock instead of instant execution
        if (p.approvalCount >= requiredApprovals) {
            _approveForExecution(proposalId);
        }
    }

    /**
     * @notice Cancel a proposal (proposer or guardian only)
     */
    function cancelProposal(uint256 proposalId) external {
        Proposal storage p = proposals[proposalId];
        require(p.id != 0, "TreasuryGovernor: proposal not found");
        require(
            p.status == ProposalStatus.Pending || p.status == ProposalStatus.Approved,
            "TreasuryGovernor: not cancellable"
        );
        require(
            p.proposer == msg.sender || hasRole(GUARDIAN_ROLE, msg.sender),
            "TreasuryGovernor: unauthorized"
        );

        p.status = ProposalStatus.Cancelled;
        emit ProposalCancelled(proposalId, msg.sender);
    }

    /**
     * @notice Execute an approved proposal after timelock has expired
     */
    function executeProposal(uint256 proposalId) external nonReentrant {
        Proposal storage p = proposals[proposalId];
        require(p.id != 0, "TreasuryGovernor: proposal not found");
        require(p.status == ProposalStatus.Approved, "TreasuryGovernor: not approved");
        require(block.timestamp >= p.timelockEnd, "TreasuryGovernor: timelock not expired");
        require(
            block.timestamp <= p.createdAt + PROPOSAL_EXPIRY,
            "TreasuryGovernor: proposal expired"
        );

        _executeProposal(proposalId);
    }

    function _approveForExecution(uint256 proposalId) private {
        Proposal storage p = proposals[proposalId];
        p.status = ProposalStatus.Approved;
        p.timelockEnd = block.timestamp + PROPOSAL_TIMELOCK;

        emit ProposalApprovedForExecution(proposalId, p.timelockEnd);
    }

    function _executeProposal(uint256 proposalId) private {
        Proposal storage p = proposals[proposalId];
        require(
            IERC20(p.token).balanceOf(address(this)) >= p.amount,
            "TreasuryGovernor: insufficient balance at execution"
        );

        p.status = ProposalStatus.Executed;
        IERC20(p.token).safeTransfer(p.recipient, p.amount);

        emit ProposalExecuted(proposalId, p.recipient, p.amount);
    }

    /* ═══════════════════════════════════════════════════════════════
       ADMIN PROPOSALS (M-3: Arbitrary contract calls via M-of-N + timelock)
       ═══════════════════════════════════════════════════════════════ */

    /**
     * @notice Create an admin proposal to call an external contract
     * @param target The contract to call
     * @param data The calldata to execute
     * @param description Human-readable description
     */
    function createAdminProposal(
        address target,
        bytes calldata data,
        string calldata description
    ) external onlyRole(SIGNER_ROLE) nonReentrant returns (uint256) {
        require(target != address(0), "TreasuryGovernor: zero target");
        if (target == address(this)) {
            bytes4 selector = bytes4(data[:4]);
            require(
                selector == this.addSigner.selector ||
                selector == this.removeSigner.selector ||
                selector == this.setRequiredApprovals.selector,
                "TreasuryGovernor: unauthorized self-call"
            );
        }

        uint256 proposalId = _nextAdminProposalId++;

        AdminProposal storage ap = adminProposals[proposalId];
        ap.id = proposalId;
        ap.proposer = msg.sender;
        ap.target = target;
        ap.callData = data;
        ap.description = description;
        ap.status = ProposalStatus.Pending;
        ap.approvalCount = 1; // Proposer auto-approves
        ap.createdAt = block.timestamp;

        adminProposalApprovals[proposalId][msg.sender] = true;

        emit AdminProposalCreated(proposalId, target, msg.sender);
        emit AdminProposalApproved(proposalId, msg.sender);

        if (ap.approvalCount >= requiredApprovals) {
            _approveAdminForExecution(proposalId);
        }

        return proposalId;
    }

    /**
     * @notice Approve a pending admin proposal
     */
    function approveAdminProposal(uint256 proposalId) external onlyRole(SIGNER_ROLE) nonReentrant {
        AdminProposal storage ap = adminProposals[proposalId];
        require(ap.id != 0, "TreasuryGovernor: admin proposal not found");
        require(ap.status == ProposalStatus.Pending, "TreasuryGovernor: not pending");
        require(!adminProposalApprovals[proposalId][msg.sender], "TreasuryGovernor: already approved");
        require(
            block.timestamp <= ap.createdAt + PROPOSAL_EXPIRY,
            "TreasuryGovernor: proposal expired"
        );

        adminProposalApprovals[proposalId][msg.sender] = true;
        ap.approvalCount++;

        emit AdminProposalApproved(proposalId, msg.sender);

        if (ap.approvalCount >= requiredApprovals) {
            _approveAdminForExecution(proposalId);
        }
    }

    /**
     * @notice Execute an approved admin proposal after timelock
     */
    function executeAdminProposal(uint256 proposalId) external nonReentrant {
        AdminProposal storage ap = adminProposals[proposalId];
        require(ap.id != 0, "TreasuryGovernor: admin proposal not found");
        require(ap.status == ProposalStatus.Approved, "TreasuryGovernor: not approved");
        require(block.timestamp >= ap.timelockEnd, "TreasuryGovernor: timelock not expired");
        require(
            block.timestamp <= ap.createdAt + PROPOSAL_EXPIRY,
            "TreasuryGovernor: proposal expired"
        );

        ap.status = ProposalStatus.Executed;

        (bool success, bytes memory returnData) = ap.target.call(ap.callData);
        require(success, string(abi.encodePacked("TreasuryGovernor: call failed: ", returnData)));

        emit AdminProposalExecuted(proposalId, ap.target);
    }

    /**
     * @notice Cancel an admin proposal (proposer or guardian)
     */
    function cancelAdminProposal(uint256 proposalId) external {
        AdminProposal storage ap = adminProposals[proposalId];
        require(ap.id != 0, "TreasuryGovernor: admin proposal not found");
        require(
            ap.status == ProposalStatus.Pending || ap.status == ProposalStatus.Approved,
            "TreasuryGovernor: not cancellable"
        );
        require(
            ap.proposer == msg.sender || hasRole(GUARDIAN_ROLE, msg.sender),
            "TreasuryGovernor: unauthorized"
        );

        ap.status = ProposalStatus.Cancelled;
        emit AdminProposalCancelled(proposalId, msg.sender);
    }

    function getAdminProposal(uint256 proposalId) external view returns (
        uint256 id,
        address proposer,
        address target,
        bytes memory callData,
        string memory description,
        ProposalStatus status,
        uint256 approvalCount,
        uint256 createdAt,
        uint256 timelockEnd
    ) {
        AdminProposal storage ap = adminProposals[proposalId];
        return (ap.id, ap.proposer, ap.target, ap.callData, ap.description, ap.status, ap.approvalCount, ap.createdAt, ap.timelockEnd);
    }

    function _approveAdminForExecution(uint256 proposalId) private {
        AdminProposal storage ap = adminProposals[proposalId];
        ap.status = ProposalStatus.Approved;
        ap.timelockEnd = block.timestamp + PROPOSAL_TIMELOCK;

        emit AdminProposalApprovedForExecution(proposalId, ap.timelockEnd);
    }

    /* ═══════════════════════════════════════════════════════════════
       PAYMENT STREAMS (Automated Outflows)
       ═══════════════════════════════════════════════════════════════ */

    /**
     * @notice Create a payment stream (requires multisig via proposal first,
     *         or called by guardian for small streams)
     * @param recipient Stream recipient
     * @param token ERC20 token
     * @param totalAmount Total amount to stream over the duration
     * @param duration Stream duration in seconds
     * @param role Label: "moderator", "arbitrator", "grant"
     */
    /// @notice Create a payment stream. Requires multisig (DEFAULT_ADMIN_ROLE = address(this)).
    ///         Must be called via a proposal that targets this contract.
    function createStream(
        address recipient,
        address token,
        uint256 totalAmount,
        uint256 duration,
        string calldata role
    ) external onlyRole(DEFAULT_ADMIN_ROLE) returns (uint256) {
        require(recipient != address(0), "TreasuryGovernor: zero recipient");
        require(totalAmount > 0, "TreasuryGovernor: zero amount");
        require(duration > 0 && duration <= STREAM_MAX_DURATION, "TreasuryGovernor: invalid duration");
        require(
            IERC20(token).balanceOf(address(this)) >= totalAmount,
            "TreasuryGovernor: insufficient balance for stream"
        );

        uint256 streamId = _nextStreamId++;

        streams[streamId] = PaymentStream({
            id: streamId,
            recipient: recipient,
            token: token,
            totalAmount: totalAmount,
            claimedAmount: 0,
            startTime: block.timestamp,
            endTime: block.timestamp + duration,
            role: role,
            active: true
        });

        recipientStreams[recipient].push(streamId);

        emit StreamCreated(streamId, recipient, token, totalAmount, block.timestamp, block.timestamp + duration, role);

        return streamId;
    }

    /**
     * @notice Claim available funds from a payment stream
     * @param streamId The stream to claim from
     */
    function claimStream(uint256 streamId) external nonReentrant {
        PaymentStream storage s = streams[streamId];
        require(s.id != 0, "TreasuryGovernor: stream not found");
        require(s.active, "TreasuryGovernor: stream cancelled");
        require(s.recipient == msg.sender, "TreasuryGovernor: not recipient");

        uint256 available = _streamAvailable(s);
        require(available > 0, "TreasuryGovernor: nothing to claim");

        s.claimedAmount += available;
        IERC20(s.token).safeTransfer(s.recipient, available);

        emit StreamClaimed(streamId, msg.sender, available);
    }

    /**
     * @notice Cancel a payment stream (guardian or admin only)
     *         Unclaimed funds remain in treasury.
     */
    function cancelStream(uint256 streamId) external onlyRole(GUARDIAN_ROLE) {
        PaymentStream storage s = streams[streamId];
        require(s.id != 0, "TreasuryGovernor: stream not found");
        require(s.active, "TreasuryGovernor: already cancelled");

        s.active = false;
        emit StreamCancelled(streamId);
    }

    /**
     * @notice Cancel all streams for a banned address (called by SybilGuard)
     */
    function cancelStreamsForAddress(address banned) external onlyRole(SYBIL_GUARD_ROLE) {
        uint256[] storage streamIds = recipientStreams[banned];
        for (uint256 i = 0; i < streamIds.length; i++) {
            PaymentStream storage s = streams[streamIds[i]];
            if (s.active) {
                s.active = false;
                emit StreamCancelled(streamIds[i]);
            }
        }
    }

    function _streamAvailable(PaymentStream storage s) private view returns (uint256) {
        if (!s.active || block.timestamp < s.startTime) return 0;

        uint256 elapsed;
        if (block.timestamp >= s.endTime) {
            elapsed = s.endTime - s.startTime;
        } else {
            elapsed = block.timestamp - s.startTime;
        }

        uint256 duration = s.endTime - s.startTime;
        uint256 vested = (s.totalAmount * elapsed) / duration;

        if (vested <= s.claimedAmount) return 0;
        return vested - s.claimedAmount;
    }

    /* ═══════════════════════════════════════════════════════════════
       SIGNER MANAGEMENT
       ═══════════════════════════════════════════════════════════════ */

    /**
     * @notice Add a new signer (requires existing multisig approval via proposal)
     *         This function should be called through a proposal that calls this contract.
     */
    function addSigner(address signer) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(signer != address(0), "TreasuryGovernor: zero address");
        require(!hasRole(SIGNER_ROLE, signer), "TreasuryGovernor: already signer");
        require(signerCount < MAX_SIGNERS, "TreasuryGovernor: max signers reached");

        _grantRole(SIGNER_ROLE, signer);
        signerCount++;

        emit SignerAdded(signer);
    }

    /**
     * @notice Remove a signer (requires existing multisig approval via proposal)
     */
    function removeSigner(address signer) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(hasRole(SIGNER_ROLE, signer), "TreasuryGovernor: not a signer");
        require(signerCount > MIN_SIGNERS, "TreasuryGovernor: cannot go below minimum");
        require(signerCount - 1 >= requiredApprovals, "TreasuryGovernor: would break threshold");

        _revokeRole(SIGNER_ROLE, signer);
        signerCount--;

        emit SignerRemoved(signer);
    }

    /**
     * @notice Update required approvals (requires existing multisig approval)
     */
    function setRequiredApprovals(uint256 newRequired) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newRequired >= 2, "TreasuryGovernor: min 2 approvals");
        require(newRequired <= signerCount, "TreasuryGovernor: exceeds signer count");

        uint256 old = requiredApprovals;
        requiredApprovals = newRequired;

        emit RequiredApprovalsChanged(old, newRequired);
    }

    /* ═══════════════════════════════════════════════════════════════
       VIEW FUNCTIONS
       ═══════════════════════════════════════════════════════════════ */

    function getProposal(uint256 proposalId) external view returns (Proposal memory) {
        return proposals[proposalId];
    }

    function getStream(uint256 streamId) external view returns (PaymentStream memory) {
        return streams[streamId];
    }

    function streamClaimable(uint256 streamId) external view returns (uint256) {
        return _streamAvailable(streams[streamId]);
    }

    function getRecipientStreams(address recipient) external view returns (uint256[] memory) {
        return recipientStreams[recipient];
    }

    function getBalance(address token) external view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }

    function isProposalExpired(uint256 proposalId) external view returns (bool) {
        Proposal storage p = proposals[proposalId];
        return (p.status == ProposalStatus.Pending || p.status == ProposalStatus.Approved) &&
               block.timestamp > p.createdAt + PROPOSAL_EXPIRY;
    }
}`,
  },
  {
    name: "AirdropClaim",
    fileName: "AirdropClaim.sol",
    description:
      "V1 airdrop distribution with ECDSA attestation-based verification. Supports 180-day linear vesting with 25% immediate release.",
    lines: 269,
    source: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "./interfaces/IAirdropClaim.sol";

contract AirdropClaim is IAirdropClaim, AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    bytes32 public constant ATTESTOR_ROLE = keccak256("ATTESTOR_ROLE");

    IERC20 public immutable lobToken;

    // Airdrop parameters
    uint256 public constant BASE_ALLOCATION = 4_000 ether;
    uint256 public constant ACTIVE_MULTIPLIER = 150;
    uint256 public constant POWER_USER_MULTIPLIER = 300;
    uint256 public constant IMMEDIATE_RELEASE_BPS = 2500;
    uint256 public constant VESTING_DURATION = 180 days;

    // Attestation thresholds
    uint256 public constant POWER_USER_MIN_UPTIME = 14;
    uint256 public constant POWER_USER_MIN_CHANNELS = 3;
    uint256 public constant POWER_USER_MIN_TOOL_CALLS = 100;
    uint256 public constant ACTIVE_MIN_UPTIME = 7;
    uint256 public constant ACTIVE_MIN_CHANNELS = 2;
    uint256 public constant ACTIVE_MIN_TOOL_CALLS = 50;

    uint256 public immutable maxAirdropPool;

    uint256 public immutable claimWindowStart;
    uint256 public immutable claimWindowEnd;

    bytes32 public merkleRoot;
    address public attestor;

    mapping(address => ClaimInfo) private _claims;
    mapping(bytes32 => bool) private _usedWorkspaceHashes;
    uint256 public totalClaimed;

    constructor(
        address _lobToken,
        address _attestor,
        uint256 _claimWindowStart,
        uint256 _claimWindowEnd,
        uint256 _maxAirdropPool
    ) {
        require(_lobToken != address(0), "AirdropClaim: zero token");
        require(_attestor != address(0), "AirdropClaim: zero attestor");
        require(_claimWindowEnd > _claimWindowStart, "AirdropClaim: invalid window");
        require(_maxAirdropPool > 0, "AirdropClaim: zero pool");

        lobToken = IERC20(_lobToken);
        attestor = _attestor;
        claimWindowStart = _claimWindowStart;
        claimWindowEnd = _claimWindowEnd;
        maxAirdropPool = _maxAirdropPool;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ATTESTOR_ROLE, _attestor);
    }

    function submitAttestation(
        bytes32 workspaceHash,
        bytes32 heartbeatMerkleRoot,
        uint256 uptimeDays,
        uint256 channelCount,
        uint256 toolCallCount,
        bytes calldata signature
    ) external nonReentrant whenNotPaused {
        require(block.timestamp >= claimWindowStart, "AirdropClaim: not started");
        require(block.timestamp <= claimWindowEnd, "AirdropClaim: window closed");
        require(!_claims[msg.sender].claimed, "AirdropClaim: already claimed");
        require(!_usedWorkspaceHashes[workspaceHash], "AirdropClaim: duplicate workspace");

        _verifyAndProcessAttestation(
            workspaceHash, heartbeatMerkleRoot,
            uptimeDays, channelCount, toolCallCount, signature
        );
    }

    function claim(bytes32[] calldata merkleProof) external nonReentrant whenNotPaused {
        require(block.timestamp >= claimWindowStart, "AirdropClaim: not started");
        require(block.timestamp <= claimWindowEnd, "AirdropClaim: window closed");
        require(!_claims[msg.sender].claimed, "AirdropClaim: already claimed");
        require(merkleRoot != bytes32(0), "AirdropClaim: no merkle root");

        bytes32 leaf = keccak256(abi.encodePacked(msg.sender));
        require(MerkleProof.verify(merkleProof, merkleRoot, leaf), "AirdropClaim: invalid proof");

        uint256 totalAllocation = BASE_ALLOCATION;
        require(totalClaimed + totalAllocation <= maxAirdropPool, "AirdropClaim: pool exhausted");

        uint256 immediateRelease = (totalAllocation * IMMEDIATE_RELEASE_BPS) / 10000;
        uint256 vestedAmount = totalAllocation - immediateRelease;

        _claims[msg.sender] = ClaimInfo({
            claimed: true,
            amount: totalAllocation,
            vestedAmount: vestedAmount,
            claimedAt: block.timestamp,
            tier: AttestationTier.New,
            workspaceHash: bytes32(0)
        });

        totalClaimed += totalAllocation;
        lobToken.safeTransfer(msg.sender, immediateRelease);

        emit AirdropClaimed(msg.sender, totalAllocation, immediateRelease, AttestationTier.New);
    }

    function releaseVestedTokens() external nonReentrant {
        ClaimInfo storage info = _claims[msg.sender];
        require(info.claimed, "AirdropClaim: not claimed");
        require(info.vestedAmount > 0, "AirdropClaim: fully vested");

        uint256 elapsed = block.timestamp - info.claimedAt;
        if (elapsed > VESTING_DURATION) elapsed = VESTING_DURATION;

        uint256 totalVestable = info.amount - (info.amount * IMMEDIATE_RELEASE_BPS / 10000);
        uint256 vestedSoFar = (totalVestable * elapsed) / VESTING_DURATION;
        uint256 alreadyReleased = totalVestable - info.vestedAmount;

        require(vestedSoFar > alreadyReleased, "AirdropClaim: nothing to release");
        uint256 releasable = vestedSoFar - alreadyReleased;

        info.vestedAmount -= releasable;
        lobToken.safeTransfer(msg.sender, releasable);

        emit VestedTokensReleased(msg.sender, releasable);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }

    function setMerkleRoot(bytes32 _merkleRoot) external onlyRole(DEFAULT_ADMIN_ROLE) {
        merkleRoot = _merkleRoot;
        emit MerkleRootUpdated(_merkleRoot);
    }

    function setAttestor(address _attestor) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_attestor != address(0), "AirdropClaim: zero attestor");
        _revokeRole(ATTESTOR_ROLE, attestor);
        attestor = _attestor;
        _grantRole(ATTESTOR_ROLE, _attestor);
    }

    function recoverTokens(address to) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(block.timestamp > claimWindowEnd, "AirdropClaim: window active");
        uint256 balance = lobToken.balanceOf(address(this));
        lobToken.safeTransfer(to, balance);
    }

    function getClaimInfo(address claimant) external view returns (ClaimInfo memory) {
        return _claims[claimant];
    }

    function isWorkspaceHashUsed(bytes32 hash) external view returns (bool) {
        return _usedWorkspaceHashes[hash];
    }

    function _verifyAndProcessAttestation(
        bytes32 workspaceHash,
        bytes32 heartbeatMerkleRoot,
        uint256 uptimeDays,
        uint256 channelCount,
        uint256 toolCallCount,
        bytes calldata signature
    ) internal {
        bytes32 messageHash = keccak256(abi.encodePacked(
            msg.sender, workspaceHash, heartbeatMerkleRoot,
            uptimeDays, channelCount, toolCallCount
        ));
        bytes32 ethSignedHash = messageHash.toEthSignedMessageHash();
        address signer = ethSignedHash.recover(signature);
        require(hasRole(ATTESTOR_ROLE, signer), "AirdropClaim: invalid signature");

        AttestationTier tier = _determineTier(uptimeDays, channelCount, toolCallCount);
        _usedWorkspaceHashes[workspaceHash] = true;

        uint256 totalAllocation = _calculateAllocation(tier);
        require(totalClaimed + totalAllocation <= maxAirdropPool, "AirdropClaim: pool exhausted");

        uint256 immediateRelease = (totalAllocation * IMMEDIATE_RELEASE_BPS) / 10000;

        _claims[msg.sender] = ClaimInfo({
            claimed: true,
            amount: totalAllocation,
            vestedAmount: totalAllocation - immediateRelease,
            claimedAt: block.timestamp,
            tier: tier,
            workspaceHash: workspaceHash
        });

        totalClaimed += totalAllocation;
        lobToken.safeTransfer(msg.sender, immediateRelease);

        emit AttestationSubmitted(msg.sender, workspaceHash, tier);
        emit AirdropClaimed(msg.sender, totalAllocation, immediateRelease, tier);
    }

    function _calculateAllocation(AttestationTier tier) internal pure returns (uint256) {
        uint256 multiplier = 100;
        if (tier == AttestationTier.Active) multiplier = ACTIVE_MULTIPLIER;
        if (tier == AttestationTier.PowerUser) multiplier = POWER_USER_MULTIPLIER;
        return (BASE_ALLOCATION * multiplier) / 100;
    }

    function _determineTier(
        uint256 uptimeDays,
        uint256 channelCount,
        uint256 toolCallCount
    ) internal pure returns (AttestationTier) {
        if (
            uptimeDays >= POWER_USER_MIN_UPTIME &&
            channelCount >= POWER_USER_MIN_CHANNELS &&
            toolCallCount >= POWER_USER_MIN_TOOL_CALLS
        ) {
            return AttestationTier.PowerUser;
        }
        if (
            uptimeDays >= ACTIVE_MIN_UPTIME &&
            channelCount >= ACTIVE_MIN_CHANNELS &&
            toolCallCount >= ACTIVE_MIN_TOOL_CALLS
        ) {
            return AttestationTier.Active;
        }
        return AttestationTier.New;
    }
}`,
  },
  {
    name: "AirdropClaim",
    fileName: "AirdropClaim.sol",
    description:
      "V2 airdrop with Groth16 zero-knowledge proof verification for Sybil-resistant distribution.",
    lines: 233,
    source: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "./interfaces/IAirdropClaimV2.sol";
import "./verifiers/Groth16Verifier.sol";

/**
 * @title AirdropClaimV2
 * @notice ZK proof-based airdrop claim contract for LOBSTR.
 *         Replaces the trusted ECDSA attestor from V1 with zero-knowledge proofs.
 *         Agents generate Groth16 proofs locally; the contract verifies on-chain.
 *
 *         Public signals: [workspaceHash, claimantAddress, tierIndex]
 *         - workspaceHash: Poseidon(workspaceId, salt) commitment
 *         - claimantAddress: must match msg.sender (prevents front-running)
 *         - tierIndex: 0=New, 1=Active, 2=PowerUser (verified by circuit)
 */
contract AirdropClaimV2 is IAirdropClaimV2, AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    IERC20 public immutable lobToken;
    Groth16Verifier public immutable verifier;
    address public immutable approvalSigner;
    uint256 public immutable difficultyTarget;

    uint256 public constant NEW_ALLOCATION = 1_000 ether;
    uint256 public constant ACTIVE_ALLOCATION = 3_000 ether;
    uint256 public constant POWER_USER_ALLOCATION = 6_000 ether;

    uint256 public constant IMMEDIATE_RELEASE_BPS = 2500;
    uint256 public constant VESTING_DURATION = 180 days;

    uint256 public immutable maxAirdropPool;
    uint256 public immutable claimWindowStart;
    uint256 public immutable claimWindowEnd;
    address public immutable v1Contract;

    mapping(address => ClaimInfo) private _claims;
    mapping(uint256 => bool) private _usedWorkspaceHashes;
    mapping(bytes32 => bool) private _usedApprovals;
    uint256 public totalClaimed;

    constructor(
        address _lobToken,
        address _verifier,
        uint256 _claimWindowStart,
        uint256 _claimWindowEnd,
        address _v1Contract,
        address _approvalSigner,
        uint256 _difficultyTarget,
        uint256 _maxAirdropPool
    ) {
        require(_lobToken != address(0), "AirdropClaimV2: zero token");
        require(_verifier != address(0), "AirdropClaimV2: zero verifier");
        require(_claimWindowEnd > _claimWindowStart, "AirdropClaimV2: invalid window");
        require(_approvalSigner != address(0), "AirdropClaimV2: zero signer");
        require(_difficultyTarget > 0, "AirdropClaimV2: zero difficulty");
        require(_maxAirdropPool > 0, "AirdropClaimV2: zero pool");

        lobToken = IERC20(_lobToken);
        verifier = Groth16Verifier(_verifier);
        claimWindowStart = _claimWindowStart;
        claimWindowEnd = _claimWindowEnd;
        v1Contract = _v1Contract;
        approvalSigner = _approvalSigner;
        difficultyTarget = _difficultyTarget;
        maxAirdropPool = _maxAirdropPool;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function submitProof(
        uint256[2] calldata pA,
        uint256[2][2] calldata pB,
        uint256[2] calldata pC,
        uint256[3] calldata pubSignals,
        bytes calldata approvalSig,
        uint256 powNonce
    ) external nonReentrant whenNotPaused {
        require(block.timestamp >= claimWindowStart, "AirdropClaimV2: not started");
        require(block.timestamp <= claimWindowEnd, "AirdropClaimV2: window closed");
        require(!_claims[msg.sender].claimed, "AirdropClaimV2: already claimed");

        uint256 workspaceHash = pubSignals[0];
        uint256 claimantAddress = pubSignals[1];
        uint256 tierIndex = pubSignals[2];

        require(
            claimantAddress == uint256(uint160(msg.sender)),
            "AirdropClaimV2: address mismatch"
        );
        require(!_usedWorkspaceHashes[workspaceHash], "AirdropClaimV2: duplicate workspace");
        require(tierIndex <= 2, "AirdropClaimV2: invalid tier");

        // IP gate
        bytes32 msgHash = keccak256(abi.encodePacked(msg.sender, workspaceHash, "LOBSTR_AIRDROP_APPROVAL"));
        bytes32 ethHash = msgHash.toEthSignedMessageHash();
        require(!_usedApprovals[ethHash], "AirdropClaimV2: approval already used");
        _usedApprovals[ethHash] = true;
        require(ethHash.recover(approvalSig) == approvalSigner, "AirdropClaimV2: invalid approval");

        // PoW
        require(
            uint256(keccak256(abi.encodePacked(workspaceHash, msg.sender, powNonce))) < difficultyTarget,
            "AirdropClaimV2: insufficient PoW"
        );

        // Verify ZK proof
        require(
            verifier.verifyProof(pA, pB, pC, pubSignals),
            "AirdropClaimV2: invalid proof"
        );

        _usedWorkspaceHashes[workspaceHash] = true;

        AttestationTier tier = AttestationTier(tierIndex);
        uint256 totalAllocation = _getAllocation(tier);
        require(totalClaimed + totalAllocation <= maxAirdropPool, "AirdropClaimV2: pool exhausted");

        uint256 immediateRelease = (totalAllocation * IMMEDIATE_RELEASE_BPS) / 10000;
        uint256 vestedAmount = totalAllocation - immediateRelease;

        _claims[msg.sender] = ClaimInfo({
            claimed: true,
            amount: totalAllocation,
            vestedAmount: vestedAmount,
            claimedAt: block.timestamp,
            tier: tier,
            workspaceHash: workspaceHash
        });

        totalClaimed += totalAllocation;
        lobToken.safeTransfer(msg.sender, immediateRelease);

        emit ProofSubmitted(msg.sender, workspaceHash, tier);
        emit AirdropClaimed(msg.sender, totalAllocation, immediateRelease, tier);
    }

    function releaseVestedTokens() external nonReentrant {
        ClaimInfo storage info = _claims[msg.sender];
        require(info.claimed, "AirdropClaimV2: not claimed");
        require(info.vestedAmount > 0, "AirdropClaimV2: fully vested");

        uint256 elapsed = block.timestamp - info.claimedAt;
        if (elapsed > VESTING_DURATION) elapsed = VESTING_DURATION;

        uint256 totalVestable = info.amount - (info.amount * IMMEDIATE_RELEASE_BPS / 10000);
        uint256 vestedSoFar = (totalVestable * elapsed) / VESTING_DURATION;
        uint256 alreadyReleased = totalVestable - info.vestedAmount;

        require(vestedSoFar > alreadyReleased, "AirdropClaimV2: nothing to release");
        uint256 releasable = vestedSoFar - alreadyReleased;

        info.vestedAmount -= releasable;
        lobToken.safeTransfer(msg.sender, releasable);

        emit VestedTokensReleased(msg.sender, releasable);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }

    function recoverTokens(address to) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(block.timestamp > claimWindowEnd, "AirdropClaimV2: window active");
        uint256 balance = lobToken.balanceOf(address(this));
        lobToken.safeTransfer(to, balance);
    }

    function getClaimInfo(address claimant) external view returns (ClaimInfo memory) {
        return _claims[claimant];
    }

    function isWorkspaceHashUsed(uint256 hash) external view returns (bool) {
        return _usedWorkspaceHashes[hash];
    }

    function _getAllocation(AttestationTier tier) internal pure returns (uint256) {
        if (tier == AttestationTier.PowerUser) return POWER_USER_ALLOCATION;
        if (tier == AttestationTier.Active) return ACTIVE_ALLOCATION;
        return NEW_ALLOCATION;
    }
}`,
  },
  {
    name: "InsurancePool",
    fileName: "InsurancePool.sol",
    description:
      "Escrow insurance pool with Synthetix-style premium distribution. Buyers insure jobs, stakers underwrite claims and earn premiums.",
    lines: 416,
    source: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/security/Pausable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IInsurancePool} from "./interfaces/IInsurancePool.sol";
import {IEscrowEngine} from "./interfaces/IEscrowEngine.sol";
import {IDisputeArbitration} from "./interfaces/IDisputeArbitration.sol";
import {IReputationSystem} from "./interfaces/IReputationSystem.sol";
import {IStakingManager} from "./interfaces/IStakingManager.sol";
import {ISybilGuard} from "./interfaces/ISybilGuard.sol";
import {IServiceRegistry} from "./interfaces/IServiceRegistry.sol";

contract InsurancePool is IInsurancePool, AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    bytes32 public constant GOVERNOR_ROLE = keccak256("GOVERNOR_ROLE");

    IERC20 public immutable LOB_TOKEN;
    IEscrowEngine public immutable ESCROW_ENGINE;
    IDisputeArbitration public immutable DISPUTE_ARBITRATION;
    IReputationSystem public immutable REPUTATION_SYSTEM;
    IStakingManager public immutable STAKING_MANAGER;
    ISybilGuard public immutable SYBIL_GUARD;
    IServiceRegistry public immutable SERVICE_REGISTRY;
    address public immutable TREASURY;

    uint256 public premiumRateBps = 50; // 0.5%

    // Coverage caps by reputation tier (in LOB wei)
    uint256 public coverageCapBronze = 100e18;
    uint256 public coverageCapSilver = 500e18;
    uint256 public coverageCapGold = 2500e18;
    uint256 public coverageCapPlatinum = 10000e18;

    uint256 public totalPoolDeposits;
    uint256 public totalPremiumsCollected;
    uint256 public totalClaimsPaid;

    // Synthetix-style premium distribution
    uint256 public rewardPerTokenStored;
    uint256 private _totalStaked;
    uint256 private _totalRewardsAccrued;
    uint256 private _totalRewardsClaimed;
    uint256 private _totalRefundLiabilities;
    uint256 private _totalInFlightPrincipal;

    mapping(address => PoolStaker) private _stakers;
    mapping(uint256 => bool) private _insuredJobs;
    mapping(uint256 => bool) private _claimPaid;
    mapping(uint256 => bool) private _refundClaimed;
    mapping(uint256 => uint256) private _jobPremiums;
    mapping(uint256 => address) private _jobBuyer;
    mapping(uint256 => uint256) private _jobRefundAmount;
    mapping(uint256 => bool) private _jobSettled;

    constructor(address _lobToken, address _escrowEngine, address _disputeArbitration,
        address _reputationSystem, address _stakingManager, address _sybilGuard,
        address _serviceRegistry, address _treasury) {
        LOB_TOKEN = IERC20(_lobToken);
        ESCROW_ENGINE = IEscrowEngine(_escrowEngine);
        DISPUTE_ARBITRATION = IDisputeArbitration(_disputeArbitration);
        REPUTATION_SYSTEM = IReputationSystem(_reputationSystem);
        STAKING_MANAGER = IStakingManager(_stakingManager);
        SYBIL_GUARD = ISybilGuard(_sybilGuard);
        SERVICE_REGISTRY = IServiceRegistry(_serviceRegistry);
        TREASURY = _treasury;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    // ═══════════════════════════════════════════════════════════════
    //  POOL STAKING (Premium Yield)
    // ═══════════════════════════════════════════════════════════════

    function depositToPool(uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "InsurancePool: zero amount");
        _updatePoolReward(msg.sender);
        _stakers[msg.sender].deposited += amount;
        _totalStaked += amount;
        totalPoolDeposits += amount;
        LOB_TOKEN.safeTransferFrom(msg.sender, address(this), amount);
        emit PoolDeposited(msg.sender, amount);
    }

    function withdrawFromPool(uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0 && _stakers[msg.sender].deposited >= amount, "InsurancePool: invalid");
        _updatePoolReward(msg.sender);
        _stakers[msg.sender].deposited -= amount;
        _totalStaked -= amount;
        uint256 postBalance = LOB_TOKEN.balanceOf(address(this)) - amount;
        uint256 liabilities = (_totalRewardsAccrued - _totalRewardsClaimed)
            + _totalRefundLiabilities + _totalInFlightPrincipal;
        require(postBalance >= liabilities, "InsurancePool: would breach solvency");
        LOB_TOKEN.safeTransfer(msg.sender, amount);
        emit PoolWithdrawn(msg.sender, amount);
    }

    function claimPoolRewards() external nonReentrant whenNotPaused {
        _updatePoolReward(msg.sender);
        uint256 reward = _stakers[msg.sender].pendingRewards;
        require(reward > 0, "InsurancePool: nothing to claim");
        _stakers[msg.sender].pendingRewards = 0;
        _totalRewardsClaimed += reward;
        LOB_TOKEN.safeTransfer(msg.sender, reward);
    }

    // ═══════════════════════════════════════════════════════════════
    //  INSURED JOBS
    // ═══════════════════════════════════════════════════════════════

    function createInsuredJob(uint256 listingId, address seller, uint256 amount, address token)
        external nonReentrant whenNotPaused returns (uint256 jobId) {
        require(!SYBIL_GUARD.checkBanned(msg.sender), "InsurancePool: buyer banned");
        require(token == address(LOB_TOKEN), "InsurancePool: only LOB supported");
        uint256 premium = (amount * premiumRateBps) / 10000;
        LOB_TOKEN.safeTransferFrom(msg.sender, address(this), amount + premium);
        _distributePremium(premium);
        totalPremiumsCollected += premium;
        LOB_TOKEN.safeApprove(address(ESCROW_ENGINE), amount);
        jobId = ESCROW_ENGINE.createJob(listingId, seller, amount, token);
        _insuredJobs[jobId] = true;
        _jobPremiums[jobId] = premium;
        _jobBuyer[jobId] = msg.sender;
        _totalInFlightPrincipal += amount;
        emit InsuredJobCreated(jobId, msg.sender, premium);
    }

    function claimRefund(uint256 jobId) external nonReentrant whenNotPaused {
        require(_insuredJobs[jobId] && _jobBuyer[jobId] == msg.sender, "InsurancePool: invalid");
        require(!_refundClaimed[jobId], "InsurancePool: already claimed");
        _settleJob(jobId);
        uint256 refundAmount = _jobRefundAmount[jobId];
        require(refundAmount > 0, "InsurancePool: no refund");
        _refundClaimed[jobId] = true;
        _totalRefundLiabilities -= refundAmount;
        LOB_TOKEN.safeTransfer(msg.sender, refundAmount);
    }

    /// @notice Insurance payout = max(0, job.amount - escrowRefund), capped by tier
    function fileClaim(uint256 jobId) external nonReentrant whenNotPaused {
        require(_insuredJobs[jobId] && _jobBuyer[jobId] == msg.sender && !_claimPaid[jobId], "InsurancePool: invalid");
        IEscrowEngine.Job memory job = ESCROW_ENGINE.getJob(jobId);
        require(job.status == IEscrowEngine.JobStatus.Resolved, "InsurancePool: not resolved");
        _settleJob(jobId);
        uint256 netLoss = job.amount > _jobRefundAmount[jobId] ? job.amount - _jobRefundAmount[jobId] : 0;
        require(netLoss > 0, "InsurancePool: no net loss");
        uint256 claimAmount = netLoss > getCoverageCap(msg.sender) ? getCoverageCap(msg.sender) : netLoss;
        uint256 reserved = (_totalRewardsAccrued - _totalRewardsClaimed) + _totalRefundLiabilities + _totalInFlightPrincipal;
        uint256 poolAvailable = LOB_TOKEN.balanceOf(address(this)) > reserved ? LOB_TOKEN.balanceOf(address(this)) - reserved : 0;
        if (claimAmount > poolAvailable) claimAmount = poolAvailable;
        require(claimAmount > 0, "InsurancePool: no coverage");
        _claimPaid[jobId] = true;
        totalClaimsPaid += claimAmount;
        LOB_TOKEN.safeTransfer(msg.sender, claimAmount);
        emit ClaimPaid(jobId, msg.sender, claimAmount);
    }

    // ═══════════════════════════════════════════════════════════════
    //  PROXY BUYER ACTIONS
    // ═══════════════════════════════════════════════════════════════

    function confirmInsuredDelivery(uint256 jobId) external nonReentrant whenNotPaused {
        require(_insuredJobs[jobId] && _jobBuyer[jobId] == msg.sender, "InsurancePool: invalid");
        ESCROW_ENGINE.confirmDelivery(jobId);
        _settleJob(jobId);
    }

    function initiateInsuredDispute(uint256 jobId, string calldata evidenceURI) external nonReentrant whenNotPaused {
        require(_insuredJobs[jobId] && _jobBuyer[jobId] == msg.sender, "InsurancePool: invalid");
        ESCROW_ENGINE.initiateDispute(jobId, evidenceURI);
    }

    function bookJob(uint256 jobId) external {
        require(_insuredJobs[jobId], "InsurancePool: not insured");
        _settleJob(jobId);
    }

    // ═══════════════════════════════════════════════════════════════
    //  ADMIN / VIEWS / INTERNAL
    // ═══════════════════════════════════════════════════════════════

    function updatePremiumRate(uint256 newBps) external onlyRole(GOVERNOR_ROLE) {
        require(newBps <= 1000, "InsurancePool: rate too high");
        premiumRateBps = newBps;
    }

    function updateCoverageCaps(uint256 b, uint256 s, uint256 g, uint256 p) external onlyRole(GOVERNOR_ROLE) {
        coverageCapBronze = b; coverageCapSilver = s; coverageCapGold = g; coverageCapPlatinum = p;
    }

    function getCoverageCap(address buyer) public view returns (uint256) {
        (, IReputationSystem.ReputationTier tier) = REPUTATION_SYSTEM.getScore(buyer);
        if (tier == IReputationSystem.ReputationTier.Platinum) return coverageCapPlatinum;
        if (tier == IReputationSystem.ReputationTier.Gold) return coverageCapGold;
        if (tier == IReputationSystem.ReputationTier.Silver) return coverageCapSilver;
        return coverageCapBronze;
    }

    function getPoolStats() external view returns (uint256, uint256, uint256, uint256) {
        uint256 reserved = (_totalRewardsAccrued - _totalRewardsClaimed) + _totalRefundLiabilities + _totalInFlightPrincipal;
        uint256 bal = LOB_TOKEN.balanceOf(address(this));
        return (totalPoolDeposits, totalPremiumsCollected, totalClaimsPaid, bal > reserved ? bal - reserved : 0);
    }

    function _settleJob(uint256 jobId) internal {
        if (_jobSettled[jobId]) return;
        IEscrowEngine.Job memory job = ESCROW_ENGINE.getJob(jobId);
        if (job.status != IEscrowEngine.JobStatus.Resolved &&
            job.status != IEscrowEngine.JobStatus.Confirmed &&
            job.status != IEscrowEngine.JobStatus.Released) return;
        _jobSettled[jobId] = true;
        _totalInFlightPrincipal -= job.amount;
        if (job.status == IEscrowEngine.JobStatus.Resolved) {
            uint256 did = ESCROW_ENGINE.getJobDisputeId(jobId);
            IDisputeArbitration.Dispute memory d = DISPUTE_ARBITRATION.getDispute(did);
            uint256 refund;
            if (d.ruling == IDisputeArbitration.Ruling.BuyerWins) refund = job.amount;
            else if (d.ruling == IDisputeArbitration.Ruling.Draw) refund = job.amount / 2 - job.fee / 2;
            _jobRefundAmount[jobId] = refund;
            if (refund > 0) _totalRefundLiabilities += refund;
        }
    }

    function _distributePremium(uint256 premium) internal {
        if (_totalStaked == 0) { LOB_TOKEN.safeTransfer(TREASURY, premium); return; }
        rewardPerTokenStored += (premium * 1e18) / _totalStaked;
        _totalRewardsAccrued += premium;
    }

    function _updatePoolReward(address account) internal {
        if (account != address(0) && _stakers[account].deposited > 0) {
            _stakers[account].pendingRewards += (_stakers[account].deposited *
                (rewardPerTokenStored - _stakers[account].rewardPerTokenPaid)) / 1e18;
        }
        if (account != address(0)) _stakers[account].rewardPerTokenPaid = rewardPerTokenStored;
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }
}`,
  },
  {
    name: "X402EscrowBridge",
    fileName: "X402EscrowBridge.sol",
    description:
      "Routes x402 USDC payments through EscrowEngine with EIP-712 payer signatures, EIP-3009 authorization, refund credit tracking, and front-run protection.",
    lines: 708,
    source: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "./interfaces/IEscrowEngine.sol";
import "./interfaces/IDisputeArbitration.sol";
import "./interfaces/IERC3009.sol";

/// @title X402EscrowBridge
/// @notice Routes x402 payments through LOBSTR's EscrowEngine for trust-protected settlement.
/// @dev Acts as buyer proxy since EscrowEngine sets buyer = msg.sender in createJob.
///      Two atomic deposit+escrow paths — no intermediate pending-deposit state:
///        1. depositAndCreateJob(): Pull-model with EIP-712 payer signature binding the full
///           payment intent (nonce, token, amount, listingId, seller, deadline). Payer must
///           have approved this contract.
///        2. depositWithAuthorization(): EIP-3009 model with dual payer signatures —
///           an EIP-3009 sig authorizing the token transfer AND an EIP-712 PaymentIntent
///           sig binding the escrow routing params (listingId, seller, deadline).
///           Uses receiveWithAuthorization (not transferWithAuthorization) so only this
///           contract can execute the transfer — prevents front-running.
///      If an EIP-3009 authorization is front-run via direct transferWithAuthorization,
///      recoverStrandedDeposit() returns funds to the payer using their PaymentIntent sig.
///      Payer actions (confirm/dispute) are proxied through the bridge.
///      Escrow refunds are claimable permissionlessly — the bridge reads dispute rulings
///      on-chain to compute exact refund amounts without facilitator intervention.
///
///      Safety invariant: EscrowEngine is immutable and transfers refund tokens synchronously
///      during resolveDispute() — if job.status == Resolved, the refund is already on this
///      contract. To prevent cross-user theft from pooled balances, resolved refunds should
///      be eagerly booked into totalLiabilities via bookRefundCredit() or registerRefund()
///      as soon as resolution is observed (keepers/facilitators should call these promptly).
contract X402EscrowBridge is Initializable, UUPSUpgradeable, OwnableUpgradeable, AccessControlUpgradeable, ReentrancyGuardUpgradeable, EIP712Upgradeable {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    bytes32 public constant FACILITATOR_ROLE = keccak256("FACILITATOR_ROLE");

    /// @dev EIP-712 typehash for payer-signed payment intents (used by depositAndCreateJob)
    bytes32 private constant PAYMENT_INTENT_TYPEHASH = keccak256(
        "PaymentIntent(bytes32 x402Nonce,address token,uint256 amount,uint256 listingId,address seller,uint256 deadline,uint256 deliveryDeadline)"
    );

    IEscrowEngine public escrow;
    IDisputeArbitration public disputeArbitration;

    /// @notice Tracks whether an x402 nonce has been used (prevents replay)
    mapping(bytes32 => bool) public nonceUsed;

    /// @notice x402 payment nonce → escrow job ID
    mapping(bytes32 => uint256) public paymentToJob;

    /// @notice escrow job ID → actual x402 payer address
    mapping(uint256 => address) public jobPayer;

    /// @notice escrow job ID → token used for this job
    mapping(uint256 => address) public jobToken;

    /// @notice Allowlisted tokens (only standard ERC-20s, no fee-on-transfer)
    mapping(address => bool) public allowedTokens;

    /// @notice Per-token total liabilities (sum of all reserved refund credits)
    mapping(address => uint256) public totalLiabilities;

    /// @notice EIP-712 payer-signed payment intent for depositAndCreateJob()
    struct PaymentIntent {
        bytes32 x402Nonce;
        address payer;
        address token;
        uint256 amount;
        uint256 listingId;
        address seller;
        uint256 deadline;
        uint256 deliveryDeadline; // Time after which buyer can cancel
    }

    /// @notice EIP-3009 transfer authorization for depositWithAuthorization()
    /// @dev Only contains EIP-3009 transfer fields. Escrow routing (listingId, seller) is
    ///      bound via a separate EIP-712 PaymentIntent signature from the payer.
    struct ERC3009Auth {
        address from;
        address token;
        uint256 amount;
        uint256 validAfter;
        uint256 validBefore;
        bytes32 eip3009Nonce;
    }

    /// @notice Tracks whether the payer has claimed their escrow refund for a job
    mapping(uint256 => bool) public refundClaimed;

    /// @notice Per-job refund credit (set by facilitator or computed on-chain)
    mapping(uint256 => uint256) public jobRefundCredit;

    /// @notice Per-token total escrow reserves.
    /// @dev Tracks amounts sent to EscrowEngine that may return as refunds.
    ///      Included in solvency checks for recoverTokens() (admin guard).
    ///      NOT included in user-facing claim/refund checks (claimEscrowRefund,
    ///      bookRefundCredit) to avoid blocking payer claims with phantom obligations.
    mapping(address => uint256) public totalEscrowReserves;

    /// @notice Per-job escrow reserve amount (tracks how much was escrowed per job)
    mapping(uint256 => uint256) public jobEscrowReserve;

    /// @notice Tracks unbooked resolved refund amounts per token.
    /// @dev These are funds that have returned from EscrowEngine for resolved jobs
    ///      but haven't been booked into totalLiabilities yet. Included in solvency
    ///      checks to prevent cross-user theft from pooled balances.
    mapping(address => uint256) public unbookedResolvedReserves;

    /// @notice Per-job flag: true once job resolves with refund owed but not yet booked.
    mapping(uint256 => bool) public jobHasUnbookedRefund;


    event EscrowedJobCreated(
        bytes32 indexed x402Nonce,
        uint256 indexed jobId,
        address indexed payer,
        address seller,
        uint256 amount,
        address token
    );

    event DeliveryConfirmedByPayer(uint256 indexed jobId, address indexed payer);
    event DisputeInitiatedByPayer(uint256 indexed jobId, address indexed payer);
    event JobCancelledByPayer(uint256 indexed jobId, address indexed payer);
    event EscrowRefundClaimed(uint256 indexed jobId, address indexed payer, uint256 amount);
    event RefundRegistered(uint256 indexed jobId, uint256 amount);
    event TokenAllowlistUpdated(address indexed token, bool allowed);
    event EscrowReserveReleased(uint256 indexed jobId, address token, uint256 amount);
    event StrandedDepositRecovered(address indexed payer, address indexed token, uint256 amount, bytes32 eip3009Nonce);
    event UnbookedRefundRecorded(uint256 indexed jobId, address token, uint256 amount);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _escrow, address _disputeArbitration) public virtual initializer {
        require(_escrow != address(0), "Bridge: zero escrow");
        require(_disputeArbitration != address(0), "Bridge: zero dispute");

        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();
        __AccessControl_init();
        __ReentrancyGuard_init();
        __EIP712_init("X402EscrowBridge", "1");

        escrow = IEscrowEngine(_escrow);
        disputeArbitration = IDisputeArbitration(_disputeArbitration);

        // Grant roles to owner (can reassign later)
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(FACILITATOR_ROLE, msg.sender);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    /// @notice Admin adds or removes a token from the allowlist
    /// @param token ERC-20 token address
    /// @param allowed Whether the token is permitted
    function setTokenAllowed(address token, bool allowed) external onlyRole(DEFAULT_ADMIN_ROLE) {
        allowedTokens[token] = allowed;
        emit TokenAllowlistUpdated(token, allowed);
    }

    // ─── Atomic Deposit + Escrow Creation ────────────────────────────────────

    /// @notice Atomic EIP-3009 deposit + escrow creation with dual payer authorization.
    ///         Requires two payer signatures:
    ///           1. EIP-3009 signature (v/r/s) authorizing the token transfer to the bridge
    ///           2. EIP-712 PaymentIntent signature (intentV/intentR/intentS) binding the
    ///              escrow routing parameters (listingId, seller, nonce, deadline)
    ///         This prevents a compromised facilitator from misrouting EIP-3009-authorized
    ///         funds to an attacker-controlled seller.
    /// @param auth ERC3009Auth struct with transfer authorization params
    /// @param v EIP-3009 ECDSA signature v
    /// @param r EIP-3009 ECDSA signature r
    /// @param s EIP-3009 ECDSA signature s
    /// @param intent PaymentIntent struct binding the escrow routing params
    /// @param intentV EIP-712 ECDSA signature v for the PaymentIntent
    /// @param intentR EIP-712 ECDSA signature r for the PaymentIntent
    /// @param intentS EIP-712 ECDSA signature s for the PaymentIntent
    /// @return jobId The escrow job ID for lifecycle tracking
    function depositWithAuthorization(
        ERC3009Auth calldata auth,
        uint8 v, bytes32 r, bytes32 s,
        PaymentIntent calldata intent,
        uint8 intentV, bytes32 intentR, bytes32 intentS
    ) external onlyRole(FACILITATOR_ROLE) nonReentrant returns (uint256 jobId) {
        require(!nonceUsed[intent.x402Nonce], "Bridge: nonce already used");
        require(allowedTokens[auth.token], "Bridge: token not allowed");
        require(auth.from != address(0), "Bridge: zero payer");
        require(auth.amount > 0, "Bridge: zero amount");
        require(block.timestamp <= intent.deadline, "Bridge: deadline expired");

        // Cross-validate: EIP-3009 auth and PaymentIntent must agree on payer/token/amount
        require(auth.from == intent.payer, "Bridge: payer mismatch");
        require(auth.token == intent.token, "Bridge: token mismatch");
        require(auth.amount == intent.amount, "Bridge: amount mismatch");

        // Verify payer authorized the escrow routing (EIP-712)
        _verifyPaymentIntent(intent, intentV, intentR, intentS);

        // Execute the EIP-3009 transfer (isolated to reduce stack depth)
        _executeERC3009Transfer(auth, v, r, s);

        // Create escrow job atomically
        jobId = _createEscrowJob(
            intent.x402Nonce, auth.from, auth.token, auth.amount,
            intent.listingId, intent.seller, intent.deliveryDeadline
        );
    }

    /// @notice Atomic payer-authorized pull deposit + escrow creation.
    ///         Requires an EIP-712 signature from the payer over the full payment intent,
    ///         preventing a compromised facilitator from pulling arbitrary approved funds
    ///         or routing them to an attacker-controlled seller.
    /// @param intent PaymentIntent struct with all payment parameters
    /// @param v EIP-712 signature v
    /// @param r EIP-712 signature r
    /// @param s EIP-712 signature s
    /// @return jobId The escrow job ID for lifecycle tracking
    function depositAndCreateJob(
        PaymentIntent calldata intent,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external onlyRole(FACILITATOR_ROLE) nonReentrant returns (uint256 jobId) {
        require(block.timestamp <= intent.deadline, "Bridge: deadline expired");
        require(!nonceUsed[intent.x402Nonce], "Bridge: nonce already used");
        require(allowedTokens[intent.token], "Bridge: token not allowed");
        require(intent.payer != address(0), "Bridge: zero payer");
        require(intent.amount > 0, "Bridge: zero amount");

        // Verify payer authorized this exact payment intent (EIP-712)
        _verifyPaymentIntent(intent, v, r, s);

        // Pull tokens with balance-delta verification
        uint256 pullBalBefore = IERC20(intent.token).balanceOf(address(this));
        IERC20(intent.token).safeTransferFrom(intent.payer, address(this), intent.amount);
        uint256 received = IERC20(intent.token).balanceOf(address(this)) - pullBalBefore;
        require(received == intent.amount, "Bridge: transfer amount mismatch");

        // Create escrow job atomically
        jobId = _createEscrowJob(
            intent.x402Nonce, intent.payer, intent.token, intent.amount,
            intent.listingId, intent.seller, intent.deliveryDeadline
        );
    }

    /// @dev Verifies EIP-712 payer signature over a PaymentIntent.
    function _verifyPaymentIntent(
        PaymentIntent calldata intent,
        uint8 v, bytes32 r, bytes32 s
    ) internal view {
        bytes32 structHash = keccak256(abi.encode(
            PAYMENT_INTENT_TYPEHASH,
            intent.x402Nonce, intent.token, intent.amount,
            intent.listingId, intent.seller, intent.deadline, intent.deliveryDeadline
        ));
        address signer = _hashTypedDataV4(structHash).recover(v, r, s);
        require(signer == intent.payer, "Bridge: invalid payer signature");
    }

    /// @dev Executes EIP-3009 receiveWithAuthorization with balance-delta verification.
    ///      Uses receiveWithAuthorization instead of transferWithAuthorization because:
    ///        - receiveWithAuthorization restricts the caller to the \`to\` address (this contract)
    ///        - This prevents front-running: third parties cannot execute the transfer first
    ///        - USDC on Base supports receiveWithAuthorization per the EIP-3009 spec
    ///      Isolated into its own function to avoid stack-too-deep in depositWithAuthorization.
    function _executeERC3009Transfer(
        ERC3009Auth calldata auth,
        uint8 v, bytes32 r, bytes32 s
    ) internal {
        uint256 balBefore = IERC20(auth.token).balanceOf(address(this));
        IERC3009(auth.token).receiveWithAuthorization(
            auth.from, address(this), auth.amount,
            auth.validAfter, auth.validBefore, auth.eip3009Nonce,
            v, r, s
        );
        uint256 received = IERC20(auth.token).balanceOf(address(this)) - balBefore;
        require(received >= auth.amount, "Bridge: transfer shortfall");
    }

    /// @dev Shared escrow job creation logic. Tokens must already be on the bridge.
    function _createEscrowJob(
        bytes32 x402Nonce,
        address payerAddr,
        address token,
        uint256 amount,
        uint256 listingId,
        address seller,
        uint256 deliveryDeadline
    ) internal returns (uint256 jobId) {
        nonceUsed[x402Nonce] = true;
        totalEscrowReserves[token] += amount;

        uint256 escrowBalBefore = IERC20(token).balanceOf(address(this));
        IERC20(token).forceApprove(address(escrow), 0);
        IERC20(token).forceApprove(address(escrow), amount);
        jobId = escrow.createJob(listingId, seller, amount, token, deliveryDeadline);
        uint256 escrowBalAfter = IERC20(token).balanceOf(address(this));
        require(escrowBalBefore - escrowBalAfter == amount, "Bridge: escrow funding mismatch");

        // Solvency: bridge must hold enough to cover all tracked obligations.
        uint256 totalObligations = totalLiabilities[token] + unbookedResolvedReserves[token];
        require(escrowBalAfter >= totalObligations, "Bridge: escrow depleted obligations");

        // V-002 FIX: Reject if bridge holds untracked funds (resolved refunds not yet booked).
        // After an atomic deposit+escrow, the bridge balance should equal tracked obligations.
        // Any excess means EscrowEngine returned dispute refunds that haven't been recorded
        // via recordResolvedRefund(). Without this check, those refund tokens could be spent
        // funding new jobs, making earlier payers' refunds unclaimable.
        require(escrowBalAfter <= totalObligations, "Bridge: unbooked refunds, call recordResolvedRefund");

        IEscrowEngine.Job memory job = escrow.getJob(jobId);
        require(job.buyer == address(this), "Bridge: buyer mismatch");
        require(job.token == token, "Bridge: token mismatch");
        require(job.amount == amount, "Bridge: amount mismatch");

        paymentToJob[x402Nonce] = jobId;
        jobPayer[jobId] = payerAddr;
        jobToken[jobId] = token;
        jobEscrowReserve[jobId] = amount;

        // Set the real payer in EscrowEngine so slashed stake goes to the real payer
        escrow.setJobPayer(jobId, payerAddr);

        emit EscrowedJobCreated(x402Nonce, jobId, payerAddr, seller, amount, token);
    }

    // ─── Payer Lifecycle Actions ─────────────────────────────────────────────

    /// @notice Payer confirms delivery (proxied through bridge since bridge is escrow buyer)
    /// @param jobId The escrow job ID
    function confirmDelivery(uint256 jobId) external nonReentrant {
        require(msg.sender == jobPayer[jobId], "Bridge: not payer");
        escrow.confirmDelivery(jobId);
        emit DeliveryConfirmedByPayer(jobId, msg.sender);
    }

    /// @notice Payer raises dispute (proxied through bridge since bridge is escrow buyer)
    /// @param jobId The escrow job ID
    /// @param evidenceURI IPFS/Arweave URI pointing to dispute evidence
    function initiateDispute(uint256 jobId, string calldata evidenceURI) external nonReentrant {
        require(msg.sender == jobPayer[jobId], "Bridge: not payer");
        escrow.initiateDispute(jobId, evidenceURI);
        emit DisputeInitiatedByPayer(jobId, msg.sender);
    }

    /// @notice Payer cancels job after delivery timeout (proxied through bridge since bridge is escrow buyer)
    /// @param jobId The escrow job ID
    function cancelJob(uint256 jobId) external nonReentrant {
        require(msg.sender == jobPayer[jobId], "Bridge: not payer");
        address token = jobToken[jobId];

        uint256 refundAmount = escrow.cancelJob(jobId);

        // Clear escrow reserve — funds returned from EscrowEngine to bridge
        uint256 reserve = jobEscrowReserve[jobId];
        if (reserve > 0) {
            totalEscrowReserves[token] -= reserve;
            delete jobEscrowReserve[jobId];
        }

        // Forward cancellation refund directly to payer
        if (refundAmount > 0) {
            IERC20(token).safeTransfer(msg.sender, refundAmount);
        }

        emit JobCancelledByPayer(jobId, msg.sender);
    }

    // ─── Unbooked Refund Tracking ───────────────────────────────────────────

    /// @notice Permissionless: record a resolved job's refund as unbooked.
    ///         Must be called BEFORE creating a new job if there are resolved jobs
    ///         with refunds not yet booked. This ensures resolved refund funds cannot
    ///         be reused to fund new jobs (preventing cross-user theft).
    /// @param jobId The escrow job ID that has resolved with a refund
    function recordResolvedRefund(uint256 jobId) external {
        require(jobPayer[jobId] != address(0), "Bridge: unknown job");
        require(!jobHasUnbookedRefund[jobId], "Bridge: already recorded");
        require(!refundClaimed[jobId], "Bridge: already claimed");

        // Compute refund from on-chain state
        uint256 refund = _computeRefundFromChain(jobId);
        require(refund > 0, "Bridge: no refund owed");

        address token = jobToken[jobId];

        // Clear escrow reserve - refund has come back from EscrowEngine
        uint256 reserve = jobEscrowReserve[jobId];
        if (reserve > 0) {
            totalEscrowReserves[token] -= reserve;
            delete jobEscrowReserve[jobId];
        }

        // Track as unbooked resolved reserve
        unbookedResolvedReserves[token] += refund;
        jobHasUnbookedRefund[jobId] = true;

        emit UnbookedRefundRecorded(jobId, token, refund);
    }

    // ─── Refund Registration & Claiming ──────────────────────────────────────

    /// @notice Facilitator pre-registers a refund credit after dispute resolution.
    ///         Optional fast-path — payers can also claim permissionlessly via on-chain state.
    ///         The amount is validated against the on-chain dispute ruling to prevent overpayment.
    /// @param jobId The escrow job ID
    /// @param amount The refund amount (must match on-chain dispute ruling exactly)
    function registerRefund(uint256 jobId, uint256 amount) external onlyRole(FACILITATOR_ROLE) {
        require(jobRefundCredit[jobId] == 0, "Bridge: refund already registered");
        require(jobPayer[jobId] != address(0), "Bridge: unknown job");
        require(amount > 0, "Bridge: zero refund");

        // Validate amount matches on-chain dispute ruling — prevents facilitator overpayment.
        // _computeRefundFromChain checks job.status == Resolved internally.
        uint256 expected = _computeRefundFromChain(jobId);
        require(amount == expected, "Bridge: amount != on-chain refund");

        address token = jobToken[jobId];

        // Convert escrow reserve into explicit refund credit (prevents double-counting)
        uint256 reserve = jobEscrowReserve[jobId];
        if (reserve > 0) {
            totalEscrowReserves[token] -= reserve;
            delete jobEscrowReserve[jobId];
        }

        // Clear any unbooked resolved reserve if it was recorded
        if (jobHasUnbookedRefund[jobId]) {
            unbookedResolvedReserves[token] -= amount;
            delete jobHasUnbookedRefund[jobId];
        }

        // Reserve funds via liabilities — check only against on-bridge obligations.
        // Note: totalEscrowReserves excluded — those funds are held by EscrowEngine, not here.
        // Include unbookedResolvedReserves in the check.
        uint256 totalObligations = totalLiabilities[token] + unbookedResolvedReserves[token] + amount;
        require(
            IERC20(token).balanceOf(address(this)) >= totalObligations,
            "Bridge: insufficient balance for refund"
        );
        totalLiabilities[token] = totalLiabilities[token] + amount;
        jobRefundCredit[jobId] = amount;

        emit RefundRegistered(jobId, amount);
    }

    /// @notice Eagerly book a resolved job's refund credit into totalLiabilities.
    ///         Permissionless — anyone can call (keepers, facilitators, payers) to ensure
    ///         resolved refund tokens are tracked as liabilities before the payer claims.
    ///         This prevents cross-user theft from pooled balances: once booked, the credit
    ///         is included in solvency checks for all subsequent operations.
    /// @param jobId The escrow job ID
    function bookRefundCredit(uint256 jobId) external {
        require(jobPayer[jobId] != address(0), "Bridge: unknown job");
        require(jobRefundCredit[jobId] == 0, "Bridge: credit already booked");
        require(!refundClaimed[jobId], "Bridge: already claimed");

        address token = jobToken[jobId];

        // Clear escrow reserve — convert from "potential return" to explicit liability
        uint256 reserve = jobEscrowReserve[jobId];
        if (reserve > 0) {
            totalEscrowReserves[token] -= reserve;
            delete jobEscrowReserve[jobId];
        }

        // Clear any unbooked resolved reserve
        if (jobHasUnbookedRefund[jobId]) {
            // We need to compute the credit first to know how much to unbook
            uint256 pendingCredit = _computeRefundFromChain(jobId);
            if (pendingCredit > 0 && unbookedResolvedReserves[token] >= pendingCredit) {
                unbookedResolvedReserves[token] -= pendingCredit;
            }
            delete jobHasUnbookedRefund[jobId];
        }

        // Compute credit from on-chain dispute state
        uint256 credit = _computeRefundFromChain(jobId);
        require(credit > 0, "Bridge: no refund owed");

        // Cap at escrowed amount (defense-in-depth)
        IEscrowEngine.Job memory job = escrow.getJob(jobId);
        require(credit <= job.amount, "Bridge: refund exceeds escrowed amount");

        // Verify bridge can back this new liability
        // Include unbookedResolvedReserves in the check
        uint256 totalObligations = totalLiabilities[token] + unbookedResolvedReserves[token] + credit;
        require(
            IERC20(token).balanceOf(address(this)) >= totalObligations,
            "Bridge: insufficient balance for refund"
        );

        totalLiabilities[token] = totalLiabilities[token] + credit;
        jobRefundCredit[jobId] = credit;

        emit RefundRegistered(jobId, credit);
    }

    /// @notice Payer claims their refund for a resolved dispute.
    ///         Works three ways:
    ///           1. If facilitator pre-registered via registerRefund — uses stored credit
    ///           2. If booked via bookRefundCredit — uses stored credit
    ///           3. If no credit registered — computes refund from on-chain dispute ruling
    ///         All paths are permissionless for the payer.
    /// @param jobId The escrow job ID
    function claimEscrowRefund(uint256 jobId) external nonReentrant {
        require(msg.sender == jobPayer[jobId], "Bridge: not payer");
        require(!refundClaimed[jobId], "Bridge: already claimed");

        uint256 credit = jobRefundCredit[jobId];
        address token = jobToken[jobId];

        // Clear escrow reserve — refund is being processed now
        // (reverts undo this if the claim ultimately fails)
        uint256 reserve = jobEscrowReserve[jobId];
        if (reserve > 0) {
            totalEscrowReserves[token] -= reserve;
            delete jobEscrowReserve[jobId];
        }

        // Clear any unbooked resolved reserve
        if (jobHasUnbookedRefund[jobId]) {
            if (credit > 0 && unbookedResolvedReserves[token] >= credit) {
                unbookedResolvedReserves[token] -= credit;
            } else if (credit == 0) {
                // Will compute below
                uint256 pendingCredit = _computeRefundFromChain(jobId);
                if (pendingCredit > 0 && unbookedResolvedReserves[token] >= pendingCredit) {
                    unbookedResolvedReserves[token] -= pendingCredit;
                }
            }
            delete jobHasUnbookedRefund[jobId];
        }

        if (credit == 0) {
            // Permissionless path: compute refund from on-chain dispute state
            credit = _computeRefundFromChain(jobId);
            require(credit > 0, "Bridge: no refund owed");

            totalLiabilities[token] += credit;
            jobRefundCredit[jobId] = credit;
        }

        // Cap: refund can never exceed the escrow job's recorded amount
        IEscrowEngine.Job memory job = escrow.getJob(jobId);
        require(credit <= job.amount, "Bridge: refund exceeds escrowed amount");

        // Verify bridge can cover all on-bridge liabilities (which includes the credit).
        // Note: totalEscrowReserves excluded — those funds are held by EscrowEngine, not here.
        // Include unbookedResolvedReserves in the check.
        uint256 totalObligations = totalLiabilities[token] + unbookedResolvedReserves[token];
        require(
            IERC20(token).balanceOf(address(this)) >= totalObligations,
            "Bridge: insufficient balance for refund"
        );

        refundClaimed[jobId] = true;

        // Reduce liabilities before transfer (CEI)
        totalLiabilities[token] -= credit;

        IERC20(token).safeTransfer(msg.sender, credit);
        emit EscrowRefundClaimed(jobId, msg.sender, credit);
    }

    /// @notice Computes the exact refund amount from on-chain dispute ruling.
    /// @dev Mirrors EscrowEngine payout logic exactly. EscrowEngine is non-upgradeable
    ///      (deployed without proxy), so this logic cannot diverge from the escrow's actual
    ///      refund transfers. The formulas are verified against EscrowEngine source:
    ///        BuyerWins → job.amount (full refund, no fees)  [EscrowEngine L211-214]
    ///        Draw      → job.amount / 2 - job.fee / 2       [EscrowEngine L230-237]
    ///        SellerWins/Pending → 0
    ///      registerRefund() validates facilitator-supplied amounts against this function.
    ///      Defense-in-depth: callers cap credit at job.amount and verify full solvency.
    function _computeRefundFromChain(uint256 jobId) internal view returns (uint256) {
        IEscrowEngine.Job memory job = escrow.getJob(jobId);
        require(
            job.status == IEscrowEngine.JobStatus.Resolved,
            "Bridge: job not resolved"
        );

        uint256 disputeId = escrow.getJobDisputeId(jobId);
        IDisputeArbitration.Dispute memory d = disputeArbitration.getDispute(disputeId);

        if (d.ruling == IDisputeArbitration.Ruling.BuyerWins) {
            return job.amount;
        } else if (d.ruling == IDisputeArbitration.Ruling.Draw) {
            uint256 half = job.amount / 2;
            uint256 halfFee = job.fee / 2;
            // Saturate at zero — fee can exceed amount for micro-payments
            return half > halfFee ? half - halfFee : 0;
        } else {
            return 0; // SellerWins or Pending — no refund to buyer
        }
    }

    // ─── Admin ───────────────────────────────────────────────────────────────

    /// @notice Recover tokens accidentally sent to this contract (admin only).
    ///         Cannot withdraw funds reserved for refund credits or escrow reserves.
    /// @dev totalEscrowReserves and unbookedResolvedReserves are intentionally included —
    ///      conservative guard that prevents admin from draining tokens that may return from
    ///      escrow (buyerWins/draw) or are owed to payers as unbooked refunds.
    ///      Admin can use releaseJobReserve() for terminal jobs to free up reserves.
    /// @param token ERC-20 token to recover
    /// @param to Recipient address
    /// @param amount Amount to recover
    function recoverTokens(
        address token,
        address to,
        uint256 amount
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 balance = IERC20(token).balanceOf(address(this));
        uint256 reserved = totalLiabilities[token] + totalEscrowReserves[token] + unbookedResolvedReserves[token];
        require(balance >= reserved + amount, "Bridge: would drain reserved funds");
        IERC20(token).safeTransfer(to, amount);
    }

    // ─── Stranded Deposit Recovery ──────────────────────────────────────────

    /// @notice Recover funds stranded on the bridge from a front-run EIP-3009 authorization.
    ///         If an attacker calls transferWithAuthorization on the token contract directly
    ///         (before the bridge's receiveWithAuthorization executes), funds land on the bridge
    ///         without an escrow job being created. This function lets the facilitator return
    ///         those funds to the payer using the payer's EIP-712 PaymentIntent signature as proof.
    /// @dev Requires the payer's PaymentIntent signature to prevent unauthorized drains.
    ///      Only callable by facilitator (who observed the front-run). The deadline in the
    ///      PaymentIntent is enforced — recovery should happen promptly.
    /// @param intent PaymentIntent proving the payer authorized this payment
    /// @param intentV EIP-712 ECDSA signature v
    /// @param intentR EIP-712 ECDSA signature r
    /// @param intentS EIP-712 ECDSA signature s
    function recoverStrandedDeposit(
        PaymentIntent calldata intent,
        uint8 intentV, bytes32 intentR, bytes32 intentS
    ) external onlyRole(FACILITATOR_ROLE) nonReentrant {
        require(block.timestamp <= intent.deadline, "Bridge: deadline expired");
        require(!nonceUsed[intent.x402Nonce], "Bridge: nonce already used");
        require(allowedTokens[intent.token], "Bridge: token not allowed");
        require(intent.payer != address(0), "Bridge: zero payer");
        require(intent.amount > 0, "Bridge: zero amount");

        // Verify payer authorized this payment intent
        _verifyPaymentIntent(intent, intentV, intentR, intentS);

        // Burn nonce — prevents using this intent for a job or double-recovery
        nonceUsed[intent.x402Nonce] = true;

        // Ensure bridge has sufficient funds to cover on-bridge liabilities + this recovery.
        // Note: totalEscrowReserves is intentionally EXCLUDED — those funds are held by
        // EscrowEngine, not on this contract. Including them would make recovery impossible
        // whenever active escrow jobs exist for the same token.
        // unbookedResolvedReserves IS included to protect payer refunds.
        address token = intent.token;
        uint256 balance = IERC20(token).balanceOf(address(this));
        uint256 totalObligations = totalLiabilities[token] + unbookedResolvedReserves[token] + intent.amount;
        require(balance >= totalObligations, "Bridge: insufficient balance");

        IERC20(token).safeTransfer(intent.payer, intent.amount);
        emit StrandedDepositRecovered(intent.payer, token, intent.amount, intent.x402Nonce);
    }

    // ─── Escrow Reserve Management ──────────────────────────────────────────

    /// @notice Release escrow reserve for a terminal job where no refund is owed.
    ///         Permissionless — anyone can call for cleanup once the job is finalized.
    ///         For Confirmed/Released jobs (no dispute) or Resolved jobs where seller won.
    /// @param jobId The escrow job ID
    function releaseJobReserve(uint256 jobId) external {
        uint256 reserve = jobEscrowReserve[jobId];
        require(reserve > 0, "Bridge: no reserve");

        IEscrowEngine.Job memory job = escrow.getJob(jobId);

        if (job.status == IEscrowEngine.JobStatus.Confirmed ||
            job.status == IEscrowEngine.JobStatus.Released) {
            // Job completed without dispute — no refund possible
        } else if (job.status == IEscrowEngine.JobStatus.Resolved) {
            // Dispute resolved — only release if refund was claimed or no refund owed
            if (!refundClaimed[jobId]) {
                uint256 refundOwed = _computeRefundFromChain(jobId);
                require(refundOwed == 0, "Bridge: payer refund still claimable");
            }
        } else {
            revert("Bridge: job still active");
        }

        address token = jobToken[jobId];
        totalEscrowReserves[token] -= reserve;
        delete jobEscrowReserve[jobId];

        emit EscrowReserveReleased(jobId, token, reserve);
    }
}`,
  },
  {
    name: "X402CreditFacility",
    fileName: "X402CreditFacility.sol",
    description:
      "Credit-funded buyer proxy for x402 agent payments with reputation-tiered credit lines, collateral, and pool-based liquidity.",
    lines: 602,
    source: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IX402CreditFacility.sol";
import "./interfaces/IEscrowEngine.sol";
import "./interfaces/IDisputeArbitration.sol";
import "./interfaces/IReputationSystem.sol";
import "./interfaces/IStakingManager.sol";
import "./interfaces/ISybilGuard.sol";

/// @title X402CreditFacility
/// @notice Credit-funded buyer proxy for x402 agent payments. Agents with good reputation
///         but no LOB can draw from a lending pool to create escrow jobs instantly.
///         Architecturally parallel to X402EscrowBridge but backed by pooled liquidity
///         instead of direct payer deposits. LOB-only for v1.
/// @dev Acts as buyer proxy on EscrowEngine (facility becomes msg.sender / buyer).
///      Credit tiers mirror LoanEngine: Silver/Gold/Platinum with matching limits,
///      interest rates, and collateral requirements. Pool managers provide liquidity,
///      agents open credit lines, draw against them to create escrow jobs, and repay
///      principal + interest + protocol fee after service delivery.
contract X402CreditFacility is IX402CreditFacility, Initializable, UUPSUpgradeable, OwnableUpgradeable, AccessControlUpgradeable, ReentrancyGuardUpgradeable, PausableUpgradeable {
    using SafeERC20 for IERC20;

    // ── Roles ───────────────────────────────────────────────────────────
    bytes32 public constant FACILITATOR_ROLE = keccak256("FACILITATOR_ROLE");
    bytes32 public constant POOL_MANAGER_ROLE = keccak256("POOL_MANAGER_ROLE");

    // ── Tier credit parameters (mirrors LoanEngine) ─────────────────────
    uint256 public constant SILVER_CREDIT_LIMIT = 500 ether;
    uint256 public constant GOLD_CREDIT_LIMIT = 2_500 ether;
    uint256 public constant PLATINUM_CREDIT_LIMIT = 10_000 ether;

    uint256 public constant SILVER_INTEREST_BPS = 800;    // 8% annual
    uint256 public constant GOLD_INTEREST_BPS = 500;      // 5% annual
    uint256 public constant PLATINUM_INTEREST_BPS = 300;   // 3% annual

    uint256 public constant SILVER_COLLATERAL_BPS = 5000;  // 50%
    uint256 public constant GOLD_COLLATERAL_BPS = 4000;    // 40%
    uint256 public constant PLATINUM_COLLATERAL_BPS = 2500;  // 25% minimum floor

    // ── Anti-farming ────────────────────────────────────────────────────
    uint256 public constant MIN_AGENT_STAKE = 1_000 ether;     // must stake 1k LOB to open credit

    // ── Protocol parameters ─────────────────────────────────────────────
    uint256 public constant PROTOCOL_FEE_BPS = 50;            // 0.5%
    uint256 public constant REPAYMENT_DEADLINE = 30 days;
    uint256 public constant GRACE_PERIOD = 48 hours;
    uint256 public constant MAX_DRAWS_PER_LINE = 5;
    uint256 public constant DEFAULTS_BEFORE_FREEZE = 2;
    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant DAYS_PER_YEAR = 365;

    // ── Immutables (now regular state variables for upgradeability) ────
    IERC20 public lobToken;
    IEscrowEngine public escrowEngine;
    IDisputeArbitration public disputeArbitration;
    IReputationSystem public reputationSystem;
    IStakingManager public stakingManager;
    ISybilGuard public sybilGuard;
    address public treasury;

    // ── Pool accounting ─────────────────────────────────────────────────
    uint256 public totalPoolBalance;
    uint256 public totalOutstanding;
    uint256 public totalCollateralHeld;

    // ── State ───────────────────────────────────────────────────────────
    uint256 private _nextDrawId = 1;
    mapping(address => CreditLine) private _creditLines;
    mapping(uint256 => CreditDraw) private _draws;
    mapping(address => uint256[]) private _activeDrawIds;
    mapping(uint256 => uint256) public escrowJobToDraw;  // escrowJobId → drawId

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _lobToken,
        address _escrowEngine,
        address _disputeArbitration,
        address _reputationSystem,
        address _stakingManager,
        address _sybilGuard,
        address _treasury,
        address _owner
    ) public virtual initializer {
        require(_lobToken != address(0), "CreditFacility: zero lobToken");
        require(_escrowEngine != address(0), "CreditFacility: zero escrowEngine");
        require(_disputeArbitration != address(0), "CreditFacility: zero disputeArbitration");
        require(_reputationSystem != address(0), "CreditFacility: zero reputationSystem");
        require(_stakingManager != address(0), "CreditFacility: zero stakingManager");
        require(_sybilGuard != address(0), "CreditFacility: zero sybilGuard");
        require(_treasury != address(0), "CreditFacility: zero treasury");

        __Ownable_init(_owner);
        __UUPSUpgradeable_init();
        __AccessControl_init();
        __ReentrancyGuard_init();
        __Pausable_init();

        lobToken = IERC20(_lobToken);
        escrowEngine = IEscrowEngine(_escrowEngine);
        disputeArbitration = IDisputeArbitration(_disputeArbitration);
        reputationSystem = IReputationSystem(_reputationSystem);
        stakingManager = IStakingManager(_stakingManager);
        sybilGuard = ISybilGuard(_sybilGuard);
        treasury = _treasury;

        _grantRole(DEFAULT_ADMIN_ROLE, _owner);

        _nextDrawId = 1;
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // ══════════════════════════════════════════════════════════════════════
    //  CREDIT LINE MANAGEMENT
    // ══════════════════════════════════════════════════════════════════════

    /// @notice Open a credit line based on agent's reputation tier.
    ///         Requires Silver+ reputation. Collateral is deposited upfront.
    function openCreditLine() external nonReentrant whenNotPaused {
        require(!sybilGuard.checkBanned(msg.sender), "CreditFacility: agent banned");
        require(_creditLines[msg.sender].agent == address(0), "CreditFacility: line already exists");

        (, IReputationSystem.ReputationTier tier) = reputationSystem.getScore(msg.sender);
        require(tier >= IReputationSystem.ReputationTier.Silver, "CreditFacility: insufficient reputation");

        // Require minimum protocol stake to prevent Sybil credit farming
        require(stakingManager.getStake(msg.sender) >= MIN_AGENT_STAKE, "CreditFacility: insufficient stake");

        uint256 creditLimit = _creditLimitForTier(tier);
        uint256 interestRate = _interestRateForTier(tier);
        uint256 collateralBps = _collateralBpsForTier(tier);
        uint256 collateral = (creditLimit * collateralBps) / BPS_DENOMINATOR;

        if (collateral > 0) {
            lobToken.safeTransferFrom(msg.sender, address(this), collateral);
            totalCollateralHeld += collateral;
        }

        // Lock agent's stake to prevent unstake-before-liquidation evasion
        stakingManager.lockStake(msg.sender, creditLimit);

        _creditLines[msg.sender] = CreditLine({
            agent: msg.sender,
            creditLimit: creditLimit,
            totalDrawn: 0,
            totalRepaid: 0,
            interestRateBps: interestRate,
            collateralDeposited: collateral,
            status: CreditLineStatus.Active,
            openedAt: block.timestamp,
            defaults: 0,
            activeDraws: 0
        });

        emit CreditLineOpened(msg.sender, creditLimit, collateral, interestRate);
    }

    /// @notice Close a credit line. All draws must be repaid. Returns collateral.
    function closeCreditLine() external nonReentrant {
        CreditLine storage line = _creditLines[msg.sender];
        require(line.agent != address(0), "CreditFacility: no credit line");
        require(line.activeDraws == 0, "CreditFacility: outstanding draws");
        require(line.status != CreditLineStatus.Closed, "CreditFacility: already closed");

        // Unlock agent's stake
        stakingManager.unlockStake(msg.sender, line.creditLimit);

        uint256 collateral = line.collateralDeposited;
        line.status = CreditLineStatus.Closed;
        line.collateralDeposited = 0;

        if (collateral > 0) {
            totalCollateralHeld -= collateral;
            lobToken.safeTransfer(msg.sender, collateral);
        }

        emit CreditLineClosed(msg.sender, collateral);
    }

    // ══════════════════════════════════════════════════════════════════════
    //  CREDIT DRAW + ESCROW CREATION
    // ══════════════════════════════════════════════════════════════════════

    /// @notice Agent draws credit and creates an escrow job directly.
    function drawCreditAndCreateEscrow(
        uint256 listingId,
        address seller,
        uint256 amount
    ) external nonReentrant whenNotPaused returns (uint256 drawId) {
        return _drawCredit(msg.sender, listingId, seller, amount);
    }

    /// @notice Facilitator draws credit on agent's behalf (x402 integration path).
    function drawCreditForAgent(
        address agent,
        uint256 listingId,
        address seller,
        uint256 amount
    ) external onlyRole(FACILITATOR_ROLE) nonReentrant whenNotPaused returns (uint256 drawId) {
        return _drawCredit(agent, listingId, seller, amount);
    }

    function _drawCredit(
        address agent,
        uint256 listingId,
        address seller,
        uint256 amount
    ) internal returns (uint256 drawId) {
        require(amount > 0, "CreditFacility: zero amount");
        require(seller != agent, "CreditFacility: self-dealing");
        require(!sybilGuard.checkBanned(agent), "CreditFacility: agent banned");
        CreditLine storage line = _creditLines[agent];
        require(line.agent != address(0), "CreditFacility: no credit line");
        require(line.status == CreditLineStatus.Active, "CreditFacility: line not active");
        require(line.activeDraws < MAX_DRAWS_PER_LINE, "CreditFacility: max draws reached");

        uint256 currentOutstanding = line.totalDrawn - line.totalRepaid;
        require(currentOutstanding + amount <= line.creditLimit, "CreditFacility: exceeds credit limit");
        require(totalPoolBalance >= totalOutstanding + amount, "CreditFacility: insufficient pool liquidity");

        // Compute interest (simple, prorated over 30-day repayment deadline)
        uint256 interest = (amount * line.interestRateBps * REPAYMENT_DEADLINE) / (BPS_DENOMINATOR * DAYS_PER_YEAR * 1 days);
        uint256 fee = (amount * PROTOCOL_FEE_BPS) / BPS_DENOMINATOR;

        // Approve and create escrow job — facility becomes the buyer
        lobToken.forceApprove(address(escrowEngine), 0);
        lobToken.forceApprove(address(escrowEngine), amount);
        uint256 escrowJobId = escrowEngine.createJob(listingId, seller, amount, address(lobToken), REPAYMENT_DEADLINE);
        // Set the real payer so slashed stake goes to the agent, not the facility
        escrowEngine.setJobPayer(escrowJobId, agent);

        drawId = _nextDrawId++;

        _draws[drawId] = CreditDraw({
            id: drawId,
            creditLineId: 0, // not used — keyed by agent address
            agent: agent,
            amount: amount,
            interestAccrued: interest,
            protocolFee: fee,
            escrowJobId: escrowJobId,
            drawnAt: block.timestamp,
            repaidAt: 0,
            liquidated: false,
            refundCredit: 0
        });

        escrowJobToDraw[escrowJobId] = drawId;
        _activeDrawIds[agent].push(drawId);
        line.totalDrawn += amount;
        line.activeDraws++;
        totalOutstanding += amount;

        emit CreditDrawn(drawId, agent, amount, escrowJobId);
    }

    // ══════════════════════════════════════════════════════════════════════
    //  ESCROW LIFECYCLE PROXY
    // ══════════════════════════════════════════════════════════════════════

    /// @notice Agent confirms delivery (proxied through facility since facility is buyer).
    function confirmDelivery(uint256 escrowJobId) external nonReentrant {
        uint256 drawId = escrowJobToDraw[escrowJobId];
        require(drawId != 0, "CreditFacility: unknown job");
        require(_draws[drawId].agent == msg.sender, "CreditFacility: not agent");
        escrowEngine.confirmDelivery(escrowJobId);
    }

    /// @notice Agent initiates dispute (proxied through facility since facility is buyer).
    function initiateDispute(uint256 escrowJobId, string calldata evidenceURI) external nonReentrant {
        uint256 drawId = escrowJobToDraw[escrowJobId];
        require(drawId != 0, "CreditFacility: unknown job");
        require(_draws[drawId].agent == msg.sender, "CreditFacility: not agent");
        escrowEngine.initiateDispute(escrowJobId, evidenceURI);
    }

    /// @notice V-002: Agent cancels job after delivery timeout (proxied through facility since facility is buyer).
    function cancelJob(uint256 escrowJobId) external nonReentrant {
        uint256 drawId = escrowJobToDraw[escrowJobId];
        require(drawId != 0, "CreditFacility: unknown job");
        require(_draws[drawId].agent == msg.sender, "CreditFacility: not agent");

        uint256 refundAmount = escrowEngine.cancelJob(escrowJobId);

        CreditDraw storage draw = _draws[drawId];
        if (refundAmount > 0 && draw.refundCredit == 0) {
            uint256 credit = refundAmount > draw.amount ? draw.amount : refundAmount;
            draw.refundCredit = credit;
            emit RefundCredited(drawId, escrowJobId, credit);
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    //  REPAYMENT
    // ══════════════════════════════════════════════════════════════════════

    /// @notice Repay a draw. Anyone can repay on behalf of the agent.
    ///         Total owed = (principal - refundCredit) + interest + protocolFee.
    function repayDraw(uint256 drawId) external nonReentrant whenNotPaused {
        CreditDraw storage draw = _draws[drawId];
        require(draw.id != 0, "CreditFacility: draw not found");
        require(draw.repaidAt == 0, "CreditFacility: already repaid");
        require(!draw.liquidated, "CreditFacility: already liquidated");

        uint256 principalOwed = draw.amount > draw.refundCredit ? draw.amount - draw.refundCredit : 0;
        uint256 totalOwed = principalOwed + draw.interestAccrued + draw.protocolFee;

        lobToken.safeTransferFrom(msg.sender, address(this), totalOwed);

        draw.repaidAt = block.timestamp;

        // Fee to treasury
        if (draw.protocolFee > 0) {
            lobToken.safeTransfer(treasury, draw.protocolFee);
        }

        // Interest grows the pool
        totalPoolBalance += draw.interestAccrued;
        totalOutstanding -= draw.amount;           // full original amount, not reduced by refund

        CreditLine storage line = _creditLines[draw.agent];
        line.totalRepaid += draw.amount;
        line.activeDraws--;
        _removeDrawFromActive(draw.agent, drawId);

        emit DrawRepaid(drawId, draw.agent, totalOwed);
    }

    // ══════════════════════════════════════════════════════════════════════
    //  DISPUTE REFUNDS
    // ══════════════════════════════════════════════════════════════════════

    /// @notice Claim escrow refund after dispute resolution. Credits refund against draw.
    ///         BuyerWins = full refund → agent owes only interest + fee.
    ///         Draw = half refund → agent owes remainder + interest + fee.
    ///         SellerWins = no refund → agent owes full draw.
    function claimEscrowRefund(uint256 escrowJobId) external nonReentrant {
        uint256 drawId = escrowJobToDraw[escrowJobId];
        require(drawId != 0, "CreditFacility: unknown job");

        CreditDraw storage draw = _draws[drawId];
        require(draw.refundCredit == 0, "CreditFacility: refund already claimed");
        require(!draw.liquidated, "CreditFacility: already liquidated");

        uint256 refund = _computeRefundFromChain(escrowJobId);
        require(refund > 0, "CreditFacility: no refund owed");

        // Cap at draw amount
        if (refund > draw.amount) {
            refund = draw.amount;
        }

        draw.refundCredit = refund;

        // Refund goes back to pool (it was pool capital)
        // totalOutstanding stays the same — draw is still open until repaid
        // The refund reduces what the agent owes on repayment

        emit RefundCredited(drawId, escrowJobId, refund);
    }

    // ══════════════════════════════════════════════════════════════════════
    //  LIQUIDATION
    // ══════════════════════════════════════════════════════════════════════

    /// @notice Liquidate a draw past its repayment deadline + grace period.
    ///         Escrow job must be in a terminal state (can't liquidate while service in progress).
    function liquidateDraw(uint256 drawId) external nonReentrant {
        CreditDraw storage draw = _draws[drawId];
        require(draw.id != 0, "CreditFacility: draw not found");
        require(draw.repaidAt == 0, "CreditFacility: already repaid");
        require(!draw.liquidated, "CreditFacility: already liquidated");
        require(
            block.timestamp > draw.drawnAt + REPAYMENT_DEADLINE + GRACE_PERIOD,
            "CreditFacility: deadline not passed"
        );

        // Escrow job must be terminal — can't liquidate while service in progress
        IEscrowEngine.Job memory job = escrowEngine.getJob(draw.escrowJobId);
        require(
            job.status == IEscrowEngine.JobStatus.Confirmed ||
            job.status == IEscrowEngine.JobStatus.Released ||
            job.status == IEscrowEngine.JobStatus.Resolved,
            "CreditFacility: escrow still active"
        );

        draw.liquidated = true;

        CreditLine storage line = _creditLines[draw.agent];

        // Compute effective principal owed (subtract escrow refund if already received)
        uint256 principalOwed = draw.amount;
        if (draw.refundCredit > 0) {
            principalOwed = draw.amount > draw.refundCredit ? draw.amount - draw.refundCredit : 0;
        } else if (job.status == IEscrowEngine.JobStatus.Resolved) {
            // Check if escrow has returned funds - compute refund from chain
            uint256 escrowRefund = _computeRefundFromChain(draw.escrowJobId);
            if (escrowRefund > 0) {
                principalOwed = draw.amount > escrowRefund ? draw.amount - escrowRefund : 0;
            }
        }

        // Slash reputation
        reputationSystem.recordDispute(draw.agent, false);

        // Best-effort stake slash (only on actual unpaid principal)
        uint256 stakeSlashed = 0;
        if (principalOwed > 0) {
            uint256 staked = stakingManager.getStake(draw.agent);
            if (staked > 0) {
                uint256 slashTarget = principalOwed;
                if (slashTarget > staked) {
                    slashTarget = staked;
                }
                try stakingManager.slash(draw.agent, slashTarget, address(this)) {
                    stakeSlashed = slashTarget;
                    totalPoolBalance += slashTarget; // recovered funds go to pool
                } catch {
                    // Best-effort
                }
            }
        }

        // Seize proportional collateral (only on actual unpaid principal)
        uint256 collateralSeized = 0;
        if (principalOwed > 0 && line.collateralDeposited > 0) {
            // Proportional: (principalOwed / creditLimit) * totalCollateral
            collateralSeized = (principalOwed * line.collateralDeposited) / line.creditLimit;
            if (collateralSeized > line.collateralDeposited) {
                collateralSeized = line.collateralDeposited;
            }
            line.collateralDeposited -= collateralSeized;
            totalCollateralHeld -= collateralSeized;
            totalPoolBalance += collateralSeized; // seized collateral goes to pool
        }

        totalOutstanding -= draw.amount;

        // Write down pool for unrecovered principal to prevent phantom surplus
        uint256 totalRecovered = stakeSlashed + collateralSeized;
        if (totalRecovered < principalOwed) {
            uint256 unrecovered = principalOwed - totalRecovered;
            totalPoolBalance -= unrecovered > totalPoolBalance ? totalPoolBalance : unrecovered;
        }

        line.activeDraws--;
        line.defaults++;
        _removeDrawFromActive(draw.agent, drawId);

        // Freeze after DEFAULTS_BEFORE_FREEZE defaults
        if (line.defaults >= DEFAULTS_BEFORE_FREEZE) {
            line.status = CreditLineStatus.Frozen;
            emit CreditLineFrozen(draw.agent, line.defaults);
        }

        emit DrawLiquidated(drawId, draw.agent, collateralSeized, stakeSlashed);
    }

    // ══════════════════════════════════════════════════════════════════════
    //  POOL MANAGEMENT
    // ══════════════════════════════════════════════════════════════════════

    /// @notice Deposit LOB into the lending pool.
    function depositToPool(uint256 amount) external onlyRole(POOL_MANAGER_ROLE) nonReentrant {
        require(amount > 0, "CreditFacility: zero amount");
        lobToken.safeTransferFrom(msg.sender, address(this), amount);
        totalPoolBalance += amount;
        emit PoolDeposited(msg.sender, amount);
    }

    /// @notice Withdraw surplus LOB from the pool (above outstanding obligations).
    function withdrawFromPool(uint256 amount) external onlyRole(POOL_MANAGER_ROLE) nonReentrant {
        require(amount > 0, "CreditFacility: zero amount");
        uint256 surplus = totalPoolBalance - totalOutstanding;
        require(amount <= surplus, "CreditFacility: would drain below outstanding");
        totalPoolBalance -= amount;
        lobToken.safeTransfer(msg.sender, amount);
        emit PoolWithdrawn(msg.sender, amount);
    }

    // ══════════════════════════════════════════════════════════════════════
    //  ADMIN
    // ══════════════════════════════════════════════════════════════════════

    /// @notice Lift a frozen credit line (appeals process).
    function liftFreeze(address agent) external onlyRole(DEFAULT_ADMIN_ROLE) {
        CreditLine storage line = _creditLines[agent];
        require(line.agent != address(0), "CreditFacility: no credit line");
        require(line.status == CreditLineStatus.Frozen, "CreditFacility: not frozen");
        line.status = CreditLineStatus.Active;
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // ══════════════════════════════════════════════════════════════════════
    //  VIEW FUNCTIONS
    // ══════════════════════════════════════════════════════════════════════

    function getCreditLine(address agent) external view returns (CreditLine memory) {
        return _creditLines[agent];
    }

    function getDraw(uint256 drawId) external view returns (CreditDraw memory) {
        return _draws[drawId];
    }

    function getActiveDrawIds(address agent) external view returns (uint256[] memory) {
        return _activeDrawIds[agent];
    }

    function getAvailableCredit(address agent) external view returns (uint256) {
        CreditLine storage line = _creditLines[agent];
        if (line.agent == address(0) || line.status != CreditLineStatus.Active) return 0;
        uint256 outstanding = line.totalDrawn - line.totalRepaid;
        if (outstanding >= line.creditLimit) return 0;
        return line.creditLimit - outstanding;
    }

    function getPoolUtilization() external view returns (uint256 total, uint256 outstanding, uint256 available) {
        total = totalPoolBalance;
        outstanding = totalOutstanding;
        available = totalPoolBalance > totalOutstanding ? totalPoolBalance - totalOutstanding : 0;
    }

    // ══════════════════════════════════════════════════════════════════════
    //  INTERNAL
    // ══════════════════════════════════════════════════════════════════════

    /// @dev Compute refund from on-chain dispute ruling (mirrors X402EscrowBridge pattern).
    function _computeRefundFromChain(uint256 escrowJobId) internal view returns (uint256) {
        IEscrowEngine.Job memory job = escrowEngine.getJob(escrowJobId);
        require(
            job.status == IEscrowEngine.JobStatus.Resolved,
            "CreditFacility: job not resolved"
        );

        uint256 disputeId = escrowEngine.getJobDisputeId(escrowJobId);
        IDisputeArbitration.Dispute memory d = disputeArbitration.getDispute(disputeId);

        if (d.ruling == IDisputeArbitration.Ruling.BuyerWins) {
            return job.amount;
        } else if (d.ruling == IDisputeArbitration.Ruling.Draw) {
            uint256 half = job.amount / 2;
            uint256 halfFee = job.fee / 2;
            return half > halfFee ? half - halfFee : 0;
        } else {
            return 0;
        }
    }

    function _removeDrawFromActive(address agent, uint256 drawId) internal {
        uint256[] storage ids = _activeDrawIds[agent];
        for (uint256 i = 0; i < ids.length; i++) {
            if (ids[i] == drawId) {
                ids[i] = ids[ids.length - 1];
                ids.pop();
                break;
            }
        }
    }

    function _creditLimitForTier(IReputationSystem.ReputationTier tier) internal pure returns (uint256) {
        if (tier == IReputationSystem.ReputationTier.Platinum) return PLATINUM_CREDIT_LIMIT;
        if (tier == IReputationSystem.ReputationTier.Gold) return GOLD_CREDIT_LIMIT;
        if (tier == IReputationSystem.ReputationTier.Silver) return SILVER_CREDIT_LIMIT;
        return 0;
    }

    function _interestRateForTier(IReputationSystem.ReputationTier tier) internal pure returns (uint256) {
        if (tier == IReputationSystem.ReputationTier.Platinum) return PLATINUM_INTEREST_BPS;
        if (tier == IReputationSystem.ReputationTier.Gold) return GOLD_INTEREST_BPS;
        if (tier == IReputationSystem.ReputationTier.Silver) return SILVER_INTEREST_BPS;
        return 0;
    }

    function _collateralBpsForTier(IReputationSystem.ReputationTier tier) internal pure returns (uint256) {
        if (tier == IReputationSystem.ReputationTier.Platinum) return PLATINUM_COLLATERAL_BPS;
        if (tier == IReputationSystem.ReputationTier.Gold) return GOLD_COLLATERAL_BPS;
        if (tier == IReputationSystem.ReputationTier.Silver) return SILVER_COLLATERAL_BPS;
        return 0;
    }
}`,
  },
  {
    name: "RewardDistributor",
    fileName: "RewardDistributor.sol",
    description:
      "Pull-based reward ledger for arbitrators, watchers, and judges with per-token claimable balances and solvency tracking.",
    lines: 167,
    source: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./interfaces/IRewardDistributor.sol";

/**
 * @title RewardDistributor
 * @notice Central pull-based reward ledger for LOBSTR protocol.
 *         Arbitrators, watchers, and judges accumulate claimable balances
 *         from dispute resolutions and Sybil report adjudications.
 *         Recipients claim on their own schedule (gas efficient).
 *
 *         Funded by:
 *           - TreasuryGovernor deposits (arbitrator reward budget)
 *           - SybilGuard seizure carve-outs (watcher/judge rewards)
 */
contract RewardDistributor is
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    IRewardDistributor
{
    using SafeERC20 for IERC20;

    bytes32 public constant DISPUTE_ROLE = keccak256("DISPUTE_ROLE");
    bytes32 public constant SYBIL_GUARD_ROLE = keccak256("SYBIL_GUARD_ROLE");

    // Claimable balances: account => token => amount
    mapping(address => mapping(address => uint256)) private _claimable;

    // Outstanding liabilities per token (credited but unclaimed)
    mapping(address => uint256) private _totalLiabilities;

    // Lifetime stats
    mapping(address => uint256) public totalEarnedByAccount;
    uint256 public totalDistributed;
    uint256 public totalDeposited;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize() public initializer {
        __Ownable_init(msg.sender);
        __AccessControl_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        // Grant DEFAULT_ADMIN_ROLE to owner (can reassign and grant other roles)
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    /// @notice Credit arbitrator reward (called by DisputeArbitration after ruling)
    function creditArbitratorReward(
        address arbitrator,
        address token,
        uint256 amount
    ) external onlyRole(DISPUTE_ROLE) {
        require(arbitrator != address(0), "RewardDistributor: zero address");
        require(amount > 0, "RewardDistributor: zero amount");

        _claimable[arbitrator][token] += amount;
        _totalLiabilities[token] += amount;
        totalEarnedByAccount[arbitrator] += amount;

        emit ArbitratorRewardCredited(arbitrator, token, amount);
    }

    /// @notice Credit watcher reward (called by SybilGuard after confirmed report)
    function creditWatcherReward(
        address watcher,
        address token,
        uint256 amount
    ) external onlyRole(SYBIL_GUARD_ROLE) {
        require(watcher != address(0), "RewardDistributor: zero address");
        require(amount > 0, "RewardDistributor: zero amount");

        _claimable[watcher][token] += amount;
        _totalLiabilities[token] += amount;
        totalEarnedByAccount[watcher] += amount;

        emit WatcherRewardCredited(watcher, token, amount);
    }

    /// @notice Credit judge reward (called by SybilGuard after adjudication)
    function creditJudgeReward(
        address judge,
        address token,
        uint256 amount
    ) external onlyRole(SYBIL_GUARD_ROLE) {
        require(judge != address(0), "RewardDistributor: zero address");
        require(amount > 0, "RewardDistributor: zero amount");

        _claimable[judge][token] += amount;
        _totalLiabilities[token] += amount;
        totalEarnedByAccount[judge] += amount;

        emit JudgeRewardCredited(judge, token, amount);
    }

    /// @notice Claim all accumulated rewards for a specific token
    function claim(address token) external nonReentrant {
        uint256 amount = _claimable[msg.sender][token];
        require(amount > 0, "RewardDistributor: nothing to claim");

        _claimable[msg.sender][token] = 0;
        _totalLiabilities[token] -= amount;
        totalDistributed += amount;

        IERC20(token).safeTransfer(msg.sender, amount);

        emit RewardClaimed(msg.sender, token, amount);
    }

    /// @notice Deposit tokens to fund the reward pool (anyone can call)
    function deposit(address token, uint256 amount) external {
        require(amount > 0, "RewardDistributor: zero amount");

        totalDeposited += amount;

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        emit Deposited(msg.sender, token, amount);
    }

    /// @notice View claimable balance for an account
    function claimableBalance(
        address account,
        address token
    ) external view returns (uint256) {
        return _claimable[account][token];
    }

    /// @notice Available budget = balance minus outstanding liabilities
    function availableBudget(address token) external view returns (uint256) {
        uint256 balance = IERC20(token).balanceOf(address(this));
        uint256 liabilities = _totalLiabilities[token];
        return balance > liabilities ? balance - liabilities : 0;
    }

    // ─── Role Management ─────────────────────────────────────────────────────

    /// @notice Grant DISPUTE_ROLE to DisputeArbitration contract
    /// @dev Called after DisputeArbitration is deployed
    function grantDisputeRole(address disputeArbitration) external onlyRole(DEFAULT_ADMIN_ROLE) {
        grantRole(DISPUTE_ROLE, disputeArbitration);
    }

    /// @notice Grant SYBIL_GUARD_ROLE to SybilGuard contract
    /// @dev Called after SybilGuard is deployed
    function grantSybilGuardRole(address sybilGuard) external onlyRole(DEFAULT_ADMIN_ROLE) {
        grantRole(SYBIL_GUARD_ROLE, sybilGuard);
    }
}`,
  },
  {
    name: "StakingRewards",
    fileName: "StakingRewards.sol",
    description:
      "Tier-multiplied staking rewards with Synthetix-style continuous accrual, anti-ghost-reward staleness detection, and multi-token support.",
    lines: 260,
    source: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IStakingRewards.sol";
import "./interfaces/IStakingManager.sol";
import "./interfaces/ISybilGuard.sol";

contract StakingRewards is IStakingRewards, AccessControlUpgradeable, ReentrancyGuardUpgradeable, PausableUpgradeable, UUPSUpgradeable {
    using SafeERC20 for IERC20;

    bytes32 public constant REWARD_NOTIFIER_ROLE = keccak256("REWARD_NOTIFIER_ROLE");

    // Tier multipliers in BPS (10000 = 1x)
    uint256 public constant BRONZE_MULTIPLIER = 10000;
    uint256 public constant SILVER_MULTIPLIER = 15000;
    uint256 public constant GOLD_MULTIPLIER = 20000;
    uint256 public constant PLATINUM_MULTIPLIER = 30000;

    // V-004: Anti-ghost-reward staleness window
    uint256 public constant MAX_SYNC_STALENESS = 7 days;

    IStakingManager public stakingManager;
    ISybilGuard public sybilGuard;

    struct RewardState {
        uint256 rewardRate;
        uint256 periodFinish;
        uint256 lastUpdateTime;
        uint256 rewardPerTokenStored;
    }

    address[] private _rewardTokens;
    mapping(address => bool) private _isRewardToken;
    mapping(address => RewardState) private _rewardState;

    mapping(address => uint256) private _effectiveBalances;
    uint256 private _totalEffectiveBalance;

    mapping(address => mapping(address => uint256)) private _userRewardPerTokenPaid;
    mapping(address => mapping(address => uint256)) private _rewards;

    // V-004: Track last sync timestamp per user
    mapping(address => uint256) private _lastSyncTimestamp;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _stakingManager, address _sybilGuard) public initializer {
        require(_stakingManager != address(0), "StakingRewards: zero stakingManager");
        require(_sybilGuard != address(0), "StakingRewards: zero sybilGuard");

        stakingManager = IStakingManager(_stakingManager);
        sybilGuard = ISybilGuard(_sybilGuard);

        __AccessControl_init();
        __ReentrancyGuard_init();
        __Pausable_init();
        __UUPSUpgradeable_init();
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}

    // ═══════════════════════════════════════════════════════════════
    //  MODIFIERS
    // ═══════════════════════════════════════════════════════════════

    modifier updateReward(address account) {
        // Step 1: Sync effective balance FIRST to prevent stale-balance exploits
        if (account != address(0)) {
            _syncEffectiveBalance(account);
        }
        // Step 2: Checkpoint global reward state (uses corrected _totalEffectiveBalance)
        for (uint256 i = 0; i < _rewardTokens.length; i++) {
            address token = _rewardTokens[i];
            RewardState storage state = _rewardState[token];
            state.rewardPerTokenStored = rewardPerToken(token);
            state.lastUpdateTime = lastTimeRewardApplicable(token);
        }
        // Step 3: Checkpoint user rewards (uses synced balance + consistent per-token rate)
        if (account != address(0)) {
            for (uint256 i = 0; i < _rewardTokens.length; i++) {
                address token = _rewardTokens[i];
                _rewards[account][token] = earned(account, token);
                _userRewardPerTokenPaid[account][token] = _rewardState[token].rewardPerTokenStored;
            }
        }
        _;
    }

    // ═══════════════════════════════════════════════════════════════
    //  CORE
    // ═══════════════════════════════════════════════════════════════

    function syncStake() public nonReentrant whenNotPaused updateReward(msg.sender) {
        require(!sybilGuard.checkBanned(msg.sender), "StakingRewards: banned");
        // Effective balance already synced in updateReward modifier
        emit StakeSynced(msg.sender, _effectiveBalances[msg.sender], uint256(stakingManager.getTier(msg.sender)));
    }

    function claimRewards(address token) external nonReentrant whenNotPaused updateReward(msg.sender) {
        require(!sybilGuard.checkBanned(msg.sender), "StakingRewards: banned");
        // Effective balance already synced in updateReward modifier

        uint256 reward = _rewards[msg.sender][token];
        require(reward > 0, "StakingRewards: nothing to claim");

        _rewards[msg.sender][token] = 0;
        IERC20(token).safeTransfer(msg.sender, reward);

        emit RewardsClaimed(msg.sender, token, reward);
    }

    function notifyRewardAmount(
        address token,
        uint256 amount,
        uint256 duration
    ) external onlyRole(REWARD_NOTIFIER_ROLE) updateReward(address(0)) {
        require(_isRewardToken[token], "StakingRewards: token not added");
        require(amount > 0, "StakingRewards: zero amount");
        require(duration > 0, "StakingRewards: zero duration");

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        RewardState storage state = _rewardState[token];

        if (block.timestamp >= state.periodFinish) {
            state.rewardRate = amount / duration;
        } else {
            uint256 remaining = state.periodFinish - block.timestamp;
            uint256 leftover = remaining * state.rewardRate;
            state.rewardRate = (amount + leftover) / duration;
        }
        require(state.rewardRate > 0, "StakingRewards: reward rate zero");

        state.lastUpdateTime = block.timestamp;
        state.periodFinish = block.timestamp + duration;

        emit RewardNotified(token, amount, duration);
    }

    function addRewardToken(address token) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(token != address(0), "StakingRewards: zero token");
        require(!_isRewardToken[token], "StakingRewards: token exists");

        _rewardTokens.push(token);
        _isRewardToken[token] = true;

        emit RewardTokenAdded(token);
    }

    // ═══════════════════════════════════════════════════════════════
    //  VIEWS
    // ═══════════════════════════════════════════════════════════════

    function earned(address user, address token) public view returns (uint256) {
        uint256 effective = _effectiveBalances[user];
        uint256 lastSync = _lastSyncTimestamp[user];

        // V-004: If stale, return only previously-checkpointed rewards.
        // The uncheckpointed accrual will be forfeited on next interaction.
        if (effective > 0 && lastSync > 0 && block.timestamp > lastSync + MAX_SYNC_STALENESS) {
            return _rewards[user][token];
        }

        uint256 perToken = rewardPerToken(token) - _userRewardPerTokenPaid[user][token];
        return (effective * perToken) / 1e18 + _rewards[user][token];
    }

    function rewardPerToken(address token) public view returns (uint256) {
        RewardState memory state = _rewardState[token];
        if (_totalEffectiveBalance == 0) {
            return state.rewardPerTokenStored;
        }
        uint256 timeElapsed = lastTimeRewardApplicable(token) - state.lastUpdateTime;
        return state.rewardPerTokenStored + (timeElapsed * state.rewardRate * 1e18) / _totalEffectiveBalance;
    }

    function lastTimeRewardApplicable(address token) public view returns (uint256) {
        RewardState memory state = _rewardState[token];
        return block.timestamp < state.periodFinish ? block.timestamp : state.periodFinish;
    }

    function getEffectiveBalance(address user) external view returns (uint256) {
        return _effectiveBalances[user];
    }

    function getRewardTokens() external view returns (address[] memory) {
        return _rewardTokens;
    }

    function getTotalEffectiveBalance() external view returns (uint256) {
        return _totalEffectiveBalance;
    }

    function getLastSyncTimestamp(address user) external view returns (uint256) {
        return _lastSyncTimestamp[user];
    }

    // ═══════════════════════════════════════════════════════════════
    //  INTERNAL
    // ═══════════════════════════════════════════════════════════════

    function _syncEffectiveBalance(address account) internal {
        uint256 lastSync = _lastSyncTimestamp[account];
        uint256 oldEffective = _effectiveBalances[account];

        // V-004: If user had an effective balance but hasn't synced within
        // MAX_SYNC_STALENESS, forfeit all uncheckpointed rewards from the
        // stale period. Snap per-token-paid to current rate WITHOUT adding
        // the gap to _rewards — the unclaimed accrual is simply lost.
        if (oldEffective > 0 && lastSync > 0 && block.timestamp > lastSync + MAX_SYNC_STALENESS) {
            for (uint256 i = 0; i < _rewardTokens.length; i++) {
                address token = _rewardTokens[i];
                // Snap to current rate — uncheckpointed rewards are forfeited
                _userRewardPerTokenPaid[account][token] = rewardPerToken(token);
            }
            // Zero out effective balance for the stale period
            _totalEffectiveBalance -= oldEffective;
            _effectiveBalances[account] = 0;
            oldEffective = 0;
        }

        uint256 stake = stakingManager.getStake(account);
        IStakingManager.Tier tier = stakingManager.getTier(account);
        uint256 multiplier = _tierMultiplier(tier);
        uint256 newEffective = (stake * multiplier) / 10000;
        _totalEffectiveBalance = _totalEffectiveBalance - oldEffective + newEffective;
        _effectiveBalances[account] = newEffective;
        _lastSyncTimestamp[account] = block.timestamp;
    }

    function _tierMultiplier(IStakingManager.Tier tier) internal pure returns (uint256) {
        if (tier == IStakingManager.Tier.Platinum) return PLATINUM_MULTIPLIER;
        if (tier == IStakingManager.Tier.Gold) return GOLD_MULTIPLIER;
        if (tier == IStakingManager.Tier.Silver) return SILVER_MULTIPLIER;
        return BRONZE_MULTIPLIER; // None and Bronze both get 1x
    }

    // ═══════════════════════════════════════════════════════════════
    //  ADMIN
    // ═══════════════════════════════════════════════════════════════

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
}`,
  },
  {
    name: "LoanEngine",
    fileName: "LoanEngine.sol",
    description:
      "Reputation-tiered under-collateralized lending with 4 loan terms, partial repayment, stake locking, and liquidation with slash recovery.",
    lines: 453,
    source: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/ILoanEngine.sol";
import "./interfaces/IReputationSystem.sol";
import "./interfaces/IStakingManager.sol";
import "./interfaces/ISybilGuard.sol";

contract LoanEngine is ILoanEngine, Initializable, UUPSUpgradeable, OwnableUpgradeable, AccessControlUpgradeable, ReentrancyGuardUpgradeable, PausableUpgradeable {
    using SafeERC20 for IERC20;

    // ── Tier borrowing parameters ────────────────────────────────────
    // Max borrow amounts (in LOB wei)
    uint256 public constant SILVER_MAX_BORROW = 500 ether;
    uint256 public constant GOLD_MAX_BORROW = 2_500 ether;
    uint256 public constant PLATINUM_MAX_BORROW = 10_000 ether;

    // Annual interest rates (BPS)
    uint256 public constant SILVER_INTEREST_BPS = 800;   // 8%
    uint256 public constant GOLD_INTEREST_BPS = 500;     // 5%
    uint256 public constant PLATINUM_INTEREST_BPS = 300;  // 3%

    // Collateral requirements (BPS of principal)
    uint256 public constant SILVER_COLLATERAL_BPS = 5000;   // 50%
    uint256 public constant GOLD_COLLATERAL_BPS = 4000;     // 40%
    uint256 public constant PLATINUM_COLLATERAL_BPS = 2500;  // 25% minimum floor

    // ── Anti-farming ──────────────────────────────────────────────────
    uint256 public constant MIN_BORROWER_STAKE = 1_000 ether; // must stake 1k LOB to borrow

    // ── Protocol parameters ──────────────────────────────────────────
    uint256 public constant PROTOCOL_FEE_BPS = 50;       // 0.5%
    uint256 public constant GRACE_PERIOD = 48 hours;
    uint256 public constant REQUEST_EXPIRY = 7 days;
    uint256 public constant MAX_ACTIVE_LOANS = 3;
    uint256 public constant DEFAULTS_BEFORE_RESTRICTION = 2;
    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant DAYS_PER_YEAR = 365;

    // ── Immutables (now regular state variables for upgradeability) ─────
    IERC20 public lobToken;
    IReputationSystem public reputationSystem;
    IStakingManager public stakingManager;
    ISybilGuard public sybilGuard;
    address public treasury;

    // ── State ────────────────────────────────────────────────────────
    uint256 private _nextLoanId = 1;
    mapping(uint256 => Loan) private _loans;
    mapping(address => BorrowerProfile) private _profiles;
    mapping(address => uint256[]) private _activeLoanIds;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _lobToken,
        address _reputationSystem,
        address _stakingManager,
        address _sybilGuard,
        address _treasury,
        address _owner
    ) public virtual initializer {
        require(_lobToken != address(0), "LoanEngine: zero lobToken");
        require(_reputationSystem != address(0), "LoanEngine: zero reputation");
        require(_stakingManager != address(0), "LoanEngine: zero staking");
        require(_sybilGuard != address(0), "LoanEngine: zero sybilGuard");
        require(_treasury != address(0), "LoanEngine: zero treasury");

        __Ownable_init(_owner);
        __UUPSUpgradeable_init();
        __AccessControl_init();
        __ReentrancyGuard_init();
        __Pausable_init();

        lobToken = IERC20(_lobToken);
        reputationSystem = IReputationSystem(_reputationSystem);
        stakingManager = IStakingManager(_stakingManager);
        sybilGuard = ISybilGuard(_sybilGuard);
        treasury = _treasury;

        _grantRole(DEFAULT_ADMIN_ROLE, _owner);

        _nextLoanId = 1;
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // ══════════════════════════════════════════════════════════════════
    //  CORE FUNCTIONS
    // ══════════════════════════════════════════════════════════════════

    function requestLoan(
        uint256 principal,
        LoanTerm term
    ) external nonReentrant whenNotPaused returns (uint256 loanId) {
        require(principal > 0, "LoanEngine: zero principal");
        require(!sybilGuard.checkBanned(msg.sender), "LoanEngine: borrower banned");

        BorrowerProfile storage profile = _profiles[msg.sender];
        require(!profile.restricted, "LoanEngine: borrower restricted");
        require(profile.activeLoans < MAX_ACTIVE_LOANS, "LoanEngine: max active loans");

        // Check reputation tier
        (, IReputationSystem.ReputationTier tier) = reputationSystem.getScore(msg.sender);
        require(tier >= IReputationSystem.ReputationTier.Silver, "LoanEngine: insufficient reputation");

        // V-005: Require stake >= max(MIN_BORROWER_STAKE, principal) to prevent
        // profitable deliberate defaults at low-collateral tiers
        uint256 requiredStake = principal > MIN_BORROWER_STAKE ? principal : MIN_BORROWER_STAKE;
        require(stakingManager.getStake(msg.sender) >= requiredStake, "LoanEngine: insufficient stake");

        // Check principal within tier max
        uint256 maxBorrow = _maxBorrowForTier(tier);
        require(principal <= maxBorrow, "LoanEngine: exceeds max borrow");

        // Calculate interest (simple, prorated by term)
        uint256 annualRate = _interestRateForTier(tier);
        uint256 termDuration = getTermDuration(term);
        uint256 interestAmount = (principal * annualRate * termDuration) / (BPS_DENOMINATOR * DAYS_PER_YEAR * 1 days);

        // Protocol fee on principal
        uint256 protocolFee = (principal * PROTOCOL_FEE_BPS) / BPS_DENOMINATOR;

        // Collateral
        uint256 collateralBps = _collateralBpsForTier(tier);
        uint256 collateralAmount = (principal * collateralBps) / BPS_DENOMINATOR;

        // Transfer collateral from borrower
        if (collateralAmount > 0) {
            lobToken.safeTransferFrom(msg.sender, address(this), collateralAmount);
        }

        loanId = _nextLoanId++;

        _loans[loanId] = Loan({
            id: loanId,
            borrower: msg.sender,
            lender: address(0),
            principal: principal,
            interestAmount: interestAmount,
            protocolFee: protocolFee,
            collateralAmount: collateralAmount,
            totalRepaid: 0,
            status: LoanStatus.Requested,
            term: term,
            requestedAt: block.timestamp,
            fundedAt: 0,
            dueDate: 0
        });

        profile.activeLoans++;
        _activeLoanIds[msg.sender].push(loanId);

        emit LoanRequested(loanId, msg.sender, principal, term);
    }

    function cancelLoan(uint256 loanId) external nonReentrant {
        Loan storage loan = _loans[loanId];
        require(loan.id != 0, "LoanEngine: loan not found");
        require(loan.status == LoanStatus.Requested, "LoanEngine: not requested");
        require(msg.sender == loan.borrower, "LoanEngine: not borrower");

        loan.status = LoanStatus.Cancelled;
        _returnCollateral(loan);
        _removeLoanFromActive(loan.borrower, loanId);

        emit LoanCancelled(loanId);
    }

    function fundLoan(uint256 loanId) external nonReentrant whenNotPaused {
        Loan storage loan = _loans[loanId];
        require(loan.id != 0, "LoanEngine: loan not found");
        require(loan.status == LoanStatus.Requested, "LoanEngine: not requested");
        require(msg.sender != loan.borrower, "LoanEngine: self-lending");
        require(block.timestamp <= loan.requestedAt + REQUEST_EXPIRY, "LoanEngine: request expired");

        loan.lender = msg.sender;
        loan.status = LoanStatus.Active;
        loan.fundedAt = block.timestamp;
        loan.dueDate = block.timestamp + getTermDuration(loan.term);

        // Lock borrower's stake to prevent unstake-before-liquidation evasion
        stakingManager.lockStake(loan.borrower, loan.principal);

        // Lender sends principal, forwarded to borrower
        lobToken.safeTransferFrom(msg.sender, loan.borrower, loan.principal);

        emit LoanFunded(loanId, msg.sender);
    }

    function repay(uint256 loanId, uint256 amount) external nonReentrant whenNotPaused {
        Loan storage loan = _loans[loanId];
        require(loan.id != 0, "LoanEngine: loan not found");
        require(loan.status == LoanStatus.Active, "LoanEngine: not active");
        require(amount > 0, "LoanEngine: zero amount");

        uint256 outstanding = _outstandingAmount(loan);
        // Cap overpayment
        if (amount > outstanding) {
            amount = outstanding;
        }

        lobToken.safeTransferFrom(msg.sender, address(this), amount);
        loan.totalRepaid += amount;

        uint256 remaining = _outstandingAmount(loan);
        emit RepaymentMade(loanId, amount, remaining);

        if (remaining == 0) {
            loan.status = LoanStatus.Repaid;

            // Unlock borrower's stake
            stakingManager.unlockStake(loan.borrower, loan.principal);

            // Distribute: fee to treasury, remainder to lender
            uint256 fee = loan.protocolFee;
            uint256 toLender = loan.principal + loan.interestAmount;

            if (fee > 0) {
                lobToken.safeTransfer(treasury, fee);
            }
            lobToken.safeTransfer(loan.lender, toLender);

            // Return collateral
            _returnCollateral(loan);
            _removeLoanFromActive(loan.borrower, loanId);

            _profiles[loan.borrower].totalRepaid += loan.principal;

            emit LoanRepaid(loanId);
        }
    }

    function liquidate(uint256 loanId) external nonReentrant {
        Loan storage loan = _loans[loanId];
        require(loan.id != 0, "LoanEngine: loan not found");
        require(loan.status == LoanStatus.Active, "LoanEngine: not active");
        require(block.timestamp > loan.dueDate + GRACE_PERIOD, "LoanEngine: grace period active");

        loan.status = LoanStatus.Liquidated;

        // Unlock borrower's stake before slashing (slash handles locked reduction)
        stakingManager.unlockStake(loan.borrower, loan.principal);

        // Slash reputation (-200 via recordDispute)
        reputationSystem.recordDispute(loan.borrower, false);

        emit LoanDefaulted(loanId, loan.borrower);

        // Seize collateral
        uint256 collateralSeized = loan.collateralAmount;

        // Best-effort stake slash for Platinum (0 collateral)
        uint256 stakeSlashed = 0;
        uint256 staked = stakingManager.getStake(loan.borrower);
        if (staked > 0) {
            uint256 slashTarget = loan.principal; // try to recover principal
            if (slashTarget > staked) {
                slashTarget = staked;
            }
            try stakingManager.slash(loan.borrower, slashTarget, address(this)) {
                stakeSlashed = slashTarget;
            } catch {
                // Best-effort — slash may fail if roles changed
            }
        }

        // Total recovered: collateral + any partial repayment held + slashed stake
        // Funds already in contract: collateral + totalRepaid
        // Funds just received: stakeSlashed
        uint256 totalRecovered = collateralSeized + loan.totalRepaid + stakeSlashed;

        // Distribute: fee to treasury, remainder to lender (capped at debt owed)
        uint256 fee = loan.protocolFee;
        uint256 toLender;
        uint256 lenderEntitlement = loan.principal + loan.interestAmount;

        if (totalRecovered <= fee) {
            // Not enough to cover fee — all goes to treasury
            if (totalRecovered > 0) {
                lobToken.safeTransfer(treasury, totalRecovered);
            }
            toLender = 0;
        } else {
            if (fee > 0) {
                lobToken.safeTransfer(treasury, fee);
            }
            toLender = totalRecovered - fee;

            // Cap lender payout to actual debt owed, refund surplus to borrower
            if (toLender > lenderEntitlement) {
                uint256 surplus = toLender - lenderEntitlement;
                toLender = lenderEntitlement;
                lobToken.safeTransfer(loan.borrower, surplus);
            }

            if (toLender > 0) {
                lobToken.safeTransfer(loan.lender, toLender);
            }
        }

        _removeLoanFromActive(loan.borrower, loanId);

        // Track defaults
        BorrowerProfile storage profile = _profiles[loan.borrower];
        profile.defaults++;
        if (profile.defaults >= DEFAULTS_BEFORE_RESTRICTION) {
            profile.restricted = true;
            emit BorrowerRestricted(loan.borrower, profile.defaults);
        }

        emit LoanLiquidated(loanId, collateralSeized, stakeSlashed);
    }

    function cleanupExpiredRequest(uint256 loanId) external nonReentrant {
        Loan storage loan = _loans[loanId];
        require(loan.id != 0, "LoanEngine: loan not found");
        require(loan.status == LoanStatus.Requested, "LoanEngine: not requested");
        require(block.timestamp > loan.requestedAt + REQUEST_EXPIRY, "LoanEngine: not expired");

        loan.status = LoanStatus.Cancelled;
        _returnCollateral(loan);
        _removeLoanFromActive(loan.borrower, loanId);

        emit LoanCancelled(loanId);
    }

    // ══════════════════════════════════════════════════════════════════
    //  ADMIN
    // ══════════════════════════════════════════════════════════════════

    function liftRestriction(address borrower) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_profiles[borrower].restricted, "LoanEngine: not restricted");
        _profiles[borrower].restricted = false;
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // ══════════════════════════════════════════════════════════════════
    //  VIEW FUNCTIONS
    // ══════════════════════════════════════════════════════════════════

    function getLoan(uint256 loanId) external view returns (Loan memory) {
        Loan memory loan = _loans[loanId];
        require(loan.id != 0, "LoanEngine: loan not found");
        return loan;
    }

    function getBorrowerProfile(address borrower) external view returns (BorrowerProfile memory) {
        return _profiles[borrower];
    }

    function getMaxBorrow(address borrower) external view returns (uint256) {
        (, IReputationSystem.ReputationTier tier) = reputationSystem.getScore(borrower);
        return _maxBorrowForTier(tier);
    }

    function getInterestRate(address borrower) external view returns (uint256) {
        (, IReputationSystem.ReputationTier tier) = reputationSystem.getScore(borrower);
        return _interestRateForTier(tier);
    }

    function getCollateralRequired(uint256 principal, address borrower) external view returns (uint256) {
        (, IReputationSystem.ReputationTier tier) = reputationSystem.getScore(borrower);
        uint256 bps = _collateralBpsForTier(tier);
        return (principal * bps) / BPS_DENOMINATOR;
    }

    function getOutstandingAmount(uint256 loanId) external view returns (uint256) {
        Loan storage loan = _loans[loanId];
        require(loan.id != 0, "LoanEngine: loan not found");
        return _outstandingAmount(loan);
    }

    function getTermDuration(LoanTerm term) public pure returns (uint256) {
        if (term == LoanTerm.SevenDays) return 7 days;
        if (term == LoanTerm.FourteenDays) return 14 days;
        if (term == LoanTerm.ThirtyDays) return 30 days;
        if (term == LoanTerm.NinetyDays) return 90 days;
        revert("LoanEngine: invalid term");
    }

    function getActiveLoanIds(address borrower) external view returns (uint256[] memory) {
        return _activeLoanIds[borrower];
    }

    // ══════════════════════════════════════════════════════════════════
    //  INTERNAL
    // ══════════════════════════════════════════════════════════════════

    function _outstandingAmount(Loan storage loan) internal view returns (uint256) {
        uint256 total = loan.principal + loan.interestAmount + loan.protocolFee;
        if (loan.totalRepaid >= total) return 0;
        return total - loan.totalRepaid;
    }

    function _returnCollateral(Loan storage loan) internal {
        if (loan.collateralAmount > 0) {
            lobToken.safeTransfer(loan.borrower, loan.collateralAmount);
        }
    }

    function _removeLoanFromActive(address borrower, uint256 loanId) internal {
        uint256[] storage ids = _activeLoanIds[borrower];
        for (uint256 i = 0; i < ids.length; i++) {
            if (ids[i] == loanId) {
                ids[i] = ids[ids.length - 1];
                ids.pop();
                _profiles[borrower].activeLoans--;
                return;
            }
        }
    }

    function _maxBorrowForTier(IReputationSystem.ReputationTier tier) internal pure returns (uint256) {
        if (tier == IReputationSystem.ReputationTier.Platinum) return PLATINUM_MAX_BORROW;
        if (tier == IReputationSystem.ReputationTier.Gold) return GOLD_MAX_BORROW;
        if (tier == IReputationSystem.ReputationTier.Silver) return SILVER_MAX_BORROW;
        return 0; // Bronze — ineligible
    }

    function _interestRateForTier(IReputationSystem.ReputationTier tier) internal pure returns (uint256) {
        if (tier == IReputationSystem.ReputationTier.Platinum) return PLATINUM_INTEREST_BPS;
        if (tier == IReputationSystem.ReputationTier.Gold) return GOLD_INTEREST_BPS;
        if (tier == IReputationSystem.ReputationTier.Silver) return SILVER_INTEREST_BPS;
        return 0;
    }

    function _collateralBpsForTier(IReputationSystem.ReputationTier tier) internal pure returns (uint256) {
        if (tier == IReputationSystem.ReputationTier.Platinum) return PLATINUM_COLLATERAL_BPS;
        if (tier == IReputationSystem.ReputationTier.Gold) return GOLD_COLLATERAL_BPS;
        if (tier == IReputationSystem.ReputationTier.Silver) return SILVER_COLLATERAL_BPS;
        return 0;
    }
}`,
  },
  {
    name: "LiquidityMining",
    fileName: "LiquidityMining.sol",
    description:
      "LP token farming with staking-tier boost multipliers, Synthetix-style reward distribution, and emergency withdrawal support.",
    lines: 271,
    source: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/ILiquidityMining.sol";
import "./interfaces/IStakingManager.sol";
import "./interfaces/ISybilGuard.sol";

contract LiquidityMining is ILiquidityMining, Initializable, UUPSUpgradeable, OwnableUpgradeable, AccessControlUpgradeable, ReentrancyGuardUpgradeable, PausableUpgradeable {
    using SafeERC20 for IERC20;

    bytes32 public constant REWARD_NOTIFIER_ROLE = keccak256("REWARD_NOTIFIER_ROLE");

    // Boost multipliers in BPS
    uint256 public constant NONE_BOOST = 10000;
    uint256 public constant BRONZE_BOOST = 10000;
    uint256 public constant SILVER_BOOST = 15000;
    uint256 public constant GOLD_BOOST = 20000;
    uint256 public constant PLATINUM_BOOST = 30000;

    IERC20 public lpToken;
    IERC20 public rewardToken;
    IStakingManager public stakingManager;
    ISybilGuard public sybilGuard;

    uint256 public rewardRate;
    uint256 public periodFinish;
    uint256 public lastUpdateTime;
    uint256 public rewardPerTokenStored;

    uint256 private _totalBoostedSupply;

    mapping(address => uint256) private _balances;
    mapping(address => uint256) private _boostedBalances;
    mapping(address => uint256) private _userRewardPerTokenPaid;
    mapping(address => uint256) private _rewards;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _lpToken,
        address _rewardToken,
        address _stakingManager,
        address _sybilGuard,
        address _owner
    ) external initializer {
        require(_lpToken != address(0), "LiquidityMining: zero lpToken");
        require(_rewardToken != address(0), "LiquidityMining: zero rewardToken");
        require(_stakingManager != address(0), "LiquidityMining: zero stakingManager");
        require(_sybilGuard != address(0), "LiquidityMining: zero sybilGuard");
        require(_owner != address(0), "LiquidityMining: zero owner");

        __Ownable_init(_owner);
        __AccessControl_init();
        __ReentrancyGuard_init();
        __Pausable_init();
        __UUPSUpgradeable_init();

        lpToken = IERC20(_lpToken);
        rewardToken = IERC20(_rewardToken);
        stakingManager = IStakingManager(_stakingManager);
        sybilGuard = ISybilGuard(_sybilGuard);

        _grantRole(DEFAULT_ADMIN_ROLE, _owner);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // ═══════════════════════════════════════════════════════════════
    //  MODIFIERS
    // ═══════════════════════════════════════════════════════════════

    modifier updateReward(address account) {
        _updateRewardInternal(account);
        _;
    }

    // ═══════════════════════════════════════════════════════════════
    //  CORE
    // ═══════════════════════════════════════════════════════════════

    function stake(uint256 amount) external nonReentrant whenNotPaused updateReward(msg.sender) {
        require(!sybilGuard.checkBanned(msg.sender), "LiquidityMining: banned");
        require(amount > 0, "LiquidityMining: zero amount");

        _balances[msg.sender] += amount;

        // Recalculate full boosted balance to avoid rounding drift from additive boosts
        uint256 boost = _getBoost(msg.sender);
        uint256 oldBoosted = _boostedBalances[msg.sender];
        uint256 newBoosted = (_balances[msg.sender] * boost) / 10000;
        _totalBoostedSupply = _totalBoostedSupply - oldBoosted + newBoosted;
        _boostedBalances[msg.sender] = newBoosted;

        lpToken.safeTransferFrom(msg.sender, address(this), amount);

        emit Staked(msg.sender, amount);
    }

    function withdraw(uint256 amount) external nonReentrant whenNotPaused updateReward(msg.sender) {
        require(!sybilGuard.checkBanned(msg.sender), "LiquidityMining: banned");
        _withdrawInternal(msg.sender, amount);
    }

    function getReward() public nonReentrant whenNotPaused updateReward(msg.sender) {
        require(!sybilGuard.checkBanned(msg.sender), "LiquidityMining: banned");
        _getRewardInternal(msg.sender);
    }

    function exit() external nonReentrant whenNotPaused updateReward(msg.sender) {
        require(!sybilGuard.checkBanned(msg.sender), "LiquidityMining: banned");
        uint256 bal = _balances[msg.sender];
        if (bal > 0) {
            _withdrawInternal(msg.sender, bal);
        }
        _getRewardInternal(msg.sender);
    }

    function emergencyWithdraw() external nonReentrant {
        uint256 amount = _balances[msg.sender];
        require(amount > 0, "LiquidityMining: nothing to withdraw");

        _totalBoostedSupply -= _boostedBalances[msg.sender];
        _boostedBalances[msg.sender] = 0;
        _balances[msg.sender] = 0;
        _rewards[msg.sender] = 0;

        lpToken.safeTransfer(msg.sender, amount);

        emit EmergencyWithdrawn(msg.sender, amount);
    }

    function notifyRewardAmount(
        uint256 amount,
        uint256 duration
    ) external onlyRole(REWARD_NOTIFIER_ROLE) updateReward(address(0)) {
        require(amount > 0, "LiquidityMining: zero amount");
        require(duration > 0, "LiquidityMining: zero duration");

        rewardToken.safeTransferFrom(msg.sender, address(this), amount);

        if (block.timestamp >= periodFinish) {
            rewardRate = amount / duration;
        } else {
            uint256 remaining = periodFinish - block.timestamp;
            uint256 leftover = remaining * rewardRate;
            rewardRate = (amount + leftover) / duration;
        }
        require(rewardRate > 0, "LiquidityMining: reward rate zero");

        lastUpdateTime = block.timestamp;
        periodFinish = block.timestamp + duration;

        emit RewardNotified(amount, duration);
    }

    // ═══════════════════════════════════════════════════════════════
    //  VIEWS
    // ═══════════════════════════════════════════════════════════════

    function earned(address user) public view returns (uint256) {
        uint256 boosted = _boostedBalances[user];
        uint256 perToken = rewardPerToken() - _userRewardPerTokenPaid[user];
        return (boosted * perToken) / 1e18 + _rewards[user];
    }

    function rewardPerToken() public view returns (uint256) {
        if (_totalBoostedSupply == 0) {
            return rewardPerTokenStored;
        }
        uint256 timeElapsed = lastTimeRewardApplicable() - lastUpdateTime;
        return rewardPerTokenStored + (timeElapsed * rewardRate * 1e18) / _totalBoostedSupply;
    }

    function lastTimeRewardApplicable() public view returns (uint256) {
        return block.timestamp < periodFinish ? block.timestamp : periodFinish;
    }

    function balanceOf(address user) external view returns (uint256) {
        return _balances[user];
    }

    function totalSupply() external view returns (uint256) {
        return _totalBoostedSupply;
    }

    function getBoostMultiplier(address user) external view returns (uint256) {
        return _getBoost(user);
    }

    // ═══════════════════════════════════════════════════════════════
    //  INTERNAL
    // ═══════════════════════════════════════════════════════════════

    function _withdrawInternal(address user, uint256 amount) internal {
        require(amount > 0, "LiquidityMining: zero amount");
        require(_balances[user] >= amount, "LiquidityMining: insufficient balance");

        _recalculateBoost(user, _balances[user] - amount);

        _balances[user] -= amount;
        lpToken.safeTransfer(user, amount);

        emit Withdrawn(user, amount);
    }

    function _getRewardInternal(address user) internal {
        // Boost already synced in _updateRewardInternal (via updateReward modifier)
        uint256 reward = _rewards[user];
        if (reward > 0) {
            _rewards[user] = 0;
            rewardToken.safeTransfer(user, reward);
            emit RewardPaid(user, reward);
        }
    }

    function _getBoost(address user) internal view returns (uint256) {
        IStakingManager.Tier tier = stakingManager.getTier(user);
        if (tier == IStakingManager.Tier.Platinum) return PLATINUM_BOOST;
        if (tier == IStakingManager.Tier.Gold) return GOLD_BOOST;
        if (tier == IStakingManager.Tier.Silver) return SILVER_BOOST;
        return NONE_BOOST;
    }

    function _recalculateBoost(address user, uint256 newRawBalance) internal {
        uint256 oldBoosted = _boostedBalances[user];
        uint256 boost = _getBoost(user);
        uint256 newBoosted = (newRawBalance * boost) / 10000;

        _totalBoostedSupply = _totalBoostedSupply - oldBoosted + newBoosted;
        _boostedBalances[user] = newBoosted;
    }

    function _updateRewardInternal(address account) internal {
        // Step 1: Sync boost to current tier FIRST to prevent stale-balance exploits
        if (account != address(0)) {
            _recalculateBoost(account, _balances[account]);
        }
        // Step 2: Checkpoint global reward state (uses corrected _totalBoostedSupply)
        rewardPerTokenStored = rewardPerToken();
        lastUpdateTime = lastTimeRewardApplicable();
        // Step 3: Checkpoint user rewards (uses synced boosted balance + consistent per-token rate)
        if (account != address(0)) {
            _rewards[account] = earned(account);
            _userRewardPerTokenPaid[account] = rewardPerTokenStored;
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  ADMIN
    // ═══════════════════════════════════════════════════════════════

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}`,
  },
  {
    name: "RewardScheduler",
    fileName: "RewardScheduler.sol",
    description:
      "Manages reward distribution streams with configurable emission rates, drip-based epoch transitions for StakingRewards and LiquidityMining.",
    lines: 290,
    source: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./interfaces/IRewardScheduler.sol";
import "./interfaces/IStakingRewards.sol";
import "./interfaces/ILiquidityMining.sol";

contract RewardScheduler is
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable,
    IRewardScheduler
{
    using SafeERC20 for IERC20;

    IStakingRewards public stakingRewards;
    ILiquidityMining public liquidityMining;

    uint256 private _streamCount;
    mapping(uint256 => Stream) private _streams;
    uint256[] private _activeStreamIds;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _stakingRewards, address _liquidityMining) public initializer {
        require(_stakingRewards != address(0), "RewardScheduler: zero stakingRewards");
        require(_liquidityMining != address(0), "RewardScheduler: zero liquidityMining");

        __Ownable_init(msg.sender);
        __AccessControl_init();
        __ReentrancyGuard_init();
        __Pausable_init();
        __UUPSUpgradeable_init();

        stakingRewards = IStakingRewards(_stakingRewards);
        liquidityMining = ILiquidityMining(_liquidityMining);

        // Grant DEFAULT_ADMIN_ROLE to owner (can reassign and grant other roles)
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // ═══════════════════════════════════════════════════════════════
    //  STREAM MANAGEMENT
    // ═══════════════════════════════════════════════════════════════

    function createStream(
        TargetType targetType,
        address rewardToken,
        uint256 emissionPerSecond,
        uint256 endTime
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(rewardToken != address(0), "RewardScheduler: zero token");
        require(emissionPerSecond > 0, "RewardScheduler: zero emission");
        if (endTime > 0) {
            require(endTime > block.timestamp, "RewardScheduler: endTime in past");
        }

        _streamCount++;
        uint256 streamId = _streamCount;

        _streams[streamId] = Stream({
            id: streamId,
            targetType: targetType,
            rewardToken: rewardToken,
            emissionPerSecond: emissionPerSecond,
            lastDripTime: block.timestamp,
            endTime: endTime,
            active: true
        });

        _activeStreamIds.push(streamId);

        emit StreamCreated(streamId, targetType, rewardToken, emissionPerSecond, endTime);
    }

    // ═══════════════════════════════════════════════════════════════
    //  DRIP
    // ═══════════════════════════════════════════════════════════════

    function drip(uint256 streamId) public nonReentrant whenNotPaused {
        _drip(streamId);
    }

    function dripAll() external nonReentrant whenNotPaused {
        for (uint256 i = 0; i < _activeStreamIds.length; i++) {
            _drip(_activeStreamIds[i]);
        }
    }

    function _drip(uint256 streamId) internal {
        Stream storage stream = _streams[streamId];
        require(stream.id != 0, "RewardScheduler: stream not found");
        if (!stream.active) return;

        uint256 effectiveEnd = stream.endTime > 0
            ? _min(block.timestamp, stream.endTime)
            : block.timestamp;

        if (effectiveEnd <= stream.lastDripTime) return;

        uint256 elapsed = effectiveEnd - stream.lastDripTime;
        uint256 amount = elapsed * stream.emissionPerSecond;

        uint256 balance = IERC20(stream.rewardToken).balanceOf(address(this));
        if (amount > balance) {
            amount = balance;
            if (amount == 0) return;
            // Recalculate elapsed based on capped amount
            elapsed = amount / stream.emissionPerSecond;
            if (elapsed == 0) return;
        }

        stream.lastDripTime = stream.lastDripTime + elapsed;

        // Approve target (reset to 0 first for OZ v4 SafeERC20 compat)
        IERC20 token = IERC20(stream.rewardToken);

        if (stream.targetType == TargetType.STAKING_REWARDS) {
            token.approve(address(stakingRewards), 0);
            token.approve(address(stakingRewards), amount);
            stakingRewards.notifyRewardAmount(stream.rewardToken, amount, elapsed);
        } else {
            token.approve(address(liquidityMining), 0);
            token.approve(address(liquidityMining), amount);
            liquidityMining.notifyRewardAmount(amount, elapsed);
        }

        // Deactivate if stream has ended
        if (stream.endTime > 0 && block.timestamp >= stream.endTime) {
            stream.active = false;
            _removeActiveStream(streamId);
        }

        emit StreamDripped(streamId, amount, elapsed);
    }

    // ═══════════════════════════════════════════════════════════════
    //  ADMIN
    // ═══════════════════════════════════════════════════════════════

    function updateEmission(
        uint256 streamId,
        uint256 newEmissionPerSecond
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        Stream storage stream = _streams[streamId];
        require(stream.id != 0, "RewardScheduler: stream not found");
        require(newEmissionPerSecond > 0, "RewardScheduler: zero emission");

        // Flush accrued at old rate
        _drip(streamId);

        uint256 oldEmission = stream.emissionPerSecond;
        stream.emissionPerSecond = newEmissionPerSecond;

        emit StreamUpdated(streamId, oldEmission, newEmissionPerSecond);
    }

    function pauseStream(uint256 streamId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        Stream storage stream = _streams[streamId];
        require(stream.id != 0, "RewardScheduler: stream not found");
        require(stream.active, "RewardScheduler: already paused");

        // Flush accrued before pausing
        _drip(streamId);

        stream.active = false;
        _removeActiveStream(streamId);

        emit StreamPaused(streamId);
    }

    function resumeStream(uint256 streamId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        Stream storage stream = _streams[streamId];
        require(stream.id != 0, "RewardScheduler: stream not found");
        require(!stream.active, "RewardScheduler: already active");
        if (stream.endTime > 0) {
            require(block.timestamp < stream.endTime, "RewardScheduler: stream ended");
        }

        stream.active = true;
        stream.lastDripTime = block.timestamp;
        _activeStreamIds.push(streamId);

        emit StreamResumed(streamId);
    }

    function topUp(address token, uint256 amount) external {
        require(token != address(0), "RewardScheduler: zero token");
        require(amount > 0, "RewardScheduler: zero amount");

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        emit TopUp(msg.sender, token, amount);
    }

    function withdrawBudget(
        address token,
        uint256 amount,
        address to
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(to != address(0), "RewardScheduler: zero recipient");
        require(amount > 0, "RewardScheduler: zero amount");

        IERC20(token).safeTransfer(to, amount);

        emit BudgetWithdrawn(to, token, amount);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // ═══════════════════════════════════════════════════════════════
    //  VIEWS
    // ═══════════════════════════════════════════════════════════════

    function getStream(uint256 streamId) external view returns (Stream memory) {
        require(_streams[streamId].id != 0, "RewardScheduler: stream not found");
        return _streams[streamId];
    }

    function getActiveStreams() external view returns (Stream[] memory) {
        Stream[] memory result = new Stream[](_activeStreamIds.length);
        for (uint256 i = 0; i < _activeStreamIds.length; i++) {
            result[i] = _streams[_activeStreamIds[i]];
        }
        return result;
    }

    function streamBalance(uint256 streamId) external view returns (uint256) {
        Stream memory stream = _streams[streamId];
        require(stream.id != 0, "RewardScheduler: stream not found");
        if (!stream.active) return 0;

        uint256 effectiveEnd = stream.endTime > 0
            ? _min(block.timestamp, stream.endTime)
            : block.timestamp;

        if (effectiveEnd <= stream.lastDripTime) return 0;

        uint256 elapsed = effectiveEnd - stream.lastDripTime;
        uint256 accrued = elapsed * stream.emissionPerSecond;

        uint256 balance = IERC20(stream.rewardToken).balanceOf(address(this));
        return accrued > balance ? balance : accrued;
    }

    function getStreamCount() external view returns (uint256) {
        return _streamCount;
    }

    // ═══════════════════════════════════════════════════════════════
    //  INTERNAL
    // ═══════════════════════════════════════════════════════════════

    function _removeActiveStream(uint256 streamId) internal {
        for (uint256 i = 0; i < _activeStreamIds.length; i++) {
            if (_activeStreamIds[i] == streamId) {
                _activeStreamIds[i] = _activeStreamIds[_activeStreamIds.length - 1];
                _activeStreamIds.pop();
                return;
            }
        }
    }

    function _min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }
}`,
  },
  {
    name: "LightningGovernor",
    fileName: "LightningGovernor.sol",
    description:
      "Fast-track governance with Platinum-tier voting, whitelisted call targets, configurable quorum, execution delay, and guardian cancellation.",
    lines: 287,
    source: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "./interfaces/ILightningGovernor.sol";
import "./interfaces/IStakingManager.sol";

contract LightningGovernor is Initializable, UUPSUpgradeable, AccessControlUpgradeable, ReentrancyGuardUpgradeable, PausableUpgradeable, ILightningGovernor {
    bytes32 public constant EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE");
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");

    // Safety bounds
    uint256 public constant MIN_QUORUM = 2;
    uint256 public constant MAX_QUORUM = 20;
    uint256 public constant MIN_EXECUTION_DELAY = 10 minutes;
    uint256 public constant MAX_EXECUTION_DELAY = 6 hours;
    uint256 public constant MIN_VOTING_WINDOW = 1 hours;
    uint256 public constant MAX_VOTING_WINDOW = 7 days;
    uint256 public constant MIN_EXECUTION_WINDOW = 1 hours;
    uint256 public constant MAX_EXECUTION_WINDOW = 48 hours;
    uint256 public constant PROPOSAL_COOLDOWN = 10 minutes;

    IStakingManager public stakingManager;

    uint256 public quorum = 3;
    uint256 public executionDelay = 15 minutes;
    uint256 public votingWindow = 24 hours;
    uint256 public executionWindow = 6 hours;

    uint256 private _nextProposalId = 1;

    // proposalId => Proposal
    mapping(uint256 => Proposal) private _proposals;
    // proposalId => voter => hasVoted
    mapping(uint256 => mapping(address => bool)) private _votes;
    // target => selector => whitelisted
    mapping(address => mapping(bytes4 => bool)) private _whitelist;
    // proposer => last proposal timestamp
    mapping(address => uint256) private _lastProposalTime;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _stakingManager,
        address _admin,
        address[] memory _executors,
        address _guardian
    ) public initializer {
        require(_stakingManager != address(0), "LightningGovernor: zero staking manager");
        require(_admin != address(0), "LightningGovernor: zero admin");
        require(_guardian != address(0), "LightningGovernor: zero guardian");
        require(_executors.length > 0, "LightningGovernor: no executors");

        __UUPSUpgradeable_init();
        __AccessControl_init();
        __ReentrancyGuard_init();
        __Pausable_init();

        _nextProposalId = 1;
        quorum = 3;
        executionDelay = 15 minutes;
        votingWindow = 24 hours;
        executionWindow = 6 hours;

        stakingManager = IStakingManager(_stakingManager);

        // Admin (TreasuryGovernor) gets sole DEFAULT_ADMIN_ROLE
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);

        // Executors (founding agents)
        for (uint256 i = 0; i < _executors.length; i++) {
            require(_executors[i] != address(0), "LightningGovernor: zero executor");
            _grantRole(EXECUTOR_ROLE, _executors[i]);
        }

        // Guardian
        _grantRole(GUARDIAN_ROLE, _guardian);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}

    // ── Proposal lifecycle ─────────────────────────────────────────

    function createProposal(
        address target,
        bytes calldata data,
        string calldata description
    ) external whenNotPaused returns (uint256) {
        require(
            stakingManager.getTier(msg.sender) == IStakingManager.Tier.Platinum,
            "LightningGovernor: not Platinum"
        );
        require(target != address(this), "LightningGovernor: no self-calls");
        require(data.length >= 4, "LightningGovernor: calldata too short");
        require(
            _lastProposalTime[msg.sender] == 0 ||
            block.timestamp >= _lastProposalTime[msg.sender] + PROPOSAL_COOLDOWN,
            "LightningGovernor: cooldown active"
        );

        bytes4 selector = bytes4(data[:4]);
        require(_whitelist[target][selector], "LightningGovernor: not whitelisted");

        uint256 proposalId = _nextProposalId++;
        _lastProposalTime[msg.sender] = block.timestamp;

        Proposal storage p = _proposals[proposalId];
        p.id = proposalId;
        p.proposer = msg.sender;
        p.target = target;
        p.callData = data;
        p.description = description;
        p.status = ProposalStatus.Active;
        p.voteCount = 1; // auto-vote
        p.createdAt = block.timestamp;
        p.votingDeadline = block.timestamp + votingWindow;

        _votes[proposalId][msg.sender] = true;

        emit ProposalCreated(proposalId, msg.sender, target, selector, description);
        emit Voted(proposalId, msg.sender, 1);

        // Check if auto-approved (quorum = 1 edge case)
        if (p.voteCount >= quorum) {
            _approve(p);
        }

        return proposalId;
    }

    function vote(uint256 proposalId) external whenNotPaused {
        require(
            stakingManager.getTier(msg.sender) == IStakingManager.Tier.Platinum,
            "LightningGovernor: not Platinum"
        );

        Proposal storage p = _proposals[proposalId];
        require(p.id != 0, "LightningGovernor: proposal not found");
        require(p.status == ProposalStatus.Active, "LightningGovernor: not active");
        require(block.timestamp <= p.votingDeadline, "LightningGovernor: voting closed");
        require(!_votes[proposalId][msg.sender], "LightningGovernor: already voted");

        _votes[proposalId][msg.sender] = true;
        p.voteCount++;

        emit Voted(proposalId, msg.sender, p.voteCount);

        if (p.voteCount >= quorum) {
            _approve(p);
        }
    }

    function execute(uint256 proposalId) external onlyRole(EXECUTOR_ROLE) nonReentrant whenNotPaused {
        Proposal storage p = _proposals[proposalId];
        require(p.status == ProposalStatus.Approved, "LightningGovernor: not approved");
        require(block.timestamp >= p.approvedAt + executionDelay, "LightningGovernor: delay not met");
        require(block.timestamp <= p.executionDeadline, "LightningGovernor: execution expired");

        // Re-validate whitelist at execution time
        bytes4 selector;
        bytes memory cd = p.callData;
        assembly { selector := mload(add(cd, 32)) }
        require(_whitelist[p.target][selector], "LightningGovernor: whitelist revoked");

        p.status = ProposalStatus.Executed;

        (bool success, bytes memory returnData) = p.target.call(p.callData);
        require(success, string(abi.encodePacked("LightningGovernor: execution failed: ", returnData)));

        emit ProposalExecuted(proposalId, msg.sender);
    }

    function cancel(uint256 proposalId) external {
        Proposal storage p = _proposals[proposalId];
        require(p.id != 0, "LightningGovernor: proposal not found");
        require(
            p.status == ProposalStatus.Active || p.status == ProposalStatus.Approved,
            "LightningGovernor: not cancellable"
        );
        require(
            msg.sender == p.proposer || hasRole(GUARDIAN_ROLE, msg.sender),
            "LightningGovernor: unauthorized"
        );

        p.status = ProposalStatus.Cancelled;
        emit ProposalCancelled(proposalId, msg.sender);
    }

    // ── Admin config ───────────────────────────────────────────────

    function setWhitelisted(address target, bytes4 selector, bool allowed) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(target != address(this), "LightningGovernor: cannot whitelist self");
        require(target != address(0), "LightningGovernor: zero target");
        _whitelist[target][selector] = allowed;
        emit WhitelistUpdated(target, selector, allowed);
    }

    function setQuorum(uint256 newQuorum) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newQuorum >= MIN_QUORUM && newQuorum <= MAX_QUORUM, "LightningGovernor: quorum out of bounds");
        emit QuorumUpdated(quorum, newQuorum);
        quorum = newQuorum;
    }

    function setExecutionDelay(uint256 newDelay) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(
            newDelay >= MIN_EXECUTION_DELAY && newDelay <= MAX_EXECUTION_DELAY,
            "LightningGovernor: delay out of bounds"
        );
        emit ExecutionDelayUpdated(executionDelay, newDelay);
        executionDelay = newDelay;
    }

    function setVotingWindow(uint256 newWindow) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(
            newWindow >= MIN_VOTING_WINDOW && newWindow <= MAX_VOTING_WINDOW,
            "LightningGovernor: voting window out of bounds"
        );
        emit VotingWindowUpdated(votingWindow, newWindow);
        votingWindow = newWindow;
    }

    function setExecutionWindow(uint256 newWindow) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(
            newWindow >= MIN_EXECUTION_WINDOW && newWindow <= MAX_EXECUTION_WINDOW,
            "LightningGovernor: execution window out of bounds"
        );
        emit ExecutionWindowUpdated(executionWindow, newWindow);
        executionWindow = newWindow;
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // ── Views ──────────────────────────────────────────────────────

    function getProposal(uint256 proposalId) external view returns (Proposal memory) {
        require(_proposals[proposalId].id != 0, "LightningGovernor: proposal not found");
        return _proposals[proposalId];
    }

    function hasVoted(uint256 proposalId, address voter) external view returns (bool) {
        return _votes[proposalId][voter];
    }

    function isWhitelisted(address target, bytes4 selector) external view returns (bool) {
        return _whitelist[target][selector];
    }

    function getEffectiveStatus(uint256 proposalId) external view returns (ProposalStatus) {
        Proposal storage p = _proposals[proposalId];
        require(p.id != 0, "LightningGovernor: proposal not found");

        if (p.status == ProposalStatus.Active && block.timestamp > p.votingDeadline) {
            return ProposalStatus.Expired;
        }
        if (p.status == ProposalStatus.Approved && block.timestamp > p.executionDeadline) {
            return ProposalStatus.Expired;
        }
        return p.status;
    }

    function proposalCount() external view returns (uint256) {
        return _nextProposalId - 1;
    }

    // ── Internal ───────────────────────────────────────────────────

    function _approve(Proposal storage p) internal {
        p.status = ProposalStatus.Approved;
        p.approvedAt = block.timestamp;
        p.executionDeadline = block.timestamp + executionDelay + executionWindow;
        emit ProposalApproved(p.id, p.executionDeadline);
    }
}`,
  },
  {
    name: "TeamVesting",
    fileName: "TeamVesting.sol",
    description:
      "Linear token vesting with cliff for team allocations. Supports revocation of unvested tokens and beneficiary rotation.",
    lines: 137,
    source: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title TeamVesting
 * @notice Linear vesting with cliff for team token allocation.
 *         150M LOB, 3-year duration, 6-month cliff, revocable by admin.
 *
 *         Timeline:
 *           [deploy] → [+6mo cliff] → [linear vest over remaining 2.5yr] → [+3yr fully vested]
 *
 *         Admin (TreasuryGovernor) can:
 *           - Revoke unvested tokens (returns to specified address)
 *           - Rotate beneficiary wallet
 *           - Set total allocation (one-time, after funding)
 */
contract TeamVesting is Initializable, UUPSUpgradeable, AccessControlUpgradeable {
    using SafeERC20 for IERC20;

    IERC20 public token;
    address public beneficiary;
    uint256 public start;
    uint256 public cliffEnd;
    uint256 public duration;
    uint256 public totalAllocation;
    uint256 public released;
    bool public revoked;
    bool public allocationSet;

    event TokensReleased(uint256 amount);
    event VestingRevoked(address returnTo, uint256 returned);
    event BeneficiaryUpdated(address indexed newBeneficiary);
    event AllocationSet(uint256 amount);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _token,
        address _beneficiary,
        uint256 _start,
        uint256 _cliff,
        uint256 _duration
    ) public initializer {
        require(_token != address(0), "TeamVesting: zero token");
        require(_beneficiary != address(0), "TeamVesting: zero beneficiary");
        require(_cliff <= _duration, "TeamVesting: cliff > duration");
        require(_duration > 0, "TeamVesting: zero duration");

        __UUPSUpgradeable_init();
        __AccessControl_init();

        token = IERC20(_token);
        beneficiary = _beneficiary;
        start = _start;
        cliffEnd = _start + _cliff;
        duration = _duration;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /// @notice Set the total allocation amount. Can only be called once, after funding.
    function setTotalAllocation(uint256 _amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(!allocationSet, "TeamVesting: already set");
        require(_amount > 0, "TeamVesting: zero amount");
        totalAllocation = _amount;
        allocationSet = true;
        emit AllocationSet(_amount);
    }

    /// @notice Amount that has vested up to now.
    function vestedAmount() public view returns (uint256) {
        if (block.timestamp < cliffEnd) return 0;
        if (totalAllocation == 0) return 0;

        uint256 elapsed = block.timestamp - start;
        if (elapsed >= duration) return totalAllocation;

        return (totalAllocation * elapsed) / duration;
    }

    /// @notice Amount currently releasable (vested minus already released).
    function releasable() external view returns (uint256) {
        return vestedAmount() - released;
    }

    /// @notice Release vested tokens to beneficiary.
    function release() external {
        require(!revoked, "TeamVesting: revoked");
        require(allocationSet, "TeamVesting: allocation not set");

        uint256 amount = vestedAmount() - released;
        require(amount > 0, "TeamVesting: nothing to release");

        released += amount;
        token.safeTransfer(beneficiary, amount);

        emit TokensReleased(amount);
    }

    /// @notice Revoke unvested tokens. Only admin.
    function revoke(address returnTo) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(!revoked, "TeamVesting: already revoked");
        require(returnTo != address(0), "TeamVesting: zero return address");

        revoked = true;

        uint256 vested = vestedAmount();
        uint256 balance = token.balanceOf(address(this));
        uint256 owed = vested - released;
        uint256 toReturn = balance > owed ? balance - owed : 0;

        if (toReturn > 0) {
            token.safeTransfer(returnTo, toReturn);
        }

        emit VestingRevoked(returnTo, toReturn);
    }

    /// @notice Update the beneficiary address. Only admin.
    function setBeneficiary(address _beneficiary) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_beneficiary != address(0), "TeamVesting: zero beneficiary");
        beneficiary = _beneficiary;
        emit BeneficiaryUpdated(_beneficiary);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}
}`,
  },
  {
    name: "ReviewRegistry",
    fileName: "ReviewRegistry.sol",
    description:
      "On-chain review system for completed escrow jobs with 1-5 ratings, immutable reviews, and per-address average rating tracking.",
    lines: 127,
    source: `// SPDX-License-Identifier: MIT
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
}`,
  },
  {
    name: "MultiPartyEscrow",
    fileName: "MultiPartyEscrow.sol",
    description:
      "Multi-seller job groups with per-job escrow via EscrowEngine, buyer proxy lifecycle actions, and dispute refund claiming.",
    lines: 245,
    source: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IMultiPartyEscrow} from "./interfaces/IMultiPartyEscrow.sol";
import {IEscrowEngine} from "./interfaces/IEscrowEngine.sol";
import {IDisputeArbitration} from "./interfaces/IDisputeArbitration.sol";
import {ISybilGuard} from "./interfaces/ISybilGuard.sol";

contract MultiPartyEscrow is IMultiPartyEscrow, Initializable, UUPSUpgradeable, OwnableUpgradeable, AccessControlUpgradeable, ReentrancyGuardUpgradeable, PausableUpgradeable {
    using SafeERC20 for IERC20;

    uint256 public constant MAX_SELLERS = 10;

    IEscrowEngine public ESCROW_ENGINE;
    IDisputeArbitration public DISPUTE_ARBITRATION;
    IERC20 public LOB_TOKEN;
    ISybilGuard public SYBIL_GUARD;

    uint256 private _nextGroupId = 1;

    mapping(uint256 => JobGroup) private _groups;
    mapping(uint256 => uint256[]) private _groupJobIds;
    mapping(uint256 => uint256) private _jobToGroup;
    mapping(uint256 => bool) private _refundClaimed;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _escrowEngine, address _disputeArbitration, address _lobToken, address _sybilGuard) public virtual initializer {
        require(_escrowEngine != address(0), "MultiPartyEscrow: zero escrowEngine");
        require(_disputeArbitration != address(0), "MultiPartyEscrow: zero disputeArbitration");
        require(_lobToken != address(0), "MultiPartyEscrow: zero lobToken");
        require(_sybilGuard != address(0), "MultiPartyEscrow: zero sybilGuard");

        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();
        __AccessControl_init();
        __ReentrancyGuard_init();
        __Pausable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

        _nextGroupId = 1;

        ESCROW_ENGINE = IEscrowEngine(_escrowEngine);
        DISPUTE_ARBITRATION = IDisputeArbitration(_disputeArbitration);
        LOB_TOKEN = IERC20(_lobToken);
        SYBIL_GUARD = ISybilGuard(_sybilGuard);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    function createMultiJob(
        address[] calldata sellers,
        uint256[] calldata shares,
        uint256[] calldata listingIds,
        address token,
        uint256 totalAmount,
        uint256 deliveryDeadline,
        string calldata metadataURI
    ) external nonReentrant whenNotPaused returns (uint256 groupId) {
        _validateArrays(sellers, shares, listingIds, totalAmount);
        require(!SYBIL_GUARD.checkBanned(msg.sender), "MultiPartyEscrow: buyer banned");

        IERC20(token).safeTransferFrom(msg.sender, address(this), totalAmount);

        groupId = _nextGroupId++;

        IERC20(token).forceApprove(address(ESCROW_ENGINE), totalAmount);
        uint256[] memory jobIds = _createJobs(groupId, msg.sender, sellers, shares, listingIds, token, deliveryDeadline);

        _groups[groupId] = JobGroup({
            groupId: groupId,
            buyer: msg.sender,
            totalAmount: totalAmount,
            token: token,
            jobCount: sellers.length,
            metadataURI: metadataURI,
            createdAt: block.timestamp
        });

        emit MultiJobCreated(groupId, msg.sender, jobIds, sellers, shares, token, totalAmount);
    }

    function _validateArrays(
        address[] calldata sellers,
        uint256[] calldata shares,
        uint256[] calldata listingIds,
        uint256 totalAmount
    ) internal pure {
        require(sellers.length == shares.length, "MultiPartyEscrow: array length mismatch");
        require(sellers.length == listingIds.length, "MultiPartyEscrow: listing array mismatch");
        require(sellers.length >= 2, "MultiPartyEscrow: min 2 sellers");
        require(sellers.length <= MAX_SELLERS, "MultiPartyEscrow: max sellers exceeded");

        uint256 sharesSum;
        for (uint256 i = 0; i < shares.length; i++) {
            sharesSum += shares[i];
        }
        require(sharesSum == totalAmount, "MultiPartyEscrow: shares sum mismatch");
    }

    function _createJobs(
        uint256 groupId,
        address buyer,
        address[] calldata sellers,
        uint256[] calldata shares,
        uint256[] calldata listingIds,
        address token,
        uint256 deliveryDeadline
    ) internal returns (uint256[] memory jobIds) {
        jobIds = new uint256[](sellers.length);
        for (uint256 i = 0; i < sellers.length; i++) {
            uint256 jobId = ESCROW_ENGINE.createJob(listingIds[i], sellers[i], shares[i], token, deliveryDeadline);
            // Set the real payer so slashed stake goes to the real buyer
            ESCROW_ENGINE.setJobPayer(jobId, buyer);
            jobIds[i] = jobId;
            _groupJobIds[groupId].push(jobId);
            _jobToGroup[jobId] = groupId;
        }
    }

    /// @notice Proxy: confirm delivery on behalf of the real buyer
    function confirmDelivery(uint256 jobId) external nonReentrant whenNotPaused {
        uint256 groupId = _jobToGroup[jobId];
        require(groupId != 0, "MultiPartyEscrow: job not in group");
        require(_groups[groupId].buyer == msg.sender, "MultiPartyEscrow: not buyer");
        ESCROW_ENGINE.confirmDelivery(jobId);
    }

    /// @notice Proxy: initiate dispute on behalf of the real buyer
    function initiateDispute(uint256 jobId, string calldata evidenceURI) external nonReentrant whenNotPaused {
        uint256 groupId = _jobToGroup[jobId];
        require(groupId != 0, "MultiPartyEscrow: job not in group");
        require(_groups[groupId].buyer == msg.sender, "MultiPartyEscrow: not buyer");
        ESCROW_ENGINE.initiateDispute(jobId, evidenceURI);
    }

    /// @notice Proxy: cancel job on behalf of the real buyer after delivery timeout
    function cancelJob(uint256 jobId) external nonReentrant whenNotPaused {
        uint256 groupId = _jobToGroup[jobId];
        require(groupId != 0, "MultiPartyEscrow: job not in group");
        require(_groups[groupId].buyer == msg.sender, "MultiPartyEscrow: not buyer");

        // Cache token before cancel (token field survives cancelJob)
        IEscrowEngine.Job memory job = ESCROW_ENGINE.getJob(jobId);
        address token = job.token;

        uint256 refundAmount = ESCROW_ENGINE.cancelJob(jobId);

        // Forward cancellation refund to the real buyer
        if (refundAmount > 0) {
            IERC20(token).safeTransfer(msg.sender, refundAmount);
        }
    }

    /// @notice Claim escrow refund for a resolved dispute (BuyerWins or Draw)
    function claimRefund(uint256 jobId) external nonReentrant whenNotPaused {
        uint256 groupId = _jobToGroup[jobId];
        require(groupId != 0, "MultiPartyEscrow: job not in group");
        require(_groups[groupId].buyer == msg.sender, "MultiPartyEscrow: not buyer");
        require(!_refundClaimed[jobId], "MultiPartyEscrow: already claimed");

        IEscrowEngine.Job memory job = ESCROW_ENGINE.getJob(jobId);
        require(job.status == IEscrowEngine.JobStatus.Resolved, "MultiPartyEscrow: not resolved");

        uint256 disputeId = ESCROW_ENGINE.getJobDisputeId(jobId);
        IDisputeArbitration.Dispute memory dispute = DISPUTE_ARBITRATION.getDispute(disputeId);

        uint256 refundAmount;
        if (dispute.ruling == IDisputeArbitration.Ruling.BuyerWins) {
            refundAmount = job.amount;
        } else if (dispute.ruling == IDisputeArbitration.Ruling.Draw) {
            uint256 half = job.amount / 2;
            uint256 halfFee = job.fee / 2;
            refundAmount = half - halfFee;
        } else {
            revert("MultiPartyEscrow: no buyer refund");
        }

        _refundClaimed[jobId] = true;
        IERC20(job.token).safeTransfer(msg.sender, refundAmount);

        emit RefundClaimed(jobId, groupId, msg.sender, refundAmount);
    }

    function getGroup(uint256 groupId) external view returns (JobGroup memory) {
        require(_groups[groupId].groupId != 0, "MultiPartyEscrow: group not found");
        return _groups[groupId];
    }

    function getGroupStatus(uint256 groupId) external view returns (GroupStatus) {
        require(_groups[groupId].groupId != 0, "MultiPartyEscrow: group not found");

        uint256[] memory jobIds = _groupJobIds[groupId];
        bool allConfirmed = true;
        bool anyDisputed = false;

        for (uint256 i = 0; i < jobIds.length; i++) {
            IEscrowEngine.Job memory job = ESCROW_ENGINE.getJob(jobIds[i]);
            if (job.status == IEscrowEngine.JobStatus.Disputed) {
                anyDisputed = true;
            }
            if (
                job.status != IEscrowEngine.JobStatus.Confirmed &&
                job.status != IEscrowEngine.JobStatus.Released &&
                job.status != IEscrowEngine.JobStatus.Resolved
            ) {
                allConfirmed = false;
            }
        }

        if (anyDisputed) return GroupStatus.PartialDispute;
        if (allConfirmed) return GroupStatus.AllConfirmed;
        return GroupStatus.Active;
    }

    function getGroupJobIds(uint256 groupId) external view returns (uint256[] memory) {
        require(_groups[groupId].groupId != 0, "MultiPartyEscrow: group not found");
        return _groupJobIds[groupId];
    }

    function getJobGroup(uint256 jobId) external view returns (uint256) {
        return _jobToGroup[jobId];
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}`,
  },
  {
    name: "SubscriptionEngine",
    fileName: "SubscriptionEngine.sol",
    description:
      "Recurring payment subscriptions with configurable intervals, pause/resume, prorated cancellation, and reputation recording for high-value cycles.",
    lines: 256,
    source: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/ISubscriptionEngine.sol";
import "./interfaces/IReputationSystem.sol";
import "./interfaces/ISybilGuard.sol";

contract SubscriptionEngine is ISubscriptionEngine, Initializable, UUPSUpgradeable, OwnableUpgradeable, AccessControlUpgradeable, ReentrancyGuardUpgradeable, PausableUpgradeable {
    using SafeERC20 for IERC20;

    uint256 public constant USDC_FEE_BPS = 150; // 1.5%
    uint256 public constant MIN_INTERVAL = 1 hours;
    uint256 public constant MAX_PROCESSING_WINDOW = 7 days;
    uint256 public constant MIN_REPUTATION_VALUE = 50 ether; // 50 LOB minimum for reputation recording

    IERC20 public lobToken;
    IReputationSystem public reputationSystem;
    ISybilGuard public sybilGuard;
    address public treasury;

    uint256 private _nextSubscriptionId = 1;

    mapping(uint256 => Subscription) private _subscriptions;
    mapping(address => uint256[]) private _buyerSubscriptionIds;
    mapping(address => uint256[]) private _sellerSubscriptionIds;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _lobToken,
        address _reputationSystem,
        address _sybilGuard,
        address _treasury
    ) public virtual initializer {
        require(_lobToken != address(0), "SubscriptionEngine: zero lobToken");
        require(_reputationSystem != address(0), "SubscriptionEngine: zero reputationSystem");
        require(_sybilGuard != address(0), "SubscriptionEngine: zero sybilGuard");
        require(_treasury != address(0), "SubscriptionEngine: zero treasury");

        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();
        __AccessControl_init();
        __ReentrancyGuard_init();
        __Pausable_init();

        _nextSubscriptionId = 1;

        lobToken = IERC20(_lobToken);
        reputationSystem = IReputationSystem(_reputationSystem);
        sybilGuard = ISybilGuard(_sybilGuard);
        treasury = _treasury;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    function createSubscription(
        address seller,
        address token,
        uint256 amount,
        uint256 interval,
        uint256 maxCycles,
        uint256 listingId,
        string calldata metadataURI
    ) external nonReentrant whenNotPaused returns (uint256 id) {
        require(msg.sender != seller, "SubscriptionEngine: buyer is seller");
        require(amount > 0, "SubscriptionEngine: zero amount");
        require(interval >= MIN_INTERVAL, "SubscriptionEngine: interval too short");
        require(!sybilGuard.checkBanned(msg.sender), "SubscriptionEngine: buyer banned");
        require(!sybilGuard.checkBanned(seller), "SubscriptionEngine: seller banned");

        id = _nextSubscriptionId++;

        _subscriptions[id] = Subscription({
            id: id,
            buyer: msg.sender,
            seller: seller,
            token: token,
            amount: amount,
            interval: interval,
            nextDue: block.timestamp + interval,
            maxCycles: maxCycles,
            cyclesCompleted: 1,
            status: SubscriptionStatus.Active,
            listingId: listingId,
            metadataURI: metadataURI,
            createdAt: block.timestamp
        });

        _buyerSubscriptionIds[msg.sender].push(id);
        _sellerSubscriptionIds[seller].push(id);

        // Pull first payment
        (uint256 sellerAmount, uint256 fee) = _calculateFee(token, amount);
        IERC20(token).safeTransferFrom(msg.sender, seller, sellerAmount);
        if (fee > 0) {
            IERC20(token).safeTransferFrom(msg.sender, treasury, fee);
        }

        // Check if completed after first cycle
        if (maxCycles == 1) {
            _subscriptions[id].status = SubscriptionStatus.Completed;
            emit SubscriptionCompleted(id);
        }

        emit SubscriptionCreated(id, msg.sender, seller, token, amount, interval, maxCycles);
    }

    function processPayment(uint256 subscriptionId) external nonReentrant whenNotPaused {
        Subscription storage sub = _subscriptions[subscriptionId];
        require(sub.id != 0, "SubscriptionEngine: not found");
        require(sub.status == SubscriptionStatus.Active, "SubscriptionEngine: not active");
        require(block.timestamp >= sub.nextDue, "SubscriptionEngine: not due");
        require(
            block.timestamp <= sub.nextDue + MAX_PROCESSING_WINDOW,
            "SubscriptionEngine: processing window expired"
        );

        // Pull payment from buyer
        (uint256 sellerAmount, uint256 fee) = _calculateFee(sub.token, sub.amount);
        IERC20(sub.token).safeTransferFrom(sub.buyer, sub.seller, sellerAmount);
        if (fee > 0) {
            IERC20(sub.token).safeTransferFrom(sub.buyer, treasury, fee);
        }

        // Record reputation only if value meets threshold
        if (_normalizeAmount(sub.amount, sub.token) >= MIN_REPUTATION_VALUE) {
            reputationSystem.recordCompletion(sub.seller, sub.buyer);
        }

        sub.cyclesCompleted++;

        emit PaymentProcessed(subscriptionId, sub.cyclesCompleted, sub.amount, fee);

        // Check completion
        if (sub.maxCycles > 0 && sub.cyclesCompleted >= sub.maxCycles) {
            sub.status = SubscriptionStatus.Completed;
            emit SubscriptionCompleted(subscriptionId);
        } else {
            // Advance from current time, not old due date,
            // to prevent accelerated catch-up charging
            sub.nextDue = block.timestamp + sub.interval;
        }
    }

    function cancelSubscription(uint256 subscriptionId) external nonReentrant whenNotPaused {
        Subscription storage sub = _subscriptions[subscriptionId];
        require(sub.id != 0, "SubscriptionEngine: not found");
        require(
            msg.sender == sub.buyer || msg.sender == sub.seller,
            "SubscriptionEngine: not authorized"
        );
        require(
            sub.status == SubscriptionStatus.Active || sub.status == SubscriptionStatus.Paused,
            "SubscriptionEngine: cannot cancel"
        );

        sub.status = SubscriptionStatus.Cancelled;

        emit SubscriptionCancelled(subscriptionId, msg.sender);
    }

    function pauseSubscription(uint256 subscriptionId) external nonReentrant whenNotPaused {
        Subscription storage sub = _subscriptions[subscriptionId];
        require(sub.id != 0, "SubscriptionEngine: not found");
        require(msg.sender == sub.buyer, "SubscriptionEngine: not buyer");
        require(sub.status == SubscriptionStatus.Active, "SubscriptionEngine: not active");

        sub.status = SubscriptionStatus.Paused;

        emit SubscriptionPaused(subscriptionId);
    }

    function resumeSubscription(uint256 subscriptionId) external nonReentrant whenNotPaused {
        Subscription storage sub = _subscriptions[subscriptionId];
        require(sub.id != 0, "SubscriptionEngine: not found");
        require(msg.sender == sub.buyer, "SubscriptionEngine: not buyer");
        require(sub.status == SubscriptionStatus.Paused, "SubscriptionEngine: not paused");

        sub.status = SubscriptionStatus.Active;
        sub.nextDue = block.timestamp + sub.interval;

        emit SubscriptionResumed(subscriptionId, sub.nextDue);
    }

    // ═══════════════════════════════════════════════════════════════
    //  VIEWS
    // ═══════════════════════════════════════════════════════════════

    function getSubscription(uint256 id) external view returns (Subscription memory) {
        require(_subscriptions[id].id != 0, "SubscriptionEngine: not found");
        return _subscriptions[id];
    }

    function getSubscriptionsByBuyer(address buyer) external view returns (uint256[] memory) {
        return _buyerSubscriptionIds[buyer];
    }

    function getSubscriptionsBySeller(address seller) external view returns (uint256[] memory) {
        return _sellerSubscriptionIds[seller];
    }

    // ═══════════════════════════════════════════════════════════════
    //  INTERNAL
    // ═══════════════════════════════════════════════════════════════

    /// @dev Normalize token amount to 18 decimals for cross-token comparison.
    function _normalizeAmount(uint256 amount, address token) internal view returns (uint256) {
        if (token == address(lobToken)) return amount; // LOB is 18 decimals
        try IERC20Metadata(token).decimals() returns (uint8 dec) {
            if (dec < 18) {
                return amount * (10 ** (18 - dec));
            } else if (dec > 18) {
                return amount / (10 ** (dec - 18));
            }
        } catch {
            // If decimals() reverts, assume 18
        }
        return amount;
    }

    function _calculateFee(address token, uint256 amount) internal view returns (uint256 sellerAmount, uint256 fee) {
        if (token == address(lobToken)) {
            // 0% fee for LOB
            return (amount, 0);
        }
        fee = (amount * USDC_FEE_BPS) / 10000;
        sellerAmount = amount - fee;
    }

    // ═══════════════════════════════════════════════════════════════
    //  ADMIN
    // ═══════════════════════════════════════════════════════════════

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
}`,
  },
  {
    name: "BondingEngine",
    fileName: "BondingEngine.sol",
    description:
      "Protocol-owned liquidity via discounted LOB bonds with multi-market support, per-address caps, linear vesting, and tier-based discount bonuses.",
    lines: 339,
    source: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IBondingEngine.sol";
import "./interfaces/IStakingManager.sol";
import "./interfaces/ISybilGuard.sol";

/// @title BondingEngine
/// @notice Protocol-owned liquidity via discounted LOB bonds.
///         Treasury deposits LOB -> users buy at discount with USDC/LP ->
///         protocol keeps quote tokens -> users claim LOB over vesting period.
contract BondingEngine is IBondingEngine, Initializable, UUPSUpgradeable, OwnableUpgradeable, AccessControlUpgradeable, ReentrancyGuardUpgradeable, PausableUpgradeable {
    using SafeERC20 for IERC20;

    bytes32 public constant MARKET_ADMIN_ROLE = keccak256("MARKET_ADMIN_ROLE");

    uint256 public constant SILVER_BONUS_BPS = 100;
    uint256 public constant GOLD_BONUS_BPS = 200;
    uint256 public constant PLATINUM_BONUS_BPS = 300;
    uint256 public constant MIN_VESTING_PERIOD = 7 days;
    uint256 public constant MAX_DISCOUNT_BPS = 2000;

    IERC20 public lobToken;
    IStakingManager public stakingManager;
    ISybilGuard public sybilGuard;
    address public treasury;

    uint256 private _nextMarketId = 1;
    uint256 private _nextBondId = 1;

    mapping(uint256 => BondMarket) private _markets;
    mapping(uint256 => BondPosition) private _bonds;
    mapping(address => uint256[]) private _userBonds;
    uint256 private _totalOutstandingLOB;
    mapping(uint256 => mapping(address => uint256)) private _purchased; // marketId -> buyer -> total LOB purchased

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _lobToken,
        address _stakingManager,
        address _sybilGuard,
        address _treasury
    ) public virtual initializer {
        require(_lobToken != address(0), "BondingEngine: zero lobToken");
        require(_stakingManager != address(0), "BondingEngine: zero stakingManager");
        require(_sybilGuard != address(0), "BondingEngine: zero sybilGuard");
        require(_treasury != address(0), "BondingEngine: zero treasury");

        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();
        __AccessControl_init();
        __ReentrancyGuard_init();
        __Pausable_init();

        _nextMarketId = 1;
        _nextBondId = 1;

        lobToken = IERC20(_lobToken);
        stakingManager = IStakingManager(_stakingManager);
        sybilGuard = ISybilGuard(_sybilGuard);
        treasury = _treasury;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // ═══════════════════════════════════════════════════════════════
    //  ADMIN — MARKETS
    // ═══════════════════════════════════════════════════════════════

    function createMarket(
        address quoteToken,
        uint256 pricePer1LOB,
        uint256 discountBps,
        uint256 vestingPeriod,
        uint256 capacity,
        uint256 addressCap
    ) external onlyRole(MARKET_ADMIN_ROLE) returns (uint256 marketId) {
        require(quoteToken != address(0), "BondingEngine: zero quoteToken");
        require(pricePer1LOB > 0, "BondingEngine: zero price");
        require(discountBps <= MAX_DISCOUNT_BPS, "BondingEngine: discount too high");
        require(vestingPeriod >= MIN_VESTING_PERIOD, "BondingEngine: vesting too short");
        require(capacity > 0, "BondingEngine: zero capacity");

        marketId = _nextMarketId++;
        _markets[marketId] = BondMarket({
            quoteToken: quoteToken,
            pricePer1LOB: pricePer1LOB,
            discountBps: discountBps,
            vestingPeriod: vestingPeriod,
            capacity: capacity,
            sold: 0,
            active: true,
            addressCap: addressCap
        });

        emit MarketCreated(marketId, quoteToken, pricePer1LOB, discountBps, vestingPeriod, capacity);
    }

    function closeMarket(uint256 marketId) external onlyRole(MARKET_ADMIN_ROLE) {
        BondMarket storage market = _markets[marketId];
        require(market.quoteToken != address(0), "BondingEngine: market does not exist");
        require(market.active, "BondingEngine: already closed");

        market.active = false;
        emit MarketClosed(marketId);
    }

    function updateMarketPrice(uint256 marketId, uint256 newPrice) external onlyRole(MARKET_ADMIN_ROLE) {
        BondMarket storage market = _markets[marketId];
        require(market.quoteToken != address(0), "BondingEngine: market does not exist");
        require(market.active, "BondingEngine: market closed");
        require(newPrice > 0, "BondingEngine: zero price");

        market.pricePer1LOB = newPrice;
        emit MarketPriceUpdated(marketId, newPrice);
    }

    // ═══════════════════════════════════════════════════════════════
    //  ADMIN — FUNDING
    // ═══════════════════════════════════════════════════════════════

    function depositLOB(uint256 amount) external onlyRole(MARKET_ADMIN_ROLE) {
        require(amount > 0, "BondingEngine: zero amount");
        lobToken.safeTransferFrom(msg.sender, address(this), amount);
        emit LOBDeposited(msg.sender, amount);
    }

    function withdrawLOB(uint256 amount) external onlyRole(MARKET_ADMIN_ROLE) {
        require(amount > 0, "BondingEngine: zero amount");
        uint256 surplus = lobToken.balanceOf(address(this)) - _totalOutstandingLOB;
        require(amount <= surplus, "BondingEngine: exceeds surplus");

        lobToken.safeTransfer(treasury, amount);
        emit LOBWithdrawn(treasury, amount);
    }

    function sweepQuoteToken(address token) external onlyRole(MARKET_ADMIN_ROLE) {
        require(token != address(lobToken), "BondingEngine: cannot sweep LOB");

        uint256 balance = IERC20(token).balanceOf(address(this));
        require(balance > 0, "BondingEngine: nothing to sweep");

        IERC20(token).safeTransfer(treasury, balance);
        emit QuoteTokenSwept(token, balance);
    }

    // ═══════════════════════════════════════════════════════════════
    //  CORE
    // ═══════════════════════════════════════════════════════════════

    function purchase(
        uint256 marketId,
        uint256 quoteAmount
    ) external nonReentrant whenNotPaused returns (uint256 bondId) {
        require(!sybilGuard.checkBanned(msg.sender), "BondingEngine: banned");
        require(quoteAmount > 0, "BondingEngine: zero quoteAmount");

        BondMarket storage market = _markets[marketId];
        require(market.active, "BondingEngine: market not active");

        uint256 discount = _effectiveDiscount(marketId, msg.sender);
        uint256 discountedPrice = market.pricePer1LOB * (10000 - discount) / 10000;
        require(discountedPrice > 0, "BondingEngine: price rounds to zero");

        // Use balance-delta to defend against fee-on-transfer tokens
        uint256 balBefore = IERC20(market.quoteToken).balanceOf(address(this));
        IERC20(market.quoteToken).safeTransferFrom(msg.sender, address(this), quoteAmount);
        uint256 received = IERC20(market.quoteToken).balanceOf(address(this)) - balBefore;

        // Calculate payout based on actual tokens received (not nominal quoteAmount)
        uint256 payout = received * 1e18 / discountedPrice;

        require(market.sold + payout <= market.capacity, "BondingEngine: exceeds capacity");
        require(
            _totalOutstandingLOB + payout <= lobToken.balanceOf(address(this)),
            "BondingEngine: insufficient LOB reserve"
        );

        // Per-address cap enforcement
        if (market.addressCap > 0) {
            require(
                _purchased[marketId][msg.sender] + payout <= market.addressCap,
                "BondingEngine: exceeds address cap"
            );
        }
        _purchased[marketId][msg.sender] += payout;

        market.sold += payout;
        _totalOutstandingLOB += payout;

        bondId = _nextBondId++;
        _bonds[bondId] = BondPosition({
            marketId: marketId,
            owner: msg.sender,
            payout: payout,
            claimed: 0,
            vestStart: block.timestamp,
            vestEnd: block.timestamp + market.vestingPeriod
        });
        _userBonds[msg.sender].push(bondId);

        emit BondPurchased(bondId, marketId, msg.sender, received, payout, block.timestamp + market.vestingPeriod);
    }

    function claim(uint256 bondId) external nonReentrant whenNotPaused {
        _claim(bondId);
    }

    function claimMultiple(uint256[] calldata bondIds) external nonReentrant whenNotPaused {
        for (uint256 i = 0; i < bondIds.length; i++) {
            _claim(bondIds[i]);
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  VIEWS
    // ═══════════════════════════════════════════════════════════════

    function getMarket(uint256 marketId) external view returns (BondMarket memory) {
        return _markets[marketId];
    }

    function getBond(uint256 bondId) external view returns (BondPosition memory) {
        return _bonds[bondId];
    }

    function claimable(uint256 bondId) external view returns (uint256) {
        return _claimable(bondId);
    }

    function marketCount() external view returns (uint256) {
        return _nextMarketId - 1;
    }

    function bondCount() external view returns (uint256) {
        return _nextBondId - 1;
    }

    function totalOutstandingLOB() external view returns (uint256) {
        return _totalOutstandingLOB;
    }

    function availableLOB() external view returns (uint256) {
        uint256 balance = lobToken.balanceOf(address(this));
        return balance > _totalOutstandingLOB ? balance - _totalOutstandingLOB : 0;
    }

    function effectiveDiscount(uint256 marketId, address buyer) external view returns (uint256) {
        return _effectiveDiscount(marketId, buyer);
    }

    function getBondsByOwner(address owner) external view returns (uint256[] memory) {
        return _userBonds[owner];
    }

    function purchasedByAddress(uint256 marketId, address buyer) external view returns (uint256) {
        return _purchased[marketId][buyer];
    }

    // ═══════════════════════════════════════════════════════════════
    //  INTERNAL
    // ═══════════════════════════════════════════════════════════════

    function _claim(uint256 bondId) internal {
        BondPosition storage bond = _bonds[bondId];
        require(bond.owner == msg.sender, "BondingEngine: not bond owner");
        require(!sybilGuard.checkBanned(msg.sender), "BondingEngine: banned");

        uint256 amount = _claimable(bondId);
        require(amount > 0, "BondingEngine: nothing claimable");

        bond.claimed += amount;
        _totalOutstandingLOB -= amount;

        lobToken.safeTransfer(msg.sender, amount);
        emit BondClaimed(bondId, msg.sender, amount);
    }

    function _claimable(uint256 bondId) internal view returns (uint256) {
        BondPosition memory bond = _bonds[bondId];
        if (bond.payout == 0) return 0;

        uint256 vested;
        if (block.timestamp >= bond.vestEnd) {
            vested = bond.payout;
        } else {
            uint256 elapsed = block.timestamp - bond.vestStart;
            uint256 duration = bond.vestEnd - bond.vestStart;
            vested = bond.payout * elapsed / duration;
        }
        return vested - bond.claimed;
    }

    function _effectiveDiscount(uint256 marketId, address buyer) internal view returns (uint256) {
        uint256 base = _markets[marketId].discountBps;
        uint256 bonus = _tierBonusBps(buyer);
        uint256 total = base + bonus;
        return total > MAX_DISCOUNT_BPS ? MAX_DISCOUNT_BPS : total;
    }

    function _tierBonusBps(address buyer) internal view returns (uint256) {
        // No tier bonus if buyer has a pending unstake request
        IStakingManager.StakeInfo memory info = stakingManager.getStakeInfo(buyer);
        if (info.unstakeRequestAmount > 0) return 0;

        IStakingManager.Tier tier = stakingManager.getTier(buyer);
        if (tier == IStakingManager.Tier.Platinum) return PLATINUM_BONUS_BPS;
        if (tier == IStakingManager.Tier.Gold) return GOLD_BONUS_BPS;
        if (tier == IStakingManager.Tier.Silver) return SILVER_BONUS_BPS;
        return 0;
    }

    // ═══════════════════════════════════════════════════════════════
    //  ADMIN
    // ═══════════════════════════════════════════════════════════════

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
}`,
  },
  {
    name: "DirectiveBoard",
    fileName: "DirectiveBoard.sol",
    description:
      "On-chain directive bulletin board for governance-to-agent communication with typed directives, lazy expiry, and execution tracking.",
    lines: 179,
    source: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./interfaces/IDirectiveBoard.sol";

/**
 * @title DirectiveBoard
 * @notice On-chain directive posting for governance -> agent communication.
 *         Posters (governance, mods, admin) create directives; executors
 *         (agents) mark them as executed. Lazy expiry -- no gas cost for
 *         time-based expiration.
 */
contract DirectiveBoard is
    IDirectiveBoard,
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    AccessControlUpgradeable
{
    bytes32 public constant POSTER_ROLE = keccak256("POSTER_ROLE");
    bytes32 public constant EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE");

    address public sybilGuard;

    uint256 private _nextDirectiveId = 1;

    mapping(uint256 => Directive) private _directives;
    mapping(address => uint256[]) private _activeByTarget;
    mapping(DirectiveType => uint256[]) private _activeByType;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _sybilGuard, address initialOwner) public virtual initializer {
        require(_sybilGuard != address(0), "DirectiveBoard: zero sybilGuard");

        __Ownable_init(initialOwner);
        __AccessControl_init();
        __UUPSUpgradeable_init();

        _nextDirectiveId = 1;

        sybilGuard = _sybilGuard;
        _grantRole(DEFAULT_ADMIN_ROLE, initialOwner);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    function postDirective(
        DirectiveType directiveType,
        address target,
        bytes32 contentHash,
        string calldata contentURI,
        uint256 expiresAt
    ) external onlyRole(POSTER_ROLE) returns (uint256 id) {
        // Ban check on poster
        (bool ok, bytes memory data) = sybilGuard.staticcall(
            abi.encodeWithSignature("checkBanned(address)", msg.sender)
        );
        require(ok && !abi.decode(data, (bool)), "DirectiveBoard: poster banned");

        require(bytes(contentURI).length > 0, "DirectiveBoard: empty URI");
        if (expiresAt > 0) {
            require(expiresAt > block.timestamp, "DirectiveBoard: expired");
        }

        id = _nextDirectiveId++;

        _directives[id] = Directive({
            id: id,
            directiveType: directiveType,
            poster: msg.sender,
            target: target,
            contentHash: contentHash,
            contentURI: contentURI,
            status: DirectiveStatus.Active,
            createdAt: block.timestamp,
            expiresAt: expiresAt
        });

        _activeByTarget[target].push(id);
        _activeByType[directiveType].push(id);

        emit DirectivePosted(id, directiveType, msg.sender, target, contentHash, contentURI, expiresAt);
    }

    function markExecuted(uint256 id) external {
        Directive storage d = _directives[id];
        require(d.id != 0, "DirectiveBoard: not found");
        require(d.status == DirectiveStatus.Active, "DirectiveBoard: not active");
        require(
            hasRole(EXECUTOR_ROLE, msg.sender) || d.target == msg.sender,
            "DirectiveBoard: unauthorized"
        );

        d.status = DirectiveStatus.Executed;
        emit DirectiveExecuted(id, msg.sender);
    }

    function cancelDirective(uint256 id) external {
        Directive storage d = _directives[id];
        require(d.id != 0, "DirectiveBoard: not found");
        require(d.status == DirectiveStatus.Active, "DirectiveBoard: not active");
        require(
            hasRole(POSTER_ROLE, msg.sender) || d.poster == msg.sender,
            "DirectiveBoard: unauthorized"
        );

        d.status = DirectiveStatus.Cancelled;
        emit DirectiveCancelled(id, msg.sender);
    }

    function getDirective(uint256 id) external view returns (Directive memory) {
        require(_directives[id].id != 0, "DirectiveBoard: not found");
        return _directives[id];
    }

    function getActiveDirectives(address target) external view returns (uint256[] memory) {
        uint256[] storage targeted = _activeByTarget[target];
        uint256[] storage broadcasts = _activeByTarget[address(0)];

        uint256 total = targeted.length + broadcasts.length;
        uint256[] memory temp = new uint256[](total);
        uint256 count;

        for (uint256 i = 0; i < targeted.length; i++) {
            if (_isActiveDirective(targeted[i])) {
                temp[count++] = targeted[i];
            }
        }

        // Include broadcasts (target=address(0)) unless querying for address(0) itself
        if (target != address(0)) {
            for (uint256 i = 0; i < broadcasts.length; i++) {
                if (_isActiveDirective(broadcasts[i])) {
                    temp[count++] = broadcasts[i];
                }
            }
        }

        uint256[] memory result = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = temp[i];
        }
        return result;
    }

    function getDirectivesByType(DirectiveType directiveType) external view returns (uint256[] memory) {
        uint256[] storage ids = _activeByType[directiveType];
        uint256[] memory temp = new uint256[](ids.length);
        uint256 count;

        for (uint256 i = 0; i < ids.length; i++) {
            if (_isActiveDirective(ids[i])) {
                temp[count++] = ids[i];
            }
        }

        uint256[] memory result = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = temp[i];
        }
        return result;
    }

    function _isActiveDirective(uint256 id) private view returns (bool) {
        Directive storage d = _directives[id];
        if (d.status != DirectiveStatus.Active) return false;
        if (d.expiresAt > 0 && d.expiresAt <= block.timestamp) return false;
        return true;
    }
}`,
  },
  {
    name: "RolePayroll",
    fileName: "RolePayroll.sol",
    description:
      "ZK-proofed weekly payroll for arbitrators and moderators with uptime-scaled pay, abandonment detection, strike system, and USDC enrollment fees.",
    lines: 587,
    source: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IRolePayroll.sol";
import "./interfaces/IStakingManager.sol";
import "./interfaces/IDisputeArbitration.sol";
import "./interfaces/IInsurancePool.sol";
import "./verifiers/Groth16UptimeVerifier.sol";

/**
 * @title RolePayroll
 * @notice ZK-proofed weekly payroll for community arbitrators and moderators.
 *
 *         Participants enroll by paying a USDC certification fee and locking
 *         a minimum LOB stake. Each week, they generate a Groth16 proof of
 *         uptime (heartbeat Merkle tree) and claim LOB pay on-chain.
 *
 *         Founder agents (Sentinel, Arbiter, Steward) are exempt — they
 *         don't get paid, don't submit proofs, and can't be penalized.
 *
 *         Uptime pay scale:
 *           99.5%+ (2006+ intervals) → 100% pay
 *           95-99.4% (1915-2005)     → 75% pay
 *           90-94.9% (1814-1914)     → 50% pay
 *           80-89.9% (1613-1813)     → 25% pay + 1 strike
 *           50-79.9% (1008-1612)     → 0% pay + 2 strikes
 *           Below 50% (<1008)        → 0% pay + immediate suspension
 *
 *         Abandonment detection is permissionless:
 *           72h silence  → auto Strike 2
 *           7d silence   → role revoked, 25% stake slashed
 *           30d silence  → full stake forfeited to treasury
 *
 *         Treasury interaction:
 *           LOB payouts are pulled from TreasuryGovernor via transferFrom.
 *           The multisig approves a spending allowance to this contract once,
 *           then weekly claims draw from treasury permissionlessly.
 *           No periodic funding proposals needed.
 */
contract RolePayroll is IRolePayroll, Initializable, UUPSUpgradeable, OwnableUpgradeable, AccessControlUpgradeable, ReentrancyGuardUpgradeable, PausableUpgradeable {
    using SafeERC20 for IERC20;

    bytes32 public constant DISPUTE_ROLE = keccak256("DISPUTE_ROLE");

    // Uptime thresholds (out of 2016 five-minute intervals per week)
    uint256 public constant INTERVALS_PER_WEEK = 2016;
    uint256 public constant TIER_100_MIN = 2006;  // 99.5%+
    uint256 public constant TIER_75_MIN  = 1915;  // 95%+
    uint256 public constant TIER_50_MIN  = 1814;  // 90%+
    uint256 public constant TIER_25_MIN  = 1613;  // 80%+
    uint256 public constant TIER_0_MIN   = 1008;  // 50%+

    // Abandonment thresholds
    uint256 public constant ABANDON_72H = 72 hours;
    uint256 public constant ABANDON_7D  = 7 days;
    uint256 public constant ABANDON_30D = 30 days;

    // Slashing rates (basis points)
    uint256 public constant SLASH_7D_BPS  = 2500; // 25%
    uint256 public constant SLASH_30D_BPS = 10000; // 100%
    uint256 public constant SLASH_STRIKE4_BPS = 1000; // 10%

    // Resignation cooldown
    uint256 public constant RESIGN_COOLDOWN = 7 days;

    // Suspension duration
    uint256 public constant SUSPENSION_DURATION = 14 days;

    // Strike thresholds
    uint8 public constant MAX_STRIKES_BEFORE_REMOVAL = 4;
    uint8 public constant STRIKE_SUSPEND_THRESHOLD = 3;
    uint256 public constant STRIKE_WINDOW = 60 days;

    // Epoch config
    uint256 public genesisEpoch; // Sunday 00:00 UTC timestamp
    uint256 public constant EPOCH_DURATION = 7 days;

    // External contracts
    IERC20 public lobToken;
    IERC20 public usdcToken;
    IStakingManager public stakingManager;
    IDisputeArbitration public disputeArbitration;
    Groth16UptimeVerifier public uptimeVerifier;
    address public treasury; // TreasuryGovernor — LOB pulled via transferFrom
    IInsurancePool public insurancePool; // Split slashed funds 50/50 with treasury

    // State
    mapping(address => RoleSlot) private _roleSlots;
    mapping(uint8 => mapping(uint8 => RoleConfig)) private _roleConfigs;
    mapping(uint8 => mapping(uint8 => uint16)) private _filledSlots;
    mapping(address => mapping(uint256 => EpochClaim)) private _epochClaims;
    mapping(bytes32 => bool) public usedMerkleRoots;
    mapping(address => uint256) public lastHeartbeatTimestamp;
    mapping(address => bool) public founderAgents;

    // Arbitrator dispute participation tracking per epoch
    mapping(address => mapping(uint256 => uint256)) private _disputeCount;
    mapping(address => mapping(uint256 => uint256)) private _majorityCount;

    // Resignation tracking
    mapping(address => uint256) private _resignedAt;

    // USDC cert fee accumulator
    uint256 public accumulatedCertFees;

    // V-001 FIX: Anchored epoch roots — only admin-posted roots are valid for claims
    bytes32 public constant ROOT_POSTER_ROLE = keccak256("ROOT_POSTER_ROLE");
    mapping(uint256 => uint256) public epochRoots; // epoch → authorized merkle root

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _lobToken,
        address _usdcToken,
        address _stakingManager,
        address _disputeArbitration,
        address _uptimeVerifier,
        address _treasury,
        address _insurancePool,
        uint256 _genesisEpoch
    ) public virtual initializer {
        require(_lobToken != address(0), "RP:zero lob");
        require(_usdcToken != address(0), "RP:zero usdc");
        require(_stakingManager != address(0), "RP:zero staking");
        require(_disputeArbitration != address(0), "RP:zero dispute");
        require(_uptimeVerifier != address(0), "RP:zero verifier");
        require(_treasury != address(0), "RP:zero treasury");
        require(_insurancePool != address(0), "RP:zero insurance");
        require(_genesisEpoch > 0, "RP:zero genesis");

        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();
        __AccessControl_init();
        __ReentrancyGuard_init();
        __Pausable_init();

        lobToken = IERC20(_lobToken);
        usdcToken = IERC20(_usdcToken);
        stakingManager = IStakingManager(_stakingManager);
        disputeArbitration = IDisputeArbitration(_disputeArbitration);
        uptimeVerifier = Groth16UptimeVerifier(_uptimeVerifier);
        treasury = _treasury;
        insurancePool = IInsurancePool(_insurancePool);
        genesisEpoch = _genesisEpoch;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function _authorizeUpgrade(address newImplementation) internal virtual override onlyOwner {}

    // ═══════════════════════════════════════════════════════════════
    // Epoch Root Management
    // ═══════════════════════════════════════════════════════════════

    /// @notice Post the canonical heartbeat Merkle root for a completed epoch.
    ///         Only callable by ROOT_POSTER_ROLE (trusted aggregator/oracle).
    function postEpochRoot(uint256 epoch, uint256 root) external onlyRole(ROOT_POSTER_ROLE) {
        require(epoch < currentEpoch(), "RP:epoch not ended");
        require(root != 0, "RP:zero root");
        require(epochRoots[epoch] == 0, "RP:root already posted");
        epochRoots[epoch] = root;
        emit EpochRootPosted(epoch, root);
    }

    event EpochRootPosted(uint256 indexed epoch, uint256 root);

    // ═══════════════════════════════════════════════════════════════
    // Enrollment
    // ═══════════════════════════════════════════════════════════════

    function enroll(uint8 roleType, uint8 rank) external nonReentrant whenNotPaused {
        require(!founderAgents[msg.sender], "RP:founder exempt");
        require(roleType <= uint8(RoleType.Moderator), "RP:invalid role type");
        require(rank <= uint8(RoleRank.Principal), "RP:invalid rank");
        require(_roleSlots[msg.sender].status == SlotStatus.Empty, "RP:already enrolled");

        // Arbitrators must be certified in DisputeArbitration
        if (RoleType(roleType) == RoleType.Arbitrator) {
            require(disputeArbitration.isCertified(msg.sender), "RP:not certified");
        }

        RoleConfig storage config = _roleConfigs[roleType][rank];
        require(config.maxSlots > 0, "RP:role not configured");
        require(_filledSlots[roleType][rank] < config.maxSlots, "RP:slots full");

        // Check user has sufficient stake
        uint256 userStake = stakingManager.getStake(msg.sender);
        require(userStake >= config.minStakeLob, "RP:insufficient stake");

        // Collect USDC certification fee
        if (config.certFeeUsdc > 0) {
            usdcToken.safeTransferFrom(msg.sender, address(this), config.certFeeUsdc);
            accumulatedCertFees += config.certFeeUsdc;
        }

        // Lock stake via StakingManager
        stakingManager.lockStake(msg.sender, config.minStakeLob);

        // Record slot
        _roleSlots[msg.sender] = RoleSlot({
            roleType: RoleType(roleType),
            rank: RoleRank(rank),
            status: SlotStatus.Active,
            enrolledAt: block.timestamp,
            suspendedUntil: 0,
            strikes: 0,
            stakedAmount: config.minStakeLob
        });

        _filledSlots[roleType][rank] += 1;
        lastHeartbeatTimestamp[msg.sender] = block.timestamp;

        emit RoleEnrolled(msg.sender, roleType, rank, config.certFeeUsdc);
    }

    // ═══════════════════════════════════════════════════════════════
    // Weekly Pay Claim (ZK-verified)
    // ═══════════════════════════════════════════════════════════════

    function claimWeeklyPay(
        uint256 epoch,
        uint256[2] calldata pA,
        uint256[2][2] calldata pB,
        uint256[2] calldata pC,
        uint256[4] calldata pubSignals
    ) external nonReentrant whenNotPaused {
        require(!founderAgents[msg.sender], "RP:founder exempt");

        RoleSlot storage slot = _roleSlots[msg.sender];
        require(slot.status == SlotStatus.Active, "RP:not active");
        require(slot.suspendedUntil < block.timestamp, "RP:suspended");

        // Epoch validation
        uint256 current = currentEpoch();
        require(epoch < current, "RP:epoch not ended");
        require(!_epochClaims[msg.sender][epoch].claimed, "RP:already claimed");

        // Verify public signals
        uint256 claimantAddress = pubSignals[0];
        uint256 uptimeCount = pubSignals[1];
        uint256 weekStart = pubSignals[2];
        uint256 merkleRoot = pubSignals[3];

        require(claimantAddress == uint256(uint160(msg.sender)), "RP:address mismatch");
        require(uptimeCount <= INTERVALS_PER_WEEK, "RP:invalid uptime");
        require(weekStart == genesisEpoch + (epoch * EPOCH_DURATION), "RP:wrong week start");

        // V-001 FIX: Require merkle root matches the canonical root posted for this epoch.
        // Without this, claimants could fabricate their own merkle tree with inflated uptime.
        require(epochRoots[epoch] != 0, "RP:epoch root not posted");
        require(merkleRoot == epochRoots[epoch], "RP:root mismatch");

        // Prevent Merkle root reuse (defense-in-depth, now also enforced by epoch root anchoring)
        bytes32 rootKey = keccak256(abi.encodePacked(msg.sender, merkleRoot));
        require(!usedMerkleRoots[rootKey], "RP:root already used");
        usedMerkleRoots[rootKey] = true;

        // Verify ZK proof
        require(
            uptimeVerifier.verifyProof(pA, pB, pC, pubSignals),
            "RP:invalid proof"
        );

        // Calculate pay based on uptime
        uint256 payAmount = _calculatePay(msg.sender, epoch, uptimeCount);

        // Issue strikes for low uptime
        _processUptimeStrikes(msg.sender, uptimeCount);

        // Record claim
        _epochClaims[msg.sender][epoch] = EpochClaim({
            claimed: true,
            uptimeCount: uptimeCount,
            payAmount: payAmount
        });

        // Pull LOB from treasury and transfer to claimant
        if (payAmount > 0) {
            lobToken.safeTransferFrom(treasury, msg.sender, payAmount);
        }

        emit WeeklyPayClaimed(msg.sender, epoch, uptimeCount, payAmount);
    }

    // ═══════════════════════════════════════════════════════════════
    // Heartbeat Reporting (permissionless)
    // ═══════════════════════════════════════════════════════════════

    function reportHeartbeat() external whenNotPaused {
        require(_roleSlots[msg.sender].status == SlotStatus.Active, "RP:not active");
        require(!founderAgents[msg.sender], "RP:founder exempt");

        lastHeartbeatTimestamp[msg.sender] = block.timestamp;

        emit HeartbeatReported(msg.sender, block.timestamp);
    }

    // ═══════════════════════════════════════════════════════════════
    // Abandonment Detection (permissionless)
    // ═══════════════════════════════════════════════════════════════

    function reportAbandonment(address holder) external nonReentrant whenNotPaused {
        require(!founderAgents[holder], "RP:founder exempt");

        RoleSlot storage slot = _roleSlots[holder];
        require(
            slot.status == SlotStatus.Active || slot.status == SlotStatus.Suspended,
            "RP:not enrolled"
        );

        uint256 lastHb = lastHeartbeatTimestamp[holder];
        require(lastHb > 0, "RP:no heartbeat");

        uint256 silentDuration = block.timestamp - lastHb;
        require(silentDuration >= ABANDON_72H, "RP:not abandoned");

        emit AbandonmentDetected(holder, silentDuration);

        if (silentDuration >= ABANDON_30D) {
            // 30 days: full stake forfeited to treasury
            uint256 fullSlash = slot.stakedAmount;
            _revokeRole(holder, fullSlash);
        } else if (silentDuration >= ABANDON_7D) {
            // 7 days: role revoked, 25% stake slashed
            uint256 slashAmount = (slot.stakedAmount * SLASH_7D_BPS) / 10000;
            _revokeRole(holder, slashAmount);
        } else {
            // 72 hours: auto Strike 2
            _issueStrike(holder, 2, "72h no heartbeat");
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // Resignation
    // ═══════════════════════════════════════════════════════════════

    function resign() external nonReentrant whenNotPaused {
        require(!founderAgents[msg.sender], "RP:founder exempt");

        RoleSlot storage slot = _roleSlots[msg.sender];
        require(slot.status == SlotStatus.Active || slot.status == SlotStatus.Suspended, "RP:not enrolled");

        slot.status = SlotStatus.Resigned;
        _filledSlots[uint8(slot.roleType)][uint8(slot.rank)] -= 1;
        _resignedAt[msg.sender] = block.timestamp;

        emit RoleResigned(msg.sender);
    }

    function completeResignation() external nonReentrant {
        RoleSlot storage slot = _roleSlots[msg.sender];
        require(slot.status == SlotStatus.Resigned, "RP:not resigned");
        require(block.timestamp >= _resignedAt[msg.sender] + RESIGN_COOLDOWN, "RP:cooldown active");

        uint256 stakeToReturn = slot.stakedAmount;
        slot.stakedAmount = 0;
        slot.status = SlotStatus.Empty;

        // Unlock stake
        if (stakeToReturn > 0) {
            stakingManager.unlockStake(msg.sender, stakeToReturn);
        }

        emit ResignationCooldownComplete(msg.sender, stakeToReturn);
    }

    // ═══════════════════════════════════════════════════════════════
    // Dispute Participation (called by DisputeArbitration)
    // ═══════════════════════════════════════════════════════════════

    function recordDisputeParticipation(
        address arb,
        uint256 epoch,
        bool majorityVote
    ) external onlyRole(DISPUTE_ROLE) {
        _disputeCount[arb][epoch] += 1;
        if (majorityVote) {
            _majorityCount[arb][epoch] += 1;
        }
        emit DisputeParticipationRecorded(arb, epoch, majorityVote);
    }

    // ═══════════════════════════════════════════════════════════════
    // Admin
    // ═══════════════════════════════════════════════════════════════

    function setFounderAgent(address agent, bool exempt) external onlyRole(DEFAULT_ADMIN_ROLE) {
        founderAgents[agent] = exempt;
        emit FounderAgentSet(agent, exempt);
    }

    function setRoleConfig(
        uint8 roleType,
        uint8 rank,
        RoleConfig calldata config
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(roleType <= uint8(RoleType.Moderator), "RP:invalid role type");
        require(rank <= uint8(RoleRank.Principal), "RP:invalid rank");
        _roleConfigs[roleType][rank] = config;
    }

    function withdrawCertFees(address to) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(to != address(0), "RP:zero address");
        uint256 amount = accumulatedCertFees;
        require(amount > 0, "RP:no fees");
        accumulatedCertFees = 0;
        usdcToken.safeTransfer(to, amount);
        emit CertFeesWithdrawn(to, amount);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // ═══════════════════════════════════════════════════════════════
    // View Functions
    // ═══════════════════════════════════════════════════════════════

    function currentEpoch() public view returns (uint256) {
        if (block.timestamp < genesisEpoch) return 0;
        return (block.timestamp - genesisEpoch) / EPOCH_DURATION;
    }

    function epochStartTimestamp(uint256 epoch) public view returns (uint256) {
        return genesisEpoch + (epoch * EPOCH_DURATION);
    }

    function getRoleSlot(address holder) external view returns (RoleSlot memory) {
        return _roleSlots[holder];
    }

    function getEpochClaim(address holder, uint256 epoch) external view returns (EpochClaim memory) {
        return _epochClaims[holder][epoch];
    }

    function getRoleConfig(uint8 roleType, uint8 rank) external view returns (RoleConfig memory) {
        return _roleConfigs[roleType][rank];
    }

    function getFilledSlots(uint8 roleType, uint8 rank) external view returns (uint16) {
        return _filledSlots[roleType][rank];
    }

    function getDisputeStats(address arb, uint256 epoch) external view returns (uint256 disputes, uint256 majority) {
        return (_disputeCount[arb][epoch], _majorityCount[arb][epoch]);
    }

    // ═══════════════════════════════════════════════════════════════
    // Internal
    // ═══════════════════════════════════════════════════════════════

    function _calculatePay(
        address holder,
        uint256 epoch,
        uint256 uptimeCount
    ) internal view returns (uint256) {
        RoleSlot storage slot = _roleSlots[holder];
        RoleConfig storage config = _roleConfigs[uint8(slot.roleType)][uint8(slot.rank)];

        // Base pay scaled by uptime tier
        uint256 basePay = config.weeklyBaseLob;
        uint256 payPercent;

        if (uptimeCount >= TIER_100_MIN) {
            payPercent = 100;
        } else if (uptimeCount >= TIER_75_MIN) {
            payPercent = 75;
        } else if (uptimeCount >= TIER_50_MIN) {
            payPercent = 50;
        } else if (uptimeCount >= TIER_25_MIN) {
            payPercent = 25;
        } else {
            payPercent = 0;
        }

        uint256 totalPay = (basePay * payPercent) / 100;

        // Arbitrators get variable pay: per-dispute + majority bonus
        if (slot.roleType == RoleType.Arbitrator) {
            uint256 disputes = _disputeCount[holder][epoch];
            uint256 majority = _majorityCount[holder][epoch];

            // Per-dispute pay (scaled by uptime too)
            totalPay += (config.perDisputeLob * disputes * payPercent) / 100;

            // Majority bonus
            totalPay += (config.majorityBonusLob * majority * payPercent) / 100;
        }

        // Strike 2 withholds 50%
        if (slot.strikes >= 2) {
            totalPay = totalPay / 2;
        }

        return totalPay;
    }

    function _processUptimeStrikes(address holder, uint256 uptimeCount) internal {
        if (uptimeCount < TIER_0_MIN) {
            // Below 50%: immediate suspension
            _suspendRole(holder);
            _issueStrike(holder, 2, "below 50% uptime");
        } else if (uptimeCount < TIER_25_MIN) {
            // 50-79.9%: +2 strikes
            _issueStrike(holder, 2, "below 80% uptime");
        } else if (uptimeCount < TIER_50_MIN) {
            // 80-89.9%: +1 strike
            _issueStrike(holder, 1, "below 90% uptime");
        }
        // 90%+ = no strikes
    }

    function _issueStrike(address holder, uint8 count, string memory reason) internal {
        RoleSlot storage slot = _roleSlots[holder];
        slot.strikes += count;

        emit StrikeIssued(holder, slot.strikes, reason);

        if (slot.strikes >= MAX_STRIKES_BEFORE_REMOVAL) {
            // Strike 4 within 60 days: removed, 10% stake slashed
            uint256 slashAmount = (slot.stakedAmount * SLASH_STRIKE4_BPS) / 10000;
            _revokeRole(holder, slashAmount);
        } else if (slot.strikes >= STRIKE_SUSPEND_THRESHOLD) {
            _suspendRole(holder);
        }
    }

    function _suspendRole(address holder) internal {
        RoleSlot storage slot = _roleSlots[holder];
        if (slot.status != SlotStatus.Active) return;

        slot.status = SlotStatus.Suspended;
        slot.suspendedUntil = block.timestamp + SUSPENSION_DURATION;

        emit RoleSuspended(holder, slot.suspendedUntil);
    }

    function _revokeRole(address holder, uint256 slashAmount) internal {
        RoleSlot storage slot = _roleSlots[holder];

        _filledSlots[uint8(slot.roleType)][uint8(slot.rank)] -= 1;

        uint256 stakeToSlash = slashAmount > slot.stakedAmount ? slot.stakedAmount : slashAmount;
        uint256 stakeToReturn = slot.stakedAmount - stakeToSlash;

        slot.status = SlotStatus.Empty;
        slot.stakedAmount = 0;

        // Slash via StakingManager - split 50% to insurance pool, 50% to treasury
        if (stakeToSlash > 0) {
            uint256 halfSlash = stakeToSlash / 2;
            uint256 otherHalf = stakeToSlash - halfSlash;

            // 50% to insurance pool
            if (halfSlash > 0) {
                stakingManager.slash(holder, halfSlash, address(insurancePool));
            }
            // 50% to treasury
            if (otherHalf > 0) {
                stakingManager.slash(holder, otherHalf, treasury);
            }
        }

        // Return remaining stake
        if (stakeToReturn > 0) {
            stakingManager.unlockStake(holder, stakeToReturn);
        }

        emit RoleRevoked(holder, stakeToSlash);
    }
}`,
  },
  {
    name: "ProductMarketplace",
    fileName: "ProductMarketplace.sol + ProductMarketplaceExtension.sol",
    description:
      "Physical goods marketplace with auctions, shipping tracking, insurance integration, X402 payments, and diamond-style extension delegation.",
    lines: 1216,
    source: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "./interfaces/IServiceRegistry.sol";
import "./interfaces/IEscrowEngine.sol";
import "./interfaces/ISybilGuard.sol";
import "./interfaces/IInsurancePool.sol";

/// @title ProductMarketplace
/// @notice Physical goods marketplace (eBay/Shopify-style) extending ServiceRegistry + EscrowEngine.
///         Sellers create ServiceRegistry listings (PHYSICAL_TASK category) first, then register
///         product metadata here. Buyers purchase through this contract which acts as a buyer proxy
///         for EscrowEngine (same pattern as X402EscrowBridge). Adds auctions, shipping tracking,
///         and extended dispute/return windows for physical goods.
///
/// @dev V2 functions (insured purchases, X402, insurance claims) live in ProductMarketplaceExtension
///      and are reached via the fallback() delegatecall pattern.
///
/// @dev Security notes:
///   - V-001 (round 1): pendingWithdrawals keyed by (user, token) — prevents cross-token drain.
///   - V-002 (round 1): buyProduct enforces listing price, not caller-supplied amount.
///   - V-001 (round 2): settlementToken snapshotted in Product and Auction structs at creation
///     time. All auction operations use the snapshot, not live ServiceRegistry reads. Prevents
///     cross-token drain via listing.settlementToken mutation.
///   - V-002 (round 2): buyProduct accepts maxPrice parameter for buyer slippage protection
///     against seller frontrunning ServiceRegistry.updateListing.
contract ProductMarketplace is
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable,
    EIP712Upgradeable
{
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    // ═══════════════════════════════════════════════════════════════
    //  ENUMS
    // ═══════════════════════════════════════════════════════════════

    enum ProductCondition { NEW, LIKE_NEW, GOOD, FAIR, POOR, FOR_PARTS }
    enum ListingType { FIXED_PRICE, AUCTION }
    enum ShippingStatus { NOT_SHIPPED, SHIPPED, DELIVERED, RETURN_REQUESTED }

    // ═══════════════════════════════════════════════════════════════
    //  STRUCTS
    // ═══════════════════════════════════════════════════════════════

    struct Product {
        uint256 id;
        uint256 listingId;           // ServiceRegistry listing ID
        address seller;
        ListingType listingType;
        ProductCondition condition;
        string productCategory;
        string shippingInfoURI;
        string imageURI;
        uint256 quantity;
        uint256 sold;
        bool active;
        bool requiresTracking;
        address settlementToken;     // snapshotted at creation — immutable per product
        uint256 price;               // snapshotted at creation — immutable per product
    }

    struct Auction {
        uint256 productId;
        uint256 startPrice;
        uint256 reservePrice;
        uint256 buyNowPrice;
        uint256 startTime;
        uint256 endTime;
        address highBidder;
        uint256 highBid;
        uint256 bidCount;
        bool settled;
        address settlementToken;     // snapshotted at creation — all bids use this token
    }

    struct ShipmentTracking {
        uint256 jobId;
        string carrier;
        string trackingNumber;
        uint256 shippedAt;
        uint256 deliveredAt;
        ShippingStatus status;
    }

    struct PaymentIntent {
        bytes32 x402Nonce;
        address payer;
        address token;
        uint256 amount;
        uint256 listingId;
        address seller;
        uint256 deadline;
        uint256 deliveryDeadline;
    }

    // ═══════════════════════════════════════════════════════════════
    //  CONSTANTS
    // ═══════════════════════════════════════════════════════════════

    bytes32 public constant FACILITATOR_ROLE = keccak256("FACILITATOR_ROLE");

    bytes32 private constant PAYMENT_INTENT_TYPEHASH = keccak256(
        "PaymentIntent(bytes32 x402Nonce,address token,uint256 amount,uint256 listingId,address seller,uint256 deadline,uint256 deliveryDeadline)"
    );

    uint256 public constant PHYSICAL_DISPUTE_WINDOW = 3 days;
    uint256 public constant RETURN_WINDOW = 7 days;
    uint256 public constant MIN_AUCTION_DURATION = 1 days;
    uint256 public constant MAX_AUCTION_DURATION = 30 days;
    uint256 public constant MIN_BID_INCREMENT_BPS = 500; // 5%
    uint256 public constant ANTI_SNIPE_WINDOW = 10 minutes;
    uint256 public constant ANTI_SNIPE_EXTENSION = 10 minutes;
    uint256 public constant MIN_DELIVERY_DEADLINE = 1 days;
    uint256 public constant MAX_DELIVERY_DEADLINE = 90 days;

    // ═══════════════════════════════════════════════════════════════
    //  STATE
    // ═══════════════════════════════════════════════════════════════

    IServiceRegistry public serviceRegistry;
    IEscrowEngine public escrowEngine;
    ISybilGuard public sybilGuard;

    uint256 private _nextProductId;
    uint256 private _nextAuctionId;

    mapping(uint256 => Product) private _products;
    mapping(uint256 => Auction) private _auctions;
    mapping(uint256 => ShipmentTracking) private _shipments;
    mapping(uint256 => uint256) public productAuction;
    mapping(uint256 => uint256) public auctionProduct;

    // Pull-based bid refunds keyed by (user, token)
    mapping(address => mapping(address => uint256)) public pendingWithdrawals;

    mapping(uint256 => address) public jobBuyer;
    mapping(uint256 => uint256) public receiptTimestamp;

    // ── V2 state (appended — UUPS safe) ──────────────────────────
    IInsurancePool public insurancePool;
    mapping(uint256 => bool) public jobInsured;
    mapping(bytes32 => bool) public nonceUsed;
    mapping(bytes32 => uint256) public paymentToJob;

    // ── Extension (V2 functions via delegatecall) ────────────────
    address public extension;

    // ═══════════════════════════════════════════════════════════════
    //  EVENTS
    // ═══════════════════════════════════════════════════════════════

    event ProductListed(
        uint256 indexed productId,
        uint256 indexed listingId,
        address indexed seller,
        ListingType listingType,
        ProductCondition condition,
        string productCategory,
        uint256 quantity
    );
    event ProductUpdated(uint256 indexed productId, string imageURI, string shippingInfoURI);
    event ProductDeactivated(uint256 indexed productId);
    event AuctionCreated(
        uint256 indexed auctionId,
        uint256 indexed productId,
        uint256 startPrice,
        uint256 reservePrice,
        uint256 buyNowPrice,
        uint256 endTime
    );
    event BidPlaced(
        uint256 indexed auctionId,
        address indexed bidder,
        uint256 amount,
        uint256 newEndTime
    );
    event AuctionSettled(
        uint256 indexed auctionId,
        address indexed winner,
        uint256 finalPrice,
        uint256 jobId
    );
    event ShipmentTracked(uint256 indexed jobId, string carrier, string trackingNumber);
    event ReceiptConfirmed(uint256 indexed jobId, address indexed buyer);
    event ReturnRequested(uint256 indexed jobId, address indexed buyer, string reason);
    event DamageReported(uint256 indexed jobId, address indexed buyer, string evidenceURI);
    event ProductPurchasedInsured(uint256 indexed productId, uint256 indexed jobId, address indexed buyer, uint256 premium);
    event ProductPurchasedX402(uint256 indexed productId, uint256 indexed jobId, address indexed payer, bytes32 x402Nonce);
    event InsuranceRefundClaimed(uint256 indexed jobId, address indexed buyer, uint256 amount);
    event InsuranceClaimFiled(uint256 indexed jobId, address indexed buyer, uint256 amount);

    // ═══════════════════════════════════════════════════════════════
    //  INITIALIZER
    // ═══════════════════════════════════════════════════════════════

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _serviceRegistry,
        address _escrowEngine,
        address _sybilGuard
    ) external initializer {
        require(_serviceRegistry != address(0), "ProductMarketplace: zero registry");
        require(_escrowEngine != address(0), "ProductMarketplace: zero escrow");
        require(_sybilGuard != address(0), "ProductMarketplace: zero sybilGuard");

        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();
        __AccessControl_init();
        __ReentrancyGuard_init();
        __Pausable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

        serviceRegistry = IServiceRegistry(_serviceRegistry);
        escrowEngine = IEscrowEngine(_escrowEngine);
        sybilGuard = ISybilGuard(_sybilGuard);

        _nextProductId = 1;
        _nextAuctionId = 1;
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // ═══════════════════════════════════════════════════════════════
    //  LISTING
    // ═══════════════════════════════════════════════════════════════

    /// @notice Register product metadata for an existing ServiceRegistry listing.
    ///         Snapshots settlementToken and price at creation time.
    function createProduct(
        uint256 listingId,
        ProductCondition condition,
        string calldata productCategory,
        string calldata shippingInfoURI,
        string calldata imageURI,
        uint256 quantity,
        bool requiresTracking,
        ListingType listingType
    ) external nonReentrant whenNotPaused returns (uint256 productId) {
        require(quantity > 0, "ProductMarketplace: zero quantity");
        require(bytes(productCategory).length > 0, "ProductMarketplace: empty category");
        require(bytes(imageURI).length > 0, "ProductMarketplace: empty imageURI");

        require(!sybilGuard.checkBanned(msg.sender), "ProductMarketplace: seller banned");

        IServiceRegistry.Listing memory listing = serviceRegistry.getListing(listingId);
        require(listing.active, "ProductMarketplace: listing inactive");
        require(listing.provider == msg.sender, "ProductMarketplace: not listing owner");
        require(listing.category == IServiceRegistry.ServiceCategory.PHYSICAL_TASK,
            "ProductMarketplace: not PHYSICAL_TASK");

        productId = _nextProductId++;

        _products[productId] = Product({
            id: productId,
            listingId: listingId,
            seller: msg.sender,
            listingType: listingType,
            condition: condition,
            productCategory: productCategory,
            shippingInfoURI: shippingInfoURI,
            imageURI: imageURI,
            quantity: quantity,
            sold: 0,
            active: true,
            requiresTracking: requiresTracking,
            settlementToken: listing.settlementToken,
            price: listing.pricePerUnit
        });

        emit ProductListed(productId, listingId, msg.sender, listingType, condition, productCategory, quantity);
    }

    function updateProduct(
        uint256 productId,
        string calldata imageURI,
        string calldata shippingInfoURI
    ) external nonReentrant whenNotPaused {
        Product storage product = _products[productId];
        require(product.seller == msg.sender, "ProductMarketplace: not seller");
        require(product.active, "ProductMarketplace: inactive");

        if (bytes(imageURI).length > 0) product.imageURI = imageURI;
        if (bytes(shippingInfoURI).length > 0) product.shippingInfoURI = shippingInfoURI;

        emit ProductUpdated(productId, imageURI, shippingInfoURI);
    }

    function deactivateProduct(uint256 productId) external nonReentrant whenNotPaused {
        Product storage product = _products[productId];
        require(product.seller == msg.sender, "ProductMarketplace: not seller");
        require(product.active, "ProductMarketplace: already inactive");

        uint256 auctionId = productAuction[productId];
        if (auctionId != 0) {
            Auction storage auction = _auctions[auctionId];
            require(auction.settled || block.timestamp > auction.endTime, "ProductMarketplace: auction active");
        }

        product.active = false;
        emit ProductDeactivated(productId);
    }

    // ═══════════════════════════════════════════════════════════════
    //  FIXED-PRICE PURCHASE
    // ═══════════════════════════════════════════════════════════════

    /// @notice Buy a fixed-price product at the snapshotted price.
    /// @param maxPrice Buyer's maximum acceptable price (slippage protection).
    ///        Reverts if product.price exceeds this. Pass type(uint256).max to skip.
    function buyProduct(
        uint256 productId,
        uint256 maxPrice,
        uint256 deliveryDeadline
    ) external nonReentrant whenNotPaused returns (uint256 jobId) {
        require(deliveryDeadline >= MIN_DELIVERY_DEADLINE, "ProductMarketplace: deadline too short");
        require(deliveryDeadline <= MAX_DELIVERY_DEADLINE, "ProductMarketplace: deadline too long");

        Product storage product = _products[productId];
        require(product.active, "ProductMarketplace: inactive");
        require(product.listingType == ListingType.FIXED_PRICE, "ProductMarketplace: not fixed price");
        require(product.sold < product.quantity, "ProductMarketplace: sold out");
        require(msg.sender != product.seller, "ProductMarketplace: self-purchase");

        require(!sybilGuard.checkBanned(msg.sender), "ProductMarketplace: buyer banned");

        uint256 price = product.price;
        address token = product.settlementToken;

        require(price <= maxPrice, "ProductMarketplace: price exceeds max");

        _pullExact(token, msg.sender, price);

        uint256 balBefore = IERC20(token).balanceOf(address(this));
        IERC20(token).forceApprove(address(escrowEngine), price);
        jobId = escrowEngine.createJob(
            product.listingId,
            product.seller,
            price,
            token,
            deliveryDeadline
        );
        _verifyOutflow(token, balBefore, price);

        jobBuyer[jobId] = msg.sender;
        escrowEngine.setJobPayer(jobId, msg.sender);

        product.sold += 1;

        _shipments[jobId] = ShipmentTracking({
            jobId: jobId,
            carrier: "",
            trackingNumber: "",
            shippedAt: 0,
            deliveredAt: 0,
            status: ShippingStatus.NOT_SHIPPED
        });
    }

    // ═══════════════════════════════════════════════════════════════
    //  AUCTIONS
    // ═══════════════════════════════════════════════════════════════

    /// @notice Create an auction. Snapshots settlementToken from the product.
    function createAuction(
        uint256 productId,
        uint256 startPrice,
        uint256 reservePrice,
        uint256 buyNowPrice,
        uint256 duration
    ) external nonReentrant whenNotPaused returns (uint256 auctionId) {
        Product storage product = _products[productId];
        require(product.seller == msg.sender, "ProductMarketplace: not seller");
        require(product.active, "ProductMarketplace: inactive");
        require(product.listingType == ListingType.AUCTION, "ProductMarketplace: not auction type");
        require(product.sold < product.quantity, "ProductMarketplace: sold out");
        require(productAuction[productId] == 0 || _auctions[productAuction[productId]].settled,
            "ProductMarketplace: auction exists");

        require(startPrice > 0, "ProductMarketplace: zero start price");
        require(duration >= MIN_AUCTION_DURATION, "ProductMarketplace: duration too short");
        require(duration <= MAX_AUCTION_DURATION, "ProductMarketplace: duration too long");
        if (buyNowPrice > 0) {
            require(buyNowPrice > startPrice, "ProductMarketplace: buyNow <= start");
        }

        auctionId = _nextAuctionId++;

        _auctions[auctionId] = Auction({
            productId: productId,
            startPrice: startPrice,
            reservePrice: reservePrice,
            buyNowPrice: buyNowPrice,
            startTime: block.timestamp,
            endTime: block.timestamp + duration,
            highBidder: address(0),
            highBid: 0,
            bidCount: 0,
            settled: false,
            settlementToken: product.settlementToken
        });

        productAuction[productId] = auctionId;
        auctionProduct[auctionId] = productId;

        emit AuctionCreated(auctionId, productId, startPrice, reservePrice, buyNowPrice, block.timestamp + duration);
    }

    /// @notice Place a bid. Uses the auction's snapshotted settlementToken.
    function placeBid(uint256 auctionId, uint256 bidAmount) external nonReentrant whenNotPaused {
        Auction storage auction = _auctions[auctionId];
        require(auction.productId != 0, "ProductMarketplace: auction not found");
        require(!auction.settled, "ProductMarketplace: already settled");
        require(block.timestamp >= auction.startTime, "ProductMarketplace: not started");
        require(block.timestamp < auction.endTime, "ProductMarketplace: ended");

        require(!sybilGuard.checkBanned(msg.sender), "ProductMarketplace: bidder banned");

        address token = auction.settlementToken;

        uint256 balanceBefore = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), bidAmount);
        uint256 received = IERC20(token).balanceOf(address(this)) - balanceBefore;
        require(received > 0, "ProductMarketplace: zero received");

        if (auction.bidCount == 0) {
            require(received >= auction.startPrice, "ProductMarketplace: below start price");
        } else {
            uint256 minBid = auction.highBid + (auction.highBid * MIN_BID_INCREMENT_BPS) / 10000;
            require(received >= minBid, "ProductMarketplace: bid too low");
        }

        if (auction.highBidder != address(0)) {
            pendingWithdrawals[auction.highBidder][token] += auction.highBid;
        }

        auction.highBidder = msg.sender;
        auction.highBid = received;
        auction.bidCount += 1;

        uint256 newEndTime = auction.endTime;
        if (auction.endTime - block.timestamp < ANTI_SNIPE_WINDOW) {
            newEndTime = block.timestamp + ANTI_SNIPE_EXTENSION;
            auction.endTime = newEndTime;
        }

        emit BidPlaced(auctionId, msg.sender, received, newEndTime);
    }

    /// @notice Buy now. Uses the auction's snapshotted settlementToken.
    function buyNow(uint256 auctionId, uint256 deliveryDeadline) external nonReentrant whenNotPaused returns (uint256 jobId) {
        require(deliveryDeadline >= MIN_DELIVERY_DEADLINE, "ProductMarketplace: deadline too short");
        require(deliveryDeadline <= MAX_DELIVERY_DEADLINE, "ProductMarketplace: deadline too long");

        Auction storage auction = _auctions[auctionId];
        require(auction.productId != 0, "ProductMarketplace: auction not found");
        require(!auction.settled, "ProductMarketplace: already settled");
        require(block.timestamp < auction.endTime, "ProductMarketplace: ended");
        require(auction.buyNowPrice > 0, "ProductMarketplace: no buy-now");
        require(auction.highBid < auction.buyNowPrice, "ProductMarketplace: bid exceeds buy-now");

        require(!sybilGuard.checkBanned(msg.sender), "ProductMarketplace: buyer banned");

        Product storage product = _products[auction.productId];
        address token = auction.settlementToken;

        if (auction.highBidder != address(0)) {
            pendingWithdrawals[auction.highBidder][token] += auction.highBid;
        }

        auction.settled = true;
        product.sold += 1;

        _pullExact(token, msg.sender, auction.buyNowPrice);

        uint256 balBeforeEscrow = IERC20(token).balanceOf(address(this));
        IERC20(token).forceApprove(address(escrowEngine), auction.buyNowPrice);
        jobId = escrowEngine.createJob(
            product.listingId,
            product.seller,
            auction.buyNowPrice,
            token,
            deliveryDeadline
        );
        _verifyOutflow(token, balBeforeEscrow, auction.buyNowPrice);

        jobBuyer[jobId] = msg.sender;
        escrowEngine.setJobPayer(jobId, msg.sender);

        _shipments[jobId] = ShipmentTracking({
            jobId: jobId, carrier: "", trackingNumber: "",
            shippedAt: 0, deliveredAt: 0, status: ShippingStatus.NOT_SHIPPED
        });

        emit AuctionSettled(auctionId, msg.sender, auction.buyNowPrice, jobId);
    }

    /// @notice Settle auction. Uses the auction's snapshotted settlementToken.
    /// @dev V-003 fix: Only winner or seller can settle when a job will be created (they choose
    ///      deliveryDeadline). Failed auctions (no bids / below reserve) remain permissionless.
    ///      Delivery deadline bounded to [MIN_DELIVERY_DEADLINE, MAX_DELIVERY_DEADLINE].
    function settleAuction(uint256 auctionId, uint256 deliveryDeadline) external nonReentrant whenNotPaused returns (uint256 jobId) {
        Auction storage auction = _auctions[auctionId];
        require(auction.productId != 0, "ProductMarketplace: auction not found");
        require(!auction.settled, "ProductMarketplace: already settled");
        require(block.timestamp >= auction.endTime, "ProductMarketplace: not ended");

        auction.settled = true;

        Product storage product = _products[auction.productId];
        address token = auction.settlementToken;

        if (auction.bidCount == 0 || (auction.reservePrice > 0 && auction.highBid < auction.reservePrice)) {
            if (auction.highBidder != address(0)) {
                pendingWithdrawals[auction.highBidder][token] += auction.highBid;
            }
            emit AuctionSettled(auctionId, address(0), 0, 0);
            return 0;
        }

        // V-003: only interested parties can choose the delivery deadline
        require(
            msg.sender == auction.highBidder || msg.sender == product.seller,
            "ProductMarketplace: not winner or seller"
        );
        require(deliveryDeadline >= MIN_DELIVERY_DEADLINE, "ProductMarketplace: deadline too short");
        require(deliveryDeadline <= MAX_DELIVERY_DEADLINE, "ProductMarketplace: deadline too long");

        product.sold += 1;

        uint256 balBeforeEscrow = IERC20(token).balanceOf(address(this));
        IERC20(token).forceApprove(address(escrowEngine), auction.highBid);
        jobId = escrowEngine.createJob(
            product.listingId,
            product.seller,
            auction.highBid,
            token,
            deliveryDeadline
        );
        _verifyOutflow(token, balBeforeEscrow, auction.highBid);

        jobBuyer[jobId] = auction.highBidder;
        escrowEngine.setJobPayer(jobId, auction.highBidder);

        _shipments[jobId] = ShipmentTracking({
            jobId: jobId, carrier: "", trackingNumber: "",
            shippedAt: 0, deliveredAt: 0, status: ShippingStatus.NOT_SHIPPED
        });

        emit AuctionSettled(auctionId, auction.highBidder, auction.highBid, jobId);
    }

    /// @notice Withdraw pending bid refunds for a specific token.
    function withdrawBid(address token) external nonReentrant {
        require(token != address(0), "ProductMarketplace: zero token");
        uint256 amount = pendingWithdrawals[msg.sender][token];
        require(amount > 0, "ProductMarketplace: nothing to withdraw");

        pendingWithdrawals[msg.sender][token] = 0;

        IERC20(token).safeTransfer(msg.sender, amount);
    }

    // ═══════════════════════════════════════════════════════════════
    //  SHIPPING
    // ═══════════════════════════════════════════════════════════════

    function shipProduct(
        uint256 jobId,
        string calldata carrier,
        string calldata trackingNumber
    ) external nonReentrant whenNotPaused {
        IEscrowEngine.Job memory job = escrowEngine.getJob(jobId);
        require(job.seller == msg.sender, "ProductMarketplace: not seller");

        ShipmentTracking storage shipment = _shipments[jobId];
        require(shipment.jobId == jobId, "ProductMarketplace: no shipment");
        require(shipment.status == ShippingStatus.NOT_SHIPPED, "ProductMarketplace: already shipped");
        require(bytes(carrier).length > 0, "ProductMarketplace: empty carrier");
        require(bytes(trackingNumber).length > 0, "ProductMarketplace: empty tracking");

        shipment.carrier = carrier;
        shipment.trackingNumber = trackingNumber;
        shipment.shippedAt = block.timestamp;
        shipment.status = ShippingStatus.SHIPPED;

        emit ShipmentTracked(jobId, carrier, trackingNumber);
    }

    /// @dev V-001 fix: insured jobs route through InsurancePool (which is the escrow buyer).
    ///      Non-insured jobs call EscrowEngine directly (marketplace is the escrow buyer).
    function confirmReceipt(uint256 jobId) external nonReentrant whenNotPaused {
        require(jobBuyer[jobId] == msg.sender, "ProductMarketplace: not buyer");

        ShipmentTracking storage shipment = _shipments[jobId];
        require(shipment.jobId == jobId, "ProductMarketplace: no shipment");

        shipment.deliveredAt = block.timestamp;
        shipment.status = ShippingStatus.DELIVERED;
        receiptTimestamp[jobId] = block.timestamp;

        if (jobInsured[jobId]) {
            insurancePool.confirmInsuredDelivery(jobId);
        } else {
            escrowEngine.confirmDelivery(jobId);
        }
        emit ReceiptConfirmed(jobId, msg.sender);
    }

    // ═══════════════════════════════════════════════════════════════
    //  DISPUTES
    // ═══════════════════════════════════════════════════════════════

    /// @dev V-001 fix: insured jobs route disputes through InsurancePool.
    function reportDamaged(uint256 jobId, string calldata evidenceURI) external nonReentrant whenNotPaused {
        require(jobBuyer[jobId] == msg.sender, "ProductMarketplace: not buyer");
        require(bytes(evidenceURI).length > 0, "ProductMarketplace: empty evidence");

        if (jobInsured[jobId]) {
            insurancePool.initiateInsuredDispute(jobId, evidenceURI);
        } else {
            escrowEngine.initiateDispute(jobId, evidenceURI);
        }
        emit DamageReported(jobId, msg.sender, evidenceURI);
    }

    function requestReturn(uint256 jobId, string calldata reason) external nonReentrant whenNotPaused {
        require(jobBuyer[jobId] == msg.sender, "ProductMarketplace: not buyer");
        require(bytes(reason).length > 0, "ProductMarketplace: empty reason");
        uint256 receipt = receiptTimestamp[jobId];
        require(receipt > 0, "ProductMarketplace: not received");
        require(block.timestamp <= receipt + RETURN_WINDOW, "ProductMarketplace: return window closed");
        _shipments[jobId].status = ShippingStatus.RETURN_REQUESTED;
        emit ReturnRequested(jobId, msg.sender, reason);
    }

    // ═══════════════════════════════════════════════════════════════
    //  INTERNAL
    // ═══════════════════════════════════════════════════════════════

    /// @dev V-002 fix: Pull exact amount, revert on fee-on-transfer shortfall.
    function _pullExact(address token, address from, uint256 amount) internal {
        uint256 bal = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(from, address(this), amount);
        require(
            IERC20(token).balanceOf(address(this)) - bal == amount,
            "ProductMarketplace: transfer shortfall"
        );
    }

    /// @dev V-002 fix: Verify exactly \`amount\` left this contract during an external call.
    function _verifyOutflow(address token, uint256 balBefore, uint256 amount) internal view {
        require(
            balBefore - IERC20(token).balanceOf(address(this)) == amount,
            "ProductMarketplace: funding mismatch"
        );
    }

    // ═══════════════════════════════════════════════════════════════
    //  VIEWS
    // ═══════════════════════════════════════════════════════════════

    function getProduct(uint256 productId) external view returns (Product memory) {
        Product memory product = _products[productId];
        require(product.seller != address(0), "ProductMarketplace: not found");
        return product;
    }

    function getAuction(uint256 auctionId) external view returns (Auction memory) {
        Auction memory auction = _auctions[auctionId];
        require(auction.productId != 0, "ProductMarketplace: not found");
        return auction;
    }

    function getShipment(uint256 jobId) external view returns (ShipmentTracking memory) {
        return _shipments[jobId];
    }

    function nextProductId() external view returns (uint256) { return _nextProductId; }
    function nextAuctionId() external view returns (uint256) { return _nextAuctionId; }

    // ═══════════════════════════════════════════════════════════════
    //  ADMIN
    // ═══════════════════════════════════════════════════════════════

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    function setExtension(address _extension) external onlyOwner {
        extension = _extension;
    }

    /// @dev Delegates unrecognized selectors to the extension contract.
    ///      Extension shares storage layout via delegatecall.
    fallback() external payable {
        address ext = extension;
        require(ext != address(0), "ProductMarketplace: no extension");
        assembly {
            calldatacopy(0, 0, calldatasize())
            let result := delegatecall(gas(), ext, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            switch result
            case 0 { revert(0, returndatasize()) }
            default { return(0, returndatasize()) }
        }
    }

    receive() external payable {}
}


// ════════════════════════════════════════════════════════════════
// ProductMarketplaceExtension.sol
// ════════════════════════════════════════════════════════════════

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "./interfaces/IServiceRegistry.sol";
import "./interfaces/IEscrowEngine.sol";
import "./interfaces/ISybilGuard.sol";
import "./interfaces/IInsurancePool.sol";

/// @title ProductMarketplaceExtension
/// @notice V2 functions for ProductMarketplace, reached via delegatecall from the main contract's
///         fallback(). Storage layout MUST mirror ProductMarketplace exactly.
///
/// @dev This contract is NOT upgradeable on its own. It is deployed as a plain contract and
///      the main ProductMarketplace proxy delegates unknown selectors to it. Because it runs
///      in the proxy's storage context via delegatecall, the inheritance chain and state variable
///      declarations must be identical to ProductMarketplace.
contract ProductMarketplaceExtension is
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable,
    EIP712Upgradeable
{
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    // ═══════════════════════════════════════════════════════════════
    //  ENUMS  (must match ProductMarketplace)
    // ═══════════════════════════════════════════════════════════════

    enum ProductCondition { NEW, LIKE_NEW, GOOD, FAIR, POOR, FOR_PARTS }
    enum ListingType { FIXED_PRICE, AUCTION }
    enum ShippingStatus { NOT_SHIPPED, SHIPPED, DELIVERED, RETURN_REQUESTED }

    // ═══════════════════════════════════════════════════════════════
    //  STRUCTS  (must match ProductMarketplace)
    // ═══════════════════════════════════════════════════════════════

    struct Product {
        uint256 id;
        uint256 listingId;
        address seller;
        ListingType listingType;
        ProductCondition condition;
        string productCategory;
        string shippingInfoURI;
        string imageURI;
        uint256 quantity;
        uint256 sold;
        bool active;
        bool requiresTracking;
        address settlementToken;
        uint256 price;
    }

    struct Auction {
        uint256 productId;
        uint256 startPrice;
        uint256 reservePrice;
        uint256 buyNowPrice;
        uint256 startTime;
        uint256 endTime;
        address highBidder;
        uint256 highBid;
        uint256 bidCount;
        bool settled;
        address settlementToken;
    }

    struct ShipmentTracking {
        uint256 jobId;
        string carrier;
        string trackingNumber;
        uint256 shippedAt;
        uint256 deliveredAt;
        ShippingStatus status;
    }

    struct PaymentIntent {
        bytes32 x402Nonce;
        address payer;
        address token;
        uint256 amount;
        uint256 listingId;
        address seller;
        uint256 deadline;
        uint256 deliveryDeadline;
    }

    // ═══════════════════════════════════════════════════════════════
    //  CONSTANTS
    // ═══════════════════════════════════════════════════════════════

    bytes32 public constant FACILITATOR_ROLE = keccak256("FACILITATOR_ROLE");

    bytes32 private constant PAYMENT_INTENT_TYPEHASH = keccak256(
        "PaymentIntent(bytes32 x402Nonce,address token,uint256 amount,uint256 listingId,address seller,uint256 deadline,uint256 deliveryDeadline)"
    );

    uint256 public constant MIN_DELIVERY_DEADLINE = 1 days;
    uint256 public constant MAX_DELIVERY_DEADLINE = 90 days;

    // ═══════════════════════════════════════════════════════════════
    //  STATE  (must match ProductMarketplace exactly, same order)
    // ═══════════════════════════════════════════════════════════════

    IServiceRegistry public serviceRegistry;
    IEscrowEngine public escrowEngine;
    ISybilGuard public sybilGuard;

    uint256 private _nextProductId;
    uint256 private _nextAuctionId;

    mapping(uint256 => Product) private _products;
    mapping(uint256 => Auction) private _auctions;
    mapping(uint256 => ShipmentTracking) private _shipments;
    mapping(uint256 => uint256) public productAuction;
    mapping(uint256 => uint256) public auctionProduct;

    // Pull-based bid refunds keyed by (user, token)
    mapping(address => mapping(address => uint256)) public pendingWithdrawals;

    mapping(uint256 => address) public jobBuyer;
    mapping(uint256 => uint256) public receiptTimestamp;

    // ── V2 state ─────────────────────────────────────────────────
    IInsurancePool public insurancePool;
    mapping(uint256 => bool) public jobInsured;
    mapping(bytes32 => bool) public nonceUsed;
    mapping(bytes32 => uint256) public paymentToJob;

    // ── Extension pointer (must match ProductMarketplace) ────────
    address public extension;

    // ═══════════════════════════════════════════════════════════════
    //  EVENTS
    // ═══════════════════════════════════════════════════════════════

    event ProductPurchasedInsured(uint256 indexed productId, uint256 indexed jobId, address indexed buyer, uint256 premium);
    event ProductPurchasedX402(uint256 indexed productId, uint256 indexed jobId, address indexed payer, bytes32 x402Nonce);
    event AuctionSettled(uint256 indexed auctionId, address indexed winner, uint256 finalPrice, uint256 jobId);
    event InsuranceRefundClaimed(uint256 indexed jobId, address indexed buyer, uint256 amount);
    event InsuranceClaimFiled(uint256 indexed jobId, address indexed buyer, uint256 amount);

    // ═══════════════════════════════════════════════════════════════
    //  CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @dev This extension is NOT upgradeable on its own.
    function _authorizeUpgrade(address) internal pure override { revert("not upgradeable"); }

    // ═══════════════════════════════════════════════════════════════
    //  INITIALIZER (V2)
    // ═══════════════════════════════════════════════════════════════

    function initializeV2() external reinitializer(2) {
        __EIP712_init("ProductMarketplace", "1");
    }

    // ═══════════════════════════════════════════════════════════════
    //  ADMIN
    // ═══════════════════════════════════════════════════════════════

    function setInsurancePool(address _insurancePool) external onlyOwner {
        insurancePool = IInsurancePool(_insurancePool);
    }

    // ═══════════════════════════════════════════════════════════════
    //  INSURED PURCHASE
    // ═══════════════════════════════════════════════════════════════

    /// @notice Buy a fixed-price product with insurance via InsurancePool.
    ///         Pulls price + premium from buyer, routes through InsurancePool for escrow insurance.
    function buyProductInsured(
        uint256 productId,
        uint256 maxPrice,
        uint256 deliveryDeadline
    ) external nonReentrant whenNotPaused returns (uint256 jobId) {
        require(address(insurancePool) != address(0), "ProductMarketplace: no insurance pool");
        require(deliveryDeadline >= MIN_DELIVERY_DEADLINE, "ProductMarketplace: deadline too short");
        require(deliveryDeadline <= MAX_DELIVERY_DEADLINE, "ProductMarketplace: deadline too long");

        Product storage product = _products[productId];
        require(product.active, "ProductMarketplace: inactive");
        require(product.listingType == ListingType.FIXED_PRICE, "ProductMarketplace: not fixed price");
        require(product.sold < product.quantity, "ProductMarketplace: sold out");
        require(msg.sender != product.seller, "ProductMarketplace: self-purchase");
        require(!sybilGuard.checkBanned(msg.sender), "ProductMarketplace: buyer banned");

        uint256 price = product.price;
        address token = product.settlementToken;
        require(price <= maxPrice, "ProductMarketplace: price exceeds max");

        uint256 premium = (price * insurancePool.premiumRateBps()) / 10000;
        uint256 totalCost = price + premium;

        _pullExact(token, msg.sender, totalCost);

        uint256 balBefore = IERC20(token).balanceOf(address(this));
        IERC20(token).forceApprove(address(insurancePool), totalCost);
        jobId = insurancePool.createInsuredJob(
            product.listingId, product.seller, price, token, deliveryDeadline
        );
        _verifyOutflow(token, balBefore, totalCost);

        escrowEngine.setJobPayer(jobId, msg.sender);

        jobBuyer[jobId] = msg.sender;
        jobInsured[jobId] = true;
        product.sold += 1;

        _shipments[jobId] = ShipmentTracking({
            jobId: jobId, carrier: "", trackingNumber: "",
            shippedAt: 0, deliveredAt: 0, status: ShippingStatus.NOT_SHIPPED
        });

        emit ProductPurchasedInsured(productId, jobId, msg.sender, premium);
    }

    // ═══════════════════════════════════════════════════════════════
    //  X402 PURCHASE
    // ═══════════════════════════════════════════════════════════════

    /// @notice X402 payment intent purchase. Called by facilitator with payer's EIP-712 signature.
    /// @dev V-001 fix: intent.listingId and intent.seller must match the product to prevent
    ///      facilitator misrouting a signature collected for one listing to a different product.
    function buyProductX402(
        uint256 productId,
        PaymentIntent calldata intent,
        uint8 v, bytes32 r, bytes32 s
    ) external onlyRole(FACILITATOR_ROLE) nonReentrant whenNotPaused returns (uint256 jobId) {
        Product storage product = _products[productId];
        require(product.active, "ProductMarketplace: inactive");
        require(product.listingType == ListingType.FIXED_PRICE, "ProductMarketplace: not fixed price");
        require(product.sold < product.quantity, "ProductMarketplace: sold out");
        require(intent.payer != product.seller, "ProductMarketplace: self-purchase");
        require(intent.amount == product.price, "ProductMarketplace: price mismatch");
        require(intent.token == product.settlementToken, "ProductMarketplace: token mismatch");
        require(intent.listingId == product.listingId, "ProductMarketplace: listing mismatch");
        require(intent.seller == product.seller, "ProductMarketplace: seller mismatch");
        require(block.timestamp <= intent.deadline, "ProductMarketplace: deadline expired");
        require(!nonceUsed[intent.x402Nonce], "ProductMarketplace: nonce used");
        require(intent.deliveryDeadline >= MIN_DELIVERY_DEADLINE, "ProductMarketplace: deadline too short");
        require(intent.deliveryDeadline <= MAX_DELIVERY_DEADLINE, "ProductMarketplace: deadline too long");

        _verifyPaymentIntent(intent, v, r, s);
        nonceUsed[intent.x402Nonce] = true;

        uint256 price = product.price;
        address token = product.settlementToken;

        _pullExact(token, intent.payer, price);

        uint256 balBefore = IERC20(token).balanceOf(address(this));
        IERC20(token).forceApprove(address(escrowEngine), price);
        jobId = escrowEngine.createJob(
            product.listingId, product.seller, price, token, intent.deliveryDeadline
        );
        _verifyOutflow(token, balBefore, price);

        escrowEngine.setJobPayer(jobId, intent.payer);

        jobBuyer[jobId] = intent.payer;
        paymentToJob[intent.x402Nonce] = jobId;
        product.sold += 1;

        _shipments[jobId] = ShipmentTracking({
            jobId: jobId, carrier: "", trackingNumber: "",
            shippedAt: 0, deliveredAt: 0, status: ShippingStatus.NOT_SHIPPED
        });

        emit ProductPurchasedX402(productId, jobId, intent.payer, intent.x402Nonce);
    }

    /// @notice X402 payment intent purchase with insurance.
    /// @dev V-001 fix: intent.listingId and intent.seller must match the product.
    function buyProductX402Insured(
        uint256 productId,
        PaymentIntent calldata intent,
        uint8 v, bytes32 r, bytes32 s
    ) external onlyRole(FACILITATOR_ROLE) nonReentrant whenNotPaused returns (uint256 jobId) {
        require(address(insurancePool) != address(0), "ProductMarketplace: no insurance pool");

        Product storage product = _products[productId];
        require(product.active, "ProductMarketplace: inactive");
        require(product.listingType == ListingType.FIXED_PRICE, "ProductMarketplace: not fixed price");
        require(product.sold < product.quantity, "ProductMarketplace: sold out");
        require(intent.payer != product.seller, "ProductMarketplace: self-purchase");
        require(intent.token == product.settlementToken, "ProductMarketplace: token mismatch");
        require(intent.listingId == product.listingId, "ProductMarketplace: listing mismatch");
        require(intent.seller == product.seller, "ProductMarketplace: seller mismatch");
        require(block.timestamp <= intent.deadline, "ProductMarketplace: deadline expired");
        require(!nonceUsed[intent.x402Nonce], "ProductMarketplace: nonce used");
        require(intent.deliveryDeadline >= MIN_DELIVERY_DEADLINE, "ProductMarketplace: deadline too short");
        require(intent.deliveryDeadline <= MAX_DELIVERY_DEADLINE, "ProductMarketplace: deadline too long");

        uint256 price = product.price;
        uint256 premium = (price * insurancePool.premiumRateBps()) / 10000;
        uint256 totalCost = price + premium;
        require(intent.amount == totalCost, "ProductMarketplace: amount mismatch");

        _verifyPaymentIntent(intent, v, r, s);
        nonceUsed[intent.x402Nonce] = true;

        address token = product.settlementToken;

        _pullExact(token, intent.payer, totalCost);

        uint256 balBefore = IERC20(token).balanceOf(address(this));
        IERC20(token).forceApprove(address(insurancePool), totalCost);
        jobId = insurancePool.createInsuredJob(
            product.listingId, product.seller, price, token, intent.deliveryDeadline
        );
        _verifyOutflow(token, balBefore, totalCost);

        escrowEngine.setJobPayer(jobId, intent.payer);

        jobBuyer[jobId] = intent.payer;
        jobInsured[jobId] = true;
        paymentToJob[intent.x402Nonce] = jobId;
        product.sold += 1;

        _shipments[jobId] = ShipmentTracking({
            jobId: jobId, carrier: "", trackingNumber: "",
            shippedAt: 0, deliveredAt: 0, status: ShippingStatus.NOT_SHIPPED
        });

        emit ProductPurchasedX402(productId, jobId, intent.payer, intent.x402Nonce);
        emit ProductPurchasedInsured(productId, jobId, intent.payer, premium);
    }

    // ═══════════════════════════════════════════════════════════════
    //  INSURED AUCTION SETTLEMENT
    // ═══════════════════════════════════════════════════════════════

    /// @notice Settle auction with insurance. Winning bid routes through InsurancePool.
    ///         Premium is pulled from the winner at settlement time.
    /// @dev V-002 fix: Only the auction winner can call (explicit insurance opt-in).
    ///      V-003 fix: Delivery deadline bounded.
    function settleAuctionInsured(uint256 auctionId, uint256 deliveryDeadline) external nonReentrant whenNotPaused returns (uint256 jobId) {
        require(address(insurancePool) != address(0), "ProductMarketplace: no insurance pool");

        Auction storage auction = _auctions[auctionId];
        require(auction.productId != 0, "ProductMarketplace: auction not found");
        require(!auction.settled, "ProductMarketplace: already settled");
        require(block.timestamp >= auction.endTime, "ProductMarketplace: not ended");
        require(auction.bidCount > 0, "ProductMarketplace: no bids");
        require(auction.reservePrice == 0 || auction.highBid >= auction.reservePrice, "ProductMarketplace: below reserve");
        require(msg.sender == auction.highBidder, "ProductMarketplace: not winner");
        require(deliveryDeadline >= MIN_DELIVERY_DEADLINE, "ProductMarketplace: deadline too short");
        require(deliveryDeadline <= MAX_DELIVERY_DEADLINE, "ProductMarketplace: deadline too long");

        auction.settled = true;

        Product storage product = _products[auction.productId];
        address token = auction.settlementToken;

        product.sold += 1;

        uint256 amount = auction.highBid;
        uint256 premium = (amount * insurancePool.premiumRateBps()) / 10000;

        // Pull premium from winner (bid is already on this contract)
        _pullExact(token, auction.highBidder, premium);

        uint256 balBefore = IERC20(token).balanceOf(address(this));
        IERC20(token).forceApprove(address(insurancePool), amount + premium);
        jobId = insurancePool.createInsuredJob(
            product.listingId, product.seller, amount, token, deliveryDeadline
        );
        _verifyOutflow(token, balBefore, amount + premium);

        escrowEngine.setJobPayer(jobId, auction.highBidder);

        jobBuyer[jobId] = auction.highBidder;
        jobInsured[jobId] = true;

        _shipments[jobId] = ShipmentTracking({
            jobId: jobId, carrier: "", trackingNumber: "",
            shippedAt: 0, deliveredAt: 0, status: ShippingStatus.NOT_SHIPPED
        });

        emit AuctionSettled(auctionId, auction.highBidder, auction.highBid, jobId);
    }

    // ═══════════════════════════════════════════════════════════════
    //  INSURANCE CLAIMS
    // ═══════════════════════════════════════════════════════════════

    /// @notice Real buyer claims their escrow refund from InsurancePool.
    ///         InsurancePool sends tokens to this contract (registered buyer), then forwarded.
    function claimInsuranceRefund(uint256 jobId) external nonReentrant {
        require(jobBuyer[jobId] == msg.sender, "ProductMarketplace: not buyer");
        require(jobInsured[jobId], "ProductMarketplace: not insured");

        IEscrowEngine.Job memory job = escrowEngine.getJob(jobId);
        address token = job.token;

        uint256 balanceBefore = IERC20(token).balanceOf(address(this));
        insurancePool.claimRefund(jobId);
        uint256 received = IERC20(token).balanceOf(address(this)) - balanceBefore;

        if (received > 0) {
            IERC20(token).safeTransfer(msg.sender, received);
        }

        emit InsuranceRefundClaimed(jobId, msg.sender, received);
    }

    /// @notice Real buyer files insurance claim for net loss not covered by escrow refund.
    function fileInsuranceClaim(uint256 jobId) external nonReentrant {
        require(jobBuyer[jobId] == msg.sender, "ProductMarketplace: not buyer");
        require(jobInsured[jobId], "ProductMarketplace: not insured");

        IEscrowEngine.Job memory job = escrowEngine.getJob(jobId);
        address token = job.token;

        uint256 balanceBefore = IERC20(token).balanceOf(address(this));
        insurancePool.fileClaim(jobId);
        uint256 received = IERC20(token).balanceOf(address(this)) - balanceBefore;

        if (received > 0) {
            IERC20(token).safeTransfer(msg.sender, received);
        }

        emit InsuranceClaimFiled(jobId, msg.sender, received);
    }

    // ═══════════════════════════════════════════════════════════════
    //  INTERNAL
    // ═══════════════════════════════════════════════════════════════

    function _verifyPaymentIntent(
        PaymentIntent calldata intent,
        uint8 v, bytes32 r, bytes32 s
    ) internal view {
        bytes32 structHash = keccak256(abi.encode(
            PAYMENT_INTENT_TYPEHASH,
            intent.x402Nonce, intent.token, intent.amount,
            intent.listingId, intent.seller, intent.deadline, intent.deliveryDeadline
        ));
        address signer = _hashTypedDataV4(structHash).recover(v, r, s);
        require(signer == intent.payer, "ProductMarketplace: invalid signature");
    }

    /// @dev V-002 fix: Pull exact amount, revert on fee-on-transfer shortfall.
    function _pullExact(address token, address from, uint256 amount) internal {
        uint256 bal = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(from, address(this), amount);
        require(
            IERC20(token).balanceOf(address(this)) - bal == amount,
            "ProductMarketplace: transfer shortfall"
        );
    }

    /// @dev V-002 fix: Verify exactly \`amount\` left this contract during an external call.
    function _verifyOutflow(address token, uint256 balBefore, uint256 amount) internal view {
        require(
            balBefore - IERC20(token).balanceOf(address(this)) == amount,
            "ProductMarketplace: funding mismatch"
        );
    }
}`,
  },
  {
    name: "Groth16Verifier",
    fileName: "Groth16VerifierV4.sol",
    description:
      "Auto-generated Groth16 ZK proof verifier for the airdrop circuit using BN254 curve, generated by snarkjs from the Circom circuit.",
    lines: 183,
    source: `// SPDX-License-Identifier: GPL-3.0
/*
    Copyright 2021 0KIMS association.

    This file is generated with [snarkJS](https://github.com/iden3/snarkjs).

    snarkJS is a free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    snarkJS is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
    or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public
    License for more details.

    You should have received a copy of the GNU General Public License
    along with snarkJS. If not, see <https://www.gnu.org/licenses/>.
*/

pragma solidity >=0.7.0 <0.9.0;

contract Groth16VerifierV4 {
    // Scalar field size
    uint256 constant r    = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    // Base field size
    uint256 constant q   = 21888242871839275222246405745257275088696311157297823662689037894645226208583;

    // Verification Key data
    uint256 constant alphax  = 20491192805390485299153009773594534940189261866228447918068658471970481763042;
    uint256 constant alphay  = 9383485363053290200918347156157836566562967994039712273449902621266178545958;
    uint256 constant betax1  = 4252822878758300859123897981450591353533073413197771768651442665752259397132;
    uint256 constant betax2  = 6375614351688725206403948262868962793625744043794305715222011528459656738731;
    uint256 constant betay1  = 21847035105528745403288232691147584728191162732299865338377159692350059136679;
    uint256 constant betay2  = 10505242626370262277552901082094356697409835680220590971873171140371331206856;
    uint256 constant gammax1 = 11559732032986387107991004021392285783925812861821192530917403151452391805634;
    uint256 constant gammax2 = 10857046999023057135944570762232829481370756359578518086990519993285655852781;
    uint256 constant gammay1 = 4082367875863433681332203403145435568316851327593401208105741076214120093531;
    uint256 constant gammay2 = 8495653923123431417604973247489272438418190587263600148770280649306958101930;
    uint256 constant deltax1 = 20583044832319721512399158155166567742140792217697546402185940892433493394250;
    uint256 constant deltax2 = 3004555612106717319521803643134677375855778066717739703442521449356154580771;
    uint256 constant deltay1 = 9995588662201547691902076945666627784235261047384587495939365797239270200032;
    uint256 constant deltay2 = 11078358252337011890258408225256497122481407826284088475354619486228046475143;


    uint256 constant IC0x = 2298363211181231665408194456465172623696963948839513804089617015460386445992;
    uint256 constant IC0y = 15841527747520431986843441785198223541138355806414062130765988360347391162067;

    uint256 constant IC1x = 7323145329900776653390725973815777081914285170521209259012988755507977232941;
    uint256 constant IC1y = 14811112621021155089408092037259957202878988263107610116341931773263046610902;

    uint256 constant IC2x = 3214372847535066641153312455575319526182548438895405514715054902034743419929;
    uint256 constant IC2y = 7726570939385242767131439798028848514335680465021360760282026021405209818068;

    uint256 constant IC3x = 21030513895614775242041767567513320274216349733228098558767823817652130656168;
    uint256 constant IC3y = 15147967048468890113130737505793588584068699321109997050048771762813742244464;


    // Memory data
    uint16 constant pVk = 0;
    uint16 constant pPairing = 128;

    uint16 constant pLastMem = 896;

    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[3] calldata _pubSignals) public view returns (bool) {
        assembly {
            function checkField(v) {
                if iszero(lt(v, r)) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }

            // G1 function to multiply a G1 value(x,y) to value in an address
            function g1_mulAccC(pR, x, y, s) {
                let success
                let mIn := mload(0x40)
                mstore(mIn, x)
                mstore(add(mIn, 32), y)
                mstore(add(mIn, 64), s)

                success := staticcall(sub(gas(), 2000), 7, mIn, 96, mIn, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }

                mstore(add(mIn, 64), mload(pR))
                mstore(add(mIn, 96), mload(add(pR, 32)))

                success := staticcall(sub(gas(), 2000), 6, mIn, 128, pR, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }

            function checkPairing(pA, pB, pC, pubSignals, pMem) -> isOk {
                let _pPairing := add(pMem, pPairing)
                let _pVk := add(pMem, pVk)

                mstore(_pVk, IC0x)
                mstore(add(_pVk, 32), IC0y)

                // Compute the linear combination vk_x

                g1_mulAccC(_pVk, IC1x, IC1y, calldataload(add(pubSignals, 0)))

                g1_mulAccC(_pVk, IC2x, IC2y, calldataload(add(pubSignals, 32)))

                g1_mulAccC(_pVk, IC3x, IC3y, calldataload(add(pubSignals, 64)))


                // -A
                mstore(_pPairing, calldataload(pA))
                mstore(add(_pPairing, 32), mod(sub(q, calldataload(add(pA, 32))), q))

                // B
                mstore(add(_pPairing, 64), calldataload(pB))
                mstore(add(_pPairing, 96), calldataload(add(pB, 32)))
                mstore(add(_pPairing, 128), calldataload(add(pB, 64)))
                mstore(add(_pPairing, 160), calldataload(add(pB, 96)))

                // alpha1
                mstore(add(_pPairing, 192), alphax)
                mstore(add(_pPairing, 224), alphay)

                // beta2
                mstore(add(_pPairing, 256), betax1)
                mstore(add(_pPairing, 288), betax2)
                mstore(add(_pPairing, 320), betay1)
                mstore(add(_pPairing, 352), betay2)

                // vk_x
                mstore(add(_pPairing, 384), mload(add(pMem, pVk)))
                mstore(add(_pPairing, 416), mload(add(pMem, add(pVk, 32))))


                // gamma2
                mstore(add(_pPairing, 448), gammax1)
                mstore(add(_pPairing, 480), gammax2)
                mstore(add(_pPairing, 512), gammay1)
                mstore(add(_pPairing, 544), gammay2)

                // C
                mstore(add(_pPairing, 576), calldataload(pC))
                mstore(add(_pPairing, 608), calldataload(add(pC, 32)))

                // delta2
                mstore(add(_pPairing, 640), deltax1)
                mstore(add(_pPairing, 672), deltax2)
                mstore(add(_pPairing, 704), deltay1)
                mstore(add(_pPairing, 736), deltay2)


                let success := staticcall(sub(gas(), 2000), 8, _pPairing, 768, _pPairing, 0x20)

                isOk := and(success, mload(_pPairing))
            }

            let pMem := mload(0x40)
            mstore(0x40, add(pMem, pLastMem))

            // Validate that all evaluations ∈ F

            checkField(calldataload(add(_pubSignals, 0)))

            checkField(calldataload(add(_pubSignals, 32)))

            checkField(calldataload(add(_pubSignals, 64)))


            // Validate all evaluations
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

            mstore(0, isValid)
             return(0, 0x20)
         }
     }
 }`,
  },
  {
    name: "SkillRegistry",
    fileName: "SkillRegistry.sol",
    description:
      "Agent skill marketplace with one-time, subscription, and per-call pricing models, dependency graphs, call credits, and escrow-backed purchases.",
    lines: 464,
    source: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/ISkillRegistry.sol";
import "./interfaces/IStakingManager.sol";
import "./interfaces/IReputationSystem.sol";
import "./interfaces/ISybilGuard.sol";
import "./interfaces/IEscrowEngine.sol";

contract SkillRegistry is ISkillRegistry, Initializable, UUPSUpgradeable, OwnableUpgradeable, AccessControlUpgradeable, ReentrancyGuardUpgradeable, PausableUpgradeable {
    using SafeERC20 for IERC20;

    bytes32 public constant GATEWAY_ROLE = keccak256("GATEWAY_ROLE");

    uint256 public constant USDC_FEE_BPS = 150; // 1.5%
    uint256 public constant SUBSCRIPTION_PERIOD = 30 days;

    IERC20 public lobToken;
    IStakingManager public stakingManager;
    IReputationSystem public reputationSystem;
    ISybilGuard public sybilGuard;
    IEscrowEngine public escrowEngine;
    address public treasury;

    uint256 private _nextSkillId = 1;
    uint256 private _nextAccessId = 1;

    mapping(uint256 => SkillListing) private _skills;
    mapping(uint256 => uint256[]) private _skillDependencies;
    mapping(uint256 => AccessRecord) private _access;
    mapping(address => uint256) private _sellerListingCount;
    mapping(address => mapping(address => uint256)) private _buyerCredits; // buyer => token => balance
    mapping(address => mapping(address => uint256)) private _sellerEarnings; // seller => token => balance
    mapping(address => mapping(uint256 => uint256)) private _buyerSkillAccess; // buyer => skillId => accessId

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _lobToken,
        address _stakingManager,
        address _reputationSystem,
        address _sybilGuard,
        address _escrowEngine,
        address _treasury
    ) public virtual initializer {
        require(_lobToken != address(0), "SkillRegistry: zero lobToken");
        require(_stakingManager != address(0), "SkillRegistry: zero staking");
        require(_reputationSystem != address(0), "SkillRegistry: zero reputation");
        require(_sybilGuard != address(0), "SkillRegistry: zero sybilGuard");
        require(_escrowEngine != address(0), "SkillRegistry: zero escrow");
        require(_treasury != address(0), "SkillRegistry: zero treasury");

        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();
        __AccessControl_init();
        __ReentrancyGuard_init();
        __Pausable_init();

        _nextSkillId = 1;
        _nextAccessId = 1;

        lobToken = IERC20(_lobToken);
        stakingManager = IStakingManager(_stakingManager);
        reputationSystem = IReputationSystem(_reputationSystem);
        sybilGuard = ISybilGuard(_sybilGuard);
        escrowEngine = IEscrowEngine(_escrowEngine);
        treasury = _treasury;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // --- Core Functions ---

    function listSkill(
        ListSkillParams calldata params,
        string calldata title,
        string calldata description,
        string calldata metadataURI,
        uint256[] calldata requiredSkills
    ) external nonReentrant whenNotPaused returns (uint256 skillId) {
        require(!sybilGuard.checkBanned(msg.sender), "SkillRegistry: banned");
        require(bytes(title).length > 0, "SkillRegistry: empty title");
        require(bytes(description).length > 0, "SkillRegistry: empty description");
        require(params.price > 0, "SkillRegistry: zero price");
        require(params.settlementToken != address(0), "SkillRegistry: zero token");

        MarketplaceTier tier = getMarketplaceTier(msg.sender);

        // Tier gating for asset types
        require(uint256(tier) >= uint256(MarketplaceTier.Bronze), "SkillRegistry: need Bronze+");
        if (params.assetType == AssetType.AGENT_TEMPLATE) {
            require(uint256(tier) >= uint256(MarketplaceTier.Silver), "SkillRegistry: need Silver+ for agents");
        }
        if (params.assetType == AssetType.PIPELINE) {
            require(uint256(tier) >= uint256(MarketplaceTier.Gold), "SkillRegistry: need Gold+ for pipelines");
        }

        // Subscription pricing requires Silver+
        if (params.pricingModel == PricingModel.SUBSCRIPTION) {
            require(uint256(tier) >= uint256(MarketplaceTier.Silver), "SkillRegistry: need Silver+ for subscriptions");
        }

        // Listing cap
        {
            IStakingManager.Tier stakeTier = stakingManager.getTier(msg.sender);
            uint256 maxListing = stakingManager.maxListings(stakeTier);
            require(_sellerListingCount[msg.sender] < maxListing, "SkillRegistry: max listings reached");
        }

        // Delivery method hash validation
        if (params.deliveryMethod == DeliveryMethod.HOSTED_API || params.deliveryMethod == DeliveryMethod.BOTH) {
            require(params.apiEndpointHash != bytes32(0), "SkillRegistry: missing API hash");
        }
        if (params.deliveryMethod == DeliveryMethod.CODE_PACKAGE || params.deliveryMethod == DeliveryMethod.BOTH) {
            require(params.packageHash != bytes32(0), "SkillRegistry: missing package hash");
        }

        // Validate required skills exist
        for (uint256 i = 0; i < requiredSkills.length; i++) {
            require(_skills[requiredSkills[i]].id != 0, "SkillRegistry: dependency not found");
            require(_skills[requiredSkills[i]].active, "SkillRegistry: dependency inactive");
        }

        skillId = _nextSkillId++;
        _sellerListingCount[msg.sender]++;

        _skills[skillId] = SkillListing({
            id: skillId,
            seller: msg.sender,
            assetType: params.assetType,
            deliveryMethod: params.deliveryMethod,
            pricingModel: params.pricingModel,
            title: title,
            description: description,
            metadataURI: metadataURI,
            version: 1,
            price: params.price,
            settlementToken: params.settlementToken,
            apiEndpointHash: params.apiEndpointHash,
            packageHash: params.packageHash,
            active: true,
            totalPurchases: 0,
            totalCalls: 0,
            createdAt: block.timestamp,
            updatedAt: block.timestamp
        });

        for (uint256 j = 0; j < requiredSkills.length; j++) {
            _skillDependencies[skillId].push(requiredSkills[j]);
        }

        emit SkillListed(skillId, msg.sender, params.assetType, params.pricingModel, params.price);
    }

    function updateSkill(
        uint256 skillId,
        uint256 newPrice,
        string calldata newMetadataURI,
        bytes32 newApiEndpointHash,
        bytes32 newPackageHash
    ) external nonReentrant whenNotPaused {
        SkillListing storage skill = _skills[skillId];
        require(skill.id != 0, "SkillRegistry: not found");
        require(msg.sender == skill.seller, "SkillRegistry: not seller");
        require(skill.active, "SkillRegistry: inactive");
        require(newPrice > 0, "SkillRegistry: zero price");

        skill.price = newPrice;
        skill.metadataURI = newMetadataURI;
        skill.apiEndpointHash = newApiEndpointHash;
        skill.packageHash = newPackageHash;
        skill.version++;
        skill.updatedAt = block.timestamp;

        emit SkillUpdated(skillId, newPrice, newMetadataURI);
    }

    function deactivateSkill(uint256 skillId) external nonReentrant whenNotPaused {
        SkillListing storage skill = _skills[skillId];
        require(skill.id != 0, "SkillRegistry: not found");
        require(msg.sender == skill.seller, "SkillRegistry: not seller");
        require(skill.active, "SkillRegistry: already inactive");

        skill.active = false;
        skill.updatedAt = block.timestamp;
        _sellerListingCount[msg.sender]--;

        emit SkillDeactivated(skillId);
    }

    function purchaseSkill(uint256 skillId) external nonReentrant whenNotPaused returns (uint256 accessId) {
        require(!sybilGuard.checkBanned(msg.sender), "SkillRegistry: banned");

        SkillListing storage skill = _skills[skillId];
        require(skill.id != 0, "SkillRegistry: not found");
        require(skill.active, "SkillRegistry: inactive");
        require(msg.sender != skill.seller, "SkillRegistry: self-purchase");

        accessId = _nextAccessId++;
        skill.totalPurchases++;

        if (skill.pricingModel == PricingModel.ONE_TIME) {
            // Route through EscrowEngine for buyer protection
            // Buyer must have approved EscrowEngine for the token beforehand
            uint256 jobId = escrowEngine.createSkillEscrow(
                skillId,
                msg.sender,
                skill.seller,
                skill.price,
                skill.settlementToken
            );

            _access[accessId] = AccessRecord({
                id: accessId,
                skillId: skillId,
                buyer: msg.sender,
                pricingModel: PricingModel.ONE_TIME,
                purchasedAt: block.timestamp,
                expiresAt: 0, // No expiry for one-time
                totalCallsUsed: 0,
                totalPaid: skill.price,
                active: true
            });

            _buyerSkillAccess[msg.sender][skillId] = accessId;

            emit SkillPurchased(skillId, msg.sender, accessId, PricingModel.ONE_TIME, skill.price);
        } else if (skill.pricingModel == PricingModel.SUBSCRIPTION) {
            // Direct payment to seller minus fee
            _collectPayment(msg.sender, skill.seller, skill.price, skill.settlementToken);

            _access[accessId] = AccessRecord({
                id: accessId,
                skillId: skillId,
                buyer: msg.sender,
                pricingModel: PricingModel.SUBSCRIPTION,
                purchasedAt: block.timestamp,
                expiresAt: block.timestamp + SUBSCRIPTION_PERIOD,
                totalCallsUsed: 0,
                totalPaid: skill.price,
                active: true
            });

            _buyerSkillAccess[msg.sender][skillId] = accessId;

            emit SkillPurchased(skillId, msg.sender, accessId, PricingModel.SUBSCRIPTION, skill.price);
        } else {
            // PER_CALL — no payment now, metered later via credits
            _access[accessId] = AccessRecord({
                id: accessId,
                skillId: skillId,
                buyer: msg.sender,
                pricingModel: PricingModel.PER_CALL,
                purchasedAt: block.timestamp,
                expiresAt: 0,
                totalCallsUsed: 0,
                totalPaid: 0,
                active: true
            });

            _buyerSkillAccess[msg.sender][skillId] = accessId;

            emit SkillPurchased(skillId, msg.sender, accessId, PricingModel.PER_CALL, 0);
        }
    }

    function renewSubscription(uint256 accessId) external nonReentrant whenNotPaused {
        AccessRecord storage access = _access[accessId];
        require(access.id != 0, "SkillRegistry: access not found");
        require(access.active, "SkillRegistry: access inactive");
        require(access.pricingModel == PricingModel.SUBSCRIPTION, "SkillRegistry: not subscription");
        require(msg.sender == access.buyer, "SkillRegistry: not buyer");

        SkillListing storage skill = _skills[access.skillId];
        require(skill.active, "SkillRegistry: skill inactive");

        // Collect payment from buyer (requires prior ERC-20 approval)
        _collectPayment(access.buyer, skill.seller, skill.price, skill.settlementToken);

        // Extend from max(expiresAt, now) — prevents overcharging expired users
        // If still active, extends seamlessly from current expiry (no gap).
        // If expired, extends from now so buyer always gets a full period of access.
        uint256 base = access.expiresAt > block.timestamp ? access.expiresAt : block.timestamp;
        access.expiresAt = base + SUBSCRIPTION_PERIOD;
        access.totalPaid += skill.price;

        emit SubscriptionRenewed(accessId, access.skillId, access.buyer, access.expiresAt);
    }

    function recordUsage(uint256 accessId, uint256 calls) external onlyRole(GATEWAY_ROLE) nonReentrant whenNotPaused {
        require(calls > 0, "SkillRegistry: zero calls");

        AccessRecord storage access = _access[accessId];
        require(access.id != 0, "SkillRegistry: access not found");
        require(access.active, "SkillRegistry: access inactive");
        require(access.pricingModel == PricingModel.PER_CALL, "SkillRegistry: not per-call");

        SkillListing storage skill = _skills[access.skillId];
        uint256 cost = calls * skill.price;

        // Deduct from buyer credits
        require(_buyerCredits[access.buyer][skill.settlementToken] >= cost, "SkillRegistry: insufficient credits");
        _buyerCredits[access.buyer][skill.settlementToken] -= cost;

        // Calculate fee
        uint256 fee = 0;
        if (skill.settlementToken != address(lobToken)) {
            fee = (cost * USDC_FEE_BPS) / 10000;
        }

        // Credit seller earnings (minus fee)
        _sellerEarnings[skill.seller][skill.settlementToken] += cost - fee;
        // Credit treasury for fee
        if (fee > 0) {
            _sellerEarnings[treasury][skill.settlementToken] += fee;
        }

        access.totalCallsUsed += calls;
        access.totalPaid += cost;
        skill.totalCalls += calls;

        emit UsageRecorded(accessId, access.skillId, calls, cost);
    }

    function depositCallCredits(address token, uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "SkillRegistry: zero amount");
        require(token != address(0), "SkillRegistry: zero token");

        // Fee-on-transfer safe
        uint256 balanceBefore = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = IERC20(token).balanceOf(address(this)) - balanceBefore;

        _buyerCredits[msg.sender][token] += received;

        emit CallCreditsDeposited(msg.sender, token, received);
    }

    function withdrawCallCredits(address token, uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "SkillRegistry: zero amount");
        require(_buyerCredits[msg.sender][token] >= amount, "SkillRegistry: insufficient credits");

        _buyerCredits[msg.sender][token] -= amount;
        IERC20(token).safeTransfer(msg.sender, amount);

        emit CallCreditsWithdrawn(msg.sender, token, amount);
    }

    function claimEarnings(address token) external nonReentrant whenNotPaused {
        uint256 earnings = _sellerEarnings[msg.sender][token];
        require(earnings > 0, "SkillRegistry: no earnings");

        _sellerEarnings[msg.sender][token] = 0;
        IERC20(token).safeTransfer(msg.sender, earnings);

        emit SellerPaid(msg.sender, token, earnings);
    }

    // --- View Functions ---

    function getSkill(uint256 skillId) external view returns (SkillListing memory) {
        require(_skills[skillId].id != 0, "SkillRegistry: not found");
        return _skills[skillId];
    }

    function getAccess(uint256 accessId) external view returns (AccessRecord memory) {
        require(_access[accessId].id != 0, "SkillRegistry: access not found");
        return _access[accessId];
    }

    function getMarketplaceTier(address user) public view returns (MarketplaceTier) {
        IStakingManager.Tier stakeTier = stakingManager.getTier(user);
        if (stakeTier == IStakingManager.Tier.None) {
            return MarketplaceTier.None;
        }

        (, IReputationSystem.ReputationTier repTier) = reputationSystem.getScore(user);

        // RepTier gets +1 offset to align: Bronze(0)→1, Silver(1)→2, Gold(2)→3, Platinum(3)→4
        uint256 repTierAligned = uint256(repTier) + 1;
        uint256 stakeTierVal = uint256(stakeTier);

        // Result = min(stakeTier, repTier+1)
        uint256 result = stakeTierVal < repTierAligned ? stakeTierVal : repTierAligned;
        return MarketplaceTier(result);
    }

    function getBuyerCredits(address buyer, address token) external view returns (uint256) {
        return _buyerCredits[buyer][token];
    }

    function getSkillDependencies(uint256 skillId) external view returns (uint256[] memory) {
        return _skillDependencies[skillId];
    }

    function getSellerListingCount(address seller) external view returns (uint256) {
        return _sellerListingCount[seller];
    }

    function getAccessIdByBuyer(address buyer, uint256 skillId) external view returns (uint256) {
        return _buyerSkillAccess[buyer][skillId];
    }

    function hasActiveAccess(address buyer, uint256 skillId) external view returns (bool) {
        uint256 accessId = _buyerSkillAccess[buyer][skillId];
        if (accessId == 0) return false;

        AccessRecord storage access = _access[accessId];
        if (!access.active) return false;

        // Check expiry for subscriptions
        if (access.pricingModel == PricingModel.SUBSCRIPTION && block.timestamp > access.expiresAt) {
            return false;
        }

        return true;
    }

    // --- Admin ---

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // --- Internal ---

    function _collectPayment(address from, address seller, uint256 amount, address token) internal {
        // Fee-on-transfer safe
        uint256 balanceBefore = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(from, address(this), amount);
        uint256 received = IERC20(token).balanceOf(address(this)) - balanceBefore;

        uint256 fee = 0;
        if (token != address(lobToken)) {
            fee = (received * USDC_FEE_BPS) / 10000;
        }

        uint256 sellerPayout = received - fee;

        // Transfer to seller immediately
        IERC20(token).safeTransfer(seller, sellerPayout);
        if (fee > 0) {
            IERC20(token).safeTransfer(treasury, fee);
        }
    }
}`,
  },
  {
    name: "PipelineRouter",
    fileName: "PipelineRouter.sol",
    description:
      "Multi-skill pipeline composition engine with step configs, public/private visibility, Gold+ tier gating, and execution tracking.",
    lines: 226,
    source: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./interfaces/IPipelineRouter.sol";
import "./interfaces/ISkillRegistry.sol";
import "./interfaces/IStakingManager.sol";
import "./interfaces/IReputationSystem.sol";
import "./interfaces/ISybilGuard.sol";

contract PipelineRouter is
    IPipelineRouter,
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable
{
    ISkillRegistry public skillRegistry;
    IStakingManager public stakingManager;
    IReputationSystem public reputationSystem;
    ISybilGuard public sybilGuard;

    uint256 private _nextPipelineId = 1;

    mapping(uint256 => Pipeline) private _pipelines;
    mapping(uint256 => uint256[]) private _pipelineSteps;
    mapping(uint256 => bytes[]) private _pipelineStepConfigs;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _skillRegistry,
        address _stakingManager,
        address _reputationSystem,
        address _sybilGuard,
        address initialOwner
    ) public virtual initializer {
        require(_skillRegistry != address(0), "PipelineRouter: zero skillRegistry");
        require(_stakingManager != address(0), "PipelineRouter: zero staking");
        require(_reputationSystem != address(0), "PipelineRouter: zero reputation");
        require(_sybilGuard != address(0), "PipelineRouter: zero sybilGuard");

        __Ownable_init(initialOwner);
        __AccessControl_init();
        __ReentrancyGuard_init();
        __Pausable_init();
        __UUPSUpgradeable_init();

        _nextPipelineId = 1;

        skillRegistry = ISkillRegistry(_skillRegistry);
        stakingManager = IStakingManager(_stakingManager);
        reputationSystem = IReputationSystem(_reputationSystem);
        sybilGuard = ISybilGuard(_sybilGuard);

        _grantRole(DEFAULT_ADMIN_ROLE, initialOwner);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    function createPipeline(
        string calldata name,
        uint256[] calldata skillIds,
        bytes[] calldata stepConfigs,
        bool isPublic
    ) external nonReentrant whenNotPaused returns (uint256 pipelineId) {
        require(!sybilGuard.checkBanned(msg.sender), "PipelineRouter: banned");
        require(bytes(name).length > 0, "PipelineRouter: empty name");
        require(skillIds.length > 0, "PipelineRouter: no steps");
        require(skillIds.length == stepConfigs.length, "PipelineRouter: length mismatch");

        // Validate buyer has access to all skills
        for (uint256 i = 0; i < skillIds.length; i++) {
            require(
                skillRegistry.hasActiveAccess(msg.sender, skillIds[i]),
                "PipelineRouter: no access to skill"
            );
        }

        // Public pipelines require Gold+ marketplace tier
        if (isPublic) {
            ISkillRegistry.MarketplaceTier tier = skillRegistry.getMarketplaceTier(msg.sender);
            require(
                uint256(tier) >= uint256(ISkillRegistry.MarketplaceTier.Gold),
                "PipelineRouter: need Gold+ for public"
            );
        }

        pipelineId = _nextPipelineId++;

        _pipelines[pipelineId] = Pipeline({
            id: pipelineId,
            owner: msg.sender,
            name: name,
            isPublic: isPublic,
            executionCount: 0,
            createdAt: block.timestamp,
            active: true
        });

        for (uint256 i = 0; i < skillIds.length; i++) {
            _pipelineSteps[pipelineId].push(skillIds[i]);
            _pipelineStepConfigs[pipelineId].push(stepConfigs[i]);
        }

        emit PipelineCreated(pipelineId, msg.sender, name, isPublic);
    }

    function executePipeline(uint256 pipelineId) external nonReentrant whenNotPaused {
        require(!sybilGuard.checkBanned(msg.sender), "PipelineRouter: banned");

        Pipeline storage pipeline = _pipelines[pipelineId];
        require(pipeline.id != 0, "PipelineRouter: not found");
        require(pipeline.active, "PipelineRouter: inactive");

        if (msg.sender != pipeline.owner) {
            require(pipeline.isPublic, "PipelineRouter: not public");

            // Non-owner must have access to all steps
            uint256[] storage steps = _pipelineSteps[pipelineId];
            for (uint256 i = 0; i < steps.length; i++) {
                require(
                    skillRegistry.hasActiveAccess(msg.sender, steps[i]),
                    "PipelineRouter: no access to skill"
                );
            }
        }

        pipeline.executionCount++;

        emit PipelineExecuted(pipelineId, msg.sender, pipeline.executionCount);
    }

    function updatePipeline(
        uint256 pipelineId,
        string calldata newName,
        uint256[] calldata newSkillIds,
        bytes[] calldata newStepConfigs,
        bool isPublic
    ) external nonReentrant whenNotPaused {
        Pipeline storage pipeline = _pipelines[pipelineId];
        require(pipeline.id != 0, "PipelineRouter: not found");
        require(msg.sender == pipeline.owner, "PipelineRouter: not owner");
        require(pipeline.active, "PipelineRouter: inactive");
        require(bytes(newName).length > 0, "PipelineRouter: empty name");
        require(newSkillIds.length > 0, "PipelineRouter: no steps");
        require(newSkillIds.length == newStepConfigs.length, "PipelineRouter: length mismatch");

        // Validate access for new steps
        for (uint256 i = 0; i < newSkillIds.length; i++) {
            require(
                skillRegistry.hasActiveAccess(msg.sender, newSkillIds[i]),
                "PipelineRouter: no access to skill"
            );
        }

        // Public toggle requires Gold+
        if (isPublic && !pipeline.isPublic) {
            ISkillRegistry.MarketplaceTier tier = skillRegistry.getMarketplaceTier(msg.sender);
            require(
                uint256(tier) >= uint256(ISkillRegistry.MarketplaceTier.Gold),
                "PipelineRouter: need Gold+ for public"
            );
        }

        pipeline.name = newName;
        pipeline.isPublic = isPublic;
        delete _pipelineSteps[pipelineId];
        delete _pipelineStepConfigs[pipelineId];
        for (uint256 i = 0; i < newSkillIds.length; i++) {
            _pipelineSteps[pipelineId].push(newSkillIds[i]);
            _pipelineStepConfigs[pipelineId].push(newStepConfigs[i]);
        }

        emit PipelineUpdated(pipelineId, newName, isPublic);
    }

    function deactivatePipeline(uint256 pipelineId) external nonReentrant whenNotPaused {
        Pipeline storage pipeline = _pipelines[pipelineId];
        require(pipeline.id != 0, "PipelineRouter: not found");
        require(msg.sender == pipeline.owner, "PipelineRouter: not owner");
        require(pipeline.active, "PipelineRouter: already inactive");

        pipeline.active = false;

        emit PipelineDeactivated(pipelineId);
    }

    // --- View Functions ---

    function getPipeline(uint256 pipelineId) external view returns (Pipeline memory) {
        require(_pipelines[pipelineId].id != 0, "PipelineRouter: not found");
        return _pipelines[pipelineId];
    }

    function getPipelineSteps(uint256 pipelineId) external view returns (uint256[] memory) {
        require(_pipelines[pipelineId].id != 0, "PipelineRouter: not found");
        return _pipelineSteps[pipelineId];
    }

    function getPipelineStepConfigs(uint256 pipelineId) external view returns (bytes[] memory) {
        require(_pipelines[pipelineId].id != 0, "PipelineRouter: not found");
        return _pipelineStepConfigs[pipelineId];
    }

    // --- Admin ---

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
}`,
  },
];
