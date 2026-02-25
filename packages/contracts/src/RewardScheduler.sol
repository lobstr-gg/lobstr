// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./interfaces/IRewardScheduler.sol";
import "./interfaces/IStakingRewards.sol";
import "./interfaces/ILiquidityMining.sol";

contract RewardScheduler is
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable,
    IRewardScheduler
{
    using SafeERC20 for IERC20;

    IStakingRewards public stakingRewards;
    ILiquidityMining public liquidityMining;

    uint256 private _streamCount;
    mapping(uint256 => Stream) private _streams;
    uint256[] private _activeStreamIds;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        // Initializers disabled by atomic proxy deployment + multisig ownership transfer
    }

    function initialize(address _stakingRewards, address _liquidityMining) public initializer {
        require(_stakingRewards != address(0), "RewardScheduler: zero stakingRewards");
        require(_liquidityMining != address(0), "RewardScheduler: zero liquidityMining");

        __Ownable_init(msg.sender);
        __AccessControl_init();
        __ReentrancyGuard_init();
        __Pausable_init();
        __UUPSUpgradeable_init();

        stakingRewards = IStakingRewards(_stakingRewards);
        liquidityMining = ILiquidityMining(_liquidityMining);

        // Grant DEFAULT_ADMIN_ROLE to owner (can reassign and grant other roles)
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // ═══════════════════════════════════════════════════════════════
    //  STREAM MANAGEMENT
    // ═══════════════════════════════════════════════════════════════

    function createStream(
        TargetType targetType,
        address rewardToken,
        uint256 emissionPerSecond,
        uint256 endTime
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(rewardToken != address(0), "RewardScheduler: zero token");
        require(emissionPerSecond > 0, "RewardScheduler: zero emission");
        if (endTime > 0) {
            require(endTime > block.timestamp, "RewardScheduler: endTime in past");
        }

        _streamCount++;
        uint256 streamId = _streamCount;

        _streams[streamId] = Stream({
            id: streamId,
            targetType: targetType,
            rewardToken: rewardToken,
            emissionPerSecond: emissionPerSecond,
            lastDripTime: block.timestamp,
            endTime: endTime,
            active: true
        });

        _activeStreamIds.push(streamId);

        emit StreamCreated(streamId, targetType, rewardToken, emissionPerSecond, endTime);
    }

    // ═══════════════════════════════════════════════════════════════
    //  DRIP
    // ═══════════════════════════════════════════════════════════════

    function drip(uint256 streamId) public nonReentrant whenNotPaused {
        _drip(streamId);
    }

    function dripAll() external nonReentrant whenNotPaused {
        for (uint256 i = 0; i < _activeStreamIds.length; i++) {
            _drip(_activeStreamIds[i]);
        }
    }

    function _drip(uint256 streamId) internal {
        Stream storage stream = _streams[streamId];
        require(stream.id != 0, "RewardScheduler: stream not found");
        if (!stream.active) return;

        uint256 effectiveEnd = stream.endTime > 0
            ? _min(block.timestamp, stream.endTime)
            : block.timestamp;

        if (effectiveEnd <= stream.lastDripTime) return;

        uint256 elapsed = effectiveEnd - stream.lastDripTime;
        uint256 amount = elapsed * stream.emissionPerSecond;

        uint256 balance = IERC20(stream.rewardToken).balanceOf(address(this));
        if (amount > balance) {
            amount = balance;
            if (amount == 0) return;
            // Recalculate elapsed based on capped amount
            elapsed = amount / stream.emissionPerSecond;
            if (elapsed == 0) return;
        }

        stream.lastDripTime = stream.lastDripTime + elapsed;

        // Approve target (reset to 0 first for OZ v4 SafeERC20 compat)
        IERC20 token = IERC20(stream.rewardToken);

        if (stream.targetType == TargetType.STAKING_REWARDS) {
            token.approve(address(stakingRewards), 0);
            token.approve(address(stakingRewards), amount);
            stakingRewards.notifyRewardAmount(stream.rewardToken, amount, elapsed);
        } else {
            token.approve(address(liquidityMining), 0);
            token.approve(address(liquidityMining), amount);
            liquidityMining.notifyRewardAmount(amount, elapsed);
        }

        // Deactivate if stream has ended
        if (stream.endTime > 0 && block.timestamp >= stream.endTime) {
            stream.active = false;
            _removeActiveStream(streamId);
        }

        emit StreamDripped(streamId, amount, elapsed);
    }

    // ═══════════════════════════════════════════════════════════════
    //  ADMIN
    // ═══════════════════════════════════════════════════════════════

    function updateEmission(
        uint256 streamId,
        uint256 newEmissionPerSecond
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        Stream storage stream = _streams[streamId];
        require(stream.id != 0, "RewardScheduler: stream not found");
        require(newEmissionPerSecond > 0, "RewardScheduler: zero emission");

        // Flush accrued at old rate
        _drip(streamId);

        uint256 oldEmission = stream.emissionPerSecond;
        stream.emissionPerSecond = newEmissionPerSecond;

        emit StreamUpdated(streamId, oldEmission, newEmissionPerSecond);
    }

    function pauseStream(uint256 streamId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        Stream storage stream = _streams[streamId];
        require(stream.id != 0, "RewardScheduler: stream not found");
        require(stream.active, "RewardScheduler: already paused");

        // Flush accrued before pausing
        _drip(streamId);

        stream.active = false;
        _removeActiveStream(streamId);

        emit StreamPaused(streamId);
    }

    function resumeStream(uint256 streamId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        Stream storage stream = _streams[streamId];
        require(stream.id != 0, "RewardScheduler: stream not found");
        require(!stream.active, "RewardScheduler: already active");
        if (stream.endTime > 0) {
            require(block.timestamp < stream.endTime, "RewardScheduler: stream ended");
        }

        stream.active = true;
        stream.lastDripTime = block.timestamp;
        _activeStreamIds.push(streamId);

        emit StreamResumed(streamId);
    }

    function topUp(address token, uint256 amount) external {
        require(token != address(0), "RewardScheduler: zero token");
        require(amount > 0, "RewardScheduler: zero amount");

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        emit TopUp(msg.sender, token, amount);
    }

    function withdrawBudget(
        address token,
        uint256 amount,
        address to
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(to != address(0), "RewardScheduler: zero recipient");
        require(amount > 0, "RewardScheduler: zero amount");

        IERC20(token).safeTransfer(to, amount);

        emit BudgetWithdrawn(to, token, amount);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // ═══════════════════════════════════════════════════════════════
    //  VIEWS
    // ═══════════════════════════════════════════════════════════════

    function getStream(uint256 streamId) external view returns (Stream memory) {
        require(_streams[streamId].id != 0, "RewardScheduler: stream not found");
        return _streams[streamId];
    }

    function getActiveStreams() external view returns (Stream[] memory) {
        Stream[] memory result = new Stream[](_activeStreamIds.length);
        for (uint256 i = 0; i < _activeStreamIds.length; i++) {
            result[i] = _streams[_activeStreamIds[i]];
        }
        return result;
    }

    function streamBalance(uint256 streamId) external view returns (uint256) {
        Stream memory stream = _streams[streamId];
        require(stream.id != 0, "RewardScheduler: stream not found");
        if (!stream.active) return 0;

        uint256 effectiveEnd = stream.endTime > 0
            ? _min(block.timestamp, stream.endTime)
            : block.timestamp;

        if (effectiveEnd <= stream.lastDripTime) return 0;

        uint256 elapsed = effectiveEnd - stream.lastDripTime;
        uint256 accrued = elapsed * stream.emissionPerSecond;

        uint256 balance = IERC20(stream.rewardToken).balanceOf(address(this));
        return accrued > balance ? balance : accrued;
    }

    function getStreamCount() external view returns (uint256) {
        return _streamCount;
    }

    // ═══════════════════════════════════════════════════════════════
    //  INTERNAL
    // ═══════════════════════════════════════════════════════════════

    function _removeActiveStream(uint256 streamId) internal {
        for (uint256 i = 0; i < _activeStreamIds.length; i++) {
            if (_activeStreamIds[i] == streamId) {
                _activeStreamIds[i] = _activeStreamIds[_activeStreamIds.length - 1];
                _activeStreamIds.pop();
                return;
            }
        }
    }

    function _min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }
}
