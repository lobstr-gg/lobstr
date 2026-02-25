// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/ILiquidityMining.sol";
import "./interfaces/IStakingManager.sol";
import "./interfaces/ISybilGuard.sol";

contract LiquidityMining is ILiquidityMining, Initializable, UUPSUpgradeable, OwnableUpgradeable, AccessControlUpgradeable, ReentrancyGuardUpgradeable, PausableUpgradeable {
    using SafeERC20 for IERC20;

    bytes32 public constant REWARD_NOTIFIER_ROLE = keccak256("REWARD_NOTIFIER_ROLE");

    // Boost multipliers in BPS
    uint256 public constant NONE_BOOST = 10000;
    uint256 public constant BRONZE_BOOST = 10000;
    uint256 public constant SILVER_BOOST = 15000;
    uint256 public constant GOLD_BOOST = 20000;
    uint256 public constant PLATINUM_BOOST = 30000;

    IERC20 public lpToken;
    IERC20 public rewardToken;
    IStakingManager public stakingManager;
    ISybilGuard public sybilGuard;

    uint256 public rewardRate;
    uint256 public periodFinish;
    uint256 public lastUpdateTime;
    uint256 public rewardPerTokenStored;

    uint256 private _totalBoostedSupply;

    mapping(address => uint256) private _balances;
    mapping(address => uint256) private _boostedBalances;
    mapping(address => uint256) private _userRewardPerTokenPaid;
    mapping(address => uint256) private _rewards;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        // Initializers disabled by atomic proxy deployment + multisig ownership transfer
    }

    function initialize(
        address _lpToken,
        address _rewardToken,
        address _stakingManager,
        address _sybilGuard,
        address _owner
    ) external initializer {
        require(_lpToken != address(0), "LiquidityMining: zero lpToken");
        require(_rewardToken != address(0), "LiquidityMining: zero rewardToken");
        require(_stakingManager != address(0), "LiquidityMining: zero stakingManager");
        require(_sybilGuard != address(0), "LiquidityMining: zero sybilGuard");
        require(_owner != address(0), "LiquidityMining: zero owner");

        __Ownable_init(_owner);
        __AccessControl_init();
        __ReentrancyGuard_init();
        __Pausable_init();

        lpToken = IERC20(_lpToken);
        rewardToken = IERC20(_rewardToken);
        stakingManager = IStakingManager(_stakingManager);
        sybilGuard = ISybilGuard(_sybilGuard);

        _grantRole(DEFAULT_ADMIN_ROLE, _owner);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // ═══════════════════════════════════════════════════════════════
    //  MODIFIERS
    // ═══════════════════════════════════════════════════════════════

    modifier updateReward(address account) {
        _updateRewardInternal(account);
        _;
    }

    // ═══════════════════════════════════════════════════════════════
    //  CORE
    // ═══════════════════════════════════════════════════════════════

    function stake(uint256 amount) external nonReentrant whenNotPaused updateReward(msg.sender) {
        require(!sybilGuard.checkBanned(msg.sender), "LiquidityMining: banned");
        require(amount > 0, "LiquidityMining: zero amount");

        uint256 boost = _getBoost(msg.sender);
        uint256 boostedAmount = (amount * boost) / 10000;

        _balances[msg.sender] += amount;
        _boostedBalances[msg.sender] += boostedAmount;
        _totalBoostedSupply += boostedAmount;

        lpToken.safeTransferFrom(msg.sender, address(this), amount);

        emit Staked(msg.sender, amount);
    }

    function withdraw(uint256 amount) external nonReentrant whenNotPaused updateReward(msg.sender) {
        require(!sybilGuard.checkBanned(msg.sender), "LiquidityMining: banned");
        _withdrawInternal(msg.sender, amount);
    }

    function getReward() public nonReentrant whenNotPaused updateReward(msg.sender) {
        require(!sybilGuard.checkBanned(msg.sender), "LiquidityMining: banned");
        _getRewardInternal(msg.sender);
    }

    function exit() external nonReentrant whenNotPaused updateReward(msg.sender) {
        require(!sybilGuard.checkBanned(msg.sender), "LiquidityMining: banned");
        uint256 bal = _balances[msg.sender];
        if (bal > 0) {
            _withdrawInternal(msg.sender, bal);
        }
        _getRewardInternal(msg.sender);
    }

    function emergencyWithdraw() external nonReentrant {
        uint256 amount = _balances[msg.sender];
        require(amount > 0, "LiquidityMining: nothing to withdraw");

        _totalBoostedSupply -= _boostedBalances[msg.sender];
        _boostedBalances[msg.sender] = 0;
        _balances[msg.sender] = 0;
        _rewards[msg.sender] = 0;

        lpToken.safeTransfer(msg.sender, amount);

        emit EmergencyWithdrawn(msg.sender, amount);
    }

    function notifyRewardAmount(
        uint256 amount,
        uint256 duration
    ) external onlyRole(REWARD_NOTIFIER_ROLE) updateReward(address(0)) {
        require(amount > 0, "LiquidityMining: zero amount");
        require(duration > 0, "LiquidityMining: zero duration");

        rewardToken.safeTransferFrom(msg.sender, address(this), amount);

        if (block.timestamp >= periodFinish) {
            rewardRate = amount / duration;
        } else {
            uint256 remaining = periodFinish - block.timestamp;
            uint256 leftover = remaining * rewardRate;
            rewardRate = (amount + leftover) / duration;
        }

        lastUpdateTime = block.timestamp;
        periodFinish = block.timestamp + duration;

        emit RewardNotified(amount, duration);
    }

    // ═══════════════════════════════════════════════════════════════
    //  VIEWS
    // ═══════════════════════════════════════════════════════════════

    function earned(address user) public view returns (uint256) {
        uint256 boosted = _boostedBalances[user];
        uint256 perToken = rewardPerToken() - _userRewardPerTokenPaid[user];
        return (boosted * perToken) / 1e18 + _rewards[user];
    }

    function rewardPerToken() public view returns (uint256) {
        if (_totalBoostedSupply == 0) {
            return rewardPerTokenStored;
        }
        uint256 timeElapsed = lastTimeRewardApplicable() - lastUpdateTime;
        return rewardPerTokenStored + (timeElapsed * rewardRate * 1e18) / _totalBoostedSupply;
    }

    function lastTimeRewardApplicable() public view returns (uint256) {
        return block.timestamp < periodFinish ? block.timestamp : periodFinish;
    }

    function balanceOf(address user) external view returns (uint256) {
        return _balances[user];
    }

    function totalSupply() external view returns (uint256) {
        return _totalBoostedSupply;
    }

    function getBoostMultiplier(address user) external view returns (uint256) {
        return _getBoost(user);
    }

    // ═══════════════════════════════════════════════════════════════
    //  INTERNAL
    // ═══════════════════════════════════════════════════════════════

    function _withdrawInternal(address user, uint256 amount) internal {
        require(amount > 0, "LiquidityMining: zero amount");
        require(_balances[user] >= amount, "LiquidityMining: insufficient balance");

        _recalculateBoost(user, _balances[user] - amount);

        _balances[user] -= amount;
        lpToken.safeTransfer(user, amount);

        emit Withdrawn(user, amount);
    }

    function _getRewardInternal(address user) internal {
        // Boost already synced in _updateRewardInternal (via updateReward modifier)
        uint256 reward = _rewards[user];
        if (reward > 0) {
            _rewards[user] = 0;
            rewardToken.safeTransfer(user, reward);
            emit RewardPaid(user, reward);
        }
    }

    function _getBoost(address user) internal view returns (uint256) {
        IStakingManager.Tier tier = stakingManager.getTier(user);
        if (tier == IStakingManager.Tier.Platinum) return PLATINUM_BOOST;
        if (tier == IStakingManager.Tier.Gold) return GOLD_BOOST;
        if (tier == IStakingManager.Tier.Silver) return SILVER_BOOST;
        return NONE_BOOST;
    }

    function _recalculateBoost(address user, uint256 newRawBalance) internal {
        uint256 oldBoosted = _boostedBalances[user];
        uint256 boost = _getBoost(user);
        uint256 newBoosted = (newRawBalance * boost) / 10000;

        _totalBoostedSupply = _totalBoostedSupply - oldBoosted + newBoosted;
        _boostedBalances[user] = newBoosted;
    }

    function _updateRewardInternal(address account) internal {
        // Step 1: Sync boost to current tier FIRST to prevent stale-balance exploits
        if (account != address(0)) {
            _recalculateBoost(account, _balances[account]);
        }
        // Step 2: Checkpoint global reward state (uses corrected _totalBoostedSupply)
        rewardPerTokenStored = rewardPerToken();
        lastUpdateTime = lastTimeRewardApplicable();
        // Step 3: Checkpoint user rewards (uses synced boosted balance + consistent per-token rate)
        if (account != address(0)) {
            _rewards[account] = earned(account);
            _userRewardPerTokenPaid[account] = rewardPerTokenStored;
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  ADMIN
    // ═══════════════════════════════════════════════════════════════

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
