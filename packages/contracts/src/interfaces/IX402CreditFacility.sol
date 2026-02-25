// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IX402CreditFacility {
    enum CreditLineStatus { Active, Frozen, Closed }

    struct CreditLine {
        address agent;
        uint256 creditLimit;
        uint256 totalDrawn;
        uint256 totalRepaid;
        uint256 interestRateBps;
        uint256 collateralDeposited;
        CreditLineStatus status;
        uint256 openedAt;
        uint256 defaults;
        uint256 activeDraws;
    }

    struct CreditDraw {
        uint256 id;
        uint256 creditLineId;
        address agent;
        uint256 amount;
        uint256 interestAccrued;
        uint256 protocolFee;
        uint256 escrowJobId;
        uint256 drawnAt;
        uint256 repaidAt;
        bool liquidated;
        uint256 refundCredit;
    }

    // ── Events ──────────────────────────────────────────────────────────
    event CreditLineOpened(address indexed agent, uint256 creditLimit, uint256 collateral, uint256 interestRateBps);
    event CreditLineClosed(address indexed agent, uint256 collateralReturned);
    event CreditLineFrozen(address indexed agent, uint256 defaults);
    event CreditDrawn(uint256 indexed drawId, address indexed agent, uint256 amount, uint256 indexed escrowJobId);
    event DrawRepaid(uint256 indexed drawId, address indexed agent, uint256 totalPaid);
    event DrawLiquidated(uint256 indexed drawId, address indexed agent, uint256 collateralSeized, uint256 stakeSlashed);
    event RefundCredited(uint256 indexed drawId, uint256 indexed escrowJobId, uint256 refundAmount);
    event PoolDeposited(address indexed depositor, uint256 amount);
    event PoolWithdrawn(address indexed withdrawer, uint256 amount);

    // ── Core Functions ──────────────────────────────────────────────────
    function openCreditLine() external;
    function closeCreditLine() external;
    function drawCreditAndCreateEscrow(uint256 listingId, address seller, uint256 amount) external returns (uint256 drawId);
    function drawCreditForAgent(address agent, uint256 listingId, address seller, uint256 amount) external returns (uint256 drawId);
    function confirmDelivery(uint256 escrowJobId) external;
    function initiateDispute(uint256 escrowJobId, string calldata evidenceURI) external;
    function cancelJob(uint256 escrowJobId) external;
    function repayDraw(uint256 drawId) external;
    function claimEscrowRefund(uint256 escrowJobId) external;
    function liquidateDraw(uint256 drawId) external;
    function depositToPool(uint256 amount) external;
    function withdrawFromPool(uint256 amount) external;
    function liftFreeze(address agent) external;

    // ── View Functions ──────────────────────────────────────────────────
    function getCreditLine(address agent) external view returns (CreditLine memory);
    function getDraw(uint256 drawId) external view returns (CreditDraw memory);
    function getActiveDrawIds(address agent) external view returns (uint256[] memory);
    function getAvailableCredit(address agent) external view returns (uint256);
    function getPoolUtilization() external view returns (uint256 total, uint256 outstanding, uint256 available);
}
