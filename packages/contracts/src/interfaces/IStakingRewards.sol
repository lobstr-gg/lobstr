// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IStakingRewards {
    event StakeSynced(address indexed user, uint256 effectiveBalance, uint256 stakingTier);
    event RewardNotified(address indexed token, uint256 amount, uint256 duration);
    event RewardsClaimed(address indexed user, address indexed token, uint256 amount);
    event RewardTokenAdded(address indexed token);

    function syncStake() external;
    function claimRewards(address token) external;
    function earned(address user, address token) external view returns (uint256);
    function getEffectiveBalance(address user) external view returns (uint256);
    function getRewardTokens() external view returns (address[] memory);

    function getLastSyncTimestamp(address user) external view returns (uint256);

    function notifyRewardAmount(address token, uint256 amount, uint256 duration) external;
    function addRewardToken(address token) external;
}
