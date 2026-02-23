// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IAirdropClaimV3 {
    enum Milestone {
        JobComplete,       // 0: Complete 1 job via ReputationSystem.completions
        ServiceListed,     // 1: Create 1 service listing
        StakeActive,       // 2: Stake >= 100 LOB
        ReputationEarned,  // 3: Earn score >= 1000
        GovernanceVote     // 4: Cast 1 arbitration vote
    }

    struct ClaimInfo {
        bool claimed;
        uint256 released;              // total LOB released so far
        uint256 milestonesCompleted;   // bitmask (bits 0-4)
        uint256 claimedAt;
    }

    event AirdropClaimed(address indexed claimant, uint256 immediateRelease);
    event MilestoneCompleted(address indexed claimant, Milestone milestone, uint256 amountReleased);
    event MerkleRootUpdated(uint256 indexed newRoot, uint256 timestamp);

    function claim(
        uint256[2] calldata pA,
        uint256[2][2] calldata pB,
        uint256[2] calldata pC,
        uint256[2] calldata pubSignals,
        bytes calldata approvalSig,
        uint256 powNonce
    ) external;

    function completeMilestone(address claimant, Milestone milestone) external;

    function updateMerkleRoot(uint256 newRoot) external;
    function getClaimInfo(address claimant) external view returns (ClaimInfo memory);
    function isMilestoneComplete(address claimant, Milestone milestone) external view returns (bool);
    function getMerkleRoot() external view returns (uint256);
    function difficultyTarget() external view returns (uint256);
}
