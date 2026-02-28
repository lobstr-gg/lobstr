// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/AirdropClaimV3.sol";
import "../src/verifiers/Groth16VerifierV5.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Utils.sol";

/**
 * @notice Deploy new Groth16VerifierV5 + upgraded AirdropClaimV3 implementation,
 *         then call upgradeToAndCall to set the new verifier in one tx.
 *
 *         Must be run by the proxy owner (0x8a1C...sentinel/Titus).
 *
 *         Usage:
 *           PRIVATE_KEY=<sentinel_key> \
 *           AIRDROP_PROXY=0xc7917624fa0cf6f4973b887de5e670d7661ef297 \
 *           forge script script/UpgradeAirdropVerifier.s.sol \
 *             --rpc-url $BASE_MAINNET_RPC_URL --broadcast --verify
 */
contract UpgradeAirdropVerifierScript is Script {
    function run() external {
        address airdropProxy = vm.envAddress("AIRDROP_PROXY");
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerKey);

        // 1. Deploy new verifier (matches current zkey)
        Groth16VerifierV5 newVerifier = new Groth16VerifierV5();
        console.log("Groth16VerifierV5:", address(newVerifier));

        // 2. Deploy new AirdropClaimV3 implementation (adds setVerifier)
        AirdropClaimV3 newImpl = new AirdropClaimV3();
        console.log("AirdropClaimV3 impl:", address(newImpl));

        // 3. Upgrade proxy and set new verifier in one call
        bytes memory setVerifierCall = abi.encodeCall(
            AirdropClaimV3.setVerifier,
            (address(newVerifier))
        );
        AirdropClaimV3(airdropProxy).upgradeToAndCall(
            address(newImpl),
            setVerifierCall
        );
        console.log("Upgrade + setVerifier complete");

        // 4. Verify
        address currentVerifier = address(AirdropClaimV3(airdropProxy).verifier());
        console.log("Verifier now:", currentVerifier);
        require(currentVerifier == address(newVerifier), "Verifier mismatch after upgrade");

        vm.stopBroadcast();

        console.log("--- Upgrade Complete ---");
    }
}
