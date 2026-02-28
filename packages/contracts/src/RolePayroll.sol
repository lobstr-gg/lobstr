// SPDX-License-Identifier: MIT
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
}
