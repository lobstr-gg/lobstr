// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IEscrowEngine {
    enum JobStatus { Created, Active, Delivered, Confirmed, Disputed, Released, Resolved }
    enum EscrowType { SERVICE_JOB, SKILL_PURCHASE }

    struct Job {
        uint256 id;
        uint256 listingId;
        address buyer;
        address seller;
        uint256 amount;
        address token;
        uint256 fee;
        JobStatus status;
        uint256 createdAt;
        uint256 disputeWindowEnd;
        string deliveryMetadataURI;
        EscrowType escrowType;
        uint256 skillId;
        uint256 deliveryDeadline;
    }

    event JobCreated(uint256 indexed jobId, uint256 indexed listingId, address indexed buyer, address seller, uint256 amount, address token, uint256 fee);
    event JobCancelled(uint256 indexed jobId, address indexed buyer, uint256 refundAmount);
    event DeliverySubmitted(uint256 indexed jobId, string metadataURI);
    event DeliveryConfirmed(uint256 indexed jobId, address indexed buyer);
    event DisputeInitiated(uint256 indexed jobId, uint256 indexed disputeId, string evidenceURI);
    event FundsReleased(uint256 indexed jobId, address indexed seller, uint256 amount);
    event AutoReleased(uint256 indexed jobId, address indexed caller);
    event SkillEscrowCreated(uint256 indexed jobId, uint256 indexed skillId, address indexed buyer, address seller, uint256 amount);
    event TokenAllowlisted(address indexed token);
    event TokenRemoved(address indexed token);

    function allowlistToken(address token) external;
    function removeToken(address token) external;
    function isTokenAllowed(address token) external view returns (bool);
    function createJob(uint256 listingId, address seller, uint256 amount, address token, uint256 deliveryDeadline) external returns (uint256 jobId);
    function cancelJob(uint256 jobId) external returns (uint256 refundAmount);
    function createSkillEscrow(uint256 skillId, address buyer, address seller, uint256 amount, address token) external returns (uint256 jobId);
    function submitDelivery(uint256 jobId, string calldata metadataURI) external;
    function confirmDelivery(uint256 jobId) external;
    function initiateDispute(uint256 jobId, string calldata evidenceURI) external;
    function resolveDispute(uint256 jobId, bool buyerWins) external;
    function resolveDisputeDraw(uint256 jobId) external;
    function autoRelease(uint256 jobId) external;
    function getJob(uint256 jobId) external view returns (Job memory);
    function getJobDisputeId(uint256 jobId) external view returns (uint256);
    function jobPayer(uint256 jobId) external view returns (address);
    function setJobPayer(uint256 jobId, address payer) external;
}
