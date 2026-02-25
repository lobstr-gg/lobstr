// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IRolePayroll {
    // ── Enums ──────────────────────────────────────────────────────

    enum RoleType { Arbitrator, Moderator }
    enum RoleRank { Junior, Senior, Principal }      // Junior=0, Senior=1, Principal=2
    enum SlotStatus { Empty, Active, Suspended, Resigned }

    // ── Structs ────────────────────────────────────────────────────

    struct RoleConfig {
        uint16 maxSlots;          // max concurrent holders for this type+rank
        uint256 certFeeUsdc;      // USDC certification fee (6 decimals)
        uint256 minStakeLob;      // minimum LOB stake required (18 decimals)
        uint256 weeklyBaseLob;    // base weekly pay in LOB (18 decimals)
        uint256 perDisputeLob;    // per-dispute pay (arbitrators only)
        uint256 majorityBonusLob; // majority-vote bonus (arbitrators only)
    }

    struct RoleSlot {
        RoleType roleType;
        RoleRank rank;
        SlotStatus status;
        uint256 enrolledAt;
        uint256 suspendedUntil;
        uint8 strikes;
        uint256 stakedAmount;     // LOB locked on enrollment
    }

    struct EpochClaim {
        bool claimed;
        uint256 uptimeCount;
        uint256 payAmount;
    }

    // ── Events ─────────────────────────────────────────────────────

    event RoleEnrolled(address indexed holder, uint8 roleType, uint8 rank, uint256 certFee);
    event WeeklyPayClaimed(address indexed holder, uint256 epoch, uint256 uptimeCount, uint256 payAmount);
    event StrikeIssued(address indexed holder, uint8 totalStrikes, string reason);
    event RoleSuspended(address indexed holder, uint256 until);
    event RoleRevoked(address indexed holder, uint256 stakeSlashed);
    event RoleResigned(address indexed holder);
    event HeartbeatReported(address indexed holder, uint256 timestamp);
    event AbandonmentDetected(address indexed holder, uint256 silentDuration);
    event FounderAgentSet(address indexed agent, bool exempt);
    event DisputeParticipationRecorded(address indexed arb, uint256 epoch, bool majorityVote);
    event CertFeesWithdrawn(address indexed to, uint256 amount);
    event ResignationCooldownComplete(address indexed holder, uint256 stakeReturned);

    // ── Functions ──────────────────────────────────────────────────

    function enroll(uint8 roleType, uint8 rank) external;
    function claimWeeklyPay(
        uint256 epoch,
        uint256[2] calldata pA,
        uint256[2][2] calldata pB,
        uint256[2] calldata pC,
        uint256[4] calldata pubSignals
    ) external;
    function reportHeartbeat(address holder) external;
    function reportAbandonment(address holder) external;
    function resign() external;
    function completeResignation() external;
    function recordDisputeParticipation(address arb, uint256 epoch, bool majorityVote) external;
    function setFounderAgent(address agent, bool exempt) external;
    function setRoleConfig(uint8 roleType, uint8 rank, RoleConfig calldata config) external;
    function withdrawCertFees(address to) external;
    function currentEpoch() external view returns (uint256);
    function getRoleSlot(address holder) external view returns (RoleSlot memory);
    function getEpochClaim(address holder, uint256 epoch) external view returns (EpochClaim memory);
    function getRoleConfig(uint8 roleType, uint8 rank) external view returns (RoleConfig memory);
    function getFilledSlots(uint8 roleType, uint8 rank) external view returns (uint16);
}
