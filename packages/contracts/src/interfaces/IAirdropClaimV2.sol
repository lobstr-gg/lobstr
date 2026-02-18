// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IAirdropClaimV2 {
    enum AttestationTier { New, Active, PowerUser }

    struct ClaimInfo {
        bool claimed;
        uint256 amount;
        uint256 vestedAmount;
        uint256 claimedAt;
        AttestationTier tier;
        uint256 workspaceHash; // Poseidon hash (field element, not bytes32)
    }

    event ProofSubmitted(address indexed claimant, uint256 workspaceHash, AttestationTier tier);
    event AirdropClaimed(address indexed claimant, uint256 amount, uint256 immediateRelease, AttestationTier tier);
    event VestedTokensReleased(address indexed claimant, uint256 amount);

    function submitProof(
        uint256[2] calldata pA,
        uint256[2][2] calldata pB,
        uint256[2] calldata pC,
        uint256[3] calldata pubSignals,
        bytes calldata approvalSig,
        uint256 powNonce
    ) external;

    function releaseVestedTokens() external;

    function getClaimInfo(address claimant) external view returns (ClaimInfo memory);

    function isWorkspaceHashUsed(uint256 hash) external view returns (bool);

    function difficultyTarget() external view returns (uint256);
}
