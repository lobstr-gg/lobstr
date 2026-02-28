// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IStakingManager.sol";

contract StakingManager is IStakingManager, AccessControlUpgradeable, ReentrancyGuardUpgradeable, PausableUpgradeable, UUPSUpgradeable {
    using SafeERC20 for IERC20;

    bytes32 public constant SLASHER_ROLE = keccak256("SLASHER_ROLE");
    bytes32 public constant LOCKER_ROLE = keccak256("LOCKER_ROLE");

    uint256 public constant UNSTAKE_COOLDOWN = 7 days;

    uint256 public constant BRONZE_THRESHOLD = 100 ether;
    uint256 public constant SILVER_THRESHOLD = 1_000 ether;
    uint256 public constant GOLD_THRESHOLD = 10_000 ether;
    uint256 public constant PLATINUM_THRESHOLD = 100_000 ether;

    IERC20 public lobToken;

    mapping(address => StakeInfo) private _stakes;

    // Stake locking — prevents unstake while loans/credit lines are active
    mapping(address => uint256) private _lockedStake;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _lobToken) public initializer {
        require(_lobToken != address(0), "StakingManager: zero token");
        lobToken = IERC20(_lobToken);
        __AccessControl_init();
        __ReentrancyGuard_init();
        __Pausable_init();
        __UUPSUpgradeable_init();
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}

    function stake(uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "StakingManager: zero amount");

        Tier oldTier = getTier(msg.sender);

        _stakes[msg.sender].amount += amount;
        lobToken.safeTransferFrom(msg.sender, address(this), amount);

        Tier newTier = getTier(msg.sender);
        emit Staked(msg.sender, amount, newTier);

        if (oldTier != newTier) {
            emit TierChanged(msg.sender, oldTier, newTier);
        }
    }

    function requestUnstake(uint256 amount) external nonReentrant whenNotPaused {
        StakeInfo storage info = _stakes[msg.sender];
        require(amount > 0, "StakingManager: zero amount");
        require(info.amount >= amount, "StakingManager: insufficient stake");
        require(info.unstakeRequestAmount == 0, "StakingManager: pending unstake");

        // Cannot unstake locked stake
        require(info.amount - _lockedStake[msg.sender] >= amount, "StakingManager: stake locked");

        info.unstakeRequestAmount = amount;
        info.unstakeRequestTime = block.timestamp;

        emit UnstakeRequested(msg.sender, amount, block.timestamp + UNSTAKE_COOLDOWN);
    }

    function unstake() external nonReentrant {
        StakeInfo storage info = _stakes[msg.sender];
        uint256 amount = info.unstakeRequestAmount;

        require(amount > 0, "StakingManager: no pending unstake");
        require(block.timestamp >= info.unstakeRequestTime + UNSTAKE_COOLDOWN, "StakingManager: cooldown active");

        // FIX: Enforce locked stake cannot be withdrawn
        uint256 locked = _lockedStake[msg.sender];
        uint256 unlockedBalance = info.amount - locked;
        require(amount <= unlockedBalance, "StakingManager: stake locked");

        Tier oldTier = getTier(msg.sender);

        info.amount -= amount;
        info.unstakeRequestAmount = 0;
        info.unstakeRequestTime = 0;

        lobToken.safeTransfer(msg.sender, amount);

        Tier newTier = getTier(msg.sender);
        emit Unstaked(msg.sender, amount, newTier);

        if (oldTier != newTier) {
            emit TierChanged(msg.sender, oldTier, newTier);
        }
    }

    function slash(address user, uint256 amount, address beneficiary) external onlyRole(SLASHER_ROLE) nonReentrant {
        require(user != address(0), "StakingManager: zero user");
        require(beneficiary != address(0), "StakingManager: zero beneficiary");
        require(amount > 0, "StakingManager: zero amount");

        StakeInfo storage info = _stakes[user];
        uint256 slashable = info.amount;
        if (amount > slashable) {
            amount = slashable;
        }

        // Compute oldTier BEFORE modifying balance (fixes TierChanged event)
        Tier oldTier = getTier(user);

        // Proportionally reduce pending unstake request
        if (info.unstakeRequestAmount > 0) {
            uint256 remaining = info.amount - amount;
            info.unstakeRequestAmount = (info.unstakeRequestAmount * remaining) / info.amount;
            if (info.unstakeRequestAmount == 0) {
                info.unstakeRequestTime = 0;
            }
        }

        info.amount -= amount;

        // Auto-reduce locked stake if slash drops below lock
        if (_lockedStake[user] > info.amount) {
            _lockedStake[user] = info.amount;
        }

        lobToken.safeTransfer(beneficiary, amount);

        emit Slashed(user, amount, beneficiary);

        Tier newTier = getTier(user);
        if (oldTier != newTier) {
            emit TierChanged(user, oldTier, newTier);
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // STAKE LOCKING
    // ═══════════════════════════════════════════════════════════════

    function lockStake(address user, uint256 amount) external onlyRole(LOCKER_ROLE) {
        require(amount > 0, "StakingManager: zero amount");
        uint256 unlocked = _stakes[user].amount - _lockedStake[user];
        require(amount <= unlocked, "StakingManager: insufficient unlocked stake");
        _lockedStake[user] += amount;
        emit StakeLocked(user, amount, _lockedStake[user]);
    }

    function unlockStake(address user, uint256 amount) external onlyRole(LOCKER_ROLE) {
        require(amount > 0, "StakingManager: zero amount");
        if (amount > _lockedStake[user]) {
            amount = _lockedStake[user];
        }
        _lockedStake[user] -= amount;
        emit StakeUnlocked(user, amount, _lockedStake[user]);
    }

    function getLockedStake(address user) external view returns (uint256) {
        return _lockedStake[user];
    }

    function getUnlockedStake(address user) external view returns (uint256) {
        uint256 total = _stakes[user].amount;
        uint256 locked = _lockedStake[user];
        return total > locked ? total - locked : 0;
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function getTier(address user) public view returns (Tier) {
        uint256 amount = _stakes[user].amount;
        if (amount >= PLATINUM_THRESHOLD) return Tier.Platinum;
        if (amount >= GOLD_THRESHOLD) return Tier.Gold;
        if (amount >= SILVER_THRESHOLD) return Tier.Silver;
        if (amount >= BRONZE_THRESHOLD) return Tier.Bronze;
        return Tier.None;
    }

    function getStake(address user) external view returns (uint256) {
        return _stakes[user].amount;
    }

    function getStakeInfo(address user) external view returns (StakeInfo memory) {
        return _stakes[user];
    }

    function tierThreshold(Tier tier) external pure returns (uint256) {
        if (tier == Tier.Platinum) return PLATINUM_THRESHOLD;
        if (tier == Tier.Gold) return GOLD_THRESHOLD;
        if (tier == Tier.Silver) return SILVER_THRESHOLD;
        if (tier == Tier.Bronze) return BRONZE_THRESHOLD;
        return 0;
    }

    function maxListings(Tier tier) external pure returns (uint256) {
        if (tier == Tier.Platinum) return type(uint256).max;
        if (tier == Tier.Gold) return 25;
        if (tier == Tier.Silver) return 10;
        if (tier == Tier.Bronze) return 3;
        return 0;
    }
}
