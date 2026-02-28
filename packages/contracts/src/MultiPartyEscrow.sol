// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IMultiPartyEscrow} from "./interfaces/IMultiPartyEscrow.sol";
import {IEscrowEngine} from "./interfaces/IEscrowEngine.sol";
import {IDisputeArbitration} from "./interfaces/IDisputeArbitration.sol";
import {ISybilGuard} from "./interfaces/ISybilGuard.sol";

contract MultiPartyEscrow is IMultiPartyEscrow, Initializable, UUPSUpgradeable, OwnableUpgradeable, AccessControlUpgradeable, ReentrancyGuardUpgradeable, PausableUpgradeable {
    using SafeERC20 for IERC20;

    uint256 public constant MAX_SELLERS = 10;

    IEscrowEngine public ESCROW_ENGINE;
    IDisputeArbitration public DISPUTE_ARBITRATION;
    IERC20 public LOB_TOKEN;
    ISybilGuard public SYBIL_GUARD;

    uint256 private _nextGroupId = 1;

    mapping(uint256 => JobGroup) private _groups;
    mapping(uint256 => uint256[]) private _groupJobIds;
    mapping(uint256 => uint256) private _jobToGroup;
    mapping(uint256 => bool) private _refundClaimed;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _escrowEngine, address _disputeArbitration, address _lobToken, address _sybilGuard) public virtual initializer {
        require(_escrowEngine != address(0), "MultiPartyEscrow: zero escrowEngine");
        require(_disputeArbitration != address(0), "MultiPartyEscrow: zero disputeArbitration");
        require(_lobToken != address(0), "MultiPartyEscrow: zero lobToken");
        require(_sybilGuard != address(0), "MultiPartyEscrow: zero sybilGuard");

        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();
        __AccessControl_init();
        __ReentrancyGuard_init();
        __Pausable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

        _nextGroupId = 1;

        ESCROW_ENGINE = IEscrowEngine(_escrowEngine);
        DISPUTE_ARBITRATION = IDisputeArbitration(_disputeArbitration);
        LOB_TOKEN = IERC20(_lobToken);
        SYBIL_GUARD = ISybilGuard(_sybilGuard);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    function createMultiJob(
        address[] calldata sellers,
        uint256[] calldata shares,
        uint256[] calldata listingIds,
        address token,
        uint256 totalAmount,
        uint256 deliveryDeadline,
        string calldata metadataURI
    ) external nonReentrant whenNotPaused returns (uint256 groupId) {
        _validateArrays(sellers, shares, listingIds, totalAmount);
        require(!SYBIL_GUARD.checkBanned(msg.sender), "MultiPartyEscrow: buyer banned");

        IERC20(token).safeTransferFrom(msg.sender, address(this), totalAmount);

        groupId = _nextGroupId++;

        IERC20(token).forceApprove(address(ESCROW_ENGINE), totalAmount);
        uint256[] memory jobIds = _createJobs(groupId, msg.sender, sellers, shares, listingIds, token, deliveryDeadline);

        _groups[groupId] = JobGroup({
            groupId: groupId,
            buyer: msg.sender,
            totalAmount: totalAmount,
            token: token,
            jobCount: sellers.length,
            metadataURI: metadataURI,
            createdAt: block.timestamp
        });

        emit MultiJobCreated(groupId, msg.sender, jobIds, sellers, shares, token, totalAmount);
    }

    function _validateArrays(
        address[] calldata sellers,
        uint256[] calldata shares,
        uint256[] calldata listingIds,
        uint256 totalAmount
    ) internal pure {
        require(sellers.length == shares.length, "MultiPartyEscrow: array length mismatch");
        require(sellers.length == listingIds.length, "MultiPartyEscrow: listing array mismatch");
        require(sellers.length >= 2, "MultiPartyEscrow: min 2 sellers");
        require(sellers.length <= MAX_SELLERS, "MultiPartyEscrow: max sellers exceeded");

        uint256 sharesSum;
        for (uint256 i = 0; i < shares.length; i++) {
            sharesSum += shares[i];
        }
        require(sharesSum == totalAmount, "MultiPartyEscrow: shares sum mismatch");
    }

    function _createJobs(
        uint256 groupId,
        address buyer,
        address[] calldata sellers,
        uint256[] calldata shares,
        uint256[] calldata listingIds,
        address token,
        uint256 deliveryDeadline
    ) internal returns (uint256[] memory jobIds) {
        jobIds = new uint256[](sellers.length);
        for (uint256 i = 0; i < sellers.length; i++) {
            uint256 jobId = ESCROW_ENGINE.createJob(listingIds[i], sellers[i], shares[i], token, deliveryDeadline);
            // Set the real payer so slashed stake goes to the real buyer
            ESCROW_ENGINE.setJobPayer(jobId, buyer);
            jobIds[i] = jobId;
            _groupJobIds[groupId].push(jobId);
            _jobToGroup[jobId] = groupId;
        }
    }

    /// @notice Proxy: confirm delivery on behalf of the real buyer
    function confirmDelivery(uint256 jobId) external nonReentrant whenNotPaused {
        uint256 groupId = _jobToGroup[jobId];
        require(groupId != 0, "MultiPartyEscrow: job not in group");
        require(_groups[groupId].buyer == msg.sender, "MultiPartyEscrow: not buyer");
        ESCROW_ENGINE.confirmDelivery(jobId);
    }

    /// @notice Proxy: initiate dispute on behalf of the real buyer
    function initiateDispute(uint256 jobId, string calldata evidenceURI) external nonReentrant whenNotPaused {
        uint256 groupId = _jobToGroup[jobId];
        require(groupId != 0, "MultiPartyEscrow: job not in group");
        require(_groups[groupId].buyer == msg.sender, "MultiPartyEscrow: not buyer");
        ESCROW_ENGINE.initiateDispute(jobId, evidenceURI);
    }

    /// @notice Proxy: cancel job on behalf of the real buyer after delivery timeout
    function cancelJob(uint256 jobId) external nonReentrant whenNotPaused {
        uint256 groupId = _jobToGroup[jobId];
        require(groupId != 0, "MultiPartyEscrow: job not in group");
        require(_groups[groupId].buyer == msg.sender, "MultiPartyEscrow: not buyer");

        // Cache token before cancel (token field survives cancelJob)
        IEscrowEngine.Job memory job = ESCROW_ENGINE.getJob(jobId);
        address token = job.token;

        uint256 refundAmount = ESCROW_ENGINE.cancelJob(jobId);

        // Forward cancellation refund to the real buyer
        if (refundAmount > 0) {
            IERC20(token).safeTransfer(msg.sender, refundAmount);
        }
    }

    /// @notice Claim escrow refund for a resolved dispute (BuyerWins or Draw)
    function claimRefund(uint256 jobId) external nonReentrant whenNotPaused {
        uint256 groupId = _jobToGroup[jobId];
        require(groupId != 0, "MultiPartyEscrow: job not in group");
        require(_groups[groupId].buyer == msg.sender, "MultiPartyEscrow: not buyer");
        require(!_refundClaimed[jobId], "MultiPartyEscrow: already claimed");

        IEscrowEngine.Job memory job = ESCROW_ENGINE.getJob(jobId);
        require(job.status == IEscrowEngine.JobStatus.Resolved, "MultiPartyEscrow: not resolved");

        uint256 disputeId = ESCROW_ENGINE.getJobDisputeId(jobId);
        IDisputeArbitration.Dispute memory dispute = DISPUTE_ARBITRATION.getDispute(disputeId);

        uint256 refundAmount;
        if (dispute.ruling == IDisputeArbitration.Ruling.BuyerWins) {
            refundAmount = job.amount;
        } else if (dispute.ruling == IDisputeArbitration.Ruling.Draw) {
            uint256 half = job.amount / 2;
            uint256 halfFee = job.fee / 2;
            refundAmount = half - halfFee;
        } else {
            revert("MultiPartyEscrow: no buyer refund");
        }

        _refundClaimed[jobId] = true;
        IERC20(job.token).safeTransfer(msg.sender, refundAmount);

        emit RefundClaimed(jobId, groupId, msg.sender, refundAmount);
    }

    function getGroup(uint256 groupId) external view returns (JobGroup memory) {
        require(_groups[groupId].groupId != 0, "MultiPartyEscrow: group not found");
        return _groups[groupId];
    }

    function getGroupStatus(uint256 groupId) external view returns (GroupStatus) {
        require(_groups[groupId].groupId != 0, "MultiPartyEscrow: group not found");

        uint256[] memory jobIds = _groupJobIds[groupId];
        bool allConfirmed = true;
        bool anyDisputed = false;

        for (uint256 i = 0; i < jobIds.length; i++) {
            IEscrowEngine.Job memory job = ESCROW_ENGINE.getJob(jobIds[i]);
            if (job.status == IEscrowEngine.JobStatus.Disputed) {
                anyDisputed = true;
            }
            if (
                job.status != IEscrowEngine.JobStatus.Confirmed &&
                job.status != IEscrowEngine.JobStatus.Released &&
                job.status != IEscrowEngine.JobStatus.Resolved
            ) {
                allConfirmed = false;
            }
        }

        if (anyDisputed) return GroupStatus.PartialDispute;
        if (allConfirmed) return GroupStatus.AllConfirmed;
        return GroupStatus.Active;
    }

    function getGroupJobIds(uint256 groupId) external view returns (uint256[] memory) {
        require(_groups[groupId].groupId != 0, "MultiPartyEscrow: group not found");
        return _groupJobIds[groupId];
    }

    function getJobGroup(uint256 jobId) external view returns (uint256) {
        return _jobToGroup[jobId];
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
