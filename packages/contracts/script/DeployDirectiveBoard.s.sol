// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/DirectiveBoard.sol";

/**
 * @title DeployDirectiveBoard
 * @notice Deploys DirectiveBoard and grants initial roles.
 *
 *   Required .env:
 *     PRIVATE_KEY, SYBIL_GUARD_ADDRESS, TREASURY_GOVERNOR_ADDRESS,
 *     ADMIN_ADDRESS, AGENT_SENTINEL, AGENT_ARBITER, AGENT_STEWARD
 *
 *   Usage:
 *     forge script script/DeployDirectiveBoard.s.sol:DeployDirectiveBoardScript \
 *       --rpc-url $BASE_MAINNET_RPC_URL --broadcast --verify -vvvv
 */
contract DeployDirectiveBoardScript is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address sybilGuard = vm.envAddress("SYBIL_GUARD_ADDRESS");
        address treasuryGovernor = vm.envAddress("TREASURY_GOVERNOR_ADDRESS");
        address adminAddr = vm.envAddress("ADMIN_ADDRESS");

        vm.startBroadcast(pk);

        DirectiveBoard board = new DirectiveBoard(sybilGuard);

        // Grant POSTER_ROLE to governance + admin
        board.grantRole(board.POSTER_ROLE(), treasuryGovernor);
        board.grantRole(board.POSTER_ROLE(), adminAddr);

        // Grant EXECUTOR_ROLE to agents
        address sentinel = vm.envAddress("AGENT_SENTINEL");
        address arbiter = vm.envAddress("AGENT_ARBITER");
        address steward = vm.envAddress("AGENT_STEWARD");

        board.grantRole(board.EXECUTOR_ROLE(), sentinel);
        board.grantRole(board.EXECUTOR_ROLE(), arbiter);
        board.grantRole(board.EXECUTOR_ROLE(), steward);

        vm.stopBroadcast();
    }
}
