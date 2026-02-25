// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IStakingManager.sol";
import "./interfaces/IDisputeArbitration.sol";
import "./interfaces/IRewardDistributor.sol";

/**
 * @title SybilGuard
 * @notice Anti-sybil detection with auto-ban, staked fund seizure, and
 *         reward distribution for watchers and judges.
 *
 *         Seized funds split:
 *           - 10% → watcher (reporter)
 *           - 5%  → judges (split among confirming judges)
 *           - 85% → treasury
 *
 *         Anti-gaming:
 *           - Watcher bond (500 LOB per report, returned on confirm, slashed on reject)
 *           - Report cooldown (4 hours between reports)
 *           - Self-report prevention
 *           - Anti-collusion pair tracking (watcher-judge pairs per 30-day epoch)
 *           - Watcher quality scoring (confirmed/submitted ratio)
 */
contract SybilGuard is Initializable, UUPSUpgradeable, OwnableUpgradeable, AccessControlUpgradeable, ReentrancyGuardUpgradeable {
    using SafeERC20 for IERC20;

    /* ═══════════════════════════════════════════════════════════════
       ROLES
       ═══════════════════════════════════════════════════════════════ */

    bytes32 public constant WATCHER_ROLE = keccak256("WATCHER_ROLE");
    bytes32 public constant JUDGE_ROLE = keccak256("JUDGE_ROLE");
    bytes32 public constant APPEALS_ROLE = keccak256("APPEALS_ROLE");

    /* ═══════════════════════════════════════════════════════════════
       CONSTANTS
       ═══════════════════════════════════════════════════════════════ */

    uint256 public constant REPORT_EXPIRY = 3 days;
    uint256 public constant MIN_JUDGES_FOR_BAN = 2;
    uint256 public constant MIN_JUDGES_FOR_REJECT = 2;
    uint256 public constant COOLDOWN_AFTER_UNBAN = 30 days;

    // Reward distribution BPS
    uint256 public constant WATCHER_REWARD_BPS = 1000;   // 10% of seized funds to reporter
    uint256 public constant JUDGE_REWARD_BPS = 500;      // 5% of seized funds split among judges
    uint256 public constant TREASURY_RETAIN_BPS = 8500;  // 85% stays in treasury

    // Watcher bond and rate limiting
    uint256 public constant MIN_WATCHER_BOND = 500 ether;  // Minimum 500 LOB bond per report
    uint256 public constant WATCHER_BOND_BPS = 500;        // 5% of target's max stake
    uint256 public constant WATCHER_REPORT_COOLDOWN = 4 hours;

    // Judge requirements for high-stake targets
    uint256 public constant HIGH_STAKE_THRESHOLD = 10_000 ether;
    uint256 public constant HIGH_STAKE_MIN_JUDGES = 3;

    // Judge rewards
    uint256 public constant JUDGE_FLAT_REWARD = 100 ether; // 100 LOB per adjudication

    // Anti-collusion
    uint256 public constant MAX_PAIR_COUNT_PER_EPOCH = 3;
    uint256 public constant EPOCH_DURATION = 30 days;

    // Delayed ban + seizure escrow
    uint256 public constant BAN_DELAY = 48 hours;
    uint256 public constant SEIZURE_ESCROW_PERIOD = 30 days;

    /* ═══════════════════════════════════════════════════════════════
       TYPES
       ═══════════════════════════════════════════════════════════════ */

    enum ViolationType {
        SybilCluster,
        SelfDealing,
        CoordinatedVoting,
        ReputationFarming,
        MultisigAbuse,
        StakeManipulation,
        EvidenceFraud,
        IdentityFraud
    }

    enum ReportStatus { Pending, Confirmed, Rejected, Expired }

    struct SybilReport {
        uint256 id;
        address reporter;
        address[] subjects;
        ViolationType violation;
        string evidenceURI;
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

    IERC20 public lobToken;
    IStakingManager public stakingManager;
    address public treasuryGovernor;
    IRewardDistributor public rewardDistributor;
    address public disputeArbitration;

    uint256 private _nextReportId = 1;
    mapping(uint256 => SybilReport) public reports;
    mapping(uint256 => mapping(address => bool)) public reportConfirmations;
    mapping(uint256 => mapping(address => bool)) public reportRejections;
    mapping(uint256 => uint256) public reportRejectionCount;

    mapping(address => BanRecord) public banRecords;
    mapping(address => bool) public isBanned;
    address[] public bannedAddresses;
    mapping(address => uint256) private _bannedAddressIndex;
    mapping(address => address[]) public linkedAccounts;

    // Stats
    uint256 public totalBans;
    uint256 public totalSeized;
    uint256 public totalReports;

    // Watcher quality tracking
    mapping(address => uint256) public watcherReportsSubmitted;
    mapping(address => uint256) public watcherReportsConfirmed;
    mapping(address => uint256) public watcherReportsRejected;
    mapping(address => uint256) public watcherLastReportTimestamp;

    // Bond tracking
    mapping(uint256 => uint256) public reportBondAmount;
    mapping(uint256 => bool) public reportBondReturned;

    // Anti-collusion: (watcher, judge) pair tracking per epoch
    mapping(bytes32 => uint256) public pairCountInEpoch;
    mapping(bytes32 => uint256) public pairEpochStart;

    // Track which judges confirmed each report (for reward distribution)
    mapping(uint256 => address[]) private _confirmingJudges;

    // Delayed ban tracking
    mapping(uint256 => uint256) public reportBanScheduledAt;
    mapping(uint256 => bool) public reportBanExecuted;

    // Seizure escrow
    mapping(address => uint256) public seizedInEscrow;
    mapping(address => uint256) public seizureEscrowExpiry;
    mapping(address => uint256) public escrowReportId;

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
    event ReportExpired(uint256 indexed reportId);

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
    event WatcherBondCollected(uint256 indexed reportId, address indexed watcher, uint256 amount);
    event WatcherBondReturned(uint256 indexed reportId, address indexed watcher, uint256 amount);
    event WatcherBondSlashed(uint256 indexed reportId, address indexed watcher, uint256 amount);
    event CollusionWarning(uint256 indexed reportId, address indexed watcher, address indexed judge);

    event BanScheduled(uint256 indexed reportId, uint256 executeAfter);
    event BanCancelled(uint256 indexed reportId);
    event EscrowReleased(address indexed account, uint256 amount);
    event EscrowRefunded(address indexed account, uint256 amount);

    /* ═══════════════════════════════════════════════════════════════
       CONSTRUCTOR
       ═══════════════════════════════════════════════════════════════ */

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        // Initializers disabled by atomic proxy deployment + multisig ownership transfer
    }

    function initialize(
        address _lobToken,
        address _stakingManager,
        address _treasuryGovernor,
        address _rewardDistributor
    ) public virtual initializer {
        require(_lobToken != address(0), "SybilGuard: zero lobToken");
        require(_stakingManager != address(0), "SybilGuard: zero staking");
        require(_treasuryGovernor != address(0), "SybilGuard: zero treasury");
        require(_rewardDistributor != address(0), "SybilGuard: zero rewardDistributor");

        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();
        __AccessControl_init();
        __ReentrancyGuard_init();

        // OZ 5.x: grant DEFAULT_ADMIN_ROLE to owner
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

        _nextReportId = 1;

        lobToken = IERC20(_lobToken);
        stakingManager = IStakingManager(_stakingManager);
        treasuryGovernor = _treasuryGovernor;
        rewardDistributor = IRewardDistributor(_rewardDistributor);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    function setDisputeArbitration(address _disputeArbitration) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(disputeArbitration == address(0), "SybilGuard: disputeArbitration already set");
        require(_disputeArbitration != address(0), "SybilGuard: zero disputeArbitration");
        disputeArbitration = _disputeArbitration;
    }

    /* ═══════════════════════════════════════════════════════════════
       REPORTING
       ═══════════════════════════════════════════════════════════════ */

    function submitReport(
        address[] calldata subjects,
        ViolationType violation,
        string calldata evidenceURI,
        string calldata notes
    ) external onlyRole(WATCHER_ROLE) returns (uint256) {
        require(subjects.length > 0, "SybilGuard: no subjects");
        require(subjects.length <= 20, "SybilGuard: too many subjects");
        require(bytes(evidenceURI).length > 0, "SybilGuard: no evidence");

        // Self-report prevention
        for (uint256 i = 0; i < subjects.length; i++) {
            require(subjects[i] != address(0), "SybilGuard: zero address subject");
            require(subjects[i] != msg.sender, "SybilGuard: cannot self-report");
        }

        // Report cooldown (skip for first-time reporters)
        require(
            watcherLastReportTimestamp[msg.sender] == 0 ||
            block.timestamp >= watcherLastReportTimestamp[msg.sender] + WATCHER_REPORT_COOLDOWN,
            "SybilGuard: report cooldown"
        );
        watcherLastReportTimestamp[msg.sender] = block.timestamp;

        // Calculate scaled watcher bond: max(MIN_WATCHER_BOND, 5% of target's max stake)
        uint256 maxStake = 0;
        for (uint256 i = 0; i < subjects.length; i++) {
            uint256 subjectStake = stakingManager.getStake(subjects[i]);
            if (subjectStake > maxStake) maxStake = subjectStake;
        }
        uint256 bondRequired = maxStake * WATCHER_BOND_BPS / 10000;
        if (bondRequired < MIN_WATCHER_BOND) bondRequired = MIN_WATCHER_BOND;

        // Collect watcher bond
        lobToken.safeTransferFrom(msg.sender, address(this), bondRequired);

        uint256 reportId = _nextReportId++;
        totalReports++;
        watcherReportsSubmitted[msg.sender]++;

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

        reportBondAmount[reportId] = bondRequired;

        emit ReportCreated(reportId, msg.sender, violation, subjects, evidenceURI);
        emit WatcherBondCollected(reportId, msg.sender, bondRequired);

        return reportId;
    }

    function confirmReport(uint256 reportId) external onlyRole(JUDGE_ROLE) nonReentrant {
        SybilReport storage r = reports[reportId];
        require(r.id != 0, "SybilGuard: report not found");
        require(r.status == ReportStatus.Pending, "SybilGuard: not pending");
        require(
            block.timestamp <= r.createdAt + REPORT_EXPIRY,
            "SybilGuard: report expired"
        );
        require(!reportConfirmations[reportId][msg.sender], "SybilGuard: already confirmed");

        // Anti-collusion: check (watcher, judge) pair frequency
        bytes32 pairKey = keccak256(abi.encodePacked(r.reporter, msg.sender));
        _checkAndUpdatePairCount(reportId, pairKey, r.reporter, msg.sender);

        reportConfirmations[reportId][msg.sender] = true;
        r.confirmations++;
        _confirmingJudges[reportId].push(msg.sender);

        emit ReportConfirmed(reportId, msg.sender);

        // Schedule ban when judge threshold met (dynamic based on target stake)
        uint256 requiredJudges = _requiredJudgesForReport(reportId);
        if (r.confirmations >= requiredJudges) {
            r.status = ReportStatus.Confirmed;
            reportBanScheduledAt[reportId] = block.timestamp;

            // Update watcher quality
            watcherReportsConfirmed[r.reporter]++;

            emit BanScheduled(reportId, block.timestamp + BAN_DELAY);
        }
    }

    function rejectReport(uint256 reportId) external onlyRole(JUDGE_ROLE) {
        SybilReport storage r = reports[reportId];
        require(r.id != 0, "SybilGuard: report not found");
        require(r.status == ReportStatus.Pending, "SybilGuard: not pending");
        require(block.timestamp <= r.createdAt + REPORT_EXPIRY, "SybilGuard: report expired");
        require(!reportRejections[reportId][msg.sender], "SybilGuard: already rejected");

        reportRejections[reportId][msg.sender] = true;
        reportRejectionCount[reportId]++;

        if (reportRejectionCount[reportId] >= MIN_JUDGES_FOR_REJECT) {
            r.status = ReportStatus.Rejected;

            // Slash watcher's bond for false report
            _slashWatcherBond(reportId);

            // Update watcher quality stats
            watcherReportsRejected[r.reporter]++;
        }

        emit ReportRejected(reportId, msg.sender);
    }

    /// @notice Expire a report that judges never resolved. Returns watcher bond.
    function expireReport(uint256 reportId) external nonReentrant {
        SybilReport storage r = reports[reportId];
        require(r.id != 0, "SybilGuard: report not found");
        require(r.status == ReportStatus.Pending, "SybilGuard: not pending");
        require(block.timestamp > r.createdAt + REPORT_EXPIRY, "SybilGuard: not expired");

        r.status = ReportStatus.Expired;

        // Return watcher bond — they shouldn't be punished for judge inaction
        _returnWatcherBond(reportId);

        emit ReportExpired(reportId);
    }

    /* ═══════════════════════════════════════════════════════════════
       DELAYED BAN EXECUTION
       ═══════════════════════════════════════════════════════════════ */

    /// @notice Execute a scheduled ban after the 48hr delay period.
    function executeBan(uint256 reportId) external nonReentrant {
        require(reportBanScheduledAt[reportId] > 0, "SybilGuard: ban not scheduled");
        require(!reportBanExecuted[reportId], "SybilGuard: ban already executed");
        require(
            block.timestamp >= reportBanScheduledAt[reportId] + BAN_DELAY,
            "SybilGuard: ban delay not elapsed"
        );

        reportBanExecuted[reportId] = true;

        uint256 totalSeizedAmount = _executeBan(reportId);

        // Return watcher's bond (report was valid)
        _returnWatcherBond(reportId);

        // Distribute rewards from seized funds (funded via approve+deposit to RewardDistributor)
        uint256 totalRewardsDistributed = 0;
        SybilReport storage r = reports[reportId];
        if (totalSeizedAmount > 0) {
            totalRewardsDistributed += _distributeSeizureRewards(reportId, r.reporter, totalSeizedAmount);
            totalRewardsDistributed += _creditJudgeRewards(reportId, totalSeizedAmount, totalRewardsDistributed);

            // Deduct distributed rewards from subjects' escrow balances proportionally
            _deductRewardsFromEscrow(reportId, totalRewardsDistributed, totalSeizedAmount);
        }
    }

    /// @notice Cancel a scheduled ban during the delay window. APPEALS_ROLE only.
    function cancelBan(uint256 reportId) external onlyRole(APPEALS_ROLE) {
        require(reportBanScheduledAt[reportId] > 0, "SybilGuard: ban not scheduled");
        require(!reportBanExecuted[reportId], "SybilGuard: ban already executed");

        reportBanExecuted[reportId] = true;

        // Slash watcher bond (false positive)
        _slashWatcherBond(reportId);

        // Increment watcher rejected count
        SybilReport storage r = reports[reportId];
        watcherReportsRejected[r.reporter]++;

        emit BanCancelled(reportId);
    }

    /// @notice Returns the number of judges required to confirm a report.
    function _requiredJudgesForReport(uint256 reportId) internal view returns (uint256) {
        SybilReport storage r = reports[reportId];
        for (uint256 i = 0; i < r.subjects.length; i++) {
            uint256 subjectStake = stakingManager.getStake(r.subjects[i]);
            if (subjectStake >= HIGH_STAKE_THRESHOLD) {
                return HIGH_STAKE_MIN_JUDGES;
            }
        }
        return MIN_JUDGES_FOR_BAN;
    }

    /* ═══════════════════════════════════════════════════════════════
       BAN EXECUTION (internal)
       ═══════════════════════════════════════════════════════════════ */

    function _executeBan(uint256 reportId) private returns (uint256 totalSeizedAmount) {
        SybilReport storage r = reports[reportId];

        for (uint256 i = 0; i < r.subjects.length; i++) {
            address subject = r.subjects[i];
            if (isBanned[subject]) continue;

            uint256 seized = _seizeStake(subject, reportId);
            totalSeizedAmount += seized;

            if (disputeArbitration != address(0)) {
                try IDisputeArbitration(disputeArbitration).removeArbitrator(subject) {} catch {}
            }

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

            if (r.subjects.length > 1) {
                linkedAccounts[subject] = r.subjects;
            }

            emit AddressBanned(subject, r.violation, reportId, seized);
        }

        if (r.subjects.length > 1) {
            emit LinkedAccountsRegistered(r.subjects[0], r.subjects);
        }
    }

    function _seizeStake(address account, uint256 reportId) private returns (uint256) {
        IStakingManager.StakeInfo memory info = stakingManager.getStakeInfo(account);
        uint256 stakeAmount = info.amount;

        if (stakeAmount == 0) return 0;

        // Slash the entire stake to SybilGuard (held in escrow)
        stakingManager.slash(account, stakeAmount, address(this));
        totalSeized += stakeAmount;

        // Store in seizure escrow
        seizedInEscrow[account] = stakeAmount;
        seizureEscrowExpiry[account] = block.timestamp + SEIZURE_ESCROW_PERIOD;
        escrowReportId[account] = reportId;

        emit FundsSeized(account, address(lobToken), stakeAmount, reportId);

        return stakeAmount;
    }

    /* ═══════════════════════════════════════════════════════════════
       REWARD DISTRIBUTION
       ═══════════════════════════════════════════════════════════════ */

    function _distributeSeizureRewards(
        uint256 reportId,
        address watcher,
        uint256 totalSeizedAmount
    ) internal returns (uint256 watcherReward) {
        // Watcher reward: 10% of seized
        watcherReward = (totalSeizedAmount * WATCHER_REWARD_BPS) / 10000;

        // Apply watcher quality multiplier
        watcherReward = _applyWatcherQuality(watcher, watcherReward);

        if (watcherReward > 0) {
            // Actually transfer tokens to RewardDistributor to back the credit
            lobToken.forceApprove(address(rewardDistributor), 0);
            lobToken.forceApprove(address(rewardDistributor), watcherReward);
            rewardDistributor.deposit(address(lobToken), watcherReward);
            rewardDistributor.creditWatcherReward(watcher, address(lobToken), watcherReward);
        }
    }

    function _creditJudgeRewards(
        uint256 reportId,
        uint256 totalSeizedAmount,
        uint256 alreadyDistributed
    ) internal returns (uint256 totalJudgeReward) {
        address[] storage judges = _confirmingJudges[reportId];
        uint256 judgeCount = judges.length;
        if (judgeCount == 0) return 0;

        // Cap judge rewards to remaining seized funds
        uint256 remaining = totalSeizedAmount - alreadyDistributed;
        uint256 budgetForJudges = JUDGE_FLAT_REWARD;
        if (budgetForJudges > remaining) budgetForJudges = remaining;

        uint256 perJudge = budgetForJudges / judgeCount;
        if (perJudge == 0) return 0;

        // Count eligible judges first (skip collusion-flagged)
        uint256 eligibleCount = 0;
        for (uint256 i = 0; i < judgeCount; i++) {
            bytes32 pairKey = keccak256(abi.encodePacked(reports[reportId].reporter, judges[i]));
            if (pairCountInEpoch[pairKey] <= MAX_PAIR_COUNT_PER_EPOCH) {
                eligibleCount++;
            }
        }
        if (eligibleCount == 0) return 0;

        perJudge = budgetForJudges / eligibleCount;
        totalJudgeReward = perJudge * eligibleCount;

        // Transfer total judge reward to RewardDistributor to back the credits
        lobToken.forceApprove(address(rewardDistributor), 0);
        lobToken.forceApprove(address(rewardDistributor), totalJudgeReward);
        rewardDistributor.deposit(address(lobToken), totalJudgeReward);

        for (uint256 i = 0; i < judgeCount; i++) {
            bytes32 pairKey = keccak256(abi.encodePacked(reports[reportId].reporter, judges[i]));
            if (pairCountInEpoch[pairKey] > MAX_PAIR_COUNT_PER_EPOCH) {
                continue;
            }
            rewardDistributor.creditJudgeReward(judges[i], address(lobToken), perJudge);
        }
    }

    function _applyWatcherQuality(address watcher, uint256 reward) internal view returns (uint256) {
        uint256 submitted = watcherReportsSubmitted[watcher];
        if (submitted < 10) return reward; // Grace period

        uint256 confirmed = watcherReportsConfirmed[watcher];
        uint256 confirmRate = (confirmed * 10000) / submitted;

        if (confirmRate < 2500) return 0;          // Below 25% = no reward
        if (confirmRate < 5000) return reward / 2; // Below 50% = halved

        return reward;
    }

    /* ═══════════════════════════════════════════════════════════════
       BOND MANAGEMENT
       ═══════════════════════════════════════════════════════════════ */

    function _returnWatcherBond(uint256 reportId) internal {
        if (reportBondReturned[reportId]) return;

        uint256 bondAmount = reportBondAmount[reportId];
        if (bondAmount == 0) return;

        reportBondReturned[reportId] = true;
        address watcher = reports[reportId].reporter;

        lobToken.safeTransfer(watcher, bondAmount);

        emit WatcherBondReturned(reportId, watcher, bondAmount);
    }

    function _slashWatcherBond(uint256 reportId) internal {
        if (reportBondReturned[reportId]) return;

        uint256 bondAmount = reportBondAmount[reportId];
        if (bondAmount == 0) return;

        reportBondReturned[reportId] = true;
        address watcher = reports[reportId].reporter;

        // Send slashed bond to treasury
        lobToken.safeTransfer(treasuryGovernor, bondAmount);

        emit WatcherBondSlashed(reportId, watcher, bondAmount);
    }

    /* ═══════════════════════════════════════════════════════════════
       ANTI-COLLUSION
       ═══════════════════════════════════════════════════════════════ */

    function _checkAndUpdatePairCount(
        uint256 reportId,
        bytes32 pairKey,
        address watcher,
        address judge
    ) internal {
        uint256 epochStart = pairEpochStart[pairKey];

        // Reset epoch if expired
        if (block.timestamp >= epochStart + EPOCH_DURATION) {
            pairCountInEpoch[pairKey] = 0;
            pairEpochStart[pairKey] = block.timestamp;
        }

        pairCountInEpoch[pairKey]++;

        // Emit warning if threshold exceeded
        if (pairCountInEpoch[pairKey] > MAX_PAIR_COUNT_PER_EPOCH) {
            emit CollusionWarning(reportId, watcher, judge);
        }
    }

    /* ═══════════════════════════════════════════════════════════════
       SEIZURE ESCROW
       ═══════════════════════════════════════════════════════════════ */

    /// @dev Deduct distributed rewards from subjects' escrow balances proportionally.
    function _deductRewardsFromEscrow(
        uint256 reportId,
        uint256 totalRewards,
        uint256 totalSeizedAmount
    ) internal {
        SybilReport storage r = reports[reportId];
        uint256 deducted = 0;
        for (uint256 i = 0; i < r.subjects.length; i++) {
            address subject = r.subjects[i];
            uint256 subjectEscrow = seizedInEscrow[subject];
            if (subjectEscrow == 0) continue;

            uint256 share;
            if (i == r.subjects.length - 1) {
                // Last subject gets the remainder to avoid rounding dust
                share = totalRewards - deducted;
            } else {
                share = (totalRewards * subjectEscrow) / totalSeizedAmount;
            }
            if (share > subjectEscrow) share = subjectEscrow;
            seizedInEscrow[subject] -= share;
            deducted += share;
        }
    }

    /// @notice Release escrowed seized funds after the 30-day escrow period.
    ///         Sends remaining funds to treasury. Permissionless.
    function releaseEscrow(address account) external nonReentrant {
        uint256 escrowed = seizedInEscrow[account];
        require(escrowed > 0, "SybilGuard: no escrow");
        require(
            block.timestamp >= seizureEscrowExpiry[account],
            "SybilGuard: escrow period active"
        );

        seizedInEscrow[account] = 0;

        // Send remaining escrowed funds to treasury (rewards already deducted)
        if (escrowed > 0) {
            lobToken.safeTransfer(treasuryGovernor, escrowed);
        }

        emit EscrowReleased(account, escrowed);
    }

    /* ═══════════════════════════════════════════════════════════════
       UNBAN (APPEALS)
       ═══════════════════════════════════════════════════════════════ */

    function unban(address account) external onlyRole(APPEALS_ROLE) {
        require(isBanned[account], "SybilGuard: not banned");

        isBanned[account] = false;
        banRecords[account].banned = false;
        banRecords[account].unbannedAt = block.timestamp;

        uint256 idx = _bannedAddressIndex[account];
        uint256 lastIdx = bannedAddresses.length - 1;
        if (idx != lastIdx) {
            address lastAddr = bannedAddresses[lastIdx];
            bannedAddresses[idx] = lastAddr;
            _bannedAddressIndex[lastAddr] = idx;
        }
        bannedAddresses.pop();
        delete _bannedAddressIndex[account];

        // Return escrowed seized funds if within escrow period
        uint256 escrowed = seizedInEscrow[account];
        if (escrowed > 0 && block.timestamp < seizureEscrowExpiry[account]) {
            seizedInEscrow[account] = 0;
            lobToken.safeTransfer(account, escrowed);
            emit EscrowRefunded(account, escrowed);
        }

        emit AddressUnbanned(account, msg.sender);
    }

    /* ═══════════════════════════════════════════════════════════════
       BAN CHECK (Used by other contracts)
       ═══════════════════════════════════════════════════════════════ */

    function checkBanned(address account) external view returns (bool) {
        return isBanned[account];
    }

    function checkAnyBanned(address[] calldata accounts) external view returns (bool) {
        for (uint256 i = 0; i < accounts.length; i++) {
            if (isBanned[accounts[i]]) return true;
        }
        return false;
    }

    function getBanRecord(address account) external view returns (BanRecord memory) {
        return banRecords[account];
    }

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

    function getWatcherStats(address watcher) external view returns (
        uint256 submitted,
        uint256 confirmed,
        uint256 rejected
    ) {
        return (
            watcherReportsSubmitted[watcher],
            watcherReportsConfirmed[watcher],
            watcherReportsRejected[watcher]
        );
    }
}
