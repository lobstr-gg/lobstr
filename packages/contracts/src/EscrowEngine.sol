// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IEscrowEngine.sol";
import "./interfaces/IServiceRegistry.sol";
import "./interfaces/IStakingManager.sol";
import "./interfaces/IDisputeArbitration.sol";
import "./interfaces/IReputationSystem.sol";

contract EscrowEngine is IEscrowEngine, AccessControl, ReentrancyGuard {
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
        address _treasury
    ) {
        require(_lobToken != address(0), "EscrowEngine: zero lobToken");
        require(_serviceRegistry != address(0), "EscrowEngine: zero registry");
        require(_stakingManager != address(0), "EscrowEngine: zero staking");
        require(_disputeArbitration != address(0), "EscrowEngine: zero dispute");
        require(_reputationSystem != address(0), "EscrowEngine: zero reputation");
        require(_treasury != address(0), "EscrowEngine: zero treasury");

        lobToken = IERC20(_lobToken);
        serviceRegistry = IServiceRegistry(_serviceRegistry);
        stakingManager = IStakingManager(_stakingManager);
        disputeArbitration = IDisputeArbitration(_disputeArbitration);
        reputationSystem = IReputationSystem(_reputationSystem);
        treasury = _treasury;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function createJob(
        uint256 listingId,
        address seller,
        uint256 amount,
        address token
    ) external nonReentrant returns (uint256 jobId) {
        require(seller != address(0), "EscrowEngine: zero seller");
        require(seller != msg.sender, "EscrowEngine: self-hire");
        require(amount > 0, "EscrowEngine: zero amount");

        // Verify listing exists and is active
        IServiceRegistry.Listing memory listing = serviceRegistry.getListing(listingId);
        require(listing.active, "EscrowEngine: listing inactive");
        require(listing.provider == seller, "EscrowEngine: seller mismatch");

        // Calculate fee: 0% for LOB, 1.5% for anything else
        uint256 fee = 0;
        if (token != address(lobToken)) {
            fee = (amount * USDC_FEE_BPS) / 10000;
        }

        jobId = _nextJobId++;

        _jobs[jobId] = Job({
            id: jobId,
            listingId: listingId,
            buyer: msg.sender,
            seller: seller,
            amount: amount,
            token: token,
            fee: fee,
            status: JobStatus.Active,
            createdAt: block.timestamp,
            disputeWindowEnd: 0, // Set when delivery is submitted
            deliveryMetadataURI: ""
        });

        // Lock funds from buyer
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        emit JobCreated(jobId, listingId, msg.sender, seller, amount, token, fee);
    }

    function submitDelivery(uint256 jobId, string calldata metadataURI) external nonReentrant {
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

    function confirmDelivery(uint256 jobId) external nonReentrant {
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

    function initiateDispute(uint256 jobId, string calldata evidenceURI) external nonReentrant {
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

    function autoRelease(uint256 jobId) external nonReentrant {
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
            // Return funds to buyer
            IERC20(job.token).safeTransfer(job.buyer, job.amount);
        } else {
            // Release to seller
            _releaseFunds(job);
        }

        emit FundsReleased(jobId, buyerWins ? job.buyer : job.seller, job.amount);
    }

    function getJob(uint256 jobId) external view returns (Job memory) {
        require(_jobs[jobId].id != 0, "EscrowEngine: job not found");
        return _jobs[jobId];
    }

    function getJobDisputeId(uint256 jobId) external view returns (uint256) {
        return _jobDisputeIds[jobId];
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
