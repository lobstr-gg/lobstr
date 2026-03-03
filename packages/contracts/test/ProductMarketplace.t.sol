// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "./helpers/ProxyTestHelper.sol";
import "../src/ProductMarketplace.sol";
import "../src/ProductMarketplaceExtension.sol";
import "../src/ServiceRegistry.sol";
import "../src/EscrowEngine.sol";
import "../src/ReputationSystem.sol";
import "../src/StakingManager.sol";
import "../src/DisputeArbitration.sol";
import "../src/InsurancePool.sol";
import "../src/LOBToken.sol";

contract MockSybilGuardPM {
    mapping(address => bool) private _banned;

    function checkBanned(address account) external view returns (bool) {
        return _banned[account];
    }

    function checkAnyBanned(address[] calldata) external pure returns (bool) {
        return false;
    }

    function setBanned(address account, bool banned) external {
        _banned[account] = banned;
    }
}

contract MockRewardDistributorPM {
    function creditArbitratorReward(address, address, uint256) external {}
    function creditWatcherReward(address, address, uint256) external {}
    function creditJudgeReward(address, address, uint256) external {}
    function deposit(address, uint256) external {}
    function availableBudget(address) external pure returns (uint256) {
        return type(uint256).max;
    }
}

contract ProductMarketplaceTest is Test, ProxyTestHelper {
    // Re-declare events for vm.expectEmit
    event ProductListed(
        uint256 indexed productId,
        uint256 indexed listingId,
        address indexed seller,
        ProductMarketplace.ListingType listingType,
        ProductMarketplace.ProductCondition condition,
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
    event BidPlaced(uint256 indexed auctionId, address indexed bidder, uint256 amount, uint256 newEndTime);
    event AuctionSettled(uint256 indexed auctionId, address indexed winner, uint256 finalPrice, uint256 jobId);
    event ShipmentTracked(uint256 indexed jobId, string carrier, string trackingNumber);
    event ReceiptConfirmed(uint256 indexed jobId, address indexed buyer);
    event ReturnRequested(uint256 indexed jobId, address indexed buyer, string reason);

    LOBToken public token;
    StakingManager public staking;
    ReputationSystem public reputation;
    ServiceRegistry public registry;
    DisputeArbitration public dispute;
    EscrowEngine public escrow;
    InsurancePool public insurance;
    ProductMarketplace public marketplace;
    ProductMarketplaceExtension public marketplaceExt; // V2 functions accessed via this cast
    MockSybilGuardPM public mockSybilGuard;
    MockRewardDistributorPM public mockRewardDist;

    address public admin = makeAddr("admin");
    address public distributor = makeAddr("distributor");
    address public treasury = makeAddr("treasury");
    address public buyer = makeAddr("buyer");
    address public seller = makeAddr("seller");
    address public bidder1 = makeAddr("bidder1");
    address public bidder2 = makeAddr("bidder2");
    address public facilitator = makeAddr("facilitator");

    // X402 payer with known private key for EIP-712 signing
    uint256 internal constant PAYER_PK = 0xA11CE;
    address public payer = vm.addr(PAYER_PK);

    function setUp() public {
        vm.startPrank(admin);

        // Deploy core contracts
        token = LOBToken(_deployProxy(address(new LOBToken()), abi.encodeCall(LOBToken.initialize, (distributor))));
        reputation = ReputationSystem(_deployProxy(address(new ReputationSystem()), abi.encodeCall(ReputationSystem.initialize, ())));
        staking = StakingManager(_deployProxy(address(new StakingManager()), abi.encodeCall(StakingManager.initialize, (address(token)))));
        mockSybilGuard = new MockSybilGuardPM();
        mockRewardDist = new MockRewardDistributorPM();
        registry = ServiceRegistry(_deployProxy(address(new ServiceRegistry()), abi.encodeCall(ServiceRegistry.initialize, (address(staking), address(reputation), address(mockSybilGuard)))));
        dispute = DisputeArbitration(_deployProxy(address(new DisputeArbitration()), abi.encodeCall(DisputeArbitration.initialize, (address(token), address(staking), address(reputation), address(mockSybilGuard), address(mockRewardDist)))));
        escrow = EscrowEngine(_deployProxy(address(new EscrowEngine()), abi.encodeCall(EscrowEngine.initialize, (
            address(token),
            address(registry),
            address(staking),
            address(dispute),
            address(reputation),
            treasury,
            address(mockSybilGuard)
        ))));

        // Deploy InsurancePool
        insurance = InsurancePool(_deployProxy(address(new InsurancePool()), abi.encodeCall(InsurancePool.initialize, (
            address(token),
            address(escrow),
            address(dispute),
            address(reputation),
            address(staking),
            address(mockSybilGuard),
            address(registry),
            treasury,
            admin
        ))));

        // Deploy ProductMarketplace with extension
        address proxyAddr = _deployProxy(
            address(new ProductMarketplace()),
            abi.encodeCall(ProductMarketplace.initialize, (
                address(registry),
                address(escrow),
                address(mockSybilGuard)
            ))
        );
        marketplace = ProductMarketplace(payable(proxyAddr));
        marketplaceExt = ProductMarketplaceExtension(payable(proxyAddr));

        // Deploy and wire extension
        ProductMarketplaceExtension ext = new ProductMarketplaceExtension();
        marketplace.setExtension(address(ext));

        // Initialize V2 (EIP-712) — routed via fallback to extension
        marketplaceExt.initializeV2();

        // Wire insurance pool — routed via fallback to extension
        marketplaceExt.setInsurancePool(address(insurance));

        // Grant roles
        reputation.grantRole(reputation.RECORDER_ROLE(), address(escrow));
        reputation.grantRole(reputation.RECORDER_ROLE(), address(dispute));
        staking.grantRole(staking.SLASHER_ROLE(), address(dispute));
        dispute.grantRole(dispute.ESCROW_ROLE(), address(escrow));
        dispute.setEscrowEngine(address(escrow));

        // Grant facilitator role for X402 tests
        marketplace.grantRole(marketplace.FACILITATOR_ROLE(), facilitator);

        vm.stopPrank();

        // Fund participants
        vm.startPrank(distributor);
        token.transfer(buyer, 500_000 ether);
        token.transfer(seller, 500_000 ether);
        token.transfer(bidder1, 500_000 ether);
        token.transfer(bidder2, 500_000 ether);
        token.transfer(payer, 500_000 ether);
        vm.stopPrank();

        // Seed insurance pool with liquidity for claims
        vm.startPrank(distributor);
        token.approve(address(insurance), 100_000 ether);
        insurance.depositToPool(100_000 ether);
        vm.stopPrank();

        // Seller stakes (Silver tier — 1,000 LOB)
        vm.startPrank(seller);
        token.approve(address(staking), 1_000 ether);
        staking.stake(1_000 ether);
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════
    //  HELPERS
    // ═══════════════════════════════════════════════════════════════

    function _createFixedPriceProduct() internal returns (uint256 productId) {
        vm.startPrank(seller);
        uint256 listingId = registry.createListing(
            IServiceRegistry.ServiceCategory.PHYSICAL_TASK,
            "iPhone 15 Pro",
            "Brand new, sealed box",
            500 ether,
            address(token),
            7 days,
            "ipfs://shipping-info"
        );
        productId = marketplace.createProduct(
            listingId,
            ProductMarketplace.ProductCondition.NEW,
            "electronics",
            "ipfs://shipping-info",
            "ipfs://product-images",
            1,
            true,
            ProductMarketplace.ListingType.FIXED_PRICE
        );
        vm.stopPrank();
    }

    function _createAuctionProduct() internal returns (uint256 productId) {
        vm.startPrank(seller);
        uint256 listingId = registry.createListing(
            IServiceRegistry.ServiceCategory.PHYSICAL_TASK,
            "RTX 4090 GPU",
            "Used, excellent condition",
            1000 ether,
            address(token),
            7 days,
            "ipfs://gpu-shipping"
        );
        productId = marketplace.createProduct(
            listingId,
            ProductMarketplace.ProductCondition.LIKE_NEW,
            "computing",
            "ipfs://gpu-shipping",
            "ipfs://gpu-images",
            1,
            true,
            ProductMarketplace.ListingType.AUCTION
        );
        vm.stopPrank();
    }

    /// @dev Round 2 V-002 fix: buyProduct takes maxPrice for slippage protection
    function _buyFixedPrice(uint256 productId) internal returns (uint256 jobId) {
        ProductMarketplace.Product memory product = marketplace.getProduct(productId);

        vm.startPrank(buyer);
        token.approve(address(marketplace), product.price);
        jobId = marketplace.buyProduct(productId, product.price, 7 days);
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════
    //  PRODUCT LISTING TESTS
    // ═══════════════════════════════════════════════════════════════

    function test_CreateProduct_FixedPrice() public {
        uint256 productId = _createFixedPriceProduct();

        ProductMarketplace.Product memory product = marketplace.getProduct(productId);
        assertEq(product.id, 1);
        assertEq(product.seller, seller);
        assertTrue(product.active);
        assertEq(uint256(product.listingType), uint256(ProductMarketplace.ListingType.FIXED_PRICE));
        assertEq(uint256(product.condition), uint256(ProductMarketplace.ProductCondition.NEW));
        assertEq(product.productCategory, "electronics");
        assertEq(product.quantity, 1);
        assertEq(product.sold, 0);
        assertTrue(product.requiresTracking);

        IServiceRegistry.Listing memory listing = registry.getListing(product.listingId);
        assertEq(listing.provider, seller);
        assertEq(uint256(listing.category), uint256(IServiceRegistry.ServiceCategory.PHYSICAL_TASK));
        assertEq(listing.pricePerUnit, 500 ether);
        assertTrue(listing.active);
    }

    function test_CreateProduct_AuctionType() public {
        uint256 productId = _createAuctionProduct();
        ProductMarketplace.Product memory product = marketplace.getProduct(productId);
        assertEq(uint256(product.listingType), uint256(ProductMarketplace.ListingType.AUCTION));
        assertEq(uint256(product.condition), uint256(ProductMarketplace.ProductCondition.LIKE_NEW));
    }

    function test_CreateProduct_RevertBanned() public {
        vm.prank(seller);
        uint256 listingId = registry.createListing(
            IServiceRegistry.ServiceCategory.PHYSICAL_TASK,
            "iPhone", "desc", 500 ether, address(token), 7 days, ""
        );
        mockSybilGuard.setBanned(seller, true);
        vm.prank(seller);
        vm.expectRevert("ProductMarketplace: seller banned");
        marketplace.createProduct(listingId, ProductMarketplace.ProductCondition.NEW, "electronics", "ipfs://s", "ipfs://i", 1, true, ProductMarketplace.ListingType.FIXED_PRICE);
    }

    function test_CreateProduct_RevertZeroQuantity() public {
        vm.prank(seller);
        uint256 listingId = registry.createListing(IServiceRegistry.ServiceCategory.PHYSICAL_TASK, "iPhone", "desc", 500 ether, address(token), 7 days, "");
        vm.prank(seller);
        vm.expectRevert("ProductMarketplace: zero quantity");
        marketplace.createProduct(listingId, ProductMarketplace.ProductCondition.NEW, "electronics", "ipfs://s", "ipfs://i", 0, true, ProductMarketplace.ListingType.FIXED_PRICE);
    }

    function test_CreateProduct_RevertNotListingOwner() public {
        vm.prank(seller);
        uint256 listingId = registry.createListing(IServiceRegistry.ServiceCategory.PHYSICAL_TASK, "iPhone", "desc", 500 ether, address(token), 7 days, "");
        vm.prank(buyer);
        vm.expectRevert("ProductMarketplace: not listing owner");
        marketplace.createProduct(listingId, ProductMarketplace.ProductCondition.NEW, "electronics", "ipfs://s", "ipfs://i", 1, true, ProductMarketplace.ListingType.FIXED_PRICE);
    }

    function test_UpdateProduct() public {
        uint256 productId = _createFixedPriceProduct();
        vm.prank(seller);
        marketplace.updateProduct(productId, "ipfs://new-images", "ipfs://new-shipping");
        ProductMarketplace.Product memory product = marketplace.getProduct(productId);
        assertEq(product.imageURI, "ipfs://new-images");
        assertEq(product.shippingInfoURI, "ipfs://new-shipping");
    }

    function test_UpdateProduct_RevertNotSeller() public {
        uint256 productId = _createFixedPriceProduct();
        vm.prank(buyer);
        vm.expectRevert("ProductMarketplace: not seller");
        marketplace.updateProduct(productId, "ipfs://new-images", "");
    }

    function test_DeactivateProduct() public {
        uint256 productId = _createFixedPriceProduct();
        vm.prank(seller);
        marketplace.deactivateProduct(productId);
        ProductMarketplace.Product memory product = marketplace.getProduct(productId);
        assertFalse(product.active);
    }

    // ═══════════════════════════════════════════════════════════════
    //  FIXED-PRICE PURCHASE TESTS (V-002: price enforced from listing)
    // ═══════════════════════════════════════════════════════════════

    function test_BuyProduct() public {
        uint256 productId = _createFixedPriceProduct();
        uint256 jobId = _buyFixedPrice(productId);
        assertGt(jobId, 0);
        ProductMarketplace.Product memory product = marketplace.getProduct(productId);
        assertEq(product.sold, 1);
        assertEq(marketplace.jobBuyer(jobId), buyer);
        ProductMarketplace.ShipmentTracking memory shipment = marketplace.getShipment(jobId);
        assertEq(shipment.jobId, jobId);
        assertEq(uint256(shipment.status), uint256(ProductMarketplace.ShippingStatus.NOT_SHIPPED));
    }

    function test_BuyProduct_RevertInactive() public {
        uint256 productId = _createFixedPriceProduct();
        vm.prank(seller);
        marketplace.deactivateProduct(productId);
        vm.startPrank(buyer);
        token.approve(address(marketplace), 500 ether);
        vm.expectRevert("ProductMarketplace: inactive");
        marketplace.buyProduct(productId, type(uint256).max, 7 days);
        vm.stopPrank();
    }

    function test_BuyProduct_RevertSoldOut() public {
        uint256 productId = _createFixedPriceProduct();
        _buyFixedPrice(productId);
        vm.startPrank(buyer);
        token.approve(address(marketplace), 500 ether);
        vm.expectRevert("ProductMarketplace: sold out");
        marketplace.buyProduct(productId, type(uint256).max, 7 days);
        vm.stopPrank();
    }

    function test_BuyProduct_RevertBannedBuyer() public {
        uint256 productId = _createFixedPriceProduct();
        mockSybilGuard.setBanned(buyer, true);
        vm.startPrank(buyer);
        token.approve(address(marketplace), 500 ether);
        vm.expectRevert("ProductMarketplace: buyer banned");
        marketplace.buyProduct(productId, type(uint256).max, 7 days);
        vm.stopPrank();
    }

    function test_BuyProduct_RevertSelfPurchase() public {
        uint256 productId = _createFixedPriceProduct();
        vm.startPrank(seller);
        token.approve(address(marketplace), 500 ether);
        vm.expectRevert("ProductMarketplace: self-purchase");
        marketplace.buyProduct(productId, type(uint256).max, 7 days);
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════
    //  AUCTION TESTS
    // ═══════════════════════════════════════════════════════════════

    function test_CreateAuction() public {
        uint256 productId = _createAuctionProduct();
        vm.prank(seller);
        uint256 auctionId = marketplace.createAuction(productId, 100 ether, 500 ether, 2000 ether, 7 days);
        ProductMarketplace.Auction memory auction = marketplace.getAuction(auctionId);
        assertEq(auction.productId, productId);
        assertEq(auction.startPrice, 100 ether);
        assertEq(auction.reservePrice, 500 ether);
        assertEq(auction.buyNowPrice, 2000 ether);
        assertEq(auction.endTime, block.timestamp + 7 days);
        assertFalse(auction.settled);
        assertEq(auction.bidCount, 0);
    }

    function test_CreateAuction_RevertNotSeller() public {
        uint256 productId = _createAuctionProduct();
        vm.prank(buyer);
        vm.expectRevert("ProductMarketplace: not seller");
        marketplace.createAuction(productId, 100 ether, 0, 0, 7 days);
    }

    function test_CreateAuction_RevertDurationTooShort() public {
        uint256 productId = _createAuctionProduct();
        vm.prank(seller);
        vm.expectRevert("ProductMarketplace: duration too short");
        marketplace.createAuction(productId, 100 ether, 0, 0, 12 hours);
    }

    function test_CreateAuction_RevertDurationTooLong() public {
        uint256 productId = _createAuctionProduct();
        vm.prank(seller);
        vm.expectRevert("ProductMarketplace: duration too long");
        marketplace.createAuction(productId, 100 ether, 0, 0, 31 days);
    }

    function test_PlaceBid() public {
        uint256 productId = _createAuctionProduct();
        vm.prank(seller);
        uint256 auctionId = marketplace.createAuction(productId, 100 ether, 0, 0, 7 days);
        vm.startPrank(bidder1);
        token.approve(address(marketplace), 150 ether);
        marketplace.placeBid(auctionId, 150 ether);
        vm.stopPrank();
        ProductMarketplace.Auction memory auction = marketplace.getAuction(auctionId);
        assertEq(auction.highBidder, bidder1);
        assertEq(auction.highBid, 150 ether);
        assertEq(auction.bidCount, 1);
    }

    function test_PlaceBid_RevertBelowStartPrice() public {
        uint256 productId = _createAuctionProduct();
        vm.prank(seller);
        uint256 auctionId = marketplace.createAuction(productId, 100 ether, 0, 0, 7 days);
        vm.startPrank(bidder1);
        token.approve(address(marketplace), 50 ether);
        vm.expectRevert("ProductMarketplace: below start price");
        marketplace.placeBid(auctionId, 50 ether);
        vm.stopPrank();
    }

    /// @dev V-001 fix: pendingWithdrawals now keyed by (user, token)
    function test_PlaceBid_MultipleBids_RefundsPreviousBidder() public {
        uint256 productId = _createAuctionProduct();
        vm.prank(seller);
        uint256 auctionId = marketplace.createAuction(productId, 100 ether, 0, 0, 7 days);

        vm.startPrank(bidder1);
        token.approve(address(marketplace), 150 ether);
        marketplace.placeBid(auctionId, 150 ether);
        vm.stopPrank();

        vm.startPrank(bidder2);
        token.approve(address(marketplace), 200 ether);
        marketplace.placeBid(auctionId, 200 ether);
        vm.stopPrank();

        // V-001 fix: check with (bidder, token) key
        assertEq(marketplace.pendingWithdrawals(bidder1, address(token)), 150 ether);

        uint256 balBefore = token.balanceOf(bidder1);
        vm.prank(bidder1);
        marketplace.withdrawBid(address(token));
        assertEq(token.balanceOf(bidder1), balBefore + 150 ether);
        assertEq(marketplace.pendingWithdrawals(bidder1, address(token)), 0);
    }

    function test_PlaceBid_RevertBidTooLow() public {
        uint256 productId = _createAuctionProduct();
        vm.prank(seller);
        uint256 auctionId = marketplace.createAuction(productId, 100 ether, 0, 0, 7 days);
        vm.startPrank(bidder1);
        token.approve(address(marketplace), 100 ether);
        marketplace.placeBid(auctionId, 100 ether);
        vm.stopPrank();
        vm.startPrank(bidder2);
        token.approve(address(marketplace), 102 ether);
        vm.expectRevert("ProductMarketplace: bid too low");
        marketplace.placeBid(auctionId, 102 ether);
        vm.stopPrank();
    }

    function test_PlaceBid_AntiSnipe() public {
        uint256 productId = _createAuctionProduct();
        vm.prank(seller);
        uint256 auctionId = marketplace.createAuction(productId, 100 ether, 0, 0, 1 days);
        ProductMarketplace.Auction memory auctionBefore = marketplace.getAuction(auctionId);
        uint256 originalEnd = auctionBefore.endTime;
        vm.warp(originalEnd - 5 minutes);
        vm.startPrank(bidder1);
        token.approve(address(marketplace), 150 ether);
        marketplace.placeBid(auctionId, 150 ether);
        vm.stopPrank();
        ProductMarketplace.Auction memory auctionAfter = marketplace.getAuction(auctionId);
        assertEq(auctionAfter.endTime, block.timestamp + 10 minutes);
        assertGt(auctionAfter.endTime, originalEnd);
    }

    function test_PlaceBid_RevertAfterEnd() public {
        uint256 productId = _createAuctionProduct();
        vm.prank(seller);
        uint256 auctionId = marketplace.createAuction(productId, 100 ether, 0, 0, 1 days);
        vm.warp(block.timestamp + 2 days);
        vm.startPrank(bidder1);
        token.approve(address(marketplace), 150 ether);
        vm.expectRevert("ProductMarketplace: ended");
        marketplace.placeBid(auctionId, 150 ether);
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════
    //  AUCTION SETTLEMENT TESTS
    // ═══════════════════════════════════════════════════════════════

    function test_SettleAuction_ReserveMet() public {
        uint256 productId = _createAuctionProduct();
        vm.prank(seller);
        uint256 auctionId = marketplace.createAuction(productId, 100 ether, 500 ether, 0, 1 days);
        vm.startPrank(bidder1);
        token.approve(address(marketplace), 600 ether);
        marketplace.placeBid(auctionId, 600 ether);
        vm.stopPrank();
        vm.warp(block.timestamp + 2 days);
        vm.prank(bidder1);
        uint256 jobId = marketplace.settleAuction(auctionId, 7 days);
        assertGt(jobId, 0);
        ProductMarketplace.Auction memory auction = marketplace.getAuction(auctionId);
        assertTrue(auction.settled);
        ProductMarketplace.Product memory product = marketplace.getProduct(productId);
        assertEq(product.sold, 1);
        assertEq(marketplace.jobBuyer(jobId), bidder1);
    }

    function test_SettleAuction_BelowReserve_Refunds() public {
        uint256 productId = _createAuctionProduct();
        vm.prank(seller);
        uint256 auctionId = marketplace.createAuction(productId, 100 ether, 500 ether, 0, 1 days);
        vm.startPrank(bidder1);
        token.approve(address(marketplace), 200 ether);
        marketplace.placeBid(auctionId, 200 ether);
        vm.stopPrank();
        vm.warp(block.timestamp + 2 days);
        uint256 jobId = marketplace.settleAuction(auctionId, 7 days);
        assertEq(jobId, 0);
        // V-001 fix: keyed by (bidder, token)
        assertEq(marketplace.pendingWithdrawals(bidder1, address(token)), 200 ether);
    }

    function test_SettleAuction_NoBids() public {
        uint256 productId = _createAuctionProduct();
        vm.prank(seller);
        uint256 auctionId = marketplace.createAuction(productId, 100 ether, 0, 0, 1 days);
        vm.warp(block.timestamp + 2 days);
        uint256 jobId = marketplace.settleAuction(auctionId, 7 days);
        assertEq(jobId, 0);
        assertTrue(marketplace.getAuction(auctionId).settled);
    }

    function test_SettleAuction_RevertNotEnded() public {
        uint256 productId = _createAuctionProduct();
        vm.prank(seller);
        marketplace.createAuction(productId, 100 ether, 0, 0, 7 days);
        vm.expectRevert("ProductMarketplace: not ended");
        marketplace.settleAuction(1, 7 days);
    }

    // ═══════════════════════════════════════════════════════════════
    //  BUY NOW TESTS
    // ═══════════════════════════════════════════════════════════════

    function test_BuyNow() public {
        uint256 productId = _createAuctionProduct();
        vm.prank(seller);
        uint256 auctionId = marketplace.createAuction(productId, 100 ether, 0, 2000 ether, 7 days);
        vm.startPrank(buyer);
        token.approve(address(marketplace), 2000 ether);
        uint256 jobId = marketplace.buyNow(auctionId, 7 days);
        vm.stopPrank();
        assertGt(jobId, 0);
        assertTrue(marketplace.getAuction(auctionId).settled);
        assertEq(marketplace.jobBuyer(jobId), buyer);
    }

    function test_BuyNow_RefundsPreviousBidder() public {
        uint256 productId = _createAuctionProduct();
        vm.prank(seller);
        uint256 auctionId = marketplace.createAuction(productId, 100 ether, 0, 2000 ether, 7 days);
        vm.startPrank(bidder1);
        token.approve(address(marketplace), 150 ether);
        marketplace.placeBid(auctionId, 150 ether);
        vm.stopPrank();
        vm.startPrank(buyer);
        token.approve(address(marketplace), 2000 ether);
        marketplace.buyNow(auctionId, 7 days);
        vm.stopPrank();
        // V-001 fix: keyed by (bidder, token)
        assertEq(marketplace.pendingWithdrawals(bidder1, address(token)), 150 ether);
    }

    function test_BuyNow_RevertNoBuyNow() public {
        uint256 productId = _createAuctionProduct();
        vm.prank(seller);
        marketplace.createAuction(productId, 100 ether, 0, 0, 7 days);
        vm.startPrank(buyer);
        vm.expectRevert("ProductMarketplace: no buy-now");
        marketplace.buyNow(1, 7 days);
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════
    //  SHIPPING TESTS
    // ═══════════════════════════════════════════════════════════════

    function test_ShipProduct() public {
        uint256 productId = _createFixedPriceProduct();
        uint256 jobId = _buyFixedPrice(productId);
        vm.prank(seller);
        marketplace.shipProduct(jobId, "ups", "1Z999AA10123456784");
        ProductMarketplace.ShipmentTracking memory shipment = marketplace.getShipment(jobId);
        assertEq(shipment.carrier, "ups");
        assertEq(shipment.trackingNumber, "1Z999AA10123456784");
        assertGt(shipment.shippedAt, 0);
        assertEq(uint256(shipment.status), uint256(ProductMarketplace.ShippingStatus.SHIPPED));
    }

    function test_ShipProduct_RevertNotSeller() public {
        uint256 productId = _createFixedPriceProduct();
        uint256 jobId = _buyFixedPrice(productId);
        vm.prank(buyer);
        vm.expectRevert("ProductMarketplace: not seller");
        marketplace.shipProduct(jobId, "ups", "1Z999");
    }

    function test_ShipProduct_RevertAlreadyShipped() public {
        uint256 productId = _createFixedPriceProduct();
        uint256 jobId = _buyFixedPrice(productId);
        vm.startPrank(seller);
        marketplace.shipProduct(jobId, "ups", "1Z999");
        vm.expectRevert("ProductMarketplace: already shipped");
        marketplace.shipProduct(jobId, "fedex", "FX123");
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════
    //  CONFIRM RECEIPT TESTS
    // ═══════════════════════════════════════════════════════════════

    function test_ConfirmReceipt() public {
        uint256 productId = _createFixedPriceProduct();
        uint256 jobId = _buyFixedPrice(productId);
        vm.prank(seller);
        marketplace.shipProduct(jobId, "ups", "1Z999");
        vm.prank(seller);
        escrow.submitDelivery(jobId, "ipfs://delivery-proof");
        vm.prank(buyer);
        marketplace.confirmReceipt(jobId);
        ProductMarketplace.ShipmentTracking memory shipment = marketplace.getShipment(jobId);
        assertEq(uint256(shipment.status), uint256(ProductMarketplace.ShippingStatus.DELIVERED));
        assertGt(shipment.deliveredAt, 0);
        assertGt(marketplace.receiptTimestamp(jobId), 0);
    }

    function test_ConfirmReceipt_RevertNotBuyer() public {
        uint256 productId = _createFixedPriceProduct();
        uint256 jobId = _buyFixedPrice(productId);
        vm.prank(seller);
        marketplace.shipProduct(jobId, "ups", "1Z999");
        vm.prank(seller);
        escrow.submitDelivery(jobId, "ipfs://delivery-proof");
        vm.prank(bidder1);
        vm.expectRevert("ProductMarketplace: not buyer");
        marketplace.confirmReceipt(jobId);
    }

    // ═══════════════════════════════════════════════════════════════
    //  RETURN REQUEST TESTS
    // ═══════════════════════════════════════════════════════════════

    function test_RequestReturn() public {
        uint256 productId = _createFixedPriceProduct();
        uint256 jobId = _buyFixedPrice(productId);
        vm.prank(seller);
        marketplace.shipProduct(jobId, "ups", "1Z999");
        vm.prank(seller);
        escrow.submitDelivery(jobId, "ipfs://delivery-proof");
        vm.prank(buyer);
        marketplace.confirmReceipt(jobId);
        vm.prank(buyer);
        marketplace.requestReturn(jobId, "Item not as described");
        assertEq(uint256(marketplace.getShipment(jobId).status), uint256(ProductMarketplace.ShippingStatus.RETURN_REQUESTED));
    }

    function test_RequestReturn_RevertWindowClosed() public {
        uint256 productId = _createFixedPriceProduct();
        uint256 jobId = _buyFixedPrice(productId);
        vm.prank(seller);
        marketplace.shipProduct(jobId, "ups", "1Z999");
        vm.prank(seller);
        escrow.submitDelivery(jobId, "ipfs://delivery-proof");
        vm.prank(buyer);
        marketplace.confirmReceipt(jobId);
        vm.warp(block.timestamp + 8 days);
        vm.prank(buyer);
        vm.expectRevert("ProductMarketplace: return window closed");
        marketplace.requestReturn(jobId, "Item not as described");
    }

    function test_RequestReturn_RevertNotReceived() public {
        uint256 productId = _createFixedPriceProduct();
        uint256 jobId = _buyFixedPrice(productId);
        vm.prank(buyer);
        vm.expectRevert("ProductMarketplace: not received");
        marketplace.requestReturn(jobId, "Item not as described");
    }

    // ═══════════════════════════════════════════════════════════════
    //  FULL FLOW TESTS
    // ═══════════════════════════════════════════════════════════════

    function test_FullFlow_FixedPrice() public {
        uint256 productId = _createFixedPriceProduct();
        uint256 jobId = _buyFixedPrice(productId);
        vm.prank(seller);
        marketplace.shipProduct(jobId, "usps", "9400111899223033005282");
        vm.prank(seller);
        escrow.submitDelivery(jobId, "ipfs://delivery-proof");
        uint256 sellerBalBefore = token.balanceOf(seller);
        vm.prank(buyer);
        marketplace.confirmReceipt(jobId);
        assertGt(token.balanceOf(seller), sellerBalBefore);
    }

    function test_FullFlow_Auction() public {
        uint256 productId = _createAuctionProduct();
        vm.prank(seller);
        uint256 auctionId = marketplace.createAuction(productId, 100 ether, 0, 0, 1 days);
        vm.startPrank(bidder1);
        token.approve(address(marketplace), 200 ether);
        marketplace.placeBid(auctionId, 200 ether);
        vm.stopPrank();
        vm.startPrank(bidder2);
        token.approve(address(marketplace), 300 ether);
        marketplace.placeBid(auctionId, 300 ether);
        vm.stopPrank();
        vm.warp(block.timestamp + 2 days);
        vm.prank(bidder2); // V-003: winner must settle
        uint256 jobId = marketplace.settleAuction(auctionId, 7 days);
        assertGt(jobId, 0);
        // V-001 fix: withdrawBid takes token address
        vm.prank(bidder1);
        marketplace.withdrawBid(address(token));
    }

    // ═══════════════════════════════════════════════════════════════
    //  WITHDRAW TESTS
    // ═══════════════════════════════════════════════════════════════

    function test_WithdrawBid_RevertNothingToWithdraw() public {
        vm.prank(bidder1);
        vm.expectRevert("ProductMarketplace: nothing to withdraw");
        marketplace.withdrawBid(address(token));
    }

    function test_WithdrawBid_RevertZeroToken() public {
        vm.prank(bidder1);
        vm.expectRevert("ProductMarketplace: zero token");
        marketplace.withdrawBid(address(0));
    }

    // ═══════════════════════════════════════════════════════════════
    //  V-001 REGRESSION: Cross-token isolation
    // ═══════════════════════════════════════════════════════════════

    /// @dev Proves that refunds in token A cannot be withdrawn as token B
    function test_V001_CrossTokenIsolation() public {
        // Only one token in this test suite, but verify the per-token accounting is correct
        uint256 productId = _createAuctionProduct();
        vm.prank(seller);
        uint256 auctionId = marketplace.createAuction(productId, 100 ether, 0, 0, 7 days);

        vm.startPrank(bidder1);
        token.approve(address(marketplace), 150 ether);
        marketplace.placeBid(auctionId, 150 ether);
        vm.stopPrank();

        vm.startPrank(bidder2);
        token.approve(address(marketplace), 200 ether);
        marketplace.placeBid(auctionId, 200 ether);
        vm.stopPrank();

        // bidder1 has 150 in token — verify zero in a different "token" address
        assertEq(marketplace.pendingWithdrawals(bidder1, address(token)), 150 ether);
        assertEq(marketplace.pendingWithdrawals(bidder1, address(0x1234)), 0);

        // Cannot withdraw a token they don't have refunds in
        vm.prank(bidder1);
        vm.expectRevert("ProductMarketplace: nothing to withdraw");
        marketplace.withdrawBid(address(0x1234));

        // Can withdraw the correct token
        vm.prank(bidder1);
        marketplace.withdrawBid(address(token));
        assertEq(marketplace.pendingWithdrawals(bidder1, address(token)), 0);
    }

    // ═══════════════════════════════════════════════════════════════
    //  V-002 (round 2) REGRESSION: maxPrice slippage protection
    // ═══════════════════════════════════════════════════════════════

    function test_V002_BuyProduct_RevertPriceExceedsMax() public {
        uint256 productId = _createFixedPriceProduct();
        ProductMarketplace.Product memory product = marketplace.getProduct(productId);

        vm.startPrank(buyer);
        token.approve(address(marketplace), product.price);
        // maxPrice = 100, but product.price = 500 ether
        vm.expectRevert("ProductMarketplace: price exceeds max");
        marketplace.buyProduct(productId, 100 ether, 7 days);
        vm.stopPrank();
    }

    function test_V002_BuyProduct_ExactMaxPricePasses() public {
        uint256 productId = _createFixedPriceProduct();
        ProductMarketplace.Product memory product = marketplace.getProduct(productId);

        vm.startPrank(buyer);
        token.approve(address(marketplace), product.price);
        // maxPrice == price — should succeed
        uint256 jobId = marketplace.buyProduct(productId, product.price, 7 days);
        vm.stopPrank();

        assertGt(jobId, 0);
    }

    // ═══════════════════════════════════════════════════════════════
    //  V-001 (round 2) REGRESSION: Token snapshot in Product/Auction
    // ═══════════════════════════════════════════════════════════════

    function test_V001R2_ProductSnapshotsToken() public {
        uint256 productId = _createFixedPriceProduct();
        ProductMarketplace.Product memory product = marketplace.getProduct(productId);
        // Product should have snapshotted token and price
        assertEq(product.settlementToken, address(token));
        assertEq(product.price, 500 ether);
    }

    function test_V001R2_AuctionSnapshotsToken() public {
        uint256 productId = _createAuctionProduct();
        vm.prank(seller);
        uint256 auctionId = marketplace.createAuction(productId, 100 ether, 0, 0, 7 days);
        ProductMarketplace.Auction memory auction = marketplace.getAuction(auctionId);
        // Auction should have snapshotted the product's token
        assertEq(auction.settlementToken, address(token));
    }

    // ═══════════════════════════════════════════════════════════════
    //  VIEW TESTS
    // ═══════════════════════════════════════════════════════════════

    function test_GetProduct_RevertNotFound() public {
        vm.expectRevert("ProductMarketplace: not found");
        marketplace.getProduct(999);
    }

    function test_GetAuction_RevertNotFound() public {
        vm.expectRevert("ProductMarketplace: not found");
        marketplace.getAuction(999);
    }

    function test_NextIds() public {
        assertEq(marketplace.nextProductId(), 1);
        assertEq(marketplace.nextAuctionId(), 1);
        _createFixedPriceProduct();
        assertEq(marketplace.nextProductId(), 2);
    }

    // ═══════════════════════════════════════════════════════════════
    //  PAUSE TESTS
    // ═══════════════════════════════════════════════════════════════

    function test_Pause() public {
        vm.prank(admin);
        marketplace.pause();
        vm.startPrank(seller);
        uint256 listingId = registry.createListing(IServiceRegistry.ServiceCategory.PHYSICAL_TASK, "iPhone", "desc", 500 ether, address(token), 7 days, "");
        vm.expectRevert();
        marketplace.createProduct(listingId, ProductMarketplace.ProductCondition.NEW, "electronics", "ipfs://s", "ipfs://i", 1, true, ProductMarketplace.ListingType.FIXED_PRICE);
        vm.stopPrank();
        vm.prank(admin);
        marketplace.unpause();
        vm.prank(seller);
        marketplace.createProduct(listingId, ProductMarketplace.ProductCondition.NEW, "electronics", "ipfs://s", "ipfs://i", 1, true, ProductMarketplace.ListingType.FIXED_PRICE);
    }

    // ═══════════════════════════════════════════════════════════════
    //  DEACTIVATION WITH ACTIVE AUCTION
    // ═══════════════════════════════════════════════════════════════

    function test_DeactivateProduct_RevertActiveAuction() public {
        uint256 productId = _createAuctionProduct();
        vm.prank(seller);
        marketplace.createAuction(productId, 100 ether, 0, 0, 7 days);
        vm.prank(seller);
        vm.expectRevert("ProductMarketplace: auction active");
        marketplace.deactivateProduct(productId);
    }

    function test_DeactivateProduct_AfterAuctionSettled() public {
        uint256 productId = _createAuctionProduct();
        vm.prank(seller);
        uint256 auctionId = marketplace.createAuction(productId, 100 ether, 0, 0, 1 days);
        vm.warp(block.timestamp + 2 days);
        marketplace.settleAuction(auctionId, 7 days);
        vm.prank(seller);
        marketplace.deactivateProduct(productId);
        assertFalse(marketplace.getProduct(productId).active);
    }

    // ═══════════════════════════════════════════════════════════════
    //  HELPERS — EIP-712 signing for X402
    // ═══════════════════════════════════════════════════════════════

    bytes32 private constant _PAYMENT_INTENT_TYPEHASH = keccak256(
        "PaymentIntent(bytes32 x402Nonce,address token,uint256 amount,uint256 listingId,address seller,uint256 deadline,uint256 deliveryDeadline)"
    );

    function _marketplaceDomainSeparator() internal view returns (bytes32) {
        return keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256("ProductMarketplace"),
            keccak256("1"),
            block.chainid,
            address(marketplace)
        ));
    }

    function _signPaymentIntent(
        ProductMarketplaceExtension.PaymentIntent memory intent,
        uint256 pk
    ) internal view returns (uint8 v, bytes32 r, bytes32 s) {
        bytes32 structHash = keccak256(abi.encode(
            _PAYMENT_INTENT_TYPEHASH,
            intent.x402Nonce, intent.token, intent.amount,
            intent.listingId, intent.seller, intent.deadline, intent.deliveryDeadline
        ));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _marketplaceDomainSeparator(), structHash));
        (v, r, s) = vm.sign(pk, digest);
    }

    function _buyFixedPriceInsured(uint256 productId) internal returns (uint256 jobId) {
        ProductMarketplace.Product memory product = marketplace.getProduct(productId);
        uint256 premium = (product.price * insurance.premiumRateBps()) / 10000;
        uint256 totalCost = product.price + premium;

        vm.startPrank(buyer);
        token.approve(address(marketplace), totalCost);
        jobId = marketplaceExt.buyProductInsured(productId, product.price, 7 days);
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════
    //  INSURED PURCHASE TESTS
    // ═══════════════════════════════════════════════════════════════

    function test_BuyProductInsured() public {
        uint256 productId = _createFixedPriceProduct();
        ProductMarketplace.Product memory product = marketplace.getProduct(productId);
        uint256 premium = (product.price * insurance.premiumRateBps()) / 10000;

        uint256 buyerBalBefore = token.balanceOf(buyer);

        uint256 jobId = _buyFixedPriceInsured(productId);

        assertGt(jobId, 0);
        ProductMarketplace.Product memory updated = marketplace.getProduct(productId);
        assertEq(updated.sold, 1);
        assertEq(marketplace.jobBuyer(jobId), buyer);
        assertTrue(marketplace.jobInsured(jobId));

        // Buyer paid price + premium
        assertEq(buyerBalBefore - token.balanceOf(buyer), product.price + premium);
    }

    function test_BuyProductInsured_RevertPriceExceedsMax() public {
        uint256 productId = _createFixedPriceProduct();

        vm.startPrank(buyer);
        token.approve(address(marketplace), 1000 ether);
        // maxPrice = 100 but product.price = 500
        vm.expectRevert("ProductMarketplace: price exceeds max");
        marketplaceExt.buyProductInsured(productId, 100 ether, 7 days);
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════
    //  X402 PURCHASE TESTS
    // ═══════════════════════════════════════════════════════════════

    function test_BuyProductX402() public {
        uint256 productId = _createFixedPriceProduct();
        ProductMarketplace.Product memory product = marketplace.getProduct(productId);

        bytes32 nonce = keccak256("test-nonce-1");
        ProductMarketplaceExtension.PaymentIntent memory intent = ProductMarketplaceExtension.PaymentIntent({
            x402Nonce: nonce,
            payer: payer,
            token: address(token),
            amount: product.price,
            listingId: product.listingId,
            seller: product.seller,
            deadline: block.timestamp + 1 hours,
            deliveryDeadline: 7 days
        });

        (uint8 v, bytes32 r, bytes32 s) = _signPaymentIntent(intent, PAYER_PK);

        // Payer approves marketplace
        vm.prank(payer);
        token.approve(address(marketplace), product.price);

        uint256 payerBalBefore = token.balanceOf(payer);

        vm.prank(facilitator);
        uint256 jobId = marketplaceExt.buyProductX402(productId, intent, v, r, s);

        assertGt(jobId, 0);
        assertEq(marketplace.jobBuyer(jobId), payer);
        assertEq(marketplace.paymentToJob(nonce), jobId);
        assertTrue(marketplace.nonceUsed(nonce));
        assertEq(payerBalBefore - token.balanceOf(payer), product.price);

        ProductMarketplace.Product memory updated = marketplace.getProduct(productId);
        assertEq(updated.sold, 1);
    }

    function test_BuyProductX402_RevertInvalidSignature() public {
        uint256 productId = _createFixedPriceProduct();
        ProductMarketplace.Product memory product = marketplace.getProduct(productId);

        bytes32 nonce = keccak256("test-nonce-2");
        ProductMarketplaceExtension.PaymentIntent memory intent = ProductMarketplaceExtension.PaymentIntent({
            x402Nonce: nonce,
            payer: payer,
            token: address(token),
            amount: product.price,
            listingId: product.listingId,
            seller: product.seller,
            deadline: block.timestamp + 1 hours,
            deliveryDeadline: 7 days
        });

        // Sign with wrong key
        uint256 wrongPk = 0xBEEF;
        (uint8 v, bytes32 r, bytes32 s) = _signPaymentIntent(intent, wrongPk);

        vm.prank(payer);
        token.approve(address(marketplace), product.price);

        vm.prank(facilitator);
        vm.expectRevert("ProductMarketplace: invalid signature");
        marketplaceExt.buyProductX402(productId, intent, v, r, s);
    }

    function test_BuyProductX402_RevertReplayedNonce() public {
        uint256 productId = _createFixedPriceProduct();
        // Create product with quantity 2 so we can try buying twice
        vm.startPrank(seller);
        uint256 listingId = registry.createListing(
            IServiceRegistry.ServiceCategory.PHYSICAL_TASK,
            "iPhone 15 Pro Qty2", "Brand new", 500 ether, address(token), 7 days, ""
        );
        uint256 productId2 = marketplace.createProduct(
            listingId, ProductMarketplace.ProductCondition.NEW,
            "electronics", "ipfs://s", "ipfs://i", 2, true, ProductMarketplace.ListingType.FIXED_PRICE
        );
        vm.stopPrank();

        ProductMarketplace.Product memory product = marketplace.getProduct(productId2);

        bytes32 nonce = keccak256("test-nonce-replay");
        ProductMarketplaceExtension.PaymentIntent memory intent = ProductMarketplaceExtension.PaymentIntent({
            x402Nonce: nonce,
            payer: payer,
            token: address(token),
            amount: product.price,
            listingId: product.listingId,
            seller: product.seller,
            deadline: block.timestamp + 1 hours,
            deliveryDeadline: 7 days
        });

        (uint8 v, bytes32 r, bytes32 s) = _signPaymentIntent(intent, PAYER_PK);

        vm.prank(payer);
        token.approve(address(marketplace), product.price * 2);

        vm.prank(facilitator);
        marketplaceExt.buyProductX402(productId2, intent, v, r, s);

        // Replay same nonce
        vm.prank(facilitator);
        vm.expectRevert("ProductMarketplace: nonce used");
        marketplaceExt.buyProductX402(productId2, intent, v, r, s);
    }

    function test_BuyProductX402_RevertWrongPrice() public {
        uint256 productId = _createFixedPriceProduct();
        ProductMarketplace.Product memory product = marketplace.getProduct(productId);

        bytes32 nonce = keccak256("test-nonce-wrong-price");
        ProductMarketplaceExtension.PaymentIntent memory intent = ProductMarketplaceExtension.PaymentIntent({
            x402Nonce: nonce,
            payer: payer,
            token: address(token),
            amount: 100 ether, // wrong: product.price is 500
            listingId: product.listingId,
            seller: product.seller,
            deadline: block.timestamp + 1 hours,
            deliveryDeadline: 7 days
        });

        (uint8 v, bytes32 r, bytes32 s) = _signPaymentIntent(intent, PAYER_PK);

        vm.prank(facilitator);
        vm.expectRevert("ProductMarketplace: price mismatch");
        marketplaceExt.buyProductX402(productId, intent, v, r, s);
    }

    function test_BuyProductX402_RevertNotFacilitator() public {
        uint256 productId = _createFixedPriceProduct();
        ProductMarketplace.Product memory product = marketplace.getProduct(productId);

        bytes32 nonce = keccak256("test-nonce-no-role");
        ProductMarketplaceExtension.PaymentIntent memory intent = ProductMarketplaceExtension.PaymentIntent({
            x402Nonce: nonce,
            payer: payer,
            token: address(token),
            amount: product.price,
            listingId: product.listingId,
            seller: product.seller,
            deadline: block.timestamp + 1 hours,
            deliveryDeadline: 7 days
        });

        (uint8 v, bytes32 r, bytes32 s) = _signPaymentIntent(intent, PAYER_PK);

        // Call from unauthorized address
        vm.prank(buyer);
        vm.expectRevert();
        marketplaceExt.buyProductX402(productId, intent, v, r, s);
    }

    function test_BuyProductX402Insured() public {
        uint256 productId = _createFixedPriceProduct();
        ProductMarketplace.Product memory product = marketplace.getProduct(productId);
        uint256 premium = (product.price * insurance.premiumRateBps()) / 10000;
        uint256 totalCost = product.price + premium;

        bytes32 nonce = keccak256("test-nonce-insured");
        ProductMarketplaceExtension.PaymentIntent memory intent = ProductMarketplaceExtension.PaymentIntent({
            x402Nonce: nonce,
            payer: payer,
            token: address(token),
            amount: totalCost,
            listingId: product.listingId,
            seller: product.seller,
            deadline: block.timestamp + 1 hours,
            deliveryDeadline: 7 days
        });

        (uint8 v, bytes32 r, bytes32 s) = _signPaymentIntent(intent, PAYER_PK);

        vm.prank(payer);
        token.approve(address(marketplace), totalCost);

        uint256 payerBalBefore = token.balanceOf(payer);

        vm.prank(facilitator);
        uint256 jobId = marketplaceExt.buyProductX402Insured(productId, intent, v, r, s);

        assertGt(jobId, 0);
        assertEq(marketplace.jobBuyer(jobId), payer);
        assertTrue(marketplace.jobInsured(jobId));
        assertEq(marketplace.paymentToJob(nonce), jobId);
        assertEq(payerBalBefore - token.balanceOf(payer), totalCost);
    }

    // ═══════════════════════════════════════════════════════════════
    //  SETTLE AUCTION INSURED TESTS
    // ═══════════════════════════════════════════════════════════════

    function test_SettleAuctionInsured() public {
        uint256 productId = _createAuctionProduct();
        vm.prank(seller);
        uint256 auctionId = marketplace.createAuction(productId, 100 ether, 0, 0, 1 days);

        vm.startPrank(bidder1);
        token.approve(address(marketplace), 600 ether);
        marketplace.placeBid(auctionId, 600 ether);
        vm.stopPrank();

        vm.warp(block.timestamp + 2 days);

        // V-002: only winner can settle insured — approves premium and calls
        uint256 premium = (600 ether * insurance.premiumRateBps()) / 10000;
        vm.startPrank(bidder1);
        token.approve(address(marketplace), premium);
        uint256 jobId = marketplaceExt.settleAuctionInsured(auctionId, 7 days);
        vm.stopPrank();

        assertGt(jobId, 0);
        assertTrue(marketplace.getAuction(auctionId).settled);
        assertEq(marketplace.jobBuyer(jobId), bidder1);
        assertTrue(marketplace.jobInsured(jobId));
        assertEq(marketplace.getProduct(productId).sold, 1);
    }

    // ═══════════════════════════════════════════════════════════════
    //  INSURANCE CLAIM TESTS
    // ═══════════════════════════════════════════════════════════════

    function test_ClaimInsuranceRefund_RevertNotBuyer() public {
        uint256 productId = _createFixedPriceProduct();
        uint256 jobId = _buyFixedPriceInsured(productId);

        vm.prank(bidder1);
        vm.expectRevert("ProductMarketplace: not buyer");
        marketplaceExt.claimInsuranceRefund(jobId);
    }

    function test_ClaimInsuranceRefund_RevertNotInsured() public {
        uint256 productId = _createFixedPriceProduct();
        uint256 jobId = _buyFixedPrice(productId);

        vm.prank(buyer);
        vm.expectRevert("ProductMarketplace: not insured");
        marketplaceExt.claimInsuranceRefund(jobId);
    }

    function test_FileInsuranceClaim_RevertNotBuyer() public {
        uint256 productId = _createFixedPriceProduct();
        uint256 jobId = _buyFixedPriceInsured(productId);

        vm.prank(bidder1);
        vm.expectRevert("ProductMarketplace: not buyer");
        marketplaceExt.fileInsuranceClaim(jobId);
    }

    function test_FileInsuranceClaim_RevertNotInsured() public {
        uint256 productId = _createFixedPriceProduct();
        uint256 jobId = _buyFixedPrice(productId);

        vm.prank(buyer);
        vm.expectRevert("ProductMarketplace: not insured");
        marketplaceExt.fileInsuranceClaim(jobId);
    }

    // ═══════════════════════════════════════════════════════════════
    //  V-001 REGRESSION: X402 intent must match product listing/seller
    // ═══════════════════════════════════════════════════════════════

    function test_V001_BuyProductX402_RevertListingMismatch() public {
        uint256 productId = _createFixedPriceProduct();
        ProductMarketplace.Product memory product = marketplace.getProduct(productId);

        bytes32 nonce = keccak256("v001-listing-mismatch");
        ProductMarketplaceExtension.PaymentIntent memory intent = ProductMarketplaceExtension.PaymentIntent({
            x402Nonce: nonce,
            payer: payer,
            token: address(token),
            amount: product.price,
            listingId: 999, // wrong listing
            seller: product.seller,
            deadline: block.timestamp + 1 hours,
            deliveryDeadline: 7 days
        });

        (uint8 v, bytes32 r, bytes32 s) = _signPaymentIntent(intent, PAYER_PK);

        vm.prank(facilitator);
        vm.expectRevert("ProductMarketplace: listing mismatch");
        marketplaceExt.buyProductX402(productId, intent, v, r, s);
    }

    function test_V001_BuyProductX402_RevertSellerMismatch() public {
        uint256 productId = _createFixedPriceProduct();
        ProductMarketplace.Product memory product = marketplace.getProduct(productId);

        bytes32 nonce = keccak256("v001-seller-mismatch");
        ProductMarketplaceExtension.PaymentIntent memory intent = ProductMarketplaceExtension.PaymentIntent({
            x402Nonce: nonce,
            payer: payer,
            token: address(token),
            amount: product.price,
            listingId: product.listingId,
            seller: address(0xDEAD), // wrong seller
            deadline: block.timestamp + 1 hours,
            deliveryDeadline: 7 days
        });

        (uint8 v, bytes32 r, bytes32 s) = _signPaymentIntent(intent, PAYER_PK);

        vm.prank(facilitator);
        vm.expectRevert("ProductMarketplace: seller mismatch");
        marketplaceExt.buyProductX402(productId, intent, v, r, s);
    }

    // ═══════════════════════════════════════════════════════════════
    //  V-002 REGRESSION: Only winner can settle insured
    // ═══════════════════════════════════════════════════════════════

    function test_V002_SettleAuctionInsured_RevertNotWinner() public {
        uint256 productId = _createAuctionProduct();
        vm.prank(seller);
        uint256 auctionId = marketplace.createAuction(productId, 100 ether, 0, 0, 1 days);

        vm.startPrank(bidder1);
        token.approve(address(marketplace), 600 ether);
        marketplace.placeBid(auctionId, 600 ether);
        vm.stopPrank();

        vm.warp(block.timestamp + 2 days);

        // Third party tries to settle insured
        vm.prank(buyer);
        vm.expectRevert("ProductMarketplace: not winner");
        marketplaceExt.settleAuctionInsured(auctionId, 7 days);
    }

    // ═══════════════════════════════════════════════════════════════
    //  V-003 REGRESSION: Settlement restricted to winner/seller,
    //  delivery deadline bounded
    // ═══════════════════════════════════════════════════════════════

    function test_V003_SettleAuction_RevertNotWinnerOrSeller() public {
        uint256 productId = _createAuctionProduct();
        vm.prank(seller);
        uint256 auctionId = marketplace.createAuction(productId, 100 ether, 0, 0, 1 days);

        vm.startPrank(bidder1);
        token.approve(address(marketplace), 200 ether);
        marketplace.placeBid(auctionId, 200 ether);
        vm.stopPrank();

        vm.warp(block.timestamp + 2 days);

        // Third party cannot settle when bids exist
        vm.prank(buyer);
        vm.expectRevert("ProductMarketplace: not winner or seller");
        marketplace.settleAuction(auctionId, 7 days);
    }

    function test_V003_SettleAuction_RevertDeadlineTooLong() public {
        uint256 productId = _createAuctionProduct();
        vm.prank(seller);
        uint256 auctionId = marketplace.createAuction(productId, 100 ether, 0, 0, 1 days);

        vm.startPrank(bidder1);
        token.approve(address(marketplace), 200 ether);
        marketplace.placeBid(auctionId, 200 ether);
        vm.stopPrank();

        vm.warp(block.timestamp + 2 days);

        vm.prank(bidder1);
        vm.expectRevert("ProductMarketplace: deadline too long");
        marketplace.settleAuction(auctionId, 365 days);
    }

    function test_V003_SettleAuction_NoBids_Permissionless() public {
        // Failed auctions (no bids) remain permissionless
        uint256 productId = _createAuctionProduct();
        vm.prank(seller);
        uint256 auctionId = marketplace.createAuction(productId, 100 ether, 0, 0, 1 days);

        vm.warp(block.timestamp + 2 days);

        // Anyone can settle a failed auction
        vm.prank(buyer);
        uint256 jobId = marketplace.settleAuction(auctionId, 7 days);
        assertEq(jobId, 0);
    }
}
