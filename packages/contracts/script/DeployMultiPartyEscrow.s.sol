// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {MultiPartyEscrow} from "../src/MultiPartyEscrow.sol";

/**
 * @title DeployMultiPartyEscrow
 * @notice Standalone deploy script for MultiPartyEscrow against existing protocol.
 *
 *   Required .env variables:
 *     PRIVATE_KEY
 *     ESCROW_ENGINE_ADDRESS
 *     DISPUTE_ARBITRATION_ADDRESS
 *     LOB_TOKEN_ADDRESS
 *     SYBIL_GUARD_ADDRESS
 *
 *   Usage:
 *     forge script script/DeployMultiPartyEscrow.s.sol:DeployMultiPartyEscrow \
 *       --rpc-url $BASE_RPC_URL \
 *       --broadcast --verify -vvvv
 *
 *   POST-DEPLOY (via TreasuryGovernor multisig):
 *     1. Grant DEFAULT_ADMIN_ROLE on MultiPartyEscrow to TreasuryGovernor
 *     2. Renounce deployer's DEFAULT_ADMIN_ROLE on MultiPartyEscrow
 */
contract DeployMultiPartyEscrow is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        address escrowEngine = vm.envAddress("ESCROW_ENGINE_ADDRESS");
        address disputeArbitration = vm.envAddress("DISPUTE_ARBITRATION_ADDRESS");
        address lobToken = vm.envAddress("LOB_TOKEN_ADDRESS");
        address sybilGuard = vm.envAddress("SYBIL_GUARD_ADDRESS");

        vm.startBroadcast(deployerKey);

        MultiPartyEscrow multiPartyEscrow = new MultiPartyEscrow(
            escrowEngine,
            disputeArbitration,
            lobToken,
            sybilGuard
        );

        vm.stopBroadcast();

        console.log("");
        console.log("========== MULTI PARTY ESCROW DEPLOYED ==========");
        console.log("Deployer:              ", deployer);
        console.log("MultiPartyEscrow:      ", address(multiPartyEscrow));
        console.log("");
        console.log("Connected contracts:");
        console.log("  EscrowEngine:          ", escrowEngine);
        console.log("  DisputeArbitration:    ", disputeArbitration);
        console.log("  LOBToken:              ", lobToken);
        console.log("  SybilGuard:            ", sybilGuard);
        console.log("===================================================");
        console.log("");
        console.log("POST-DEPLOY (via TreasuryGovernor multisig):");
        console.log("  1. Grant DEFAULT_ADMIN_ROLE on MultiPartyEscrow to TreasuryGovernor");
        console.log("  2. Renounce deployer DEFAULT_ADMIN_ROLE on MultiPartyEscrow");
    }
}
