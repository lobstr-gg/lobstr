// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ILiquidityMining {
    event Staked(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event RewardPaid(address indexed user, uint256 amount);
    event RewardNotified(uint256 amount, uint256 duration);
    event EmergencyWithdrawn(address indexed user, uint256 amount);

    function stake(uint256 amount) external;
    function withdraw(uint256 amount) external;
    function getReward() external;
    function exit() external;
    function emergencyWithdraw() external;

    function notifyRewardAmount(uint256 amount, uint256 duration) external;

    function earned(address user) external view returns (uint256);
    function balanceOf(address user) external view returns (uint256);
    function totalSupply() external view returns (uint256);
    function getBoostMultiplier(address user) external view returns (uint256);
}
