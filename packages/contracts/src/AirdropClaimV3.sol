// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "./interfaces/IAirdropClaimV3.sol";
import "./interfaces/IReputationSystem.sol";
import "./interfaces/IServiceRegistry.sol";
import "./interfaces/IStakingManager.sol";
import "./interfaces/IDisputeArbitration.sol";
import "./verifiers/Groth16VerifierV4.sol";

/**
 * @title AirdropClaimV3
 * @notice ZK Merkle membership airdrop with milestone-based unlocks.
 *
 *         Everyone gets 6,000 LOB flat:
 *           - 1,000 LOB immediate on first claim
 *           - 5 milestones, each unlocking 1,000 LOB (permissionless verification)
 *
 *         Anti-Sybil (3 layers):
 *           1. ZK proof — Groth16 proof of Merkle membership (Poseidon tree, depth 20)
 *           2. IP gate — one approval per IP, permanent ban on second attempt
 *           3. PoW — keccak256(address, merkleRoot, powNonce) < difficultyTarget
 *
 *         Claim flow:
 *           1. Agent calls backend /register → gets salt, leaf stored
 *           2. Backend periodically builds Merkle tree, pushes root on-chain
 *           3. Agent calls backend /merkle-proof → gets pathElements + pathIndices
 *           4. Agent generates Groth16 proof locally (or via backend)
 *           5. Agent calls backend /approve → gets approvalSig (IP-gated)
 *           6. Agent computes PoW nonce locally
 *           7. Agent calls claim() on-chain with all params
 *           8. Agent completes milestones over time to unlock remaining 5,000 LOB
 */
