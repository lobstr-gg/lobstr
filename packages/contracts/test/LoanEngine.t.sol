// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/LOBToken.sol";
import "../src/ReputationSystem.sol";
import "../src/StakingManager.sol";
import "../src/LoanEngine.sol";

contract MockSybilGuardForLoans {
    mapping(address => bool) public banned;

    function setBanned(address user, bool val) external {
        banned[user] = val;
    }

    function checkBanned(address user) external view returns (bool) {
        return banned[user];
    }

    function checkAnyBanned(address[] calldata) external pure returns (bool) {
        return false;
    }
}

contract LoanEngineTest is Test {
    // Re-declare events for vm.expectEmit
    event LoanRequested(uint256 indexed loanId, address indexed borrower, uint256 principal, ILoanEngine.LoanTerm term);
    event LoanCancelled(uint256 indexed loanId);
    event LoanFunded(uint256 indexed loanId, address indexed lender);
    event RepaymentMade(uint256 indexed loanId, uint256 amount, uint256 remaining);
    event LoanRepaid(uint256 indexed loanId);
    event LoanDefaulted(uint256 indexed loanId, address indexed borrower);
    event LoanLiquidated(uint256 indexed loanId, uint256 collateralSeized, uint256 stakeSlashed);
    event BorrowerRestricted(address indexed borrower, uint256 defaults);

    LOBToken public token;
    ReputationSystem public reputation;
    StakingManager public staking;
    LoanEngine public loanEngine;
    MockSybilGuardForLoans public sybilGuard;

    address public admin = makeAddr("admin");
    address public distributor = makeAddr("distributor");
    address public treasury = makeAddr("treasury");
    address public borrower = makeAddr("borrower");
    address public lender = makeAddr("lender");
    address public thirdParty = makeAddr("thirdParty");

    function setUp() public {
        vm.startPrank(admin);
        token = new LOBToken();
        token.initialize(distributor);
        reputation = new ReputationSystem();
        reputation.initialize();
        staking = new StakingManager();
        staking.initialize(address(token));
        sybilGuard = new MockSybilGuardForLoans();
        vm.stopPrank();

        loanEngine = new LoanEngine();
        loanEngine.initialize(
            address(token),
            address(reputation),
            address(staking),
            address(sybilGuard),
            treasury,
            address(this)
        );

        // OZ 5.x: DEFAULT_ADMIN_ROLE granted to _owner (address(this)), grant to admin for tests
        loanEngine.grantRole(loanEngine.DEFAULT_ADMIN_ROLE(), admin);

        vm.startPrank(admin);
        // Grant roles to LoanEngine
        reputation.grantRole(reputation.RECORDER_ROLE(), address(loanEngine));
        staking.grantRole(staking.SLASHER_ROLE(), address(loanEngine));
        staking.grantRole(staking.LOCKER_ROLE(), address(loanEngine));
        vm.stopPrank();

        // Fund participants
        vm.startPrank(distributor);
        token.transfer(borrower, 500_000 ether);
        token.transfer(lender, 500_000 ether);
        token.transfer(thirdParty, 100_000 ether);
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════
    //  HELPERS
    // ═══════════════════════════════════════════════════════════════

    function _buildReputation(address user, uint256 completions) internal {
        // Each completion = +100 points. Silver at 1000, so need 5 completions
        // (base 500 + 5*100 = 1000)
        // Uses unique counterparty per completion to satisfy anti-farming requirements
        vm.startPrank(admin);
        reputation.grantRole(reputation.RECORDER_ROLE(), admin);
        vm.stopPrank();

        for (uint256 i = 0; i < completions; i++) {
            vm.prank(admin);
            reputation.recordCompletion(user, address(uint160(0x1000 + i)));
        }
    }

    function _makeSilver(address user) internal {
        _buildReputation(user, 5); // 500 + 500 = 1000 = Silver threshold
        vm.warp(block.timestamp + 7 days); // V-006: SILVER_MIN_TENURE
    }

    function _makeGold(address user) internal {
        _buildReputation(user, 45); // 500 + 4500 = 5000 = Gold threshold
        vm.warp(block.timestamp + 30 days); // V-006: GOLD_MIN_TENURE
    }

    function _makePlatinum(address user) internal {
        _buildReputation(user, 95); // 500 + 9500 = 10000 = Platinum threshold
        vm.warp(block.timestamp + 90 days); // V-006: PLATINUM_MIN_TENURE
    }

    function _stakeBorrower(address user) internal {
        _stakeBorrowerAmount(user, 1_000 ether);
    }

    function _stakeBorrowerAmount(address user, uint256 amount) internal {
        vm.startPrank(user);
        token.approve(address(staking), amount);
        staking.stake(amount);
        vm.stopPrank();
    }

    function _requestSilverLoan(address user, uint256 principal) internal returns (uint256) {
        _makeSilver(user);
        _stakeBorrower(user);
        uint256 collateral = (principal * 5000) / 10000; // 50%
        vm.startPrank(user);
        token.approve(address(loanEngine), collateral);
        uint256 loanId = loanEngine.requestLoan(principal, ILoanEngine.LoanTerm.ThirtyDays);
        vm.stopPrank();
        return loanId;
    }

    function _fundLoan(uint256 loanId) internal {
        ILoanEngine.Loan memory loan = loanEngine.getLoan(loanId);
        vm.startPrank(lender);
        token.approve(address(loanEngine), loan.principal);
        loanEngine.fundLoan(loanId);
        vm.stopPrank();
    }

    function _fullRepayAmount(uint256 loanId) internal view returns (uint256) {
        return loanEngine.getOutstandingAmount(loanId);
    }

    // ═══════════════════════════════════════════════════════════════
    //  TIER ELIGIBILITY
    // ═══════════════════════════════════════════════════════════════

    function test_bronzeBorrowerRejected() public {
        // Bronze (default) — should be rejected
        vm.startPrank(borrower);
        token.approve(address(loanEngine), 1000 ether);
        vm.expectRevert("LoanEngine: insufficient reputation");
        loanEngine.requestLoan(100 ether, ILoanEngine.LoanTerm.ThirtyDays);
        vm.stopPrank();
    }

    function test_silverCanBorrow() public {
        uint256 loanId = _requestSilverLoan(borrower, 500 ether);
        ILoanEngine.Loan memory loan = loanEngine.getLoan(loanId);
        assertEq(loan.principal, 500 ether);
        assertEq(uint256(loan.status), uint256(ILoanEngine.LoanStatus.Requested));
    }

    function test_goldCanBorrow() public {
        _makeGold(borrower);
        _stakeBorrowerAmount(borrower, 2_500 ether); // V-005: stake >= principal
        uint256 principal = 2500 ether;
        uint256 collateral = (principal * 4000) / 10000; // 40%
        vm.startPrank(borrower);
        token.approve(address(loanEngine), collateral);
        uint256 loanId = loanEngine.requestLoan(principal, ILoanEngine.LoanTerm.ThirtyDays);
        vm.stopPrank();

        ILoanEngine.Loan memory loan = loanEngine.getLoan(loanId);
        assertEq(loan.principal, principal);
        assertEq(loan.collateralAmount, collateral);
    }

    function test_platinumCanBorrowWithMinCollateral() public {
        _makePlatinum(borrower);
        _stakeBorrowerAmount(borrower, 10_000 ether); // V-005: stake >= principal
        uint256 principal = 10_000 ether;
        uint256 collateral = (principal * 2500) / 10000; // 25% collateral
        vm.startPrank(borrower);
        token.approve(address(loanEngine), collateral);
        uint256 loanId = loanEngine.requestLoan(principal, ILoanEngine.LoanTerm.ThirtyDays);
        vm.stopPrank();

        ILoanEngine.Loan memory loan = loanEngine.getLoan(loanId);
        assertEq(loan.collateralAmount, collateral);
        assertEq(loan.principal, principal);
    }

    // ═══════════════════════════════════════════════════════════════
    //  MAX BORROW LIMITS
    // ═══════════════════════════════════════════════════════════════

    function test_silverExceedsMaxBorrow() public {
        _makeSilver(borrower);
        _stakeBorrower(borrower);
        vm.startPrank(borrower);
        token.approve(address(loanEngine), 1000 ether);
        vm.expectRevert("LoanEngine: exceeds max borrow");
        loanEngine.requestLoan(501 ether, ILoanEngine.LoanTerm.ThirtyDays);
        vm.stopPrank();
    }

    function test_goldExceedsMaxBorrow() public {
        _makeGold(borrower);
        _stakeBorrowerAmount(borrower, 2_501 ether); // V-005: stake >= principal to reach max-borrow check
        vm.startPrank(borrower);
        token.approve(address(loanEngine), 10_000 ether);
        vm.expectRevert("LoanEngine: exceeds max borrow");
        loanEngine.requestLoan(2501 ether, ILoanEngine.LoanTerm.ThirtyDays);
        vm.stopPrank();
    }

    function test_platinumExceedsMaxBorrow() public {
        _makePlatinum(borrower);
        _stakeBorrowerAmount(borrower, 10_001 ether); // V-005: stake >= principal to reach max-borrow check
        vm.startPrank(borrower);
        token.approve(address(loanEngine), 5000 ether);
        vm.expectRevert("LoanEngine: exceeds max borrow");
        loanEngine.requestLoan(10_001 ether, ILoanEngine.LoanTerm.ThirtyDays);
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════
    //  INTEREST CALCULATION
    // ═══════════════════════════════════════════════════════════════

    function test_interestCalculation7Days() public {
        _makeSilver(borrower);
        _stakeBorrower(borrower);
        uint256 principal = 500 ether;
        uint256 collateral = (principal * 5000) / 10000;
        vm.startPrank(borrower);
        token.approve(address(loanEngine), collateral);
        uint256 loanId = loanEngine.requestLoan(principal, ILoanEngine.LoanTerm.SevenDays);
        vm.stopPrank();

        // Silver: 800 BPS annual, 7 days
        // interest = 500e18 * 800 * 7 days / (10000 * 365 * 1 day)
        uint256 expected = (principal * 800 * 7 days) / (10000 * 365 * 1 days);
        ILoanEngine.Loan memory loan = loanEngine.getLoan(loanId);
        assertEq(loan.interestAmount, expected);
    }

    function test_interestCalculation14Days() public {
        _makeGold(borrower);
        _stakeBorrowerAmount(borrower, 2_000 ether); // V-005: stake >= principal
        uint256 principal = 2000 ether;
        uint256 collateral = (principal * 4000) / 10000; // 40%
        vm.startPrank(borrower);
        token.approve(address(loanEngine), collateral);
        uint256 loanId = loanEngine.requestLoan(principal, ILoanEngine.LoanTerm.FourteenDays);
        vm.stopPrank();

        uint256 expected = (principal * 500 * 14 days) / (10000 * 365 * 1 days);
        ILoanEngine.Loan memory loan = loanEngine.getLoan(loanId);
        assertEq(loan.interestAmount, expected);
    }

    function test_interestCalculation30Days() public {
        _makeGold(borrower);
        _stakeBorrowerAmount(borrower, 2_500 ether); // V-005: stake >= principal
        uint256 principal = 2500 ether;
        uint256 collateral = (principal * 4000) / 10000; // 40%
        vm.startPrank(borrower);
        token.approve(address(loanEngine), collateral);
        uint256 loanId = loanEngine.requestLoan(principal, ILoanEngine.LoanTerm.ThirtyDays);
        vm.stopPrank();

        uint256 expected = (principal * 500 * 30 days) / (10000 * 365 * 1 days);
        ILoanEngine.Loan memory loan = loanEngine.getLoan(loanId);
        assertEq(loan.interestAmount, expected);
    }

    function test_interestCalculation90Days() public {
        _makePlatinum(borrower);
        _stakeBorrowerAmount(borrower, 10_000 ether); // V-005: stake >= principal
        uint256 principal = 10_000 ether;
        uint256 collateral = (principal * 2500) / 10000; // 25%
        vm.startPrank(borrower);
        token.approve(address(loanEngine), collateral);
        uint256 loanId = loanEngine.requestLoan(principal, ILoanEngine.LoanTerm.NinetyDays);
        vm.stopPrank();

        uint256 expected = (principal * 300 * 90 days) / (10000 * 365 * 1 days);
        ILoanEngine.Loan memory loan = loanEngine.getLoan(loanId);
        assertEq(loan.interestAmount, expected);
    }

    // ═══════════════════════════════════════════════════════════════
    //  COLLATERAL DEPOSIT AND RETURN
    // ═══════════════════════════════════════════════════════════════

    function test_collateralDeposited() public {
        uint256 principal = 400 ether;
        uint256 expectedCollateral = (principal * 5000) / 10000; // 200 ether

        _makeSilver(borrower);
        _stakeBorrower(borrower);
        uint256 balBefore = token.balanceOf(borrower);

        vm.startPrank(borrower);
        token.approve(address(loanEngine), expectedCollateral);
        loanEngine.requestLoan(principal, ILoanEngine.LoanTerm.SevenDays);
        vm.stopPrank();

        assertEq(token.balanceOf(borrower), balBefore - expectedCollateral);
        assertEq(token.balanceOf(address(loanEngine)), expectedCollateral);
    }

    function test_collateralReturnedOnCancel() public {
        uint256 loanId = _requestSilverLoan(borrower, 400 ether);
        uint256 balBefore = token.balanceOf(borrower);

        vm.prank(borrower);
        loanEngine.cancelLoan(loanId);

        // Collateral = 200 ether returned
        assertEq(token.balanceOf(borrower), balBefore + 200 ether);
    }

    // ═══════════════════════════════════════════════════════════════
    //  FULL LIFECYCLE — HAPPY PATH
    // ═══════════════════════════════════════════════════════════════

    function test_fullLifecycleHappyPath() public {
        // Request
        uint256 loanId = _requestSilverLoan(borrower, 500 ether);

        // Fund
        _fundLoan(loanId);
        ILoanEngine.Loan memory loan = loanEngine.getLoan(loanId);
        assertEq(uint256(loan.status), uint256(ILoanEngine.LoanStatus.Active));
        assertEq(loan.lender, lender);

        // Repay in full
        uint256 outstanding = _fullRepayAmount(loanId);
        vm.startPrank(borrower);
        token.approve(address(loanEngine), outstanding);
        loanEngine.repay(loanId, outstanding);
        vm.stopPrank();

        loan = loanEngine.getLoan(loanId);
        assertEq(uint256(loan.status), uint256(ILoanEngine.LoanStatus.Repaid));
    }

    // ═══════════════════════════════════════════════════════════════
    //  FULL LIFECYCLE — DEFAULT + LIQUIDATION
    // ═══════════════════════════════════════════════════════════════

    function test_fullLifecycleDefault() public {
        uint256 loanId = _requestSilverLoan(borrower, 500 ether);
        _fundLoan(loanId);

        // Skip past due date + grace period
        ILoanEngine.Loan memory loan = loanEngine.getLoan(loanId);
        vm.warp(loan.dueDate + 48 hours + 1);

        // Liquidate
        loanEngine.liquidate(loanId);

        loan = loanEngine.getLoan(loanId);
        assertEq(uint256(loan.status), uint256(ILoanEngine.LoanStatus.Liquidated));
    }

    // ═══════════════════════════════════════════════════════════════
    //  PARTIAL REPAYMENT
    // ═══════════════════════════════════════════════════════════════

    function test_partialRepayment() public {
        uint256 loanId = _requestSilverLoan(borrower, 500 ether);
        _fundLoan(loanId);

        uint256 outstanding = _fullRepayAmount(loanId);
        uint256 halfPayment = outstanding / 2;

        vm.startPrank(borrower);
        token.approve(address(loanEngine), halfPayment);
        loanEngine.repay(loanId, halfPayment);
        vm.stopPrank();

        ILoanEngine.Loan memory loan = loanEngine.getLoan(loanId);
        assertEq(uint256(loan.status), uint256(ILoanEngine.LoanStatus.Active));
        assertEq(loan.totalRepaid, halfPayment);
        assertEq(loanEngine.getOutstandingAmount(loanId), outstanding - halfPayment);
    }

    // ═══════════════════════════════════════════════════════════════
    //  EARLY REPAYMENT (no penalty)
    // ═══════════════════════════════════════════════════════════════

    function test_earlyRepayment() public {
        uint256 loanId = _requestSilverLoan(borrower, 500 ether);
        _fundLoan(loanId);

        // Repay immediately (same block as funding)
        uint256 outstanding = _fullRepayAmount(loanId);
        vm.startPrank(borrower);
        token.approve(address(loanEngine), outstanding);
        loanEngine.repay(loanId, outstanding);
        vm.stopPrank();

        ILoanEngine.Loan memory loan = loanEngine.getLoan(loanId);
        assertEq(uint256(loan.status), uint256(ILoanEngine.LoanStatus.Repaid));
    }

    // ═══════════════════════════════════════════════════════════════
    //  REPAY ON BEHALF (third party)
    // ═══════════════════════════════════════════════════════════════

    function test_repayOnBehalf() public {
        uint256 loanId = _requestSilverLoan(borrower, 500 ether);
        _fundLoan(loanId);

        uint256 outstanding = _fullRepayAmount(loanId);
        vm.startPrank(thirdParty);
        token.approve(address(loanEngine), outstanding);
        loanEngine.repay(loanId, outstanding);
        vm.stopPrank();

        ILoanEngine.Loan memory loan = loanEngine.getLoan(loanId);
        assertEq(uint256(loan.status), uint256(ILoanEngine.LoanStatus.Repaid));
    }

    // ═══════════════════════════════════════════════════════════════
    //  OVERPAYMENT CAPPING
    // ═══════════════════════════════════════════════════════════════

    function test_overpaymentCapped() public {
        uint256 loanId = _requestSilverLoan(borrower, 500 ether);
        _fundLoan(loanId);

        uint256 outstanding = _fullRepayAmount(loanId);
        uint256 overpay = outstanding + 1000 ether;

        uint256 balBefore = token.balanceOf(borrower);
        vm.startPrank(borrower);
        token.approve(address(loanEngine), overpay);
        loanEngine.repay(loanId, overpay);
        vm.stopPrank();

        ILoanEngine.Loan memory loan = loanEngine.getLoan(loanId);
        // Should only have taken `outstanding`, not the full `overpay`
        // Collateral (250 ether) is also returned on full repayment
        assertEq(token.balanceOf(borrower), balBefore - outstanding + loan.collateralAmount);
        assertEq(uint256(loan.status), uint256(ILoanEngine.LoanStatus.Repaid));
    }

    // ═══════════════════════════════════════════════════════════════
    //  SELF-LENDING PREVENTION
    // ═══════════════════════════════════════════════════════════════

    function test_selfLendingPrevented() public {
        uint256 loanId = _requestSilverLoan(borrower, 500 ether);

        vm.startPrank(borrower);
        token.approve(address(loanEngine), 500 ether);
        vm.expectRevert("LoanEngine: self-lending");
        loanEngine.fundLoan(loanId);
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════
    //  REQUEST EXPIRY
    // ═══════════════════════════════════════════════════════════════

    function test_requestExpiry() public {
        uint256 loanId = _requestSilverLoan(borrower, 500 ether);

        // Warp past 7 days
        vm.warp(block.timestamp + 7 days + 1);

        vm.startPrank(lender);
        token.approve(address(loanEngine), 500 ether);
        vm.expectRevert("LoanEngine: request expired");
        loanEngine.fundLoan(loanId);
        vm.stopPrank();
    }

    function test_cleanupExpiredRequest() public {
        uint256 loanId = _requestSilverLoan(borrower, 400 ether);
        uint256 balBefore = token.balanceOf(borrower);

        vm.warp(block.timestamp + 7 days + 1);

        loanEngine.cleanupExpiredRequest(loanId);

        ILoanEngine.Loan memory loan = loanEngine.getLoan(loanId);
        assertEq(uint256(loan.status), uint256(ILoanEngine.LoanStatus.Cancelled));
        // Collateral returned
        assertEq(token.balanceOf(borrower), balBefore + 200 ether);
    }

    function test_cannotCleanupBeforeExpiry() public {
        uint256 loanId = _requestSilverLoan(borrower, 400 ether);

        vm.expectRevert("LoanEngine: not expired");
        loanEngine.cleanupExpiredRequest(loanId);
    }

    // ═══════════════════════════════════════════════════════════════
    //  BANNED BORROWER
    // ═══════════════════════════════════════════════════════════════

    function test_bannedBorrowerRejected() public {
        _makeSilver(borrower);
        sybilGuard.setBanned(borrower, true);

        vm.startPrank(borrower);
        token.approve(address(loanEngine), 1000 ether);
        vm.expectRevert("LoanEngine: borrower banned");
        loanEngine.requestLoan(100 ether, ILoanEngine.LoanTerm.ThirtyDays);
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════
    //  RESTRICTED BORROWER
    // ═══════════════════════════════════════════════════════════════

    function test_restrictedBorrowerRejected() public {
        // Need enough rep to survive 2 dispute losses (-400 points) and still be Silver
        // 500 base + 9*100 = 1400 → after -400 = 1000 = Silver threshold (still eligible for 2nd loan)
        _buildReputation(borrower, 9);
        vm.warp(block.timestamp + 7 days); // V-006: SILVER_MIN_TENURE
        _stakeBorrower(borrower);

        for (uint256 i = 0; i < 2; i++) {
            // Re-stake if liquidation slashed below MIN_BORROWER_STAKE
            uint256 currentStake = staking.getStake(borrower);
            if (currentStake < 1_000 ether) {
                uint256 needed = 1_000 ether - currentStake;
                vm.startPrank(borrower);
                token.approve(address(staking), needed);
                staking.stake(needed);
                vm.stopPrank();
            }

            vm.startPrank(borrower);
            token.approve(address(loanEngine), 250 ether);
            uint256 lid = loanEngine.requestLoan(500 ether, ILoanEngine.LoanTerm.SevenDays);
            vm.stopPrank();

            _fundLoan(lid);

            ILoanEngine.Loan memory l = loanEngine.getLoan(lid);
            vm.warp(l.dueDate + 48 hours + 1);
            loanEngine.liquidate(lid);
        }

        // Now restricted
        ILoanEngine.BorrowerProfile memory profile = loanEngine.getBorrowerProfile(borrower);
        assertTrue(profile.restricted);

        // Should be rejected even with sufficient stake
        _stakeBorrower(borrower);
        vm.startPrank(borrower);
        token.approve(address(loanEngine), 1000 ether);
        vm.expectRevert("LoanEngine: borrower restricted");
        loanEngine.requestLoan(100 ether, ILoanEngine.LoanTerm.ThirtyDays);
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════
    //  MAX ACTIVE LOANS
    // ═══════════════════════════════════════════════════════════════

    function test_maxActiveLoans() public {
        _makeSilver(borrower);
        _stakeBorrower(borrower);

        // Create 3 loans
        for (uint256 i = 0; i < 3; i++) {
            vm.startPrank(borrower);
            token.approve(address(loanEngine), 50 ether); // collateral for 100 ether
            loanEngine.requestLoan(100 ether, ILoanEngine.LoanTerm.ThirtyDays);
            vm.stopPrank();
        }

        // 4th should fail
        vm.startPrank(borrower);
        token.approve(address(loanEngine), 50 ether);
        vm.expectRevert("LoanEngine: max active loans");
        loanEngine.requestLoan(100 ether, ILoanEngine.LoanTerm.ThirtyDays);
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════
    //  RESTRICTION AFTER 2 DEFAULTS
    // ═══════════════════════════════════════════════════════════════

    function test_restrictionAfter2Defaults() public {
        // Need enough rep to survive 2 dispute losses (-400 points)
        _buildReputation(borrower, 9); // 500 + 900 = 1400
        vm.warp(block.timestamp + 7 days); // V-006: SILVER_MIN_TENURE
        _stakeBorrower(borrower);

        // First default
        vm.startPrank(borrower);
        token.approve(address(loanEngine), 250 ether);
        uint256 lid1 = loanEngine.requestLoan(500 ether, ILoanEngine.LoanTerm.SevenDays);
        vm.stopPrank();
        _fundLoan(lid1);
        ILoanEngine.Loan memory l1 = loanEngine.getLoan(lid1);
        vm.warp(l1.dueDate + 48 hours + 1);
        loanEngine.liquidate(lid1);

        ILoanEngine.BorrowerProfile memory p1 = loanEngine.getBorrowerProfile(borrower);
        assertEq(p1.defaults, 1);
        assertFalse(p1.restricted);

        // Re-stake after liquidation slashed stake below MIN_BORROWER_STAKE
        uint256 currentStake = staking.getStake(borrower);
        if (currentStake < 1_000 ether) {
            uint256 needed = 1_000 ether - currentStake;
            vm.startPrank(borrower);
            token.approve(address(staking), needed);
            staking.stake(needed);
            vm.stopPrank();
        }

        // Second default (score now 1400 - 200 = 1200, still Silver)
        vm.startPrank(borrower);
        token.approve(address(loanEngine), 250 ether);
        uint256 lid2 = loanEngine.requestLoan(500 ether, ILoanEngine.LoanTerm.SevenDays);
        vm.stopPrank();
        _fundLoan(lid2);
        ILoanEngine.Loan memory l2 = loanEngine.getLoan(lid2);
        vm.warp(l2.dueDate + 48 hours + 1);

        vm.expectEmit(true, false, false, true);
        emit BorrowerRestricted(borrower, 2);
        loanEngine.liquidate(lid2);

        ILoanEngine.BorrowerProfile memory p2 = loanEngine.getBorrowerProfile(borrower);
        assertEq(p2.defaults, 2);
        assertTrue(p2.restricted);
    }

    // ═══════════════════════════════════════════════════════════════
    //  ADMIN LIFT RESTRICTION
    // ═══════════════════════════════════════════════════════════════

    function test_liftRestriction() public {
        // Need enough rep to survive 2 dispute losses
        _buildReputation(borrower, 9);
        vm.warp(block.timestamp + 7 days); // V-006: SILVER_MIN_TENURE
        _stakeBorrower(borrower);
        for (uint256 i = 0; i < 2; i++) {
            // Re-stake if liquidation slashed below MIN_BORROWER_STAKE
            uint256 currentStake = staking.getStake(borrower);
            if (currentStake < 1_000 ether) {
                uint256 needed = 1_000 ether - currentStake;
                vm.startPrank(borrower);
                token.approve(address(staking), needed);
                staking.stake(needed);
                vm.stopPrank();
            }

            vm.startPrank(borrower);
            token.approve(address(loanEngine), 250 ether);
            uint256 lid = loanEngine.requestLoan(500 ether, ILoanEngine.LoanTerm.SevenDays);
            vm.stopPrank();
            _fundLoan(lid);
            ILoanEngine.Loan memory l = loanEngine.getLoan(lid);
            vm.warp(l.dueDate + 48 hours + 1);
            loanEngine.liquidate(lid);
        }

        assertTrue(loanEngine.getBorrowerProfile(borrower).restricted);

        // Admin lifts restriction
        vm.prank(admin);
        loanEngine.liftRestriction(borrower);

        assertFalse(loanEngine.getBorrowerProfile(borrower).restricted);
    }

    function test_liftRestrictionOnlyAdmin() public {
        vm.prank(borrower);
        vm.expectRevert();
        loanEngine.liftRestriction(borrower);
    }

    // ═══════════════════════════════════════════════════════════════
    //  PAUSE / UNPAUSE
    // ═══════════════════════════════════════════════════════════════

    function test_pauseBlocksRequests() public {
        _makeSilver(borrower);

        vm.prank(admin);
        loanEngine.pause();

        vm.startPrank(borrower);
        token.approve(address(loanEngine), 250 ether);
        vm.expectRevert("EnforcedPause()");
        loanEngine.requestLoan(100 ether, ILoanEngine.LoanTerm.ThirtyDays);
        vm.stopPrank();
    }

    function test_unpauseResumesRequests() public {
        _makeSilver(borrower);
        _stakeBorrower(borrower);

        vm.prank(admin);
        loanEngine.pause();

        vm.prank(admin);
        loanEngine.unpause();

        vm.startPrank(borrower);
        token.approve(address(loanEngine), 250 ether);
        loanEngine.requestLoan(100 ether, ILoanEngine.LoanTerm.ThirtyDays);
        vm.stopPrank();
    }

    function test_pauseBlocksFunding() public {
        uint256 loanId = _requestSilverLoan(borrower, 500 ether);

        vm.prank(admin);
        loanEngine.pause();

        vm.startPrank(lender);
        token.approve(address(loanEngine), 500 ether);
        vm.expectRevert("EnforcedPause()");
        loanEngine.fundLoan(loanId);
        vm.stopPrank();
    }

    function test_pauseBlocksRepayment() public {
        uint256 loanId = _requestSilverLoan(borrower, 500 ether);
        _fundLoan(loanId);

        vm.prank(admin);
        loanEngine.pause();

        vm.startPrank(borrower);
        token.approve(address(loanEngine), 1000 ether);
        vm.expectRevert("EnforcedPause()");
        loanEngine.repay(loanId, 100 ether);
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════
    //  PLATINUM DEFAULT WITH STAKE SLASH
    // ═══════════════════════════════════════════════════════════════

    function test_platinumDefaultWithStakeSlash() public {
        _makePlatinum(borrower);

        // V-005: Borrower stakes >= principal
        _stakeBorrowerAmount(borrower, 10_000 ether);

        // Request loan — 25% collateral for Platinum
        uint256 principal = 5_000 ether;
        uint256 collateral = (principal * 2500) / 10000; // 1250 ether
        vm.startPrank(borrower);
        token.approve(address(loanEngine), collateral);
        uint256 loanId = loanEngine.requestLoan(principal, ILoanEngine.LoanTerm.SevenDays);
        vm.stopPrank();

        // Fund it
        _fundLoan(loanId);

        // Default
        ILoanEngine.Loan memory loan = loanEngine.getLoan(loanId);
        vm.warp(loan.dueDate + 48 hours + 1);

        uint256 treasuryBefore = token.balanceOf(treasury);
        uint256 lenderBefore = token.balanceOf(lender);

        loanEngine.liquidate(loanId);

        // Stake slashed = min(principal, staked) = min(5000, 10000) = 5000
        assertEq(staking.getStake(borrower), 5_000 ether); // 10k - 5k slashed

        // totalRecovered = collateral(1250) + stakeSlash(5000) = 6250
        // Lender entitlement = principal + interest (capped), surplus goes back to borrower
        uint256 fee = loan.protocolFee;
        assertEq(token.balanceOf(treasury), treasuryBefore + fee);

        // Lender gets min(totalRecovered - fee, principal + interest)
        uint256 lenderEntitlement = principal + loan.interestAmount;
        uint256 totalRecoveredAfterFee = collateral + 5_000 ether - fee;
        uint256 expectedToLender = totalRecoveredAfterFee > lenderEntitlement ? lenderEntitlement : totalRecoveredAfterFee;
        assertEq(token.balanceOf(lender), lenderBefore + expectedToLender);
    }

    // ═══════════════════════════════════════════════════════════════
    //  LIQUIDATION FUND DISTRIBUTION MATH
    // ═══════════════════════════════════════════════════════════════

    function test_liquidationDistribution() public {
        // Silver loan: 500 LOB principal, 250 LOB collateral, 1000 LOB staked
        uint256 loanId = _requestSilverLoan(borrower, 500 ether);
        _fundLoan(loanId);

        ILoanEngine.Loan memory loan = loanEngine.getLoan(loanId);
        vm.warp(loan.dueDate + 48 hours + 1);

        uint256 treasuryBefore = token.balanceOf(treasury);
        uint256 lenderBefore = token.balanceOf(lender);

        loanEngine.liquidate(loanId);

        // Collateral = 250, stake slash = min(500 principal, 1000 staked) = 500
        uint256 totalRecovered = 250 ether + 500 ether;
        uint256 fee = loan.protocolFee;
        uint256 lenderEntitlement = loan.principal + loan.interestAmount;
        uint256 toLender = totalRecovered - fee;
        if (toLender > lenderEntitlement) {
            toLender = lenderEntitlement;
        }

        assertEq(token.balanceOf(treasury), treasuryBefore + fee);
        assertEq(token.balanceOf(lender), lenderBefore + toLender);
    }

    // ═══════════════════════════════════════════════════════════════
    //  PARTIAL REPAYMENT + COLLATERAL ON LIQUIDATION
    // ═══════════════════════════════════════════════════════════════

    function test_partialRepaymentThenLiquidation() public {
        uint256 loanId = _requestSilverLoan(borrower, 500 ether);
        _fundLoan(loanId);

        // Partial repayment: 100 LOB
        vm.startPrank(borrower);
        token.approve(address(loanEngine), 100 ether);
        loanEngine.repay(loanId, 100 ether);
        vm.stopPrank();

        ILoanEngine.Loan memory loan = loanEngine.getLoan(loanId);
        vm.warp(loan.dueDate + 48 hours + 1);

        uint256 treasuryBefore = token.balanceOf(treasury);
        uint256 lenderBefore = token.balanceOf(lender);

        loanEngine.liquidate(loanId);

        // totalRecovered = collateral (250) + totalRepaid (100) + stakeSlash (min(500, 1000) = 500) = 850
        uint256 totalRecovered = 250 ether + 100 ether + 500 ether;
        uint256 fee = loan.protocolFee;
        uint256 lenderEntitlement = loan.principal + loan.interestAmount;
        uint256 toLender = totalRecovered - fee;
        if (toLender > lenderEntitlement) {
            toLender = lenderEntitlement;
        }

        assertEq(token.balanceOf(treasury), treasuryBefore + fee);
        assertEq(token.balanceOf(lender), lenderBefore + toLender);
    }

    // ═══════════════════════════════════════════════════════════════
    //  CANNOT LIQUIDATE BEFORE GRACE PERIOD
    // ═══════════════════════════════════════════════════════════════

    function test_cannotLiquidateBeforeGracePeriod() public {
        uint256 loanId = _requestSilverLoan(borrower, 500 ether);
        _fundLoan(loanId);

        ILoanEngine.Loan memory loan = loanEngine.getLoan(loanId);
        // Warp to due date but within grace period
        vm.warp(loan.dueDate + 24 hours);

        vm.expectRevert("LoanEngine: grace period active");
        loanEngine.liquidate(loanId);
    }

    // ═══════════════════════════════════════════════════════════════
    //  VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════

    function test_getMaxBorrow() public {
        _makeSilver(borrower);
        assertEq(loanEngine.getMaxBorrow(borrower), 500 ether);

        _makeGold(lender);
        assertEq(loanEngine.getMaxBorrow(lender), 2500 ether);
    }

    function test_getInterestRate() public {
        _makeSilver(borrower);
        assertEq(loanEngine.getInterestRate(borrower), 800);

        _makeGold(lender);
        assertEq(loanEngine.getInterestRate(lender), 500);
    }

    function test_getCollateralRequired() public {
        _makeSilver(borrower);
        assertEq(loanEngine.getCollateralRequired(1000 ether, borrower), 500 ether);

        _makeGold(lender);
        assertEq(loanEngine.getCollateralRequired(1000 ether, lender), 400 ether);
    }

    function test_getTermDuration() public view {
        assertEq(loanEngine.getTermDuration(ILoanEngine.LoanTerm.SevenDays), 7 days);
        assertEq(loanEngine.getTermDuration(ILoanEngine.LoanTerm.FourteenDays), 14 days);
        assertEq(loanEngine.getTermDuration(ILoanEngine.LoanTerm.ThirtyDays), 30 days);
        assertEq(loanEngine.getTermDuration(ILoanEngine.LoanTerm.NinetyDays), 90 days);
    }

    function test_getActiveLoanIds() public {
        _makeSilver(borrower);
        _stakeBorrower(borrower);

        vm.startPrank(borrower);
        token.approve(address(loanEngine), 300 ether); // 3 loans * 50 ether collateral each
        uint256 id1 = loanEngine.requestLoan(100 ether, ILoanEngine.LoanTerm.SevenDays);
        uint256 id2 = loanEngine.requestLoan(100 ether, ILoanEngine.LoanTerm.SevenDays);
        uint256 id3 = loanEngine.requestLoan(100 ether, ILoanEngine.LoanTerm.SevenDays);
        vm.stopPrank();

        uint256[] memory ids = loanEngine.getActiveLoanIds(borrower);
        assertEq(ids.length, 3);
        assertEq(ids[0], id1);
        assertEq(ids[1], id2);
        assertEq(ids[2], id3);
    }

    // ═══════════════════════════════════════════════════════════════
    //  CANCEL — ONLY BORROWER
    // ═══════════════════════════════════════════════════════════════

    function test_onlyBorrowerCanCancel() public {
        uint256 loanId = _requestSilverLoan(borrower, 500 ether);

        vm.prank(lender);
        vm.expectRevert("LoanEngine: not borrower");
        loanEngine.cancelLoan(loanId);
    }

    // ═══════════════════════════════════════════════════════════════
    //  CANNOT FUND ALREADY ACTIVE
    // ═══════════════════════════════════════════════════════════════

    function test_cannotFundAlreadyActive() public {
        uint256 loanId = _requestSilverLoan(borrower, 500 ether);
        _fundLoan(loanId);

        vm.startPrank(thirdParty);
        token.approve(address(loanEngine), 500 ether);
        vm.expectRevert("LoanEngine: not requested");
        loanEngine.fundLoan(loanId);
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════
    //  TOTAL BORROWED TRACKING
    // ═══════════════════════════════════════════════════════════════

    function test_totalBorrowedTracked() public {
        uint256 loanId = _requestSilverLoan(borrower, 500 ether);
        _fundLoan(loanId);

        // Repay in full
        uint256 outstanding = _fullRepayAmount(loanId);
        vm.startPrank(borrower);
        token.approve(address(loanEngine), outstanding);
        loanEngine.repay(loanId, outstanding);
        vm.stopPrank();

        ILoanEngine.BorrowerProfile memory profile = loanEngine.getBorrowerProfile(borrower);
        assertEq(profile.totalRepaid, 500 ether);
    }

    // ═══════════════════════════════════════════════════════════════
    //  EVENTS
    // ═══════════════════════════════════════════════════════════════

    function test_requestLoanEmitsEvent() public {
        _makeSilver(borrower);
        _stakeBorrower(borrower);
        vm.startPrank(borrower);
        token.approve(address(loanEngine), 250 ether);

        vm.expectEmit(true, true, false, true);
        emit LoanRequested(1, borrower, 500 ether, ILoanEngine.LoanTerm.ThirtyDays);
        loanEngine.requestLoan(500 ether, ILoanEngine.LoanTerm.ThirtyDays);
        vm.stopPrank();
    }

    function test_fundLoanEmitsEvent() public {
        uint256 loanId = _requestSilverLoan(borrower, 500 ether);

        vm.startPrank(lender);
        token.approve(address(loanEngine), 500 ether);

        vm.expectEmit(true, true, false, false);
        emit LoanFunded(loanId, lender);
        loanEngine.fundLoan(loanId);
        vm.stopPrank();
    }

    function test_cancelEmitsEvent() public {
        uint256 loanId = _requestSilverLoan(borrower, 500 ether);

        vm.expectEmit(true, false, false, false);
        emit LoanCancelled(loanId);

        vm.prank(borrower);
        loanEngine.cancelLoan(loanId);
    }

    // ═══════════════════════════════════════════════════════════════
    //  V-005: STAKE >= PRINCIPAL REQUIREMENT
    // ═══════════════════════════════════════════════════════════════

    function test_revertInsufficientStakeForLargeLoan() public {
        _makePlatinum(borrower);
        _stakeBorrower(borrower); // only 1000 LOB staked

        // Try to borrow 5000 LOB — stake (1000) < principal (5000)
        uint256 principal = 5_000 ether;
        uint256 collateral = (principal * 2500) / 10000;
        vm.startPrank(borrower);
        token.approve(address(loanEngine), collateral);
        vm.expectRevert("LoanEngine: insufficient stake");
        loanEngine.requestLoan(principal, ILoanEngine.LoanTerm.ThirtyDays);
        vm.stopPrank();
    }

    function test_stakeEqualsPrincipalSucceeds() public {
        _makePlatinum(borrower);
        _stakeBorrowerAmount(borrower, 5_000 ether); // exact match

        uint256 principal = 5_000 ether;
        uint256 collateral = (principal * 2500) / 10000;
        vm.startPrank(borrower);
        token.approve(address(loanEngine), collateral);
        uint256 loanId = loanEngine.requestLoan(principal, ILoanEngine.LoanTerm.ThirtyDays);
        vm.stopPrank();

        ILoanEngine.Loan memory loan = loanEngine.getLoan(loanId);
        assertEq(loan.principal, principal);
    }

    // ═══════════════════════════════════════════════════════════════
    //  V-001: STAKE LOCKING — BORROWER CANNOT EVADE SLASH
    // ═══════════════════════════════════════════════════════════════

    function test_fundLoanLocksStake() public {
        uint256 loanId = _requestSilverLoan(borrower, 500 ether);
        assertEq(staking.getLockedStake(borrower), 0);

        _fundLoan(loanId);

        // After funding, principal worth of stake should be locked
        assertEq(staking.getLockedStake(borrower), 500 ether);
        assertEq(staking.getUnlockedStake(borrower), 500 ether); // 1000 staked - 500 locked
    }

    function test_repayUnlocksStake() public {
        uint256 loanId = _requestSilverLoan(borrower, 500 ether);
        _fundLoan(loanId);
        assertEq(staking.getLockedStake(borrower), 500 ether);

        // Full repay
        uint256 outstanding = _fullRepayAmount(loanId);
        vm.startPrank(borrower);
        token.approve(address(loanEngine), outstanding);
        loanEngine.repay(loanId, outstanding);
        vm.stopPrank();

        // Stake unlocked after full repayment
        assertEq(staking.getLockedStake(borrower), 0);
    }

    function test_liquidateUnlocksBeforeSlash() public {
        uint256 loanId = _requestSilverLoan(borrower, 500 ether);
        _fundLoan(loanId);
        assertEq(staking.getLockedStake(borrower), 500 ether);

        // Borrower cannot unstake locked amount
        vm.prank(borrower);
        vm.expectRevert("StakingManager: stake locked");
        staking.requestUnstake(600 ether);

        // Default and liquidate
        ILoanEngine.Loan memory loan = loanEngine.getLoan(loanId);
        vm.warp(loan.dueDate + 48 hours + 1);
        loanEngine.liquidate(loanId);

        // After liquidation: unlocked then slashed
        assertEq(staking.getLockedStake(borrower), 0);
        assertEq(staking.getStake(borrower), 500 ether); // 1000 - 500 slashed
    }
}
