// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IRewardScheduler {
    enum TargetType { STAKING_REWARDS, LIQUIDITY_MINING }

    struct Stream {
        uint256 id;
        TargetType targetType;
        address rewardToken;
        uint256 emissionPerSecond;
        uint256 lastDripTime;
        uint256 endTime;           // 0 = perpetual
        bool active;
    }

    event StreamCreated(uint256 indexed streamId, TargetType targetType, address rewardToken, uint256 emissionPerSecond, uint256 endTime);
    event StreamUpdated(uint256 indexed streamId, uint256 oldEmission, uint256 newEmission);
    event StreamDripped(uint256 indexed streamId, uint256 amount, uint256 elapsed);
    event StreamPaused(uint256 indexed streamId);
    event StreamResumed(uint256 indexed streamId);
    event TopUp(address indexed sender, address indexed token, uint256 amount);
    event BudgetWithdrawn(address indexed to, address indexed token, uint256 amount);

    function createStream(TargetType targetType, address rewardToken, uint256 emissionPerSecond, uint256 endTime) external;
    function drip(uint256 streamId) external;
    function dripAll() external;
    function updateEmission(uint256 streamId, uint256 newEmissionPerSecond) external;
    function pauseStream(uint256 streamId) external;
    function resumeStream(uint256 streamId) external;
    function topUp(address token, uint256 amount) external;
    function withdrawBudget(address token, uint256 amount, address to) external;
    function getStream(uint256 streamId) external view returns (Stream memory);
    function getActiveStreams() external view returns (Stream[] memory);
    function streamBalance(uint256 streamId) external view returns (uint256);
}
