// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/ProductMarketplace.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/**
 * @title DeployProductMarketplace
 * @notice Standalone deploy script for ProductMarketplace (physical goods marketplace).
 *
 *   Required .env variables:
 *     PRIVATE_KEY
 *     SERVICE_REGISTRY_ADDRESS
 *     ESCROW_ENGINE_ADDRESS
 *     SYBIL_GUARD_ADDRESS
 *
 *   Usage:
 *     forge script script/DeployProductMarketplace.s.sol:DeployProductMarketplace \
 *       --rpc-url $BASE_RPC_URL \
 *       --broadcast --verify -vvvv
 *
 *   POST-DEPLOY:
 *     1. Update contract-addresses.ts with the proxy address
 *     2. Generate ABI from forge output and add to abis.ts
 *     3. Add to indexer ponder.config.ts
 */
contract DeployProductMarketplace is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        address serviceRegistry = vm.envAddress("SERVICE_REGISTRY_ADDRESS");
        address escrowEngine = vm.envAddress("ESCROW_ENGINE_ADDRESS");
        address sybilGuard = vm.envAddress("SYBIL_GUARD_ADDRESS");

        vm.startBroadcast(deployerKey);

        // Deploy implementation
        ProductMarketplace impl = new ProductMarketplace();

        // Deploy proxy
        ERC1967Proxy proxy = new ERC1967Proxy(
            address(impl),
            abi.encodeCall(ProductMarketplace.initialize, (
                serviceRegistry,
                escrowEngine,
                sybilGuard
            ))
        );

        ProductMarketplace marketplace = ProductMarketplace(address(proxy));

        vm.stopBroadcast();

        console.log("");
        console.log("========== PRODUCT MARKETPLACE DEPLOYED ==========");
        console.log("Deployer:              ", deployer);
        console.log("ProductMarketplace (proxy):", address(marketplace));
        console.log("ProductMarketplace (impl):", address(impl));
        console.log("");
        console.log("Connected contracts:");
        console.log("  ServiceRegistry:     ", serviceRegistry);
        console.log("  EscrowEngine:        ", escrowEngine);
        console.log("  SybilGuard:          ", sybilGuard);
        console.log("=====================================================");
        console.log("");
        console.log("POST-DEPLOY:");
        console.log("  1. Update contract-addresses.ts with proxy address");
        console.log("  2. Add ProductMarketplace ABI to web/abis.ts and indexer/abis/");
        console.log("  3. Add contract to indexer ponder.config.ts");
    }
}
