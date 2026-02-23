// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ILoanEngine {
    enum LoanStatus { Requested, Active, Repaid, Liquidated, Cancelled }
    enum LoanTerm { SevenDays, FourteenDays, ThirtyDays, NinetyDays }

    struct Loan {
        uint256 id;
        address borrower;
        address lender;
        uint256 principal;
        uint256 interestAmount;
        uint256 protocolFee;
        uint256 collateralAmount;
        uint256 totalRepaid;
        LoanStatus status;
        LoanTerm term;
        uint256 requestedAt;
        uint256 fundedAt;
        uint256 dueDate;
    }

    struct BorrowerProfile {
        uint256 activeLoans;
        uint256 totalBorrowed;
        uint256 totalRepaid;
        uint256 defaults;
        bool restricted;
    }

    event LoanRequested(uint256 indexed loanId, address indexed borrower, uint256 principal, LoanTerm term);
    event LoanCancelled(uint256 indexed loanId);
    event LoanFunded(uint256 indexed loanId, address indexed lender);
    event RepaymentMade(uint256 indexed loanId, uint256 amount, uint256 remaining);
    event LoanRepaid(uint256 indexed loanId);
    event LoanDefaulted(uint256 indexed loanId, address indexed borrower);
    event LoanLiquidated(uint256 indexed loanId, uint256 collateralSeized, uint256 stakeSlashed);
    event BorrowerRestricted(address indexed borrower, uint256 defaults);

    function requestLoan(uint256 principal, LoanTerm term) external returns (uint256 loanId);
    function cancelLoan(uint256 loanId) external;
    function fundLoan(uint256 loanId) external;
    function repay(uint256 loanId, uint256 amount) external;
    function liquidate(uint256 loanId) external;
    function cleanupExpiredRequest(uint256 loanId) external;

    function getLoan(uint256 loanId) external view returns (Loan memory);
    function getBorrowerProfile(address borrower) external view returns (BorrowerProfile memory);
    function getMaxBorrow(address borrower) external view returns (uint256);
    function getInterestRate(address borrower) external view returns (uint256);
    function getCollateralRequired(uint256 principal, address borrower) external view returns (uint256);
    function getOutstandingAmount(uint256 loanId) external view returns (uint256);
    function getTermDuration(LoanTerm term) external pure returns (uint256);
    function getActiveLoanIds(address borrower) external view returns (uint256[] memory);
}
