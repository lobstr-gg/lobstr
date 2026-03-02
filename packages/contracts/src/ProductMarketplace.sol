// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IServiceRegistry.sol";
import "./interfaces/IEscrowEngine.sol";
import "./interfaces/ISybilGuard.sol";

/// @title ProductMarketplace
/// @notice Physical goods marketplace (eBay/Shopify-style) extending ServiceRegistry + EscrowEngine.
///         Sellers create ServiceRegistry listings (PHYSICAL_TASK category) first, then register
///         product metadata here. Buyers purchase through this contract which acts as a buyer proxy
///         for EscrowEngine (same pattern as X402EscrowBridge). Adds auctions, shipping tracking,
///         and extended dispute/return windows for physical goods.
///
/// @dev Security notes:
///   - V-001 (round 1): pendingWithdrawals keyed by (user, token) — prevents cross-token drain.
///   - V-002 (round 1): buyProduct enforces listing price, not caller-supplied amount.
///   - V-001 (round 2): settlementToken snapshotted in Product and Auction structs at creation
///     time. All auction operations use the snapshot, not live ServiceRegistry reads. Prevents
///     cross-token drain via listing.settlementToken mutation.
///   - V-002 (round 2): buyProduct accepts maxPrice parameter for buyer slippage protection
///     against seller frontrunning ServiceRegistry.updateListing.
contract ProductMarketplace is
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable
{
    using SafeERC20 for IERC20;

    // ═══════════════════════════════════════════════════════════════
    //  ENUMS
    // ═══════════════════════════════════════════════════════════════

    enum ProductCondition { NEW, LIKE_NEW, GOOD, FAIR, POOR, FOR_PARTS }
    enum ListingType { FIXED_PRICE, AUCTION }
    enum ShippingStatus { NOT_SHIPPED, SHIPPED, DELIVERED, RETURN_REQUESTED }

    // ═══════════════════════════════════════════════════════════════
    //  STRUCTS
    // ═══════════════════════════════════════════════════════════════

    struct Product {
        uint256 id;
        uint256 listingId;           // ServiceRegistry listing ID
        address seller;
        ListingType listingType;
        ProductCondition condition;
        string productCategory;
        string shippingInfoURI;
        string imageURI;
        uint256 quantity;
        uint256 sold;
        bool active;
        bool requiresTracking;
        address settlementToken;     // snapshotted at creation — immutable per product
        uint256 price;               // snapshotted at creation — immutable per product
    }

    struct Auction {
        uint256 productId;
        uint256 startPrice;
        uint256 reservePrice;
        uint256 buyNowPrice;
        uint256 startTime;
        uint256 endTime;
        address highBidder;
        uint256 highBid;
        uint256 bidCount;
        bool settled;
        address settlementToken;     // snapshotted at creation — all bids use this token
    }

    struct ShipmentTracking {
        uint256 jobId;
        string carrier;
        string trackingNumber;
        uint256 shippedAt;
        uint256 deliveredAt;
        ShippingStatus status;
    }

    // ═══════════════════════════════════════════════════════════════
    //  CONSTANTS
    // ═══════════════════════════════════════════════════════════════

    uint256 public constant PHYSICAL_DISPUTE_WINDOW = 3 days;
    uint256 public constant RETURN_WINDOW = 7 days;
    uint256 public constant MIN_AUCTION_DURATION = 1 days;
    uint256 public constant MAX_AUCTION_DURATION = 30 days;
    uint256 public constant MIN_BID_INCREMENT_BPS = 500; // 5%
    uint256 public constant ANTI_SNIPE_WINDOW = 10 minutes;
    uint256 public constant ANTI_SNIPE_EXTENSION = 10 minutes;

    // ═══════════════════════════════════════════════════════════════
    //  STATE
    // ═══════════════════════════════════════════════════════════════

    IServiceRegistry public serviceRegistry;
    IEscrowEngine public escrowEngine;
    ISybilGuard public sybilGuard;

    uint256 private _nextProductId;
    uint256 private _nextAuctionId;

    mapping(uint256 => Product) private _products;
    mapping(uint256 => Auction) private _auctions;
    mapping(uint256 => ShipmentTracking) private _shipments;
    mapping(uint256 => uint256) public productAuction;
    mapping(uint256 => uint256) public auctionProduct;

    // Pull-based bid refunds keyed by (user, token)
    mapping(address => mapping(address => uint256)) public pendingWithdrawals;

    mapping(uint256 => address) public jobBuyer;
    mapping(uint256 => uint256) public receiptTimestamp;

    // ═══════════════════════════════════════════════════════════════
    //  EVENTS
    // ═══════════════════════════════════════════════════════════════

    event ProductListed(
        uint256 indexed productId,
        uint256 indexed listingId,
        address indexed seller,
        ListingType listingType,
        ProductCondition condition,
        string productCategory,
        uint256 quantity
    );
    event ProductUpdated(uint256 indexed productId, string imageURI, string shippingInfoURI);
    event ProductDeactivated(uint256 indexed productId);
    event AuctionCreated(
        uint256 indexed auctionId,
        uint256 indexed productId,
        uint256 startPrice,
        uint256 reservePrice,
        uint256 buyNowPrice,
        uint256 endTime
    );
    event BidPlaced(
        uint256 indexed auctionId,
        address indexed bidder,
        uint256 amount,
        uint256 newEndTime
    );
    event AuctionSettled(
        uint256 indexed auctionId,
        address indexed winner,
        uint256 finalPrice,
        uint256 jobId
    );
    event ShipmentTracked(uint256 indexed jobId, string carrier, string trackingNumber);
    event ReceiptConfirmed(uint256 indexed jobId, address indexed buyer);
    event ReturnRequested(uint256 indexed jobId, address indexed buyer, string reason);
    event DamageReported(uint256 indexed jobId, address indexed buyer, string evidenceURI);

    // ═══════════════════════════════════════════════════════════════
    //  INITIALIZER
    // ═══════════════════════════════════════════════════════════════

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _serviceRegistry,
        address _escrowEngine,
        address _sybilGuard
    ) external initializer {
        require(_serviceRegistry != address(0), "ProductMarketplace: zero registry");
        require(_escrowEngine != address(0), "ProductMarketplace: zero escrow");
        require(_sybilGuard != address(0), "ProductMarketplace: zero sybilGuard");

        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();
        __AccessControl_init();
        __ReentrancyGuard_init();
        __Pausable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

        serviceRegistry = IServiceRegistry(_serviceRegistry);
        escrowEngine = IEscrowEngine(_escrowEngine);
        sybilGuard = ISybilGuard(_sybilGuard);

        _nextProductId = 1;
        _nextAuctionId = 1;
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // ═══════════════════════════════════════════════════════════════
    //  LISTING
    // ═══════════════════════════════════════════════════════════════

    /// @notice Register product metadata for an existing ServiceRegistry listing.
    ///         Snapshots settlementToken and price at creation time.
    function createProduct(
        uint256 listingId,
        ProductCondition condition,
        string calldata productCategory,
        string calldata shippingInfoURI,
        string calldata imageURI,
        uint256 quantity,
        bool requiresTracking,
        ListingType listingType
    ) external nonReentrant whenNotPaused returns (uint256 productId) {
        require(quantity > 0, "ProductMarketplace: zero quantity");
        require(bytes(productCategory).length > 0, "ProductMarketplace: empty category");
        require(bytes(imageURI).length > 0, "ProductMarketplace: empty imageURI");

        require(!sybilGuard.checkBanned(msg.sender), "ProductMarketplace: seller banned");

        IServiceRegistry.Listing memory listing = serviceRegistry.getListing(listingId);
        require(listing.active, "ProductMarketplace: listing inactive");
        require(listing.provider == msg.sender, "ProductMarketplace: not listing owner");
        require(listing.category == IServiceRegistry.ServiceCategory.PHYSICAL_TASK,
            "ProductMarketplace: not PHYSICAL_TASK");

        productId = _nextProductId++;

        _products[productId] = Product({
            id: productId,
            listingId: listingId,
            seller: msg.sender,
            listingType: listingType,
            condition: condition,
            productCategory: productCategory,
            shippingInfoURI: shippingInfoURI,
            imageURI: imageURI,
            quantity: quantity,
            sold: 0,
            active: true,
            requiresTracking: requiresTracking,
            settlementToken: listing.settlementToken,
            price: listing.pricePerUnit
        });

        emit ProductListed(productId, listingId, msg.sender, listingType, condition, productCategory, quantity);
    }

    function updateProduct(
        uint256 productId,
        string calldata imageURI,
        string calldata shippingInfoURI
    ) external nonReentrant whenNotPaused {
        Product storage product = _products[productId];
        require(product.seller == msg.sender, "ProductMarketplace: not seller");
        require(product.active, "ProductMarketplace: inactive");

        if (bytes(imageURI).length > 0) product.imageURI = imageURI;
        if (bytes(shippingInfoURI).length > 0) product.shippingInfoURI = shippingInfoURI;

        emit ProductUpdated(productId, imageURI, shippingInfoURI);
    }

    function deactivateProduct(uint256 productId) external nonReentrant whenNotPaused {
        Product storage product = _products[productId];
        require(product.seller == msg.sender, "ProductMarketplace: not seller");
        require(product.active, "ProductMarketplace: already inactive");

        uint256 auctionId = productAuction[productId];
        if (auctionId != 0) {
            Auction storage auction = _auctions[auctionId];
            require(auction.settled || block.timestamp > auction.endTime, "ProductMarketplace: auction active");
        }

        product.active = false;
        emit ProductDeactivated(productId);
    }

    // ═══════════════════════════════════════════════════════════════
    //  FIXED-PRICE PURCHASE
    // ═══════════════════════════════════════════════════════════════

    /// @notice Buy a fixed-price product at the snapshotted price.
    /// @param maxPrice Buyer's maximum acceptable price (slippage protection).
    ///        Reverts if product.price exceeds this. Pass type(uint256).max to skip.
    function buyProduct(
        uint256 productId,
        uint256 maxPrice,
        uint256 deliveryDeadline
    ) external nonReentrant whenNotPaused returns (uint256 jobId) {
        Product storage product = _products[productId];
        require(product.active, "ProductMarketplace: inactive");
        require(product.listingType == ListingType.FIXED_PRICE, "ProductMarketplace: not fixed price");
        require(product.sold < product.quantity, "ProductMarketplace: sold out");
        require(msg.sender != product.seller, "ProductMarketplace: self-purchase");

        require(!sybilGuard.checkBanned(msg.sender), "ProductMarketplace: buyer banned");

        uint256 price = product.price;
        address token = product.settlementToken;

        require(price <= maxPrice, "ProductMarketplace: price exceeds max");

        IERC20(token).safeTransferFrom(msg.sender, address(this), price);

        IERC20(token).forceApprove(address(escrowEngine), price);
        jobId = escrowEngine.createJob(
            product.listingId,
            product.seller,
            price,
            token,
            deliveryDeadline
        );

        jobBuyer[jobId] = msg.sender;
        escrowEngine.setJobPayer(jobId, msg.sender);

        product.sold += 1;

        _shipments[jobId] = ShipmentTracking({
            jobId: jobId,
            carrier: "",
            trackingNumber: "",
            shippedAt: 0,
            deliveredAt: 0,
            status: ShippingStatus.NOT_SHIPPED
        });
    }

    // ═══════════════════════════════════════════════════════════════
    //  AUCTIONS
    // ═══════════════════════════════════════════════════════════════

    /// @notice Create an auction. Snapshots settlementToken from the product.
    function createAuction(
        uint256 productId,
        uint256 startPrice,
        uint256 reservePrice,
        uint256 buyNowPrice,
        uint256 duration
    ) external nonReentrant whenNotPaused returns (uint256 auctionId) {
        Product storage product = _products[productId];
        require(product.seller == msg.sender, "ProductMarketplace: not seller");
        require(product.active, "ProductMarketplace: inactive");
        require(product.listingType == ListingType.AUCTION, "ProductMarketplace: not auction type");
        require(product.sold < product.quantity, "ProductMarketplace: sold out");
        require(productAuction[productId] == 0 || _auctions[productAuction[productId]].settled,
            "ProductMarketplace: auction exists");

        require(startPrice > 0, "ProductMarketplace: zero start price");
        require(duration >= MIN_AUCTION_DURATION, "ProductMarketplace: duration too short");
        require(duration <= MAX_AUCTION_DURATION, "ProductMarketplace: duration too long");
        if (buyNowPrice > 0) {
            require(buyNowPrice > startPrice, "ProductMarketplace: buyNow <= start");
        }

        auctionId = _nextAuctionId++;

        _auctions[auctionId] = Auction({
            productId: productId,
            startPrice: startPrice,
            reservePrice: reservePrice,
            buyNowPrice: buyNowPrice,
            startTime: block.timestamp,
            endTime: block.timestamp + duration,
            highBidder: address(0),
            highBid: 0,
            bidCount: 0,
            settled: false,
            settlementToken: product.settlementToken
        });

        productAuction[productId] = auctionId;
        auctionProduct[auctionId] = productId;

        emit AuctionCreated(auctionId, productId, startPrice, reservePrice, buyNowPrice, block.timestamp + duration);
    }

    /// @notice Place a bid. Uses the auction's snapshotted settlementToken.
    function placeBid(uint256 auctionId, uint256 bidAmount) external nonReentrant whenNotPaused {
        Auction storage auction = _auctions[auctionId];
        require(auction.productId != 0, "ProductMarketplace: auction not found");
        require(!auction.settled, "ProductMarketplace: already settled");
        require(block.timestamp >= auction.startTime, "ProductMarketplace: not started");
        require(block.timestamp < auction.endTime, "ProductMarketplace: ended");

        require(!sybilGuard.checkBanned(msg.sender), "ProductMarketplace: bidder banned");

        address token = auction.settlementToken;

        uint256 balanceBefore = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), bidAmount);
        uint256 received = IERC20(token).balanceOf(address(this)) - balanceBefore;
        require(received > 0, "ProductMarketplace: zero received");

        if (auction.bidCount == 0) {
            require(received >= auction.startPrice, "ProductMarketplace: below start price");
        } else {
            uint256 minBid = auction.highBid + (auction.highBid * MIN_BID_INCREMENT_BPS) / 10000;
            require(received >= minBid, "ProductMarketplace: bid too low");
        }

        if (auction.highBidder != address(0)) {
            pendingWithdrawals[auction.highBidder][token] += auction.highBid;
        }

        auction.highBidder = msg.sender;
        auction.highBid = received;
        auction.bidCount += 1;

        uint256 newEndTime = auction.endTime;
        if (auction.endTime - block.timestamp < ANTI_SNIPE_WINDOW) {
            newEndTime = block.timestamp + ANTI_SNIPE_EXTENSION;
            auction.endTime = newEndTime;
        }

        emit BidPlaced(auctionId, msg.sender, received, newEndTime);
    }

    /// @notice Buy now. Uses the auction's snapshotted settlementToken.
    function buyNow(uint256 auctionId, uint256 deliveryDeadline) external nonReentrant whenNotPaused returns (uint256 jobId) {
        Auction storage auction = _auctions[auctionId];
        require(auction.productId != 0, "ProductMarketplace: auction not found");
        require(!auction.settled, "ProductMarketplace: already settled");
        require(block.timestamp < auction.endTime, "ProductMarketplace: ended");
        require(auction.buyNowPrice > 0, "ProductMarketplace: no buy-now");
        require(auction.highBid < auction.buyNowPrice, "ProductMarketplace: bid exceeds buy-now");

        require(!sybilGuard.checkBanned(msg.sender), "ProductMarketplace: buyer banned");

        Product storage product = _products[auction.productId];
        address token = auction.settlementToken;

        if (auction.highBidder != address(0)) {
            pendingWithdrawals[auction.highBidder][token] += auction.highBid;
        }

        auction.settled = true;
        product.sold += 1;

        IERC20(token).safeTransferFrom(msg.sender, address(this), auction.buyNowPrice);

        IERC20(token).forceApprove(address(escrowEngine), auction.buyNowPrice);
        jobId = escrowEngine.createJob(
            product.listingId,
            product.seller,
            auction.buyNowPrice,
            token,
            deliveryDeadline
        );

        jobBuyer[jobId] = msg.sender;
        escrowEngine.setJobPayer(jobId, msg.sender);

        _shipments[jobId] = ShipmentTracking({
            jobId: jobId, carrier: "", trackingNumber: "",
            shippedAt: 0, deliveredAt: 0, status: ShippingStatus.NOT_SHIPPED
        });

        emit AuctionSettled(auctionId, msg.sender, auction.buyNowPrice, jobId);
    }

    /// @notice Settle auction. Uses the auction's snapshotted settlementToken.
    function settleAuction(uint256 auctionId, uint256 deliveryDeadline) external nonReentrant whenNotPaused returns (uint256 jobId) {
        Auction storage auction = _auctions[auctionId];
        require(auction.productId != 0, "ProductMarketplace: auction not found");
        require(!auction.settled, "ProductMarketplace: already settled");
        require(block.timestamp >= auction.endTime, "ProductMarketplace: not ended");

        auction.settled = true;

        Product storage product = _products[auction.productId];
        address token = auction.settlementToken;

        if (auction.bidCount == 0 || (auction.reservePrice > 0 && auction.highBid < auction.reservePrice)) {
            if (auction.highBidder != address(0)) {
                pendingWithdrawals[auction.highBidder][token] += auction.highBid;
            }
            emit AuctionSettled(auctionId, address(0), 0, 0);
            return 0;
        }

        product.sold += 1;

        IERC20(token).forceApprove(address(escrowEngine), auction.highBid);
        jobId = escrowEngine.createJob(
            product.listingId,
            product.seller,
            auction.highBid,
            token,
            deliveryDeadline
        );

        jobBuyer[jobId] = auction.highBidder;
        escrowEngine.setJobPayer(jobId, auction.highBidder);

        _shipments[jobId] = ShipmentTracking({
            jobId: jobId, carrier: "", trackingNumber: "",
            shippedAt: 0, deliveredAt: 0, status: ShippingStatus.NOT_SHIPPED
        });

        emit AuctionSettled(auctionId, auction.highBidder, auction.highBid, jobId);
    }

    /// @notice Withdraw pending bid refunds for a specific token.
    function withdrawBid(address token) external nonReentrant {
        require(token != address(0), "ProductMarketplace: zero token");
        uint256 amount = pendingWithdrawals[msg.sender][token];
        require(amount > 0, "ProductMarketplace: nothing to withdraw");

        pendingWithdrawals[msg.sender][token] = 0;

        IERC20(token).safeTransfer(msg.sender, amount);
    }

    // ═══════════════════════════════════════════════════════════════
    //  SHIPPING
    // ═══════════════════════════════════════════════════════════════

    function shipProduct(
        uint256 jobId,
        string calldata carrier,
        string calldata trackingNumber
    ) external nonReentrant whenNotPaused {
        IEscrowEngine.Job memory job = escrowEngine.getJob(jobId);
        require(job.seller == msg.sender, "ProductMarketplace: not seller");

        ShipmentTracking storage shipment = _shipments[jobId];
        require(shipment.jobId == jobId, "ProductMarketplace: no shipment");
        require(shipment.status == ShippingStatus.NOT_SHIPPED, "ProductMarketplace: already shipped");
        require(bytes(carrier).length > 0, "ProductMarketplace: empty carrier");
        require(bytes(trackingNumber).length > 0, "ProductMarketplace: empty tracking");

        shipment.carrier = carrier;
        shipment.trackingNumber = trackingNumber;
        shipment.shippedAt = block.timestamp;
        shipment.status = ShippingStatus.SHIPPED;

        emit ShipmentTracked(jobId, carrier, trackingNumber);
    }

    function confirmReceipt(uint256 jobId) external nonReentrant whenNotPaused {
        require(jobBuyer[jobId] == msg.sender, "ProductMarketplace: not buyer");

        ShipmentTracking storage shipment = _shipments[jobId];
        require(shipment.jobId == jobId, "ProductMarketplace: no shipment");

        shipment.deliveredAt = block.timestamp;
        shipment.status = ShippingStatus.DELIVERED;
        receiptTimestamp[jobId] = block.timestamp;

        escrowEngine.confirmDelivery(jobId);
        emit ReceiptConfirmed(jobId, msg.sender);
    }

    // ═══════════════════════════════════════════════════════════════
    //  DISPUTES
    // ═══════════════════════════════════════════════════════════════

    function reportDamaged(uint256 jobId, string calldata evidenceURI) external nonReentrant whenNotPaused {
        require(jobBuyer[jobId] == msg.sender, "ProductMarketplace: not buyer");
        require(bytes(evidenceURI).length > 0, "ProductMarketplace: empty evidence");
        escrowEngine.initiateDispute(jobId, evidenceURI);
        emit DamageReported(jobId, msg.sender, evidenceURI);
    }

    function requestReturn(uint256 jobId, string calldata reason) external nonReentrant whenNotPaused {
        require(jobBuyer[jobId] == msg.sender, "ProductMarketplace: not buyer");
        require(bytes(reason).length > 0, "ProductMarketplace: empty reason");
        uint256 receipt = receiptTimestamp[jobId];
        require(receipt > 0, "ProductMarketplace: not received");
        require(block.timestamp <= receipt + RETURN_WINDOW, "ProductMarketplace: return window closed");
        _shipments[jobId].status = ShippingStatus.RETURN_REQUESTED;
        emit ReturnRequested(jobId, msg.sender, reason);
    }

    // ═══════════════════════════════════════════════════════════════
    //  VIEWS
    // ═══════════════════════════════════════════════════════════════

    function getProduct(uint256 productId) external view returns (Product memory) {
        Product memory product = _products[productId];
        require(product.seller != address(0), "ProductMarketplace: not found");
        return product;
    }

    function getAuction(uint256 auctionId) external view returns (Auction memory) {
        Auction memory auction = _auctions[auctionId];
        require(auction.productId != 0, "ProductMarketplace: not found");
        return auction;
    }

    function getShipment(uint256 jobId) external view returns (ShipmentTracking memory) {
        return _shipments[jobId];
    }

    function nextProductId() external view returns (uint256) { return _nextProductId; }
    function nextAuctionId() external view returns (uint256) { return _nextAuctionId; }

    // ═══════════════════════════════════════════════════════════════
    //  ADMIN
    // ═══════════════════════════════════════════════════════════════

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }
}
