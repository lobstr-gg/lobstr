// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/BondingEngine.sol";
import "../src/LOBToken.sol";

// ═══════════════════════════════════════════════════════════════
//  MOCKS
// ═══════════════════════════════════════════════════════════════

contract MockStakingManagerForBonds {
    mapping(address => IStakingManager.Tier) private _tiers;
    mapping(address => uint256) private _stakes;
    mapping(address => uint256) private _unstakeRequestAmounts;

    function setTier(address user, IStakingManager.Tier tier) external {
        _tiers[user] = tier;
    }

    function setStake(address user, uint256 amount) external {
        _stakes[user] = amount;
    }

    function setUnstakeRequest(address user, uint256 amount) external {
        _unstakeRequestAmounts[user] = amount;
    }

    function getTier(address user) external view returns (IStakingManager.Tier) {
        return _tiers[user];
    }

    function getStake(address user) external view returns (uint256) {
        return _stakes[user];
    }

    function getStakeInfo(address user) external view returns (IStakingManager.StakeInfo memory) {
        return IStakingManager.StakeInfo(_stakes[user], 0, _unstakeRequestAmounts[user]);
    }

    function lockStake(address, uint256) external {}
    function unlockStake(address, uint256) external {}
    function getLockedStake(address) external pure returns (uint256) { return 0; }
    function getUnlockedStake(address user) external view returns (uint256) { return _stakes[user]; }
}

contract MockSybilGuardForBonds {
    mapping(address => bool) public banned;

    function checkBanned(address user) external view returns (bool) {
        return banned[user];
    }

    function checkAnyBanned(address[] calldata) external pure returns (bool) {
        return false;
    }

    function setBanned(address user, bool status) external {
        banned[user] = status;
    }
}

contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @dev Fee-on-transfer token: 1% fee on every transfer
contract FeeOnTransferToken is ERC20 {
    constructor() ERC20("Fee Token", "FEE") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        _spendAllowance(from, _msgSender(), amount);
        uint256 fee = amount / 100; // 1% fee
        _transfer(from, to, amount - fee);
        _burn(from, fee); // burn the fee
        return true;
    }
}

// ═══════════════════════════════════════════════════════════════
//  TESTS
// ═══════════════════════════════════════════════════════════════

