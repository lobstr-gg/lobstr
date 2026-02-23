// SPDX-License-Identifier: MIT
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

    // Pool state
    uint256 public totalPoolDeposits;
    uint256 public totalPremiumsCollected;
    uint256 public totalClaimsPaid;

    // Synthetix-style premium distribution
    uint256 public rewardPerTokenStored;
    uint256 private _totalStaked;

    // Track reward liabilities to prevent stakers from draining claim funds
    uint256 private _totalRewardsAccrued;
    uint256 private _totalRewardsClaimed;

    // Track escrow refund obligations so fileClaim cannot consume other buyers' refunds
    uint256 private _totalRefundLiabilities;
    mapping(uint256 => uint256) private _jobRefundAmount;
    mapping(uint256 => bool) private _jobSettled;

    // Pessimistic reserve: total escrowed principal that may return as refunds.
    // Decremented when a job reaches terminal state (settled via _settleJob).
    uint256 private _totalInFlightPrincipal;

    mapping(address => PoolStaker) private _stakers;

    // Insurance job tracking
    mapping(uint256 => bool) private _insuredJobs;
    mapping(uint256 => bool) private _claimPaid;
    mapping(uint256 => bool) private _refundClaimed;
    mapping(uint256 => uint256) private _jobPremiums;
    mapping(uint256 => address) private _jobBuyer;

    constructor(
        address _lobToken,
        address _escrowEngine,
        address _disputeArbitration,
        address _reputationSystem,
        address _stakingManager,
        address _sybilGuard,
        address _serviceRegistry,
        address _treasury
    ) {
        require(_lobToken != address(0), "InsurancePool: zero lobToken");
        require(_escrowEngine != address(0), "InsurancePool: zero escrowEngine");
        require(_disputeArbitration != address(0), "InsurancePool: zero disputeArbitration");
        require(_reputationSystem != address(0), "InsurancePool: zero reputationSystem");
        require(_stakingManager != address(0), "InsurancePool: zero stakingManager");
        require(_sybilGuard != address(0), "InsurancePool: zero sybilGuard");
        require(_serviceRegistry != address(0), "InsurancePool: zero serviceRegistry");
        require(_treasury != address(0), "InsurancePool: zero treasury");

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
        require(amount > 0, "InsurancePool: zero amount");
        require(_stakers[msg.sender].deposited >= amount, "InsurancePool: insufficient deposit");

        _updatePoolReward(msg.sender);

        _stakers[msg.sender].deposited -= amount;
        _totalStaked -= amount;

        // Solvency guard: pool balance after withdrawal must cover hard liabilities
        uint256 postBalance = LOB_TOKEN.balanceOf(address(this)) - amount;
        uint256 liabilities = (_totalRewardsAccrued - _totalRewardsClaimed)
            + _totalRefundLiabilities
            + _totalInFlightPrincipal;
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

    function createInsuredJob(
        uint256 listingId,
        address seller,
        uint256 amount,
        address token
    ) external nonReentrant whenNotPaused returns (uint256 jobId) {
        require(!SYBIL_GUARD.checkBanned(msg.sender), "InsurancePool: buyer banned");
        require(token == address(LOB_TOKEN), "InsurancePool: only LOB supported");

        uint256 premium = (amount * premiumRateBps) / 10000;
        uint256 totalCost = amount + premium;

        LOB_TOKEN.safeTransferFrom(msg.sender, address(this), totalCost);

        _distributePremium(premium);
        totalPremiumsCollected += premium;

        LOB_TOKEN.safeApprove(address(ESCROW_ENGINE), amount);
        jobId = ESCROW_ENGINE.createJob(listingId, seller, amount, token);

        _insuredJobs[jobId] = true;
        _jobPremiums[jobId] = premium;
        _jobBuyer[jobId] = msg.sender;
        _totalInFlightPrincipal += amount;

        emit InsuredJobCreated(jobId, msg.sender, premium);
        emit PremiumCollected(jobId, msg.sender, premium);
    }

    /// @notice Claim the exact escrow refund (buyer's own principal) — no coverage caps.
    ///         Handles BuyerWins (full refund) and Draw (buyer-side payout).
    function claimRefund(uint256 jobId) external nonReentrant whenNotPaused {
        require(_insuredJobs[jobId], "InsurancePool: not insured");
        require(_jobBuyer[jobId] == msg.sender, "InsurancePool: not original buyer");
        require(!_refundClaimed[jobId], "InsurancePool: refund already claimed");

        // Settle the job: release in-flight reserve, track actual refund liability
        _settleJob(jobId);

        uint256 refundAmount = _jobRefundAmount[jobId];
        require(refundAmount > 0, "InsurancePool: no buyer refund");

        _refundClaimed[jobId] = true;
        _totalRefundLiabilities -= refundAmount;

        LOB_TOKEN.safeTransfer(msg.sender, refundAmount);

        emit RefundClaimed(jobId, msg.sender, refundAmount);
    }

    /// @notice Claim supplemental insurance payout from the pool (covers net loss only).
    ///         Insurance pays max(0, job.amount - escrowRefund), subject to coverage caps.
    ///         BuyerWins: net loss = 0 (escrow already refunds full amount).
    ///         Draw: net loss = gap between job amount and partial refund.
    ///         SellerWins: net loss = full job amount (no escrow refund).
    function fileClaim(uint256 jobId) external nonReentrant whenNotPaused {
        require(_insuredJobs[jobId], "InsurancePool: not insured");
        require(_jobBuyer[jobId] == msg.sender, "InsurancePool: not original buyer");
        require(!_claimPaid[jobId], "InsurancePool: already claimed");

        IEscrowEngine.Job memory job = ESCROW_ENGINE.getJob(jobId);
        require(job.status == IEscrowEngine.JobStatus.Resolved, "InsurancePool: not resolved");

        // Settle the job: release in-flight reserve, track actual refund liability
        _settleJob(jobId);

        // Insurance covers net loss = job.amount - escrowRefund
        uint256 escrowRefund = _jobRefundAmount[jobId];
        uint256 netLoss = job.amount > escrowRefund ? job.amount - escrowRefund : 0;
        require(netLoss > 0, "InsurancePool: no net loss");

        // Apply coverage cap
        uint256 cap = getCoverageCap(msg.sender);
        uint256 claimAmount = netLoss;
        if (claimAmount > cap) claimAmount = cap;

        // Pool available = balance - rewardLiabilities - refundLiabilities - inFlightPrincipal
        uint256 balance = LOB_TOKEN.balanceOf(address(this));
        uint256 reserved = (_totalRewardsAccrued - _totalRewardsClaimed) + _totalRefundLiabilities + _totalInFlightPrincipal;
        uint256 poolAvailable = balance > reserved ? balance - reserved : 0;
        if (claimAmount > poolAvailable) claimAmount = poolAvailable;

        require(claimAmount > 0, "InsurancePool: no coverage available");

        _claimPaid[jobId] = true;
        totalClaimsPaid += claimAmount;

        LOB_TOKEN.safeTransfer(msg.sender, claimAmount);

        emit ClaimPaid(jobId, msg.sender, claimAmount);
    }

    // ═══════════════════════════════════════════════════════════════
    //  PROXY BUYER ACTIONS
    //  InsurancePool is the on-chain buyer in EscrowEngine. These
    //  functions let the original buyer confirm delivery or dispute
    //  through the pool.
    // ═══════════════════════════════════════════════════════════════

    function confirmInsuredDelivery(uint256 jobId) external nonReentrant whenNotPaused {
        require(_insuredJobs[jobId], "InsurancePool: not insured");
        require(_jobBuyer[jobId] == msg.sender, "InsurancePool: not original buyer");

        ESCROW_ENGINE.confirmDelivery(jobId);
        _settleJob(jobId);
    }

    function initiateInsuredDispute(uint256 jobId, string calldata evidenceURI) external nonReentrant whenNotPaused {
        require(_insuredJobs[jobId], "InsurancePool: not insured");
        require(_jobBuyer[jobId] == msg.sender, "InsurancePool: not original buyer");

        ESCROW_ENGINE.initiateDispute(jobId, evidenceURI);
    }

    /// @notice Permissionless: settle a terminal job's accounting, releasing in-flight reserves.
    ///         Anyone can call this to free up pool capital once a job is confirmed/resolved.
    function bookJob(uint256 jobId) external {
        require(_insuredJobs[jobId], "InsurancePool: not insured");
        _settleJob(jobId);
    }

    // ═══════════════════════════════════════════════════════════════
    //  ADMIN (GOVERNOR)
    // ═══════════════════════════════════════════════════════════════

    function updatePremiumRate(uint256 newBps) external onlyRole(GOVERNOR_ROLE) {
        require(newBps <= 1000, "InsurancePool: rate too high"); // max 10%
        premiumRateBps = newBps;
        emit PremiumRateUpdated(newBps);
    }

    function updateCoverageCaps(
        uint256 bronze,
        uint256 silver,
        uint256 gold,
        uint256 platinum
    ) external onlyRole(GOVERNOR_ROLE) {
        coverageCapBronze = bronze;
        coverageCapSilver = silver;
        coverageCapGold = gold;
        coverageCapPlatinum = platinum;
        emit CoverageCapUpdated(bronze, silver, gold, platinum);
    }

    // ═══════════════════════════════════════════════════════════════
    //  VIEWS
    // ═══════════════════════════════════════════════════════════════

    function getPoolStats() external view returns (
        uint256 totalDeposits,
        uint256 totalPremiums,
        uint256 totalClaims,
        uint256 available
    ) {
        uint256 balance = LOB_TOKEN.balanceOf(address(this));
        uint256 reserved = (_totalRewardsAccrued - _totalRewardsClaimed) + _totalRefundLiabilities + _totalInFlightPrincipal;
        uint256 avail = balance > reserved ? balance - reserved : 0;
        return (totalPoolDeposits, totalPremiumsCollected, totalClaimsPaid, avail);
    }

    function getStakerInfo(address staker) external view returns (PoolStaker memory) {
        PoolStaker memory info = _stakers[staker];
        if (_totalStaked > 0 && info.deposited > 0) {
            uint256 pending = (info.deposited * (rewardPerTokenStored - info.rewardPerTokenPaid)) / 1e18;
            info.pendingRewards += pending;
        }
        return info;
    }

    function getCoverageCap(address buyer) public view returns (uint256) {
        (, IReputationSystem.ReputationTier tier) = REPUTATION_SYSTEM.getScore(buyer);
        if (tier == IReputationSystem.ReputationTier.Platinum) return coverageCapPlatinum;
        if (tier == IReputationSystem.ReputationTier.Gold) return coverageCapGold;
        if (tier == IReputationSystem.ReputationTier.Silver) return coverageCapSilver;
        return coverageCapBronze;
    }

    function isInsuredJob(uint256 jobId) external view returns (bool) {
        return _insuredJobs[jobId];
    }

    function poolEarned(address staker) external view returns (uint256) {
        PoolStaker memory info = _stakers[staker];
        if (_totalStaked == 0 || info.deposited == 0) return info.pendingRewards;
        uint256 pending = (info.deposited * (rewardPerTokenStored - info.rewardPerTokenPaid)) / 1e18;
        return info.pendingRewards + pending;
    }

    // ═══════════════════════════════════════════════════════════════
    //  INTERNAL
    // ═══════════════════════════════════════════════════════════════

    /// @dev Settle a terminal job: release in-flight reserve and book actual refund liability.
    ///      Handles Resolved (with refund computation), Confirmed, and Completed states.
    function _settleJob(uint256 jobId) internal {
        if (_jobSettled[jobId]) return;

        IEscrowEngine.Job memory job = ESCROW_ENGINE.getJob(jobId);
        bool terminal = (
            job.status == IEscrowEngine.JobStatus.Resolved ||
            job.status == IEscrowEngine.JobStatus.Confirmed ||
            job.status == IEscrowEngine.JobStatus.Released
        );
        if (!terminal) return;

        _jobSettled[jobId] = true;
        _totalInFlightPrincipal -= job.amount;

        // Only Resolved jobs may owe refunds
        if (job.status == IEscrowEngine.JobStatus.Resolved) {
            uint256 disputeId = ESCROW_ENGINE.getJobDisputeId(jobId);
            IDisputeArbitration.Dispute memory dispute = DISPUTE_ARBITRATION.getDispute(disputeId);

            uint256 refundAmount;
            if (dispute.ruling == IDisputeArbitration.Ruling.BuyerWins) {
                refundAmount = job.amount;
            } else if (dispute.ruling == IDisputeArbitration.Ruling.Draw) {
                uint256 half = job.amount / 2;
                uint256 halfFee = job.fee / 2;
                refundAmount = half - halfFee;
            }
            // SellerWins: refundAmount = 0 (no escrow refund to buyer)

            _jobRefundAmount[jobId] = refundAmount;
            if (refundAmount > 0) {
                _totalRefundLiabilities += refundAmount;
            }
        }
        // Confirmed/Released: no refund, principal just released from in-flight
    }

    function _distributePremium(uint256 premium) internal {
        if (_totalStaked == 0) {
            LOB_TOKEN.safeTransfer(TREASURY, premium);
            return;
        }
        rewardPerTokenStored += (premium * 1e18) / _totalStaked;
        _totalRewardsAccrued += premium;
    }

    function _updatePoolReward(address account) internal {
        if (account != address(0) && _stakers[account].deposited > 0) {
            uint256 pending = (_stakers[account].deposited * (rewardPerTokenStored - _stakers[account].rewardPerTokenPaid)) / 1e18;
            _stakers[account].pendingRewards += pending;
        }
        if (account != address(0)) {
            _stakers[account].rewardPerTokenPaid = rewardPerTokenStored;
        }
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
}
