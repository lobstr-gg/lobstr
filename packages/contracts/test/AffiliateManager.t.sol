// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/AffiliateManager.sol";
import "../src/LOBToken.sol";

contract MockSybilGuardForAffiliate {
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

contract AffiliateManagerTest is Test {
    event ReferralRegistered(address indexed referrer, address indexed referred, uint256 timestamp);
    event ReferralRewardCredited(address indexed referrer, address indexed token, uint256 amount);
    event RewardsClaimed(address indexed referrer, address indexed token, uint256 amount);

    LOBToken public token;
    AffiliateManager public affiliate;
    MockSybilGuardForAffiliate public sybilGuard;

    address public admin = makeAddr("admin");
    address public distributor = makeAddr("distributor");
    address public creditor = makeAddr("creditor");
    address public referrer = makeAddr("referrer");
    address public referred = makeAddr("referred");
    address public thirdParty = makeAddr("thirdParty");

    function setUp() public {
        vm.startPrank(admin);
        token = new LOBToken(distributor);
        sybilGuard = new MockSybilGuardForAffiliate();
        affiliate = new AffiliateManager(address(sybilGuard));
        affiliate.grantRole(affiliate.CREDITOR_ROLE(), creditor);
        vm.stopPrank();

        // Fund the affiliate contract with rewards
        vm.startPrank(distributor);
        token.transfer(address(affiliate), 100_000 ether);
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════
    //  REGISTER REFERRAL
    // ═══════════════════════════════════════════════════════════════

    function test_registerReferral() public {
        vm.prank(referrer);
        affiliate.registerReferral(referred);

        IAffiliateManager.ReferralInfo memory info = affiliate.getReferralInfo(referred);
        assertEq(info.referrer, referrer);
        assertEq(info.registeredAt, block.timestamp);

        IAffiliateManager.ReferrerStats memory stats = affiliate.getReferrerStats(referrer);
        assertEq(stats.totalReferred, 1);
    }

    function test_registerMultipleReferrals() public {
        address referred2 = makeAddr("referred2");

        vm.prank(referrer);
        affiliate.registerReferral(referred);

        vm.prank(referrer);
        affiliate.registerReferral(referred2);

        IAffiliateManager.ReferrerStats memory stats = affiliate.getReferrerStats(referrer);
        assertEq(stats.totalReferred, 2);
    }

    function test_revertSelfReferral() public {
        vm.prank(referrer);
        vm.expectRevert("AffiliateManager: self-referral");
        affiliate.registerReferral(referrer);
    }

    function test_revertAlreadyReferred() public {
        vm.prank(referrer);
        affiliate.registerReferral(referred);

        vm.prank(thirdParty);
        vm.expectRevert("AffiliateManager: already referred");
        affiliate.registerReferral(referred);
    }

    function test_revertReferrerBanned() public {
        sybilGuard.setBanned(referrer, true);

        vm.prank(referrer);
        vm.expectRevert("AffiliateManager: referrer banned");
        affiliate.registerReferral(referred);
    }

    function test_revertReferredBanned() public {
        sybilGuard.setBanned(referred, true);

        vm.prank(referrer);
        vm.expectRevert("AffiliateManager: referred banned");
        affiliate.registerReferral(referred);
    }

    // ═══════════════════════════════════════════════════════════════
    //  CREDIT REWARD
    // ═══════════════════════════════════════════════════════════════

    function test_creditReferralReward() public {
        vm.prank(creditor);
        affiliate.creditReferralReward(referrer, address(token), 500 ether);

        assertEq(affiliate.claimableBalance(referrer, address(token)), 500 ether);

        IAffiliateManager.ReferrerStats memory stats = affiliate.getReferrerStats(referrer);
        assertEq(stats.totalRewardsCredited, 500 ether);
        assertEq(stats.pendingRewards, 500 ether);
    }

    function test_revertUnauthorizedCredit() public {
        vm.prank(thirdParty);
        vm.expectRevert();
        affiliate.creditReferralReward(referrer, address(token), 500 ether);
    }

    function test_revertCreditZeroAmount() public {
        vm.prank(creditor);
        vm.expectRevert("AffiliateManager: zero amount");
        affiliate.creditReferralReward(referrer, address(token), 0);
    }

    function test_revertCreditZeroReferrer() public {
        vm.prank(creditor);
        vm.expectRevert("AffiliateManager: zero referrer");
        affiliate.creditReferralReward(address(0), address(token), 100 ether);
    }

    // ═══════════════════════════════════════════════════════════════
    //  CLAIM REWARDS
    // ═══════════════════════════════════════════════════════════════

    function test_claimRewards() public {
        vm.prank(creditor);
        affiliate.creditReferralReward(referrer, address(token), 500 ether);

        uint256 balBefore = token.balanceOf(referrer);

        vm.prank(referrer);
        affiliate.claimRewards(address(token));

        assertEq(token.balanceOf(referrer), balBefore + 500 ether);
        assertEq(affiliate.claimableBalance(referrer, address(token)), 0);

        IAffiliateManager.ReferrerStats memory stats = affiliate.getReferrerStats(referrer);
        assertEq(stats.totalRewardsClaimed, 500 ether);
        assertEq(stats.pendingRewards, 0);
    }

    function test_revertClaimZero() public {
        vm.prank(referrer);
        vm.expectRevert("AffiliateManager: nothing to claim");
        affiliate.claimRewards(address(token));
    }

    // ═══════════════════════════════════════════════════════════════
    //  STATS ACCUMULATION
    // ═══════════════════════════════════════════════════════════════

    function test_statsAccumulation() public {
        vm.startPrank(creditor);
        affiliate.creditReferralReward(referrer, address(token), 200 ether);
        affiliate.creditReferralReward(referrer, address(token), 300 ether);
        vm.stopPrank();

        IAffiliateManager.ReferrerStats memory stats = affiliate.getReferrerStats(referrer);
        assertEq(stats.totalRewardsCredited, 500 ether);
        assertEq(stats.pendingRewards, 500 ether);

        vm.prank(referrer);
        affiliate.claimRewards(address(token));

        stats = affiliate.getReferrerStats(referrer);
        assertEq(stats.totalRewardsClaimed, 500 ether);
        assertEq(stats.pendingRewards, 0);
    }

    // ═══════════════════════════════════════════════════════════════
    //  EVENTS
    // ═══════════════════════════════════════════════════════════════

    function test_emitsReferralRegistered() public {
        vm.expectEmit(true, true, false, true);
        emit ReferralRegistered(referrer, referred, block.timestamp);

        vm.prank(referrer);
        affiliate.registerReferral(referred);
    }

    function test_emitsRewardCredited() public {
        vm.expectEmit(true, true, false, true);
        emit ReferralRewardCredited(referrer, address(token), 500 ether);

        vm.prank(creditor);
        affiliate.creditReferralReward(referrer, address(token), 500 ether);
    }

    function test_emitsRewardsClaimed() public {
        vm.prank(creditor);
        affiliate.creditReferralReward(referrer, address(token), 500 ether);

        vm.expectEmit(true, true, false, true);
        emit RewardsClaimed(referrer, address(token), 500 ether);

        vm.prank(referrer);
        affiliate.claimRewards(address(token));
    }

    // ═══════════════════════════════════════════════════════════════
    //  PAUSE
    // ═══════════════════════════════════════════════════════════════

    function test_pauseBlocksRegister() public {
        vm.prank(admin);
        affiliate.pause();

        vm.prank(referrer);
        vm.expectRevert("Pausable: paused");
        affiliate.registerReferral(referred);
    }

    function test_pauseBlocksCredit() public {
        vm.prank(admin);
        affiliate.pause();

        vm.prank(creditor);
        vm.expectRevert("Pausable: paused");
        affiliate.creditReferralReward(referrer, address(token), 100 ether);
    }

    // ═══════════════════════════════════════════════════════════════
    //  CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════

    function test_revertZeroSybilGuard() public {
        vm.expectRevert("AffiliateManager: zero sybilGuard");
        new AffiliateManager(address(0));
    }
}
