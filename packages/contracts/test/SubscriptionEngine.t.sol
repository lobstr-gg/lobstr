// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/SubscriptionEngine.sol";
import "../src/LOBToken.sol";

contract MockUSDC {
    string public name = "USD Coin";
    string public symbol = "USDC";
    uint8 public decimals = 6;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract MockReputationForSub {
    uint256 public completionCount;

    function recordCompletion(address, address) external {
        completionCount++;
    }

    function getScore(address) external pure returns (uint256, IReputationSystem.ReputationTier) {
        return (500, IReputationSystem.ReputationTier.Bronze);
    }
}

contract MockSybilGuardForSub {
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

contract SubscriptionEngineTest is Test {
    event SubscriptionCreated(uint256 indexed id, address indexed buyer, address indexed seller, address token, uint256 amount, uint256 interval, uint256 maxCycles);
    event PaymentProcessed(uint256 indexed id, uint256 cycleNumber, uint256 amount, uint256 fee);
    event SubscriptionCancelled(uint256 indexed id, address cancelledBy);
    event SubscriptionPaused(uint256 indexed id);
    event SubscriptionResumed(uint256 indexed id, uint256 newNextDue);
    event SubscriptionCompleted(uint256 indexed id);

    LOBToken public lobToken;
    MockUSDC public usdc;
    SubscriptionEngine public subEngine;
    MockReputationForSub public reputation;
    MockSybilGuardForSub public sybilGuard;

    address public admin = makeAddr("admin");
    address public distributor = makeAddr("distributor");
    address public treasury = makeAddr("treasury");
    address public buyer = makeAddr("buyer");
    address public seller = makeAddr("seller");
    address public thirdParty = makeAddr("thirdParty");

    function setUp() public {
        vm.startPrank(admin);
        lobToken = new LOBToken();
        lobToken.initialize(distributor);
        usdc = new MockUSDC();
        reputation = new MockReputationForSub();
        sybilGuard = new MockSybilGuardForSub();
        subEngine = new SubscriptionEngine();
        subEngine.initialize(
            address(lobToken),
            address(reputation),
            address(sybilGuard),
            treasury
        );
        vm.stopPrank();

        // Fund buyer with LOB and USDC
        vm.prank(distributor);
        lobToken.transfer(buyer, 100_000 ether);

        usdc.mint(buyer, 100_000e6);
    }

    // ═══════════════════════════════════════════════════════════════
    //  HELPERS
    // ═══════════════════════════════════════════════════════════════

    function _createLobSub(uint256 amount, uint256 interval, uint256 maxCycles) internal returns (uint256) {
        vm.startPrank(buyer);
        lobToken.approve(address(subEngine), amount);
        uint256 id = subEngine.createSubscription(seller, address(lobToken), amount, interval, maxCycles, 1, "ipfs://sub");
        vm.stopPrank();
        return id;
    }

    function _createUsdcSub(uint256 amount, uint256 interval, uint256 maxCycles) internal returns (uint256) {
        vm.startPrank(buyer);
        usdc.approve(address(subEngine), amount);
        uint256 id = subEngine.createSubscription(seller, address(usdc), amount, interval, maxCycles, 1, "ipfs://sub");
        vm.stopPrank();
        return id;
    }

    // ═══════════════════════════════════════════════════════════════
    //  CREATE — LOB (0% FEE)
    // ═══════════════════════════════════════════════════════════════

    function test_createWithLobZeroFee() public {
        uint256 amount = 1000 ether;
        uint256 sellerBefore = lobToken.balanceOf(seller);
        uint256 treasuryBefore = lobToken.balanceOf(treasury);

        uint256 id = _createLobSub(amount, 1 days, 12);

        ISubscriptionEngine.Subscription memory sub = subEngine.getSubscription(id);
        assertEq(sub.buyer, buyer);
        assertEq(sub.seller, seller);
        assertEq(sub.amount, amount);
        assertEq(sub.cyclesCompleted, 1);
        assertEq(uint256(sub.status), uint256(ISubscriptionEngine.SubscriptionStatus.Active));

        // Seller gets full amount, treasury gets nothing
        assertEq(lobToken.balanceOf(seller), sellerBefore + amount);
        assertEq(lobToken.balanceOf(treasury), treasuryBefore);
    }

    // ═══════════════════════════════════════════════════════════════
    //  CREATE — USDC (1.5% FEE)
    // ═══════════════════════════════════════════════════════════════

    function test_createWithUsdcFee() public {
        uint256 amount = 10_000e6; // 10,000 USDC
        uint256 sellerBefore = usdc.balanceOf(seller);
        uint256 treasuryBefore = usdc.balanceOf(treasury);

        _createUsdcSub(amount, 1 days, 12);

        uint256 fee = (amount * 150) / 10000; // 150 USDC
        assertEq(usdc.balanceOf(seller), sellerBefore + amount - fee);
        assertEq(usdc.balanceOf(treasury), treasuryBefore + fee);
    }

    // ═══════════════════════════════════════════════════════════════
    //  PROCESS PAYMENT
    // ═══════════════════════════════════════════════════════════════

    function test_processPayment() public {
        uint256 amount = 1000 ether;
        uint256 id = _createLobSub(amount, 1 days, 12);

        // Approve for next payment
        vm.prank(buyer);
        lobToken.approve(address(subEngine), amount);

        // Read nextDue from contract state (external call is opaque to via_ir optimizer)
        ISubscriptionEngine.Subscription memory subBefore = subEngine.getSubscription(id);
        vm.warp(subBefore.nextDue);

        subEngine.processPayment(id);

        ISubscriptionEngine.Subscription memory sub = subEngine.getSubscription(id);
        assertEq(sub.cyclesCompleted, 2);
        assertEq(sub.nextDue, subBefore.nextDue + 1 days);
    }

    function test_revertProcessNotDue() public {
        uint256 id = _createLobSub(1000 ether, 1 days, 12);

        vm.expectRevert("SubscriptionEngine: not due");
        subEngine.processPayment(id);
    }

    function test_revertProcessCancelled() public {
        uint256 id = _createLobSub(1000 ether, 1 days, 12);

        vm.prank(buyer);
        subEngine.cancelSubscription(id);

        vm.warp(block.timestamp + 1 days);

        vm.expectRevert("SubscriptionEngine: not active");
        subEngine.processPayment(id);
    }

    function test_revertProcessPaused() public {
        uint256 id = _createLobSub(1000 ether, 1 days, 12);

        vm.prank(buyer);
        subEngine.pauseSubscription(id);

        vm.warp(block.timestamp + 1 days);

        vm.expectRevert("SubscriptionEngine: not active");
        subEngine.processPayment(id);
    }

    // ═══════════════════════════════════════════════════════════════
    //  COMPLETION AT MAX CYCLES
    // ═══════════════════════════════════════════════════════════════

    function test_completionAtMaxCycles() public {
        uint256 amount = 100 ether;
        uint256 id = _createLobSub(amount, 1 hours, 3); // 3 cycles, first already paid

        for (uint256 i = 0; i < 2; i++) {
            vm.prank(buyer);
            lobToken.approve(address(subEngine), amount);
            vm.warp(block.timestamp + 1 hours);
            subEngine.processPayment(id);
        }

        ISubscriptionEngine.Subscription memory sub = subEngine.getSubscription(id);
        assertEq(sub.cyclesCompleted, 3);
        assertEq(uint256(sub.status), uint256(ISubscriptionEngine.SubscriptionStatus.Completed));
    }

    function test_reputationRecorded() public {
        uint256 id = _createLobSub(100 ether, 1 hours, 0);

        vm.prank(buyer);
        lobToken.approve(address(subEngine), 100 ether);
        vm.warp(block.timestamp + 1 hours);

        subEngine.processPayment(id);

        assertEq(reputation.completionCount(), 1);
    }

    // ═══════════════════════════════════════════════════════════════
    //  CANCEL
    // ═══════════════════════════════════════════════════════════════

    function test_cancelByBuyer() public {
        uint256 id = _createLobSub(100 ether, 1 days, 0);

        vm.prank(buyer);
        subEngine.cancelSubscription(id);

        ISubscriptionEngine.Subscription memory sub = subEngine.getSubscription(id);
        assertEq(uint256(sub.status), uint256(ISubscriptionEngine.SubscriptionStatus.Cancelled));
    }

    function test_cancelBySeller() public {
        uint256 id = _createLobSub(100 ether, 1 days, 0);

        vm.prank(seller);
        subEngine.cancelSubscription(id);

        ISubscriptionEngine.Subscription memory sub = subEngine.getSubscription(id);
        assertEq(uint256(sub.status), uint256(ISubscriptionEngine.SubscriptionStatus.Cancelled));
    }

    function test_revertCancelByThirdParty() public {
        uint256 id = _createLobSub(100 ether, 1 days, 0);

        vm.prank(thirdParty);
        vm.expectRevert("SubscriptionEngine: not authorized");
        subEngine.cancelSubscription(id);
    }

    // ═══════════════════════════════════════════════════════════════
    //  PAUSE / RESUME
    // ═══════════════════════════════════════════════════════════════

    function test_pauseAndResume() public {
        uint256 id = _createLobSub(100 ether, 1 days, 0);

        vm.prank(buyer);
        subEngine.pauseSubscription(id);

        ISubscriptionEngine.Subscription memory sub = subEngine.getSubscription(id);
        assertEq(uint256(sub.status), uint256(ISubscriptionEngine.SubscriptionStatus.Paused));

        vm.prank(buyer);
        subEngine.resumeSubscription(id);

        sub = subEngine.getSubscription(id);
        assertEq(uint256(sub.status), uint256(ISubscriptionEngine.SubscriptionStatus.Active));
        assertEq(sub.nextDue, block.timestamp + 1 days);
    }

    function test_revertPauseNotBuyer() public {
        uint256 id = _createLobSub(100 ether, 1 days, 0);

        vm.prank(seller);
        vm.expectRevert("SubscriptionEngine: not buyer");
        subEngine.pauseSubscription(id);
    }

    function test_revertResumeNotPaused() public {
        uint256 id = _createLobSub(100 ether, 1 days, 0);

        vm.prank(buyer);
        vm.expectRevert("SubscriptionEngine: not paused");
        subEngine.resumeSubscription(id);
    }

    // ═══════════════════════════════════════════════════════════════
    //  MULTIPLE CYCLES IN SEQUENCE
    // ═══════════════════════════════════════════════════════════════

    function test_multipleCyclesInSequence() public {
        uint256 amount = 100 ether;
        uint256 id = _createLobSub(amount, 1 hours, 0);
        uint256 sellerBefore = lobToken.balanceOf(seller);

        for (uint256 i = 0; i < 5; i++) {
            vm.prank(buyer);
            lobToken.approve(address(subEngine), amount);
            ISubscriptionEngine.Subscription memory subState = subEngine.getSubscription(id);
            vm.warp(subState.nextDue);
            subEngine.processPayment(id);
        }

        ISubscriptionEngine.Subscription memory sub = subEngine.getSubscription(id);
        assertEq(sub.cyclesCompleted, 6); // 1 initial + 5 processed

        // Seller received 5 more payments (first was in createSubscription)
        assertEq(lobToken.balanceOf(seller), sellerBefore + (amount * 5));
    }

    // ═══════════════════════════════════════════════════════════════
    //  REVERTS
    // ═══════════════════════════════════════════════════════════════

    function test_revertBuyerIsSeller() public {
        vm.startPrank(buyer);
        lobToken.approve(address(subEngine), 100 ether);
        vm.expectRevert("SubscriptionEngine: buyer is seller");
        subEngine.createSubscription(buyer, address(lobToken), 100 ether, 1 days, 0, 1, "");
        vm.stopPrank();
    }

    function test_revertZeroAmount() public {
        vm.startPrank(buyer);
        vm.expectRevert("SubscriptionEngine: zero amount");
        subEngine.createSubscription(seller, address(lobToken), 0, 1 days, 0, 1, "");
        vm.stopPrank();
    }

    function test_revertIntervalTooShort() public {
        vm.startPrank(buyer);
        lobToken.approve(address(subEngine), 100 ether);
        vm.expectRevert("SubscriptionEngine: interval too short");
        subEngine.createSubscription(seller, address(lobToken), 100 ether, 30 minutes, 0, 1, "");
        vm.stopPrank();
    }

    function test_revertBuyerBanned() public {
        sybilGuard.setBanned(buyer, true);

        vm.startPrank(buyer);
        lobToken.approve(address(subEngine), 100 ether);
        vm.expectRevert("SubscriptionEngine: buyer banned");
        subEngine.createSubscription(seller, address(lobToken), 100 ether, 1 days, 0, 1, "");
        vm.stopPrank();
    }

    function test_revertSellerBanned() public {
        sybilGuard.setBanned(seller, true);

        vm.startPrank(buyer);
        lobToken.approve(address(subEngine), 100 ether);
        vm.expectRevert("SubscriptionEngine: seller banned");
        subEngine.createSubscription(seller, address(lobToken), 100 ether, 1 days, 0, 1, "");
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════
    //  VIEWS
    // ═══════════════════════════════════════════════════════════════

    function test_getSubscriptionsByBuyer() public {
        _createLobSub(100 ether, 1 days, 0);
        _createLobSub(200 ether, 1 days, 0);

        uint256[] memory ids = subEngine.getSubscriptionsByBuyer(buyer);
        assertEq(ids.length, 2);
        assertEq(ids[0], 1);
        assertEq(ids[1], 2);
    }

    function test_getSubscriptionsBySeller() public {
        _createLobSub(100 ether, 1 days, 0);

        uint256[] memory ids = subEngine.getSubscriptionsBySeller(seller);
        assertEq(ids.length, 1);
    }

    // ═══════════════════════════════════════════════════════════════
    //  EVENTS
    // ═══════════════════════════════════════════════════════════════

    function test_emitsSubscriptionCreated() public {
        vm.startPrank(buyer);
        lobToken.approve(address(subEngine), 100 ether);

        vm.expectEmit(true, true, true, true);
        emit SubscriptionCreated(1, buyer, seller, address(lobToken), 100 ether, 1 days, 12);
        subEngine.createSubscription(seller, address(lobToken), 100 ether, 1 days, 12, 1, "ipfs://sub");
        vm.stopPrank();
    }

    function test_emitsCancelledEvent() public {
        uint256 id = _createLobSub(100 ether, 1 days, 0);

        vm.expectEmit(true, false, false, true);
        emit SubscriptionCancelled(id, buyer);

        vm.prank(buyer);
        subEngine.cancelSubscription(id);
    }

    // ═══════════════════════════════════════════════════════════════
    //  PAUSE
    // ═══════════════════════════════════════════════════════════════

    function test_contractPauseBlocksCreate() public {
        vm.prank(admin);
        subEngine.pause();

        vm.startPrank(buyer);
        lobToken.approve(address(subEngine), 100 ether);
        vm.expectRevert("EnforcedPause()");
        subEngine.createSubscription(seller, address(lobToken), 100 ether, 1 days, 0, 1, "");
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════
    //  CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════

    function test_revertZeroLobToken() public {
        SubscriptionEngine se = new SubscriptionEngine();
        vm.expectRevert("SubscriptionEngine: zero lobToken");
        se.initialize(address(0), address(reputation), address(sybilGuard), treasury);
    }

    function test_revertZeroReputation() public {
        SubscriptionEngine se = new SubscriptionEngine();
        vm.expectRevert("SubscriptionEngine: zero reputationSystem");
        se.initialize(address(lobToken), address(0), address(sybilGuard), treasury);
    }

    function test_revertZeroSybilGuard() public {
        SubscriptionEngine se = new SubscriptionEngine();
        vm.expectRevert("SubscriptionEngine: zero sybilGuard");
        se.initialize(address(lobToken), address(reputation), address(0), treasury);
    }

    function test_revertZeroTreasury() public {
        SubscriptionEngine se = new SubscriptionEngine();
        vm.expectRevert("SubscriptionEngine: zero treasury");
        se.initialize(address(lobToken), address(reputation), address(sybilGuard), address(0));
    }

    // ═══════════════════════════════════════════════════════════════
    //  V-003: NO ACCELERATED CATCH-UP CHARGING
    // ═══════════════════════════════════════════════════════════════

    function test_noCatchUpCharging() public {
        uint256 amount = 100 ether;
        uint256 id = _createLobSub(amount, 1 hours, 0);

        // Approve enough for many cycles
        vm.prank(buyer);
        lobToken.approve(address(subEngine), amount * 10);

        // Warp 6 hours ahead — subscription is now 6 cycles behind
        vm.warp(block.timestamp + 6 hours);

        // Process one payment — should succeed
        subEngine.processPayment(id);

        ISubscriptionEngine.Subscription memory sub = subEngine.getSubscription(id);
        // nextDue should be block.timestamp + interval (not old due + interval)
        assertEq(sub.nextDue, block.timestamp + 1 hours);

        // Second processPayment should fail since nextDue is now in the future
        vm.expectRevert("SubscriptionEngine: not due");
        subEngine.processPayment(id);
    }

    function test_processWindowExpired() public {
        uint256 id = _createLobSub(100 ether, 1 hours, 0);

        // Warp past the 7-day processing window
        vm.warp(block.timestamp + 8 days);

        vm.expectRevert("SubscriptionEngine: processing window expired");
        subEngine.processPayment(id);
    }
}
