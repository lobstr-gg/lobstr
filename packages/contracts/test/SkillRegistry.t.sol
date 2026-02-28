// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/LOBToken.sol";
import "../src/StakingManager.sol";
import "../src/ReputationSystem.sol";
import "../src/ServiceRegistry.sol";
import "../src/DisputeArbitration.sol";
import "../src/EscrowEngine.sol";
import "../src/SkillRegistry.sol";
import "./helpers/ProxyTestHelper.sol";

contract MockSybilGuardSkill {
    mapping(address => bool) public banned;

    function setBanned(address user, bool val) external {
        banned[user] = val;
    }

    function checkBanned(address user) external view returns (bool) {
        return banned[user];
    }

    function checkAnyBanned(address[] calldata) external pure returns (bool) {
        return false;
    }
}

contract MockRewardDistributorSkill {
    function creditArbitratorReward(address, address, uint256) external {}
    function creditWatcherReward(address, address, uint256) external {}
    function creditJudgeReward(address, address, uint256) external {}
    function deposit(address, uint256) external {}
    function availableBudget(address) external pure returns (uint256) { return type(uint256).max; }
}

contract SkillRegistryTest is Test, ProxyTestHelper {
    // Events for expectEmit
    event SkillListed(uint256 indexed skillId, address indexed seller, ISkillRegistry.AssetType assetType, ISkillRegistry.PricingModel pricingModel, uint256 price);
    event SkillUpdated(uint256 indexed skillId, uint256 newPrice, string newMetadataURI);
    event SkillDeactivated(uint256 indexed skillId);
    event SkillPurchased(uint256 indexed skillId, address indexed buyer, uint256 accessId, ISkillRegistry.PricingModel pricingModel, uint256 amount);
    event SubscriptionRenewed(uint256 indexed accessId, uint256 indexed skillId, address indexed buyer, uint256 newExpiresAt);
    event UsageRecorded(uint256 indexed accessId, uint256 indexed skillId, uint256 calls, uint256 cost);
    event CallCreditsDeposited(address indexed buyer, address indexed token, uint256 amount);
    event CallCreditsWithdrawn(address indexed buyer, address indexed token, uint256 amount);
    event SellerPaid(address indexed seller, address indexed token, uint256 amount);

    LOBToken public token;
    StakingManager public staking;
    ReputationSystem public reputation;
    ServiceRegistry public registry;
    DisputeArbitration public dispute;
    EscrowEngine public escrow;
    SkillRegistry public skillRegistry;
    MockSybilGuardSkill public mockSybilGuard;
    MockRewardDistributorSkill public mockRewardDist;

    address public admin = makeAddr("admin");
    address public distributor = makeAddr("distributor");
    address public treasury = makeAddr("treasury");
    address public buyer = makeAddr("buyer");
    address public seller = makeAddr("seller");
    address public gateway = makeAddr("gateway");
    address public nobody = makeAddr("nobody");

    function setUp() public {
        vm.startPrank(admin);
        token = LOBToken(_deployProxy(address(new LOBToken()), abi.encodeCall(LOBToken.initialize, (distributor))));
        reputation = ReputationSystem(_deployProxy(address(new ReputationSystem()), abi.encodeCall(ReputationSystem.initialize, ())));
        staking = StakingManager(_deployProxy(address(new StakingManager()), abi.encodeCall(StakingManager.initialize, (address(token)))));
        mockSybilGuard = new MockSybilGuardSkill();
        mockRewardDist = new MockRewardDistributorSkill();
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
        skillRegistry = SkillRegistry(_deployProxy(address(new SkillRegistry()), abi.encodeCall(SkillRegistry.initialize, (
            address(token),
            address(staking),
            address(reputation),
            address(mockSybilGuard),
            address(escrow),
            treasury
        ))));

        // Grant roles
        reputation.grantRole(reputation.RECORDER_ROLE(), address(escrow));
        reputation.grantRole(reputation.RECORDER_ROLE(), address(dispute));
        reputation.grantRole(reputation.RECORDER_ROLE(), address(skillRegistry));
        staking.grantRole(staking.SLASHER_ROLE(), address(dispute));
        dispute.grantRole(dispute.ESCROW_ROLE(), address(escrow));
        dispute.setEscrowEngine(address(escrow));
        escrow.grantRole(escrow.SKILL_REGISTRY_ROLE(), address(skillRegistry));
        skillRegistry.grantRole(skillRegistry.GATEWAY_ROLE(), gateway);
        vm.stopPrank();

        // Fund participants
        vm.startPrank(distributor);
        token.transfer(buyer, 500_000 ether);
        token.transfer(seller, 500_000 ether);
        vm.stopPrank();

        // Seller stakes to Silver (1000 LOB)
        vm.startPrank(seller);
        token.approve(address(staking), 1_000 ether);
        staking.stake(1_000 ether);
        vm.stopPrank();

        // Build seller rep to Silver (need 10 completions: 500 base + 10*100 = 1500 → Silver)
        // Uses unique counterparties to satisfy anti-farming requirements
        vm.startPrank(admin);
        reputation.grantRole(reputation.RECORDER_ROLE(), admin);
        for (uint256 i = 0; i < 10; i++) {
            reputation.recordCompletion(seller, address(uint160(0x1000 + i)));
        }
        vm.stopPrank();

        vm.warp(block.timestamp + 7 days); // V-006: SILVER_MIN_TENURE
    }

    // --- Helper ---

    function _defaultParams() internal view returns (ISkillRegistry.ListSkillParams memory) {
        return ISkillRegistry.ListSkillParams({
            assetType: ISkillRegistry.AssetType.SKILL,
            deliveryMethod: ISkillRegistry.DeliveryMethod.HOSTED_API,
            pricingModel: ISkillRegistry.PricingModel.ONE_TIME,
            price: 50 ether,
            settlementToken: address(token),
            apiEndpointHash: keccak256("https://api.example.com"),
            packageHash: bytes32(0)
        });
    }

    function _emptyDeps() internal pure returns (uint256[] memory) {
        return new uint256[](0);
    }

    function _listDefaultSkill() internal returns (uint256) {
        vm.prank(seller);
        return skillRegistry.listSkill(
            _defaultParams(),
            "Test Skill",
            "A test skill",
            "ipfs://metadata",
            _emptyDeps()
        );
    }

    // ═══════════════════════════════════════════════════════════════
    //  1. MARKETPLACE TIER COMPUTATION
    // ═══════════════════════════════════════════════════════════════

    function test_MarketplaceTier_SilverStake_SilverRep() public view {
        // Seller has Silver stake (1000) + Silver rep (1500 score)
        ISkillRegistry.MarketplaceTier tier = skillRegistry.getMarketplaceTier(seller);
        assertEq(uint256(tier), uint256(ISkillRegistry.MarketplaceTier.Silver));
    }

    function test_MarketplaceTier_NoStake_ReturnsNone() public view {
        ISkillRegistry.MarketplaceTier tier = skillRegistry.getMarketplaceTier(nobody);
        assertEq(uint256(tier), uint256(ISkillRegistry.MarketplaceTier.None));
    }

    function test_MarketplaceTier_BronzeStake_SilverRep() public {
        // Stake 100 LOB (Bronze) but rep is Silver → min = Bronze
        address user = makeAddr("bronzeUser");
        vm.prank(distributor);
        token.transfer(user, 100_000 ether);

        vm.startPrank(user);
        token.approve(address(staking), 100 ether);
        staking.stake(100 ether);
        vm.stopPrank();

        // Give Silver rep (unique counterparties for anti-farming)
        vm.startPrank(admin);
        for (uint256 i = 0; i < 10; i++) {
            reputation.recordCompletion(user, address(uint160(0x2000 + i)));
        }
        vm.stopPrank();

        vm.warp(block.timestamp + 7 days); // V-006: SILVER_MIN_TENURE

        ISkillRegistry.MarketplaceTier tier = skillRegistry.getMarketplaceTier(user);
        assertEq(uint256(tier), uint256(ISkillRegistry.MarketplaceTier.Bronze));
    }

    function test_MarketplaceTier_GoldStake_BronzeRep() public {
        // Gold stake + Bronze rep → min = Bronze
        address user = makeAddr("goldUser");
        vm.prank(distributor);
        token.transfer(user, 100_000 ether);

        vm.startPrank(user);
        token.approve(address(staking), 10_000 ether);
        staking.stake(10_000 ether);
        vm.stopPrank();

        // Default rep = Bronze (score 500)
        ISkillRegistry.MarketplaceTier tier = skillRegistry.getMarketplaceTier(user);
        assertEq(uint256(tier), uint256(ISkillRegistry.MarketplaceTier.Bronze));
    }

    function test_MarketplaceTier_PlatinumStake_PlatinumRep() public {
        address user = makeAddr("platUser");
        vm.prank(distributor);
        token.transfer(user, 200_000 ether);

        vm.startPrank(user);
        token.approve(address(staking), 100_000 ether);
        staking.stake(100_000 ether);
        vm.stopPrank();

        // Platinum rep needs score >= 10000 → 500 base + 95*100 = 10000
        // Need 25+ unique counterparties for Platinum tier
        vm.startPrank(admin);
        for (uint256 i = 0; i < 95; i++) {
            reputation.recordCompletion(user, address(uint160(0x2000 + i)));
        }
        vm.stopPrank();

        vm.warp(block.timestamp + 90 days); // V-006: PLATINUM_MIN_TENURE

        ISkillRegistry.MarketplaceTier tier = skillRegistry.getMarketplaceTier(user);
        assertEq(uint256(tier), uint256(ISkillRegistry.MarketplaceTier.Platinum));
    }

    function test_MarketplaceTier_SilverStake_BronzeRep() public view {
        // Seller has Silver stake but buyer has no rep → check buyer
        // buyer has no stake so None
        ISkillRegistry.MarketplaceTier tier = skillRegistry.getMarketplaceTier(buyer);
        assertEq(uint256(tier), uint256(ISkillRegistry.MarketplaceTier.None));
    }

    // ═══════════════════════════════════════════════════════════════
    //  2. LIST SKILL
    // ═══════════════════════════════════════════════════════════════

    function test_ListSkill_HappyPath() public {
        uint256 skillId = _listDefaultSkill();
        assertEq(skillId, 1);

        ISkillRegistry.SkillListing memory skill = skillRegistry.getSkill(skillId);
        assertEq(skill.seller, seller);
        assertEq(uint256(skill.assetType), uint256(ISkillRegistry.AssetType.SKILL));
        assertEq(skill.price, 50 ether);
        assertTrue(skill.active);
        assertEq(skill.version, 1);
        assertEq(skillRegistry.getSellerListingCount(seller), 1);
    }

    function test_ListSkill_EmitEvent() public {
        vm.prank(seller);
        vm.expectEmit(true, true, false, true);
        emit SkillListed(1, seller, ISkillRegistry.AssetType.SKILL, ISkillRegistry.PricingModel.ONE_TIME, 50 ether);
        skillRegistry.listSkill(
            _defaultParams(),
            "Test Skill",
            "A test skill",
            "ipfs://metadata",
            _emptyDeps()
        );
    }

    function test_ListSkill_RevertBanned() public {
        mockSybilGuard.setBanned(seller, true);
        vm.prank(seller);
        vm.expectRevert("SkillRegistry: banned");
        skillRegistry.listSkill(
            _defaultParams(),
            "Test Skill",
            "A test skill",
            "ipfs://metadata",
            _emptyDeps()
        );
    }

    function test_ListSkill_RevertEmptyTitle() public {
        vm.prank(seller);
        vm.expectRevert("SkillRegistry: empty title");
        skillRegistry.listSkill(
            _defaultParams(),
            "",
            "A test skill",
            "ipfs://metadata",
            _emptyDeps()
        );
    }

    function test_ListSkill_RevertZeroPrice() public {
        ISkillRegistry.ListSkillParams memory params = _defaultParams();
        params.price = 0;
        vm.prank(seller);
        vm.expectRevert("SkillRegistry: zero price");
        skillRegistry.listSkill(params, "Test", "Desc", "ipfs://m", _emptyDeps());
    }

    function test_ListSkill_RevertNeedBronze() public {
        // nobody has no stake
        vm.prank(nobody);
        vm.expectRevert("SkillRegistry: need Bronze+");
        skillRegistry.listSkill(
            _defaultParams(),
            "Test",
            "Desc",
            "ipfs://m",
            _emptyDeps()
        );
    }

    function test_ListSkill_AgentTemplateRequiresSilver() public {
        // Bronze user can't list agent template
        address bronzeUser = makeAddr("bronzeUser2");
        vm.prank(distributor);
        token.transfer(bronzeUser, 100_000 ether);
        vm.startPrank(bronzeUser);
        token.approve(address(staking), 100 ether);
        staking.stake(100 ether);
        vm.stopPrank();

        ISkillRegistry.ListSkillParams memory params = _defaultParams();
        params.assetType = ISkillRegistry.AssetType.AGENT_TEMPLATE;

        vm.prank(bronzeUser);
        vm.expectRevert("SkillRegistry: need Silver+ for agents");
        skillRegistry.listSkill(params, "Agent", "Desc", "ipfs://m", _emptyDeps());
    }

    function test_ListSkill_PipelineRequiresGold() public {
        // Silver user can't list pipeline
        ISkillRegistry.ListSkillParams memory params = _defaultParams();
        params.assetType = ISkillRegistry.AssetType.PIPELINE;

        vm.prank(seller);
        vm.expectRevert("SkillRegistry: need Gold+ for pipelines");
        skillRegistry.listSkill(params, "Pipeline", "Desc", "ipfs://m", _emptyDeps());
    }

    function test_ListSkill_SubscriptionRequiresSilver() public {
        // Silver seller can list subscription
        ISkillRegistry.ListSkillParams memory params = _defaultParams();
        params.pricingModel = ISkillRegistry.PricingModel.SUBSCRIPTION;

        vm.prank(seller);
        uint256 skillId = skillRegistry.listSkill(params, "Sub Skill", "Desc", "ipfs://m", _emptyDeps());
        assertGt(skillId, 0);
    }

    function test_ListSkill_MaxListingsReached() public {
        // Silver = max 10 listings
        for (uint256 i = 0; i < 10; i++) {
            _listDefaultSkill();
        }

        vm.prank(seller);
        vm.expectRevert("SkillRegistry: max listings reached");
        skillRegistry.listSkill(
            _defaultParams(),
            "11th Skill",
            "Desc",
            "ipfs://m",
            _emptyDeps()
        );
    }

    function test_ListSkill_MissingAPIHash() public {
        ISkillRegistry.ListSkillParams memory params = _defaultParams();
        params.apiEndpointHash = bytes32(0);

        vm.prank(seller);
        vm.expectRevert("SkillRegistry: missing API hash");
        skillRegistry.listSkill(params, "Test", "Desc", "ipfs://m", _emptyDeps());
    }

    // ═══════════════════════════════════════════════════════════════
    //  3. UPDATE / DEACTIVATE SKILL
    // ═══════════════════════════════════════════════════════════════

    function test_UpdateSkill_HappyPath() public {
        uint256 skillId = _listDefaultSkill();

        vm.prank(seller);
        skillRegistry.updateSkill(skillId, 100 ether, "ipfs://updated", keccak256("new-api"), bytes32(0));

        ISkillRegistry.SkillListing memory skill = skillRegistry.getSkill(skillId);
        assertEq(skill.price, 100 ether);
        assertEq(skill.version, 2);
    }

    function test_UpdateSkill_RevertNotSeller() public {
        uint256 skillId = _listDefaultSkill();

        vm.prank(buyer);
        vm.expectRevert("SkillRegistry: not seller");
        skillRegistry.updateSkill(skillId, 100 ether, "ipfs://updated", keccak256("new-api"), bytes32(0));
    }

    function test_DeactivateSkill_HappyPath() public {
        uint256 skillId = _listDefaultSkill();
        assertEq(skillRegistry.getSellerListingCount(seller), 1);

        vm.prank(seller);
        skillRegistry.deactivateSkill(skillId);

        ISkillRegistry.SkillListing memory skill = skillRegistry.getSkill(skillId);
        assertFalse(skill.active);
        assertEq(skillRegistry.getSellerListingCount(seller), 0);
    }

    function test_DeactivateSkill_RevertNotSeller() public {
        uint256 skillId = _listDefaultSkill();

        vm.prank(buyer);
        vm.expectRevert("SkillRegistry: not seller");
        skillRegistry.deactivateSkill(skillId);
    }

    function test_DeactivateSkill_RevertAlreadyInactive() public {
        uint256 skillId = _listDefaultSkill();
        vm.prank(seller);
        skillRegistry.deactivateSkill(skillId);

        vm.prank(seller);
        vm.expectRevert("SkillRegistry: already inactive");
        skillRegistry.deactivateSkill(skillId);
    }

    // ═══════════════════════════════════════════════════════════════
    //  4. PURCHASE SKILL — ONE_TIME
    // ═══════════════════════════════════════════════════════════════

    function test_PurchaseSkill_OneTime_HappyPath() public {
        uint256 skillId = _listDefaultSkill();

        // Buyer approves EscrowEngine (not SkillRegistry)
        vm.startPrank(buyer);
        token.approve(address(escrow), 50 ether);
        uint256 accessId = skillRegistry.purchaseSkill(skillId);
        vm.stopPrank();

        assertEq(accessId, 1);

        ISkillRegistry.AccessRecord memory access = skillRegistry.getAccess(accessId);
        assertEq(access.skillId, skillId);
        assertEq(access.buyer, buyer);
        assertEq(uint256(access.pricingModel), uint256(ISkillRegistry.PricingModel.ONE_TIME));
        assertTrue(access.active);
        assertTrue(skillRegistry.hasActiveAccess(buyer, skillId));
    }

    function test_PurchaseSkill_OneTime_LOBZeroFee() public {
        uint256 skillId = _listDefaultSkill();

        vm.startPrank(buyer);
        token.approve(address(escrow), 50 ether);
        skillRegistry.purchaseSkill(skillId);
        vm.stopPrank();

        // Job in escrow should have 0 fee for LOB
        IEscrowEngine.Job memory job = escrow.getJob(1);
        assertEq(job.fee, 0);
        assertEq(job.amount, 50 ether);
    }

    function test_PurchaseSkill_OneTime_EscrowCreated() public {
        uint256 skillId = _listDefaultSkill();

        vm.startPrank(buyer);
        token.approve(address(escrow), 50 ether);
        skillRegistry.purchaseSkill(skillId);
        vm.stopPrank();

        IEscrowEngine.Job memory job = escrow.getJob(1);
        assertEq(job.buyer, buyer);
        assertEq(job.seller, seller);
        assertEq(uint256(job.escrowType), uint256(IEscrowEngine.EscrowType.SKILL_PURCHASE));
        assertEq(job.skillId, skillId);
        assertEq(uint256(job.status), uint256(IEscrowEngine.JobStatus.Delivered));
        assertEq(job.disputeWindowEnd, block.timestamp + 72 hours);
    }

    function test_PurchaseSkill_RevertSelfPurchase() public {
        uint256 skillId = _listDefaultSkill();

        vm.startPrank(seller);
        token.approve(address(escrow), 50 ether);
        vm.expectRevert("SkillRegistry: self-purchase");
        skillRegistry.purchaseSkill(skillId);
        vm.stopPrank();
    }

    function test_PurchaseSkill_RevertInactive() public {
        uint256 skillId = _listDefaultSkill();
        vm.prank(seller);
        skillRegistry.deactivateSkill(skillId);

        vm.prank(buyer);
        vm.expectRevert("SkillRegistry: inactive");
        skillRegistry.purchaseSkill(skillId);
    }

    // ═══════════════════════════════════════════════════════════════
    //  5. PURCHASE SKILL — PER_CALL + SUBSCRIPTION
    // ═══════════════════════════════════════════════════════════════

    function test_PurchaseSkill_PerCall_NoPayment() public {
        ISkillRegistry.ListSkillParams memory params = _defaultParams();
        params.pricingModel = ISkillRegistry.PricingModel.PER_CALL;
        vm.prank(seller);
        uint256 skillId = skillRegistry.listSkill(params, "Per Call", "Desc", "ipfs://m", _emptyDeps());

        uint256 buyerBalBefore = token.balanceOf(buyer);
        vm.prank(buyer);
        uint256 accessId = skillRegistry.purchaseSkill(skillId);

        // No tokens transferred for per-call
        assertEq(token.balanceOf(buyer), buyerBalBefore);
        ISkillRegistry.AccessRecord memory access = skillRegistry.getAccess(accessId);
        assertEq(access.totalPaid, 0);
    }

    function test_PurchaseSkill_Subscription_HappyPath() public {
        ISkillRegistry.ListSkillParams memory params = _defaultParams();
        params.pricingModel = ISkillRegistry.PricingModel.SUBSCRIPTION;
        vm.prank(seller);
        uint256 skillId = skillRegistry.listSkill(params, "Sub Skill", "Desc", "ipfs://m", _emptyDeps());

        uint256 sellerBalBefore = token.balanceOf(seller);

        vm.startPrank(buyer);
        token.approve(address(skillRegistry), 50 ether);
        uint256 accessId = skillRegistry.purchaseSkill(skillId);
        vm.stopPrank();

        // Seller receives payment immediately (0% LOB fee)
        assertEq(token.balanceOf(seller), sellerBalBefore + 50 ether);

        ISkillRegistry.AccessRecord memory access = skillRegistry.getAccess(accessId);
        assertEq(access.expiresAt, block.timestamp + 30 days);
        assertTrue(skillRegistry.hasActiveAccess(buyer, skillId));
    }

    function test_PurchaseSkill_Subscription_Expires() public {
        ISkillRegistry.ListSkillParams memory params = _defaultParams();
        params.pricingModel = ISkillRegistry.PricingModel.SUBSCRIPTION;
        vm.prank(seller);
        uint256 skillId = skillRegistry.listSkill(params, "Sub", "Desc", "ipfs://m", _emptyDeps());

        vm.startPrank(buyer);
        token.approve(address(skillRegistry), 50 ether);
        skillRegistry.purchaseSkill(skillId);
        vm.stopPrank();

        // Warp past expiry
        vm.warp(block.timestamp + 31 days);
        assertFalse(skillRegistry.hasActiveAccess(buyer, skillId));
    }

    function test_PurchaseSkill_BannedBuyerReverts() public {
        uint256 skillId = _listDefaultSkill();
        mockSybilGuard.setBanned(buyer, true);

        vm.prank(buyer);
        vm.expectRevert("SkillRegistry: banned");
        skillRegistry.purchaseSkill(skillId);
    }

    // ═══════════════════════════════════════════════════════════════
    //  6. RENEW SUBSCRIPTION
    // ═══════════════════════════════════════════════════════════════

    function test_RenewSubscription_HappyPath() public {
        ISkillRegistry.ListSkillParams memory params = _defaultParams();
        params.pricingModel = ISkillRegistry.PricingModel.SUBSCRIPTION;
        vm.prank(seller);
        uint256 skillId = skillRegistry.listSkill(params, "Sub", "Desc", "ipfs://m", _emptyDeps());

        vm.startPrank(buyer);
        token.approve(address(skillRegistry), 100 ether);
        uint256 accessId = skillRegistry.purchaseSkill(skillId);
        vm.stopPrank();

        uint256 originalExpiry = block.timestamp + 30 days;

        // Only buyer can renew
        vm.prank(buyer);
        skillRegistry.renewSubscription(accessId);

        ISkillRegistry.AccessRecord memory access = skillRegistry.getAccess(accessId);
        assertEq(access.expiresAt, originalExpiry + 30 days);
    }

    function test_RenewSubscription_RevertNotBuyer() public {
        ISkillRegistry.ListSkillParams memory params = _defaultParams();
        params.pricingModel = ISkillRegistry.PricingModel.SUBSCRIPTION;
        vm.prank(seller);
        uint256 skillId = skillRegistry.listSkill(params, "Sub", "Desc", "ipfs://m", _emptyDeps());

        vm.startPrank(buyer);
        token.approve(address(skillRegistry), 100 ether);
        uint256 accessId = skillRegistry.purchaseSkill(skillId);
        vm.stopPrank();

        // Third party cannot renew (drains buyer's allowance)
        vm.prank(nobody);
        vm.expectRevert("SkillRegistry: not buyer");
        skillRegistry.renewSubscription(accessId);
    }

    function test_RenewSubscription_ExtendFromExpiry() public {
        ISkillRegistry.ListSkillParams memory params = _defaultParams();
        params.pricingModel = ISkillRegistry.PricingModel.SUBSCRIPTION;
        vm.prank(seller);
        uint256 skillId = skillRegistry.listSkill(params, "Sub", "Desc", "ipfs://m", _emptyDeps());

        vm.startPrank(buyer);
        token.approve(address(skillRegistry), 150 ether);
        uint256 accessId = skillRegistry.purchaseSkill(skillId);
        vm.stopPrank();

        // Read on-chain values to avoid via_ir timestamp caching
        ISkillRegistry.AccessRecord memory access0 = skillRegistry.getAccess(accessId);
        uint256 originalExpiry = access0.expiresAt;

        // Warp 15 days after purchase — still within subscription period
        vm.warp(access0.purchasedAt + 15 days);
        vm.prank(buyer);
        skillRegistry.renewSubscription(accessId);

        ISkillRegistry.AccessRecord memory access = skillRegistry.getAccess(accessId);
        assertEq(access.expiresAt, originalExpiry + 30 days);
    }

    function test_RenewSubscription_ExpiredExtendFromNow() public {
        ISkillRegistry.ListSkillParams memory params = _defaultParams();
        params.pricingModel = ISkillRegistry.PricingModel.SUBSCRIPTION;
        vm.prank(seller);
        uint256 skillId = skillRegistry.listSkill(params, "Sub", "Desc", "ipfs://m", _emptyDeps());

        vm.startPrank(buyer);
        token.approve(address(skillRegistry), 200 ether);
        uint256 accessId = skillRegistry.purchaseSkill(skillId);
        vm.stopPrank();

        // V-001: Warp 90 days past purchase — subscription expired 60 days ago
        vm.warp(block.timestamp + 90 days);
        assertFalse(skillRegistry.hasActiveAccess(buyer, skillId));

        // Renew once — should extend from NOW, not from old expiry
        vm.prank(buyer);
        skillRegistry.renewSubscription(accessId);

        // User should have active access immediately after one payment
        assertTrue(skillRegistry.hasActiveAccess(buyer, skillId));

        ISkillRegistry.AccessRecord memory access = skillRegistry.getAccess(accessId);
        assertEq(access.expiresAt, block.timestamp + 30 days);
    }

    function test_RenewSubscription_RevertNotSubscription() public {
        uint256 skillId = _listDefaultSkill();
        vm.startPrank(buyer);
        token.approve(address(escrow), 50 ether);
        uint256 accessId = skillRegistry.purchaseSkill(skillId);
        vm.stopPrank();

        vm.expectRevert("SkillRegistry: not subscription");
        skillRegistry.renewSubscription(accessId);
    }

    function test_RenewSubscription_RevertSkillInactive() public {
        ISkillRegistry.ListSkillParams memory params = _defaultParams();
        params.pricingModel = ISkillRegistry.PricingModel.SUBSCRIPTION;
        vm.prank(seller);
        uint256 skillId = skillRegistry.listSkill(params, "Sub", "Desc", "ipfs://m", _emptyDeps());

        vm.startPrank(buyer);
        token.approve(address(skillRegistry), 100 ether);
        uint256 accessId = skillRegistry.purchaseSkill(skillId);
        vm.stopPrank();

        // Deactivate skill
        vm.prank(seller);
        skillRegistry.deactivateSkill(skillId);

        vm.prank(buyer);
        vm.expectRevert("SkillRegistry: skill inactive");
        skillRegistry.renewSubscription(accessId);
    }

    // ═══════════════════════════════════════════════════════════════
    //  7. RECORD USAGE + CREDITS
    // ═══════════════════════════════════════════════════════════════

    function test_RecordUsage_HappyPath() public {
        ISkillRegistry.ListSkillParams memory params = _defaultParams();
        params.pricingModel = ISkillRegistry.PricingModel.PER_CALL;
        params.price = 1 ether; // 1 LOB per call
        vm.prank(seller);
        uint256 skillId = skillRegistry.listSkill(params, "API", "Desc", "ipfs://m", _emptyDeps());

        vm.prank(buyer);
        uint256 accessId = skillRegistry.purchaseSkill(skillId);

        // Deposit credits
        vm.startPrank(buyer);
        token.approve(address(skillRegistry), 100 ether);
        skillRegistry.depositCallCredits(address(token), 100 ether);
        vm.stopPrank();

        assertEq(skillRegistry.getBuyerCredits(buyer, address(token)), 100 ether);

        // Record 5 calls at 1 LOB each = 5 LOB
        vm.prank(gateway);
        skillRegistry.recordUsage(accessId, 5);

        assertEq(skillRegistry.getBuyerCredits(buyer, address(token)), 95 ether);

        ISkillRegistry.AccessRecord memory access = skillRegistry.getAccess(accessId);
        assertEq(access.totalCallsUsed, 5);
        assertEq(access.totalPaid, 5 ether);
    }

    function test_RecordUsage_RevertNotGateway() public {
        vm.prank(nobody);
        vm.expectRevert();
        skillRegistry.recordUsage(1, 5);
    }

    function test_RecordUsage_RevertInsufficientCredits() public {
        ISkillRegistry.ListSkillParams memory params = _defaultParams();
        params.pricingModel = ISkillRegistry.PricingModel.PER_CALL;
        params.price = 1 ether;
        vm.prank(seller);
        uint256 skillId = skillRegistry.listSkill(params, "API", "Desc", "ipfs://m", _emptyDeps());

        vm.prank(buyer);
        uint256 accessId = skillRegistry.purchaseSkill(skillId);

        // No credits deposited
        vm.prank(gateway);
        vm.expectRevert("SkillRegistry: insufficient credits");
        skillRegistry.recordUsage(accessId, 5);
    }

    function test_RecordUsage_CreditsSellerEarnings() public {
        ISkillRegistry.ListSkillParams memory params = _defaultParams();
        params.pricingModel = ISkillRegistry.PricingModel.PER_CALL;
        params.price = 1 ether;
        vm.prank(seller);
        uint256 skillId = skillRegistry.listSkill(params, "API", "Desc", "ipfs://m", _emptyDeps());

        vm.prank(buyer);
        uint256 accessId = skillRegistry.purchaseSkill(skillId);

        vm.startPrank(buyer);
        token.approve(address(skillRegistry), 10 ether);
        skillRegistry.depositCallCredits(address(token), 10 ether);
        vm.stopPrank();

        vm.prank(gateway);
        skillRegistry.recordUsage(accessId, 10);

        // LOB has 0% fee, seller gets all 10 LOB
        uint256 sellerBalBefore = token.balanceOf(seller);
        vm.prank(seller);
        skillRegistry.claimEarnings(address(token));
        assertEq(token.balanceOf(seller), sellerBalBefore + 10 ether);
    }

    // ═══════════════════════════════════════════════════════════════
    //  8. DEPOSIT / WITHDRAW CREDITS + CLAIM EARNINGS
    // ═══════════════════════════════════════════════════════════════

    function test_DepositCallCredits() public {
        vm.startPrank(buyer);
        token.approve(address(skillRegistry), 100 ether);
        skillRegistry.depositCallCredits(address(token), 100 ether);
        vm.stopPrank();

        assertEq(skillRegistry.getBuyerCredits(buyer, address(token)), 100 ether);
    }

    function test_WithdrawCallCredits() public {
        vm.startPrank(buyer);
        token.approve(address(skillRegistry), 100 ether);
        skillRegistry.depositCallCredits(address(token), 100 ether);

        uint256 balBefore = token.balanceOf(buyer);
        skillRegistry.withdrawCallCredits(address(token), 50 ether);
        vm.stopPrank();

        assertEq(skillRegistry.getBuyerCredits(buyer, address(token)), 50 ether);
        assertEq(token.balanceOf(buyer), balBefore + 50 ether);
    }

    function test_WithdrawCallCredits_RevertInsufficient() public {
        vm.prank(buyer);
        vm.expectRevert("SkillRegistry: insufficient credits");
        skillRegistry.withdrawCallCredits(address(token), 1 ether);
    }

    function test_ClaimEarnings_RevertNoEarnings() public {
        vm.prank(seller);
        vm.expectRevert("SkillRegistry: no earnings");
        skillRegistry.claimEarnings(address(token));
    }

    function test_DepositCredits_EmitEvent() public {
        vm.startPrank(buyer);
        token.approve(address(skillRegistry), 100 ether);

        vm.expectEmit(true, true, false, true);
        emit CallCreditsDeposited(buyer, address(token), 100 ether);
        skillRegistry.depositCallCredits(address(token), 100 ether);
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════
    //  9. PAUSE TESTS
    // ═══════════════════════════════════════════════════════════════

    function test_Paused_ListSkillReverts() public {
        vm.prank(admin);
        skillRegistry.pause();

        vm.prank(seller);
        vm.expectRevert("EnforcedPause()");
        skillRegistry.listSkill(
            _defaultParams(),
            "Test",
            "Desc",
            "ipfs://m",
            _emptyDeps()
        );
    }

    function test_Paused_PurchaseReverts() public {
        uint256 skillId = _listDefaultSkill();

        vm.prank(admin);
        skillRegistry.pause();

        vm.prank(buyer);
        vm.expectRevert("EnforcedPause()");
        skillRegistry.purchaseSkill(skillId);
    }

    function test_Unpause_ResumesOperations() public {
        vm.prank(admin);
        skillRegistry.pause();

        vm.prank(admin);
        skillRegistry.unpause();

        uint256 skillId = _listDefaultSkill();
        assertGt(skillId, 0);
    }
}
