// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IAffiliateManager.sol";
import "./interfaces/ISybilGuard.sol";

contract AffiliateManager is IAffiliateManager, Initializable, UUPSUpgradeable, OwnableUpgradeable, AccessControlUpgradeable, ReentrancyGuardUpgradeable, PausableUpgradeable {
    using SafeERC20 for IERC20;

    bytes32 public constant CREDITOR_ROLE = keccak256("CREDITOR_ROLE");

    ISybilGuard public sybilGuard;

    mapping(address => ReferralInfo) private _referrals;
    mapping(address => ReferrerStats) private _referrerStats;
    mapping(address => mapping(address => uint256)) private _claimable;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _sybilGuard) public virtual initializer {
        require(_sybilGuard != address(0), "AffiliateManager: zero sybilGuard");

        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();
        __AccessControl_init();
        __ReentrancyGuard_init();
        __Pausable_init();

        sybilGuard = ISybilGuard(_sybilGuard);

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    function registerReferral(address referred) external nonReentrant whenNotPaused {
        require(referred != msg.sender, "AffiliateManager: self-referral");
        require(_referrals[referred].referrer == address(0), "AffiliateManager: already referred");
        require(!sybilGuard.checkBanned(msg.sender), "AffiliateManager: referrer banned");
        require(!sybilGuard.checkBanned(referred), "AffiliateManager: referred banned");

        _referrals[referred] = ReferralInfo({
            referrer: msg.sender,
            registeredAt: block.timestamp
        });

        _referrerStats[msg.sender].totalReferred++;

        emit ReferralRegistered(msg.sender, referred, block.timestamp);
    }

    function creditReferralReward(
        address referrer,
        address token,
        uint256 amount
    ) external onlyRole(CREDITOR_ROLE) nonReentrant whenNotPaused {
        require(referrer != address(0), "AffiliateManager: zero referrer");
        require(amount > 0, "AffiliateManager: zero amount");

        _claimable[referrer][token] += amount;
        _referrerStats[referrer].totalRewardsCredited += amount;
        _referrerStats[referrer].pendingRewards += amount;

        emit ReferralRewardCredited(referrer, token, amount);
    }

    function claimRewards(address token) external nonReentrant {
        uint256 amount = _claimable[msg.sender][token];
        require(amount > 0, "AffiliateManager: nothing to claim");

        _claimable[msg.sender][token] = 0;
        _referrerStats[msg.sender].totalRewardsClaimed += amount;
        _referrerStats[msg.sender].pendingRewards -= amount;

        IERC20(token).safeTransfer(msg.sender, amount);

        emit RewardsClaimed(msg.sender, token, amount);
    }

    function getReferralInfo(address referred) external view returns (ReferralInfo memory) {
        return _referrals[referred];
    }

    function getReferrerStats(address referrer) external view returns (ReferrerStats memory) {
        return _referrerStats[referrer];
    }

    function claimableBalance(address referrer, address token) external view returns (uint256) {
        return _claimable[referrer][token];
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
}
