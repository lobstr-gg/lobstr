// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IDisputeArbitration.sol";
import "./interfaces/IEscrowEngine.sol";
import "./interfaces/IStakingManager.sol";
import "./interfaces/IReputationSystem.sol";
import "./interfaces/ISybilGuard.sol";
import "./interfaces/IRewardDistributor.sol";

contract DisputeArbitration is IDisputeArbitration, AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    bytes32 public constant ESCROW_ROLE = keccak256("ESCROW_ROLE");
    bytes32 public constant SYBIL_GUARD_ROLE = keccak256("SYBIL_GUARD_ROLE");

    uint256 public constant COUNTER_EVIDENCE_WINDOW = 24 hours;
    uint256 public constant VOTING_DEADLINE = 3 days;
    uint256 public constant JUNIOR_THRESHOLD = 5_000 ether;
    uint256 public constant SENIOR_THRESHOLD = 25_000 ether;
    uint256 public constant PRINCIPAL_THRESHOLD = 100_000 ether;
    uint256 public constant JUNIOR_MAX_DISPUTE = 500 ether;
    uint256 public constant SENIOR_MAX_DISPUTE = 5_000 ether;

    uint256 public constant JUNIOR_FEE_BPS = 500;   // 5%
    uint256 public constant SENIOR_FEE_BPS = 400;   // 4%
    uint256 public constant PRINCIPAL_FEE_BPS = 300; // 3%

    uint256 public constant SLASH_MIN_BPS = 1000; // 10%
    uint256 public constant SLASH_DISTRIBUTION_BPS = 5000; // 50%

    // Reward constants
    uint256 public constant BASE_REWARD_PER_1K_LOB = 20 ether;  // 20 LOB reward per 1000 LOB disputed
    uint256 public constant MAJORITY_BONUS_BPS = 3000;           // 30% bonus for majority voters
    uint256 public constant MINORITY_PENALTY_BPS = 2000;         // 20% penalty for minority voters
    uint256 public constant VOTE_COOLDOWN = 1 hours;
    uint256 public constant RUBBER_STAMP_PENALTY_BPS = 5000;    // 50% reward cut
    uint256 public constant RUBBER_STAMP_BIAS_THRESHOLD = 8000; // 80% bias → rubber-stamp penalty
    uint256 public constant NO_SHOW_SLASH_BPS = 50;              // 0.5% stake slash for not voting
    uint256 public constant QUALITY_GRACE_PERIOD = 5;            // first 5 disputes = no quality filter
    uint256 public constant MIN_QUORUM = 2;                      // V-003: minimum votes for non-Draw ruling

    // Collusion detection constants
    uint256 public constant COLLUSION_AGREEMENT_THRESHOLD = 90; // 90% agreement = flagged
    uint256 public constant COLLUSION_MIN_DISPUTES = 20;         // need 20+ shared disputes

    // Appeal constants
    uint256 public constant APPEAL_BOND = 500 ether;   // 500 LOB to appeal
    uint256 public constant APPEAL_WINDOW = 48 hours;   // Time after ruling to file appeal

    // V-003: Two-phase panel selection
    uint256 public constant PANEL_SEAL_DELAY = 10; // ~20s on Base (2s blocks)

    // V-001: Emergency resolution timeout for stuck disputes
    uint256 public constant PANEL_SEAL_TIMEOUT = 7 days;

    // V-001: Repanel limit for zero-vote deadlocks
    uint256 public constant MAX_REPANELS = 2;

    IERC20 public immutable lobToken;
    IStakingManager public immutable stakingManager;
    IReputationSystem public immutable reputationSystem;
    ISybilGuard public immutable sybilGuard;
    IRewardDistributor public immutable rewardDistributor;
    IEscrowEngine public escrowEngine; // Set post-deploy (circular dependency)

    uint256 private _nextDisputeId = 1;

    mapping(uint256 => Dispute) private _disputes;
    mapping(address => ArbitratorInfo) private _arbitrators;
    mapping(uint256 => mapping(address => bool)) private _hasVoted;
    mapping(uint256 => mapping(address => bool)) private _votedForBuyer;
    mapping(address => uint256) private _activeDisputeCount;
    // V-002: Normalized dispute amounts (18 decimals) for reward/threshold calculations
    mapping(uint256 => uint256) private _normalizedAmounts;

    address[] private _activeArbitrators;
    mapping(address => uint256) private _arbitratorIndex;
    mapping(address => bool) private _isActiveArbitrator;

    // Arbitrator self-pause
    mapping(address => bool) private _arbitratorPaused;

    // Anti-gaming: rubber-stamp detection (lifetime vote direction tracking)
    mapping(address => uint256) public lastVoteTimestamp;
    mapping(address => uint256) public buyerVoteCount;   // total lifetime buyer votes
    mapping(address => uint256) public sellerVoteCount;   // total lifetime seller votes

    // Pairwise voting agreement tracking (Fix #3a)
    mapping(bytes32 => uint256) private _pairAgreements;    // hash(arbA, arbB) → agree count
    mapping(bytes32 => uint256) private _pairDisagreements; // hash(arbA, arbB) → disagree count

    // Appeal state (Fix #3c)
    mapping(uint256 => bool) private _isAppealDispute;      // disputeId → is appeal
    mapping(uint256 => uint256) private _appealDisputeId;   // original → appeal dispute ID
    mapping(uint256 => uint256) private _originalDisputeId;  // appeal → original dispute ID
    mapping(uint256 => address) private _appealer;           // original disputeId → who appealed
    mapping(uint256 => bool) private _escrowReleased;        // disputeId → whether escrow was released
    mapping(uint256 => bool) private _jobStakeSlashed;        // V-001: jobId → stake already slashed
    mapping(uint256 => address[3]) private _panelExclusions;   // V-002: appeal panel exclusions
    mapping(uint256 => bytes32) private _commitSeeds;          // V-002: creation-time seed for late-seal fallback
    mapping(uint256 => uint256) private _repanelCount;           // V-001: number of repanels for this dispute

    constructor(
        address _lobToken,
        address _stakingManager,
        address _reputationSystem,
        address _sybilGuard,
        address _rewardDistributor
    ) {
        require(_lobToken != address(0), "DA:zero token");
        require(_stakingManager != address(0), "DA:zero staking");
        require(_reputationSystem != address(0), "DA:zero reputation");
        require(_sybilGuard != address(0), "DA:zero sybilGuard");
        require(_rewardDistributor != address(0), "DA:zero rewardDistributor");

        lobToken = IERC20(_lobToken);
        stakingManager = IStakingManager(_stakingManager);
        reputationSystem = IReputationSystem(_reputationSystem);
        sybilGuard = ISybilGuard(_sybilGuard);
        rewardDistributor = IRewardDistributor(_rewardDistributor);

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function stakeAsArbitrator(uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "DA:zero amount");
        require(!sybilGuard.checkBanned(msg.sender), "DA:banned");

        ArbitratorInfo storage info = _arbitrators[msg.sender];
        info.stake += amount;

        ArbitratorRank newRank = _rankFromStake(info.stake);
        require(newRank != ArbitratorRank.None, "DA:below minimum stake");

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
        require(amount > 0 && amount <= info.stake, "DA:invalid amount");
        require(_activeDisputeCount[msg.sender] == 0, "DA:active disputes pending");

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
        string calldata buyerEvidenceURI
    ) external onlyRole(ESCROW_ROLE) nonReentrant returns (uint256 disputeId) {
        require(buyer != address(0) && seller != address(0), "DA:zero address");
        require(amount > 0, "DA:zero amount");

        disputeId = _nextDisputeId++;

        Dispute storage d = _disputes[disputeId];
        d.id = disputeId;
        d.jobId = jobId;
        d.buyer = buyer;
        d.seller = seller;
        d.amount = amount;
        d.token = token;
        d.buyerEvidenceURI = buyerEvidenceURI;
        d.status = DisputeStatus.PanelPending;
        d.ruling = Ruling.Pending;
        d.createdAt = block.timestamp;
        d.panelSealBlock = block.number + PANEL_SEAL_DELAY;

        // V-002: Normalize amount to 18 decimals for reward/threshold calculations.
        uint256 normalizedAmount = _normalizeAmount(amount, token);
        _normalizedAmounts[disputeId] = normalizedAmount;

        // V-002: Store creation-time seed for late-seal fallback (not grindable at seal time)
        _commitSeeds[disputeId] = blockhash(block.number - 1);

        emit DisputeCreated(disputeId, jobId, buyer, seller, amount);
    }

    /// @notice Seal the arbitrator panel after the commit delay. Permissionless.
    function sealPanel(uint256 disputeId) external whenNotPaused {
        Dispute storage d = _disputes[disputeId];
        require(d.id != 0, "DA:dispute not found");
        require(d.status == DisputeStatus.PanelPending, "DA:wrong status");
        require(block.number > d.panelSealBlock, "DA:seal delay not met");

        // Primary seed: blockhash of the commit block (unbiasable at dispute creation time)
        bytes32 bh = blockhash(d.panelSealBlock);
        uint256 seed;
        if (uint256(bh) != 0) {
            seed = uint256(keccak256(abi.encodePacked(bh, d.buyer, d.seller, d.amount, disputeId, block.chainid)));
        } else {
            // V-002: Fallback uses pre-committed seed from dispute creation time.
            // Not grindable at seal time since it was fixed before panelSealBlock.
            seed = uint256(keccak256(abi.encodePacked(_commitSeeds[disputeId], d.buyer, d.seller, d.amount, disputeId, block.chainid)));
        }

        uint256 normalizedAmount = _normalizedAmounts[disputeId];
        // V-002: Use stored exclusions for appeal disputes (original panel excluded)
        address[3] memory excludeList = _isAppealDispute[disputeId] ? _panelExclusions[disputeId] : _emptyExcludeList();
        address[3] memory selected = _selectArbitratorsWithSeed(seed, normalizedAmount, d.buyer, d.seller, excludeList);
        d.arbitrators = selected;

        for (uint8 i = 0; i < 3; i++) {
            _activeDisputeCount[selected[i]] += 1;
        }

        // V-002: Appeals skip evidence phase — go straight to voting
        if (_isAppealDispute[disputeId]) {
            d.status = DisputeStatus.Voting;
            d.votingDeadline = block.timestamp + VOTING_DEADLINE;
        } else {
            d.status = DisputeStatus.EvidencePhase;
            d.counterEvidenceDeadline = block.timestamp + COUNTER_EVIDENCE_WINDOW;
        }

        emit PanelSealed(disputeId, selected);
        emit ArbitratorsAssigned(disputeId, selected);
    }

    function submitCounterEvidence(uint256 disputeId, string calldata sellerEvidenceURI) external nonReentrant {
        Dispute storage d = _disputes[disputeId];
        require(d.id != 0, "DA:dispute not found");
        require(msg.sender == d.seller, "DA:not seller");
        require(d.status == DisputeStatus.EvidencePhase, "DA:wrong status");
        require(block.timestamp <= d.counterEvidenceDeadline, "DA:deadline passed");

        d.sellerEvidenceURI = sellerEvidenceURI;
        d.status = DisputeStatus.Voting;
        d.votingDeadline = block.timestamp + VOTING_DEADLINE;

        emit CounterEvidenceSubmitted(disputeId, sellerEvidenceURI);
    }

    function advanceToVoting(uint256 disputeId) external whenNotPaused {
        Dispute storage d = _disputes[disputeId];
        require(d.id != 0, "DA:dispute not found");
        require(d.status == DisputeStatus.EvidencePhase, "DA:wrong status");
        require(block.timestamp > d.counterEvidenceDeadline, "DA:deadline not passed");

        d.status = DisputeStatus.Voting;
        d.votingDeadline = block.timestamp + VOTING_DEADLINE;

        emit VotingAdvanced(disputeId);
    }

    function vote(uint256 disputeId, bool favorBuyer) external nonReentrant whenNotPaused {
        Dispute storage d = _disputes[disputeId];
        require(d.id != 0, "DA:dispute not found");
        require(d.status == DisputeStatus.Voting, "DA:not in voting");
        require(!_hasVoted[disputeId][msg.sender], "DA:already voted");
        require(_isAssignedArbitrator(disputeId, msg.sender), "DA:not assigned");
        require(block.timestamp <= d.votingDeadline, "DA:voting deadline passed");
        require(!sybilGuard.checkBanned(msg.sender), "DA:arbitrator banned");

        // Vote cooldown — forces deliberation between votes (skip for first-time voters)
        require(
            lastVoteTimestamp[msg.sender] == 0 ||
            block.timestamp >= lastVoteTimestamp[msg.sender] + VOTE_COOLDOWN,
            "DA:vote cooldown"
        );
        lastVoteTimestamp[msg.sender] = block.timestamp;

        _hasVoted[disputeId][msg.sender] = true;
        _votedForBuyer[disputeId][msg.sender] = favorBuyer;
        d.totalVotes += 1;

        if (favorBuyer) {
            d.votesForBuyer += 1;
            buyerVoteCount[msg.sender] += 1;
        } else {
            d.votesForSeller += 1;
            sellerVoteCount[msg.sender] += 1;
        }

        emit VoteCast(disputeId, msg.sender, favorBuyer);
    }

    /// @notice Execute ruling. Requires all 3 votes, or deadline passed with >= 1 vote,
    ///         or deadline passed with 0 votes after MAX_REPANELS exhausted.
    function executeRuling(uint256 disputeId) external nonReentrant whenNotPaused {
        Dispute storage d = _disputes[disputeId];
        require(d.id != 0, "DA:dispute not found");
        require(d.status == DisputeStatus.Voting, "DA:not in voting");

        if (d.totalVotes < 3) {
            require(block.timestamp > d.votingDeadline, "DA:voting still open");
        }

        // V-001: Block zero-vote resolution — must repanel first (up to MAX_REPANELS).
        // Only allow 0-vote Draw as absolute last resort after all repanels exhausted.
        if (d.totalVotes == 0) {
            require(
                _repanelCount[disputeId] >= MAX_REPANELS,
                "DA:no votes, must repanel"
            );
        }

        d.status = DisputeStatus.Resolved;

        // Decrement active dispute count
        for (uint8 i = 0; i < 3; i++) {
            if (_activeDisputeCount[d.arbitrators[i]] > 0) {
                _activeDisputeCount[d.arbitrators[i]] -= 1;
            }
        }

        // V-002/V-003: Determine ruling FIRST (including quorum check),
        // then compute rewards based on final ruling to prevent inflation.
        if (d.totalVotes < MIN_QUORUM) {
            d.ruling = Ruling.Draw;
        } else if (d.votesForBuyer > d.votesForSeller) {
            d.ruling = Ruling.BuyerWins;
            // V-001: Slash deferred to finalizeRuling/appeal execution (once per job)
            reputationSystem.recordDispute(d.seller, false);
        } else if (d.votesForBuyer == d.votesForSeller) {
            d.ruling = Ruling.Draw;
        } else {
            d.ruling = Ruling.SellerWins;
            reputationSystem.recordDispute(d.seller, true);
        }

        // Set appeal deadline
        d.appealDeadline = block.timestamp + APPEAL_WINDOW;

        // V-002: Use normalized amount (18 decimals) for reward calculation.
        uint256 baseRewardPerArb = _calculateBaseReward(_normalizedAmounts[disputeId]);
        bool majorityForBuyer = d.votesForBuyer > d.votesForSeller;
        // Use final ruling to determine draw status (accounts for quorum → Draw)
        bool isDraw = d.ruling == Ruling.Draw;

        // V-003: Read available budget (balance minus existing liabilities)
        uint256 remainingBudget = rewardDistributor.availableBudget(address(lobToken));

        // Track pairwise agreements for collusion detection (Fix #3a)
        _trackPairwiseAgreements(disputeId, d);

        // Process arbitrator stats + rewards
        for (uint8 i = 0; i < 3; i++) {
            address arb = d.arbitrators[i];
            ArbitratorInfo storage arbInfo = _arbitrators[arb];

            if (!_hasVoted[disputeId][arb]) {
                // Non-voter: no reward + slash 0.5% of arb stake
                _slashNoShow(arb);
                continue;
            }

            arbInfo.disputesHandled += 1;
            bool votedBuyer = _votedForBuyer[disputeId][arb];

            uint256 reward;
            if (isDraw) {
                // Draw: everyone who voted gets base reward (no majority bonus)
                reward = baseRewardPerArb;
            } else if (votedBuyer == majorityForBuyer) {
                // Majority voter: base + 30% bonus
                arbInfo.majorityVotes += 1;
                reward = baseRewardPerArb + (baseRewardPerArb * MAJORITY_BONUS_BPS / 10000);
            } else {
                // Minority voter: base - 20% penalty
                reward = baseRewardPerArb - (baseRewardPerArb * MINORITY_PENALTY_BPS / 10000);
            }

            // Apply quality multiplier (majority rate + rank)
            reward = _applyQualityMultiplier(arb, reward);

            // Apply rubber-stamp penalty (Fix #3b: lifetime bias detection)
            // Only applies after QUALITY_GRACE_PERIOD votes to avoid penalizing new arbitrators
            uint256 totalVotesByArb = buyerVoteCount[arb] + sellerVoteCount[arb];
            if (totalVotesByArb > QUALITY_GRACE_PERIOD) {
                uint256 maxVotes = buyerVoteCount[arb] > sellerVoteCount[arb]
                    ? buyerVoteCount[arb]
                    : sellerVoteCount[arb];
                uint256 biasRate = (maxVotes * 10000) / totalVotesByArb;
                if (biasRate > RUBBER_STAMP_BIAS_THRESHOLD) {
                    reward = reward * (10000 - RUBBER_STAMP_PENALTY_BPS) / 10000;
                }
            }

            // V-003: Cap reward to remaining budget to prevent insolvency
            if (reward > 0) {
                if (reward > remainingBudget) {
                    reward = remainingBudget;
                }
                if (reward > 0) {
                    rewardDistributor.creditArbitratorReward(arb, address(lobToken), reward);
                    remainingBudget -= reward;
                }
            }
        }

        // For appeal disputes, release escrow immediately (appeal rulings are final)
        if (_isAppealDispute[disputeId]) {
            // V-001: Apply deferred slash for final BuyerWins (once per job)
            if (d.ruling == Ruling.BuyerWins) {
                _applyStakeSlash(d);
            }
            _releaseEscrow(disputeId);
            _handleAppealBond(disputeId);
        }

        emit RulingExecuted(disputeId, d.ruling);
    }

    /// @notice Finalize ruling and release escrow funds after appeal window expires.
    ///         Only needed for non-appeal disputes.
    function finalizeRuling(uint256 disputeId) external nonReentrant whenNotPaused {
        Dispute storage d = _disputes[disputeId];
        require(d.id != 0, "DA:dispute not found");
        require(d.status == DisputeStatus.Resolved, "DA:not resolved");
        require(!d.appealed, "DA:dispute was appealed");
        require(!_isAppealDispute[disputeId], "DA:use executeRuling for appeals");
        require(!_escrowReleased[disputeId], "DA:escrow already released");
        require(block.timestamp > d.appealDeadline, "DA:appeal window active");

        // V-001: Apply deferred slash for BuyerWins (once per job)
        if (d.ruling == Ruling.BuyerWins) {
            _applyStakeSlash(d);
        }

        _releaseEscrow(disputeId);

        emit RulingFinalized(disputeId, d.ruling);
    }

    /// @notice Appeal a resolved dispute within the appeal window.
    function appealRuling(uint256 disputeId) external nonReentrant whenNotPaused returns (uint256 appealDisputeId) {
        Dispute storage d = _disputes[disputeId];
        require(d.id != 0, "DA:dispute not found");
        require(d.status == DisputeStatus.Resolved, "DA:not resolved");
        require(!d.appealed, "DA:already appealed");
        require(!_isAppealDispute[disputeId], "DA:cannot appeal an appeal");
        require(
            msg.sender == d.buyer || msg.sender == d.seller,
            "DA:not a party"
        );
        require(block.timestamp <= d.appealDeadline, "DA:appeal window closed");

        // Collect appeal bond
        lobToken.safeTransferFrom(msg.sender, address(this), APPEAL_BOND);

        d.appealed = true;
        d.status = DisputeStatus.Appealed;
        _appealer[disputeId] = msg.sender;

        // Create new appeal dispute with fresh panel (excluding original arbitrators)
        appealDisputeId = _createAppealDispute(disputeId, d);

        emit AppealFiled(disputeId, appealDisputeId, msg.sender);
    }

    function getDispute(uint256 disputeId) external view returns (Dispute memory) {
        Dispute memory d = _disputes[disputeId];
        require(d.id != 0, "DA:not found");
        return d;
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

    function getAgreementRate(
        address arbA,
        address arbB
    ) external view returns (uint256 agreements, uint256 disagreements) {
        bytes32 key = _pairKey(arbA, arbB);
        return (_pairAgreements[key], _pairDisagreements[key]);
    }

    function isAppealDispute(uint256 disputeId) external view returns (bool) {
        return _isAppealDispute[disputeId];
    }

    function getAppealDisputeId(uint256 originalId) external view returns (uint256) {
        return _appealDisputeId[originalId];
    }

    // --- Arbitrator Self-Pause ---

    function pauseAsArbitrator() external {
        ArbitratorInfo storage info = _arbitrators[msg.sender];
        require(info.active, "DA:not active");
        require(!_arbitratorPaused[msg.sender], "DA:already paused");
        _arbitratorPaused[msg.sender] = true;
        _removeActiveArbitrator(msg.sender);
        emit ArbitratorPaused(msg.sender);
    }

    function unpauseAsArbitrator() external {
        require(_arbitratorPaused[msg.sender], "DA:not paused");
        ArbitratorInfo storage info = _arbitrators[msg.sender];
        require(info.active, "DA:removed while paused");
        _arbitratorPaused[msg.sender] = false;
        if (!_isActiveArbitrator[msg.sender]) {
            _arbitratorIndex[msg.sender] = _activeArbitrators.length;
            _activeArbitrators.push(msg.sender);
            _isActiveArbitrator[msg.sender] = true;
        }
        emit ArbitratorUnpaused(msg.sender);
    }

    function isArbitratorPaused(address arb) external view returns (bool) {
        return _arbitratorPaused[arb];
    }

    /// @notice Emergency resolution for disputes stuck in PanelPending when
    ///         the arbitrator pool is objectively insufficient. Resolves as Draw (50/50 split).
    ///         Permissionless — anyone can call after timeout expires.
    function emergencyResolveStuckDispute(uint256 disputeId) external nonReentrant {
        Dispute storage d = _disputes[disputeId];
        require(d.id != 0, "DA:dispute not found");
        require(d.status == DisputeStatus.PanelPending, "DA:not stuck");
        require(
            block.timestamp > d.createdAt + PANEL_SEAL_TIMEOUT,
            "DA:timeout not reached"
        );
        // V-001: Only allow emergency draw when the pool cannot form a panel.
        // If >= 3 active arbitrators exist, seal the panel instead.
        require(
            _activeArbitrators.length < 3,
            "DA:pool sufficient, seal panel"
        );

        d.status = DisputeStatus.Resolved;
        d.ruling = Ruling.Draw;
        d.appealDeadline = 0;

        _releaseEscrow(disputeId);

        emit EmergencyResolution(disputeId);
    }

    /// @notice Repanel a dispute that reached the voting deadline with zero votes.
    ///         Slashes no-shows from the old panel, resets to PanelPending for a new panel.
    ///         Permissionless — anyone can call. Limited to MAX_REPANELS per dispute.
    function repanelDispute(uint256 disputeId) external nonReentrant whenNotPaused {
        Dispute storage d = _disputes[disputeId];
        require(d.id != 0, "DA:dispute not found");
        require(d.status == DisputeStatus.Voting, "DA:not in voting");
        require(block.timestamp > d.votingDeadline, "DA:voting still open");
        require(d.totalVotes == 0, "DA:votes were cast");
        require(_repanelCount[disputeId] < MAX_REPANELS, "DA:max repanels reached");

        _repanelCount[disputeId] += 1;

        // Slash no-shows and release old panel from active duty
        for (uint8 i = 0; i < 3; i++) {
            address arb = d.arbitrators[i];
            _slashNoShow(arb);
            if (_activeDisputeCount[arb] > 0) {
                _activeDisputeCount[arb] -= 1;
            }
        }

        // Reset to PanelPending for fresh panel selection
        d.status = DisputeStatus.PanelPending;
        d.panelSealBlock = block.number + PANEL_SEAL_DELAY;
        d.arbitrators = [address(0), address(0), address(0)];
        d.votingDeadline = 0;
        d.counterEvidenceDeadline = 0;
        _commitSeeds[disputeId] = blockhash(block.number - 1);

        emit DisputeRepaneled(disputeId, _repanelCount[disputeId]);
    }

    // --- Admin ---

    function setEscrowEngine(address _escrowEngine) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(address(escrowEngine) == address(0), "DA:escrow already set");
        require(_escrowEngine != address(0), "DA:zero escrow");
        escrowEngine = IEscrowEngine(_escrowEngine);
    }

    function removeArbitrator(address arbitrator) external onlyRole(SYBIL_GUARD_ROLE) {
        ArbitratorInfo storage info = _arbitrators[arbitrator];
        info.active = false;
        _removeActiveArbitrator(arbitrator);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // --- Internal ---

    function _releaseEscrow(uint256 disputeId) internal {
        if (_escrowReleased[disputeId]) return;
        _escrowReleased[disputeId] = true;

        Dispute storage d = _disputes[disputeId];

        if (d.ruling == Ruling.Draw) {
            escrowEngine.resolveDisputeDraw(d.jobId);
        } else {
            escrowEngine.resolveDispute(d.jobId, d.ruling == Ruling.BuyerWins);
        }
    }

    function _handleAppealBond(uint256 disputeId) internal {
        uint256 originalId = _originalDisputeId[disputeId];
        Dispute storage original = _disputes[originalId];
        Dispute storage appeal = _disputes[disputeId];

        address appealer = _appealer[originalId];

        if (appeal.ruling == original.ruling) {
            // Appeal upheld original ruling → bond goes to reward pool
            lobToken.safeApprove(address(rewardDistributor), 0);
            lobToken.safeApprove(address(rewardDistributor), APPEAL_BOND);
            rewardDistributor.deposit(address(lobToken), APPEAL_BOND);
            emit AppealBondForfeited(originalId, APPEAL_BOND);
        } else {
            // Appeal overturned → return bond to appealer
            lobToken.safeTransfer(appealer, APPEAL_BOND);
            emit AppealBondReturned(originalId, appealer, APPEAL_BOND);
        }
    }

    function _createAppealDispute(
        uint256 originalId,
        Dispute storage original
    ) internal returns (uint256 appealDisputeId) {
        appealDisputeId = _nextDisputeId++;

        Dispute storage d = _disputes[appealDisputeId];
        d.id = appealDisputeId;
        d.jobId = original.jobId;
        d.buyer = original.buyer;
        d.seller = original.seller;
        d.amount = original.amount;
        d.token = original.token;
        d.buyerEvidenceURI = original.buyerEvidenceURI;
        d.sellerEvidenceURI = original.sellerEvidenceURI;
        d.status = DisputeStatus.PanelPending; // V-002: two-phase for appeals too
        d.ruling = Ruling.Pending;
        d.createdAt = block.timestamp;
        d.panelSealBlock = block.number + PANEL_SEAL_DELAY;

        // Copy normalized amount from original
        _normalizedAmounts[appealDisputeId] = _normalizedAmounts[originalId];

        // V-002: Store exclusion list and commit seed for two-phase seal
        _panelExclusions[appealDisputeId] = original.arbitrators;
        _commitSeeds[appealDisputeId] = blockhash(block.number - 1);

        // Link the disputes
        _isAppealDispute[appealDisputeId] = true;
        _appealDisputeId[originalId] = appealDisputeId;
        _originalDisputeId[appealDisputeId] = originalId;

        emit DisputeCreated(appealDisputeId, original.jobId, original.buyer, original.seller, original.amount);
    }

    function _trackPairwiseAgreements(uint256 disputeId, Dispute storage d) internal {
        // Compare each pair of voters
        for (uint8 i = 0; i < 3; i++) {
            if (!_hasVoted[disputeId][d.arbitrators[i]]) continue;
            for (uint8 j = i + 1; j < 3; j++) {
                if (!_hasVoted[disputeId][d.arbitrators[j]]) continue;

                bytes32 key = _pairKey(d.arbitrators[i], d.arbitrators[j]);
                bool iVotedBuyer = _votedForBuyer[disputeId][d.arbitrators[i]];
                bool jVotedBuyer = _votedForBuyer[disputeId][d.arbitrators[j]];

                if (iVotedBuyer == jVotedBuyer) {
                    _pairAgreements[key]++;
                } else {
                    _pairDisagreements[key]++;
                }

                // Emit collusion flag if threshold crossed
                uint256 total = _pairAgreements[key] + _pairDisagreements[key];
                if (total >= COLLUSION_MIN_DISPUTES) {
                    uint256 rate = (_pairAgreements[key] * 100) / total;
                    if (rate >= COLLUSION_AGREEMENT_THRESHOLD) {
                        emit CollusionFlagged(d.arbitrators[i], d.arbitrators[j], rate);
                    }
                }
            }
        }
    }

    function _pairKey(address a, address b) internal pure returns (bytes32) {
        // Deterministic ordering so (a,b) and (b,a) produce the same key
        if (a < b) return keccak256(abi.encodePacked(a, b));
        return keccak256(abi.encodePacked(b, a));
    }

    function _emptyExcludeList() internal pure returns (address[3] memory) {
        return [address(0), address(0), address(0)];
    }

    function _calculateBaseReward(uint256 disputeAmount) internal pure returns (uint256) {
        // 20 LOB per 1000 LOB disputed (2% effective rate)
        return (disputeAmount * BASE_REWARD_PER_1K_LOB) / 1000 ether;
    }

    function _applyQualityMultiplier(address arb, uint256 reward) internal view returns (uint256) {
        ArbitratorInfo storage info = _arbitrators[arb];

        // Grace period: first 5 disputes skip quality filter
        if (info.disputesHandled <= QUALITY_GRACE_PERIOD) {
            return _applyRankMultiplier(info.rank, reward);
        }

        // Quality score: majority vote rate
        uint256 majorityRate = (info.majorityVotes * 10000) / info.disputesHandled;
        if (majorityRate < 4000) return 0;           // below 40% = disqualified
        if (majorityRate < 6000) reward = reward / 2; // below 60% = halved

        return _applyRankMultiplier(info.rank, reward);
    }

    function _applyRankMultiplier(ArbitratorRank rank, uint256 reward) internal pure returns (uint256) {
        if (rank == ArbitratorRank.Principal) return reward * 2;
        if (rank == ArbitratorRank.Senior) return (reward * 150) / 100;
        return reward; // Junior = 1x
    }

    function _slashNoShow(address arb) internal {
        ArbitratorInfo storage info = _arbitrators[arb];
        if (info.stake == 0) return;

        uint256 slashAmount = (info.stake * NO_SHOW_SLASH_BPS) / 10000;
        if (slashAmount == 0) return;

        info.stake -= slashAmount;

        // V-002: Update rank after slash — deactivate if below minimum
        ArbitratorRank newRank = _rankFromStake(info.stake);
        info.rank = newRank;
        if (newRank == ArbitratorRank.None) {
            info.active = false;
            _removeActiveArbitrator(arb);
        }

        // Transfer slashed LOB into RewardDistributor reward pool
        lobToken.safeApprove(address(rewardDistributor), 0);
        lobToken.safeApprove(address(rewardDistributor), slashAmount);
        rewardDistributor.deposit(address(lobToken), slashAmount);
    }

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

    /// @dev V-001: Apply stake slash for BuyerWins, guarded by per-job flag.
    function _applyStakeSlash(Dispute storage d) internal {
        if (_jobStakeSlashed[d.jobId]) return;
        _jobStakeSlashed[d.jobId] = true;

        uint256 stakeSlash = (stakingManager.getStake(d.seller) * SLASH_MIN_BPS) / 10000;
        uint256 slashAmount = stakeSlash < d.amount ? stakeSlash : d.amount;
        if (slashAmount > 0) {
            stakingManager.slash(d.seller, slashAmount, d.buyer);
        }
    }

    function _selectArbitratorsWithSeed(
        uint256 seed,
        uint256 disputeAmount,
        address _buyer,
        address _seller,
        address[3] memory excludeList
    ) internal view returns (address[3] memory selected) {
        uint256 count = _activeArbitrators.length;
        require(count >= 3, "DA:not enough arbitrators");

        uint256 found = 0;
        uint256 attempts = 0;

        while (found < 3 && attempts < count * 10) {
            uint256 idx = uint256(keccak256(abi.encodePacked(seed, attempts))) % count;
            attempts++;

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

            // V-001: Exclude dispute participants from arbitrator panel
            if (candidate == _buyer || candidate == _seller) continue;
            if (sybilGuard.checkBanned(candidate)) continue;
            if (_arbitratorPaused[candidate]) continue;
            if (info.rank == ArbitratorRank.Junior && disputeAmount > JUNIOR_MAX_DISPUTE) continue;
            if (info.rank == ArbitratorRank.Senior && disputeAmount > SENIOR_MAX_DISPUTE) continue;

            // Exclude specific arbitrators (used for appeal panels)
            bool excluded = false;
            for (uint256 e = 0; e < 3; e++) {
                if (excludeList[e] != address(0) && candidate == excludeList[e]) {
                    excluded = true;
                    break;
                }
            }
            if (excluded) continue;

            // Collusion filter: skip candidate if high agreement rate with any already-selected arb
            bool collusionRisk = false;
            for (uint256 s = 0; s < found; s++) {
                bytes32 key = _pairKey(candidate, selected[s]);
                uint256 total = _pairAgreements[key] + _pairDisagreements[key];
                if (total >= COLLUSION_MIN_DISPUTES) {
                    uint256 rate = (_pairAgreements[key] * 100) / total;
                    if (rate >= COLLUSION_AGREEMENT_THRESHOLD) {
                        collusionRisk = true;
                        break;
                    }
                }
            }
            if (collusionRisk) continue;

            selected[found] = candidate;
            found++;
        }

        require(found == 3, "DA:panel selection failed");
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
}
