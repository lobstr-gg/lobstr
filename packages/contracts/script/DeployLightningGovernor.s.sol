// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/LightningGovernor.sol";

/**
 * @title DeployLightningGovernorScript
 * @notice Standalone deploy for LightningGovernor.
 *
 *   Required .env variables:
 *     PRIVATE_KEY, STAKING_MANAGER_ADDRESS, TREASURY_GOVERNOR_ADDRESS,
 *     SENTINEL_ADDRESS, ARBITER_ADDRESS, STEWARD_ADDRESS, GUARDIAN_ADDRESS
 *
 *   Usage:
 *     forge script script/DeployLightningGovernor.s.sol:DeployLightningGovernorScript \
 *       --rpc-url $BASE_RPC_URL --broadcast --verify -vvvv
 */
contract DeployLightningGovernorScript is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        address stakingManager = vm.envAddress("STAKING_MANAGER_ADDRESS");
        address admin = vm.envAddress("TREASURY_GOVERNOR_ADDRESS");
        address guardian = vm.envAddress("GUARDIAN_ADDRESS");

        address[] memory executors = new address[](3);
        executors[0] = vm.envAddress("SENTINEL_ADDRESS");
        executors[1] = vm.envAddress("ARBITER_ADDRESS");
        executors[2] = vm.envAddress("STEWARD_ADDRESS");

        LightningGovernor gov = new LightningGovernor(
            stakingManager,
            admin,
            executors,
            guardian
        );

        vm.stopBroadcast();

        console.log("LightningGovernor:", address(gov));
        console.log("");
        console.log("POST-DEPLOY (via TreasuryGovernor proposals):");
        console.log("  1. Grant DEFAULT_ADMIN_ROLE on target contracts to LightningGovernor");
        console.log("  2. Configure whitelist entries via setWhitelisted()");
    }
}
