// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/LOBToken.sol";
import "../src/StakingManager.sol";
import "../src/ReputationSystem.sol";
import "../src/ServiceRegistry.sol";
import "../src/DisputeArbitration.sol";
import "../src/EscrowEngine.sol";

contract DeployScript is Script {
    function run() external {
        address deployer = msg.sender;
        address treasury = vm.envAddress("TREASURY_ADDRESS");
        address distributionAddress = vm.envAddress("DISTRIBUTION_ADDRESS");

        vm.startBroadcast();

        // 1. LOBToken — no dependencies
        LOBToken token = new LOBToken(distributionAddress);
        console.log("LOBToken deployed at:", address(token));

        // 2. ReputationSystem — no dependencies
        ReputationSystem reputation = new ReputationSystem();
        console.log("ReputationSystem deployed at:", address(reputation));

        // 3. StakingManager — needs LOBToken
        StakingManager staking = new StakingManager(address(token));
        console.log("StakingManager deployed at:", address(staking));

        // 4. ServiceRegistry — needs StakingManager + ReputationSystem
        ServiceRegistry registry = new ServiceRegistry(address(staking), address(reputation));
        console.log("ServiceRegistry deployed at:", address(registry));

        // 5. DisputeArbitration — needs LOBToken + StakingManager + ReputationSystem
        DisputeArbitration dispute = new DisputeArbitration(address(token), address(staking), address(reputation));
        console.log("DisputeArbitration deployed at:", address(dispute));

        // 6. EscrowEngine — needs everything
        EscrowEngine escrow = new EscrowEngine(
            address(token),
            address(registry),
            address(staking),
            address(dispute),
            address(reputation),
            treasury
        );
        console.log("EscrowEngine deployed at:", address(escrow));

        // 7. Post-deploy: Grant roles
        // EscrowEngine gets RECORDER_ROLE on ReputationSystem
        reputation.grantRole(reputation.RECORDER_ROLE(), address(escrow));
        console.log("Granted RECORDER_ROLE to EscrowEngine on ReputationSystem");

        // DisputeArbitration gets RECORDER_ROLE on ReputationSystem
        reputation.grantRole(reputation.RECORDER_ROLE(), address(dispute));
        console.log("Granted RECORDER_ROLE to DisputeArbitration on ReputationSystem");

        // DisputeArbitration gets SLASHER_ROLE on StakingManager
        staking.grantRole(staking.SLASHER_ROLE(), address(dispute));
        console.log("Granted SLASHER_ROLE to DisputeArbitration on StakingManager");

        // EscrowEngine gets ESCROW_ROLE on DisputeArbitration
        dispute.grantRole(dispute.ESCROW_ROLE(), address(escrow));
        console.log("Granted ESCROW_ROLE to EscrowEngine on DisputeArbitration");

        vm.stopBroadcast();

        console.log("--- Deployment Complete ---");
        console.log("Deployer:", deployer);
        console.log("Treasury:", treasury);
    }
}
