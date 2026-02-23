// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IAffiliateManager {
    struct ReferralInfo {
        address referrer;
        uint256 registeredAt;
    }

    struct ReferrerStats {
        uint256 totalReferred;
        uint256 totalRewardsCredited;
        uint256 totalRewardsClaimed;
        uint256 pendingRewards;
    }

    event ReferralRegistered(address indexed referrer, address indexed referred, uint256 timestamp);
    event ReferralRewardCredited(address indexed referrer, address indexed token, uint256 amount);
    event RewardsClaimed(address indexed referrer, address indexed token, uint256 amount);

    function registerReferral(address referred) external;
    function creditReferralReward(address referrer, address token, uint256 amount) external;
    function claimRewards(address token) external;
    function getReferralInfo(address referred) external view returns (ReferralInfo memory);
    function getReferrerStats(address referrer) external view returns (ReferrerStats memory);
    function claimableBalance(address referrer, address token) external view returns (uint256);
}
