// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IStakingManager.sol";
import "./interfaces/IDisputeArbitration.sol";

/**
 * @title SybilGuard
 * @notice Anti-sybil detection with auto-ban and staked fund seizure.
 *         Detects: sybil clusters, multisig abuse, self-dealing, coordinated
 *         voting, and reputation farming. Banned addresses have their staked
 *         funds seized and sent to the TreasuryGovernor.
 *
 *         Detection is reported by authorized watchers (off-chain agents or
 *         on-chain hooks). The contract maintains a ban registry and enforces
 *         bans across the protocol via the BANNED mapping.
 */
contract SybilGuard is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /* ═══════════════════════════════════════════════════════════════
       ROLES
       ═══════════════════════════════════════════════════════════════ */

    /// @notice Watchers can report sybil behavior (off-chain bots, agents)
    bytes32 public constant WATCHER_ROLE = keccak256("WATCHER_ROLE");

    /// @notice Judges can confirm reports and execute bans (multisig signers)
    bytes32 public constant JUDGE_ROLE = keccak256("JUDGE_ROLE");

    /// @notice Can unban addresses (appeals process)
    bytes32 public constant APPEALS_ROLE = keccak256("APPEALS_ROLE");

    /* ═══════════════════════════════════════════════════════════════
       CONSTANTS
       ═══════════════════════════════════════════════════════════════ */

    uint256 public constant REPORT_EXPIRY = 3 days;
    uint256 public constant MIN_JUDGES_FOR_BAN = 2;
    uint256 public constant MIN_JUDGES_FOR_REJECT = 2; // M-5: Require multiple judges to reject
    uint256 public constant COOLDOWN_AFTER_UNBAN = 30 days;

    /* ═══════════════════════════════════════════════════════════════
       TYPES
       ═══════════════════════════════════════════════════════════════ */

    enum ViolationType {
        SybilCluster,        // Multiple accounts from same origin
        SelfDealing,         // Buyer and seller are same entity
        CoordinatedVoting,   // Arbitrators colluding on votes
        ReputationFarming,   // Wash trading to build reputation
        MultisigAbuse,       // Misuse of multisig signer role
        StakeManipulation,   // Unstaking to avoid slashing
        EvidenceFraud,       // Fabricated dispute evidence
        IdentityFraud        // Fake OpenClaw attestation
    }

    enum ReportStatus { Pending, Confirmed, Rejected, Expired }

    struct SybilReport {
        uint256 id;
        address reporter;
        address[] subjects;         // Addresses involved
        ViolationType violation;
        string evidenceURI;         // IPFS link to evidence
        ReportStatus status;
        uint256 confirmations;
        uint256 createdAt;
        string notes;
    }

    struct BanRecord {
        bool banned;
        uint256 bannedAt;
        uint256 unbannedAt;
        ViolationType reason;
        uint256 reportId;
        uint256 seizedAmount;
        address seizedToken;
    }

    /* ═══════════════════════════════════════════════════════════════
       STATE
       ═══════════════════════════════════════════════════════════════ */

    IERC20 public immutable lobToken;
    IStakingManager public immutable stakingManager;
    address public immutable treasuryGovernor;
    address public disputeArbitration;

    uint256 private _nextReportId = 1;
    mapping(uint256 => SybilReport) public reports;
    mapping(uint256 => mapping(address => bool)) public reportConfirmations;
    // M-5: Track rejections per report
    mapping(uint256 => mapping(address => bool)) public reportRejections;
    mapping(uint256 => uint256) public reportRejectionCount;

    mapping(address => BanRecord) public banRecords;
    mapping(address => bool) public isBanned;
    address[] public bannedAddresses;
    // M-3: Track index for O(1) removal on unban
    mapping(address => uint256) private _bannedAddressIndex;

    // Linked accounts: maps address -> list of known linked addresses
    mapping(address => address[]) public linkedAccounts;

    // Stats
    uint256 public totalBans;
    uint256 public totalSeized;
    uint256 public totalReports;

    /* ═══════════════════════════════════════════════════════════════
       EVENTS
       ═══════════════════════════════════════════════════════════════ */

    event ReportCreated(
        uint256 indexed reportId,
        address indexed reporter,
        ViolationType violation,
        address[] subjects,
        string evidenceURI
    );
    event ReportConfirmed(uint256 indexed reportId, address indexed judge);
    event ReportRejected(uint256 indexed reportId, address indexed judge);

    event AddressBanned(
        address indexed account,
        ViolationType reason,
        uint256 indexed reportId,
        uint256 seizedAmount
    );
    event AddressUnbanned(address indexed account, address indexed unbannedBy);

    event FundsSeized(
        address indexed account,
        address indexed token,
        uint256 amount,
        uint256 indexed reportId
    );

    event LinkedAccountsRegistered(address indexed primary, address[] linked);

    /* ═══════════════════════════════════════════════════════════════
       CONSTRUCTOR
       ═══════════════════════════════════════════════════════════════ */

    constructor(
        address _lobToken,
        address _stakingManager,
        address _treasuryGovernor
    ) {
        require(_lobToken != address(0), "SybilGuard: zero lobToken");
        require(_stakingManager != address(0), "SybilGuard: zero staking");
        require(_treasuryGovernor != address(0), "SybilGuard: zero treasury");

        lobToken = IERC20(_lobToken);
        stakingManager = IStakingManager(_stakingManager);
        treasuryGovernor = _treasuryGovernor;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /// @notice One-time setter for DisputeArbitration address (post-deploy wiring)
    function setDisputeArbitration(address _disputeArbitration) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(disputeArbitration == address(0), "SybilGuard: disputeArbitration already set");
        require(_disputeArbitration != address(0), "SybilGuard: zero disputeArbitration");
        disputeArbitration = _disputeArbitration;
    }

    /* ═══════════════════════════════════════════════════════════════
       REPORTING
       ═══════════════════════════════════════════════════════════════ */

    /**
     * @notice Submit a sybil/abuse report against one or more addresses
     * @param subjects Addresses suspected of abuse
     * @param violation Type of violation
     * @param evidenceURI IPFS URI to evidence bundle
     * @param notes Additional context
     */
    function submitReport(
        address[] calldata subjects,
        ViolationType violation,
        string calldata evidenceURI,
        string calldata notes
    ) external onlyRole(WATCHER_ROLE) returns (uint256) {
        require(subjects.length > 0, "SybilGuard: no subjects");
        require(subjects.length <= 20, "SybilGuard: too many subjects");
        require(bytes(evidenceURI).length > 0, "SybilGuard: no evidence");

        // Verify none of the subjects are already banned
        for (uint256 i = 0; i < subjects.length; i++) {
            require(subjects[i] != address(0), "SybilGuard: zero address subject");
        }

        uint256 reportId = _nextReportId++;
        totalReports++;

        reports[reportId] = SybilReport({
            id: reportId,
            reporter: msg.sender,
            subjects: subjects,
            violation: violation,
            evidenceURI: evidenceURI,
            status: ReportStatus.Pending,
            confirmations: 0,
            createdAt: block.timestamp,
            notes: notes
        });

        emit ReportCreated(reportId, msg.sender, violation, subjects, evidenceURI);

        return reportId;
    }

    /**
     * @notice Judge confirms a report. When MIN_JUDGES_FOR_BAN confirmations
     *         are reached, all subjects are automatically banned and funds seized.
     */
    function confirmReport(uint256 reportId) external onlyRole(JUDGE_ROLE) nonReentrant {
        SybilReport storage r = reports[reportId];
        require(r.id != 0, "SybilGuard: report not found");
        require(r.status == ReportStatus.Pending, "SybilGuard: not pending");
        require(
            block.timestamp <= r.createdAt + REPORT_EXPIRY,
            "SybilGuard: report expired"
        );
        require(!reportConfirmations[reportId][msg.sender], "SybilGuard: already confirmed");

        reportConfirmations[reportId][msg.sender] = true;
        r.confirmations++;

        emit ReportConfirmed(reportId, msg.sender);

        // Auto-ban when threshold met
        if (r.confirmations >= MIN_JUDGES_FOR_BAN) {
            r.status = ReportStatus.Confirmed;
            _executeBan(reportId);
        }
    }

    /**
     * @notice Judge votes to reject a report. Requires MIN_JUDGES_FOR_REJECT to finalize.
     */
    function rejectReport(uint256 reportId) external onlyRole(JUDGE_ROLE) {
        SybilReport storage r = reports[reportId];
        require(r.id != 0, "SybilGuard: report not found");
        require(r.status == ReportStatus.Pending, "SybilGuard: not pending");
        require(!reportRejections[reportId][msg.sender], "SybilGuard: already rejected");

        reportRejections[reportId][msg.sender] = true;
        reportRejectionCount[reportId]++;

        // M-5: Only finalize rejection when enough judges agree
        if (reportRejectionCount[reportId] >= MIN_JUDGES_FOR_REJECT) {
            r.status = ReportStatus.Rejected;
        }

        emit ReportRejected(reportId, msg.sender);
    }

    /* ═══════════════════════════════════════════════════════════════
       BAN EXECUTION
       ═══════════════════════════════════════════════════════════════ */

    function _executeBan(uint256 reportId) private {
        SybilReport storage r = reports[reportId];

        for (uint256 i = 0; i < r.subjects.length; i++) {
            address subject = r.subjects[i];

            // Skip if already banned
            if (isBanned[subject]) continue;

            // Seize staked funds
            uint256 seized = _seizeStake(subject, reportId);

            // Remove from arbitrator pool if disputeArbitration is set
            if (disputeArbitration != address(0)) {
                try IDisputeArbitration(disputeArbitration).removeArbitrator(subject) {} catch {}
            }

            // Record ban
            isBanned[subject] = true;
            _bannedAddressIndex[subject] = bannedAddresses.length;
            bannedAddresses.push(subject);
            totalBans++;

            banRecords[subject] = BanRecord({
                banned: true,
                bannedAt: block.timestamp,
                unbannedAt: 0,
                reason: r.violation,
                reportId: reportId,
                seizedAmount: seized,
                seizedToken: address(lobToken)
            });

            // Register linked accounts (all subjects linked to each other)
            if (r.subjects.length > 1) {
                linkedAccounts[subject] = r.subjects;
            }

            emit AddressBanned(subject, r.violation, reportId, seized);
        }

        // Emit linked accounts event if cluster detected
        if (r.subjects.length > 1) {
            emit LinkedAccountsRegistered(r.subjects[0], r.subjects);
        }
    }

    /**
     * @notice Seize staked LOB tokens from a banned address
     *         Calls StakingManager.slash() which transfers to beneficiary (treasury)
     */
    function _seizeStake(address account, uint256 reportId) private returns (uint256) {
        // Get the current stake amount
        IStakingManager.StakeInfo memory info = stakingManager.getStakeInfo(account);
        uint256 stakeAmount = info.amount;

        if (stakeAmount == 0) return 0;

        // Slash the entire stake, sending to treasury
        // Note: StakingManager.slash() requires SLASHER_ROLE which SybilGuard must have
        stakingManager.slash(account, stakeAmount, treasuryGovernor);

        totalSeized += stakeAmount;

        emit FundsSeized(account, address(lobToken), stakeAmount, reportId);

        return stakeAmount;
    }

    /* ═══════════════════════════════════════════════════════════════
       UNBAN (APPEALS)
       ═══════════════════════════════════════════════════════════════ */

    /**
     * @notice Unban an address after appeal review
     *         Seized funds are NOT returned (already in treasury)
     */
    function unban(address account) external onlyRole(APPEALS_ROLE) {
        require(isBanned[account], "SybilGuard: not banned");

        isBanned[account] = false;
        banRecords[account].banned = false;
        banRecords[account].unbannedAt = block.timestamp;

        // M-3: Remove from bannedAddresses array (swap-and-pop)
        uint256 idx = _bannedAddressIndex[account];
        uint256 lastIdx = bannedAddresses.length - 1;
        if (idx != lastIdx) {
            address lastAddr = bannedAddresses[lastIdx];
            bannedAddresses[idx] = lastAddr;
            _bannedAddressIndex[lastAddr] = idx;
        }
        bannedAddresses.pop();
        delete _bannedAddressIndex[account];

        emit AddressUnbanned(account, msg.sender);
    }

    /* ═══════════════════════════════════════════════════════════════
       BAN CHECK (Used by other contracts)
       ═══════════════════════════════════════════════════════════════ */

    /**
     * @notice Check if an address is banned (callable by any contract)
     */
    function checkBanned(address account) external view returns (bool) {
        return isBanned[account];
    }

    /**
     * @notice Check if any address in a set is banned
     */
    function checkAnyBanned(address[] calldata accounts) external view returns (bool) {
        for (uint256 i = 0; i < accounts.length; i++) {
            if (isBanned[accounts[i]]) return true;
        }
        return false;
    }

    /**
     * @notice Get full ban record for an address
     */
    function getBanRecord(address account) external view returns (BanRecord memory) {
        return banRecords[account];
    }

    /**
     * @notice Get linked accounts for an address
     */
    function getLinkedAccounts(address account) external view returns (address[] memory) {
        return linkedAccounts[account];
    }

    /* ═══════════════════════════════════════════════════════════════
       VIEW FUNCTIONS
       ═══════════════════════════════════════════════════════════════ */

    function getReport(uint256 reportId) external view returns (SybilReport memory) {
        return reports[reportId];
    }

    function getBannedCount() external view returns (uint256) {
        return bannedAddresses.length;
    }

    function getReportSubjects(uint256 reportId) external view returns (address[] memory) {
        return reports[reportId].subjects;
    }

    function isReportExpired(uint256 reportId) external view returns (bool) {
        SybilReport storage r = reports[reportId];
        return r.status == ReportStatus.Pending &&
               block.timestamp > r.createdAt + REPORT_EXPIRY;
    }
}
