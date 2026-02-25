// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IInsurancePool {
    struct PoolStaker {
        uint256 deposited;
        uint256 rewardPerTokenPaid;
        uint256 pendingRewards;
    }

    event PoolDeposited(address indexed staker, uint256 amount);
    event PoolWithdrawn(address indexed staker, uint256 amount);
    event PremiumCollected(uint256 indexed jobId, address indexed buyer, uint256 premiumAmount);
    event ClaimPaid(uint256 indexed jobId, address indexed buyer, uint256 claimAmount);
    event CoverageCapUpdated(uint256 bronze, uint256 silver, uint256 gold, uint256 platinum);
    event PremiumRateUpdated(uint256 newRateBps);
    event InsuredJobCreated(uint256 indexed jobId, address indexed buyer, uint256 premiumPaid);
    event RefundClaimed(uint256 indexed jobId, address indexed buyer, uint256 amount);

    function depositToPool(uint256 amount) external;
    function withdrawFromPool(uint256 amount) external;
    function claimPoolRewards() external;

    function createInsuredJob(uint256 listingId, address seller, uint256 amount, address token, uint256 deliveryDeadline) external returns (uint256 jobId);
    function claimRefund(uint256 jobId) external;
    function fileClaim(uint256 jobId) external;
    function confirmInsuredDelivery(uint256 jobId) external;
    function initiateInsuredDispute(uint256 jobId, string calldata evidenceURI) external;
    function cancelInsuredJob(uint256 jobId) external;
    function bookJob(uint256 jobId) external;

    function updatePremiumRate(uint256 newBps) external;
    function updateCoverageCaps(uint256 bronze, uint256 silver, uint256 gold, uint256 platinum) external;

    function getPoolStats() external view returns (uint256 totalDeposits, uint256 totalPremiums, uint256 totalClaims, uint256 available);
    function getStakerInfo(address staker) external view returns (PoolStaker memory);
    function getCoverageCap(address buyer) external view returns (uint256);
    function isInsuredJob(uint256 jobId) external view returns (bool);
    function poolEarned(address staker) external view returns (uint256);
}
