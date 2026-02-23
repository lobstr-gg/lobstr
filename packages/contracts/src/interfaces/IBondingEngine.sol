// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IBondingEngine {
    struct BondMarket {
        address quoteToken;
        uint256 pricePer1LOB;
        uint256 discountBps;
        uint256 vestingPeriod;
        uint256 capacity;
        uint256 sold;
        bool active;
        uint256 addressCap; // max LOB payout per address per market (0 = unlimited)
    }

    struct BondPosition {
        uint256 marketId;
        address owner;
        uint256 payout;
        uint256 claimed;
        uint256 vestStart;
        uint256 vestEnd;
    }

    event MarketCreated(
        uint256 indexed marketId,
        address indexed quoteToken,
        uint256 pricePer1LOB,
        uint256 discountBps,
        uint256 vestingPeriod,
        uint256 capacity
    );
    event MarketClosed(uint256 indexed marketId);
    event MarketPriceUpdated(uint256 indexed marketId, uint256 newPrice);
    event LOBDeposited(address indexed from, uint256 amount);
    event LOBWithdrawn(address indexed to, uint256 amount);
    event QuoteTokenSwept(address indexed token, uint256 amount);
    event BondPurchased(
        uint256 indexed bondId,
        uint256 indexed marketId,
        address indexed buyer,
        uint256 quoteAmount,
        uint256 payout,
        uint256 vestEnd
    );
    event BondClaimed(uint256 indexed bondId, address indexed owner, uint256 amount);

    // Admin — Markets
    function createMarket(
        address quoteToken,
        uint256 pricePer1LOB,
        uint256 discountBps,
        uint256 vestingPeriod,
        uint256 capacity,
        uint256 addressCap
    ) external returns (uint256 marketId);
    function closeMarket(uint256 marketId) external;
    function updateMarketPrice(uint256 marketId, uint256 newPrice) external;

    // Admin — Funding
    function depositLOB(uint256 amount) external;
    function withdrawLOB(uint256 amount) external;
    function sweepQuoteToken(address token) external;

    // Core
    function purchase(uint256 marketId, uint256 quoteAmount) external returns (uint256 bondId);
    function claim(uint256 bondId) external;
    function claimMultiple(uint256[] calldata bondIds) external;

    // Views
    function getMarket(uint256 marketId) external view returns (BondMarket memory);
    function getBond(uint256 bondId) external view returns (BondPosition memory);
    function claimable(uint256 bondId) external view returns (uint256);
    function marketCount() external view returns (uint256);
    function bondCount() external view returns (uint256);
    function totalOutstandingLOB() external view returns (uint256);
    function availableLOB() external view returns (uint256);
    function effectiveDiscount(uint256 marketId, address buyer) external view returns (uint256);
    function getBondsByOwner(address owner) external view returns (uint256[] memory);
    function purchasedByAddress(uint256 marketId, address buyer) external view returns (uint256);
}
