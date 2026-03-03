// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "../src/LOBToken.sol";
import "../src/AirdropClaimV2.sol";

/// @dev Mock verifier for local E2E testing
contract MockVerifier {
    function verifyProof(
        uint256[2] calldata,
        uint256[2][2] calldata,
        uint256[2] calldata,
        uint256[3] calldata
    ) external pure returns (bool) {
        return true;
    }
}

/**
 * @notice Full E2E test of the anti-sybil airdrop flow on local anvil.
 *         Tests: deploy -> sign approval -> find PoW nonce -> submit proof -> verify claim.
 *
 *         Run: forge script script/TestAntiSybilE2E.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
 */
contract TestAntiSybilE2E is Script {
    using MessageHashUtils for bytes32;

    // ── Storage to avoid stack-too-deep ────────────────────────────
    LOBToken internal token;
    AirdropClaimV2 internal airdrop;

    // Anvil default #0 = deployer
    uint256 constant DEPLOYER_KEY = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
    // Approval signer (fresh keypair for test)
    uint256 constant SIGNER_KEY = 0xABCD123456789ABCDEF0;
    // Claimant = anvil account #1
    uint256 constant CLAIMANT_KEY = 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d;

    uint256 constant WORKSPACE_HASH = 42424242;

    // Dummy proof points (MockVerifier always returns true)
    uint256[2] internal pA = [uint256(1), uint256(2)];
    uint256[2][2] internal pB = [[uint256(3), uint256(4)], [uint256(5), uint256(6)]];
    uint256[2] internal pC = [uint256(7), uint256(8)];

    function run() external {
        address deployer = vm.addr(DEPLOYER_KEY);
        address signerAddr = vm.addr(SIGNER_KEY);
        address claimant = vm.addr(CLAIMANT_KEY);

        console.log("=== Anti-Sybil Airdrop E2E Test ===");
        console.log("Deployer:       ", deployer);
        console.log("Approval Signer:", signerAddr);
        console.log("Claimant:       ", claimant);
        console.log("");

        _deploy(deployer, signerAddr);
        bytes memory approvalSig = _signApproval(claimant, signerAddr);
        uint256 powNonce = _computePoW(claimant);
        _submitAndVerify(claimant, approvalSig, powNonce);
        _testReplayProtection(signerAddr);

        console.log("");
        console.log("=== ALL E2E CHECKS PASSED ===");
    }

    function _deploy(address deployer, address signerAddr) internal {
        vm.startBroadcast(DEPLOYER_KEY);

        token = new LOBToken();
        token.initialize(deployer);
        console.log("[1] LOBToken deployed:", address(token));

        MockVerifier mockVerifier = new MockVerifier();
        console.log("[1] MockVerifier deployed:", address(mockVerifier));

        uint256 testDifficulty = type(uint256).max >> 20;
        airdrop = new AirdropClaimV2();
        airdrop.initialize(
            address(token),
            address(mockVerifier),
            block.timestamp,
            block.timestamp + 90 days,
            address(0),
            signerAddr,
            testDifficulty,
            400_000_000 ether
        );
        console.log("[1] AirdropClaimV2 deployed:", address(airdrop));
        console.log("    approvalSigner:", airdrop.approvalSigner());

        token.transfer(address(airdrop), 100_000 ether);
        console.log("[1] Funded airdrop with 100,000 LOB");

        vm.stopBroadcast();
    }

    function _signApproval(address claimant, address signerAddr) internal returns (bytes memory approvalSig) {
        console.log("");
        console.log("[2] Signing approval for claimant...");

        bytes32 msgHash = keccak256(
            abi.encodePacked(claimant, WORKSPACE_HASH, "LOBSTR_AIRDROP_APPROVAL")
        );
        bytes32 ethHash = msgHash.toEthSignedMessageHash();
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(SIGNER_KEY, ethHash);
        approvalSig = abi.encodePacked(r, s, v);
        console.log("    Approval signature created (65 bytes)");

        address recovered = ECDSA.recover(ethHash, approvalSig);
        require(recovered == signerAddr, "Signature recovery mismatch!");
        console.log("    Recovered signer:", recovered);
        console.log("    Signature valid!");
    }

    function _computePoW(address claimant) internal view returns (uint256 powNonce) {
        console.log("");
        console.log("[3] Computing PoW nonce (this may take a moment)...");
        uint256 target = airdrop.difficultyTarget();
        uint256 wsHash = WORKSPACE_HASH;
        for (uint256 n = 0; ; n++) {
            if (uint256(keccak256(abi.encodePacked(wsHash, claimant, n))) < target) {
                powNonce = n;
                console.log("    Found nonce:", n);
                console.log("    Iterations:", n + 1);
                return powNonce;
            }
        }
    }

    function _submitAndVerify(address claimant, bytes memory approvalSig, uint256 powNonce) internal {
        console.log("");
        console.log("[4] Submitting proof on-chain as claimant...");

        uint256[3] memory pubSignals = [
            WORKSPACE_HASH,
            uint256(uint160(claimant)),
            uint256(2) // PowerUser tier
        ];

        uint256 balanceBefore = token.balanceOf(claimant);

        vm.broadcast(CLAIMANT_KEY);
        airdrop.submitProof(pA, pB, pC, pubSignals, approvalSig, powNonce);
        console.log("    Proof submitted successfully!");

        console.log("");
        console.log("[5] Verifying claim on-chain...");

        IAirdropClaimV2.ClaimInfo memory info = airdrop.getClaimInfo(claimant);
        require(info.claimed, "FAIL: not marked as claimed");
        require(info.amount == 6_000 ether, "FAIL: wrong amount");
        require(info.vestedAmount == 4_500 ether, "FAIL: wrong vested amount");
        require(uint256(info.tier) == 2, "FAIL: wrong tier");
        require(info.workspaceHash == WORKSPACE_HASH, "FAIL: wrong workspace hash");

        uint256 received = token.balanceOf(claimant) - balanceBefore;
        require(received == 1_500 ether, "FAIL: wrong immediate release");

        console.log("    Claimed:           true");
        console.log("    Tier:              PowerUser");
        console.log("    Total allocation:  6,000 LOB");
        console.log("    Immediate release: 1,500 LOB");
        console.log("    Vested remaining:  4,500 LOB");
    }

    function _testReplayProtection(address signerAddr) internal {
        console.log("");
        console.log("[6] Testing anti-sybil protections...");

        // Workspace hash already marked
        require(airdrop.isWorkspaceHashUsed(WORKSPACE_HASH), "FAIL: workspace not marked");
        console.log("    Workspace hash marked as used: PASS");

        // Invalid signer rejected
        _testInvalidSigner();

        // Insufficient PoW rejected
        _testBadPoW(signerAddr);
    }

    function _testInvalidSigner() internal {
        address attacker = address(0xBAD);
        uint256 attackerWsHash = 99999999;
        uint256 badSignerKey = 0xDEADBEEF;

        bytes32 badMsgHash = keccak256(
            abi.encodePacked(attacker, attackerWsHash, "LOBSTR_AIRDROP_APPROVAL")
        );
        bytes32 badEthHash = badMsgHash.toEthSignedMessageHash();
        (uint8 bv, bytes32 br, bytes32 bs) = vm.sign(badSignerKey, badEthHash);
        bytes memory badSig = abi.encodePacked(br, bs, bv);

        uint256[3] memory badPubSignals = [
            attackerWsHash,
            uint256(uint160(attacker)),
            uint256(0)
        ];

        // Find valid PoW for attacker
        uint256 target = airdrop.difficultyTarget();
        uint256 badNonce;
        for (uint256 n = 0; ; n++) {
            if (uint256(keccak256(abi.encodePacked(attackerWsHash, attacker, n))) < target) {
                badNonce = n;
                break;
            }
        }

        vm.prank(attacker);
        try airdrop.submitProof(pA, pB, pC, badPubSignals, badSig, badNonce) {
            revert("FAIL: should have reverted with invalid approval");
        } catch Error(string memory reason) {
            require(
                keccak256(bytes(reason)) == keccak256(bytes("AirdropClaimV2: invalid approval")),
                "FAIL: wrong revert reason"
            );
            console.log("    Invalid signer rejected:      PASS");
        }
    }

    function _testBadPoW(address signerAddr) internal {
        address alice = address(0xA11CE);
        uint256 aliceWsHash = 77777777;

        bytes32 aliceMsgHash = keccak256(
            abi.encodePacked(alice, aliceWsHash, "LOBSTR_AIRDROP_APPROVAL")
        );
        bytes32 aliceEthHash = aliceMsgHash.toEthSignedMessageHash();
        (uint8 av, bytes32 ar, bytes32 as2) = vm.sign(SIGNER_KEY, aliceEthHash);
        bytes memory aliceSig = abi.encodePacked(ar, as2, av);

        uint256[3] memory alicePubSignals = [
            aliceWsHash,
            uint256(uint160(alice)),
            uint256(0)
        ];

        vm.prank(alice);
        try airdrop.submitProof(pA, pB, pC, alicePubSignals, aliceSig, type(uint256).max) {
            revert("FAIL: should have reverted with insufficient PoW");
        } catch Error(string memory reason) {
            require(
                keccak256(bytes(reason)) == keccak256(bytes("AirdropClaimV2: insufficient PoW")),
                "FAIL: wrong revert reason"
            );
            console.log("    Insufficient PoW rejected:    PASS");
        }
    }
}
