// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IRewardDistributor {
    event ArbitratorRewardCredited(address indexed arbitrator, address indexed token, uint256 amount);
    event WatcherRewardCredited(address indexed watcher, address indexed token, uint256 amount);
    event JudgeRewardCredited(address indexed judge, address indexed token, uint256 amount);
    event RewardClaimed(address indexed account, address indexed token, uint256 amount);
    event Deposited(address indexed depositor, address indexed token, uint256 amount);

    function creditArbitratorReward(address arbitrator, address token, uint256 amount) external;
    function creditWatcherReward(address watcher, address token, uint256 amount) external;
    function creditJudgeReward(address judge, address token, uint256 amount) external;
    function claim(address token) external;
    function deposit(address token, uint256 amount) external;
    function claimableBalance(address account, address token) external view returns (uint256);
    function availableBudget(address token) external view returns (uint256);
}
