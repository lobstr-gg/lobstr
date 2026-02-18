// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "./interfaces/IAirdropClaim.sol";

contract AirdropClaim is IAirdropClaim, AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    bytes32 public constant ATTESTOR_ROLE = keccak256("ATTESTOR_ROLE");

    IERC20 public immutable lobToken;

    // Airdrop parameters
    uint256 public constant BASE_ALLOCATION = 4_000 ether; // base per claimant (from 400M pool)
    uint256 public constant ACTIVE_MULTIPLIER = 150;       // 1.5x (in basis of 100)
    uint256 public constant POWER_USER_MULTIPLIER = 300;   // 3x
    uint256 public constant IMMEDIATE_RELEASE_BPS = 2500;  // 25% released immediately
    uint256 public constant VESTING_DURATION = 180 days;   // 6 months linear vest

    // Attestation thresholds
    uint256 public constant POWER_USER_MIN_UPTIME = 14;    // days (OpenClaw is ~2-3 weeks old)
    uint256 public constant POWER_USER_MIN_CHANNELS = 3;
    uint256 public constant POWER_USER_MIN_TOOL_CALLS = 100;
    uint256 public constant ACTIVE_MIN_UPTIME = 7;
    uint256 public constant ACTIVE_MIN_CHANNELS = 2;
    uint256 public constant ACTIVE_MIN_TOOL_CALLS = 50;

    // H-6/M-1: Hard cap on total airdrop distribution
    uint256 public immutable maxAirdropPool;

    // Claim window
    uint256 public immutable claimWindowStart;
    uint256 public immutable claimWindowEnd;

    // Merkle root for eligible addresses (set by admin after batch verification)
    bytes32 public merkleRoot;

    // Attestation signer (trusted verifier for MVP — migrates to ZK in v2)
    address public attestor;

    // State
    mapping(address => ClaimInfo) private _claims;
    mapping(bytes32 => bool) private _usedWorkspaceHashes;
    uint256 public totalClaimed;

    constructor(
        address _lobToken,
        address _attestor,
        uint256 _claimWindowStart,
        uint256 _claimWindowEnd,
        uint256 _maxAirdropPool
    ) {
        require(_lobToken != address(0), "AirdropClaim: zero token");
        require(_attestor != address(0), "AirdropClaim: zero attestor");
        require(_claimWindowEnd > _claimWindowStart, "AirdropClaim: invalid window");
        require(_maxAirdropPool > 0, "AirdropClaim: zero pool");

        lobToken = IERC20(_lobToken);
        attestor = _attestor;
        claimWindowStart = _claimWindowStart;
        claimWindowEnd = _claimWindowEnd;
        maxAirdropPool = _maxAirdropPool;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ATTESTOR_ROLE, _attestor);
    }

    /// @notice Submit an attestation of OpenClaw instance legitimacy.
    ///         The attestation data is hashed locally by the skill; only hashes are on-chain.
    ///         The signature proves the trusted attestor verified the raw data off-chain.
    function submitAttestation(
        bytes32 workspaceHash,
        bytes32 heartbeatMerkleRoot,
        uint256 uptimeDays,
        uint256 channelCount,
        uint256 toolCallCount,
        bytes calldata signature
    ) external nonReentrant whenNotPaused {
        require(block.timestamp >= claimWindowStart, "AirdropClaim: not started");
        require(block.timestamp <= claimWindowEnd, "AirdropClaim: window closed");
        require(!_claims[msg.sender].claimed, "AirdropClaim: already claimed");
        require(!_usedWorkspaceHashes[workspaceHash], "AirdropClaim: duplicate workspace");

        _verifyAndProcessAttestation(
            workspaceHash, heartbeatMerkleRoot,
            uptimeDays, channelCount, toolCallCount, signature
        );
    }

    /// @notice Alternative claim path using Merkle proof (for batch-verified addresses)
    function claim(bytes32[] calldata merkleProof) external nonReentrant whenNotPaused {
        require(block.timestamp >= claimWindowStart, "AirdropClaim: not started");
        require(block.timestamp <= claimWindowEnd, "AirdropClaim: window closed");
        require(!_claims[msg.sender].claimed, "AirdropClaim: already claimed");
        require(merkleRoot != bytes32(0), "AirdropClaim: no merkle root");

        bytes32 leaf = keccak256(abi.encodePacked(msg.sender));
        require(MerkleProof.verify(merkleProof, merkleRoot, leaf), "AirdropClaim: invalid proof");

        uint256 totalAllocation = BASE_ALLOCATION; // 1x for Merkle claims

        // H-6/M-1: Enforce supply cap
        require(totalClaimed + totalAllocation <= maxAirdropPool, "AirdropClaim: pool exhausted");

        uint256 immediateRelease = (totalAllocation * IMMEDIATE_RELEASE_BPS) / 10000;
        uint256 vestedAmount = totalAllocation - immediateRelease;

        _claims[msg.sender] = ClaimInfo({
            claimed: true,
            amount: totalAllocation,
            vestedAmount: vestedAmount,
            claimedAt: block.timestamp,
            tier: AttestationTier.New,
            workspaceHash: bytes32(0)
        });

        totalClaimed += totalAllocation;

        lobToken.safeTransfer(msg.sender, immediateRelease);

        emit AirdropClaimed(msg.sender, totalAllocation, immediateRelease, AttestationTier.New);
    }

    /// @notice Release vested tokens based on linear vesting schedule.
    ///         Vesting: 75% over 6 months, linearly.
    function releaseVestedTokens() external nonReentrant {
        ClaimInfo storage info = _claims[msg.sender];
        require(info.claimed, "AirdropClaim: not claimed");
        require(info.vestedAmount > 0, "AirdropClaim: fully vested");

        uint256 elapsed = block.timestamp - info.claimedAt;
        if (elapsed > VESTING_DURATION) elapsed = VESTING_DURATION;

        uint256 totalVestable = info.amount - (info.amount * IMMEDIATE_RELEASE_BPS / 10000);
        uint256 vestedSoFar = (totalVestable * elapsed) / VESTING_DURATION;
        uint256 alreadyReleased = totalVestable - info.vestedAmount;

        require(vestedSoFar > alreadyReleased, "AirdropClaim: nothing to release");
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

    function setMerkleRoot(bytes32 _merkleRoot) external onlyRole(DEFAULT_ADMIN_ROLE) {
        merkleRoot = _merkleRoot;
        emit MerkleRootUpdated(_merkleRoot);
    }

    function setAttestor(address _attestor) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_attestor != address(0), "AirdropClaim: zero attestor");
        _revokeRole(ATTESTOR_ROLE, attestor);
        attestor = _attestor;
        _grantRole(ATTESTOR_ROLE, _attestor);
    }

    /// @notice Recover unclaimed tokens after claim window ends
    function recoverTokens(address to) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(block.timestamp > claimWindowEnd, "AirdropClaim: window active");
        uint256 balance = lobToken.balanceOf(address(this));
        lobToken.safeTransfer(to, balance);
    }

    // --- View ---

    function getClaimInfo(address claimant) external view returns (ClaimInfo memory) {
        return _claims[claimant];
    }

    function isWorkspaceHashUsed(bytes32 hash) external view returns (bool) {
        return _usedWorkspaceHashes[hash];
    }

    // --- Internal ---

    function _verifyAndProcessAttestation(
        bytes32 workspaceHash,
        bytes32 heartbeatMerkleRoot,
        uint256 uptimeDays,
        uint256 channelCount,
        uint256 toolCallCount,
        bytes calldata signature
    ) internal {
        // Verify the attestor signed this data
        bytes32 messageHash = keccak256(abi.encodePacked(
            msg.sender, workspaceHash, heartbeatMerkleRoot,
            uptimeDays, channelCount, toolCallCount
        ));
        bytes32 ethSignedHash = messageHash.toEthSignedMessageHash();
        address signer = ethSignedHash.recover(signature);
        require(hasRole(ATTESTOR_ROLE, signer), "AirdropClaim: invalid signature");

        // Determine tier and calculate allocation
        AttestationTier tier = _determineTier(uptimeDays, channelCount, toolCallCount);
        _usedWorkspaceHashes[workspaceHash] = true;

        uint256 totalAllocation = _calculateAllocation(tier);

        // H-6/M-1: Enforce supply cap
        require(totalClaimed + totalAllocation <= maxAirdropPool, "AirdropClaim: pool exhausted");

        uint256 immediateRelease = (totalAllocation * IMMEDIATE_RELEASE_BPS) / 10000;

        _claims[msg.sender] = ClaimInfo({
            claimed: true,
            amount: totalAllocation,
            vestedAmount: totalAllocation - immediateRelease,
            claimedAt: block.timestamp,
            tier: tier,
            workspaceHash: workspaceHash
        });

        totalClaimed += totalAllocation;
        lobToken.safeTransfer(msg.sender, immediateRelease);

        emit AttestationSubmitted(msg.sender, workspaceHash, tier);
        emit AirdropClaimed(msg.sender, totalAllocation, immediateRelease, tier);
    }

    function _calculateAllocation(AttestationTier tier) internal pure returns (uint256) {
        uint256 multiplier = 100;
        if (tier == AttestationTier.Active) multiplier = ACTIVE_MULTIPLIER;
        if (tier == AttestationTier.PowerUser) multiplier = POWER_USER_MULTIPLIER;
        return (BASE_ALLOCATION * multiplier) / 100;
    }

    function _determineTier(
        uint256 uptimeDays,
        uint256 channelCount,
        uint256 toolCallCount
    ) internal pure returns (AttestationTier) {
        if (
            uptimeDays >= POWER_USER_MIN_UPTIME &&
            channelCount >= POWER_USER_MIN_CHANNELS &&
            toolCallCount >= POWER_USER_MIN_TOOL_CALLS
        ) {
            return AttestationTier.PowerUser;
        }
        if (
            uptimeDays >= ACTIVE_MIN_UPTIME &&
            channelCount >= ACTIVE_MIN_CHANNELS &&
            toolCallCount >= ACTIVE_MIN_TOOL_CALLS
        ) {
            return AttestationTier.Active;
        }
        return AttestationTier.New;
    }
}
