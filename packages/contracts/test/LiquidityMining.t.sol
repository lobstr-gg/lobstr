// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/LiquidityMining.sol";
import "../src/LOBToken.sol";

contract MockLPToken {
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

contract MockStakingManagerForLP {
    mapping(address => IStakingManager.Tier) private _tiers;

    function setTier(address user, IStakingManager.Tier tier) external {
        _tiers[user] = tier;
    }

    function getTier(address user) external view returns (IStakingManager.Tier) {
        return _tiers[user];
    }

    function getStake(address) external pure returns (uint256) {
        return 0;
    }

    function getStakeInfo(address) external pure returns (IStakingManager.StakeInfo memory) {
        return IStakingManager.StakeInfo(0, 0, 0);
    }

    function lockStake(address, uint256) external {}
    function unlockStake(address, uint256) external {}
    function getLockedStake(address) external pure returns (uint256) { return 0; }
    function getUnlockedStake(address) external pure returns (uint256) { return 0; }
}

contract MockSybilGuardForLP {
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

contract LiquidityMiningTest is Test {
    event Staked(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event RewardPaid(address indexed user, uint256 amount);
    event RewardNotified(uint256 amount, uint256 duration);
    event EmergencyWithdrawn(address indexed user, uint256 amount);

    LOBToken public lobToken;
    MockLPToken public lpToken;
    LiquidityMining public mining;
    MockStakingManagerForLP public stakingManager;
    MockSybilGuardForLP public sybilGuard;

    address public admin = makeAddr("admin");
    address public distributor = makeAddr("distributor");
    address public notifier = makeAddr("notifier");
    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");

    function setUp() public {
        vm.startPrank(admin);
        lobToken = new LOBToken(distributor);
        lpToken = new MockLPToken();
        sybilGuard = new MockSybilGuardForLP();
        stakingManager = new MockStakingManagerForLP();
        mining = new LiquidityMining(
            address(lpToken),
            address(lobToken),
            address(stakingManager),
            address(sybilGuard)
        );
        mining.grantRole(mining.REWARD_NOTIFIER_ROLE(), notifier);
        vm.stopPrank();

        // Fund notifier with LOB for rewards
        vm.prank(distributor);
        lobToken.transfer(notifier, 100_000 ether);

        // Mint LP tokens to users
        lpToken.mint(alice, 10_000 ether);
        lpToken.mint(bob, 10_000 ether);
    }

    // ═══════════════════════════════════════════════════════════════
    //  HELPERS
    // ═══════════════════════════════════════════════════════════════

    function _stakeLP(address user, uint256 amount) internal {
        vm.startPrank(user);
        lpToken.approve(address(mining), amount);
        mining.stake(amount);
        vm.stopPrank();
    }

    function _notifyReward(uint256 amount, uint256 duration) internal {
        vm.startPrank(notifier);
        lobToken.approve(address(mining), amount);
        mining.notifyRewardAmount(amount, duration);
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════
    //  STAKE / WITHDRAW
    // ═══════════════════════════════════════════════════════════════

    function test_stake() public {
        _stakeLP(alice, 1000 ether);

        assertEq(mining.balanceOf(alice), 1000 ether);
        assertEq(lpToken.balanceOf(address(mining)), 1000 ether);
    }

    function test_withdraw() public {
        _stakeLP(alice, 1000 ether);

        vm.prank(alice);
        mining.withdraw(500 ether);

        assertEq(mining.balanceOf(alice), 500 ether);
        assertEq(lpToken.balanceOf(alice), 9500 ether);
    }

    function test_revertWithdrawInsufficient() public {
        _stakeLP(alice, 1000 ether);

        vm.prank(alice);
        vm.expectRevert("LiquidityMining: insufficient balance");
        mining.withdraw(1001 ether);
    }

    function test_revertStakeZero() public {
        vm.prank(alice);
        vm.expectRevert("LiquidityMining: zero amount");
        mining.stake(0);
    }

    // ═══════════════════════════════════════════════════════════════
    //  SINGLE STAKER EARNS ALL
    // ═══════════════════════════════════════════════════════════════

    function test_singleStakerEarnsAll() public {
        _stakeLP(alice, 1000 ether);
        _notifyReward(7000 ether, 7 days);

        vm.warp(block.timestamp + 7 days);

        uint256 earned = mining.earned(alice);
        assertApproxEqAbs(earned, 7000 ether, 1e6);
    }

    // ═══════════════════════════════════════════════════════════════
    //  TWO STAKERS EQUAL BOOST
    // ═══════════════════════════════════════════════════════════════

    function test_twoStakersEqualBoost() public {
        _stakeLP(alice, 1000 ether);
        _stakeLP(bob, 1000 ether);
        _notifyReward(7000 ether, 7 days);

        vm.warp(block.timestamp + 7 days);

        assertApproxEqAbs(mining.earned(alice), 3500 ether, 1e6);
        assertApproxEqAbs(mining.earned(bob), 3500 ether, 1e6);
    }

    // ═══════════════════════════════════════════════════════════════
    //  PLATINUM 3X VS NONE
    // ═══════════════════════════════════════════════════════════════

    function test_platinumBoost3xVsNone() public {
        stakingManager.setTier(bob, IStakingManager.Tier.Platinum);

        _stakeLP(alice, 1000 ether);  // boost 1x → 1000 boosted
        _stakeLP(bob, 1000 ether);    // boost 3x → 3000 boosted

        _notifyReward(4000 ether, 4 days);

        vm.warp(block.timestamp + 4 days);

        // Alice: 1/4, Bob: 3/4
        assertApproxEqAbs(mining.earned(alice), 1000 ether, 1e6);
        assertApproxEqAbs(mining.earned(bob), 3000 ether, 1e6);
    }

    // ═══════════════════════════════════════════════════════════════
    //  EXIT
    // ═══════════════════════════════════════════════════════════════

    function test_exit() public {
        _stakeLP(alice, 1000 ether);
        _notifyReward(7000 ether, 7 days);

        vm.warp(block.timestamp + 7 days);

        vm.prank(alice);
        mining.exit();

        assertEq(mining.balanceOf(alice), 0);
        assertEq(lpToken.balanceOf(alice), 10_000 ether); // all LP back
        assertApproxEqAbs(lobToken.balanceOf(alice), 7000 ether, 1e6); // rewards claimed
    }

    // ═══════════════════════════════════════════════════════════════
    //  EMERGENCY WITHDRAW
    // ═══════════════════════════════════════════════════════════════

    function test_emergencyWithdraw() public {
        _stakeLP(alice, 1000 ether);
        _notifyReward(7000 ether, 7 days);
        vm.warp(block.timestamp + 3 days);

        vm.prank(alice);
        mining.emergencyWithdraw();

        assertEq(mining.balanceOf(alice), 0);
        assertEq(lpToken.balanceOf(alice), 10_000 ether); // all LP back
        assertEq(lobToken.balanceOf(alice), 0); // rewards forfeited
    }

    function test_emergencyWithdrawWorksWhenPaused() public {
        _stakeLP(alice, 1000 ether);

        vm.prank(admin);
        mining.pause();

        vm.prank(alice);
        mining.emergencyWithdraw();

        assertEq(mining.balanceOf(alice), 0);
        assertEq(lpToken.balanceOf(alice), 10_000 ether);
    }

    function test_revertEmergencyWithdrawNothing() public {
        vm.prank(alice);
        vm.expectRevert("LiquidityMining: nothing to withdraw");
        mining.emergencyWithdraw();
    }

    // ═══════════════════════════════════════════════════════════════
    //  BOOST RECALCULATION ON TIER CHANGE
    // ═══════════════════════════════════════════════════════════════

    function test_boostRecalculationOnTierChange() public {
        _stakeLP(alice, 1000 ether);
        _notifyReward(7000 ether, 7 days);

        vm.warp(block.timestamp + 3 days);

        // Alice upgrades to Platinum
        stakingManager.setTier(alice, IStakingManager.Tier.Platinum);

        // Getting reward triggers recalculation
        vm.prank(alice);
        mining.getReward();

        // Verify boost is now 3x
        assertEq(mining.getBoostMultiplier(alice), 30000);
    }

    // ═══════════════════════════════════════════════════════════════
    //  NOTIFY REWARD ROLLOVER
    // ═══════════════════════════════════════════════════════════════

    function test_notifyRewardRollover() public {
        _stakeLP(alice, 1000 ether);
        _notifyReward(7000 ether, 7 days);

        vm.warp(block.timestamp + 3 days);
        _notifyReward(7000 ether, 7 days);

        // Total should be ~14000 in contract (minus what was already distributed conceptually)
        assertEq(lobToken.balanceOf(address(mining)), 14_000 ether);
    }

    // ═══════════════════════════════════════════════════════════════
    //  PAUSE
    // ═══════════════════════════════════════════════════════════════

    function test_pauseBlocksStake() public {
        vm.prank(admin);
        mining.pause();

        vm.startPrank(alice);
        lpToken.approve(address(mining), 1000 ether);
        vm.expectRevert("Pausable: paused");
        mining.stake(1000 ether);
        vm.stopPrank();
    }

    function test_pauseBlocksWithdraw() public {
        _stakeLP(alice, 1000 ether);

        vm.prank(admin);
        mining.pause();

        vm.prank(alice);
        vm.expectRevert("Pausable: paused");
        mining.withdraw(500 ether);
    }

    // ═══════════════════════════════════════════════════════════════
    //  EVENTS
    // ═══════════════════════════════════════════════════════════════

    function test_emitsStaked() public {
        vm.startPrank(alice);
        lpToken.approve(address(mining), 1000 ether);

        vm.expectEmit(true, false, false, true);
        emit Staked(alice, 1000 ether);
        mining.stake(1000 ether);
        vm.stopPrank();
    }

    function test_emitsWithdrawn() public {
        _stakeLP(alice, 1000 ether);

        vm.expectEmit(true, false, false, true);
        emit Withdrawn(alice, 500 ether);

        vm.prank(alice);
        mining.withdraw(500 ether);
    }

    // ═══════════════════════════════════════════════════════════════
    //  CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════

    function test_revertZeroLpToken() public {
        vm.expectRevert("LiquidityMining: zero lpToken");
        new LiquidityMining(address(0), address(lobToken), address(stakingManager), address(sybilGuard));
    }

    function test_revertZeroRewardToken() public {
        vm.expectRevert("LiquidityMining: zero rewardToken");
        new LiquidityMining(address(lpToken), address(0), address(stakingManager), address(sybilGuard));
    }

    function test_revertZeroStakingManager() public {
        vm.expectRevert("LiquidityMining: zero stakingManager");
        new LiquidityMining(address(lpToken), address(lobToken), address(0), address(sybilGuard));
    }

    function test_revertZeroSybilGuard() public {
        vm.expectRevert("LiquidityMining: zero sybilGuard");
        new LiquidityMining(address(lpToken), address(lobToken), address(stakingManager), address(0));
    }

    // ═══════════════════════════════════════════════════════════════
    //  V-006: SYBIL BAN CHECKS
    // ═══════════════════════════════════════════════════════════════

    function test_revertStakeWhenBanned() public {
        sybilGuard.setBanned(alice, true);

        vm.startPrank(alice);
        lpToken.approve(address(mining), 1000 ether);
        vm.expectRevert("LiquidityMining: banned");
        mining.stake(1000 ether);
        vm.stopPrank();
    }

    function test_revertWithdrawWhenBanned() public {
        _stakeLP(alice, 1000 ether);
        sybilGuard.setBanned(alice, true);

        vm.prank(alice);
        vm.expectRevert("LiquidityMining: banned");
        mining.withdraw(500 ether);
    }

    function test_revertGetRewardWhenBanned() public {
        _stakeLP(alice, 1000 ether);
        _notifyReward(7000 ether, 7 days);
        vm.warp(block.timestamp + 7 days);

        sybilGuard.setBanned(alice, true);

        vm.prank(alice);
        vm.expectRevert("LiquidityMining: banned");
        mining.getReward();
    }

    function test_revertExitWhenBanned() public {
        _stakeLP(alice, 1000 ether);
        _notifyReward(7000 ether, 7 days);
        vm.warp(block.timestamp + 7 days);

        sybilGuard.setBanned(alice, true);

        vm.prank(alice);
        vm.expectRevert("LiquidityMining: banned");
        mining.exit();
    }

    function test_emergencyWithdrawStillWorksWhenBanned() public {
        _stakeLP(alice, 1000 ether);
        sybilGuard.setBanned(alice, true);

        // Emergency withdraw should still work (no ban check)
        vm.prank(alice);
        mining.emergencyWithdraw();

        assertEq(mining.balanceOf(alice), 0);
        assertEq(lpToken.balanceOf(alice), 10_000 ether);
    }
}
