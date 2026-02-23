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
    name: "AirdropClaimV2",
    fileName: "AirdropClaimV2.sol",
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
];
