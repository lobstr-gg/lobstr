// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/LOBToken.sol";
import "../src/RewardDistributor.sol";
import "./helpers/ProxyTestHelper.sol";

contract RewardDistributorTest is Test, ProxyTestHelper {
    LOBToken public token;
    RewardDistributor public distributor;

    address public admin = makeAddr("admin");
    address public disputeContract = makeAddr("dispute");
    address public sybilGuardContract = makeAddr("sybilGuard");
    address public tokenDistributor = makeAddr("tokenDistributor");

    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");
    address public depositor = makeAddr("depositor");

    function setUp() public {
        vm.startPrank(admin);
        token = LOBToken(_deployProxy(address(new LOBToken()), abi.encodeCall(LOBToken.initialize, (tokenDistributor))));
        distributor = RewardDistributor(_deployProxy(address(new RewardDistributor()), abi.encodeCall(RewardDistributor.initialize, ())));

        distributor.grantRole(distributor.DISPUTE_ROLE(), disputeContract);
        distributor.grantRole(distributor.SYBIL_GUARD_ROLE(), sybilGuardContract);
        vm.stopPrank();

        // Fund the distributor
        vm.startPrank(tokenDistributor);
        token.transfer(address(distributor), 100_000 ether);
        token.transfer(depositor, 50_000 ether);
        vm.stopPrank();
    }

    function test_CreditArbitratorReward() public {
        vm.prank(disputeContract);
        distributor.creditArbitratorReward(alice, address(token), 100 ether);

        assertEq(distributor.claimableBalance(alice, address(token)), 100 ether);
        assertEq(distributor.totalEarnedByAccount(alice), 100 ether);
    }

    function test_CreditWatcherReward() public {
        vm.prank(sybilGuardContract);
        distributor.creditWatcherReward(alice, address(token), 50 ether);

        assertEq(distributor.claimableBalance(alice, address(token)), 50 ether);
    }

    function test_CreditJudgeReward() public {
        vm.prank(sybilGuardContract);
        distributor.creditJudgeReward(bob, address(token), 25 ether);

        assertEq(distributor.claimableBalance(bob, address(token)), 25 ether);
    }

    function test_Claim() public {
        vm.prank(disputeContract);
        distributor.creditArbitratorReward(alice, address(token), 100 ether);

        uint256 balBefore = token.balanceOf(alice);
        vm.prank(alice);
        distributor.claim(address(token));

        assertEq(token.balanceOf(alice), balBefore + 100 ether);
        assertEq(distributor.claimableBalance(alice, address(token)), 0);
        assertEq(distributor.totalDistributed(), 100 ether);
    }

    function test_ClaimRevertsIfNothingToClaim() public {
        vm.prank(alice);
        vm.expectRevert("RewardDistributor: nothing to claim");
        distributor.claim(address(token));
    }

    function test_MultipleCreditsThenClaim() public {
        vm.prank(disputeContract);
        distributor.creditArbitratorReward(alice, address(token), 100 ether);
        vm.prank(sybilGuardContract);
        distributor.creditWatcherReward(alice, address(token), 50 ether);

        assertEq(distributor.claimableBalance(alice, address(token)), 150 ether);

        vm.prank(alice);
        distributor.claim(address(token));

        assertEq(token.balanceOf(alice), 150 ether);
    }

    function test_Deposit() public {
        vm.startPrank(depositor);
        token.approve(address(distributor), 10_000 ether);
        distributor.deposit(address(token), 10_000 ether);
        vm.stopPrank();

        assertEq(distributor.totalDeposited(), 10_000 ether);
    }

    function test_OnlyDisputeRoleCanCreditArbitrator() public {
        vm.prank(alice);
        vm.expectRevert();
        distributor.creditArbitratorReward(alice, address(token), 100 ether);
    }

    function test_OnlySybilGuardRoleCanCreditWatcher() public {
        vm.prank(alice);
        vm.expectRevert();
        distributor.creditWatcherReward(alice, address(token), 100 ether);
    }

    function test_OnlySybilGuardRoleCanCreditJudge() public {
        vm.prank(alice);
        vm.expectRevert();
        distributor.creditJudgeReward(alice, address(token), 100 ether);
    }

    function test_CreditRevertsOnZeroAddress() public {
        vm.prank(disputeContract);
        vm.expectRevert("RewardDistributor: zero address");
        distributor.creditArbitratorReward(address(0), address(token), 100 ether);
    }

    function test_CreditRevertsOnZeroAmount() public {
        vm.prank(disputeContract);
        vm.expectRevert("RewardDistributor: zero amount");
        distributor.creditArbitratorReward(alice, address(token), 0);
    }

    function test_DepositRevertsOnZeroAmount() public {
        vm.prank(depositor);
        vm.expectRevert("RewardDistributor: zero amount");
        distributor.deposit(address(token), 0);
    }

    // ═══════════════════════════════════════════════════════════════
    //  V-002: SOLVENCY / AVAILABLE BUDGET
    // ═══════════════════════════════════════════════════════════════

    function test_AvailableBudget_InitiallyEqualsBalance() public view {
        uint256 budget = distributor.availableBudget(address(token));
        assertEq(budget, 100_000 ether);
    }

    function test_AvailableBudget_DecreasesByCredits() public {
        vm.prank(disputeContract);
        distributor.creditArbitratorReward(alice, address(token), 30_000 ether);

        // 100k balance - 30k credited = 70k available
        assertEq(distributor.availableBudget(address(token)), 70_000 ether);
    }

    function test_AvailableBudget_RecoveredByClaim() public {
        vm.prank(disputeContract);
        distributor.creditArbitratorReward(alice, address(token), 30_000 ether);

        // Claim reduces liabilities
        vm.prank(alice);
        distributor.claim(address(token));

        // 70k balance (30k went to alice) - 0 liabilities = 70k
        assertEq(distributor.availableBudget(address(token)), 70_000 ether);
    }

    function test_AvailableBudget_MultipleCredits() public {
        vm.prank(disputeContract);
        distributor.creditArbitratorReward(alice, address(token), 40_000 ether);
        vm.prank(sybilGuardContract);
        distributor.creditWatcherReward(bob, address(token), 30_000 ether);

        // 100k - 70k = 30k
        assertEq(distributor.availableBudget(address(token)), 30_000 ether);
    }

    function test_AvailableBudget_ZeroWhenFullyCredited() public {
        vm.prank(disputeContract);
        distributor.creditArbitratorReward(alice, address(token), 100_000 ether);

        assertEq(distributor.availableBudget(address(token)), 0);
    }
}
