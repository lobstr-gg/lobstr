// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IStakingManager {
    enum Tier { None, Bronze, Silver, Gold, Platinum }

    struct StakeInfo {
        uint256 amount;
        uint256 unstakeRequestTime;
        uint256 unstakeRequestAmount;
    }

    event Staked(address indexed user, uint256 amount, Tier newTier);
    event UnstakeRequested(address indexed user, uint256 amount, uint256 availableAt);
    event Unstaked(address indexed user, uint256 amount, Tier newTier);
    event Slashed(address indexed user, uint256 amount, address indexed beneficiary);
    event TierChanged(address indexed user, Tier oldTier, Tier newTier);

    function stake(uint256 amount) external;
    function requestUnstake(uint256 amount) external;
    function unstake() external;
    function slash(address user, uint256 amount, address beneficiary) external;
    function getTier(address user) external view returns (Tier);
    function getStake(address user) external view returns (uint256);
    function getStakeInfo(address user) external view returns (StakeInfo memory);
    function tierThreshold(Tier tier) external pure returns (uint256);
    function maxListings(Tier tier) external pure returns (uint256);
}
