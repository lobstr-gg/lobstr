// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IStakingRewards.sol";
import "./interfaces/IStakingManager.sol";
import "./interfaces/ISybilGuard.sol";

contract StakingRewards is IStakingRewards, AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    bytes32 public constant REWARD_NOTIFIER_ROLE = keccak256("REWARD_NOTIFIER_ROLE");

    // Tier multipliers in BPS (10000 = 1x)
    uint256 public constant BRONZE_MULTIPLIER = 10000;
    uint256 public constant SILVER_MULTIPLIER = 15000;
    uint256 public constant GOLD_MULTIPLIER = 20000;
    uint256 public constant PLATINUM_MULTIPLIER = 30000;

    // V-004: Anti-ghost-reward staleness window
    uint256 public constant MAX_SYNC_STALENESS = 7 days;

    IStakingManager public immutable stakingManager;
    ISybilGuard public immutable sybilGuard;

    struct RewardState {
        uint256 rewardRate;
        uint256 periodFinish;
        uint256 lastUpdateTime;
        uint256 rewardPerTokenStored;
    }

    address[] private _rewardTokens;
    mapping(address => bool) private _isRewardToken;
    mapping(address => RewardState) private _rewardState;

    mapping(address => uint256) private _effectiveBalances;
    uint256 private _totalEffectiveBalance;

    mapping(address => mapping(address => uint256)) private _userRewardPerTokenPaid;
    mapping(address => mapping(address => uint256)) private _rewards;

    // V-004: Track last sync timestamp per user
    mapping(address => uint256) private _lastSyncTimestamp;

    constructor(address _stakingManager, address _sybilGuard) {
        require(_stakingManager != address(0), "StakingRewards: zero stakingManager");
        require(_sybilGuard != address(0), "StakingRewards: zero sybilGuard");

        stakingManager = IStakingManager(_stakingManager);
        sybilGuard = ISybilGuard(_sybilGuard);

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    // ═══════════════════════════════════════════════════════════════
    //  MODIFIERS
    // ═══════════════════════════════════════════════════════════════

    modifier updateReward(address account) {
        // Step 1: Sync effective balance FIRST to prevent stale-balance exploits
        if (account != address(0)) {
            _syncEffectiveBalance(account);
        }
        // Step 2: Checkpoint global reward state (uses corrected _totalEffectiveBalance)
        for (uint256 i = 0; i < _rewardTokens.length; i++) {
            address token = _rewardTokens[i];
            RewardState storage state = _rewardState[token];
            state.rewardPerTokenStored = rewardPerToken(token);
            state.lastUpdateTime = lastTimeRewardApplicable(token);
        }
        // Step 3: Checkpoint user rewards (uses synced balance + consistent per-token rate)
        if (account != address(0)) {
            for (uint256 i = 0; i < _rewardTokens.length; i++) {
                address token = _rewardTokens[i];
                _rewards[account][token] = earned(account, token);
                _userRewardPerTokenPaid[account][token] = _rewardState[token].rewardPerTokenStored;
            }
        }
        _;
    }

    // ═══════════════════════════════════════════════════════════════
    //  CORE
    // ═══════════════════════════════════════════════════════════════

    function syncStake() public nonReentrant whenNotPaused updateReward(msg.sender) {
        require(!sybilGuard.checkBanned(msg.sender), "StakingRewards: banned");
        // Effective balance already synced in updateReward modifier
        emit StakeSynced(msg.sender, _effectiveBalances[msg.sender], uint256(stakingManager.getTier(msg.sender)));
    }

    function claimRewards(address token) external nonReentrant whenNotPaused updateReward(msg.sender) {
        require(!sybilGuard.checkBanned(msg.sender), "StakingRewards: banned");
        // Effective balance already synced in updateReward modifier

        uint256 reward = _rewards[msg.sender][token];
        require(reward > 0, "StakingRewards: nothing to claim");

        _rewards[msg.sender][token] = 0;
        IERC20(token).safeTransfer(msg.sender, reward);

        emit RewardsClaimed(msg.sender, token, reward);
    }

    function notifyRewardAmount(
        address token,
        uint256 amount,
        uint256 duration
    ) external onlyRole(REWARD_NOTIFIER_ROLE) updateReward(address(0)) {
        require(_isRewardToken[token], "StakingRewards: token not added");
        require(amount > 0, "StakingRewards: zero amount");
        require(duration > 0, "StakingRewards: zero duration");

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        RewardState storage state = _rewardState[token];

        if (block.timestamp >= state.periodFinish) {
            state.rewardRate = amount / duration;
        } else {
            uint256 remaining = state.periodFinish - block.timestamp;
            uint256 leftover = remaining * state.rewardRate;
            state.rewardRate = (amount + leftover) / duration;
        }

        state.lastUpdateTime = block.timestamp;
        state.periodFinish = block.timestamp + duration;

        emit RewardNotified(token, amount, duration);
    }

    function addRewardToken(address token) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(token != address(0), "StakingRewards: zero token");
        require(!_isRewardToken[token], "StakingRewards: token exists");

        _rewardTokens.push(token);
        _isRewardToken[token] = true;

        emit RewardTokenAdded(token);
    }

    // ═══════════════════════════════════════════════════════════════
    //  VIEWS
    // ═══════════════════════════════════════════════════════════════

    function earned(address user, address token) public view returns (uint256) {
        uint256 effective = _effectiveBalances[user];
        uint256 lastSync = _lastSyncTimestamp[user];

        // V-004: If stale, return only previously-checkpointed rewards.
        // The uncheckpointed accrual will be forfeited on next interaction.
        if (effective > 0 && lastSync > 0 && block.timestamp > lastSync + MAX_SYNC_STALENESS) {
            return _rewards[user][token];
        }

        uint256 perToken = rewardPerToken(token) - _userRewardPerTokenPaid[user][token];
        return (effective * perToken) / 1e18 + _rewards[user][token];
    }

    function rewardPerToken(address token) public view returns (uint256) {
        RewardState memory state = _rewardState[token];
        if (_totalEffectiveBalance == 0) {
            return state.rewardPerTokenStored;
        }
        uint256 timeElapsed = lastTimeRewardApplicable(token) - state.lastUpdateTime;
        return state.rewardPerTokenStored + (timeElapsed * state.rewardRate * 1e18) / _totalEffectiveBalance;
    }

    function lastTimeRewardApplicable(address token) public view returns (uint256) {
        RewardState memory state = _rewardState[token];
        return block.timestamp < state.periodFinish ? block.timestamp : state.periodFinish;
    }

    function getEffectiveBalance(address user) external view returns (uint256) {
        return _effectiveBalances[user];
    }

    function getRewardTokens() external view returns (address[] memory) {
        return _rewardTokens;
    }

    function getTotalEffectiveBalance() external view returns (uint256) {
        return _totalEffectiveBalance;
    }

    function getLastSyncTimestamp(address user) external view returns (uint256) {
        return _lastSyncTimestamp[user];
    }

    // ═══════════════════════════════════════════════════════════════
    //  INTERNAL
    // ═══════════════════════════════════════════════════════════════

    function _syncEffectiveBalance(address account) internal {
        uint256 lastSync = _lastSyncTimestamp[account];
        uint256 oldEffective = _effectiveBalances[account];

        // V-004: If user had an effective balance but hasn't synced within
        // MAX_SYNC_STALENESS, forfeit all uncheckpointed rewards from the
        // stale period. Snap per-token-paid to current rate WITHOUT adding
        // the gap to _rewards — the unclaimed accrual is simply lost.
        if (oldEffective > 0 && lastSync > 0 && block.timestamp > lastSync + MAX_SYNC_STALENESS) {
            for (uint256 i = 0; i < _rewardTokens.length; i++) {
                address token = _rewardTokens[i];
                // Snap to current rate — uncheckpointed rewards are forfeited
                _userRewardPerTokenPaid[account][token] = rewardPerToken(token);
            }
            // Zero out effective balance for the stale period
            _totalEffectiveBalance -= oldEffective;
            _effectiveBalances[account] = 0;
            oldEffective = 0;
        }

        uint256 stake = stakingManager.getStake(account);
        IStakingManager.Tier tier = stakingManager.getTier(account);
        uint256 multiplier = _tierMultiplier(tier);
        uint256 newEffective = (stake * multiplier) / 10000;
        _totalEffectiveBalance = _totalEffectiveBalance - oldEffective + newEffective;
        _effectiveBalances[account] = newEffective;
        _lastSyncTimestamp[account] = block.timestamp;
    }

    function _tierMultiplier(IStakingManager.Tier tier) internal pure returns (uint256) {
        if (tier == IStakingManager.Tier.Platinum) return PLATINUM_MULTIPLIER;
        if (tier == IStakingManager.Tier.Gold) return GOLD_MULTIPLIER;
        if (tier == IStakingManager.Tier.Silver) return SILVER_MULTIPLIER;
        return BRONZE_MULTIPLIER; // None and Bronze both get 1x
    }

    // ═══════════════════════════════════════════════════════════════
    //  ADMIN
    // ═══════════════════════════════════════════════════════════════

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
}