contract BondingEngineTest is Test {
    // Re-declare events for expectEmit
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

    LOBToken public lobToken;
    MockUSDC public usdc;
    BondingEngine public bonding;
    MockStakingManagerForBonds public stakingManager;
    MockSybilGuardForBonds public sybilGuard;

    address public admin = makeAddr("admin");
    address public distributor = makeAddr("distributor");
    address public treasuryAddr = makeAddr("treasury");
    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");

    // Default market params
    uint256 constant PRICE_PER_LOB = 10000; // 0.01 USDC in 6-decimal wei
    uint256 constant DISCOUNT_BPS = 1000;   // 10%
    uint256 constant VESTING = 7 days;
    uint256 constant CAPACITY = 500_000 ether; // 500K LOB

    function setUp() public {
        vm.startPrank(admin);

        lobToken = new LOBToken(distributor);
        usdc = new MockUSDC();
        stakingManager = new MockStakingManagerForBonds();
        sybilGuard = new MockSybilGuardForBonds();

        bonding = new BondingEngine(
            address(lobToken),
            address(stakingManager),
            address(sybilGuard),
            treasuryAddr
        );

        bonding.grantRole(bonding.MARKET_ADMIN_ROLE(), admin);
        vm.stopPrank();

        // Fund bonding engine with 1M LOB
        vm.prank(distributor);
        lobToken.transfer(admin, 1_000_000 ether);
        vm.startPrank(admin);
        lobToken.approve(address(bonding), 1_000_000 ether);
        bonding.depositLOB(1_000_000 ether);

        // Create default USDC market
        bonding.createMarket(address(usdc), PRICE_PER_LOB, DISCOUNT_BPS, VESTING, CAPACITY, 0);
        vm.stopPrank();

        // Mint USDC to alice/bob
        usdc.mint(alice, 1_000_000e6);
        usdc.mint(bob, 1_000_000e6);
    }

    // ═══════════════════════════════════════════════════════════════
    //  HELPERS
    // ═══════════════════════════════════════════════════════════════

    function _purchase(address buyer, uint256 marketId, uint256 quoteAmount) internal returns (uint256) {
        vm.startPrank(buyer);
        usdc.approve(address(bonding), quoteAmount);
        uint256 bondId = bonding.purchase(marketId, quoteAmount);
        vm.stopPrank();
        return bondId;
    }

    // ═══════════════════════════════════════════════════════════════
    //  CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════

    function test_constructorSetsImmutables() public view {
        assertEq(address(bonding.lobToken()), address(lobToken));
        assertEq(address(bonding.stakingManager()), address(stakingManager));
        assertEq(address(bonding.sybilGuard()), address(sybilGuard));
        assertEq(bonding.treasury(), treasuryAddr);
    }

    function test_revertZeroLobToken() public {
        vm.expectRevert("BondingEngine: zero lobToken");
        new BondingEngine(address(0), address(stakingManager), address(sybilGuard), treasuryAddr);
    }

    function test_revertZeroStakingManager() public {
        vm.expectRevert("BondingEngine: zero stakingManager");
        new BondingEngine(address(lobToken), address(0), address(sybilGuard), treasuryAddr);
    }

    function test_revertZeroSybilGuard() public {
        vm.expectRevert("BondingEngine: zero sybilGuard");
        new BondingEngine(address(lobToken), address(stakingManager), address(0), treasuryAddr);
    }

    function test_revertZeroTreasury() public {
        vm.expectRevert("BondingEngine: zero treasury");
        new BondingEngine(address(lobToken), address(stakingManager), address(sybilGuard), address(0));
    }

    // ═══════════════════════════════════════════════════════════════
    //  MARKET MANAGEMENT
    // ═══════════════════════════════════════════════════════════════

    function test_createMarket() public view {
        IBondingEngine.BondMarket memory m = bonding.getMarket(1);
        assertEq(m.quoteToken, address(usdc));
        assertEq(m.pricePer1LOB, PRICE_PER_LOB);
        assertEq(m.discountBps, DISCOUNT_BPS);
        assertEq(m.vestingPeriod, VESTING);
        assertEq(m.capacity, CAPACITY);
        assertEq(m.sold, 0);
        assertTrue(m.active);
        assertEq(bonding.marketCount(), 1);
    }

    function test_closeMarket() public {
        vm.prank(admin);
        bonding.closeMarket(1);

        IBondingEngine.BondMarket memory m = bonding.getMarket(1);
        assertFalse(m.active);
    }

    function test_updateMarketPrice() public {
        vm.prank(admin);
        bonding.updateMarketPrice(1, 20000);

        IBondingEngine.BondMarket memory m = bonding.getMarket(1);
        assertEq(m.pricePer1LOB, 20000);
    }

    function test_revertCreateMarketVestingTooShort() public {
        vm.prank(admin);
        vm.expectRevert("BondingEngine: vesting too short");
        bonding.createMarket(address(usdc), PRICE_PER_LOB, DISCOUNT_BPS, 1 days, CAPACITY, 0);
    }

    function test_revertCreateMarketDiscountTooHigh() public {
        vm.prank(admin);
        vm.expectRevert("BondingEngine: discount too high");
        bonding.createMarket(address(usdc), PRICE_PER_LOB, 2500, VESTING, CAPACITY, 0);
    }

    function test_revertCloseAlreadyClosed() public {
        vm.startPrank(admin);
        bonding.closeMarket(1);
        vm.expectRevert("BondingEngine: already closed");
        bonding.closeMarket(1);
        vm.stopPrank();
    }

    function test_revertUpdatePriceClosedMarket() public {
        vm.startPrank(admin);
        bonding.closeMarket(1);
        vm.expectRevert("BondingEngine: market closed");
        bonding.updateMarketPrice(1, 20000);
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════
    //  LOB FUNDING
    // ═══════════════════════════════════════════════════════════════

    function test_depositLOB() public view {
        // Already deposited 1M in setUp
        assertEq(lobToken.balanceOf(address(bonding)), 1_000_000 ether);
    }

    function test_withdrawLOBSurplus() public {
        // No bonds, entire balance is surplus — goes to treasury
        vm.prank(admin);
        bonding.withdrawLOB(100_000 ether);
        assertEq(lobToken.balanceOf(address(bonding)), 900_000 ether);
        assertEq(lobToken.balanceOf(treasuryAddr), 100_000 ether);
    }

    function test_revertWithdrawExceedsSurplus() public {
        // Purchase to lock some LOB
        _purchase(alice, 1, 100e6); // locks some LOB as outstanding
        uint256 outstanding = bonding.totalOutstandingLOB();
        uint256 surplus = lobToken.balanceOf(address(bonding)) - outstanding;

        vm.prank(admin);
        vm.expectRevert("BondingEngine: exceeds surplus");
        bonding.withdrawLOB(surplus + 1);
    }

    // ═══════════════════════════════════════════════════════════════
    //  PURCHASE
    // ═══════════════════════════════════════════════════════════════

    function test_purchaseBasic() public {
        // 100 USDC, 10% discount, no tier bonus
        // discountedPrice = 10000 * 9000 / 10000 = 9000
        // payout = 100_000_000 * 1e18 / 9000 = ~11111.11 LOB
        uint256 bondId = _purchase(alice, 1, 100e6);

        assertEq(bondId, 1);
        assertEq(bonding.bondCount(), 1);

        IBondingEngine.BondPosition memory bond = bonding.getBond(1);
        assertEq(bond.owner, alice);
        assertEq(bond.marketId, 1);

        uint256 expectedPayout = uint256(100e6) * 1e18 / 9000;
        assertEq(bond.payout, expectedPayout);
        assertEq(bond.claimed, 0);

        // USDC moved to bonding engine
        assertEq(usdc.balanceOf(address(bonding)), 100e6);

        // Outstanding LOB updated
        assertEq(bonding.totalOutstandingLOB(), expectedPayout);
    }

    function test_purchaseWithTierBonus() public {
        stakingManager.setTier(alice, IStakingManager.Tier.Gold);

        // 10% base + 2% Gold = 12%
        // discountedPrice = 10000 * 8800 / 10000 = 8800
        // payout = 100_000_000 * 1e18 / 8800
        uint256 bondId = _purchase(alice, 1, 100e6);

        IBondingEngine.BondPosition memory bond = bonding.getBond(bondId);
        uint256 expectedPayout = uint256(100e6) * 1e18 / 8800;
        assertEq(bond.payout, expectedPayout);
    }

    function test_purchaseSilverBonus() public {
        stakingManager.setTier(alice, IStakingManager.Tier.Silver);

        // 10% base + 1% Silver = 11%
        uint256 discount = bonding.effectiveDiscount(1, alice);
        assertEq(discount, 1100);
    }

    function test_purchasePlatinumBonus() public {
        stakingManager.setTier(alice, IStakingManager.Tier.Platinum);

        // 10% base + 3% Platinum = 13%
        uint256 discount = bonding.effectiveDiscount(1, alice);
        assertEq(discount, 1300);
    }

    function test_revertPurchaseExceedsCapacity() public {
        // Create a tiny market
        vm.prank(admin);
        uint256 smallMarketId = bonding.createMarket(address(usdc), PRICE_PER_LOB, DISCOUNT_BPS, VESTING, 1 ether, 0);

        // Try to buy more LOB than capacity
        vm.startPrank(alice);
        usdc.approve(address(bonding), 1_000_000e6);
        vm.expectRevert("BondingEngine: exceeds capacity");
        bonding.purchase(smallMarketId, 1_000_000e6);
        vm.stopPrank();
    }

    function test_revertPurchaseInsufficientReserve() public {
        // Withdraw most LOB so reserve is low
        vm.prank(admin);
        bonding.withdrawLOB(999_999 ether);

        // Now try to purchase more than remaining reserve
        vm.startPrank(alice);
        usdc.approve(address(bonding), 100e6);
        vm.expectRevert("BondingEngine: insufficient LOB reserve");
        bonding.purchase(1, 100e6);
        vm.stopPrank();
    }

    function test_revertPurchaseBanned() public {
        sybilGuard.setBanned(alice, true);

        vm.startPrank(alice);
        usdc.approve(address(bonding), 100e6);
        vm.expectRevert("BondingEngine: banned");
        bonding.purchase(1, 100e6);
        vm.stopPrank();
    }

    function test_revertPurchaseClosedMarket() public {
        vm.prank(admin);
        bonding.closeMarket(1);

        vm.startPrank(alice);
        usdc.approve(address(bonding), 100e6);
        vm.expectRevert("BondingEngine: market not active");
        bonding.purchase(1, 100e6);
        vm.stopPrank();
    }

    function test_revertPurchaseZeroAmount() public {
        vm.prank(alice);
        vm.expectRevert("BondingEngine: zero quoteAmount");
        bonding.purchase(1, 0);
    }

    // ═══════════════════════════════════════════════════════════════
    //  VESTING & CLAIM
    // ═══════════════════════════════════════════════════════════════

    function test_linearVesting50Percent() public {
        uint256 bondId = _purchase(alice, 1, 100e6);
        IBondingEngine.BondPosition memory bond = bonding.getBond(bondId);

        // Warp 50% through vesting
        vm.warp(block.timestamp + VESTING / 2);

        uint256 claimableAmt = bonding.claimable(bondId);
        assertApproxEqAbs(claimableAmt, bond.payout / 2, 1);
    }

    function test_fullVestingClaim() public {
        uint256 bondId = _purchase(alice, 1, 100e6);
        IBondingEngine.BondPosition memory bond = bonding.getBond(bondId);

        vm.warp(block.timestamp + VESTING);

        vm.prank(alice);
        bonding.claim(bondId);

        assertEq(lobToken.balanceOf(alice), bond.payout);
        assertEq(bonding.totalOutstandingLOB(), 0);
    }

    function test_partialClaimThenFull() public {
        uint256 bondId = _purchase(alice, 1, 100e6);
        IBondingEngine.BondPosition memory bond = bonding.getBond(bondId);

        // Claim at 50%
        vm.warp(block.timestamp + VESTING / 2);
        vm.prank(alice);
        bonding.claim(bondId);
        uint256 firstClaim = lobToken.balanceOf(alice);
        assertApproxEqAbs(firstClaim, bond.payout / 2, 1);

        // Claim at 100%
        vm.warp(block.timestamp + VESTING / 2);
        vm.prank(alice);
        bonding.claim(bondId);
        assertEq(lobToken.balanceOf(alice), bond.payout);
    }

    function test_claimMultiple() public {
        uint256 bondId1 = _purchase(alice, 1, 50e6);
        uint256 bondId2 = _purchase(alice, 1, 50e6);

        IBondingEngine.BondPosition memory b1 = bonding.getBond(bondId1);
        IBondingEngine.BondPosition memory b2 = bonding.getBond(bondId2);

        vm.warp(block.timestamp + VESTING);

        uint256[] memory ids = new uint256[](2);
        ids[0] = bondId1;
        ids[1] = bondId2;

        vm.prank(alice);
        bonding.claimMultiple(ids);

        assertEq(lobToken.balanceOf(alice), b1.payout + b2.payout);
    }

    function test_revertClaimNotOwner() public {
        uint256 bondId = _purchase(alice, 1, 100e6);
        vm.warp(block.timestamp + VESTING);

        vm.prank(bob);
        vm.expectRevert("BondingEngine: not bond owner");
        bonding.claim(bondId);
    }

    function test_revertClaimNothingVested() public {
        uint256 bondId = _purchase(alice, 1, 100e6);

        // No time passed, nothing vested
        vm.prank(alice);
        vm.expectRevert("BondingEngine: nothing claimable");
        bonding.claim(bondId);
    }

    function test_revertClaimBanned() public {
        uint256 bondId = _purchase(alice, 1, 100e6);
        vm.warp(block.timestamp + VESTING);

        sybilGuard.setBanned(alice, true);

        vm.prank(alice);
        vm.expectRevert("BondingEngine: banned");
        bonding.claim(bondId);
    }

    function test_claimAfterFullVestExtraTime() public {
        uint256 bondId = _purchase(alice, 1, 100e6);
        IBondingEngine.BondPosition memory bond = bonding.getBond(bondId);

        // Warp way past vesting end
        vm.warp(block.timestamp + VESTING * 3);

        vm.prank(alice);
        bonding.claim(bondId);
        assertEq(lobToken.balanceOf(alice), bond.payout);
    }

    // ═══════════════════════════════════════════════════════════════
    //  SWEEP
    // ═══════════════════════════════════════════════════════════════

    function test_sweepQuoteTokenToTreasury() public {
        _purchase(alice, 1, 100e6);

        vm.prank(admin);
        bonding.sweepQuoteToken(address(usdc));

        assertEq(usdc.balanceOf(treasuryAddr), 100e6);
        assertEq(usdc.balanceOf(address(bonding)), 0);
    }

    function test_revertSweepLOB() public {
        vm.prank(admin);
        vm.expectRevert("BondingEngine: cannot sweep LOB");
        bonding.sweepQuoteToken(address(lobToken));
    }

    // ═══════════════════════════════════════════════════════════════
    //  PAUSE
    // ═══════════════════════════════════════════════════════════════

    function test_pauseBlocksPurchase() public {
        vm.prank(admin);
        bonding.pause();

        vm.startPrank(alice);
        usdc.approve(address(bonding), 100e6);
        vm.expectRevert("Pausable: paused");
        bonding.purchase(1, 100e6);
        vm.stopPrank();
    }

    function test_pauseBlocksClaim() public {
        uint256 bondId = _purchase(alice, 1, 100e6);
        vm.warp(block.timestamp + VESTING);

        vm.prank(admin);
        bonding.pause();

        vm.prank(alice);
        vm.expectRevert("Pausable: paused");
        bonding.claim(bondId);
    }

    function test_pauseBlocksClaimMultiple() public {
        uint256 bondId = _purchase(alice, 1, 100e6);
        vm.warp(block.timestamp + VESTING);

        vm.prank(admin);
        bonding.pause();

        uint256[] memory ids = new uint256[](1);
        ids[0] = bondId;

        vm.prank(alice);
        vm.expectRevert("Pausable: paused");
        bonding.claimMultiple(ids);
    }

    // ═══════════════════════════════════════════════════════════════
    //  EVENTS
    // ═══════════════════════════════════════════════════════════════

    function test_emitMarketCreated() public {
        vm.prank(admin);
        vm.expectEmit(true, true, false, true);
        emit MarketCreated(2, address(usdc), PRICE_PER_LOB, DISCOUNT_BPS, VESTING, CAPACITY);
        bonding.createMarket(address(usdc), PRICE_PER_LOB, DISCOUNT_BPS, VESTING, CAPACITY, 0);
    }

    function test_emitBondPurchased() public {
        uint256 discountedPrice = PRICE_PER_LOB * 9000 / 10000;
        uint256 payout = uint256(100e6) * 1e18 / discountedPrice;

        vm.startPrank(alice);
        usdc.approve(address(bonding), 100e6);
        vm.expectEmit(true, true, true, true);
        emit BondPurchased(1, 1, alice, 100e6, payout, block.timestamp + VESTING);
        bonding.purchase(1, 100e6);
        vm.stopPrank();
    }

    function test_emitBondClaimed() public {
        uint256 bondId = _purchase(alice, 1, 100e6);
        IBondingEngine.BondPosition memory bond = bonding.getBond(bondId);

        vm.warp(block.timestamp + VESTING);

        vm.prank(alice);
        vm.expectEmit(true, true, false, true);
        emit BondClaimed(bondId, alice, bond.payout);
        bonding.claim(bondId);
    }

    // ═══════════════════════════════════════════════════════════════
    //  VIEWS
    // ═══════════════════════════════════════════════════════════════

    function test_getBondsByOwner() public {
        _purchase(alice, 1, 50e6);
        _purchase(alice, 1, 50e6);
        _purchase(bob, 1, 50e6);

        uint256[] memory aliceBonds = bonding.getBondsByOwner(alice);
        uint256[] memory bobBonds = bonding.getBondsByOwner(bob);

        assertEq(aliceBonds.length, 2);
        assertEq(aliceBonds[0], 1);
        assertEq(aliceBonds[1], 2);
        assertEq(bobBonds.length, 1);
        assertEq(bobBonds[0], 3);
    }

    function test_effectiveDiscountCapped() public {
        // Create market with 19% base discount
        vm.prank(admin);
        uint256 mId = bonding.createMarket(address(usdc), PRICE_PER_LOB, 1900, VESTING, CAPACITY, 0);

        // Platinum gets +3% = 22%, but capped at 20%
        stakingManager.setTier(alice, IStakingManager.Tier.Platinum);
        uint256 discount = bonding.effectiveDiscount(mId, alice);
        assertEq(discount, 2000); // MAX_DISCOUNT_BPS
    }

    function test_availableLOB() public {
        uint256 beforePurchase = bonding.availableLOB();
        assertEq(beforePurchase, 1_000_000 ether);

        _purchase(alice, 1, 100e6);

        uint256 afterPurchase = bonding.availableLOB();
        assertEq(afterPurchase, 1_000_000 ether - bonding.totalOutstandingLOB());
    }

    function test_marketAndBondCounters() public {
        assertEq(bonding.marketCount(), 1);
        assertEq(bonding.bondCount(), 0);

        _purchase(alice, 1, 50e6);
        assertEq(bonding.bondCount(), 1);

        vm.prank(admin);
        bonding.createMarket(address(usdc), 20000, 500, VESTING, CAPACITY, 0);
        assertEq(bonding.marketCount(), 2);
    }

    // ═══════════════════════════════════════════════════════════════
    //  GAME THEORY: PER-ADDRESS BOND PURCHASE CAP
    // ═══════════════════════════════════════════════════════════════

    function test_addressCap_purchaseWithinCap() public {
        // Create market with 50K LOB cap per address
        vm.prank(admin);
        uint256 mId = bonding.createMarket(address(usdc), PRICE_PER_LOB, DISCOUNT_BPS, VESTING, CAPACITY, 50_000 ether);

        // Small purchase — should succeed
        _purchase(alice, mId, 100e6);

        assertGt(bonding.purchasedByAddress(mId, alice), 0);
    }

    function test_addressCap_revertExceedsCap() public {
        // Create market with tiny 1 LOB cap per address
        vm.prank(admin);
        uint256 mId = bonding.createMarket(address(usdc), PRICE_PER_LOB, DISCOUNT_BPS, VESTING, CAPACITY, 1 ether);

        // 100 USDC at 10% discount = ~11,111 LOB payout > 1 LOB cap
        vm.startPrank(alice);
        usdc.approve(address(bonding), 100e6);
        vm.expectRevert("BondingEngine: exceeds address cap");
        bonding.purchase(mId, 100e6);
        vm.stopPrank();
    }

    function test_addressCap_zeroCap_unlimited() public {
        // Market 1 has addressCap = 0 (unlimited)
        _purchase(alice, 1, 100e6);
        _purchase(alice, 1, 100e6);
        _purchase(alice, 1, 100e6);
        // Should not revert — unlimited purchases
        assertGt(bonding.purchasedByAddress(1, alice), 0);
    }

    // ═══════════════════════════════════════════════════════════════
    //  GAME THEORY: NO TIER BONUS IF UNSTAKE PENDING
    // ═══════════════════════════════════════════════════════════════

    function test_noTierBonus_withPendingUnstake() public {
        stakingManager.setTier(alice, IStakingManager.Tier.Gold);
        stakingManager.setUnstakeRequest(alice, 1000 ether);

        // Gold normally gets +2%, but with pending unstake → 0% bonus
        uint256 discount = bonding.effectiveDiscount(1, alice);
        assertEq(discount, DISCOUNT_BPS); // Base only, no tier bonus
    }

    function test_tierBonus_returnsAfterUnstakeCleared() public {
        stakingManager.setTier(alice, IStakingManager.Tier.Gold);
        stakingManager.setUnstakeRequest(alice, 1000 ether);

        // With pending unstake — no bonus
        uint256 discountBefore = bonding.effectiveDiscount(1, alice);
        assertEq(discountBefore, DISCOUNT_BPS);

        // Clear unstake request
        stakingManager.setUnstakeRequest(alice, 0);

        // Now should get Gold bonus
        uint256 discountAfter = bonding.effectiveDiscount(1, alice);
        assertEq(discountAfter, DISCOUNT_BPS + bonding.GOLD_BONUS_BPS());
    }

    // ═══════════════════════════════════════════════════════════════
    //  V-003: FEE-ON-TRANSFER TOKEN DEFENSE
    // ═══════════════════════════════════════════════════════════════

    function test_feeOnTransfer_payoutBasedOnReceived() public {
        FeeOnTransferToken feeToken = new FeeOnTransferToken();
        feeToken.mint(alice, 1_000_000e6);

        // Create market with fee-on-transfer quote token
        vm.prank(admin);
        uint256 feeMarketId = bonding.createMarket(address(feeToken), PRICE_PER_LOB, DISCOUNT_BPS, VESTING, CAPACITY, 0);

        uint256 quoteAmount = 100e6;
        uint256 expectedReceived = quoteAmount - quoteAmount / 100; // 99e6 after 1% fee

        vm.startPrank(alice);
        feeToken.approve(address(bonding), quoteAmount);
        uint256 bondId = bonding.purchase(feeMarketId, quoteAmount);
        vm.stopPrank();

        IBondingEngine.BondPosition memory bond = bonding.getBond(bondId);

        // Payout should be based on actually received tokens (99e6), not nominal (100e6)
        uint256 discountedPrice = PRICE_PER_LOB * (10000 - DISCOUNT_BPS) / 10000;
        uint256 expectedPayout = expectedReceived * 1e18 / discountedPrice;
        assertEq(bond.payout, expectedPayout);

        // Verify the contract received the correct amount
        assertEq(feeToken.balanceOf(address(bonding)), expectedReceived);
    }
}
