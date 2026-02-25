// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/RewardScheduler.sol";
import "../src/StakingRewards.sol";
import "../src/LiquidityMining.sol";
import "../src/LOBToken.sol";

// ── Mocks ──────────────────────────────────────────────────────────────

contract MockStakingManagerForScheduler {
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

contract MockSybilGuardForScheduler {
    function checkBanned(address) external pure returns (bool) {
        return false;
    }

    function checkAnyBanned(address[] calldata) external pure returns (bool) {
        return false;
    }
}

contract MockLPTokenForScheduler {
    string public name = "Mock LP";
    string public symbol = "MLP";
    uint8 public decimals = 18;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    uint256 public totalSupply;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
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

// ── Test Contract ──────────────────────────────────────────────────────

contract RewardSchedulerTest is Test {
    event StreamCreated(uint256 indexed streamId, IRewardScheduler.TargetType targetType, address rewardToken, uint256 emissionPerSecond, uint256 endTime);
    event StreamUpdated(uint256 indexed streamId, uint256 oldEmission, uint256 newEmission);
    event StreamDripped(uint256 indexed streamId, uint256 amount, uint256 elapsed);
    event StreamPaused(uint256 indexed streamId);
    event StreamResumed(uint256 indexed streamId);
    event TopUp(address indexed sender, address indexed token, uint256 amount);
    event BudgetWithdrawn(address indexed to, address indexed token, uint256 amount);

    LOBToken public lobToken;
    MockLPTokenForScheduler public lpToken;
    StakingRewards public stakingRewards;
    LiquidityMining public liquidityMining;
    RewardScheduler public scheduler;
    MockStakingManagerForScheduler public stakingManager;
    MockSybilGuardForScheduler public sybilGuard;

    address public admin = makeAddr("admin");
    address public distributor = makeAddr("distributor");
    address public alice = makeAddr("alice");
    address public funder = makeAddr("funder");

    uint256 constant BUDGET = 1_000_000 ether;
    uint256 constant EMISSION = 1 ether; // 1 LOB/sec

    function setUp() public {
        vm.startPrank(admin);

        lobToken = new LOBToken();
        lobToken.initialize(distributor);
        lpToken = new MockLPTokenForScheduler();
        sybilGuard = new MockSybilGuardForScheduler();
        stakingManager = new MockStakingManagerForScheduler();

        stakingRewards = new StakingRewards();
        stakingRewards.initialize(address(stakingManager), address(sybilGuard));
        stakingRewards.addRewardToken(address(lobToken));

        liquidityMining = new LiquidityMining();
        liquidityMining.initialize(
            address(lpToken),
            address(lobToken),
            address(stakingManager),
            address(sybilGuard),
            admin
        );

        scheduler = new RewardScheduler();
        scheduler.initialize(address(stakingRewards), address(liquidityMining));

        // Grant REWARD_NOTIFIER_ROLE to scheduler
        stakingRewards.grantRole(stakingRewards.REWARD_NOTIFIER_ROLE(), address(scheduler));
        liquidityMining.grantRole(liquidityMining.REWARD_NOTIFIER_ROLE(), address(scheduler));

        vm.stopPrank();

        // Fund scheduler with LOB
        vm.prank(distributor);
        lobToken.transfer(address(scheduler), BUDGET);
    }

    // ═══════════════════════════════════════════════════════════════
    //  createStream
    // ═══════════════════════════════════════════════════════════════

    function test_createStream_StakingRewards() public {
        vm.prank(admin);
        scheduler.createStream(
            IRewardScheduler.TargetType.STAKING_REWARDS,
            address(lobToken),
            EMISSION,
            0
        );

        IRewardScheduler.Stream memory s = scheduler.getStream(1);
        assertEq(s.id, 1);
        assertEq(uint256(s.targetType), uint256(IRewardScheduler.TargetType.STAKING_REWARDS));
        assertEq(s.rewardToken, address(lobToken));
        assertEq(s.emissionPerSecond, EMISSION);
        assertEq(s.lastDripTime, block.timestamp);
        assertEq(s.endTime, 0);
        assertTrue(s.active);
    }

    function test_createStream_LiquidityMining() public {
        vm.prank(admin);
        scheduler.createStream(
            IRewardScheduler.TargetType.LIQUIDITY_MINING,
            address(lobToken),
            EMISSION,
            0
        );

        IRewardScheduler.Stream memory s = scheduler.getStream(1);
        assertEq(uint256(s.targetType), uint256(IRewardScheduler.TargetType.LIQUIDITY_MINING));
    }

    function test_createStream_WithEndTime() public {
        uint256 endTime = block.timestamp + 30 days;
        vm.prank(admin);
        scheduler.createStream(
            IRewardScheduler.TargetType.STAKING_REWARDS,
            address(lobToken),
            EMISSION,
            endTime
        );

        IRewardScheduler.Stream memory s = scheduler.getStream(1);
        assertEq(s.endTime, endTime);
    }

    function test_createStream_RevertZeroEmission() public {
        vm.prank(admin);
        vm.expectRevert("RewardScheduler: zero emission");
        scheduler.createStream(
            IRewardScheduler.TargetType.STAKING_REWARDS,
            address(lobToken),
            0,
            0
        );
    }

    function test_createStream_RevertZeroToken() public {
        vm.prank(admin);
        vm.expectRevert("RewardScheduler: zero token");
        scheduler.createStream(
            IRewardScheduler.TargetType.STAKING_REWARDS,
            address(0),
            EMISSION,
            0
        );
    }

    function test_createStream_RevertEndTimeInPast() public {
        vm.warp(1000); // ensure block.timestamp > 1
        vm.prank(admin);
        vm.expectRevert("RewardScheduler: endTime in past");
        scheduler.createStream(
            IRewardScheduler.TargetType.STAKING_REWARDS,
            address(lobToken),
            EMISSION,
            block.timestamp - 1
        );
    }

    function test_createStream_RevertNonAdmin() public {
        vm.prank(alice);
        vm.expectRevert();
        scheduler.createStream(
            IRewardScheduler.TargetType.STAKING_REWARDS,
            address(lobToken),
            EMISSION,
            0
        );
    }

    // ═══════════════════════════════════════════════════════════════
    //  drip
    // ═══════════════════════════════════════════════════════════════

    function test_drip_HappyPath() public {
        vm.prank(admin);
        scheduler.createStream(
            IRewardScheduler.TargetType.STAKING_REWARDS,
            address(lobToken),
            EMISSION,
            0
        );

        vm.warp(block.timestamp + 100);

        vm.expectEmit(true, false, false, true);
        emit StreamDripped(1, 100 ether, 100);
        scheduler.drip(1);

        // Verify scheduler balance decreased
        assertEq(lobToken.balanceOf(address(scheduler)), BUDGET - 100 ether);
        // Verify StakingRewards received the tokens
        assertEq(lobToken.balanceOf(address(stakingRewards)), 100 ether);
    }

    function test_drip_Permissionless() public {
        vm.prank(admin);
        scheduler.createStream(
            IRewardScheduler.TargetType.STAKING_REWARDS,
            address(lobToken),
            EMISSION,
            0
        );

        vm.warp(block.timestamp + 50);

        // Anyone can call drip
        vm.prank(alice);
        scheduler.drip(1);

        assertEq(lobToken.balanceOf(address(stakingRewards)), 50 ether);
    }

    function test_drip_CapsToBalance() public {
        // Create stream with high emission that will exceed balance
        vm.prank(admin);
        scheduler.createStream(
            IRewardScheduler.TargetType.STAKING_REWARDS,
            address(lobToken),
            10_000 ether, // 10k LOB/sec
            0
        );

        // Warp enough to exceed BUDGET
        vm.warp(block.timestamp + 200); // would need 2M LOB but only 1M available

        scheduler.drip(1);

        // Should have transferred all available balance
        assertEq(lobToken.balanceOf(address(scheduler)), 0);
        assertEq(lobToken.balanceOf(address(stakingRewards)), BUDGET);
    }

    function test_drip_NoopIfNothingAccrued() public {
        vm.prank(admin);
        scheduler.createStream(
            IRewardScheduler.TargetType.STAKING_REWARDS,
            address(lobToken),
            EMISSION,
            0
        );

        // Drip immediately — same block, nothing accrued
        scheduler.drip(1);

        assertEq(lobToken.balanceOf(address(stakingRewards)), 0);
    }

    function test_drip_RespectsEndTime() public {
        uint256 endTime = block.timestamp + 100;
        vm.prank(admin);
        scheduler.createStream(
            IRewardScheduler.TargetType.STAKING_REWARDS,
            address(lobToken),
            EMISSION,
            endTime
        );

        // Warp past endTime
        vm.warp(block.timestamp + 200);

        scheduler.drip(1);

        // Should only drip for 100 seconds (up to endTime)
        assertEq(lobToken.balanceOf(address(stakingRewards)), 100 ether);

        // Stream should be deactivated
        IRewardScheduler.Stream memory s = scheduler.getStream(1);
        assertFalse(s.active);
    }

    function test_drip_RespectsInactiveStream() public {
        vm.prank(admin);
        scheduler.createStream(
            IRewardScheduler.TargetType.STAKING_REWARDS,
            address(lobToken),
            EMISSION,
            0
        );

        vm.warp(block.timestamp + 50);

        // Pause the stream
        vm.prank(admin);
        scheduler.pauseStream(1);

        uint256 balAfterPause = lobToken.balanceOf(address(stakingRewards));

        // Warp more and try to drip
        vm.warp(block.timestamp + 100);
        scheduler.drip(1);

        // Nothing should have changed
        assertEq(lobToken.balanceOf(address(stakingRewards)), balAfterPause);
    }

    function test_drip_StreamNotFound() public {
        vm.expectRevert("RewardScheduler: stream not found");
        scheduler.drip(999);
    }

    function test_drip_LiquidityMining() public {
        vm.prank(admin);
        scheduler.createStream(
            IRewardScheduler.TargetType.LIQUIDITY_MINING,
            address(lobToken),
            EMISSION,
            0
        );

        vm.warp(block.timestamp + 100);

        scheduler.drip(1);

        assertEq(lobToken.balanceOf(address(liquidityMining)), 100 ether);
    }

    function test_drip_DoubleDripSameBlock() public {
        vm.prank(admin);
        scheduler.createStream(
            IRewardScheduler.TargetType.STAKING_REWARDS,
            address(lobToken),
            EMISSION,
            0
        );

        vm.warp(block.timestamp + 100);

        scheduler.drip(1);
        assertEq(lobToken.balanceOf(address(stakingRewards)), 100 ether);

        // Second drip in same block — noop
        scheduler.drip(1);
        assertEq(lobToken.balanceOf(address(stakingRewards)), 100 ether);
    }

    function test_drip_ZeroBalance() public {
        // Withdraw all budget first
        vm.prank(admin);
        scheduler.withdrawBudget(address(lobToken), BUDGET, admin);

        vm.prank(admin);
        scheduler.createStream(
            IRewardScheduler.TargetType.STAKING_REWARDS,
            address(lobToken),
            EMISSION,
            0
        );

        vm.warp(block.timestamp + 100);

        // Should not revert, just noop
        scheduler.drip(1);
        assertEq(lobToken.balanceOf(address(stakingRewards)), 0);
    }

    // ═══════════════════════════════════════════════════════════════
    //  dripAll
    // ═══════════════════════════════════════════════════════════════

    function test_dripAll() public {
        vm.startPrank(admin);
        scheduler.createStream(
            IRewardScheduler.TargetType.STAKING_REWARDS,
            address(lobToken),
            EMISSION,
            0
        );
        scheduler.createStream(
            IRewardScheduler.TargetType.LIQUIDITY_MINING,
            address(lobToken),
            EMISSION,
            0
        );
        vm.stopPrank();

        vm.warp(block.timestamp + 100);

        scheduler.dripAll();

        // Both targets should have received 100 LOB each
        assertEq(lobToken.balanceOf(address(stakingRewards)), 100 ether);
        assertEq(lobToken.balanceOf(address(liquidityMining)), 100 ether);
    }

    // ═══════════════════════════════════════════════════════════════
    //  updateEmission
    // ═══════════════════════════════════════════════════════════════

    function test_updateEmission() public {
        vm.prank(admin);
        scheduler.createStream(
            IRewardScheduler.TargetType.STAKING_REWARDS,
            address(lobToken),
            EMISSION,
            0
        );

        // Read lastDripTime from contract state (opaque to via_ir optimizer)
        IRewardScheduler.Stream memory s0 = scheduler.getStream(1);
        vm.warp(s0.lastDripTime + 100);

        // Update to 2 LOB/sec — should flush old rate first
        vm.prank(admin);
        vm.expectEmit(true, false, false, true);
        emit StreamUpdated(1, EMISSION, 2 ether);
        scheduler.updateEmission(1, 2 ether);

        // 100 LOB should have been dripped at old rate
        assertEq(lobToken.balanceOf(address(stakingRewards)), 100 ether);

        // Verify new emission
        IRewardScheduler.Stream memory s = scheduler.getStream(1);
        assertEq(s.emissionPerSecond, 2 ether);

        // Warp another 100 seconds at 2 LOB/sec (read updated lastDripTime)
        vm.warp(s.lastDripTime + 100);
        scheduler.drip(1);

        assertEq(lobToken.balanceOf(address(stakingRewards)), 300 ether); // 100 + 200
    }

    function test_updateEmission_RevertZero() public {
        vm.prank(admin);
        scheduler.createStream(
            IRewardScheduler.TargetType.STAKING_REWARDS,
            address(lobToken),
            EMISSION,
            0
        );

        vm.prank(admin);
        vm.expectRevert("RewardScheduler: zero emission");
        scheduler.updateEmission(1, 0);
    }

    function test_updateEmission_RevertNonAdmin() public {
        vm.prank(admin);
        scheduler.createStream(
            IRewardScheduler.TargetType.STAKING_REWARDS,
            address(lobToken),
            EMISSION,
            0
        );

        vm.prank(alice);
        vm.expectRevert();
        scheduler.updateEmission(1, 2 ether);
    }

    // ═══════════════════════════════════════════════════════════════
    //  pauseStream / resumeStream
    // ═══════════════════════════════════════════════════════════════

    function test_pauseStream_FlushesFirst() public {
        vm.prank(admin);
        scheduler.createStream(
            IRewardScheduler.TargetType.STAKING_REWARDS,
            address(lobToken),
            EMISSION,
            0
        );

        vm.warp(block.timestamp + 50);

        vm.prank(admin);
        scheduler.pauseStream(1);

        // Should have flushed 50 LOB
        assertEq(lobToken.balanceOf(address(stakingRewards)), 50 ether);

        IRewardScheduler.Stream memory s = scheduler.getStream(1);
        assertFalse(s.active);
    }

    function test_pauseStream_RevertAlreadyPaused() public {
        vm.prank(admin);
        scheduler.createStream(
            IRewardScheduler.TargetType.STAKING_REWARDS,
            address(lobToken),
            EMISSION,
            0
        );

        vm.prank(admin);
        scheduler.pauseStream(1);

        vm.prank(admin);
        vm.expectRevert("RewardScheduler: already paused");
        scheduler.pauseStream(1);
    }

    function test_resumeStream() public {
        vm.prank(admin);
        scheduler.createStream(
            IRewardScheduler.TargetType.STAKING_REWARDS,
            address(lobToken),
            EMISSION,
            0
        );

        // Read lastDripTime from contract state (opaque to via_ir optimizer)
        IRewardScheduler.Stream memory s0 = scheduler.getStream(1);
        vm.warp(s0.lastDripTime + 50);

        vm.prank(admin);
        scheduler.pauseStream(1);

        // Warp 100 more seconds while paused
        IRewardScheduler.Stream memory s1 = scheduler.getStream(1);
        vm.warp(s1.lastDripTime + 100);

        vm.prank(admin);
        scheduler.resumeStream(1);

        IRewardScheduler.Stream memory s = scheduler.getStream(1);
        assertTrue(s.active);
        assertEq(s.lastDripTime, s1.lastDripTime + 100);

        // Warp 50 more and drip
        vm.warp(s.lastDripTime + 50);
        scheduler.drip(1);

        // Should have 50 (pre-pause) + 50 (post-resume) = 100 LOB
        assertEq(lobToken.balanceOf(address(stakingRewards)), 100 ether);
    }

    function test_resumeStream_RevertAlreadyActive() public {
        vm.prank(admin);
        scheduler.createStream(
            IRewardScheduler.TargetType.STAKING_REWARDS,
            address(lobToken),
            EMISSION,
            0
        );

        vm.prank(admin);
        vm.expectRevert("RewardScheduler: already active");
        scheduler.resumeStream(1);
    }

    function test_resumeStream_RevertStreamEnded() public {
        uint256 endTime = block.timestamp + 100;
        vm.prank(admin);
        scheduler.createStream(
            IRewardScheduler.TargetType.STAKING_REWARDS,
            address(lobToken),
            EMISSION,
            endTime
        );

        // Warp past endTime + drip to deactivate
        vm.warp(block.timestamp + 200);
        scheduler.drip(1);

        vm.prank(admin);
        vm.expectRevert("RewardScheduler: stream ended");
        scheduler.resumeStream(1);
    }

    // ═══════════════════════════════════════════════════════════════
    //  topUp
    // ═══════════════════════════════════════════════════════════════

    function test_topUp() public {
        uint256 topUpAmount = 500_000 ether;

        vm.prank(distributor);
        lobToken.transfer(funder, topUpAmount);

        vm.startPrank(funder);
        lobToken.approve(address(scheduler), topUpAmount);

        vm.expectEmit(true, true, false, true);
        emit TopUp(funder, address(lobToken), topUpAmount);
        scheduler.topUp(address(lobToken), topUpAmount);
        vm.stopPrank();

        assertEq(lobToken.balanceOf(address(scheduler)), BUDGET + topUpAmount);
    }

    function test_topUp_RevertZeroAmount() public {
        vm.expectRevert("RewardScheduler: zero amount");
        scheduler.topUp(address(lobToken), 0);
    }

    function test_topUp_RevertZeroToken() public {
        vm.expectRevert("RewardScheduler: zero token");
        scheduler.topUp(address(0), 100 ether);
    }

    // ═══════════════════════════════════════════════════════════════
    //  withdrawBudget
    // ═══════════════════════════════════════════════════════════════

    function test_withdrawBudget() public {
        uint256 withdrawAmount = 100_000 ether;

        vm.prank(admin);
        vm.expectEmit(true, true, false, true);
        emit BudgetWithdrawn(admin, address(lobToken), withdrawAmount);
        scheduler.withdrawBudget(address(lobToken), withdrawAmount, admin);

        assertEq(lobToken.balanceOf(admin), withdrawAmount);
        assertEq(lobToken.balanceOf(address(scheduler)), BUDGET - withdrawAmount);
    }

    function test_withdrawBudget_RevertNonAdmin() public {
        vm.prank(alice);
        vm.expectRevert();
        scheduler.withdrawBudget(address(lobToken), 100 ether, alice);
    }

    function test_withdrawBudget_RevertZeroRecipient() public {
        vm.prank(admin);
        vm.expectRevert("RewardScheduler: zero recipient");
        scheduler.withdrawBudget(address(lobToken), 100 ether, address(0));
    }

    function test_withdrawBudget_RevertZeroAmount() public {
        vm.prank(admin);
        vm.expectRevert("RewardScheduler: zero amount");
        scheduler.withdrawBudget(address(lobToken), 0, admin);
    }

    // ═══════════════════════════════════════════════════════════════
    //  VIEWS
    // ═══════════════════════════════════════════════════════════════

    function test_getActiveStreams() public {
        vm.startPrank(admin);
        scheduler.createStream(IRewardScheduler.TargetType.STAKING_REWARDS, address(lobToken), EMISSION, 0);
        scheduler.createStream(IRewardScheduler.TargetType.LIQUIDITY_MINING, address(lobToken), EMISSION, 0);
        vm.stopPrank();

        IRewardScheduler.Stream[] memory streams = scheduler.getActiveStreams();
        assertEq(streams.length, 2);
        assertEq(streams[0].id, 1);
        assertEq(streams[1].id, 2);
    }

    function test_getActiveStreams_ExcludesPaused() public {
        vm.startPrank(admin);
        scheduler.createStream(IRewardScheduler.TargetType.STAKING_REWARDS, address(lobToken), EMISSION, 0);
        scheduler.createStream(IRewardScheduler.TargetType.LIQUIDITY_MINING, address(lobToken), EMISSION, 0);
        scheduler.pauseStream(1);
        vm.stopPrank();

        IRewardScheduler.Stream[] memory streams = scheduler.getActiveStreams();
        assertEq(streams.length, 1);
        assertEq(streams[0].id, 2);
    }

    function test_streamBalance() public {
        vm.prank(admin);
        scheduler.createStream(
            IRewardScheduler.TargetType.STAKING_REWARDS,
            address(lobToken),
            EMISSION,
            0
        );

        vm.warp(block.timestamp + 200);

        uint256 bal = scheduler.streamBalance(1);
        assertEq(bal, 200 ether);
    }

    function test_streamBalance_CapsToContractBalance() public {
        vm.prank(admin);
        scheduler.createStream(
            IRewardScheduler.TargetType.STAKING_REWARDS,
            address(lobToken),
            10_000 ether,
            0
        );

        // Warp enough that accrued > budget
        vm.warp(block.timestamp + 200); // 2M LOB accrued but only 1M available

        uint256 bal = scheduler.streamBalance(1);
        assertEq(bal, BUDGET);
    }

    function test_getStreamCount() public {
        assertEq(scheduler.getStreamCount(), 0);

        vm.startPrank(admin);
        scheduler.createStream(IRewardScheduler.TargetType.STAKING_REWARDS, address(lobToken), EMISSION, 0);
        scheduler.createStream(IRewardScheduler.TargetType.LIQUIDITY_MINING, address(lobToken), EMISSION, 0);
        vm.stopPrank();

        assertEq(scheduler.getStreamCount(), 2);
    }

    // ═══════════════════════════════════════════════════════════════
    //  PAUSE / UNPAUSE (global)
    // ═══════════════════════════════════════════════════════════════

    function test_globalPause_BlocksDrip() public {
        vm.prank(admin);
        scheduler.createStream(
            IRewardScheduler.TargetType.STAKING_REWARDS,
            address(lobToken),
            EMISSION,
            0
        );

        vm.prank(admin);
        scheduler.pause();

        vm.warp(block.timestamp + 100);

        vm.expectRevert("EnforcedPause()");
        scheduler.drip(1);
    }

    function test_globalUnpause_AllowsDrip() public {
        vm.prank(admin);
        scheduler.createStream(
            IRewardScheduler.TargetType.STAKING_REWARDS,
            address(lobToken),
            EMISSION,
            0
        );

        vm.prank(admin);
        scheduler.pause();

        vm.prank(admin);
        scheduler.unpause();

        vm.warp(block.timestamp + 100);

        scheduler.drip(1);
        assertEq(lobToken.balanceOf(address(stakingRewards)), 100 ether);
    }

    // ═══════════════════════════════════════════════════════════════
    //  INTEGRATION: StakingRewards reward rate
    // ═══════════════════════════════════════════════════════════════

    function test_integration_StakingRewardsRewardRate() public {
        // Setup: alice has a stake so rewards can accrue
        stakingManager.setStake(alice, 1000 ether);
        stakingManager.setTier(alice, IStakingManager.Tier.Bronze);
        vm.prank(alice);
        stakingRewards.syncStake();

        // Create stream: 1 LOB/sec to StakingRewards
        vm.prank(admin);
        scheduler.createStream(
            IRewardScheduler.TargetType.STAKING_REWARDS,
            address(lobToken),
            EMISSION,
            0
        );

        // Warp 6 days and drip (stay within V-004 staleness window)
        vm.warp(block.timestamp + 6 days);
        scheduler.drip(1);

        uint256 expectedAmount = 6 days * EMISSION;
        assertEq(lobToken.balanceOf(address(stakingRewards)), expectedAmount);

        // Warp 1 more second so rewardPerToken advances past the notifyRewardAmount timestamp
        vm.warp(block.timestamp + 1);

        // Verify alice can see earned rewards
        uint256 earned = stakingRewards.earned(alice, address(lobToken));
        assertGt(earned, 0);
    }

    function test_integration_LiquidityMiningRewardRate() public {
        // Setup: alice deposits LP tokens
        lpToken.mint(alice, 1000 ether);
        vm.startPrank(alice);
        lpToken.approve(address(liquidityMining), 1000 ether);
        liquidityMining.stake(1000 ether);
        vm.stopPrank();

        // Create stream: 1 LOB/sec to LiquidityMining
        vm.prank(admin);
        scheduler.createStream(
            IRewardScheduler.TargetType.LIQUIDITY_MINING,
            address(lobToken),
            EMISSION,
            0
        );

        // Warp 1 week and drip
        vm.warp(block.timestamp + 7 days);
        scheduler.drip(1);

        uint256 expectedAmount = 7 days * EMISSION;
        assertEq(lobToken.balanceOf(address(liquidityMining)), expectedAmount);

        // Warp 1 more second so rewardPerToken advances past the notifyRewardAmount timestamp
        vm.warp(block.timestamp + 1);

        // Verify alice can see earned rewards
        uint256 earned = liquidityMining.earned(alice);
        assertGt(earned, 0);
    }

    function test_integration_MultipleDrips() public {
        stakingManager.setStake(alice, 1000 ether);
        stakingManager.setTier(alice, IStakingManager.Tier.Bronze);
        vm.prank(alice);
        stakingRewards.syncStake();

        vm.prank(admin);
        scheduler.createStream(
            IRewardScheduler.TargetType.STAKING_REWARDS,
            address(lobToken),
            EMISSION,
            0
        );

        // Read lastDripTime from contract state (opaque to via_ir optimizer)
        IRewardScheduler.Stream memory s0 = scheduler.getStream(1);
        uint256 startTime = s0.lastDripTime;

        // Drip every day for 7 days
        for (uint256 i = 0; i < 7; i++) {
            vm.warp(startTime + (i + 1) * 1 days);
            scheduler.drip(1);
        }

        // Total should be 7 days worth
        uint256 totalExpected = 7 days * EMISSION;
        assertEq(lobToken.balanceOf(address(stakingRewards)), totalExpected);
    }

    function test_integration_TopUpAndContinue() public {
        // Create stream that will exhaust budget quickly
        vm.prank(admin);
        scheduler.createStream(
            IRewardScheduler.TargetType.STAKING_REWARDS,
            address(lobToken),
            10_000 ether,
            0
        );

        // Warp past budget exhaustion
        vm.warp(block.timestamp + 200); // would need 2M, only 1M
        scheduler.drip(1);
        assertEq(lobToken.balanceOf(address(scheduler)), 0);

        // Top up with more LOB
        vm.prank(distributor);
        lobToken.transfer(funder, 500_000 ether);
        vm.startPrank(funder);
        lobToken.approve(address(scheduler), 500_000 ether);
        scheduler.topUp(address(lobToken), 500_000 ether);
        vm.stopPrank();

        // Warp and drip again — should resume
        vm.warp(block.timestamp + 10);
        scheduler.drip(1);
        assertLt(lobToken.balanceOf(address(scheduler)), 500_000 ether);
    }

    // ═══════════════════════════════════════════════════════════════
    //  CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════

    function test_constructor_RevertZeroStakingRewards() public {
        RewardScheduler rs = new RewardScheduler();
        vm.expectRevert("RewardScheduler: zero stakingRewards");
        rs.initialize(address(0), address(liquidityMining));
    }

    function test_constructor_RevertZeroLiquidityMining() public {
        RewardScheduler rs = new RewardScheduler();
        vm.expectRevert("RewardScheduler: zero liquidityMining");
        rs.initialize(address(stakingRewards), address(0));
    }
}
