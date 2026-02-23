// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "./interfaces/ILightningGovernor.sol";
import "./interfaces/IStakingManager.sol";

contract LightningGovernor is ILightningGovernor, AccessControl, ReentrancyGuard, Pausable {
    bytes32 public constant EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE");
    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");

    // Safety bounds
    uint256 public constant MIN_QUORUM = 2;
    uint256 public constant MAX_QUORUM = 20;
    uint256 public constant MIN_EXECUTION_DELAY = 10 minutes;
    uint256 public constant MAX_EXECUTION_DELAY = 6 hours;
    uint256 public constant MIN_VOTING_WINDOW = 1 hours;
    uint256 public constant MAX_VOTING_WINDOW = 7 days;
    uint256 public constant MIN_EXECUTION_WINDOW = 1 hours;
    uint256 public constant MAX_EXECUTION_WINDOW = 48 hours;
    uint256 public constant PROPOSAL_COOLDOWN = 10 minutes;

    IStakingManager public immutable stakingManager;

    uint256 public quorum = 3;
    uint256 public executionDelay = 15 minutes;
    uint256 public votingWindow = 24 hours;
    uint256 public executionWindow = 6 hours;

    uint256 private _nextProposalId = 1;

    // proposalId => Proposal
    mapping(uint256 => Proposal) private _proposals;
    // proposalId => voter => hasVoted
    mapping(uint256 => mapping(address => bool)) private _votes;
    // target => selector => whitelisted
    mapping(address => mapping(bytes4 => bool)) private _whitelist;
    // proposer => last proposal timestamp
    mapping(address => uint256) private _lastProposalTime;

    constructor(
        address _stakingManager,
        address _admin,
        address[] memory _executors,
        address _guardian
    ) {
        require(_stakingManager != address(0), "LightningGovernor: zero staking manager");
        require(_admin != address(0), "LightningGovernor: zero admin");
        require(_guardian != address(0), "LightningGovernor: zero guardian");
        require(_executors.length > 0, "LightningGovernor: no executors");

        stakingManager = IStakingManager(_stakingManager);

        // Admin (TreasuryGovernor) gets sole DEFAULT_ADMIN_ROLE
        _grantRole(DEFAULT_ADMIN_ROLE, _admin);

        // Executors (founding agents)
        for (uint256 i = 0; i < _executors.length; i++) {
            require(_executors[i] != address(0), "LightningGovernor: zero executor");
            _grantRole(EXECUTOR_ROLE, _executors[i]);
        }

        // Guardian
        _grantRole(GUARDIAN_ROLE, _guardian);
    }

    // ── Proposal lifecycle ─────────────────────────────────────────

    function createProposal(
        address target,
        bytes calldata data,
        string calldata description
    ) external whenNotPaused returns (uint256) {
        require(
            stakingManager.getTier(msg.sender) == IStakingManager.Tier.Platinum,
            "LightningGovernor: not Platinum"
        );
        require(target != address(this), "LightningGovernor: no self-calls");
        require(data.length >= 4, "LightningGovernor: calldata too short");
        require(
            _lastProposalTime[msg.sender] == 0 ||
            block.timestamp >= _lastProposalTime[msg.sender] + PROPOSAL_COOLDOWN,
            "LightningGovernor: cooldown active"
        );

        bytes4 selector = bytes4(data[:4]);
        require(_whitelist[target][selector], "LightningGovernor: not whitelisted");

        uint256 proposalId = _nextProposalId++;
        _lastProposalTime[msg.sender] = block.timestamp;

        Proposal storage p = _proposals[proposalId];
        p.id = proposalId;
        p.proposer = msg.sender;
        p.target = target;
        p.callData = data;
        p.description = description;
        p.status = ProposalStatus.Active;
        p.voteCount = 1; // auto-vote
        p.createdAt = block.timestamp;
        p.votingDeadline = block.timestamp + votingWindow;

        _votes[proposalId][msg.sender] = true;

        emit ProposalCreated(proposalId, msg.sender, target, selector, description);
        emit Voted(proposalId, msg.sender, 1);

        // Check if auto-approved (quorum = 1 edge case)
        if (p.voteCount >= quorum) {
            _approve(p);
        }

        return proposalId;
    }

    function vote(uint256 proposalId) external whenNotPaused {
        require(
            stakingManager.getTier(msg.sender) == IStakingManager.Tier.Platinum,
            "LightningGovernor: not Platinum"
        );

        Proposal storage p = _proposals[proposalId];
        require(p.id != 0, "LightningGovernor: proposal not found");
        require(p.status == ProposalStatus.Active, "LightningGovernor: not active");
        require(block.timestamp <= p.votingDeadline, "LightningGovernor: voting closed");
        require(!_votes[proposalId][msg.sender], "LightningGovernor: already voted");

        _votes[proposalId][msg.sender] = true;
        p.voteCount++;

        emit Voted(proposalId, msg.sender, p.voteCount);

        if (p.voteCount >= quorum) {
            _approve(p);
        }
    }

    function execute(uint256 proposalId) external onlyRole(EXECUTOR_ROLE) nonReentrant whenNotPaused {
        Proposal storage p = _proposals[proposalId];
        require(p.status == ProposalStatus.Approved, "LightningGovernor: not approved");
        require(block.timestamp >= p.approvedAt + executionDelay, "LightningGovernor: delay not met");
        require(block.timestamp <= p.executionDeadline, "LightningGovernor: execution expired");

        // Re-validate whitelist at execution time
        bytes4 selector;
        bytes memory cd = p.callData;
        assembly { selector := mload(add(cd, 32)) }
        require(_whitelist[p.target][selector], "LightningGovernor: whitelist revoked");

        p.status = ProposalStatus.Executed;

        (bool success, bytes memory returnData) = p.target.call(p.callData);
        require(success, string(abi.encodePacked("LightningGovernor: execution failed: ", returnData)));

        emit ProposalExecuted(proposalId, msg.sender);
    }

    function cancel(uint256 proposalId) external {
        Proposal storage p = _proposals[proposalId];
        require(p.id != 0, "LightningGovernor: proposal not found");
        require(
            p.status == ProposalStatus.Active || p.status == ProposalStatus.Approved,
            "LightningGovernor: not cancellable"
        );
        require(
            msg.sender == p.proposer || hasRole(GUARDIAN_ROLE, msg.sender),
            "LightningGovernor: unauthorized"
        );

        p.status = ProposalStatus.Cancelled;
        emit ProposalCancelled(proposalId, msg.sender);
    }

    // ── Admin config ───────────────────────────────────────────────

    function setWhitelisted(address target, bytes4 selector, bool allowed) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(target != address(this), "LightningGovernor: cannot whitelist self");
        require(target != address(0), "LightningGovernor: zero target");
        _whitelist[target][selector] = allowed;
        emit WhitelistUpdated(target, selector, allowed);
    }

    function setQuorum(uint256 newQuorum) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newQuorum >= MIN_QUORUM && newQuorum <= MAX_QUORUM, "LightningGovernor: quorum out of bounds");
        emit QuorumUpdated(quorum, newQuorum);
        quorum = newQuorum;
    }

    function setExecutionDelay(uint256 newDelay) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(
            newDelay >= MIN_EXECUTION_DELAY && newDelay <= MAX_EXECUTION_DELAY,
            "LightningGovernor: delay out of bounds"
        );
        emit ExecutionDelayUpdated(executionDelay, newDelay);
        executionDelay = newDelay;
    }

    function setVotingWindow(uint256 newWindow) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(
            newWindow >= MIN_VOTING_WINDOW && newWindow <= MAX_VOTING_WINDOW,
            "LightningGovernor: voting window out of bounds"
        );
        emit VotingWindowUpdated(votingWindow, newWindow);
        votingWindow = newWindow;
    }

    function setExecutionWindow(uint256 newWindow) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(
            newWindow >= MIN_EXECUTION_WINDOW && newWindow <= MAX_EXECUTION_WINDOW,
            "LightningGovernor: execution window out of bounds"
        );
        emit ExecutionWindowUpdated(executionWindow, newWindow);
        executionWindow = newWindow;
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // ── Views ──────────────────────────────────────────────────────

    function getProposal(uint256 proposalId) external view returns (Proposal memory) {
        require(_proposals[proposalId].id != 0, "LightningGovernor: proposal not found");
        return _proposals[proposalId];
    }

    function hasVoted(uint256 proposalId, address voter) external view returns (bool) {
        return _votes[proposalId][voter];
    }

    function isWhitelisted(address target, bytes4 selector) external view returns (bool) {
        return _whitelist[target][selector];
    }

    function getEffectiveStatus(uint256 proposalId) external view returns (ProposalStatus) {
        Proposal storage p = _proposals[proposalId];
        require(p.id != 0, "LightningGovernor: proposal not found");

        if (p.status == ProposalStatus.Active && block.timestamp > p.votingDeadline) {
            return ProposalStatus.Expired;
        }
        if (p.status == ProposalStatus.Approved && block.timestamp > p.executionDeadline) {
            return ProposalStatus.Expired;
        }
        return p.status;
    }

    function proposalCount() external view returns (uint256) {
        return _nextProposalId - 1;
    }

    // ── Internal ───────────────────────────────────────────────────

    function _approve(Proposal storage p) internal {
        p.status = ProposalStatus.Approved;
        p.approvedAt = block.timestamp;
        p.executionDeadline = block.timestamp + executionDelay + executionWindow;
        emit ProposalApproved(p.id, p.executionDeadline);
    }
}
