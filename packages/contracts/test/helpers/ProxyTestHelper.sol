// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/// @dev Mixin for test contracts — deploys UUPS implementations behind ERC1967Proxy.
abstract contract ProxyTestHelper {
    function _deployProxy(address impl, bytes memory initData) internal returns (address) {
        return address(new ERC1967Proxy(impl, initData));
    }
}
