// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IDisputeArbitration {
    enum ArbitratorRank { None, Junior, Senior, Principal }
    enum DisputeStatus { Open, EvidencePhase, Voting, Resolved }
    enum Ruling { Pending, BuyerWins, SellerWins, Draw }

    struct Dispute {
        uint256 id;
        uint256 jobId;
        address buyer;
        address seller;
        uint256 amount;
        address token;
        string buyerEvidenceURI;
        string sellerEvidenceURI;
        DisputeStatus status;
        Ruling ruling;
        uint256 createdAt;
        uint256 counterEvidenceDeadline;
        uint256 votingDeadline;
        address[3] arbitrators;
        uint8 votesForBuyer;
        uint8 votesForSeller;
        uint8 totalVotes;
    }

    struct ArbitratorInfo {
        uint256 stake;
        ArbitratorRank rank;
        uint256 disputesHandled;
        uint256 majorityVotes;
        bool active;
    }

    event DisputeCreated(uint256 indexed disputeId, uint256 indexed jobId, address indexed buyer, address seller, uint256 amount);
    event ArbitratorsAssigned(uint256 indexed disputeId, address[3] arbitrators);
    event CounterEvidenceSubmitted(uint256 indexed disputeId, string evidenceURI);
    event VoteCast(uint256 indexed disputeId, address indexed arbitrator, bool favorBuyer);
    event RulingExecuted(uint256 indexed disputeId, Ruling ruling);
    event ArbitratorStaked(address indexed arbitrator, uint256 amount, ArbitratorRank rank);
    event ArbitratorUnstaked(address indexed arbitrator, uint256 amount);
    event VotingAdvanced(uint256 indexed disputeId);

    function removeArbitrator(address arbitrator) external;
    function stakeAsArbitrator(uint256 amount) external;
    function unstakeAsArbitrator(uint256 amount) external;
    function submitDispute(uint256 jobId, address buyer, address seller, uint256 amount, address token, string calldata buyerEvidenceURI) external returns (uint256 disputeId);
    function submitCounterEvidence(uint256 disputeId, string calldata sellerEvidenceURI) external;
    function vote(uint256 disputeId, bool favorBuyer) external;
    function executeRuling(uint256 disputeId) external;
    function getDispute(uint256 disputeId) external view returns (Dispute memory);
    function getArbitratorInfo(address arbitrator) external view returns (ArbitratorInfo memory);
}
