// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/X402EscrowBridge.sol";

/**
 * @title DeployBridgeScript
 * @notice Deploys the X402EscrowBridge contract for x402 → LOBSTR escrow integration.
 *
 *   Required .env variables:
 *     PRIVATE_KEY            — deployer private key
 *     ESCROW_ENGINE          — address of the deployed EscrowEngine
 *     DISPUTE_ARBITRATION    — address of the deployed DisputeArbitration
 *     FACILITATOR_ADDRESS    — address of the x402 facilitator wallet
 *
 *   Usage:
 *     forge script script/DeployBridge.s.sol:DeployBridgeScript \
 *       --rpc-url $BASE_SEPOLIA_RPC_URL \
 *       --broadcast --verify -vvvv
 */
contract DeployBridgeScript is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address escrowEngine = vm.envAddress("ESCROW_ENGINE");
        address disputeArbitration = vm.envAddress("DISPUTE_ARBITRATION");
        address facilitatorAddr = vm.envAddress("FACILITATOR_ADDRESS");

        vm.startBroadcast(deployerKey);

        X402EscrowBridge bridge = new X402EscrowBridge();
        bridge.initialize(escrowEngine, disputeArbitration);
        bridge.grantRole(bridge.FACILITATOR_ROLE(), facilitatorAddr);

        vm.stopBroadcast();

        console.log("X402EscrowBridge deployed at:", address(bridge));
        console.log("  escrow:", escrowEngine);
        console.log("  disputeArbitration:", disputeArbitration);
        console.log("  facilitator:", facilitatorAddr);
    }
}
