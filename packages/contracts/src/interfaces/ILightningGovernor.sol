// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ILightningGovernor {
    enum ProposalStatus { Active, Approved, Executed, Cancelled, Expired }

    struct Proposal {
        uint256 id;
        address proposer;
        address target;
        bytes callData;
        string description;
        ProposalStatus status;
        uint256 voteCount;
        uint256 createdAt;
        uint256 votingDeadline;
        uint256 approvedAt;
        uint256 executionDeadline;
    }

    event ProposalCreated(uint256 indexed proposalId, address indexed proposer, address target, bytes4 selector, string description);
    event Voted(uint256 indexed proposalId, address indexed voter, uint256 newVoteCount);
    event ProposalApproved(uint256 indexed proposalId, uint256 executionDeadline);
    event ProposalExecuted(uint256 indexed proposalId, address indexed executor);
    event ProposalCancelled(uint256 indexed proposalId, address indexed cancelledBy);
    event WhitelistUpdated(address indexed target, bytes4 indexed selector, bool allowed);
    event QuorumUpdated(uint256 oldQuorum, uint256 newQuorum);
    event ExecutionDelayUpdated(uint256 oldDelay, uint256 newDelay);
    event VotingWindowUpdated(uint256 oldWindow, uint256 newWindow);
    event ExecutionWindowUpdated(uint256 oldWindow, uint256 newWindow);

    function createProposal(address target, bytes calldata data, string calldata description) external returns (uint256);
    function vote(uint256 proposalId) external;
    function execute(uint256 proposalId) external;
    function cancel(uint256 proposalId) external;

    function setWhitelisted(address target, bytes4 selector, bool allowed) external;
    function setQuorum(uint256 newQuorum) external;
    function setExecutionDelay(uint256 newDelay) external;
    function setVotingWindow(uint256 newWindow) external;
    function setExecutionWindow(uint256 newWindow) external;

    function getProposal(uint256 proposalId) external view returns (Proposal memory);
    function hasVoted(uint256 proposalId, address voter) external view returns (bool);
    function isWhitelisted(address target, bytes4 selector) external view returns (bool);
    function getEffectiveStatus(uint256 proposalId) external view returns (ProposalStatus);
    function proposalCount() external view returns (uint256);
}
