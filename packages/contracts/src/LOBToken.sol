// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract LOBToken is ERC20 {
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 ether;

    constructor(address distributionAddress) ERC20("LOBSTR", "LOB") {
        require(distributionAddress != address(0), "LOBToken: zero address");
        _mint(distributionAddress, TOTAL_SUPPLY);
    }
}
