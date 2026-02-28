// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title TreasuryGovernor
 * @notice Multisig treasury with automated payment streams for moderators,
 *         arbitrators, and grants. Receives protocol fees from EscrowEngine
 *         and slashed funds from SybilGuard. Distributes via M-of-N approval.
 */
contract TreasuryGovernor is Initializable, UUPSUpgradeable, AccessControlUpgradeable, ReentrancyGuardUpgradeable {
    using SafeERC20 for IERC20;

    /* ═══════════════════════════════════════════════════════════════
       ROLES
       ═══════════════════════════════════════════════════════════════ */

    bytes32 public constant SIGNER_ROLE = keccak256("SIGNER_ROLE");
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");
    bytes32 public constant SYBIL_GUARD_ROLE = keccak256("SYBIL_GUARD_ROLE");

    /* ═══════════════════════════════════════════════════════════════
       CONSTANTS
       ═══════════════════════════════════════════════════════════════ */

    uint256 public constant MAX_SIGNERS = 9;
    uint256 public constant MIN_SIGNERS = 3;
    uint256 public constant PROPOSAL_EXPIRY = 7 days;
    uint256 public constant PROPOSAL_TIMELOCK = 24 hours;
    uint256 public constant STREAM_MAX_DURATION = 365 days;

    /* ═══════════════════════════════════════════════════════════════
       TYPES
       ═══════════════════════════════════════════════════════════════ */

    enum ProposalStatus { Pending, Approved, Executed, Cancelled, Expired }

    struct Proposal {
        uint256 id;
        address proposer;
        address token;
        address recipient;
        uint256 amount;
        string description;
        ProposalStatus status;
        uint256 approvalCount;
        uint256 createdAt;
        uint256 timelockEnd;
    }

    struct PaymentStream {
        uint256 id;
        address recipient;
        address token;
        uint256 totalAmount;
        uint256 claimedAmount;
        uint256 startTime;
        uint256 endTime;
        string role; // "moderator", "arbitrator", "grant"
        bool active;
    }

    /* ═══════════════════════════════════════════════════════════════
       STATE
       ═══════════════════════════════════════════════════════════════ */

    address public lobToken; // M-4: For seized fund tracking

    uint256 public requiredApprovals;
    uint256 public signerCount;

    uint256 private _nextProposalId = 1;
    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => bool)) public proposalApprovals;

    uint256 private _nextStreamId = 1;
    mapping(uint256 => PaymentStream) public streams;
    mapping(address => uint256[]) public recipientStreams;

    // Seized funds tracking (from SybilGuard)
    uint256 public totalSeizedLOB;
    uint256 public totalSeizedUSDC;

    // M-3: Admin proposals — arbitrary contract calls via M-of-N + timelock
    struct AdminProposal {
        uint256 id;
        address proposer;
        address target;
        bytes callData;
        string description;
        ProposalStatus status;
        uint256 approvalCount;
        uint256 createdAt;
        uint256 timelockEnd;
    }

    uint256 private _nextAdminProposalId = 1;
    mapping(uint256 => AdminProposal) public adminProposals;
    mapping(uint256 => mapping(address => bool)) public adminProposalApprovals;

    /* ═══════════════════════════════════════════════════════════════
       EVENTS
       ═══════════════════════════════════════════════════════════════ */

    event ProposalCreated(
        uint256 indexed proposalId,
        address indexed proposer,
        address token,
        address recipient,
        uint256 amount,
        string description
    );
    event ProposalApproved(uint256 indexed proposalId, address indexed signer);
    event ProposalApprovedForExecution(uint256 indexed proposalId, uint256 timelockEnd);
    event ProposalExecuted(uint256 indexed proposalId, address indexed recipient, uint256 amount);
    event ProposalCancelled(uint256 indexed proposalId, address indexed canceller);

    event StreamCreated(
        uint256 indexed streamId,
        address indexed recipient,
        address token,
        uint256 totalAmount,
        uint256 startTime,
        uint256 endTime,
        string role
    );
    event StreamClaimed(uint256 indexed streamId, address indexed recipient, uint256 amount);
    event StreamCancelled(uint256 indexed streamId);

    event FundsReceived(address indexed token, address indexed from, uint256 amount);
    event FundsSeized(address indexed token, address indexed from, uint256 amount, string reason);

    event SignerAdded(address indexed signer);
    event SignerRemoved(address indexed signer);
    event RequiredApprovalsChanged(uint256 oldValue, uint256 newValue);

    event AdminProposalCreated(uint256 indexed proposalId, address indexed target, address indexed proposer);
    event AdminProposalApproved(uint256 indexed proposalId, address indexed signer);
    event AdminProposalApprovedForExecution(uint256 indexed proposalId, uint256 timelockEnd);
    event AdminProposalExecuted(uint256 indexed proposalId, address indexed target);
    event AdminProposalCancelled(uint256 indexed proposalId, address indexed canceller);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /* ═══════════════════════════════════════════════════════════════
       INITIALIZER
       ═══════════════════════════════════════════════════════════════ */

    /**
     * @param _signers Initial multisig signers (min 3)
     * @param _requiredApprovals Number of approvals needed (M-of-N)
     */
    function initialize(address[] memory _signers, uint256 _requiredApprovals, address _lobToken) public initializer {
        require(_signers.length >= MIN_SIGNERS, "TreasuryGovernor: min 3 signers");
        require(_signers.length <= MAX_SIGNERS, "TreasuryGovernor: max 9 signers");
        require(_lobToken != address(0), "TreasuryGovernor: zero lobToken");
        require(
            _requiredApprovals >= 2 && _requiredApprovals <= _signers.length,
            "TreasuryGovernor: invalid approval threshold"
        );

        __UUPSUpgradeable_init();
        __AccessControl_init();
        __ReentrancyGuard_init();

        _nextProposalId = 1;
        _nextStreamId = 1;
        _nextAdminProposalId = 1;
        nextBountyId = 1;

        for (uint256 i = 0; i < _signers.length; i++) {
            require(_signers[i] != address(0), "TreasuryGovernor: zero signer");
            // Check for duplicates
            for (uint256 j = 0; j < i; j++) {
                require(_signers[i] != _signers[j], "TreasuryGovernor: duplicate signer");
            }
            _grantRole(SIGNER_ROLE, _signers[i]);
        }

        lobToken = _lobToken;
        signerCount = _signers.length;
        requiredApprovals = _requiredApprovals;

        _grantRole(DEFAULT_ADMIN_ROLE, address(this));
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender); // Deployer gets admin for post-deploy role grants
        _grantRole(GUARDIAN_ROLE, _signers[0]); // First signer gets guardian role
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}

    /* ═══════════════════════════════════════════════════════════════
       RECEIVE FUNDS
       ═══════════════════════════════════════════════════════════════ */

    /**
     * @notice Receive seized funds from SybilGuard
     */
    function receiveSeizedFunds(
        address token,
        uint256 amount,
        address from,
        string calldata reason
    ) external onlyRole(SYBIL_GUARD_ROLE) nonReentrant {
        require(amount > 0, "TreasuryGovernor: zero amount");

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        // M-4: Track seized amounts by actual token type
        if (token == lobToken) {
            totalSeizedLOB += amount;
        } else {
            totalSeizedUSDC += amount;
        }

        emit FundsSeized(token, from, amount, reason);
    }

    /**
     * @notice Accept ERC20 deposits (from protocol fees, etc.)
     */
    function deposit(address token, uint256 amount) external nonReentrant {
        require(amount > 0, "TreasuryGovernor: zero amount");
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        emit FundsReceived(token, msg.sender, amount);
    }

    /* ═══════════════════════════════════════════════════════════════
       MULTISIG PROPOSALS
       ═══════════════════════════════════════════════════════════════ */

    /**
     * @notice Create a spending proposal (requires M-of-N approval)
     * @param token ERC20 token to transfer
     * @param recipient Destination address
     * @param amount Amount to transfer
     * @param description Human-readable description
     */
    function createProposal(
        address token,
        address recipient,
        uint256 amount,
        string calldata description
    ) external onlyRole(SIGNER_ROLE) nonReentrant returns (uint256) {
        require(recipient != address(0), "TreasuryGovernor: zero recipient");
        require(amount > 0, "TreasuryGovernor: zero amount");
        require(
            IERC20(token).balanceOf(address(this)) >= amount,
            "TreasuryGovernor: insufficient balance"
        );

        uint256 proposalId = _nextProposalId++;

        proposals[proposalId] = Proposal({
            id: proposalId,
            proposer: msg.sender,
            token: token,
            recipient: recipient,
            amount: amount,
            description: description,
            status: ProposalStatus.Pending,
            approvalCount: 1, // Proposer auto-approves
            createdAt: block.timestamp,
            timelockEnd: 0
        });

        proposalApprovals[proposalId][msg.sender] = true;

        emit ProposalCreated(proposalId, msg.sender, token, recipient, amount, description);
        emit ProposalApproved(proposalId, msg.sender);

        // M-2: When threshold met, set Approved + timelock instead of instant execution
        if (proposals[proposalId].approvalCount >= requiredApprovals) {
            _approveForExecution(proposalId);
        }

        return proposalId;
    }

    /**
     * @notice Approve a pending proposal
     */
    function approveProposal(uint256 proposalId) external onlyRole(SIGNER_ROLE) nonReentrant {
        Proposal storage p = proposals[proposalId];
        require(p.id != 0, "TreasuryGovernor: proposal not found");
        require(p.status == ProposalStatus.Pending, "TreasuryGovernor: not pending");
        require(!proposalApprovals[proposalId][msg.sender], "TreasuryGovernor: already approved");
        require(
            block.timestamp <= p.createdAt + PROPOSAL_EXPIRY,
            "TreasuryGovernor: proposal expired"
        );

        proposalApprovals[proposalId][msg.sender] = true;
        p.approvalCount++;

        emit ProposalApproved(proposalId, msg.sender);

        // M-2: When threshold met, set Approved + timelock instead of instant execution
        if (p.approvalCount >= requiredApprovals) {
            _approveForExecution(proposalId);
        }
    }

    /**
     * @notice Cancel a proposal (proposer or guardian only)
     */
    function cancelProposal(uint256 proposalId) external {
        Proposal storage p = proposals[proposalId];
        require(p.id != 0, "TreasuryGovernor: proposal not found");
        require(
            p.status == ProposalStatus.Pending || p.status == ProposalStatus.Approved,
            "TreasuryGovernor: not cancellable"
        );
        require(
            p.proposer == msg.sender || hasRole(GUARDIAN_ROLE, msg.sender),
            "TreasuryGovernor: unauthorized"
        );

        p.status = ProposalStatus.Cancelled;
        emit ProposalCancelled(proposalId, msg.sender);
    }

    /**
     * @notice Execute an approved proposal after timelock has expired
     */
    function executeProposal(uint256 proposalId) external nonReentrant {
        Proposal storage p = proposals[proposalId];
        require(p.id != 0, "TreasuryGovernor: proposal not found");
        require(p.status == ProposalStatus.Approved, "TreasuryGovernor: not approved");
        require(block.timestamp >= p.timelockEnd, "TreasuryGovernor: timelock not expired");
        require(
            block.timestamp <= p.createdAt + PROPOSAL_EXPIRY,
            "TreasuryGovernor: proposal expired"
        );

        _executeProposal(proposalId);
    }

    function _approveForExecution(uint256 proposalId) private {
        Proposal storage p = proposals[proposalId];
        p.status = ProposalStatus.Approved;
        p.timelockEnd = block.timestamp + PROPOSAL_TIMELOCK;

        emit ProposalApprovedForExecution(proposalId, p.timelockEnd);
    }

    function _executeProposal(uint256 proposalId) private {
        Proposal storage p = proposals[proposalId];
        require(
            IERC20(p.token).balanceOf(address(this)) >= p.amount,
            "TreasuryGovernor: insufficient balance at execution"
        );

        p.status = ProposalStatus.Executed;
        IERC20(p.token).safeTransfer(p.recipient, p.amount);

        emit ProposalExecuted(proposalId, p.recipient, p.amount);
    }

    /* ═══════════════════════════════════════════════════════════════
       ADMIN PROPOSALS (M-3: Arbitrary contract calls via M-of-N + timelock)
       ═══════════════════════════════════════════════════════════════ */

    /**
     * @notice Create an admin proposal to call an external contract
     * @param target The contract to call
     * @param data The calldata to execute
     * @param description Human-readable description
     */
    function createAdminProposal(
        address target,
        bytes calldata data,
        string calldata description
    ) external onlyRole(SIGNER_ROLE) nonReentrant returns (uint256) {
        require(target != address(0), "TreasuryGovernor: zero target");
        if (target == address(this)) {
            bytes4 selector = bytes4(data[:4]);
            require(
                selector == this.addSigner.selector ||
                selector == this.removeSigner.selector ||
                selector == this.setRequiredApprovals.selector ||
                selector == this.createStream.selector ||
                selector == this.createBounty.selector ||
                selector == this.completeBounty.selector,
                "TreasuryGovernor: unauthorized self-call"
            );
        }

        uint256 proposalId = _nextAdminProposalId++;

        AdminProposal storage ap = adminProposals[proposalId];
        ap.id = proposalId;
        ap.proposer = msg.sender;
        ap.target = target;
        ap.callData = data;
        ap.description = description;
        ap.status = ProposalStatus.Pending;
        ap.approvalCount = 1; // Proposer auto-approves
        ap.createdAt = block.timestamp;

        adminProposalApprovals[proposalId][msg.sender] = true;

        emit AdminProposalCreated(proposalId, target, msg.sender);
        emit AdminProposalApproved(proposalId, msg.sender);

        if (ap.approvalCount >= requiredApprovals) {
            _approveAdminForExecution(proposalId);
        }

        return proposalId;
    }

    /**
     * @notice Approve a pending admin proposal
     */
    function approveAdminProposal(uint256 proposalId) external onlyRole(SIGNER_ROLE) nonReentrant {
        AdminProposal storage ap = adminProposals[proposalId];
        require(ap.id != 0, "TreasuryGovernor: admin proposal not found");
        require(ap.status == ProposalStatus.Pending, "TreasuryGovernor: not pending");
        require(!adminProposalApprovals[proposalId][msg.sender], "TreasuryGovernor: already approved");
        require(
            block.timestamp <= ap.createdAt + PROPOSAL_EXPIRY,
            "TreasuryGovernor: proposal expired"
        );

        adminProposalApprovals[proposalId][msg.sender] = true;
        ap.approvalCount++;

        emit AdminProposalApproved(proposalId, msg.sender);

        if (ap.approvalCount >= requiredApprovals) {
            _approveAdminForExecution(proposalId);
        }
    }

    /**
     * @notice Execute an approved admin proposal after timelock
     */
    function executeAdminProposal(uint256 proposalId) external nonReentrant {
        AdminProposal storage ap = adminProposals[proposalId];
        require(ap.id != 0, "TreasuryGovernor: admin proposal not found");
        require(ap.status == ProposalStatus.Approved, "TreasuryGovernor: not approved");
        require(block.timestamp >= ap.timelockEnd, "TreasuryGovernor: timelock not expired");
        require(
            block.timestamp <= ap.createdAt + PROPOSAL_EXPIRY,
            "TreasuryGovernor: proposal expired"
        );

        ap.status = ProposalStatus.Executed;

        (bool success, bytes memory returnData) = ap.target.call(ap.callData);
        require(success, string(abi.encodePacked("TreasuryGovernor: call failed: ", returnData)));

        emit AdminProposalExecuted(proposalId, ap.target);
    }

    /**
     * @notice Cancel an admin proposal (proposer or guardian)
     */
    function cancelAdminProposal(uint256 proposalId) external {
        AdminProposal storage ap = adminProposals[proposalId];
        require(ap.id != 0, "TreasuryGovernor: admin proposal not found");
        require(
            ap.status == ProposalStatus.Pending || ap.status == ProposalStatus.Approved,
            "TreasuryGovernor: not cancellable"
        );
        require(
            ap.proposer == msg.sender || hasRole(GUARDIAN_ROLE, msg.sender),
            "TreasuryGovernor: unauthorized"
        );

        ap.status = ProposalStatus.Cancelled;
        emit AdminProposalCancelled(proposalId, msg.sender);
    }

    function getAdminProposal(uint256 proposalId) external view returns (
        uint256 id,
        address proposer,
        address target,
        bytes memory callData,
        string memory description,
        ProposalStatus status,
        uint256 approvalCount,
        uint256 createdAt,
        uint256 timelockEnd
    ) {
        AdminProposal storage ap = adminProposals[proposalId];
        return (ap.id, ap.proposer, ap.target, ap.callData, ap.description, ap.status, ap.approvalCount, ap.createdAt, ap.timelockEnd);
    }

    function _approveAdminForExecution(uint256 proposalId) private {
        AdminProposal storage ap = adminProposals[proposalId];
        ap.status = ProposalStatus.Approved;
        ap.timelockEnd = block.timestamp + PROPOSAL_TIMELOCK;

        emit AdminProposalApprovedForExecution(proposalId, ap.timelockEnd);
    }

    /* ═══════════════════════════════════════════════════════════════
       PAYMENT STREAMS (Automated Outflows)
       ═══════════════════════════════════════════════════════════════ */

    /**
     * @notice Create a payment stream (requires multisig via proposal first,
     *         or called by guardian for small streams)
     * @param recipient Stream recipient
     * @param token ERC20 token
     * @param totalAmount Total amount to stream over the duration
     * @param duration Stream duration in seconds
     * @param role Label: "moderator", "arbitrator", "grant"
     */
    /// @notice Create a payment stream. Requires multisig (DEFAULT_ADMIN_ROLE = address(this)).
    ///         Must be called via a proposal that targets this contract.
    function createStream(
        address recipient,
        address token,
        uint256 totalAmount,
        uint256 duration,
        string calldata role
    ) external onlyRole(DEFAULT_ADMIN_ROLE) returns (uint256) {
        require(recipient != address(0), "TreasuryGovernor: zero recipient");
        require(totalAmount > 0, "TreasuryGovernor: zero amount");
        require(duration > 0 && duration <= STREAM_MAX_DURATION, "TreasuryGovernor: invalid duration");
        require(
            IERC20(token).balanceOf(address(this)) >= totalAmount,
            "TreasuryGovernor: insufficient balance for stream"
        );

        uint256 streamId = _nextStreamId++;

        streams[streamId] = PaymentStream({
            id: streamId,
            recipient: recipient,
            token: token,
            totalAmount: totalAmount,
            claimedAmount: 0,
            startTime: block.timestamp,
            endTime: block.timestamp + duration,
            role: role,
            active: true
        });

        recipientStreams[recipient].push(streamId);

        emit StreamCreated(streamId, recipient, token, totalAmount, block.timestamp, block.timestamp + duration, role);

        return streamId;
    }

    /**
     * @notice Claim available funds from a payment stream
     * @param streamId The stream to claim from
     */
    function claimStream(uint256 streamId) external nonReentrant {
        PaymentStream storage s = streams[streamId];
        require(s.id != 0, "TreasuryGovernor: stream not found");
        require(s.active, "TreasuryGovernor: stream cancelled");
        require(s.recipient == msg.sender, "TreasuryGovernor: not recipient");

        uint256 available = _streamAvailable(s);
        require(available > 0, "TreasuryGovernor: nothing to claim");

        s.claimedAmount += available;
        IERC20(s.token).safeTransfer(s.recipient, available);

        emit StreamClaimed(streamId, msg.sender, available);
    }

    /**
     * @notice Cancel a payment stream (guardian or admin only)
     *         Unclaimed funds remain in treasury.
     */
    function cancelStream(uint256 streamId) external onlyRole(GUARDIAN_ROLE) {
        PaymentStream storage s = streams[streamId];
        require(s.id != 0, "TreasuryGovernor: stream not found");
        require(s.active, "TreasuryGovernor: already cancelled");

        s.active = false;
        emit StreamCancelled(streamId);
    }

    /**
     * @notice Cancel all streams for a banned address (called by SybilGuard)
     */
    function cancelStreamsForAddress(address banned) external onlyRole(SYBIL_GUARD_ROLE) {
        uint256[] storage streamIds = recipientStreams[banned];
        for (uint256 i = 0; i < streamIds.length; i++) {
            PaymentStream storage s = streams[streamIds[i]];
            if (s.active) {
                s.active = false;
                emit StreamCancelled(streamIds[i]);
            }
        }
    }

    function _streamAvailable(PaymentStream storage s) private view returns (uint256) {
        if (!s.active || block.timestamp < s.startTime) return 0;

        uint256 elapsed;
        if (block.timestamp >= s.endTime) {
            elapsed = s.endTime - s.startTime;
        } else {
            elapsed = block.timestamp - s.startTime;
        }

        uint256 duration = s.endTime - s.startTime;
        uint256 vested = (s.totalAmount * elapsed) / duration;

        if (vested <= s.claimedAmount) return 0;
        return vested - s.claimedAmount;
    }

    /* ═══════════════════════════════════════════════════════════════
       SIGNER MANAGEMENT
       ═══════════════════════════════════════════════════════════════ */

    /**
     * @notice Add a new signer (requires existing multisig approval via proposal)
     *         This function should be called through a proposal that calls this contract.
     */
    function addSigner(address signer) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(signer != address(0), "TreasuryGovernor: zero address");
        require(!hasRole(SIGNER_ROLE, signer), "TreasuryGovernor: already signer");
        require(signerCount < MAX_SIGNERS, "TreasuryGovernor: max signers reached");

        _grantRole(SIGNER_ROLE, signer);
        signerCount++;

        emit SignerAdded(signer);
    }

    /**
     * @notice Remove a signer (requires existing multisig approval via proposal)
     */
    function removeSigner(address signer) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(hasRole(SIGNER_ROLE, signer), "TreasuryGovernor: not a signer");
        require(signerCount > MIN_SIGNERS, "TreasuryGovernor: cannot go below minimum");
        require(signerCount - 1 >= requiredApprovals, "TreasuryGovernor: would break threshold");

        _revokeRole(SIGNER_ROLE, signer);
        signerCount--;

        emit SignerRemoved(signer);
    }

    /**
     * @notice Update required approvals (requires existing multisig approval)
     */
    function setRequiredApprovals(uint256 newRequired) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newRequired >= 2, "TreasuryGovernor: min 2 approvals");
        require(newRequired <= signerCount, "TreasuryGovernor: exceeds signer count");

        uint256 old = requiredApprovals;
        requiredApprovals = newRequired;

        emit RequiredApprovalsChanged(old, newRequired);
    }

    /* ═══════════════════════════════════════════════════════════════
       BOUNTIES
       ═══════════════════════════════════════════════════════════════ */

    enum BountyStatus { Open, Claimed, Completed, Cancelled }

    struct Bounty {
        uint256 id;
        address creator;
        string title;
        string description;
        uint256 reward;
        address token;
        BountyStatus status;
        string category;
        uint8 difficulty;
        address claimant;
        uint256 createdAt;
        uint256 deadline;
    }

    uint256 public nextBountyId = 1;
    mapping(uint256 => Bounty) public bounties;
    mapping(address => uint256) public reservedBalance;

    event BountyCreated(uint256 indexed bountyId, address indexed creator, uint256 reward, address token);
    event BountyClaimed(uint256 indexed bountyId, address indexed claimant);
    event BountyCompleted(uint256 indexed bountyId, address indexed claimant, uint256 reward);
    event BountyCancelled(uint256 indexed bountyId);

    /**
     * @notice Create a bounty with funds locked from treasury
     */
    function createBounty(
        string calldata title,
        string calldata description,
        uint256 reward,
        address token,
        string calldata category,
        uint8 difficulty,
        uint256 deadline
    ) external onlyRole(DEFAULT_ADMIN_ROLE) returns (uint256) {
        require(reward > 0, "TreasuryGovernor: zero reward");
        require(difficulty >= 1 && difficulty <= 5, "TreasuryGovernor: invalid difficulty");
        require(deadline > block.timestamp, "TreasuryGovernor: deadline in past");
        uint256 available = IERC20(token).balanceOf(address(this)) - reservedBalance[token];
        require(
            available >= reward,
            "TreasuryGovernor: insufficient balance for bounty"
        );

        reservedBalance[token] += reward;

        uint256 bountyId = nextBountyId++;

        bounties[bountyId] = Bounty({
            id: bountyId,
            creator: msg.sender,
            title: title,
            description: description,
            reward: reward,
            token: token,
            status: BountyStatus.Open,
            category: category,
            difficulty: difficulty,
            claimant: address(0),
            createdAt: block.timestamp,
            deadline: deadline
        });

        emit BountyCreated(bountyId, msg.sender, reward, token);
        return bountyId;
    }

    /**
     * @notice Claim an open bounty
     */
    function claimBounty(uint256 bountyId) external nonReentrant {
        Bounty storage b = bounties[bountyId];
        require(b.id != 0, "TreasuryGovernor: bounty not found");
        require(b.status == BountyStatus.Open, "TreasuryGovernor: not open");
        require(block.timestamp <= b.deadline, "TreasuryGovernor: bounty expired");

        b.status = BountyStatus.Claimed;
        b.claimant = msg.sender;

        emit BountyClaimed(bountyId, msg.sender);
    }

    /**
     * @notice Complete a bounty and release reward to claimant (DEFAULT_ADMIN_ROLE only — via proposal)
     */
    function completeBounty(uint256 bountyId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        Bounty storage b = bounties[bountyId];
        require(b.id != 0, "TreasuryGovernor: bounty not found");
        require(b.status == BountyStatus.Claimed, "TreasuryGovernor: not claimed");
        require(b.claimant != address(0), "TreasuryGovernor: no claimant");

        b.status = BountyStatus.Completed;
        reservedBalance[b.token] -= b.reward;
        IERC20(b.token).safeTransfer(b.claimant, b.reward);

        emit BountyCompleted(bountyId, b.claimant, b.reward);
    }

    /**
     * @notice Cancel a bounty (SIGNER_ROLE only). Funds remain in treasury.
     */
    function cancelBounty(uint256 bountyId) external onlyRole(SIGNER_ROLE) nonReentrant {
        Bounty storage b = bounties[bountyId];
        require(b.id != 0, "TreasuryGovernor: bounty not found");
        require(
            b.status == BountyStatus.Open || b.status == BountyStatus.Claimed,
            "TreasuryGovernor: not cancellable"
        );

        b.status = BountyStatus.Cancelled;
        reservedBalance[b.token] -= b.reward;
        emit BountyCancelled(bountyId);
    }

    function getBounty(uint256 bountyId) external view returns (Bounty memory) {
        return bounties[bountyId];
    }

    /* ═══════════════════════════════════════════════════════════════
       DELEGATION REGISTRY
       ═══════════════════════════════════════════════════════════════ */

    mapping(address => address) public delegateTo;
    mapping(address => uint256) public delegatorCount;

    event DelegateSet(address indexed delegator, address indexed delegatee);
    event DelegateRemoved(address indexed delegator, address indexed previousDelegatee);

    /**
     * @notice Delegate to an address
     */
    function delegate(address to) external {
        require(to != address(0), "TreasuryGovernor: zero delegate");
        require(to != msg.sender, "TreasuryGovernor: cannot self-delegate");

        address prev = delegateTo[msg.sender];
        if (prev != address(0)) {
            delegatorCount[prev]--;
        }

        delegateTo[msg.sender] = to;
        delegatorCount[to]++;

        emit DelegateSet(msg.sender, to);
    }

    /**
     * @notice Remove delegation
     */
    function undelegate() external {
        address prev = delegateTo[msg.sender];
        require(prev != address(0), "TreasuryGovernor: not delegated");

        delegatorCount[prev]--;
        delegateTo[msg.sender] = address(0);

        emit DelegateRemoved(msg.sender, prev);
    }

    /**
     * @notice Get who an address delegates to
     */
    function getDelegatee(address account) external view returns (address) {
        return delegateTo[account];
    }

    /* ═══════════════════════════════════════════════════════════════
       VIEW FUNCTIONS
       ═══════════════════════════════════════════════════════════════ */

    function getProposal(uint256 proposalId) external view returns (Proposal memory) {
        return proposals[proposalId];
    }

    function getStream(uint256 streamId) external view returns (PaymentStream memory) {
        return streams[streamId];
    }

    function streamClaimable(uint256 streamId) external view returns (uint256) {
        return _streamAvailable(streams[streamId]);
    }

    function getRecipientStreams(address recipient) external view returns (uint256[] memory) {
        return recipientStreams[recipient];
    }

    function getBalance(address token) external view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }

    function isProposalExpired(uint256 proposalId) external view returns (bool) {
        Proposal storage p = proposals[proposalId];
        return (p.status == ProposalStatus.Pending || p.status == ProposalStatus.Approved) &&
               block.timestamp > p.createdAt + PROPOSAL_EXPIRY;
    }
}
