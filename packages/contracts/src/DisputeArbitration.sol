// SPDX-License-Identifier: MIT
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
import "./interfaces/IDisputeArbitration.sol";
import "./interfaces/IEscrowEngine.sol";
import "./interfaces/IStakingManager.sol";
import "./interfaces/IReputationSystem.sol";
import "./interfaces/ISybilGuard.sol";
import "./interfaces/IRewardDistributor.sol";
import "./interfaces/IRolePayroll.sol";

contract DisputeArbitration is IDisputeArbitration, Initializable, UUPSUpgradeable, OwnableUpgradeable, AccessControlUpgradeable, ReentrancyGuardUpgradeable, PausableUpgradeable {
    using SafeERC20 for IERC20;

    // Custom errors (saves ~2KB bytecode vs require strings)
    error NotFound();
    error ZeroAddress();
    error ZeroAmount();
    error WrongStatus();
    error Unauthorized();
    error Banned();
    error BelowMinStake();
    error InvalidAmount();
    error ActiveDisputes();
    error SealDelay();
    error DeadlinePassed();
    error DeadlineNotPassed();
    error AlreadyVoted();
    error NotAssigned();
    error VotingOpen();
    error VotingClosed();
    error NoVotesMustRepanel();
    error Appealed();
    error NotAppealed();
    error CannotAppealAppeal();
    error NotParty();
    error AppealWindowClosed();
    error AppealWindowActive();
    error EscrowReleased();
    error UseExecuteRuling();
    error AlreadyPaused();
    error NotPaused();
    error RemovedWhilePaused();
    error NotActive();
    error EscrowAlreadySet();
    error PoolSufficient();
    error VotesCast();
    error MaxRepanels();
    error NotEnoughArbitrators();
    error PanelSelectionFailed();
    error CooldownActive();
    error ZeroArbitrator();

    bytes32 public constant ESCROW_ROLE = keccak256("ESCROW_ROLE");
    bytes32 public constant SYBIL_GUARD_ROLE = keccak256("SYBIL_GUARD_ROLE");
    bytes32 public constant CERTIFIER_ROLE = keccak256("CERTIFIER_ROLE");

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
    uint256 public constant NO_SHOW_SLASH_BPS = 5000;            // 50% stake slash for not voting (half stake)
    uint256 public constant QUALITY_GRACE_PERIOD = 5;            // first 5 disputes = no quality filter
    uint256 public constant MIN_QUORUM = 2;                      // minimum votes for non-Draw ruling

    // Collusion detection constants
    uint256 public constant COLLUSION_AGREEMENT_THRESHOLD = 90; // 90% agreement = flagged
    uint256 public constant COLLUSION_MIN_DISPUTES = 20;         // need 20+ shared disputes

    // Appeal constants
    uint256 public constant APPEAL_BOND = 500 ether;   // 500 LOB to appeal
    uint256 public constant APPEAL_WINDOW = 48 hours;   // Time after ruling to file appeal

    // Two-phase panel selection
    uint256 public constant PANEL_SEAL_DELAY = 10; // ~20s on Base (2s blocks)

    // Emergency resolution timeout for stuck disputes
    uint256 public constant PANEL_SEAL_TIMEOUT = 7 days;

    // Repanel limit for zero-vote deadlocks
    uint256 public constant MAX_REPANELS = 2;

    // Protected arbitrator addresses that can never lose arb status (Solomon, Titus, Daniel)
    mapping(address => bool) public protectedArbiters;
    address[] private _protectedArbList;

    IERC20 public lobToken;
    IStakingManager public stakingManager;
    IReputationSystem public reputationSystem;
    ISybilGuard public sybilGuard;
    IRewardDistributor public rewardDistributor;
    IEscrowEngine public escrowEngine; // Set post-deploy (circular dependency)
    IRolePayroll public rolePayroll;   // Set post-deploy (optional integration)

    uint256 private _nextDisputeId = 1;

    mapping(uint256 => Dispute) private _disputes;
    mapping(address => ArbitratorInfo) private _arbitrators;
    mapping(uint256 => mapping(address => bool)) private _hasVoted;
    mapping(uint256 => mapping(address => bool)) private _votedForBuyer;
    mapping(address => uint256) private _activeDisputeCount;
    // Normalized dispute amounts (18 decimals) for reward/threshold calculations
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
    mapping(uint256 => bool) private _jobStakeSlashed;        // jobId → stake already slashed
    mapping(uint256 => address[3]) private _panelExclusions;   // appeal panel exclusions
    mapping(uint256 => bytes32) private _commitSeeds;          // creation-time seed for late-seal fallback
    mapping(uint256 => uint256) private _repanelCount;           // number of repanels for this dispute
    mapping(uint256 => bool) private _isDefaultRefund;             // buyer refund due to system failure
    mapping(address => bool) private _arbitratorCertified;          // competency test passed

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _lobToken,
        address _stakingManager,
        address _reputationSystem,
        address _sybilGuard,
        address _rewardDistributor
    ) public virtual initializer {
        if (_lobToken == address(0)) revert ZeroAddress();
        if (_stakingManager == address(0)) revert ZeroAddress();
        if (_reputationSystem == address(0)) revert ZeroAddress();
        if (_sybilGuard == address(0)) revert ZeroAddress();
        if (_rewardDistributor == address(0)) revert ZeroAddress();

        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();
        __AccessControl_init();
        __ReentrancyGuard_init();
        __Pausable_init();

        lobToken = IERC20(_lobToken);
        stakingManager = IStakingManager(_stakingManager);
        reputationSystem = IReputationSystem(_reputationSystem);
        sybilGuard = ISybilGuard(_sybilGuard);
        rewardDistributor = IRewardDistributor(_rewardDistributor);

        // Grant DEFAULT_ADMIN_ROLE to owner (can reassign and grant other roles)
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

        _nextDisputeId = 1;
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    function stakeAsArbitrator(uint256 amount) external nonReentrant whenNotPaused {
        if (amount == 0) revert ZeroAmount();
        if (sybilGuard.checkBanned(msg.sender)) revert Banned();

        ArbitratorInfo storage info = _arbitrators[msg.sender];
        info.stake += amount;

        ArbitratorRank newRank = _rankFromStake(info.stake);
        if (newRank == ArbitratorRank.None) revert BelowMinStake();

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
        if (amount == 0 || amount > info.stake) revert InvalidAmount();
        if (_activeDisputeCount[msg.sender] != 0) revert ActiveDisputes();

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
        if (buyer == address(0) || seller == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

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

        // Normalize amount to 18 decimals for reward/threshold calculations.
        uint256 normalizedAmount = _normalizeAmount(amount, token);
        _normalizedAmounts[disputeId] = normalizedAmount;

        // Store creation-time seed for late-seal fallback (not grindable at seal time)
        _commitSeeds[disputeId] = blockhash(block.number - 1);

        emit DisputeCreated(disputeId, jobId, buyer, seller, amount);
    }

    /// @notice Seal the arbitrator panel after the commit delay. Permissionless.
    ///         Must be called within 256 blocks of panelSealBlock to prevent seed manipulation.
    ///         If the window is missed, call repanel() to get a fresh seed.
    function sealPanel(uint256 disputeId) external whenNotPaused {
        Dispute storage d = _disputes[disputeId];
        if (d.id == 0) revert NotFound();
        if (d.status != DisputeStatus.PanelPending) revert WrongStatus();
        if (block.number <= d.panelSealBlock) revert SealDelay();
        require(block.number <= d.panelSealBlock + 256, "DA: seal window expired, call repanel");

        // Seed: blockhash of the commit block (unbiasable at dispute creation time)
        bytes32 bh = blockhash(d.panelSealBlock);
        // Should always be available since we enforce the 256-block window above
        require(uint256(bh) != 0, "DA: blockhash unavailable");
        uint256 seed = uint256(keccak256(abi.encodePacked(bh, d.buyer, d.seller, d.amount, disputeId, block.chainid)));

        uint256 normalizedAmount = _normalizedAmounts[disputeId];
        // Use stored exclusions for appeal disputes (original panel excluded)
        address[3] memory excludeList = _isAppealDispute[disputeId] ? _panelExclusions[disputeId] : _emptyExcludeList();
        address[3] memory selected = _selectArbitratorsWithSeed(seed, normalizedAmount, d.buyer, d.seller, excludeList);
        d.arbitrators = selected;

        for (uint8 i = 0; i < 3; i++) {
            _activeDisputeCount[selected[i]] += 1;
        }

        // Appeals skip evidence phase — go straight to voting
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

    /// @notice Reset the seal window if the 256-block window was missed. Permissionless.
    ///         Assigns a fresh panelSealBlock so sealPanel() can be retried.
    function repanel(uint256 disputeId) external whenNotPaused {
        Dispute storage d = _disputes[disputeId];
        if (d.id == 0) revert NotFound();
        if (d.status != DisputeStatus.PanelPending) revert WrongStatus();
        require(block.number > d.panelSealBlock + 256, "DA: seal window still open");

        d.panelSealBlock = block.number + PANEL_SEAL_DELAY;
        _commitSeeds[disputeId] = blockhash(block.number - 1);

        emit DisputeRepaneled(disputeId, 1);
    }

    function submitCounterEvidence(uint256 disputeId, string calldata sellerEvidenceURI) external nonReentrant {
        Dispute storage d = _disputes[disputeId];
        if (d.id == 0) revert NotFound();
        if (msg.sender != d.seller) revert NotParty();
        if (d.status != DisputeStatus.EvidencePhase) revert WrongStatus();
        if (block.timestamp > d.counterEvidenceDeadline) revert DeadlinePassed();

        d.sellerEvidenceURI = sellerEvidenceURI;
        d.status = DisputeStatus.Voting;
        d.votingDeadline = block.timestamp + VOTING_DEADLINE;

        emit CounterEvidenceSubmitted(disputeId, sellerEvidenceURI);
    }

    function advanceToVoting(uint256 disputeId) external whenNotPaused {
        Dispute storage d = _disputes[disputeId];
        if (d.id == 0) revert NotFound();
        if (d.status != DisputeStatus.EvidencePhase) revert WrongStatus();
        if (block.timestamp <= d.counterEvidenceDeadline) revert DeadlineNotPassed();

        d.status = DisputeStatus.Voting;
        d.votingDeadline = block.timestamp + VOTING_DEADLINE;

        emit VotingAdvanced(disputeId);
    }

    function vote(uint256 disputeId, bool favorBuyer) external nonReentrant whenNotPaused {
        Dispute storage d = _disputes[disputeId];
        if (d.id == 0) revert NotFound();
        if (d.status != DisputeStatus.Voting) revert WrongStatus();
        if (_hasVoted[disputeId][msg.sender]) revert AlreadyVoted();
        if (!_isAssignedArbitrator(disputeId, msg.sender)) revert NotAssigned();
        if (block.timestamp > d.votingDeadline) revert DeadlinePassed();
        if (sybilGuard.checkBanned(msg.sender)) revert Banned();

        // Vote cooldown — forces deliberation between votes (skip for first-time voters)
        if (
            lastVoteTimestamp[msg.sender] != 0 &&
            block.timestamp < lastVoteTimestamp[msg.sender] + VOTE_COOLDOWN
        ) revert CooldownActive();
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
        if (d.id == 0) revert NotFound();
        if (d.status != DisputeStatus.Voting) revert WrongStatus();

        if (d.totalVotes < 3) {
            if (block.timestamp <= d.votingDeadline) revert VotingOpen();
        }

        // Block zero-vote resolution — must repanel first (up to MAX_REPANELS).
        // Only allow 0-vote Draw as absolute last resort after all repanels exhausted.
        if (d.totalVotes == 0) {
            if (_repanelCount[disputeId] < MAX_REPANELS) revert NoVotesMustRepanel();
        }

        d.status = DisputeStatus.Resolved;

        // Decrement active dispute count
        for (uint8 i = 0; i < 3; i++) {
            if (_activeDisputeCount[d.arbitrators[i]] > 0) {
                _activeDisputeCount[d.arbitrators[i]] -= 1;
            }
        }

        // FIX: Default to Draw (neutral) when quorum is not reached.
        // Previously defaulted to BuyerWins which biased toward buyer refunds on low participation.
        if (d.totalVotes < MIN_QUORUM) {
            d.ruling = Ruling.Draw;
            _isDefaultRefund[disputeId] = true;
        } else if (d.votesForBuyer > d.votesForSeller) {
            d.ruling = Ruling.BuyerWins;
            // Slash deferred to finalizeRuling/appeal execution (once per job)
            reputationSystem.recordDispute(d.seller, false);
        } else if (d.votesForBuyer == d.votesForSeller) {
            d.ruling = Ruling.Draw;
        } else {
            d.ruling = Ruling.SellerWins;
            reputationSystem.recordDispute(d.seller, true);
        }

        // Set appeal deadline
        d.appealDeadline = block.timestamp + APPEAL_WINDOW;

        // Use normalized amount (18 decimals) for reward calculation.
        uint256 baseRewardPerArb = _calculateBaseReward(_normalizedAmounts[disputeId]);
        bool majorityForBuyer = d.votesForBuyer > d.votesForSeller;
        // Use final ruling to determine draw status (accounts for quorum → Draw)
        bool isDraw = d.ruling == Ruling.Draw;

        // Read available budget (balance minus existing liabilities)
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

            // Cap reward to remaining budget to prevent insolvency
            if (reward > 0) {
                if (reward > remainingBudget) {
                    reward = remainingBudget;
                }
                if (reward > 0) {
                    rewardDistributor.creditArbitratorReward(arb, address(lobToken), reward);
                    remainingBudget -= reward;
                }
            }

            // Record dispute participation in RolePayroll (if wired)
            if (address(rolePayroll) != address(0)) {
                bool inMajority = isDraw || (votedBuyer == majorityForBuyer);
                try rolePayroll.recordDisputeParticipation(arb, rolePayroll.currentEpoch(), inMajority) {} catch {}
            }
        }

        // For appeal disputes, release escrow immediately (appeal rulings are final)
        if (_isAppealDispute[disputeId]) {
            // Apply deferred slash for final BuyerWins (once per job)
            // Skip slash for default refunds (system failure, not seller fault)
            if (d.ruling == Ruling.BuyerWins && !_isDefaultRefund[disputeId]) {
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
        if (d.id == 0) revert NotFound();
        if (d.status != DisputeStatus.Resolved) revert WrongStatus();
        if (d.appealed) revert Appealed();
        if (_isAppealDispute[disputeId]) revert UseExecuteRuling();
        if (_escrowReleased[disputeId]) revert EscrowReleased();
        if (block.timestamp <= d.appealDeadline) revert AppealWindowActive();

        // Apply deferred slash for BuyerWins (once per job)
        // Skip slash for default refunds (system failure, not seller fault)
        if (d.ruling == Ruling.BuyerWins && !_isDefaultRefund[disputeId]) {
            _applyStakeSlash(d);
        }

        _releaseEscrow(disputeId);

        emit RulingFinalized(disputeId, d.ruling);
    }

    /// @notice Appeal a resolved dispute within the appeal window.
    function appealRuling(uint256 disputeId) external nonReentrant whenNotPaused returns (uint256 appealDisputeId) {
        Dispute storage d = _disputes[disputeId];
        if (d.id == 0) revert NotFound();
        if (d.status != DisputeStatus.Resolved) revert WrongStatus();
        if (d.appealed) revert Appealed();
        if (_isAppealDispute[disputeId]) revert CannotAppealAppeal();
        if (msg.sender != d.buyer && msg.sender != d.seller) revert NotParty();
        if (block.timestamp > d.appealDeadline) revert AppealWindowClosed();

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
        if (d.id == 0) revert NotFound();
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
        if (!info.active) revert NotActive();
        if (_arbitratorPaused[msg.sender]) revert AlreadyPaused();
        _arbitratorPaused[msg.sender] = true;
        _removeActiveArbitrator(msg.sender);
        emit ArbitratorPaused(msg.sender);
    }

    function unpauseAsArbitrator() external {
        if (!_arbitratorPaused[msg.sender]) revert NotPaused();
        ArbitratorInfo storage info = _arbitrators[msg.sender];
        if (!info.active) revert RemovedWhilePaused();
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

    /// @notice Whether a dispute was resolved via default refund (system failure).
    function isDefaultRefund(uint256 disputeId) external view returns (bool) {
        return _isDefaultRefund[disputeId];
    }

    function certifyArbitrator(address arb) external onlyRole(CERTIFIER_ROLE) {
        if (!_arbitrators[arb].active) revert NotActive();
        _arbitratorCertified[arb] = true;
        emit ArbitratorCertified(arb);
    }

    function revokeCertification(address arb) external onlyRole(CERTIFIER_ROLE) {
        _arbitratorCertified[arb] = false;
        emit CertificationRevoked(arb);
    }

    function isCertified(address arb) external view returns (bool) {
        return _arbitratorCertified[arb];
    }

    /// @notice Emergency resolution for disputes stuck in PanelPending when
    ///         the arbitrator pool is objectively insufficient. Resolves as Draw (50/50 split).
    ///         All active arbitrators are slashed for failing to maintain adequate participation.
    ///         Permissionless — anyone can call after timeout expires.
    function emergencyResolveStuckDispute(uint256 disputeId) external nonReentrant {
        Dispute storage d = _disputes[disputeId];
        if (d.id == 0) revert NotFound();
        if (d.status != DisputeStatus.PanelPending) revert WrongStatus();
        if (block.timestamp <= d.createdAt + PANEL_SEAL_TIMEOUT) revert DeadlineNotPassed();
        // Only allow emergency draw when the pool cannot form a panel.
        // Count *eligible* (certified + not banned) arbitrators, not just active stakers.
        // Uncertified stakers inflate _activeArbitrators but can't serve on panels.
        uint256 eligible = 0;
        for (uint256 i = 0; i < _activeArbitrators.length; i++) {
            address arb = _activeArbitrators[i];
            if (_arbitratorCertified[arb] && !sybilGuard.checkBanned(arb) && !_arbitratorPaused[arb]) {
                eligible++;
            }
        }
        if (eligible >= 3) revert PoolSufficient();

        // Slash all active arbitrators for failing to maintain adequate participation
        // This creates economic incentive for arbitrators to stay active and form panels
        for (uint256 i = 0; i < _activeArbitrators.length; i++) {
            _slashNoShow(_activeArbitrators[i]);
        }

        d.status = DisputeStatus.Resolved;
        // FIX: Set ruling to Draw (neutral) instead of BuyerWins.
        // Documentation claims 50/50 split but implementation was biased toward buyer.
        d.ruling = Ruling.Draw;
        _isDefaultRefund[disputeId] = true;
        d.appealDeadline = 0;

        _releaseEscrow(disputeId);

        emit EmergencyResolution(disputeId);
    }

    /// @notice Repanel a dispute that reached the voting deadline with zero votes.
    ///         Slashes no-shows from the old panel, resets to PanelPending for a new panel.
    ///         Permissionless — anyone can call. Limited to MAX_REPANELS per dispute.
    function repanelDispute(uint256 disputeId) external nonReentrant whenNotPaused {
        Dispute storage d = _disputes[disputeId];
        if (d.id == 0) revert NotFound();
        if (d.status != DisputeStatus.Voting) revert WrongStatus();
        if (block.timestamp <= d.votingDeadline) revert VotingOpen();
        if (d.totalVotes != 0) revert VotesCast();
        if (_repanelCount[disputeId] >= MAX_REPANELS) revert MaxRepanels();

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
        if (address(escrowEngine) != address(0)) revert EscrowAlreadySet();
        if (_escrowEngine == address(0)) revert ZeroAddress();
        escrowEngine = IEscrowEngine(_escrowEngine);
        // Grant ESCROW_ROLE to EscrowEngine so it can submit disputes
        _grantRole(ESCROW_ROLE, _escrowEngine);
    }

    function setRolePayroll(address _rolePayroll) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_rolePayroll == address(0)) revert ZeroAddress();
        rolePayroll = IRolePayroll(_rolePayroll);
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
            lobToken.forceApprove(address(rewardDistributor), 0);
            lobToken.forceApprove(address(rewardDistributor), APPEAL_BOND);
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
        d.status = DisputeStatus.PanelPending; // two-phase for appeals too
        d.ruling = Ruling.Pending;
        d.createdAt = block.timestamp;
        d.panelSealBlock = block.number + PANEL_SEAL_DELAY;

        // Copy normalized amount from original
        _normalizedAmounts[appealDisputeId] = _normalizedAmounts[originalId];

        // Store exclusion list and commit seed for two-phase seal
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

        // Always recompute rank after slash for accurate reporting
        // Protected arbitrators (Solomon, Titus, Daniel) stay active regardless of rank
        ArbitratorRank newRank = _rankFromStake(info.stake);
        info.rank = newRank;
        if (!protectedArbiters[arb]) {
            if (newRank == ArbitratorRank.None) {
                info.active = false;
                _removeActiveArbitrator(arb);
            }
        } else {
            // Protected arbitrators stay active even if slashed below threshold
            info.active = true;
        }

        // Transfer slashed LOB into RewardDistributor reward pool
        lobToken.forceApprove(address(rewardDistributor), 0);
        lobToken.forceApprove(address(rewardDistributor), slashAmount);
        rewardDistributor.deposit(address(lobToken), slashAmount);
    }

    /// @dev Normalize token amount to 18 decimals for cross-token comparison.
    /// @notice V-004: Bounded decimals to prevent overflow for tokens with large decimals
    function _normalizeAmount(uint256 amount, address token) internal view returns (uint256) {
        if (token == address(lobToken)) return amount; // LOB is 18 decimals
        try IERC20Metadata(token).decimals() returns (uint8 dec) {
            // Bound decimals to safe range to prevent overflow in exponentiation
            if (dec > 77) {
                // If decimals > 77, cap to 77 (10**(77-18) = 10**59 fits in uint256)
                dec = 77;
            }
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

    /// @dev Apply stake slash for BuyerWins, guarded by per-job flag.
    function _applyStakeSlash(Dispute storage d) internal {
        if (_jobStakeSlashed[d.jobId]) return;
        _jobStakeSlashed[d.jobId] = true;

        // Get the real payer from EscrowEngine (fall back to job buyer if not set)
        address slashBeneficiary = escrowEngine.jobPayer(d.jobId);
        if (slashBeneficiary == address(0)) {
            slashBeneficiary = d.buyer;
        }

        // Use normalized amount (18 decimals) for slashing cap to avoid unit mismatch
        // Previously used d.amount which is in settlement token units (e.g., 6 decimals for USDC)
        uint256 normalizedAmount = _normalizedAmounts[d.id];
        // Fallback to raw amount if normalized amount not set (backward compatibility)
        if (normalizedAmount == 0) {
            normalizedAmount = _normalizeAmount(d.amount, d.token);
        }

        uint256 stakeSlash = (stakingManager.getStake(d.seller) * SLASH_MIN_BPS) / 10000;
        uint256 slashAmount = stakeSlash < normalizedAmount ? stakeSlash : normalizedAmount;
        if (slashAmount > 0) {
            stakingManager.slash(d.seller, slashAmount, slashBeneficiary);
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
        if (count < 3) revert NotEnoughArbitrators();

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

            // Exclude dispute participants from arbitrator panel
            if (candidate == _buyer || candidate == _seller) continue;
            if (sybilGuard.checkBanned(candidate)) continue;
            if (_arbitratorPaused[candidate]) continue;
            if (!_arbitratorCertified[candidate]) continue;
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

        if (found != 3) revert PanelSelectionFailed();
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

    // ─── Protected Arbitrators ───────────────────────────────────────────

    /// @notice Set protected arbitrators that can never lose arbitrator status
    /// @dev Protected arbitrators (e.g., Solomon, Titus, Daniel) will still be slashed
    ///      for non-participation but will remain active regardless of stake level
    ///      Only callable by DEFAULT_ADMIN_ROLE
    /// @param arbitrators List of addresses to protect
    function setProtectedArbitrators(address[] calldata arbitrators) external onlyRole(DEFAULT_ADMIN_ROLE) {
        // Clear existing
        for (uint256 i = 0; i < _protectedArbList.length; i++) {
            protectedArbiters[_protectedArbList[i]] = false;
        }
        delete _protectedArbList;

        // Set new protected arbitrators
        for (uint256 i = 0; i < arbitrators.length; i++) {
            if (arbitrators[i] == address(0)) revert ZeroArbitrator();
            protectedArbiters[arbitrators[i]] = true;
            _protectedArbList.push(arbitrators[i]);
        }
    }

    /// @notice Get list of protected arbitrators
    function getProtectedArbitrators() external view returns (address[] memory) {
        return _protectedArbList;
    }
}
