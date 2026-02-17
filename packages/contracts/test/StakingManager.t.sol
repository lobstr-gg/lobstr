// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/LOBToken.sol";
import "../src/StakingManager.sol";

contract StakingManagerTest is Test {
    LOBToken public token;
    StakingManager public staking;

    address public admin = makeAddr("admin");
    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");
    address public slasher = makeAddr("slasher");
    address public distributor = makeAddr("distributor");

    function setUp() public {
        vm.startPrank(admin);
        token = new LOBToken(distributor);
        staking = new StakingManager(address(token));
        staking.grantRole(staking.SLASHER_ROLE(), slasher);
        vm.stopPrank();

        // Fund alice and bob
        vm.startPrank(distributor);
        token.transfer(alice, 200_000 ether);
        token.transfer(bob, 200_000 ether);
        vm.stopPrank();
    }

    function test_Stake_Bronze() public {
        vm.startPrank(alice);
        token.approve(address(staking), 100 ether);
        staking.stake(100 ether);
        vm.stopPrank();

        assertEq(staking.getStake(alice), 100 ether);
        assertEq(uint256(staking.getTier(alice)), uint256(IStakingManager.Tier.Bronze));
    }

    function test_Stake_Silver() public {
        vm.startPrank(alice);
        token.approve(address(staking), 1_000 ether);
        staking.stake(1_000 ether);
        vm.stopPrank();

        assertEq(uint256(staking.getTier(alice)), uint256(IStakingManager.Tier.Silver));
    }

    function test_Stake_Gold() public {
        vm.startPrank(alice);
        token.approve(address(staking), 10_000 ether);
        staking.stake(10_000 ether);
        vm.stopPrank();

        assertEq(uint256(staking.getTier(alice)), uint256(IStakingManager.Tier.Gold));
    }

    function test_Stake_Platinum() public {
        vm.startPrank(alice);
        token.approve(address(staking), 100_000 ether);
        staking.stake(100_000 ether);
        vm.stopPrank();

        assertEq(uint256(staking.getTier(alice)), uint256(IStakingManager.Tier.Platinum));
    }

    function test_Stake_Incremental() public {
        vm.startPrank(alice);
        token.approve(address(staking), 200 ether);
        staking.stake(50 ether);
        assertEq(uint256(staking.getTier(alice)), uint256(IStakingManager.Tier.None));

        staking.stake(50 ether);
        assertEq(uint256(staking.getTier(alice)), uint256(IStakingManager.Tier.Bronze));
        vm.stopPrank();
    }

    function test_Stake_TierChangesOnThreshold() public {
        vm.startPrank(alice);
        token.approve(address(staking), 100 ether);

        assertEq(uint256(staking.getTier(alice)), uint256(IStakingManager.Tier.None));
        staking.stake(100 ether);
        assertEq(uint256(staking.getTier(alice)), uint256(IStakingManager.Tier.Bronze));
        vm.stopPrank();
    }

    function test_RequestUnstake_And_Unstake() public {
        vm.startPrank(alice);
        token.approve(address(staking), 1_000 ether);
        staking.stake(1_000 ether);

        staking.requestUnstake(500 ether);

        IStakingManager.StakeInfo memory info = staking.getStakeInfo(alice);
        assertEq(info.unstakeRequestAmount, 500 ether);

        // Fast forward 7 days
        vm.warp(block.timestamp + 7 days);

        uint256 balBefore = token.balanceOf(alice);
        staking.unstake();
        uint256 balAfter = token.balanceOf(alice);

        assertEq(balAfter - balBefore, 500 ether);
        assertEq(staking.getStake(alice), 500 ether);
        vm.stopPrank();
    }

    function test_Unstake_RevertCooldownActive() public {
        vm.startPrank(alice);
        token.approve(address(staking), 1_000 ether);
        staking.stake(1_000 ether);
        staking.requestUnstake(500 ether);

        vm.expectRevert("StakingManager: cooldown active");
        staking.unstake();
        vm.stopPrank();
    }

    function test_RequestUnstake_RevertPending() public {
        vm.startPrank(alice);
        token.approve(address(staking), 1_000 ether);
        staking.stake(1_000 ether);
        staking.requestUnstake(500 ether);

        vm.expectRevert("StakingManager: pending unstake");
        staking.requestUnstake(200 ether);
        vm.stopPrank();
    }

    function test_Slash() public {
        vm.startPrank(alice);
        token.approve(address(staking), 1_000 ether);
        staking.stake(1_000 ether);
        vm.stopPrank();

        uint256 bobBalBefore = token.balanceOf(bob);

        vm.prank(slasher);
        staking.slash(alice, 200 ether, bob);

        assertEq(staking.getStake(alice), 800 ether);
        assertEq(token.balanceOf(bob), bobBalBefore + 200 ether);
    }

    function test_Slash_CapsAtStake() public {
        vm.startPrank(alice);
        token.approve(address(staking), 100 ether);
        staking.stake(100 ether);
        vm.stopPrank();

        vm.prank(slasher);
        staking.slash(alice, 500 ether, bob);

        assertEq(staking.getStake(alice), 0);
    }

    function test_Slash_RevertNotSlasher() public {
        vm.startPrank(alice);
        token.approve(address(staking), 100 ether);
        staking.stake(100 ether);
        vm.stopPrank();

        vm.prank(bob);
        vm.expectRevert();
        staking.slash(alice, 50 ether, bob);
    }

    function test_Stake_RevertZeroAmount() public {
        vm.prank(alice);
        vm.expectRevert("StakingManager: zero amount");
        staking.stake(0);
    }

    function test_MaxListings() public view {
        assertEq(staking.maxListings(IStakingManager.Tier.None), 0);
        assertEq(staking.maxListings(IStakingManager.Tier.Bronze), 3);
        assertEq(staking.maxListings(IStakingManager.Tier.Silver), 10);
        assertEq(staking.maxListings(IStakingManager.Tier.Gold), 25);
        assertEq(staking.maxListings(IStakingManager.Tier.Platinum), type(uint256).max);
    }

    function test_TierThreshold() public view {
        assertEq(staking.tierThreshold(IStakingManager.Tier.None), 0);
        assertEq(staking.tierThreshold(IStakingManager.Tier.Bronze), 100 ether);
        assertEq(staking.tierThreshold(IStakingManager.Tier.Silver), 1_000 ether);
        assertEq(staking.tierThreshold(IStakingManager.Tier.Gold), 10_000 ether);
        assertEq(staking.tierThreshold(IStakingManager.Tier.Platinum), 100_000 ether);
    }
}
