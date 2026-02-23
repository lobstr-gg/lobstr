// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IRewardDistributor.sol";

/**
 * @title RewardDistributor
 * @notice Central pull-based reward ledger for LOBSTR protocol.
 *         Arbitrators, watchers, and judges accumulate claimable balances
 *         from dispute resolutions and Sybil report adjudications.
 *         Recipients claim on their own schedule (gas efficient).
 *
 *         Funded by:
 *           - TreasuryGovernor deposits (arbitrator reward budget)
 *           - SybilGuard seizure carve-outs (watcher/judge rewards)
 */
contract RewardDistributor is IRewardDistributor, AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant DISPUTE_ROLE = keccak256("DISPUTE_ROLE");
    bytes32 public constant SYBIL_GUARD_ROLE = keccak256("SYBIL_GUARD_ROLE");

    // Claimable balances: account => token => amount
    mapping(address => mapping(address => uint256)) private _claimable;

    // Outstanding liabilities per token (credited but unclaimed)
    mapping(address => uint256) private _totalLiabilities;

    // Lifetime stats
    mapping(address => uint256) public totalEarnedByAccount;
    uint256 public totalDistributed;
    uint256 public totalDeposited;

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /// @notice Credit arbitrator reward (called by DisputeArbitration after ruling)
    function creditArbitratorReward(
        address arbitrator,
        address token,
        uint256 amount
    ) external onlyRole(DISPUTE_ROLE) {
        require(arbitrator != address(0), "RewardDistributor: zero address");
        require(amount > 0, "RewardDistributor: zero amount");

        _claimable[arbitrator][token] += amount;
        _totalLiabilities[token] += amount;
        totalEarnedByAccount[arbitrator] += amount;

        emit ArbitratorRewardCredited(arbitrator, token, amount);
    }

    /// @notice Credit watcher reward (called by SybilGuard after confirmed report)
    function creditWatcherReward(
        address watcher,
        address token,
        uint256 amount
    ) external onlyRole(SYBIL_GUARD_ROLE) {
        require(watcher != address(0), "RewardDistributor: zero address");
        require(amount > 0, "RewardDistributor: zero amount");

        _claimable[watcher][token] += amount;
        _totalLiabilities[token] += amount;
        totalEarnedByAccount[watcher] += amount;

        emit WatcherRewardCredited(watcher, token, amount);
    }

    /// @notice Credit judge reward (called by SybilGuard after adjudication)
    function creditJudgeReward(
        address judge,
        address token,
        uint256 amount
    ) external onlyRole(SYBIL_GUARD_ROLE) {
        require(judge != address(0), "RewardDistributor: zero address");
        require(amount > 0, "RewardDistributor: zero amount");

        _claimable[judge][token] += amount;
        _totalLiabilities[token] += amount;
        totalEarnedByAccount[judge] += amount;

        emit JudgeRewardCredited(judge, token, amount);
    }

    /// @notice Claim all accumulated rewards for a specific token
    function claim(address token) external nonReentrant {
        uint256 amount = _claimable[msg.sender][token];
        require(amount > 0, "RewardDistributor: nothing to claim");

        _claimable[msg.sender][token] = 0;
        _totalLiabilities[token] -= amount;
        totalDistributed += amount;

        IERC20(token).safeTransfer(msg.sender, amount);

        emit RewardClaimed(msg.sender, token, amount);
    }

    /// @notice Deposit tokens to fund the reward pool (anyone can call)
    function deposit(address token, uint256 amount) external {
        require(amount > 0, "RewardDistributor: zero amount");

        totalDeposited += amount;

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        emit Deposited(msg.sender, token, amount);
    }

    /// @notice View claimable balance for an account
    function claimableBalance(
        address account,
        address token
    ) external view returns (uint256) {
        return _claimable[account][token];
    }

    /// @notice Available budget = balance minus outstanding liabilities
    function availableBudget(address token) external view returns (uint256) {
        uint256 balance = IERC20(token).balanceOf(address(this));
        uint256 liabilities = _totalLiabilities[token];
        return balance > liabilities ? balance - liabilities : 0;
    }
}
