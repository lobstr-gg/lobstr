// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IMultiPartyEscrow {
    enum GroupStatus { Active, AllConfirmed, PartialDispute }

    struct JobGroup {
        uint256 groupId;
        address buyer;
        uint256 totalAmount;
        address token;
        uint256 jobCount;
        string metadataURI;
        uint256 createdAt;
    }

    event MultiJobCreated(
        uint256 indexed groupId,
        address indexed buyer,
        uint256[] jobIds,
        address[] sellers,
        uint256[] shares,
        address token,
        uint256 totalAmount
    );
    event GroupCompleted(uint256 indexed groupId);
    event RefundClaimed(uint256 indexed jobId, uint256 indexed groupId, address indexed buyer, uint256 amount);

    function createMultiJob(
        address[] calldata sellers,
        uint256[] calldata shares,
        uint256[] calldata listingIds,
        address token,
        uint256 totalAmount,
        uint256 deliveryDeadline,
        string calldata metadataURI
    ) external returns (uint256 groupId);

    function confirmDelivery(uint256 jobId) external;
    function initiateDispute(uint256 jobId, string calldata evidenceURI) external;
    function cancelJob(uint256 jobId) external;
    function claimRefund(uint256 jobId) external;

    function getGroup(uint256 groupId) external view returns (JobGroup memory);
    function getGroupStatus(uint256 groupId) external view returns (GroupStatus);
    function getGroupJobIds(uint256 groupId) external view returns (uint256[] memory);
}
