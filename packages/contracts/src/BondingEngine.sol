// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IBondingEngine.sol";
import "./interfaces/IStakingManager.sol";
import "./interfaces/ISybilGuard.sol";

/// @title BondingEngine
/// @notice Protocol-owned liquidity via discounted LOB bonds.
///         Treasury deposits LOB → users buy at discount with USDC/LP →
///         protocol keeps quote tokens → users claim LOB over vesting period.
contract BondingEngine is IBondingEngine, AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    bytes32 public constant MARKET_ADMIN_ROLE = keccak256("MARKET_ADMIN_ROLE");

    uint256 public constant SILVER_BONUS_BPS = 100;
    uint256 public constant GOLD_BONUS_BPS = 200;
    uint256 public constant PLATINUM_BONUS_BPS = 300;
    uint256 public constant MIN_VESTING_PERIOD = 7 days;
    uint256 public constant MAX_DISCOUNT_BPS = 2000;

    IERC20 public immutable lobToken;
    IStakingManager public immutable stakingManager;
    ISybilGuard public immutable sybilGuard;
    address public immutable treasury;

    uint256 private _nextMarketId = 1;
    uint256 private _nextBondId = 1;

    mapping(uint256 => BondMarket) private _markets;
    mapping(uint256 => BondPosition) private _bonds;
    mapping(address => uint256[]) private _userBonds;
    uint256 private _totalOutstandingLOB;
    mapping(uint256 => mapping(address => uint256)) private _purchased; // marketId → buyer → total LOB purchased

    // ═══════════════════════════════════════════════════════════════
    //  CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════

    constructor(
        address _lobToken,
        address _stakingManager,
        address _sybilGuard,
        address _treasury
    ) {
        require(_lobToken != address(0), "BondingEngine: zero lobToken");
        require(_stakingManager != address(0), "BondingEngine: zero stakingManager");
        require(_sybilGuard != address(0), "BondingEngine: zero sybilGuard");
        require(_treasury != address(0), "BondingEngine: zero treasury");

        lobToken = IERC20(_lobToken);
        stakingManager = IStakingManager(_stakingManager);
        sybilGuard = ISybilGuard(_sybilGuard);
        treasury = _treasury;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    // ═══════════════════════════════════════════════════════════════
    //  ADMIN — MARKETS
    // ═══════════════════════════════════════════════════════════════

    function createMarket(
        address quoteToken,
        uint256 pricePer1LOB,
        uint256 discountBps,
        uint256 vestingPeriod,
        uint256 capacity,
        uint256 addressCap
    ) external onlyRole(MARKET_ADMIN_ROLE) returns (uint256 marketId) {
        require(quoteToken != address(0), "BondingEngine: zero quoteToken");
        require(pricePer1LOB > 0, "BondingEngine: zero price");
        require(discountBps <= MAX_DISCOUNT_BPS, "BondingEngine: discount too high");
        require(vestingPeriod >= MIN_VESTING_PERIOD, "BondingEngine: vesting too short");
        require(capacity > 0, "BondingEngine: zero capacity");

        marketId = _nextMarketId++;
        _markets[marketId] = BondMarket({
            quoteToken: quoteToken,
            pricePer1LOB: pricePer1LOB,
            discountBps: discountBps,
            vestingPeriod: vestingPeriod,
            capacity: capacity,
            sold: 0,
            active: true,
            addressCap: addressCap
        });

        emit MarketCreated(marketId, quoteToken, pricePer1LOB, discountBps, vestingPeriod, capacity);
    }

    function closeMarket(uint256 marketId) external onlyRole(MARKET_ADMIN_ROLE) {
        BondMarket storage market = _markets[marketId];
        require(market.quoteToken != address(0), "BondingEngine: market does not exist");
        require(market.active, "BondingEngine: already closed");

        market.active = false;
        emit MarketClosed(marketId);
    }

    function updateMarketPrice(uint256 marketId, uint256 newPrice) external onlyRole(MARKET_ADMIN_ROLE) {
        BondMarket storage market = _markets[marketId];
        require(market.quoteToken != address(0), "BondingEngine: market does not exist");
        require(market.active, "BondingEngine: market closed");
        require(newPrice > 0, "BondingEngine: zero price");

        market.pricePer1LOB = newPrice;
        emit MarketPriceUpdated(marketId, newPrice);
    }

    // ═══════════════════════════════════════════════════════════════
    //  ADMIN — FUNDING
    // ═══════════════════════════════════════════════════════════════

    function depositLOB(uint256 amount) external onlyRole(MARKET_ADMIN_ROLE) {
        require(amount > 0, "BondingEngine: zero amount");
        lobToken.safeTransferFrom(msg.sender, address(this), amount);
        emit LOBDeposited(msg.sender, amount);
    }

    function withdrawLOB(uint256 amount) external onlyRole(MARKET_ADMIN_ROLE) {
        require(amount > 0, "BondingEngine: zero amount");
        uint256 surplus = lobToken.balanceOf(address(this)) - _totalOutstandingLOB;
        require(amount <= surplus, "BondingEngine: exceeds surplus");

        lobToken.safeTransfer(treasury, amount);
        emit LOBWithdrawn(treasury, amount);
    }

    function sweepQuoteToken(address token) external onlyRole(MARKET_ADMIN_ROLE) {
        require(token != address(lobToken), "BondingEngine: cannot sweep LOB");

        uint256 balance = IERC20(token).balanceOf(address(this));
        require(balance > 0, "BondingEngine: nothing to sweep");

        IERC20(token).safeTransfer(treasury, balance);
        emit QuoteTokenSwept(token, balance);
    }

    // ═══════════════════════════════════════════════════════════════
    //  CORE
    // ═══════════════════════════════════════════════════════════════

    function purchase(
        uint256 marketId,
        uint256 quoteAmount
    ) external nonReentrant whenNotPaused returns (uint256 bondId) {
        require(!sybilGuard.checkBanned(msg.sender), "BondingEngine: banned");
        require(quoteAmount > 0, "BondingEngine: zero quoteAmount");

        BondMarket storage market = _markets[marketId];
        require(market.active, "BondingEngine: market not active");

        uint256 discount = _effectiveDiscount(marketId, msg.sender);
        uint256 discountedPrice = market.pricePer1LOB * (10000 - discount) / 10000;

        // V-003: Use balance-delta to defend against fee-on-transfer tokens
        uint256 balBefore = IERC20(market.quoteToken).balanceOf(address(this));
        IERC20(market.quoteToken).safeTransferFrom(msg.sender, address(this), quoteAmount);
        uint256 received = IERC20(market.quoteToken).balanceOf(address(this)) - balBefore;

        // Calculate payout based on actual tokens received (not nominal quoteAmount)
        uint256 payout = received * 1e18 / discountedPrice;

        require(market.sold + payout <= market.capacity, "BondingEngine: exceeds capacity");
        require(
            _totalOutstandingLOB + payout <= lobToken.balanceOf(address(this)),
            "BondingEngine: insufficient LOB reserve"
        );

        // Per-address cap enforcement
        if (market.addressCap > 0) {
            require(
                _purchased[marketId][msg.sender] + payout <= market.addressCap,
                "BondingEngine: exceeds address cap"
            );
        }
        _purchased[marketId][msg.sender] += payout;

        market.sold += payout;
        _totalOutstandingLOB += payout;

        bondId = _nextBondId++;
        _bonds[bondId] = BondPosition({
            marketId: marketId,
            owner: msg.sender,
            payout: payout,
            claimed: 0,
            vestStart: block.timestamp,
            vestEnd: block.timestamp + market.vestingPeriod
        });
        _userBonds[msg.sender].push(bondId);

        emit BondPurchased(bondId, marketId, msg.sender, received, payout, block.timestamp + market.vestingPeriod);
    }

    function claim(uint256 bondId) external nonReentrant whenNotPaused {
        _claim(bondId);
    }

    function claimMultiple(uint256[] calldata bondIds) external nonReentrant whenNotPaused {
        for (uint256 i = 0; i < bondIds.length; i++) {
            _claim(bondIds[i]);
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  VIEWS
    // ═══════════════════════════════════════════════════════════════

    function getMarket(uint256 marketId) external view returns (BondMarket memory) {
        return _markets[marketId];
    }

    function getBond(uint256 bondId) external view returns (BondPosition memory) {
        return _bonds[bondId];
    }

    function claimable(uint256 bondId) external view returns (uint256) {
        return _claimable(bondId);
    }

    function marketCount() external view returns (uint256) {
        return _nextMarketId - 1;
    }

    function bondCount() external view returns (uint256) {
        return _nextBondId - 1;
    }

    function totalOutstandingLOB() external view returns (uint256) {
        return _totalOutstandingLOB;
    }

    function availableLOB() external view returns (uint256) {
        uint256 balance = lobToken.balanceOf(address(this));
        return balance > _totalOutstandingLOB ? balance - _totalOutstandingLOB : 0;
    }

    function effectiveDiscount(uint256 marketId, address buyer) external view returns (uint256) {
        return _effectiveDiscount(marketId, buyer);
    }

    function getBondsByOwner(address owner) external view returns (uint256[] memory) {
        return _userBonds[owner];
    }

    function purchasedByAddress(uint256 marketId, address buyer) external view returns (uint256) {
        return _purchased[marketId][buyer];
    }

    // ═══════════════════════════════════════════════════════════════
    //  INTERNAL
    // ═══════════════════════════════════════════════════════════════

    function _claim(uint256 bondId) internal {
        BondPosition storage bond = _bonds[bondId];
        require(bond.owner == msg.sender, "BondingEngine: not bond owner");
        require(!sybilGuard.checkBanned(msg.sender), "BondingEngine: banned");

        uint256 amount = _claimable(bondId);
        require(amount > 0, "BondingEngine: nothing claimable");

        bond.claimed += amount;
        _totalOutstandingLOB -= amount;

        lobToken.safeTransfer(msg.sender, amount);
        emit BondClaimed(bondId, msg.sender, amount);
    }

    function _claimable(uint256 bondId) internal view returns (uint256) {
        BondPosition memory bond = _bonds[bondId];
        if (bond.payout == 0) return 0;

        uint256 vested;
        if (block.timestamp >= bond.vestEnd) {
            vested = bond.payout;
        } else {
            uint256 elapsed = block.timestamp - bond.vestStart;
            uint256 duration = bond.vestEnd - bond.vestStart;
            vested = bond.payout * elapsed / duration;
        }
        return vested - bond.claimed;
    }

    function _effectiveDiscount(uint256 marketId, address buyer) internal view returns (uint256) {
        uint256 base = _markets[marketId].discountBps;
        uint256 bonus = _tierBonusBps(buyer);
        uint256 total = base + bonus;
        return total > MAX_DISCOUNT_BPS ? MAX_DISCOUNT_BPS : total;
    }

    function _tierBonusBps(address buyer) internal view returns (uint256) {
        // No tier bonus if buyer has a pending unstake request
        IStakingManager.StakeInfo memory info = stakingManager.getStakeInfo(buyer);
        if (info.unstakeRequestAmount > 0) return 0;

        IStakingManager.Tier tier = stakingManager.getTier(buyer);
        if (tier == IStakingManager.Tier.Platinum) return PLATINUM_BONUS_BPS;
        if (tier == IStakingManager.Tier.Gold) return GOLD_BONUS_BPS;
        if (tier == IStakingManager.Tier.Silver) return SILVER_BONUS_BPS;
        return 0;
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
