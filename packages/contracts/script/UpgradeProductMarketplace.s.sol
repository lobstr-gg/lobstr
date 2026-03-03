// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/ProductMarketplace.sol";
import "../src/ProductMarketplaceExtension.sol";

/**
 * @title UpgradeProductMarketplace
 * @notice UUPS upgrade for ProductMarketplace V2 (X402 + InsurancePool integration).
 *
 *   Deploys new implementation + extension contract.
 *   Upgrades proxy, sets extension, then calls initializeV2 (on extension via fallback).
 *
 *   Required .env variables:
 *     PRIVATE_KEY                    — proxy owner
 *     PRODUCT_MARKETPLACE_PROXY      — existing proxy address
 *     INSURANCE_POOL_ADDRESS         — InsurancePool proxy address
 *
 *   Usage:
 *     forge script script/UpgradeProductMarketplace.s.sol:UpgradeProductMarketplace \
 *       --rpc-url $BASE_MAINNET_RPC_URL \
 *       --broadcast --verify -vvvv
 *
 *   POST-UPGRADE:
 *     marketplace.grantRole(FACILITATOR_ROLE, <FACILITATOR_ADDRESS>)
 */
contract UpgradeProductMarketplace is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address proxy = vm.envAddress("PRODUCT_MARKETPLACE_PROXY");
        address insurancePool = vm.envAddress("INSURANCE_POOL_ADDRESS");

        vm.startBroadcast(deployerKey);

        // 1. Deploy new V2 implementation
        ProductMarketplace newImpl = new ProductMarketplace();
        console.log("New implementation:", address(newImpl));

        // 2. Deploy extension (V2 functions: insured, x402, claims)
        ProductMarketplaceExtension ext = new ProductMarketplaceExtension();
        console.log("Extension:", address(ext));

        // 3. Upgrade proxy (no initializer call — we do it via extension)
        ProductMarketplace(payable(proxy)).upgradeToAndCall(
            address(newImpl),
            "" // no init data — initializeV2 is on the extension
        );
        console.log("Proxy upgraded");

        // 4. Set extension on the proxy
        ProductMarketplace(payable(proxy)).setExtension(address(ext));
        console.log("Extension set");

        // 5. Call initializeV2 (EIP712 init) — routed via fallback to extension
        ProductMarketplaceExtension(payable(proxy)).initializeV2();
        console.log("initializeV2 complete (EIP712)");

        // 6. Wire InsurancePool — also routed via fallback to extension
        ProductMarketplaceExtension(payable(proxy)).setInsurancePool(insurancePool);
        console.log("InsurancePool set:", insurancePool);

        vm.stopBroadcast();

        console.log("");
        console.log("========== PRODUCT MARKETPLACE V2 COMPLETE ==========");
        console.log("Proxy:                ", proxy);
        console.log("New implementation:   ", address(newImpl));
        console.log("Extension:            ", address(ext));
        console.log("InsurancePool:        ", insurancePool);
        console.log("=====================================================");
        console.log("");
        console.log("POST-UPGRADE:");
        console.log("  marketplace.grantRole(FACILITATOR_ROLE, <FACILITATOR>)");
    }
}
