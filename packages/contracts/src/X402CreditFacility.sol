// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
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
contract X402CreditFacility is IX402CreditFacility, AccessControl, ReentrancyGuard, Pausable {
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

    // ── Immutables ──────────────────────────────────────────────────────
    IERC20 public immutable lobToken;
    IEscrowEngine public immutable escrowEngine;
    IDisputeArbitration public immutable disputeArbitration;
    IReputationSystem public immutable reputationSystem;
    IStakingManager public immutable stakingManager;
    ISybilGuard public immutable sybilGuard;
    address public immutable treasury;

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

    constructor(
        address _lobToken,
        address _escrowEngine,
        address _disputeArbitration,
        address _reputationSystem,
        address _stakingManager,
        address _sybilGuard,
        address _treasury
    ) {
        require(_lobToken != address(0), "CreditFacility: zero lobToken");
        require(_escrowEngine != address(0), "CreditFacility: zero escrowEngine");
        require(_disputeArbitration != address(0), "CreditFacility: zero disputeArbitration");
        require(_reputationSystem != address(0), "CreditFacility: zero reputationSystem");
        require(_stakingManager != address(0), "CreditFacility: zero stakingManager");
        require(_sybilGuard != address(0), "CreditFacility: zero sybilGuard");
        require(_treasury != address(0), "CreditFacility: zero treasury");

        lobToken = IERC20(_lobToken);
        escrowEngine = IEscrowEngine(_escrowEngine);
        disputeArbitration = IDisputeArbitration(_disputeArbitration);
        reputationSystem = IReputationSystem(_reputationSystem);
        stakingManager = IStakingManager(_stakingManager);
        sybilGuard = ISybilGuard(_sybilGuard);
        treasury = _treasury;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

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

        // V-002: Lock agent's stake to prevent unstake-before-liquidation evasion
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

        // V-002: Unlock agent's stake
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
        require(amount <= totalPoolBalance - totalOutstanding, "CreditFacility: insufficient pool liquidity");

        // Compute interest (simple, prorated over 30-day repayment deadline)
        uint256 interest = (amount * line.interestRateBps * REPAYMENT_DEADLINE) / (BPS_DENOMINATOR * DAYS_PER_YEAR * 1 days);
        uint256 fee = (amount * PROTOCOL_FEE_BPS) / BPS_DENOMINATOR;

        // Approve and create escrow job — facility becomes the buyer
        lobToken.safeApprove(address(escrowEngine), 0);
        lobToken.safeApprove(address(escrowEngine), amount);
        uint256 escrowJobId = escrowEngine.createJob(listingId, seller, amount, address(lobToken));

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

        // Slash reputation
        reputationSystem.recordDispute(draw.agent, false);

        // Best-effort stake slash
        uint256 stakeSlashed = 0;
        uint256 staked = stakingManager.getStake(draw.agent);
        if (staked > 0) {
            uint256 slashTarget = draw.amount;
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

        // Seize proportional collateral
        uint256 collateralSeized = 0;
        if (line.collateralDeposited > 0) {
            // Proportional: (drawAmount / creditLimit) * totalCollateral
            collateralSeized = (draw.amount * line.collateralDeposited) / line.creditLimit;
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
        if (totalRecovered < draw.amount) {
            uint256 unrecovered = draw.amount - totalRecovered;
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
}
