// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/BondingEngine.sol";

/**
 * @title DeployBondingEngine
 * @notice Standalone deploy script for BondingEngine against existing protocol.
 *
 *   TREASURY_ADDRESS = TreasuryGovernor (Titus). All 150M LP-reserve LOB
 *   flows through Titus. sweepQuoteToken() and withdrawLOB() are hardcoded
 *   to send to this address — no arbitrary destinations.
 *
 *   Required .env variables:
 *     PRIVATE_KEY
 *     LOB_TOKEN_ADDRESS
 *     STAKING_MANAGER_ADDRESS
 *     SYBIL_GUARD_ADDRESS
 *     TREASURY_ADDRESS          — TreasuryGovernor (Titus)
 *
 *   Usage:
 *     forge script script/DeployBondingEngine.s.sol:DeployBondingEngine \
 *       --rpc-url $BASE_RPC_URL \
 *       --broadcast --verify -vvvv
 *
 *   TOKEN FLOW:
 *     150M LOB (LP reserve) → Titus
 *     Titus → Phase 1: 40M LOB paired w/ USDC/ETH on Aerodrome (direct LP)
 *     Titus → Phase 2+: depositLOB() into BondingEngine for bond programs
 *     BondingEngine → sweepQuoteToken() → Titus (USDC/LP tokens back)
 *     BondingEngine → withdrawLOB() → Titus (surplus LOB back)
 *
 *   POST-DEPLOY (governance proposal → Titus execution):
 *     1. Grant MARKET_ADMIN_ROLE on BondingEngine to Titus
 *     2. Grant DEFAULT_ADMIN_ROLE on BondingEngine to TreasuryGovernor
 *     3. Renounce deployer's DEFAULT_ADMIN_ROLE
 *     4. Titus receives 150M LOB (LP reserve allocation)
 *     5. DAO vote: Titus seeds Aerodrome LOB/USDC + LOB/ETH pools (Phase 1)
 *     6. DAO vote: Titus calls depositLOB() to fund bond inventory (Phase 2)
 *     7. DAO vote: Titus calls createMarket() for USDC + LP bond markets
 *
 *   ONGOING (all gated behind DAO votes, executed by Titus):
 *     - createMarket() / closeMarket() for new bond programs
 *     - updateMarketPrice() when LOB price moves
 *     - depositLOB() to refill bond inventory
 *     - sweepQuoteToken() → always sends to Titus
 *     - withdrawLOB() → always sends to Titus
 */
contract DeployBondingEngine is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        address lobToken = vm.envAddress("LOB_TOKEN_ADDRESS");
        address stakingManager = vm.envAddress("STAKING_MANAGER_ADDRESS");
        address sybilGuard = vm.envAddress("SYBIL_GUARD_ADDRESS");
        address treasury = vm.envAddress("TREASURY_ADDRESS");

        vm.startBroadcast(deployerKey);

        BondingEngine bonding = new BondingEngine();
        bonding.initialize(lobToken, stakingManager, sybilGuard, treasury);

        vm.stopBroadcast();

        console.log("");
        console.log("========== BONDING ENGINE DEPLOYED ==========");
        console.log("Deployer:          ", deployer);
        console.log("BondingEngine:     ", address(bonding));
        console.log("");
        console.log("Connected contracts:");
        console.log("  LOBToken:          ", lobToken);
        console.log("  StakingManager:    ", stakingManager);
        console.log("  SybilGuard:        ", sybilGuard);
        console.log("  Treasury (Titus):  ", treasury);
        console.log("================================================");
        console.log("");
        console.log("All sweeps and withdrawals go to Treasury (Titus).");
        console.log("");
        console.log("POST-DEPLOY:");
        console.log("  1. Grant MARKET_ADMIN_ROLE to Titus");
        console.log("  2. Grant DEFAULT_ADMIN_ROLE to TreasuryGovernor");
        console.log("  3. Renounce deployer DEFAULT_ADMIN_ROLE");
        console.log("  4. Send 150M LOB (LP reserve) to Titus");
        console.log("  5. DAO vote: seed Aerodrome pools (Phase 1)");
        console.log("  6. DAO vote: depositLOB() + createMarket() (Phase 2)");
    }
}
