// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/LOBToken.sol";
import "../src/AirdropClaim.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

contract AirdropClaimTest is Test {
    LOBToken public token;
    AirdropClaim public airdrop;

    address public admin = makeAddr("admin");
    address public distributor = makeAddr("distributor");

    uint256 public attestorKey = 0xA11CE;
    address public attestor;

    address public agent1 = makeAddr("agent1");
    address public agent2 = makeAddr("agent2");
    address public agent3 = makeAddr("agent3");

    uint256 public windowStart;
    uint256 public windowEnd;

    function setUp() public {
        attestor = vm.addr(attestorKey);
        windowStart = block.timestamp;
        windowEnd = block.timestamp + 30 days;

        vm.startPrank(admin);
        token = new LOBToken();
        token.initialize(distributor);
        airdrop = new AirdropClaim();
        airdrop.initialize(
            address(token),
            attestor,
            windowStart,
            windowEnd,
            400_000_000 ether
        );
        vm.stopPrank();

        // Fund the airdrop contract with tokens
        vm.prank(distributor);
        token.transfer(address(airdrop), 400_000_000 ether); // 400M for agent airdrop pool
    }

    function _signAttestation(
        address claimant,
        bytes32 workspaceHash,
        bytes32 heartbeatRoot,
        uint256 uptimeDays,
        uint256 channelCount,
        uint256 toolCallCount
    ) internal view returns (bytes memory) {
        bytes32 messageHash = keccak256(abi.encodePacked(
            claimant,
            workspaceHash,
            heartbeatRoot,
            uptimeDays,
            channelCount,
            toolCallCount
        ));
        bytes32 ethSignedHash = MessageHashUtils.toEthSignedMessageHash(messageHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(attestorKey, ethSignedHash);
        return abi.encodePacked(r, s, v);
    }

    function test_SubmitAttestation_PowerUser() public {
        bytes32 workspaceHash = keccak256("unique-workspace-1");
        bytes32 heartbeatRoot = keccak256("heartbeat-merkle-root");

        bytes memory sig = _signAttestation(
            agent1,
            workspaceHash,
            heartbeatRoot,
            45,     // uptimeDays (Power User: 30+)
            5,      // channels (Power User: 3+)
            2000    // toolCalls (Power User: 1000+)
        );

        vm.prank(agent1);
        airdrop.submitAttestation(
            workspaceHash,
            heartbeatRoot,
            45,
            5,
            2000,
            sig
        );

        IAirdropClaim.ClaimInfo memory info = airdrop.getClaimInfo(agent1);
        assertTrue(info.claimed);

        // Power User = 3x base = 12000 ether
        assertEq(info.amount, 12_000 ether);
        assertEq(uint256(info.tier), uint256(IAirdropClaim.AttestationTier.PowerUser));

        // 25% immediate = 3000 ether
        assertEq(token.balanceOf(agent1), 3_000 ether);

        // 75% vested = 9000 ether
        assertEq(info.vestedAmount, 9_000 ether);
    }

    function test_SubmitAttestation_ActiveTier() public {
        bytes32 workspaceHash = keccak256("workspace-2");
        bytes32 heartbeatRoot = keccak256("heartbeats-2");

        bytes memory sig = _signAttestation(agent2, workspaceHash, heartbeatRoot, 14, 2, 500);

        vm.prank(agent2);
        airdrop.submitAttestation(workspaceHash, heartbeatRoot, 14, 2, 500, sig);

        IAirdropClaim.ClaimInfo memory info = airdrop.getClaimInfo(agent2);
        // Active = 1.5x base = 6000 ether
        assertEq(info.amount, 6_000 ether);
        assertEq(uint256(info.tier), uint256(IAirdropClaim.AttestationTier.Active));
        assertEq(token.balanceOf(agent2), 1_500 ether); // 25%
    }

    function test_SubmitAttestation_NewTier() public {
        bytes32 workspaceHash = keccak256("workspace-3");
        bytes32 heartbeatRoot = keccak256("heartbeats-3");

        bytes memory sig = _signAttestation(agent3, workspaceHash, heartbeatRoot, 3, 1, 20);

        vm.prank(agent3);
        airdrop.submitAttestation(workspaceHash, heartbeatRoot, 3, 1, 20, sig);

        IAirdropClaim.ClaimInfo memory info = airdrop.getClaimInfo(agent3);
        // New = 1x base = 4000 ether
        assertEq(info.amount, 4_000 ether);
        assertEq(uint256(info.tier), uint256(IAirdropClaim.AttestationTier.New));
        assertEq(token.balanceOf(agent3), 1_000 ether); // 25%
    }

    function test_DuplicateWorkspaceHash_Reverts() public {
        bytes32 workspaceHash = keccak256("same-workspace");
        bytes32 heartbeatRoot = keccak256("heartbeats");

        bytes memory sig1 = _signAttestation(agent1, workspaceHash, heartbeatRoot, 10, 2, 200);

        vm.prank(agent1);
        airdrop.submitAttestation(workspaceHash, heartbeatRoot, 10, 2, 200, sig1);

        // Agent2 tries same workspace hash (sybil attempt)
        bytes memory sig2 = _signAttestation(agent2, workspaceHash, heartbeatRoot, 10, 2, 200);

        vm.prank(agent2);
        vm.expectRevert("AirdropClaim: duplicate workspace");
        airdrop.submitAttestation(workspaceHash, heartbeatRoot, 10, 2, 200, sig2);
    }

    function test_DoubleClaim_Reverts() public {
        bytes32 ws1 = keccak256("ws-1");
        bytes32 hr = keccak256("hr");
        bytes memory sig = _signAttestation(agent1, ws1, hr, 10, 2, 200);

        vm.prank(agent1);
        airdrop.submitAttestation(ws1, hr, 10, 2, 200, sig);

        bytes32 ws2 = keccak256("ws-different");
        bytes memory sig2 = _signAttestation(agent1, ws2, hr, 10, 2, 200);

        vm.prank(agent1);
        vm.expectRevert("AirdropClaim: already claimed");
        airdrop.submitAttestation(ws2, hr, 10, 2, 200, sig2);
    }

    function test_InvalidSignature_Reverts() public {
        bytes32 workspaceHash = keccak256("workspace");
        bytes32 heartbeatRoot = keccak256("heartbeats");

        // Sign with wrong key
        uint256 wrongKey = 0xBAD;
        bytes32 messageHash = keccak256(abi.encodePacked(
            agent1, workspaceHash, heartbeatRoot, uint256(10), uint256(2), uint256(200)
        ));
        bytes32 ethSignedHash = MessageHashUtils.toEthSignedMessageHash(messageHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(wrongKey, ethSignedHash);
        bytes memory badSig = abi.encodePacked(r, s, v);

        vm.prank(agent1);
        vm.expectRevert("AirdropClaim: invalid signature");
        airdrop.submitAttestation(workspaceHash, heartbeatRoot, 10, 2, 200, badSig);
    }

    function test_ClaimWindowNotStarted_Reverts() public {
        // Deploy a new airdrop with future start
        vm.prank(admin);
        AirdropClaim futureAirdrop = new AirdropClaim();
        futureAirdrop.initialize(
            address(token),
            attestor,
            block.timestamp + 10 days,
            block.timestamp + 40 days,
            400_000_000 ether
        );

        bytes32 ws = keccak256("ws");
        bytes32 hr = keccak256("hr");

        // Sign for futureAirdrop context
        bytes32 messageHash = keccak256(abi.encodePacked(
            agent1, ws, hr, uint256(10), uint256(2), uint256(200)
        ));
        bytes32 ethSignedHash = MessageHashUtils.toEthSignedMessageHash(messageHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(attestorKey, ethSignedHash);
        bytes memory sig = abi.encodePacked(r, s, v);

        vm.prank(agent1);
        vm.expectRevert("AirdropClaim: not started");
        futureAirdrop.submitAttestation(ws, hr, 10, 2, 200, sig);
    }

    function test_ReleaseVestedTokens() public {
        bytes32 ws = keccak256("ws-vest");
        bytes32 hr = keccak256("hr");
        bytes memory sig = _signAttestation(agent1, ws, hr, 45, 5, 2000);

        vm.prank(agent1);
        airdrop.submitAttestation(ws, hr, 45, 5, 2000, sig);

        // 3000 ether immediately, 9000 vesting over 180 days
        assertEq(token.balanceOf(agent1), 3_000 ether);

        // Warp 90 days (50% of vesting)
        vm.warp(block.timestamp + 90 days);

        vm.prank(agent1);
        airdrop.releaseVestedTokens();

        // Should release 50% of 9000 = 4500
        assertEq(token.balanceOf(agent1), 3_000 ether + 4_500 ether);
    }

    function test_ReleaseVestedTokens_FullVest() public {
        bytes32 ws = keccak256("ws-full");
        bytes32 hr = keccak256("hr");
        bytes memory sig = _signAttestation(agent1, ws, hr, 45, 5, 2000);

        vm.prank(agent1);
        airdrop.submitAttestation(ws, hr, 45, 5, 2000, sig);

        // Warp past full vesting
        vm.warp(block.timestamp + 200 days);

        vm.prank(agent1);
        airdrop.releaseVestedTokens();

        // All 12000 should be released
        assertEq(token.balanceOf(agent1), 12_000 ether);
    }

    function test_MerkleClaim() public {
        // Create a simple Merkle tree with agent1
        bytes32 leaf = keccak256(abi.encodePacked(agent1));
        bytes32[] memory proof = new bytes32[](0);

        // For a single leaf, the root IS the leaf
        vm.prank(admin);
        airdrop.setMerkleRoot(leaf);

        vm.prank(agent1);
        airdrop.claim(proof);

        IAirdropClaim.ClaimInfo memory info = airdrop.getClaimInfo(agent1);
        assertTrue(info.claimed);
        assertEq(info.amount, 4_000 ether); // base allocation
        assertEq(token.balanceOf(agent1), 1_000 ether); // 25% immediate
    }

    function test_RecoverTokens_AfterWindow() public {
        vm.warp(windowEnd + 1);

        uint256 balance = token.balanceOf(address(airdrop));

        vm.prank(admin);
        airdrop.recoverTokens(admin);

        assertEq(token.balanceOf(admin), balance);
    }

    function test_RecoverTokens_DuringWindow_Reverts() public {
        vm.prank(admin);
        vm.expectRevert("AirdropClaim: window active");
        airdrop.recoverTokens(admin);
    }

    // --- A6: Vesting math underflow fix ---

    function test_ReleaseVestedTokens_EarlyPeriod_NoUnderflow() public {
        bytes32 ws = keccak256("ws-early");
        bytes32 hr = keccak256("hr");
        bytes memory sig = _signAttestation(agent1, ws, hr, 45, 5, 2000);

        vm.prank(agent1);
        airdrop.submitAttestation(ws, hr, 45, 5, 2000, sig);

        // Don't warp at all — try to release immediately (elapsed=0, vestedSoFar=0)
        // This should revert cleanly instead of underflowing
        vm.prank(agent1);
        vm.expectRevert("AirdropClaim: nothing to release");
        airdrop.releaseVestedTokens();

        // Warp 1 second — tiny vesting amount, should succeed without underflow
        vm.warp(block.timestamp + 1);
        vm.prank(agent1);
        airdrop.releaseVestedTokens();
        // No underflow = success
    }

    function test_IsWorkspaceHashUsed() public {
        bytes32 ws = keccak256("ws-check");
        assertFalse(airdrop.isWorkspaceHashUsed(ws));

        bytes32 hr = keccak256("hr");
        bytes memory sig = _signAttestation(agent1, ws, hr, 10, 2, 200);

        vm.prank(agent1);
        airdrop.submitAttestation(ws, hr, 10, 2, 200, sig);

        assertTrue(airdrop.isWorkspaceHashUsed(ws));
    }
}
