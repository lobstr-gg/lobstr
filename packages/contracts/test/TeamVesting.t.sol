// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/LOBToken.sol";
import "../src/TeamVesting.sol";

contract TeamVestingTest is Test {
    LOBToken public token;
    TeamVesting public vesting;

    address public deployer = address(this);
    address public beneficiary = address(0xBEEF);
    address public newBeneficiary = address(0xCAFE);
    address public treasury = address(0x7BEA);

    uint256 public constant ALLOCATION = 150_000_000 ether;
    uint256 public constant CLIFF = 180 days;    // 6 months
    uint256 public constant DURATION = 1095 days; // 3 years

    function setUp() public {
        token = new LOBToken();
        token.initialize(deployer);

        vesting = new TeamVesting();
        vesting.initialize(
            address(token),
            beneficiary,
            block.timestamp,
            CLIFF,
            DURATION
        );

        // Fund the vesting contract
        token.transfer(address(vesting), ALLOCATION);

        // Set allocation
        vesting.setTotalAllocation(ALLOCATION);
    }

    // --- Cliff Tests ---

    function test_nothingBeforeCliff() public {
        // Warp to just before cliff
        vm.warp(block.timestamp + CLIFF - 1);

        assertEq(vesting.vestedAmount(), 0);
        assertEq(vesting.releasable(), 0);

        vm.expectRevert("TeamVesting: nothing to release");
        vesting.release();
    }

    function test_vestingAtCliff() public {
        vm.warp(block.timestamp + CLIFF);

        // At cliff: (ALLOCATION * CLIFF) / DURATION
        uint256 expected = (ALLOCATION * CLIFF) / DURATION;
        assertEq(vesting.vestedAmount(), expected);
        assertEq(vesting.releasable(), expected);
    }

    // --- Linear Vesting Tests ---

    function test_linearVesting() public {
        // Warp to halfway through duration
        uint256 halfway = DURATION / 2;
        vm.warp(block.timestamp + halfway);

        uint256 expected = (ALLOCATION * halfway) / DURATION;
        assertEq(vesting.vestedAmount(), expected);
    }

    function test_fullyVested() public {
        vm.warp(block.timestamp + DURATION);
        assertEq(vesting.vestedAmount(), ALLOCATION);
    }

    function test_fullyVestedPastDuration() public {
        vm.warp(block.timestamp + DURATION + 365 days);
        assertEq(vesting.vestedAmount(), ALLOCATION);
    }

    // --- Release Tests ---

    function test_releaseAfterCliff() public {
        vm.warp(block.timestamp + CLIFF);

        uint256 expected = (ALLOCATION * CLIFF) / DURATION;
        vesting.release();

        assertEq(token.balanceOf(beneficiary), expected);
        assertEq(vesting.released(), expected);
    }

    function test_multipleReleases() public {
        // Release at cliff
        vm.warp(block.timestamp + CLIFF);
        vesting.release();
        uint256 firstRelease = token.balanceOf(beneficiary);

        // Release halfway
        vm.warp(block.timestamp + (DURATION / 2) - CLIFF);
        vesting.release();
        uint256 secondBalance = token.balanceOf(beneficiary);
        assertTrue(secondBalance > firstRelease);

        // Release at end
        vm.warp(block.timestamp + DURATION);
        vesting.release();
        assertEq(token.balanceOf(beneficiary), ALLOCATION);
    }

    function test_releaseAll() public {
        vm.warp(block.timestamp + DURATION);
        vesting.release();
        assertEq(token.balanceOf(beneficiary), ALLOCATION);
        assertEq(vesting.released(), ALLOCATION);

        // Nothing left
        vm.expectRevert("TeamVesting: nothing to release");
        vesting.release();
    }

    // --- Revoke Tests ---

    function test_revoke() public {
        // Warp to cliff, release some
        vm.warp(block.timestamp + CLIFF);
        vesting.release();

        uint256 releasedSoFar = vesting.released();
        uint256 balanceBefore = token.balanceOf(treasury);

        vesting.revoke(treasury);

        assertTrue(vesting.revoked());
        // Treasury should receive remaining balance minus what's owed
        uint256 vested = vesting.vestedAmount();
        uint256 owed = vested - releasedSoFar;
        uint256 expectedReturn = ALLOCATION - releasedSoFar - owed;
        // expectedReturn = ALLOCATION - vested (since releasedSoFar was all owed at that time, owed = 0)
        // Actually: owed = vested - released. releasedSoFar == vested at cliff. So owed = 0.
        // return = balance - owed = (ALLOCATION - releasedSoFar) - 0
        assertEq(token.balanceOf(treasury) - balanceBefore, ALLOCATION - releasedSoFar);
    }

    function test_revert_revokeNonAdmin() public {
        vm.prank(beneficiary);
        vm.expectRevert();
        vesting.revoke(treasury);
    }

    function test_revert_doubleRevoke() public {
        vesting.revoke(treasury);
        vm.expectRevert("TeamVesting: already revoked");
        vesting.revoke(treasury);
    }

    function test_revert_releaseAfterRevoke() public {
        vm.warp(block.timestamp + CLIFF);
        vesting.revoke(treasury);

        vm.expectRevert("TeamVesting: revoked");
        vesting.release();
    }

    // --- Beneficiary Tests ---

    function test_setBeneficiary() public {
        vesting.setBeneficiary(newBeneficiary);
        assertEq(vesting.beneficiary(), newBeneficiary);

        // Release goes to new beneficiary
        vm.warp(block.timestamp + CLIFF);
        vesting.release();
        assertTrue(token.balanceOf(newBeneficiary) > 0);
        assertEq(token.balanceOf(beneficiary), 0);
    }

    function test_revert_setBeneficiaryZero() public {
        vm.expectRevert("TeamVesting: zero beneficiary");
        vesting.setBeneficiary(address(0));
    }

    function test_revert_setBeneficiaryNonAdmin() public {
        vm.prank(beneficiary);
        vm.expectRevert();
        vesting.setBeneficiary(newBeneficiary);
    }

    // --- Allocation Tests ---

    function test_revert_setAllocationTwice() public {
        vm.expectRevert("TeamVesting: already set");
        vesting.setTotalAllocation(1 ether);
    }

    function test_revert_setAllocationZero() public {
        // Deploy new vesting without setting allocation
        TeamVesting v2 = new TeamVesting();
        v2.initialize(
            address(token),
            beneficiary,
            block.timestamp,
            CLIFF,
            DURATION
        );

        vm.expectRevert("TeamVesting: zero amount");
        v2.setTotalAllocation(0);
    }

    function test_revert_releaseWithoutAllocation() public {
        TeamVesting v2 = new TeamVesting();
        v2.initialize(
            address(token),
            beneficiary,
            block.timestamp,
            CLIFF,
            DURATION
        );

        vm.warp(block.timestamp + CLIFF);
        vm.expectRevert("TeamVesting: allocation not set");
        v2.release();
    }

    // --- Constructor Tests ---

    function test_revert_cliffGreaterThanDuration() public {
        TeamVesting v2 = new TeamVesting();
        vm.expectRevert("TeamVesting: cliff > duration");
        v2.initialize(
            address(token),
            beneficiary,
            block.timestamp,
            DURATION + 1,
            DURATION
        );
    }

    function test_revert_zeroDuration() public {
        TeamVesting v2 = new TeamVesting();
        vm.expectRevert("TeamVesting: zero duration");
        v2.initialize(
            address(token),
            beneficiary,
            block.timestamp,
            0,
            0
        );
    }
}
