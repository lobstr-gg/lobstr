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
import "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "./interfaces/IServiceRegistry.sol";
import "./interfaces/IEscrowEngine.sol";
import "./interfaces/ISybilGuard.sol";
import "./interfaces/IInsurancePool.sol";

/// @title ProductMarketplaceExtension
/// @notice V2 functions for ProductMarketplace, reached via delegatecall from the main contract's
///         fallback(). Storage layout MUST mirror ProductMarketplace exactly.
///
/// @dev This contract is NOT upgradeable on its own. It is deployed as a plain contract and
///      the main ProductMarketplace proxy delegates unknown selectors to it. Because it runs
///      in the proxy's storage context via delegatecall, the inheritance chain and state variable
///      declarations must be identical to ProductMarketplace.
contract ProductMarketplaceExtension is
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable,
    EIP712Upgradeable
{
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    // ═══════════════════════════════════════════════════════════════
    //  ENUMS  (must match ProductMarketplace)
    // ═══════════════════════════════════════════════════════════════

    enum ProductCondition { NEW, LIKE_NEW, GOOD, FAIR, POOR, FOR_PARTS }
    enum ListingType { FIXED_PRICE, AUCTION }
    enum ShippingStatus { NOT_SHIPPED, SHIPPED, DELIVERED, RETURN_REQUESTED }

    // ═══════════════════════════════════════════════════════════════
    //  STRUCTS  (must match ProductMarketplace)
    // ═══════════════════════════════════════════════════════════════

    struct Product {
        uint256 id;
        uint256 listingId;
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
        address settlementToken;
        uint256 price;
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
        address settlementToken;
    }

    struct ShipmentTracking {
        uint256 jobId;
        string carrier;
        string trackingNumber;
        uint256 shippedAt;
        uint256 deliveredAt;
        ShippingStatus status;
    }

    struct PaymentIntent {
        bytes32 x402Nonce;
        address payer;
        address token;
        uint256 amount;
        uint256 listingId;
        address seller;
        uint256 deadline;
        uint256 deliveryDeadline;
    }

    // ═══════════════════════════════════════════════════════════════
    //  CONSTANTS
    // ═══════════════════════════════════════════════════════════════

    bytes32 public constant FACILITATOR_ROLE = keccak256("FACILITATOR_ROLE");

    bytes32 private constant PAYMENT_INTENT_TYPEHASH = keccak256(
        "PaymentIntent(bytes32 x402Nonce,address token,uint256 amount,uint256 listingId,address seller,uint256 deadline,uint256 deliveryDeadline)"
    );

    uint256 public constant MIN_DELIVERY_DEADLINE = 1 days;
    uint256 public constant MAX_DELIVERY_DEADLINE = 90 days;

    // ═══════════════════════════════════════════════════════════════
    //  STATE  (must match ProductMarketplace exactly, same order)
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

    // ── V2 state ─────────────────────────────────────────────────
    IInsurancePool public insurancePool;
    mapping(uint256 => bool) public jobInsured;
    mapping(bytes32 => bool) public nonceUsed;
    mapping(bytes32 => uint256) public paymentToJob;

    // ── Extension pointer (must match ProductMarketplace) ────────
    address public extension;

    // ═══════════════════════════════════════════════════════════════
    //  EVENTS
    // ═══════════════════════════════════════════════════════════════

    event ProductPurchasedInsured(uint256 indexed productId, uint256 indexed jobId, address indexed buyer, uint256 premium);
    event ProductPurchasedX402(uint256 indexed productId, uint256 indexed jobId, address indexed payer, bytes32 x402Nonce);
    event AuctionSettled(uint256 indexed auctionId, address indexed winner, uint256 finalPrice, uint256 jobId);
    event InsuranceRefundClaimed(uint256 indexed jobId, address indexed buyer, uint256 amount);
    event InsuranceClaimFiled(uint256 indexed jobId, address indexed buyer, uint256 amount);

    // ═══════════════════════════════════════════════════════════════
    //  CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @dev This extension is NOT upgradeable on its own.
    function _authorizeUpgrade(address) internal pure override { revert("not upgradeable"); }

    // ═══════════════════════════════════════════════════════════════
    //  INITIALIZER (V2)
    // ═══════════════════════════════════════════════════════════════

    function initializeV2() external reinitializer(2) {
        __EIP712_init("ProductMarketplace", "1");
    }

    // ═══════════════════════════════════════════════════════════════
    //  ADMIN
    // ═══════════════════════════════════════════════════════════════

    function setInsurancePool(address _insurancePool) external onlyOwner {
        insurancePool = IInsurancePool(_insurancePool);
    }

    // ═══════════════════════════════════════════════════════════════
    //  INSURED PURCHASE
    // ═══════════════════════════════════════════════════════════════

    /// @notice Buy a fixed-price product with insurance via InsurancePool.
    ///         Pulls price + premium from buyer, routes through InsurancePool for escrow insurance.
    function buyProductInsured(
        uint256 productId,
        uint256 maxPrice,
        uint256 deliveryDeadline
    ) external nonReentrant whenNotPaused returns (uint256 jobId) {
        require(address(insurancePool) != address(0), "ProductMarketplace: no insurance pool");
        require(deliveryDeadline >= MIN_DELIVERY_DEADLINE, "ProductMarketplace: deadline too short");
        require(deliveryDeadline <= MAX_DELIVERY_DEADLINE, "ProductMarketplace: deadline too long");

        Product storage product = _products[productId];
        require(product.active, "ProductMarketplace: inactive");
        require(product.listingType == ListingType.FIXED_PRICE, "ProductMarketplace: not fixed price");
        require(product.sold < product.quantity, "ProductMarketplace: sold out");
        require(msg.sender != product.seller, "ProductMarketplace: self-purchase");
        require(!sybilGuard.checkBanned(msg.sender), "ProductMarketplace: buyer banned");

        uint256 price = product.price;
        address token = product.settlementToken;
        require(price <= maxPrice, "ProductMarketplace: price exceeds max");

        uint256 premium = (price * insurancePool.premiumRateBps()) / 10000;
        uint256 totalCost = price + premium;

        _pullExact(token, msg.sender, totalCost);

        uint256 balBefore = IERC20(token).balanceOf(address(this));
        IERC20(token).forceApprove(address(insurancePool), totalCost);
        jobId = insurancePool.createInsuredJob(
            product.listingId, product.seller, price, token, deliveryDeadline
        );
        _verifyOutflow(token, balBefore, totalCost);

        escrowEngine.setJobPayer(jobId, msg.sender);

        jobBuyer[jobId] = msg.sender;
        jobInsured[jobId] = true;
        product.sold += 1;

        _shipments[jobId] = ShipmentTracking({
            jobId: jobId, carrier: "", trackingNumber: "",
            shippedAt: 0, deliveredAt: 0, status: ShippingStatus.NOT_SHIPPED
        });

        emit ProductPurchasedInsured(productId, jobId, msg.sender, premium);
    }

    // ═══════════════════════════════════════════════════════════════
    //  X402 PURCHASE
    // ═══════════════════════════════════════════════════════════════

    /// @notice X402 payment intent purchase. Called by facilitator with payer's EIP-712 signature.
    /// @dev V-001 fix: intent.listingId and intent.seller must match the product to prevent
    ///      facilitator misrouting a signature collected for one listing to a different product.
    function buyProductX402(
        uint256 productId,
        PaymentIntent calldata intent,
        uint8 v, bytes32 r, bytes32 s
    ) external onlyRole(FACILITATOR_ROLE) nonReentrant whenNotPaused returns (uint256 jobId) {
        Product storage product = _products[productId];
        require(product.active, "ProductMarketplace: inactive");
        require(product.listingType == ListingType.FIXED_PRICE, "ProductMarketplace: not fixed price");
        require(product.sold < product.quantity, "ProductMarketplace: sold out");
        require(intent.payer != product.seller, "ProductMarketplace: self-purchase");
        require(intent.amount == product.price, "ProductMarketplace: price mismatch");
        require(intent.token == product.settlementToken, "ProductMarketplace: token mismatch");
        require(intent.listingId == product.listingId, "ProductMarketplace: listing mismatch");
        require(intent.seller == product.seller, "ProductMarketplace: seller mismatch");
        require(block.timestamp <= intent.deadline, "ProductMarketplace: deadline expired");
        require(!nonceUsed[intent.x402Nonce], "ProductMarketplace: nonce used");
        require(intent.deliveryDeadline >= MIN_DELIVERY_DEADLINE, "ProductMarketplace: deadline too short");
        require(intent.deliveryDeadline <= MAX_DELIVERY_DEADLINE, "ProductMarketplace: deadline too long");

        _verifyPaymentIntent(intent, v, r, s);
        nonceUsed[intent.x402Nonce] = true;

        uint256 price = product.price;
        address token = product.settlementToken;

        _pullExact(token, intent.payer, price);

        uint256 balBefore = IERC20(token).balanceOf(address(this));
        IERC20(token).forceApprove(address(escrowEngine), price);
        jobId = escrowEngine.createJob(
            product.listingId, product.seller, price, token, intent.deliveryDeadline
        );
        _verifyOutflow(token, balBefore, price);

        escrowEngine.setJobPayer(jobId, intent.payer);

        jobBuyer[jobId] = intent.payer;
        paymentToJob[intent.x402Nonce] = jobId;
        product.sold += 1;

        _shipments[jobId] = ShipmentTracking({
            jobId: jobId, carrier: "", trackingNumber: "",
            shippedAt: 0, deliveredAt: 0, status: ShippingStatus.NOT_SHIPPED
        });

        emit ProductPurchasedX402(productId, jobId, intent.payer, intent.x402Nonce);
    }

    /// @notice X402 payment intent purchase with insurance.
    /// @dev V-001 fix: intent.listingId and intent.seller must match the product.
    function buyProductX402Insured(
        uint256 productId,
        PaymentIntent calldata intent,
        uint8 v, bytes32 r, bytes32 s
    ) external onlyRole(FACILITATOR_ROLE) nonReentrant whenNotPaused returns (uint256 jobId) {
        require(address(insurancePool) != address(0), "ProductMarketplace: no insurance pool");

        Product storage product = _products[productId];
        require(product.active, "ProductMarketplace: inactive");
        require(product.listingType == ListingType.FIXED_PRICE, "ProductMarketplace: not fixed price");
        require(product.sold < product.quantity, "ProductMarketplace: sold out");
        require(intent.payer != product.seller, "ProductMarketplace: self-purchase");
        require(intent.token == product.settlementToken, "ProductMarketplace: token mismatch");
        require(intent.listingId == product.listingId, "ProductMarketplace: listing mismatch");
        require(intent.seller == product.seller, "ProductMarketplace: seller mismatch");
        require(block.timestamp <= intent.deadline, "ProductMarketplace: deadline expired");
        require(!nonceUsed[intent.x402Nonce], "ProductMarketplace: nonce used");
        require(intent.deliveryDeadline >= MIN_DELIVERY_DEADLINE, "ProductMarketplace: deadline too short");
        require(intent.deliveryDeadline <= MAX_DELIVERY_DEADLINE, "ProductMarketplace: deadline too long");

        uint256 price = product.price;
        uint256 premium = (price * insurancePool.premiumRateBps()) / 10000;
        uint256 totalCost = price + premium;
        require(intent.amount == totalCost, "ProductMarketplace: amount mismatch");

        _verifyPaymentIntent(intent, v, r, s);
        nonceUsed[intent.x402Nonce] = true;

        address token = product.settlementToken;

        _pullExact(token, intent.payer, totalCost);

        uint256 balBefore = IERC20(token).balanceOf(address(this));
        IERC20(token).forceApprove(address(insurancePool), totalCost);
        jobId = insurancePool.createInsuredJob(
            product.listingId, product.seller, price, token, intent.deliveryDeadline
        );
        _verifyOutflow(token, balBefore, totalCost);

        escrowEngine.setJobPayer(jobId, intent.payer);

        jobBuyer[jobId] = intent.payer;
        jobInsured[jobId] = true;
        paymentToJob[intent.x402Nonce] = jobId;
        product.sold += 1;

        _shipments[jobId] = ShipmentTracking({
            jobId: jobId, carrier: "", trackingNumber: "",
            shippedAt: 0, deliveredAt: 0, status: ShippingStatus.NOT_SHIPPED
        });

        emit ProductPurchasedX402(productId, jobId, intent.payer, intent.x402Nonce);
        emit ProductPurchasedInsured(productId, jobId, intent.payer, premium);
    }

    // ═══════════════════════════════════════════════════════════════
    //  INSURED AUCTION SETTLEMENT
    // ═══════════════════════════════════════════════════════════════

    /// @notice Settle auction with insurance. Winning bid routes through InsurancePool.
    ///         Premium is pulled from the winner at settlement time.
    /// @dev V-002 fix: Only the auction winner can call (explicit insurance opt-in).
    ///      V-003 fix: Delivery deadline bounded.
    function settleAuctionInsured(uint256 auctionId, uint256 deliveryDeadline) external nonReentrant whenNotPaused returns (uint256 jobId) {
        require(address(insurancePool) != address(0), "ProductMarketplace: no insurance pool");

        Auction storage auction = _auctions[auctionId];
        require(auction.productId != 0, "ProductMarketplace: auction not found");
        require(!auction.settled, "ProductMarketplace: already settled");
        require(block.timestamp >= auction.endTime, "ProductMarketplace: not ended");
        require(auction.bidCount > 0, "ProductMarketplace: no bids");
        require(auction.reservePrice == 0 || auction.highBid >= auction.reservePrice, "ProductMarketplace: below reserve");
        require(msg.sender == auction.highBidder, "ProductMarketplace: not winner");
        require(deliveryDeadline >= MIN_DELIVERY_DEADLINE, "ProductMarketplace: deadline too short");
        require(deliveryDeadline <= MAX_DELIVERY_DEADLINE, "ProductMarketplace: deadline too long");

        auction.settled = true;

        Product storage product = _products[auction.productId];
        address token = auction.settlementToken;

        product.sold += 1;

        uint256 amount = auction.highBid;
        uint256 premium = (amount * insurancePool.premiumRateBps()) / 10000;

        // Pull premium from winner (bid is already on this contract)
        _pullExact(token, auction.highBidder, premium);

        uint256 balBefore = IERC20(token).balanceOf(address(this));
        IERC20(token).forceApprove(address(insurancePool), amount + premium);
        jobId = insurancePool.createInsuredJob(
            product.listingId, product.seller, amount, token, deliveryDeadline
        );
        _verifyOutflow(token, balBefore, amount + premium);

        escrowEngine.setJobPayer(jobId, auction.highBidder);

        jobBuyer[jobId] = auction.highBidder;
        jobInsured[jobId] = true;

        _shipments[jobId] = ShipmentTracking({
            jobId: jobId, carrier: "", trackingNumber: "",
            shippedAt: 0, deliveredAt: 0, status: ShippingStatus.NOT_SHIPPED
        });

        emit AuctionSettled(auctionId, auction.highBidder, auction.highBid, jobId);
    }

    // ═══════════════════════════════════════════════════════════════
    //  INSURANCE CLAIMS
    // ═══════════════════════════════════════════════════════════════

    /// @notice Real buyer claims their escrow refund from InsurancePool.
    ///         InsurancePool sends tokens to this contract (registered buyer), then forwarded.
    function claimInsuranceRefund(uint256 jobId) external nonReentrant {
        require(jobBuyer[jobId] == msg.sender, "ProductMarketplace: not buyer");
        require(jobInsured[jobId], "ProductMarketplace: not insured");

        IEscrowEngine.Job memory job = escrowEngine.getJob(jobId);
        address token = job.token;

        uint256 balanceBefore = IERC20(token).balanceOf(address(this));
        insurancePool.claimRefund(jobId);
        uint256 received = IERC20(token).balanceOf(address(this)) - balanceBefore;

        if (received > 0) {
            IERC20(token).safeTransfer(msg.sender, received);
        }

        emit InsuranceRefundClaimed(jobId, msg.sender, received);
    }

    /// @notice Real buyer files insurance claim for net loss not covered by escrow refund.
    function fileInsuranceClaim(uint256 jobId) external nonReentrant {
        require(jobBuyer[jobId] == msg.sender, "ProductMarketplace: not buyer");
        require(jobInsured[jobId], "ProductMarketplace: not insured");

        IEscrowEngine.Job memory job = escrowEngine.getJob(jobId);
        address token = job.token;

        uint256 balanceBefore = IERC20(token).balanceOf(address(this));
        insurancePool.fileClaim(jobId);
        uint256 received = IERC20(token).balanceOf(address(this)) - balanceBefore;

        if (received > 0) {
            IERC20(token).safeTransfer(msg.sender, received);
        }

        emit InsuranceClaimFiled(jobId, msg.sender, received);
    }

    // ═══════════════════════════════════════════════════════════════
    //  INTERNAL
    // ═══════════════════════════════════════════════════════════════

    function _verifyPaymentIntent(
        PaymentIntent calldata intent,
        uint8 v, bytes32 r, bytes32 s
    ) internal view {
        bytes32 structHash = keccak256(abi.encode(
            PAYMENT_INTENT_TYPEHASH,
            intent.x402Nonce, intent.token, intent.amount,
            intent.listingId, intent.seller, intent.deadline, intent.deliveryDeadline
        ));
        address signer = _hashTypedDataV4(structHash).recover(v, r, s);
        require(signer == intent.payer, "ProductMarketplace: invalid signature");
    }

    /// @dev V-002 fix: Pull exact amount, revert on fee-on-transfer shortfall.
    function _pullExact(address token, address from, uint256 amount) internal {
        uint256 bal = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(from, address(this), amount);
        require(
            IERC20(token).balanceOf(address(this)) - bal == amount,
            "ProductMarketplace: transfer shortfall"
        );
    }

    /// @dev V-002 fix: Verify exactly `amount` left this contract during an external call.
    function _verifyOutflow(address token, uint256 balBefore, uint256 amount) internal view {
        require(
            balBefore - IERC20(token).balanceOf(address(this)) == amount,
            "ProductMarketplace: funding mismatch"
        );
    }
}
