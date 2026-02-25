// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";

contract LOBToken is Initializable, UUPSUpgradeable, OwnableUpgradeable, ERC20Upgradeable {
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 ether;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        // Initializers disabled by atomic proxy deployment + multisig ownership transfer
    }

    function initialize(address distributionAddress) public initializer {
        require(distributionAddress != address(0), "LOBToken: zero address");
        __UUPSUpgradeable_init();
        __Ownable_init(msg.sender);
        __ERC20_init("LOBSTR", "LOB");
        _mint(distributionAddress, TOTAL_SUPPLY);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
