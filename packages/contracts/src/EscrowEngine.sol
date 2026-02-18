// SPDX-License-Identifier: MIT
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
        reputationSystem.recordCompletion(job.seller, job.buyer);

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

        job.status = JobStatus.Released;

        _releaseFunds(job);

        // Record completion for reputation
        reputationSystem.recordCompletion(job.seller, job.buyer);

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

    function _releaseFunds(Job storage job) internal {
        uint256 sellerPayout = job.amount - job.fee;

        if (job.fee > 0) {
            IERC20(job.token).safeTransfer(treasury, job.fee);
        }

        IERC20(job.token).safeTransfer(job.seller, sellerPayout);

        emit FundsReleased(job.id, job.seller, sellerPayout);
    }
}
