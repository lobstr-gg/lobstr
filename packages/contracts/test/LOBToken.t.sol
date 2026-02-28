// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/LOBToken.sol";
import "./helpers/ProxyTestHelper.sol";

contract LOBTokenTest is Test, ProxyTestHelper {
    LOBToken public token;
    address public distributor = makeAddr("distributor");
    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");

    function setUp() public {
        token = LOBToken(_deployProxy(address(new LOBToken()), abi.encodeCall(LOBToken.initialize, (distributor))));
    }

    function test_Name() public view {
        assertEq(token.name(), "LOBSTR");
    }

    function test_Symbol() public view {
        assertEq(token.symbol(), "LOB");
    }

    function test_Decimals() public view {
        assertEq(token.decimals(), 18);
    }

    function test_TotalSupply() public view {
        assertEq(token.totalSupply(), 1_000_000_000 ether);
    }

    function test_DistributorBalance() public view {
        assertEq(token.balanceOf(distributor), 1_000_000_000 ether);
    }

    function test_Transfer() public {
        vm.prank(distributor);
        token.transfer(alice, 1000 ether);
        assertEq(token.balanceOf(alice), 1000 ether);
        assertEq(token.balanceOf(distributor), 1_000_000_000 ether - 1000 ether);
    }

    function test_Approve_And_TransferFrom() public {
        vm.prank(distributor);
        token.approve(alice, 500 ether);

        vm.prank(alice);
        token.transferFrom(distributor, bob, 500 ether);

        assertEq(token.balanceOf(bob), 500 ether);
    }

    function test_RevertZeroAddress() public {
        address impl = address(new LOBToken());
        vm.expectRevert("LOBToken: zero address");
        _deployProxy(impl, abi.encodeCall(LOBToken.initialize, (address(0))));
    }

    function test_TOTAL_SUPPLY_Constant() public view {
        assertEq(token.TOTAL_SUPPLY(), 1_000_000_000 ether);
    }
}
