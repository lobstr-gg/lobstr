// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IEscrowEngine {
    enum JobStatus { Created, Active, Delivered, Confirmed, Disputed, Released, Resolved }

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
    }

    event JobCreated(uint256 indexed jobId, uint256 indexed listingId, address indexed buyer, address seller, uint256 amount, address token, uint256 fee);
    event DeliverySubmitted(uint256 indexed jobId, string metadataURI);
    event DeliveryConfirmed(uint256 indexed jobId, address indexed buyer);
    event DisputeInitiated(uint256 indexed jobId, uint256 indexed disputeId, string evidenceURI);
    event FundsReleased(uint256 indexed jobId, address indexed seller, uint256 amount);
    event AutoReleased(uint256 indexed jobId, address indexed caller);

    function createJob(uint256 listingId, address seller, uint256 amount, address token) external returns (uint256 jobId);
    function submitDelivery(uint256 jobId, string calldata metadataURI) external;
    function confirmDelivery(uint256 jobId) external;
    function initiateDispute(uint256 jobId, string calldata evidenceURI) external;
    function resolveDispute(uint256 jobId, bool buyerWins) external;
    function resolveDisputeDraw(uint256 jobId) external;
    function autoRelease(uint256 jobId) external;
    function getJob(uint256 jobId) external view returns (Job memory);
}