contract AirdropClaimV3 is IAirdropClaimV3, AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    bytes32 public constant ROOT_UPDATER_ROLE = keccak256("ROOT_UPDATER_ROLE");

    IERC20 public immutable lobToken;
    Groth16VerifierV4 public immutable verifier;
    address public immutable approvalSigner;
    uint256 public immutable difficultyTarget;
    uint256 public immutable claimWindowEnd;
    uint256 public immutable maxAirdropPool;

    // External contracts for milestone verification
    IReputationSystem public immutable reputationSystem;
    IServiceRegistry public immutable serviceRegistry;
    IStakingManager public immutable stakingManager;
    IDisputeArbitration public immutable disputeArbitration;

    // Allocation constants
    uint256 public constant TOTAL_ALLOCATION = 6_000 ether;
    uint256 public constant IMMEDIATE_RELEASE = 1_000 ether;
    uint256 public constant MILESTONE_REWARD = 1_000 ether;
    uint256 public constant NUM_MILESTONES = 5;

    // Milestone thresholds
    uint256 public constant JOB_COMPLETE_THRESHOLD = 1;
    uint256 public constant SERVICE_LISTED_THRESHOLD = 1;
    uint256 public constant STAKE_THRESHOLD = 100 ether;
    uint256 public constant REPUTATION_THRESHOLD = 1000;
    uint256 public constant GOVERNANCE_VOTE_THRESHOLD = 1;

    // State
    uint256 public currentMerkleRoot;
    mapping(address => ClaimInfo) private _claims;
    mapping(bytes32 => bool) private _usedApprovals;
    uint256 public totalClaimed;

    constructor(
        address _lobToken,
        address _verifier,
        address _approvalSigner,
        uint256 _claimWindowEnd,
        uint256 _difficultyTarget,
        uint256 _maxAirdropPool,
        address _reputationSystem,
        address _serviceRegistry,
        address _stakingManager,
        address _disputeArbitration
    ) {
        require(_lobToken != address(0), "V3: zero token");
        require(_verifier != address(0), "V3: zero verifier");
        require(_approvalSigner != address(0), "V3: zero approval signer");
        require(_claimWindowEnd > block.timestamp, "V3: invalid window");
        require(_difficultyTarget > 0, "V3: zero difficulty");
        require(_maxAirdropPool > 0, "V3: zero pool");
        require(_reputationSystem != address(0), "V3: zero reputation");
        require(_serviceRegistry != address(0), "V3: zero registry");
        require(_stakingManager != address(0), "V3: zero staking");
        require(_disputeArbitration != address(0), "V3: zero arbitration");

        lobToken = IERC20(_lobToken);
        verifier = Groth16VerifierV4(_verifier);
        approvalSigner = _approvalSigner;
        claimWindowEnd = _claimWindowEnd;
        difficultyTarget = _difficultyTarget;
        maxAirdropPool = _maxAirdropPool;

        reputationSystem = IReputationSystem(_reputationSystem);
        serviceRegistry = IServiceRegistry(_serviceRegistry);
        stakingManager = IStakingManager(_stakingManager);
        disputeArbitration = IDisputeArbitration(_disputeArbitration);

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /// @notice Claim airdrop using ZK proof of Merkle membership.
    ///         Releases 1,000 LOB immediately. Remaining 5,000 unlocked via milestones.
    function claim(
        uint256[2] calldata pA,
        uint256[2][2] calldata pB,
        uint256[2] calldata pC,
        uint256[2] calldata pubSignals,
        bytes calldata approvalSig,
        uint256 powNonce
    ) external nonReentrant whenNotPaused {
        require(block.timestamp <= claimWindowEnd, "V3: window closed");
        require(!_claims[msg.sender].claimed, "V3: already claimed");

        uint256 merkleRoot = pubSignals[0];
        uint256 claimantAddress = pubSignals[1];

        // Verify claimant address matches msg.sender
        require(claimantAddress == uint256(uint160(msg.sender)), "V3: address mismatch");

        // Verify merkle root matches current on-chain root
        require(merkleRoot == currentMerkleRoot, "V3: invalid root");
        require(currentMerkleRoot != 0, "V3: root not set");

        // Verify ZK proof
        require(
            verifier.verifyProof(pA, pB, pC, pubSignals),
            "V3: invalid proof"
        );

        // IP gate — verify approval signature
        _verifyApproval(msg.sender, merkleRoot, approvalSig);

        // PoW verification
        _verifyPoW(msg.sender, merkleRoot, powNonce);

        // Pool cap check
        require(totalClaimed + TOTAL_ALLOCATION <= maxAirdropPool, "V3: pool exhausted");

        // Store claim
        _claims[msg.sender] = ClaimInfo({
            claimed: true,
            released: IMMEDIATE_RELEASE,
            milestonesCompleted: 0,
            claimedAt: block.timestamp
        });

        totalClaimed += TOTAL_ALLOCATION;

        // Transfer immediate release
        lobToken.safeTransfer(msg.sender, IMMEDIATE_RELEASE);

        emit AirdropClaimed(msg.sender, IMMEDIATE_RELEASE);
    }

    /// @notice Complete a milestone for any claimant. Permissionless — anyone can call.
    ///         Verifies the milestone criteria on-chain and transfers 1,000 LOB to the claimant.
    function completeMilestone(
        address claimant,
        Milestone milestone
    ) external nonReentrant whenNotPaused {
        ClaimInfo storage info = _claims[claimant];
        require(info.claimed, "V3: not claimed");

        uint256 milestoneBit = 1 << uint256(milestone);
        require(info.milestonesCompleted & milestoneBit == 0, "V3: milestone already completed");

        // Verify milestone criteria on-chain
        require(_checkMilestone(claimant, milestone), "V3: milestone not met");

        // Mark milestone as complete
        info.milestonesCompleted |= milestoneBit;
        info.released += MILESTONE_REWARD;

        // Transfer milestone reward
        lobToken.safeTransfer(claimant, MILESTONE_REWARD);

        emit MilestoneCompleted(claimant, milestone, MILESTONE_REWARD);
    }

    // --- Admin ---

    /// @notice Update the Merkle root (called by backend as registrations grow)
    function updateMerkleRoot(uint256 newRoot) external onlyRole(ROOT_UPDATER_ROLE) {
        require(newRoot != 0, "V3: zero root");
        currentMerkleRoot = newRoot;
        emit MerkleRootUpdated(newRoot, block.timestamp);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /// @notice Recover unclaimed tokens after claim window ends
    function recoverTokens(address to) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(block.timestamp > claimWindowEnd, "V3: window active");
        uint256 balance = lobToken.balanceOf(address(this));
        lobToken.safeTransfer(to, balance);
    }

    // --- View ---

    function getClaimInfo(address claimant) external view returns (ClaimInfo memory) {
        return _claims[claimant];
    }

    function isMilestoneComplete(
        address claimant,
        Milestone milestone
    ) external view returns (bool) {
        uint256 milestoneBit = 1 << uint256(milestone);
        return _claims[claimant].milestonesCompleted & milestoneBit != 0;
    }

    function getMerkleRoot() external view returns (uint256) {
        return currentMerkleRoot;
    }

    function getPendingMilestones(address claimant) external view returns (bool[5] memory pending) {
        uint256 completed = _claims[claimant].milestonesCompleted;
        for (uint256 i = 0; i < 5; i++) {
            pending[i] = (completed & (1 << i)) == 0;
        }
    }

    // --- Internal ---

    function _verifyApproval(
        address sender,
        uint256 merkleRoot,
        bytes calldata sig
    ) internal {
        bytes32 msgHash = keccak256(
            abi.encodePacked(sender, merkleRoot, block.chainid, address(this), "LOBSTR_AIRDROP_V3_ZK")
        );
        bytes32 ethHash = msgHash.toEthSignedMessageHash();
        require(!_usedApprovals[ethHash], "V3: approval already used");
        _usedApprovals[ethHash] = true;
        require(ethHash.recover(sig) == approvalSigner, "V3: invalid approval");
    }

    function _verifyPoW(
        address sender,
        uint256 merkleRoot,
        uint256 powNonce
    ) internal view {
        require(
            uint256(keccak256(abi.encodePacked(sender, merkleRoot, powNonce))) < difficultyTarget,
            "V3: insufficient PoW"
        );
    }

    function _checkMilestone(
        address claimant,
        Milestone milestone
    ) internal view returns (bool) {
        if (milestone == Milestone.JobComplete) {
            IReputationSystem.ReputationData memory repData = reputationSystem.getReputationData(claimant);
            return repData.completions >= JOB_COMPLETE_THRESHOLD;
        }
        if (milestone == Milestone.ServiceListed) {
            return serviceRegistry.getProviderListingCount(claimant) >= SERVICE_LISTED_THRESHOLD;
        }
        if (milestone == Milestone.StakeActive) {
            return stakingManager.getStake(claimant) >= STAKE_THRESHOLD;
        }
        if (milestone == Milestone.ReputationEarned) {
            (uint256 score, ) = reputationSystem.getScore(claimant);
            return score >= REPUTATION_THRESHOLD;
        }
        if (milestone == Milestone.GovernanceVote) {
            IDisputeArbitration.ArbitratorInfo memory arbInfo = disputeArbitration.getArbitratorInfo(claimant);
            return arbInfo.disputesHandled >= GOVERNANCE_VOTE_THRESHOLD;
        }
        return false;
    }
}
