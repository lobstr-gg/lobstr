// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ISubscriptionEngine {
    enum SubscriptionStatus { Active, Paused, Cancelled, Completed }

    struct Subscription {
        uint256 id;
        address buyer;
        address seller;
        address token;
        uint256 amount;
        uint256 interval;
        uint256 nextDue;
        uint256 maxCycles;
        uint256 cyclesCompleted;
        SubscriptionStatus status;
        uint256 listingId;
        string metadataURI;
        uint256 createdAt;
    }

    event SubscriptionCreated(
        uint256 indexed id,
        address indexed buyer,
        address indexed seller,
        address token,
        uint256 amount,
        uint256 interval,
        uint256 maxCycles
    );
    event PaymentProcessed(uint256 indexed id, uint256 cycleNumber, uint256 amount, uint256 fee);
    event SubscriptionCancelled(uint256 indexed id, address cancelledBy);
    event SubscriptionPaused(uint256 indexed id);
    event SubscriptionResumed(uint256 indexed id, uint256 newNextDue);
    event SubscriptionCompleted(uint256 indexed id);

    function createSubscription(
        address seller,
        address token,
        uint256 amount,
        uint256 interval,
        uint256 maxCycles,
        uint256 listingId,
        string calldata metadataURI
    ) external returns (uint256 id);

    function processPayment(uint256 subscriptionId) external;
    function cancelSubscription(uint256 subscriptionId) external;
    function pauseSubscription(uint256 subscriptionId) external;
    function resumeSubscription(uint256 subscriptionId) external;

    function getSubscription(uint256 id) external view returns (Subscription memory);
    function getSubscriptionsByBuyer(address buyer) external view returns (uint256[] memory);
    function getSubscriptionsBySeller(address seller) external view returns (uint256[] memory);
}
