// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IAirdropClaim {
    enum AttestationTier { New, Active, PowerUser }

    struct Attestation {
        address claimant;
        bytes32 workspaceHash;       // hash of OpenClaw workspace fingerprint
        bytes32 heartbeatMerkleRoot; // Merkle root of heartbeat timestamps
        uint256 uptimeDays;
        uint256 channelCount;
        uint256 toolCallCount;
        AttestationTier tier;
        uint256 timestamp;
    }

    struct ClaimInfo {
        bool claimed;
        uint256 amount;
        uint256 vestedAmount;
        uint256 claimedAt;
        AttestationTier tier;
        bytes32 workspaceHash;
    }

    event AttestationSubmitted(address indexed claimant, bytes32 workspaceHash, AttestationTier tier);
    event AirdropClaimed(address indexed claimant, uint256 amount, uint256 immediateRelease, AttestationTier tier);
    event VestedTokensReleased(address indexed claimant, uint256 amount);
    event MerkleRootUpdated(bytes32 newRoot);

    function submitAttestation(
        bytes32 workspaceHash,
        bytes32 heartbeatMerkleRoot,
        uint256 uptimeDays,
        uint256 channelCount,
        uint256 toolCallCount,
        bytes calldata signature
    ) external;

    function claim(bytes32[] calldata merkleProof) external;

    function releaseVestedTokens() external;

    function getClaimInfo(address claimant) external view returns (ClaimInfo memory);
}
