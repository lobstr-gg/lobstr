// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "./interfaces/IAirdropClaimV2.sol";
import "./verifiers/Groth16Verifier.sol";

/**
 * @title AirdropClaimV2
 * @notice ZK proof-based airdrop claim contract for LOBSTR.
 *         Replaces the trusted ECDSA attestor from V1 with zero-knowledge proofs.
 *         Agents generate Groth16 proofs locally; the contract verifies on-chain.
 *
 *         Public signals: [workspaceHash, claimantAddress, tierIndex]
 *         - workspaceHash: Poseidon(workspaceId, salt) commitment
 *         - claimantAddress: must match msg.sender (prevents front-running)
 *         - tierIndex: 0=New, 1=Active, 2=PowerUser (verified by circuit)
 */
contract AirdropClaimV2 is IAirdropClaimV2, AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    IERC20 public immutable lobToken;
    Groth16Verifier public immutable verifier;
    address public immutable approvalSigner;
    uint256 public immutable difficultyTarget;

    // Allocation amounts per tier
    uint256 public constant NEW_ALLOCATION = 1_000 ether;
    uint256 public constant ACTIVE_ALLOCATION = 3_000 ether;
    uint256 public constant POWER_USER_ALLOCATION = 6_000 ether;

    // Vesting parameters (same as V1)
    uint256 public constant IMMEDIATE_RELEASE_BPS = 2500;  // 25% released immediately
    uint256 public constant VESTING_DURATION = 180 days;   // 6 months linear vest

    // M-1: Hard cap on total airdrop distribution
    uint256 public immutable maxAirdropPool;

    // Claim window
    uint256 public immutable claimWindowStart;
    uint256 public immutable claimWindowEnd;

    // Reference to V1 for migration checks (optional)
    address public immutable v1Contract;

    // State
    mapping(address => ClaimInfo) private _claims;
    mapping(uint256 => bool) private _usedWorkspaceHashes;
    mapping(bytes32 => bool) private _usedApprovals;
    uint256 public totalClaimed;

    constructor(
        address _lobToken,
        address _verifier,
        uint256 _claimWindowStart,
        uint256 _claimWindowEnd,
        address _v1Contract,
        address _approvalSigner,
        uint256 _difficultyTarget,
        uint256 _maxAirdropPool
    ) {
        require(_lobToken != address(0), "AirdropClaimV2: zero token");
        require(_verifier != address(0), "AirdropClaimV2: zero verifier");
        require(_claimWindowEnd > _claimWindowStart, "AirdropClaimV2: invalid window");
        require(_approvalSigner != address(0), "AirdropClaimV2: zero signer");
        require(_difficultyTarget > 0, "AirdropClaimV2: zero difficulty");
        require(_maxAirdropPool > 0, "AirdropClaimV2: zero pool");

        lobToken = IERC20(_lobToken);
        verifier = Groth16Verifier(_verifier);
        claimWindowStart = _claimWindowStart;
        claimWindowEnd = _claimWindowEnd;
        v1Contract = _v1Contract;
        approvalSigner = _approvalSigner;
        difficultyTarget = _difficultyTarget;
        maxAirdropPool = _maxAirdropPool;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /// @notice Submit a ZK proof to claim airdrop allocation.
    ///         The proof verifies workspace legitimacy and tier qualification
    ///         without revealing private data.
    /// @param pA Proof point A (G1)
    /// @param pB Proof point B (G2)
    /// @param pC Proof point C (G1)
    /// @param pubSignals [workspaceHash, claimantAddress, tierIndex]
    /// @param approvalSig ECDSA signature from trusted IP-gate signer
    /// @param powNonce Proof-of-work nonce that satisfies DIFFICULTY_TARGET
    function submitProof(
        uint256[2] calldata pA,
        uint256[2][2] calldata pB,
        uint256[2] calldata pC,
        uint256[3] calldata pubSignals,
        bytes calldata approvalSig,
        uint256 powNonce
    ) external nonReentrant whenNotPaused {
        require(block.timestamp >= claimWindowStart, "AirdropClaimV2: not started");
        require(block.timestamp <= claimWindowEnd, "AirdropClaimV2: window closed");
        require(!_claims[msg.sender].claimed, "AirdropClaimV2: already claimed");

        // Extract public signals
        uint256 workspaceHash = pubSignals[0];
        uint256 claimantAddress = pubSignals[1];
        uint256 tierIndex = pubSignals[2];

        // Verify claimant address matches msg.sender (prevents front-running)
        require(
            claimantAddress == uint256(uint160(msg.sender)),
            "AirdropClaimV2: address mismatch"
        );

        // Verify workspace hash uniqueness (anti-Sybil)
        require(!_usedWorkspaceHashes[workspaceHash], "AirdropClaimV2: duplicate workspace");

        // Verify tier index is valid
        require(tierIndex <= 2, "AirdropClaimV2: invalid tier");

        // 1. IP gate — verify server-signed approval
        bytes32 msgHash = keccak256(abi.encodePacked(msg.sender, workspaceHash, "LOBSTR_AIRDROP_APPROVAL"));
        bytes32 ethHash = msgHash.toEthSignedMessageHash();
        require(!_usedApprovals[ethHash], "AirdropClaimV2: approval already used");
        _usedApprovals[ethHash] = true;
        require(ethHash.recover(approvalSig) == approvalSigner, "AirdropClaimV2: invalid approval");

        // 2. PoW — verify computational work
        require(
            uint256(keccak256(abi.encodePacked(workspaceHash, msg.sender, powNonce))) < difficultyTarget,
            "AirdropClaimV2: insufficient PoW"
        );

        // Verify the ZK proof
        require(
            verifier.verifyProof(pA, pB, pC, pubSignals),
            "AirdropClaimV2: invalid proof"
        );

        // Mark workspace as used
        _usedWorkspaceHashes[workspaceHash] = true;

        // Calculate allocation based on tier
        AttestationTier tier = AttestationTier(tierIndex);
        uint256 totalAllocation = _getAllocation(tier);

        // M-1: Enforce supply cap
        require(totalClaimed + totalAllocation <= maxAirdropPool, "AirdropClaimV2: pool exhausted");

        uint256 immediateRelease = (totalAllocation * IMMEDIATE_RELEASE_BPS) / 10000;
        uint256 vestedAmount = totalAllocation - immediateRelease;

        // Store claim info
        _claims[msg.sender] = ClaimInfo({
            claimed: true,
            amount: totalAllocation,
            vestedAmount: vestedAmount,
            claimedAt: block.timestamp,
            tier: tier,
            workspaceHash: workspaceHash
        });

        totalClaimed += totalAllocation;

        // Transfer immediate release
        lobToken.safeTransfer(msg.sender, immediateRelease);

        emit ProofSubmitted(msg.sender, workspaceHash, tier);
        emit AirdropClaimed(msg.sender, totalAllocation, immediateRelease, tier);
    }

    /// @notice Release vested tokens based on linear vesting schedule.
    function releaseVestedTokens() external nonReentrant {
        ClaimInfo storage info = _claims[msg.sender];
        require(info.claimed, "AirdropClaimV2: not claimed");
        require(info.vestedAmount > 0, "AirdropClaimV2: fully vested");

        uint256 elapsed = block.timestamp - info.claimedAt;
        if (elapsed > VESTING_DURATION) elapsed = VESTING_DURATION;

        uint256 totalVestable = info.amount - (info.amount * IMMEDIATE_RELEASE_BPS / 10000);
        uint256 vestedSoFar = (totalVestable * elapsed) / VESTING_DURATION;
        uint256 alreadyReleased = totalVestable - info.vestedAmount;

        require(vestedSoFar > alreadyReleased, "AirdropClaimV2: nothing to release");
        uint256 releasable = vestedSoFar - alreadyReleased;

        info.vestedAmount -= releasable;

        lobToken.safeTransfer(msg.sender, releasable);

        emit VestedTokensReleased(msg.sender, releasable);
    }

    // --- Admin ---

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /// @notice Recover unclaimed tokens after claim window ends
    function recoverTokens(address to) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(block.timestamp > claimWindowEnd, "AirdropClaimV2: window active");
        uint256 balance = lobToken.balanceOf(address(this));
        lobToken.safeTransfer(to, balance);
    }

    // --- View ---

    function getClaimInfo(address claimant) external view returns (ClaimInfo memory) {
        return _claims[claimant];
    }

    function isWorkspaceHashUsed(uint256 hash) external view returns (bool) {
        return _usedWorkspaceHashes[hash];
    }

    // --- Internal ---

    function _getAllocation(AttestationTier tier) internal pure returns (uint256) {
        if (tier == AttestationTier.PowerUser) return POWER_USER_ALLOCATION;
        if (tier == AttestationTier.Active) return ACTIVE_ALLOCATION;
        return NEW_ALLOCATION;
    }
}
