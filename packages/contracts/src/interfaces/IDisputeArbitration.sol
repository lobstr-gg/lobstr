// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IDisputeArbitration {
    enum ArbitratorRank { None, Junior, Senior, Principal }
    enum DisputeStatus { PanelPending, EvidencePhase, Voting, Resolved, Appealed }
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
        bool appealed;
        uint256 appealDeadline;
        uint256 panelSealBlock;
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
    event PanelSealed(uint256 indexed disputeId, address[3] arbitrators);
    event CounterEvidenceSubmitted(uint256 indexed disputeId, string evidenceURI);
    event VoteCast(uint256 indexed disputeId, address indexed arbitrator, bool favorBuyer);
    event RulingExecuted(uint256 indexed disputeId, Ruling ruling);
    event RulingFinalized(uint256 indexed disputeId, Ruling ruling);
    event ArbitratorStaked(address indexed arbitrator, uint256 amount, ArbitratorRank rank);
    event ArbitratorUnstaked(address indexed arbitrator, uint256 amount);
    event VotingAdvanced(uint256 indexed disputeId);
    event ArbitratorPaused(address indexed arbitrator);
    event ArbitratorUnpaused(address indexed arbitrator);
    event CollusionFlagged(address indexed arbA, address indexed arbB, uint256 agreementRate);
    event AppealFiled(uint256 indexed originalDisputeId, uint256 indexed appealDisputeId, address indexed appealer);
    event AppealBondReturned(uint256 indexed disputeId, address indexed appealer, uint256 amount);
    event AppealBondForfeited(uint256 indexed disputeId, uint256 amount);
    event EmergencyResolution(uint256 indexed disputeId);
    event DisputeRepaneled(uint256 indexed disputeId, uint256 repanelCount);

    function emergencyResolveStuckDispute(uint256 disputeId) external;
    function repanelDispute(uint256 disputeId) external;
    function removeArbitrator(address arbitrator) external;
    function stakeAsArbitrator(uint256 amount) external;
    function unstakeAsArbitrator(uint256 amount) external;
    function pauseAsArbitrator() external;
    function unpauseAsArbitrator() external;
    function submitDispute(uint256 jobId, address buyer, address seller, uint256 amount, address token, string calldata buyerEvidenceURI) external returns (uint256 disputeId);
    function sealPanel(uint256 disputeId) external;
    function submitCounterEvidence(uint256 disputeId, string calldata sellerEvidenceURI) external;
    function vote(uint256 disputeId, bool favorBuyer) external;
    function executeRuling(uint256 disputeId) external;
    function finalizeRuling(uint256 disputeId) external;
    function appealRuling(uint256 disputeId) external returns (uint256 appealDisputeId);
    function getDispute(uint256 disputeId) external view returns (Dispute memory);
    function getArbitratorInfo(address arbitrator) external view returns (ArbitratorInfo memory);
    function getAgreementRate(address arbA, address arbB) external view returns (uint256 agreements, uint256 disagreements);
}
