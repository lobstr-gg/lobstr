// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/LOBToken.sol";
import "../src/AirdropClaimV2.sol";
import "../src/verifiers/Groth16Verifier.sol";

/**
 * @notice Redeploy Groth16Verifier (real ZK verifier) + AirdropClaimV2.
 *         Transfers LOB from deployer to the new AirdropClaimV2.
 */
contract RedeployVerifierScript is Script {
    function run() external {
        address lobToken = vm.envAddress("LOB_TOKEN_ADDRESS");

        vm.startBroadcast();

        // 1. Deploy real Groth16Verifier
        Groth16Verifier zkVerifier = new Groth16Verifier();
        console.log("Groth16Verifier:", address(zkVerifier));

        // 2. Deploy new AirdropClaimV2 pointing to real verifier
        address approvalSigner = vm.envAddress("APPROVAL_SIGNER_ADDRESS");
        // >> 26 ≈ ~67M iterations ≈ 5 min on mid-level Mac
        uint256 difficultyTarget = type(uint256).max >> 26;
        AirdropClaimV2 airdropV2 = new AirdropClaimV2(
            lobToken,
            address(zkVerifier),
            block.timestamp,
            block.timestamp + 90 days,
            address(0),
            approvalSigner,
            difficultyTarget,
            400_000_000 ether
        );
        console.log("AirdropClaimV2:", address(airdropV2));

        // 3. Fund with LOB from deployer (use all available minus 1M reserve)
        uint256 balance = LOBToken(lobToken).balanceOf(msg.sender);
        uint256 reserve = 1_000_000 ether; // keep 1M LOB for testing
        uint256 toTransfer = balance > reserve ? balance - reserve : 0;
        if (toTransfer > 0) {
            LOBToken(lobToken).transfer(address(airdropV2), toTransfer);
            console.log("Transferred LOB:", toTransfer / 1 ether);
        }

        vm.stopBroadcast();

        console.log("--- Redeploy Complete ---");
    }
}
