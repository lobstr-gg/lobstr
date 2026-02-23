// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IEscrowEngine.sol";
import "./interfaces/IServiceRegistry.sol";
import "./interfaces/IStakingManager.sol";
import "./interfaces/IDisputeArbitration.sol";
import "./interfaces/IReputationSystem.sol";
import "./interfaces/ISybilGuard.sol";

contract EscrowEngine is IEscrowEngine, AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    bytes32 public constant SKILL_REGISTRY_ROLE = keccak256("SKILL_REGISTRY_ROLE");

    uint256 public constant USDC_FEE_BPS = 150; // 1.5%
    uint256 public constant LOW_VALUE_DISPUTE_WINDOW = 1 hours;
    uint256 public constant HIGH_VALUE_DISPUTE_WINDOW = 24 hours;
    uint256 public constant HIGH_VALUE_THRESHOLD = 500 ether; // 500 LOB equivalent
    uint256 public constant SKILL_ESCROW_DISPUTE_WINDOW = 72 hours;
    uint256 public constant MIN_ESCROW_AMOUNT = 10 ether; // 10 LOB minimum
    uint256 public constant MIN_REPUTATION_VALUE = 50 ether; // 50 LOB minimum for reputation recording
    uint256 public constant AUTO_RELEASE_GRACE = 15 minutes;

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

    // V-002: Token allowlist — only approved tokens can be used in escrows.
    // Prevents worthless tokens from inflating arbitrator rewards.
    mapping(address => bool) private _allowedTokens;

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

        // LOB is always allowlisted
        _allowedTokens[_lobToken] = true;
    }

    // ═══════════════════════════════════════════════════════════════
    //  TOKEN ALLOWLIST (V-002)
    // ═══════════════════════════════════════════════════════════════

    function allowlistToken(address token) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(token != address(0), "EscrowEngine: zero token");
        _allowedTokens[token] = true;
        emit TokenAllowlisted(token);
    }

    function removeToken(address token) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(token != address(lobToken), "EscrowEngine: cannot remove LOB");
        _allowedTokens[token] = false;
        emit TokenRemoved(token);
    }

    function isTokenAllowed(address token) external view returns (bool) {
        return _allowedTokens[token];
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
        require(amount >= MIN_ESCROW_AMOUNT, "EscrowEngine: below minimum");

        // H-4: Ban checks for both parties
        require(!sybilGuard.checkBanned(msg.sender), "EscrowEngine: buyer banned");
        require(!sybilGuard.checkBanned(seller), "EscrowEngine: seller banned");

        // Verify listing exists and is active
        IServiceRegistry.Listing memory listing = serviceRegistry.getListing(listingId);
        require(listing.active, "EscrowEngine: listing inactive");
        require(listing.provider == seller, "EscrowEngine: seller mismatch");

        // C-2: Validate token matches listing's settlement token
        require(token == listing.settlementToken, "EscrowEngine: token mismatch");

        // V-002: Only allowlisted tokens can be used in escrows
        require(_allowedTokens[token], "EscrowEngine: token not allowed");

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
            deliveryMetadataURI: "",
            escrowType: EscrowType.SERVICE_JOB,
            skillId: 0
        });

        emit JobCreated(jobId, listingId, msg.sender, seller, received, token, fee);
    }

    function createSkillEscrow(
        uint256 skillId,
        address buyer,
        address seller,
        uint256 amount,
        address token
    ) external onlyRole(SKILL_REGISTRY_ROLE) nonReentrant whenNotPaused returns (uint256 jobId) {
        require(buyer != address(0), "EscrowEngine: zero buyer");
        require(seller != address(0), "EscrowEngine: zero seller");
        require(buyer != seller, "EscrowEngine: self-purchase");
        require(amount > 0, "EscrowEngine: zero amount");
        require(amount >= MIN_ESCROW_AMOUNT, "EscrowEngine: below minimum");

        // Ban checks
        require(!sybilGuard.checkBanned(buyer), "EscrowEngine: buyer banned");
        require(!sybilGuard.checkBanned(seller), "EscrowEngine: seller banned");

        // V-002: Only allowlisted tokens
        require(_allowedTokens[token], "EscrowEngine: token not allowed");

        // Calculate fee: 0% for LOB, 1.5% for anything else
        uint256 fee = 0;
        if (token != address(lobToken)) {
            fee = (amount * USDC_FEE_BPS) / 10000;
        }

        // Fee-on-transfer safe: measure actual received
        uint256 balanceBefore = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(buyer, address(this), amount);
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
            listingId: 0, // No service listing for skill escrows
            buyer: buyer,
            seller: seller,
            amount: received,
            token: token,
            fee: fee,
            status: JobStatus.Delivered, // Skip delivery step
            createdAt: block.timestamp,
            disputeWindowEnd: block.timestamp + SKILL_ESCROW_DISPUTE_WINDOW,
            deliveryMetadataURI: "",
            escrowType: EscrowType.SKILL_PURCHASE,
            skillId: skillId
        });

        emit SkillEscrowCreated(jobId, skillId, buyer, seller, received);
    }

    function submitDelivery(uint256 jobId, string calldata metadataURI) external nonReentrant whenNotPaused {
        Job storage job = _jobs[jobId];
        require(job.id != 0, "EscrowEngine: job not found");
        require(job.escrowType == EscrowType.SERVICE_JOB, "EscrowEngine: not service job");
        require(msg.sender == job.seller, "EscrowEngine: not seller");
        require(job.status == JobStatus.Active, "EscrowEngine: wrong status");

        job.status = JobStatus.Delivered;
        job.deliveryMetadataURI = metadataURI;

        // Start dispute window — normalize to 18 decimals for cross-token comparison
        uint256 normalizedAmount = job.amount;
        try IERC20Metadata(job.token).decimals() returns (uint8 dec) {
            if (dec < 18) {
                normalizedAmount = job.amount * (10 ** (18 - dec));
            }
        } catch {
            // If decimals() reverts, assume 18 (LOB default)
        }
        uint256 disputeWindow = normalizedAmount >= HIGH_VALUE_THRESHOLD
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

        // Record completion for reputation only if value meets threshold
        if (_normalizeJobAmount(job) >= MIN_REPUTATION_VALUE) {
            reputationSystem.recordCompletion(job.seller, job.buyer);
        }

        emit DeliveryConfirmed(jobId, msg.sender);
    }

    function initiateDispute(uint256 jobId, string calldata evidenceURI) external nonReentrant whenNotPaused {
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
            evidenceURI
        );

        _jobDisputeIds[jobId] = disputeId;

        emit DisputeInitiated(jobId, disputeId, evidenceURI);
    }

    function autoRelease(uint256 jobId) external nonReentrant whenNotPaused {
        Job storage job = _jobs[jobId];
        require(job.id != 0, "EscrowEngine: job not found");
        require(job.status == JobStatus.Delivered, "EscrowEngine: wrong status");
        require(block.timestamp > job.disputeWindowEnd, "EscrowEngine: window not expired");

        // Non-seller callers must wait an additional grace period
        if (msg.sender != job.seller) {
            require(
                block.timestamp > job.disputeWindowEnd + AUTO_RELEASE_GRACE,
                "EscrowEngine: grace period active"
            );
        }

        job.status = JobStatus.Released;

        _releaseFunds(job);

        // Record completion for reputation only if value meets threshold
        if (_normalizeJobAmount(job) >= MIN_REPUTATION_VALUE) {
            reputationSystem.recordCompletion(job.seller, job.buyer);
        }

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

    function resolveDisputeDraw(uint256 jobId) external nonReentrant {
        require(msg.sender == address(disputeArbitration), "EscrowEngine: not arbitration");

        Job storage job = _jobs[jobId];
        require(job.id != 0, "EscrowEngine: job not found");
        require(job.status == JobStatus.Disputed, "EscrowEngine: wrong status");

        job.status = JobStatus.Resolved;

        // Split 50/50 between buyer and seller, fees deducted from each half
        uint256 half = job.amount / 2;
        uint256 remainder = job.amount - half; // handles odd amounts
        uint256 halfFee = job.fee / 2;
        uint256 remainderFee = job.fee - halfFee;

        uint256 buyerPayout = half - halfFee;
        uint256 sellerPayout = remainder - remainderFee;

        if (halfFee + remainderFee > 0) {
            IERC20(job.token).safeTransfer(treasury, halfFee + remainderFee);
        }

        IERC20(job.token).safeTransfer(job.buyer, buyerPayout);
        IERC20(job.token).safeTransfer(job.seller, sellerPayout);

        emit FundsReleased(jobId, job.buyer, buyerPayout);
        emit FundsReleased(jobId, job.seller, sellerPayout);
    }

    function getJob(uint256 jobId) external view returns (Job memory) {
        Job memory job = _jobs[jobId];
        require(job.id != 0, "EscrowEngine: job not found");
        return job;
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

    /// @dev Normalize job amount to 18 decimals for cross-token comparison.
    function _normalizeJobAmount(Job storage job) internal view returns (uint256) {
        uint256 normalized = job.amount;
        if (job.token != address(lobToken)) {
            try IERC20Metadata(job.token).decimals() returns (uint8 dec) {
                if (dec < 18) {
                    normalized = job.amount * (10 ** (18 - dec));
                } else if (dec > 18) {
                    normalized = job.amount / (10 ** (dec - 18));
                }
            } catch {
                // If decimals() reverts, assume 18
            }
        }
        return normalized;
    }

    function _releaseFunds(Job storage job) internal {
        uint256 sellerPayout = job.amount - job.fee;

        if (job.fee > 0) {
            IERC20(job.token).safeTransfer(treasury, job.fee);
        }

        IERC20(job.token).safeTransfer(job.seller, sellerPayout);

        emit FundsReleased(job.id, job.seller, sellerPayout);
    }
}
