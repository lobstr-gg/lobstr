// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/ISubscriptionEngine.sol";
import "./interfaces/IReputationSystem.sol";
import "./interfaces/ISybilGuard.sol";

contract SubscriptionEngine is ISubscriptionEngine, Initializable, UUPSUpgradeable, OwnableUpgradeable, AccessControlUpgradeable, ReentrancyGuardUpgradeable, PausableUpgradeable {
    using SafeERC20 for IERC20;

    uint256 public constant USDC_FEE_BPS = 150; // 1.5%
    uint256 public constant MIN_INTERVAL = 1 hours;
    uint256 public constant MAX_PROCESSING_WINDOW = 7 days;
    uint256 public constant MIN_REPUTATION_VALUE = 50 ether; // 50 LOB minimum for reputation recording

    IERC20 public lobToken;
    IReputationSystem public reputationSystem;
    ISybilGuard public sybilGuard;
    address public treasury;

    uint256 private _nextSubscriptionId = 1;

    mapping(uint256 => Subscription) private _subscriptions;
    mapping(address => uint256[]) private _buyerSubscriptionIds;
    mapping(address => uint256[]) private _sellerSubscriptionIds;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _lobToken,
        address _reputationSystem,
        address _sybilGuard,
        address _treasury
    ) public virtual initializer {
        require(_lobToken != address(0), "SubscriptionEngine: zero lobToken");
        require(_reputationSystem != address(0), "SubscriptionEngine: zero reputationSystem");
        require(_sybilGuard != address(0), "SubscriptionEngine: zero sybilGuard");
        require(_treasury != address(0), "SubscriptionEngine: zero treasury");

        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();
        __AccessControl_init();
        __ReentrancyGuard_init();
        __Pausable_init();

        _nextSubscriptionId = 1;

        lobToken = IERC20(_lobToken);
        reputationSystem = IReputationSystem(_reputationSystem);
        sybilGuard = ISybilGuard(_sybilGuard);
        treasury = _treasury;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    function createSubscription(
        address seller,
        address token,
        uint256 amount,
        uint256 interval,
        uint256 maxCycles,
        uint256 listingId,
        string calldata metadataURI
    ) external nonReentrant whenNotPaused returns (uint256 id) {
        require(msg.sender != seller, "SubscriptionEngine: buyer is seller");
        require(amount > 0, "SubscriptionEngine: zero amount");
        require(interval >= MIN_INTERVAL, "SubscriptionEngine: interval too short");
        require(!sybilGuard.checkBanned(msg.sender), "SubscriptionEngine: buyer banned");
        require(!sybilGuard.checkBanned(seller), "SubscriptionEngine: seller banned");

        id = _nextSubscriptionId++;

        _subscriptions[id] = Subscription({
            id: id,
            buyer: msg.sender,
            seller: seller,
            token: token,
            amount: amount,
            interval: interval,
            nextDue: block.timestamp + interval,
            maxCycles: maxCycles,
            cyclesCompleted: 1,
            status: SubscriptionStatus.Active,
            listingId: listingId,
            metadataURI: metadataURI,
            createdAt: block.timestamp
        });

        _buyerSubscriptionIds[msg.sender].push(id);
        _sellerSubscriptionIds[seller].push(id);

        // Pull first payment
        (uint256 sellerAmount, uint256 fee) = _calculateFee(token, amount);
        IERC20(token).safeTransferFrom(msg.sender, seller, sellerAmount);
        if (fee > 0) {
            IERC20(token).safeTransferFrom(msg.sender, treasury, fee);
        }

        // Check if completed after first cycle
        if (maxCycles == 1) {
            _subscriptions[id].status = SubscriptionStatus.Completed;
            emit SubscriptionCompleted(id);
        }

        emit SubscriptionCreated(id, msg.sender, seller, token, amount, interval, maxCycles);
    }

    function processPayment(uint256 subscriptionId) external nonReentrant whenNotPaused {
        Subscription storage sub = _subscriptions[subscriptionId];
        require(sub.id != 0, "SubscriptionEngine: not found");
        require(sub.status == SubscriptionStatus.Active, "SubscriptionEngine: not active");
        require(block.timestamp >= sub.nextDue, "SubscriptionEngine: not due");
        require(
            block.timestamp <= sub.nextDue + MAX_PROCESSING_WINDOW,
            "SubscriptionEngine: processing window expired"
        );

        // Pull payment from buyer
        (uint256 sellerAmount, uint256 fee) = _calculateFee(sub.token, sub.amount);
        IERC20(sub.token).safeTransferFrom(sub.buyer, sub.seller, sellerAmount);
        if (fee > 0) {
            IERC20(sub.token).safeTransferFrom(sub.buyer, treasury, fee);
        }

        // Record reputation only if value meets threshold
        if (_normalizeAmount(sub.amount, sub.token) >= MIN_REPUTATION_VALUE) {
            reputationSystem.recordCompletion(sub.seller, sub.buyer);
        }

        sub.cyclesCompleted++;

        emit PaymentProcessed(subscriptionId, sub.cyclesCompleted, sub.amount, fee);

        // Check completion
        if (sub.maxCycles > 0 && sub.cyclesCompleted >= sub.maxCycles) {
            sub.status = SubscriptionStatus.Completed;
            emit SubscriptionCompleted(subscriptionId);
        } else {
            // Advance from current time, not old due date,
            // to prevent accelerated catch-up charging
            sub.nextDue = block.timestamp + sub.interval;
        }
    }

    function cancelSubscription(uint256 subscriptionId) external nonReentrant whenNotPaused {
        Subscription storage sub = _subscriptions[subscriptionId];
        require(sub.id != 0, "SubscriptionEngine: not found");
        require(
            msg.sender == sub.buyer || msg.sender == sub.seller,
            "SubscriptionEngine: not authorized"
        );
        require(
            sub.status == SubscriptionStatus.Active || sub.status == SubscriptionStatus.Paused,
            "SubscriptionEngine: cannot cancel"
        );

        sub.status = SubscriptionStatus.Cancelled;

        emit SubscriptionCancelled(subscriptionId, msg.sender);
    }

    function pauseSubscription(uint256 subscriptionId) external nonReentrant whenNotPaused {
        Subscription storage sub = _subscriptions[subscriptionId];
        require(sub.id != 0, "SubscriptionEngine: not found");
        require(msg.sender == sub.buyer, "SubscriptionEngine: not buyer");
        require(sub.status == SubscriptionStatus.Active, "SubscriptionEngine: not active");

        sub.status = SubscriptionStatus.Paused;

        emit SubscriptionPaused(subscriptionId);
    }

    function resumeSubscription(uint256 subscriptionId) external nonReentrant whenNotPaused {
        Subscription storage sub = _subscriptions[subscriptionId];
        require(sub.id != 0, "SubscriptionEngine: not found");
        require(msg.sender == sub.buyer, "SubscriptionEngine: not buyer");
        require(sub.status == SubscriptionStatus.Paused, "SubscriptionEngine: not paused");

        sub.status = SubscriptionStatus.Active;
        sub.nextDue = block.timestamp + sub.interval;

        emit SubscriptionResumed(subscriptionId, sub.nextDue);
    }

    // ═══════════════════════════════════════════════════════════════
    //  VIEWS
    // ═══════════════════════════════════════════════════════════════

    function getSubscription(uint256 id) external view returns (Subscription memory) {
        require(_subscriptions[id].id != 0, "SubscriptionEngine: not found");
        return _subscriptions[id];
    }

    function getSubscriptionsByBuyer(address buyer) external view returns (uint256[] memory) {
        return _buyerSubscriptionIds[buyer];
    }

    function getSubscriptionsBySeller(address seller) external view returns (uint256[] memory) {
        return _sellerSubscriptionIds[seller];
    }

    // ═══════════════════════════════════════════════════════════════
    //  INTERNAL
    // ═══════════════════════════════════════════════════════════════

    /// @dev Normalize token amount to 18 decimals for cross-token comparison.
    function _normalizeAmount(uint256 amount, address token) internal view returns (uint256) {
        if (token == address(lobToken)) return amount; // LOB is 18 decimals
        try IERC20Metadata(token).decimals() returns (uint8 dec) {
            if (dec < 18) {
                return amount * (10 ** (18 - dec));
            } else if (dec > 18) {
                return amount / (10 ** (dec - 18));
            }
        } catch {
            // If decimals() reverts, assume 18
        }
        return amount;
    }

    function _calculateFee(address token, uint256 amount) internal view returns (uint256 sellerAmount, uint256 fee) {
        if (token == address(lobToken)) {
            // 0% fee for LOB
            return (amount, 0);
        }
        fee = (amount * USDC_FEE_BPS) / 10000;
        sellerAmount = amount - fee;
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
