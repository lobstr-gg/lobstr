// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/StakingRewards.sol";
import "../src/LOBToken.sol";
import "./helpers/ProxyTestHelper.sol";

contract MockStakingManagerForRewards {
    mapping(address => uint256) private _stakes;
    mapping(address => IStakingManager.Tier) private _tiers;

    function setStake(address user, uint256 amount) external {
        _stakes[user] = amount;
    }

    function setTier(address user, IStakingManager.Tier tier) external {
        _tiers[user] = tier;
    }

    function getStake(address user) external view returns (uint256) {
        return _stakes[user];
    }

    function getTier(address user) external view returns (IStakingManager.Tier) {
        return _tiers[user];
    }

    function getStakeInfo(address) external pure returns (IStakingManager.StakeInfo memory) {
        return IStakingManager.StakeInfo(0, 0, 0);
    }

    function lockStake(address, uint256) external {}
    function unlockStake(address, uint256) external {}
    function getLockedStake(address) external pure returns (uint256) { return 0; }
    function getUnlockedStake(address user) external view returns (uint256) { return _stakes[user]; }
}

contract MockSybilGuardForStakingRewards {
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

contract StakingRewardsTest is Test, ProxyTestHelper {
    event StakeSynced(address indexed user, uint256 effectiveBalance, uint256 stakingTier);
    event RewardNotified(address indexed token, uint256 amount, uint256 duration);
    event RewardsClaimed(address indexed user, address indexed token, uint256 amount);
    event RewardTokenAdded(address indexed token);

    LOBToken public lobToken;
    LOBToken public rewardToken2;
    StakingRewards public stakingRewards;
    MockStakingManagerForRewards public stakingManager;
    MockSybilGuardForStakingRewards public sybilGuard;

    address public admin = makeAddr("admin");
    address public distributor = makeAddr("distributor");
    address public notifier = makeAddr("notifier");
    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");

    function setUp() public {
        vm.startPrank(admin);
        lobToken = LOBToken(_deployProxy(address(new LOBToken()), abi.encodeCall(LOBToken.initialize, (distributor))));
        sybilGuard = new MockSybilGuardForStakingRewards();
        stakingManager = new MockStakingManagerForRewards();
        stakingRewards = StakingRewards(_deployProxy(address(new StakingRewards()), abi.encodeCall(StakingRewards.initialize, (address(stakingManager), address(sybilGuard)))));
        stakingRewards.grantRole(stakingRewards.REWARD_NOTIFIER_ROLE(), notifier);
        stakingRewards.addRewardToken(address(lobToken));
        vm.stopPrank();

        // Fund notifier
        vm.prank(distributor);
        lobToken.transfer(notifier, 100_000 ether);
    }

    // ═══════════════════════════════════════════════════════════════
    //  HELPERS
    // ═══════════════════════════════════════════════════════════════

    function _syncUser(address user, uint256 stake, IStakingManager.Tier tier) internal {
        stakingManager.setStake(user, stake);
        stakingManager.setTier(user, tier);
        vm.prank(user);
        stakingRewards.syncStake();
    }

    function _notifyReward(uint256 amount, uint256 duration) internal {
        vm.startPrank(notifier);
        lobToken.approve(address(stakingRewards), amount);
        stakingRewards.notifyRewardAmount(address(lobToken), amount, duration);
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════
    //  SYNC STAKE
    // ═══════════════════════════════════════════════════════════════

    function test_syncStakeBronze() public {
        _syncUser(alice, 1000 ether, IStakingManager.Tier.Bronze);

        assertEq(stakingRewards.getEffectiveBalance(alice), 1000 ether); // 1x
    }

    function test_syncStakeSilver() public {
        _syncUser(alice, 1000 ether, IStakingManager.Tier.Silver);

        assertEq(stakingRewards.getEffectiveBalance(alice), 1500 ether); // 1.5x
    }

    function test_syncStakeGold() public {
        _syncUser(alice, 1000 ether, IStakingManager.Tier.Gold);

        assertEq(stakingRewards.getEffectiveBalance(alice), 2000 ether); // 2x
    }

    function test_syncStakePlatinum() public {
        _syncUser(alice, 1000 ether, IStakingManager.Tier.Platinum);

        assertEq(stakingRewards.getEffectiveBalance(alice), 3000 ether); // 3x
    }

    function test_syncStakeNone() public {
        _syncUser(alice, 1000 ether, IStakingManager.Tier.None);

        assertEq(stakingRewards.getEffectiveBalance(alice), 1000 ether); // 1x same as Bronze
    }

    function test_syncStakeUpdatesTotal() public {
        _syncUser(alice, 1000 ether, IStakingManager.Tier.Bronze);
        _syncUser(bob, 2000 ether, IStakingManager.Tier.Silver);

        // Alice: 1000, Bob: 3000
        assertEq(stakingRewards.getTotalEffectiveBalance(), 4000 ether);
    }

    function test_syncAfterUnstake() public {
        _syncUser(alice, 1000 ether, IStakingManager.Tier.Silver);
        assertEq(stakingRewards.getEffectiveBalance(alice), 1500 ether);

        // Alice unstakes (reflected in mock)
        stakingManager.setStake(alice, 0);
        stakingManager.setTier(alice, IStakingManager.Tier.None);
        vm.prank(alice);
        stakingRewards.syncStake();

        assertEq(stakingRewards.getEffectiveBalance(alice), 0);
        assertEq(stakingRewards.getTotalEffectiveBalance(), 0);
    }

    // ═══════════════════════════════════════════════════════════════
    //  NOTIFY REWARD
    // ═══════════════════════════════════════════════════════════════

    function test_notifyRewardAmount() public {
        _notifyReward(10_000 ether, 7 days);

        assertEq(lobToken.balanceOf(address(stakingRewards)), 10_000 ether);
    }

    function test_notifyRewardRollover() public {
        _notifyReward(7000 ether, 7 days);

        // After 3 days, 3000 consumed, 4000 remaining
        vm.warp(block.timestamp + 3 days);

        // Notify another 7000 for 7 days → (4000 + 7000) / 7 days
        _notifyReward(7000 ether, 7 days);

        // Total in contract: 14000
        assertEq(lobToken.balanceOf(address(stakingRewards)), 14_000 ether);
    }

    function test_revertNotifyTokenNotAdded() public {
        address fakeToken = makeAddr("fakeToken");
        vm.prank(notifier);
        vm.expectRevert("StakingRewards: token not added");
        stakingRewards.notifyRewardAmount(fakeToken, 100 ether, 7 days);
    }

    function test_revertNotifyZeroAmount() public {
        vm.prank(notifier);
        vm.expectRevert("StakingRewards: zero amount");
        stakingRewards.notifyRewardAmount(address(lobToken), 0, 7 days);
    }

    function test_revertNotifyZeroDuration() public {
        vm.startPrank(notifier);
        lobToken.approve(address(stakingRewards), 100 ether);
        vm.expectRevert("StakingRewards: zero duration");
        stakingRewards.notifyRewardAmount(address(lobToken), 100 ether, 0);
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════
    //  CLAIM — SINGLE USER
    // ═══════════════════════════════════════════════════════════════

    function test_singleUserEarnsAll() public {
        _syncUser(alice, 1000 ether, IStakingManager.Tier.Bronze);
        _notifyReward(7000 ether, 7 days);

        vm.warp(block.timestamp + 7 days);

        uint256 earned = stakingRewards.earned(alice, address(lobToken));
        // Should earn ~7000 (minus dust from integer division)
        assertApproxEqAbs(earned, 7000 ether, 1e6);

        vm.prank(alice);
        stakingRewards.claimRewards(address(lobToken));

        assertApproxEqAbs(lobToken.balanceOf(alice), 7000 ether, 1e6);
    }

    // ═══════════════════════════════════════════════════════════════
    //  CLAIM — TWO USERS PROPORTIONAL
    // ═══════════════════════════════════════════════════════════════

    function test_twoUsersEqualShare() public {
        _syncUser(alice, 1000 ether, IStakingManager.Tier.Bronze);
        _syncUser(bob, 1000 ether, IStakingManager.Tier.Bronze);
        _notifyReward(7000 ether, 7 days);

        vm.warp(block.timestamp + 7 days);

        uint256 earnedAlice = stakingRewards.earned(alice, address(lobToken));
        uint256 earnedBob = stakingRewards.earned(bob, address(lobToken));

        assertApproxEqAbs(earnedAlice, 3500 ether, 1e6);
        assertApproxEqAbs(earnedBob, 3500 ether, 1e6);
    }

    // ═══════════════════════════════════════════════════════════════
    //  TIER BOOST
    // ═══════════════════════════════════════════════════════════════

    function test_platinumEarns3xVsBronze() public {
        _syncUser(alice, 1000 ether, IStakingManager.Tier.Bronze);   // effective: 1000
        _syncUser(bob, 1000 ether, IStakingManager.Tier.Platinum);   // effective: 3000

        _notifyReward(4000 ether, 4 days);

        vm.warp(block.timestamp + 4 days);

        uint256 earnedAlice = stakingRewards.earned(alice, address(lobToken));
        uint256 earnedBob = stakingRewards.earned(bob, address(lobToken));

        // Alice gets 1/4 = 1000, Bob gets 3/4 = 3000
        assertApproxEqAbs(earnedAlice, 1000 ether, 1e6);
        assertApproxEqAbs(earnedBob, 3000 ether, 1e6);
    }

    // ═══════════════════════════════════════════════════════════════
    //  NO REWARDS BEFORE SYNC
    // ═══════════════════════════════════════════════════════════════

    function test_noRewardsBeforeSync() public {
        // Alice has stake but hasn't synced
        stakingManager.setStake(alice, 1000 ether);
        stakingManager.setTier(alice, IStakingManager.Tier.Silver);

        _notifyReward(7000 ether, 7 days);
        vm.warp(block.timestamp + 7 days);

        assertEq(stakingRewards.earned(alice, address(lobToken)), 0);
    }

    // ═══════════════════════════════════════════════════════════════
    //  FULL DURATION DRAINS
    // ═══════════════════════════════════════════════════════════════

    function test_fullDurationDrains() public {
        _syncUser(alice, 1000 ether, IStakingManager.Tier.Bronze);
        _notifyReward(7000 ether, 7 days);

        // Warp to end of reward period (within staleness window)
        vm.warp(block.timestamp + 7 days);

        // Claim to checkpoint rewards before staleness kicks in
        vm.prank(alice);
        stakingRewards.claimRewards(address(lobToken));

        assertApproxEqAbs(lobToken.balanceOf(alice), 7000 ether, 1e6);
    }

    // ═══════════════════════════════════════════════════════════════
    //  CLAIM NOTHING REVERTS
    // ═══════════════════════════════════════════════════════════════

    function test_revertClaimNothing() public {
        _syncUser(alice, 1000 ether, IStakingManager.Tier.Bronze);

        vm.prank(alice);
        vm.expectRevert("StakingRewards: nothing to claim");
        stakingRewards.claimRewards(address(lobToken));
    }

    // ═══════════════════════════════════════════════════════════════
    //  ADD REWARD TOKEN
    // ═══════════════════════════════════════════════════════════════

    function test_addRewardToken() public {
        address newToken = makeAddr("newToken");
        vm.prank(admin);
        stakingRewards.addRewardToken(newToken);

        address[] memory tokens = stakingRewards.getRewardTokens();
        assertEq(tokens.length, 2);
        assertEq(tokens[1], newToken);
    }

    function test_revertAddDuplicateToken() public {
        vm.prank(admin);
        vm.expectRevert("StakingRewards: token exists");
        stakingRewards.addRewardToken(address(lobToken));
    }

    function test_revertAddZeroToken() public {
        vm.prank(admin);
        vm.expectRevert("StakingRewards: zero token");
        stakingRewards.addRewardToken(address(0));
    }

    // ═══════════════════════════════════════════════════════════════
    //  EVENTS
    // ═══════════════════════════════════════════════════════════════

    function test_emitsSyncEvent() public {
        stakingManager.setStake(alice, 1000 ether);
        stakingManager.setTier(alice, IStakingManager.Tier.Silver);

        vm.expectEmit(true, false, false, true);
        emit StakeSynced(alice, 1500 ether, uint256(IStakingManager.Tier.Silver));

        vm.prank(alice);
        stakingRewards.syncStake();
    }

    // ═══════════════════════════════════════════════════════════════
    //  PAUSE
    // ═══════════════════════════════════════════════════════════════

    function test_pauseBlocksSync() public {
        vm.prank(admin);
        stakingRewards.pause();

        stakingManager.setStake(alice, 1000 ether);
        vm.prank(alice);
        vm.expectRevert("EnforcedPause()");
        stakingRewards.syncStake();
    }

    function test_pauseBlocksClaim() public {
        vm.prank(admin);
        stakingRewards.pause();

        vm.prank(alice);
        vm.expectRevert("EnforcedPause()");
        stakingRewards.claimRewards(address(lobToken));
    }

    // ═══════════════════════════════════════════════════════════════
    //  CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════

    function test_revertZeroStakingManager() public {
        address impl = address(new StakingRewards());
        vm.expectRevert("StakingRewards: zero stakingManager");
        _deployProxy(impl, abi.encodeCall(StakingRewards.initialize, (address(0), address(sybilGuard))));
    }

    function test_revertZeroSybilGuard() public {
        address impl = address(new StakingRewards());
        vm.expectRevert("StakingRewards: zero sybilGuard");
        _deployProxy(impl, abi.encodeCall(StakingRewards.initialize, (address(stakingManager), address(0))));
    }

    // ═══════════════════════════════════════════════════════════════
    //  V-006: SYBIL BAN CHECKS
    // ═══════════════════════════════════════════════════════════════

    function test_revertSyncStakeWhenBanned() public {
        stakingManager.setStake(alice, 1000 ether);
        stakingManager.setTier(alice, IStakingManager.Tier.Bronze);

        sybilGuard.setBanned(alice, true);

        vm.prank(alice);
        vm.expectRevert("StakingRewards: banned");
        stakingRewards.syncStake();
    }

    function test_revertClaimRewardsWhenBanned() public {
        _syncUser(alice, 1000 ether, IStakingManager.Tier.Bronze);
        _notifyReward(7000 ether, 7 days);
        vm.warp(block.timestamp + 7 days);

        sybilGuard.setBanned(alice, true);

        vm.prank(alice);
        vm.expectRevert("StakingRewards: banned");
        stakingRewards.claimRewards(address(lobToken));
    }

    // ═══════════════════════════════════════════════════════════════
    //  V-004: GHOST REWARD STALENESS
    // ═══════════════════════════════════════════════════════════════

    function test_ghostRewardForfeited() public {
        // Alice syncs and has effective balance
        _syncUser(alice, 1000 ether, IStakingManager.Tier.Bronze);
        _notifyReward(14_000 ether, 14 days);

        // Warp past staleness window (>7 days without syncing)
        vm.warp(block.timestamp + 10 days);

        // earned() should return 0 (only checkpointed rewards, which is 0)
        uint256 earnedStale = stakingRewards.earned(alice, address(lobToken));
        assertEq(earnedStale, 0, "stale user should have 0 earned");

        // Alice syncs again — forfeiture happens, then re-registers
        _syncUser(alice, 1000 ether, IStakingManager.Tier.Bronze);

        // She should have 0 rewards (forfeited the stale period)
        uint256 earnedAfterSync = stakingRewards.earned(alice, address(lobToken));
        assertEq(earnedAfterSync, 0, "forfeited rewards should be 0 after stale sync");
    }

    function test_noForfeitureWithinStalenessWindow() public {
        // Alice syncs and has effective balance
        _syncUser(alice, 1000 ether, IStakingManager.Tier.Bronze);
        _notifyReward(7000 ether, 7 days);

        // Warp 6 days — within staleness window
        vm.warp(block.timestamp + 6 days);

        uint256 earned = stakingRewards.earned(alice, address(lobToken));
        // Should have ~6000 ether (6/7 of 7000)
        assertApproxEqAbs(earned, 6000 ether, 1e6);
    }

    function test_ghostRewardClaimReverts() public {
        // Alice syncs, earns, goes stale
        _syncUser(alice, 1000 ether, IStakingManager.Tier.Bronze);
        _notifyReward(7000 ether, 7 days);

        // Warp past reward period + staleness
        vm.warp(block.timestamp + 14 days);

        // Claim should revert because earned() returns 0 (stale forfeiture)
        // and after sync+forfeiture the checkpointed rewards are 0
        vm.prank(alice);
        vm.expectRevert("StakingRewards: nothing to claim");
        stakingRewards.claimRewards(address(lobToken));
    }

    function test_previouslyCheckpointedRewardsPreserved() public {
        // Alice syncs and earns rewards
        _syncUser(alice, 1000 ether, IStakingManager.Tier.Bronze);
        _notifyReward(7000 ether, 7 days);

        // Warp 7 days and claim (within staleness window)
        vm.warp(block.timestamp + 7 days);
        vm.prank(alice);
        stakingRewards.claimRewards(address(lobToken));

        uint256 balanceAfterClaim = lobToken.balanceOf(alice);
        assertApproxEqAbs(balanceAfterClaim, 7000 ether, 1e6);

        // Now new reward period
        _notifyReward(7000 ether, 7 days);

        // Go stale (>7 days without syncing)
        vm.warp(block.timestamp + 10 days);

        // earned() should return 0 (stale — only checkpointed _rewards, which is 0 after claim)
        assertEq(stakingRewards.earned(alice, address(lobToken)), 0);

        // Alice still has her previously claimed tokens
        assertApproxEqAbs(lobToken.balanceOf(alice), 7000 ether, 1e6);
    }

    function test_lastSyncTimestampTracked() public {
        uint256 t0 = block.timestamp;
        _syncUser(alice, 1000 ether, IStakingManager.Tier.Bronze);
        assertEq(stakingRewards.getLastSyncTimestamp(alice), t0);

        vm.warp(block.timestamp + 3 days);
        _syncUser(alice, 1000 ether, IStakingManager.Tier.Bronze);
        assertEq(stakingRewards.getLastSyncTimestamp(alice), t0 + 3 days);
    }
}
