// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/ILoanEngine.sol";
import "./interfaces/IReputationSystem.sol";
import "./interfaces/IStakingManager.sol";
import "./interfaces/ISybilGuard.sol";

contract LoanEngine is ILoanEngine, Initializable, UUPSUpgradeable, OwnableUpgradeable, AccessControlUpgradeable, ReentrancyGuardUpgradeable, PausableUpgradeable {
    using SafeERC20 for IERC20;

    // ── Tier borrowing parameters ────────────────────────────────────
    // Max borrow amounts (in LOB wei)
    uint256 public constant SILVER_MAX_BORROW = 500 ether;
    uint256 public constant GOLD_MAX_BORROW = 2_500 ether;
    uint256 public constant PLATINUM_MAX_BORROW = 10_000 ether;

    // Annual interest rates (BPS)
    uint256 public constant SILVER_INTEREST_BPS = 800;   // 8%
    uint256 public constant GOLD_INTEREST_BPS = 500;     // 5%
    uint256 public constant PLATINUM_INTEREST_BPS = 300;  // 3%

    // Collateral requirements (BPS of principal)
    uint256 public constant SILVER_COLLATERAL_BPS = 5000;   // 50%
    uint256 public constant GOLD_COLLATERAL_BPS = 4000;     // 40%
    uint256 public constant PLATINUM_COLLATERAL_BPS = 2500;  // 25% minimum floor

    // ── Anti-farming ──────────────────────────────────────────────────
    uint256 public constant MIN_BORROWER_STAKE = 1_000 ether; // must stake 1k LOB to borrow

    // ── Protocol parameters ──────────────────────────────────────────
    uint256 public constant PROTOCOL_FEE_BPS = 50;       // 0.5%
    uint256 public constant GRACE_PERIOD = 48 hours;
    uint256 public constant REQUEST_EXPIRY = 7 days;
    uint256 public constant MAX_ACTIVE_LOANS = 3;
    uint256 public constant DEFAULTS_BEFORE_RESTRICTION = 2;
    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant DAYS_PER_YEAR = 365;

    // ── Immutables (now regular state variables for upgradeability) ─────
    IERC20 public lobToken;
    IReputationSystem public reputationSystem;
    IStakingManager public stakingManager;
    ISybilGuard public sybilGuard;
    address public treasury;

    // ── State ────────────────────────────────────────────────────────
    uint256 private _nextLoanId = 1;
    mapping(uint256 => Loan) private _loans;
    mapping(address => BorrowerProfile) private _profiles;
    mapping(address => uint256[]) private _activeLoanIds;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _lobToken,
        address _reputationSystem,
        address _stakingManager,
        address _sybilGuard,
        address _treasury,
        address _owner
    ) public virtual initializer {
        require(_lobToken != address(0), "LoanEngine: zero lobToken");
        require(_reputationSystem != address(0), "LoanEngine: zero reputation");
        require(_stakingManager != address(0), "LoanEngine: zero staking");
        require(_sybilGuard != address(0), "LoanEngine: zero sybilGuard");
        require(_treasury != address(0), "LoanEngine: zero treasury");

        __Ownable_init(_owner);
        __UUPSUpgradeable_init();
        __AccessControl_init();
        __ReentrancyGuard_init();
        __Pausable_init();

        lobToken = IERC20(_lobToken);
        reputationSystem = IReputationSystem(_reputationSystem);
        stakingManager = IStakingManager(_stakingManager);
        sybilGuard = ISybilGuard(_sybilGuard);
        treasury = _treasury;

        _grantRole(DEFAULT_ADMIN_ROLE, _owner);

        _nextLoanId = 1;
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // ══════════════════════════════════════════════════════════════════
    //  CORE FUNCTIONS
    // ══════════════════════════════════════════════════════════════════

    function requestLoan(
        uint256 principal,
        LoanTerm term
    ) external nonReentrant whenNotPaused returns (uint256 loanId) {
        require(principal > 0, "LoanEngine: zero principal");
        require(!sybilGuard.checkBanned(msg.sender), "LoanEngine: borrower banned");

        BorrowerProfile storage profile = _profiles[msg.sender];
        require(!profile.restricted, "LoanEngine: borrower restricted");
        require(profile.activeLoans < MAX_ACTIVE_LOANS, "LoanEngine: max active loans");

        // Check reputation tier
        (, IReputationSystem.ReputationTier tier) = reputationSystem.getScore(msg.sender);
        require(tier >= IReputationSystem.ReputationTier.Silver, "LoanEngine: insufficient reputation");

        // V-005: Require stake >= max(MIN_BORROWER_STAKE, principal) to prevent
        // profitable deliberate defaults at low-collateral tiers
        uint256 requiredStake = principal > MIN_BORROWER_STAKE ? principal : MIN_BORROWER_STAKE;
        require(stakingManager.getStake(msg.sender) >= requiredStake, "LoanEngine: insufficient stake");

        // Check principal within tier max
        uint256 maxBorrow = _maxBorrowForTier(tier);
        require(principal <= maxBorrow, "LoanEngine: exceeds max borrow");

        // Calculate interest (simple, prorated by term)
        uint256 annualRate = _interestRateForTier(tier);
        uint256 termDuration = getTermDuration(term);
        uint256 interestAmount = (principal * annualRate * termDuration) / (BPS_DENOMINATOR * DAYS_PER_YEAR * 1 days);

        // Protocol fee on principal
        uint256 protocolFee = (principal * PROTOCOL_FEE_BPS) / BPS_DENOMINATOR;

        // Collateral
        uint256 collateralBps = _collateralBpsForTier(tier);
        uint256 collateralAmount = (principal * collateralBps) / BPS_DENOMINATOR;

        // Transfer collateral from borrower
        if (collateralAmount > 0) {
            lobToken.safeTransferFrom(msg.sender, address(this), collateralAmount);
        }

        loanId = _nextLoanId++;

        _loans[loanId] = Loan({
            id: loanId,
            borrower: msg.sender,
            lender: address(0),
            principal: principal,
            interestAmount: interestAmount,
            protocolFee: protocolFee,
            collateralAmount: collateralAmount,
            totalRepaid: 0,
            status: LoanStatus.Requested,
            term: term,
            requestedAt: block.timestamp,
            fundedAt: 0,
            dueDate: 0
        });

        profile.activeLoans++;
        _activeLoanIds[msg.sender].push(loanId);

        emit LoanRequested(loanId, msg.sender, principal, term);
    }

    function cancelLoan(uint256 loanId) external nonReentrant {
        Loan storage loan = _loans[loanId];
        require(loan.id != 0, "LoanEngine: loan not found");
        require(loan.status == LoanStatus.Requested, "LoanEngine: not requested");
        require(msg.sender == loan.borrower, "LoanEngine: not borrower");

        loan.status = LoanStatus.Cancelled;
        _returnCollateral(loan);
        _removeLoanFromActive(loan.borrower, loanId);

        emit LoanCancelled(loanId);
    }

    function fundLoan(uint256 loanId) external nonReentrant whenNotPaused {
        Loan storage loan = _loans[loanId];
        require(loan.id != 0, "LoanEngine: loan not found");
        require(loan.status == LoanStatus.Requested, "LoanEngine: not requested");
        require(msg.sender != loan.borrower, "LoanEngine: self-lending");
        require(block.timestamp <= loan.requestedAt + REQUEST_EXPIRY, "LoanEngine: request expired");

        loan.lender = msg.sender;
        loan.status = LoanStatus.Active;
        loan.fundedAt = block.timestamp;
        loan.dueDate = block.timestamp + getTermDuration(loan.term);

        // Lock borrower's stake to prevent unstake-before-liquidation evasion
        stakingManager.lockStake(loan.borrower, loan.principal);

        // Lender sends principal, forwarded to borrower
        lobToken.safeTransferFrom(msg.sender, loan.borrower, loan.principal);

        emit LoanFunded(loanId, msg.sender);
    }

    function repay(uint256 loanId, uint256 amount) external nonReentrant whenNotPaused {
        Loan storage loan = _loans[loanId];
        require(loan.id != 0, "LoanEngine: loan not found");
        require(loan.status == LoanStatus.Active, "LoanEngine: not active");
        require(amount > 0, "LoanEngine: zero amount");

        uint256 outstanding = _outstandingAmount(loan);
        // Cap overpayment
        if (amount > outstanding) {
            amount = outstanding;
        }

        lobToken.safeTransferFrom(msg.sender, address(this), amount);
        loan.totalRepaid += amount;

        uint256 remaining = _outstandingAmount(loan);
        emit RepaymentMade(loanId, amount, remaining);

        if (remaining == 0) {
            loan.status = LoanStatus.Repaid;

            // Unlock borrower's stake
            stakingManager.unlockStake(loan.borrower, loan.principal);

            // Distribute: fee to treasury, remainder to lender
            uint256 fee = loan.protocolFee;
            uint256 toLender = loan.principal + loan.interestAmount;

            if (fee > 0) {
                lobToken.safeTransfer(treasury, fee);
            }
            lobToken.safeTransfer(loan.lender, toLender);

            // Return collateral
            _returnCollateral(loan);
            _removeLoanFromActive(loan.borrower, loanId);

            _profiles[loan.borrower].totalRepaid += loan.principal;

            emit LoanRepaid(loanId);
        }
    }

    function liquidate(uint256 loanId) external nonReentrant {
        Loan storage loan = _loans[loanId];
        require(loan.id != 0, "LoanEngine: loan not found");
        require(loan.status == LoanStatus.Active, "LoanEngine: not active");
        require(block.timestamp > loan.dueDate + GRACE_PERIOD, "LoanEngine: grace period active");

        loan.status = LoanStatus.Liquidated;

        // Unlock borrower's stake before slashing (slash handles locked reduction)
        stakingManager.unlockStake(loan.borrower, loan.principal);

        // Slash reputation (-200 via recordDispute)
        reputationSystem.recordDispute(loan.borrower, false);

        emit LoanDefaulted(loanId, loan.borrower);

        // Seize collateral
        uint256 collateralSeized = loan.collateralAmount;

        // Best-effort stake slash for Platinum (0 collateral)
        uint256 stakeSlashed = 0;
        uint256 staked = stakingManager.getStake(loan.borrower);
        if (staked > 0) {
            uint256 slashTarget = loan.principal; // try to recover principal
            if (slashTarget > staked) {
                slashTarget = staked;
            }
            try stakingManager.slash(loan.borrower, slashTarget, address(this)) {
                stakeSlashed = slashTarget;
            } catch {
                // Best-effort — slash may fail if roles changed
            }
        }

        // Total recovered: collateral + any partial repayment held + slashed stake
        // Funds already in contract: collateral + totalRepaid
        // Funds just received: stakeSlashed
        uint256 totalRecovered = collateralSeized + loan.totalRepaid + stakeSlashed;

        // Distribute: fee to treasury, remainder to lender (capped at debt owed)
        uint256 fee = loan.protocolFee;
        uint256 toLender;
        uint256 lenderEntitlement = loan.principal + loan.interestAmount;

        if (totalRecovered <= fee) {
            // Not enough to cover fee — all goes to treasury
            if (totalRecovered > 0) {
                lobToken.safeTransfer(treasury, totalRecovered);
            }
            toLender = 0;
        } else {
            if (fee > 0) {
                lobToken.safeTransfer(treasury, fee);
            }
            toLender = totalRecovered - fee;

            // Cap lender payout to actual debt owed, refund surplus to borrower
            if (toLender > lenderEntitlement) {
                uint256 surplus = toLender - lenderEntitlement;
                toLender = lenderEntitlement;
                lobToken.safeTransfer(loan.borrower, surplus);
            }

            if (toLender > 0) {
                lobToken.safeTransfer(loan.lender, toLender);
            }
        }

        _removeLoanFromActive(loan.borrower, loanId);

        // Track defaults
        BorrowerProfile storage profile = _profiles[loan.borrower];
        profile.defaults++;
        if (profile.defaults >= DEFAULTS_BEFORE_RESTRICTION) {
            profile.restricted = true;
            emit BorrowerRestricted(loan.borrower, profile.defaults);
        }

        emit LoanLiquidated(loanId, collateralSeized, stakeSlashed);
    }

    function cleanupExpiredRequest(uint256 loanId) external nonReentrant {
        Loan storage loan = _loans[loanId];
        require(loan.id != 0, "LoanEngine: loan not found");
        require(loan.status == LoanStatus.Requested, "LoanEngine: not requested");
        require(block.timestamp > loan.requestedAt + REQUEST_EXPIRY, "LoanEngine: not expired");

        loan.status = LoanStatus.Cancelled;
        _returnCollateral(loan);
        _removeLoanFromActive(loan.borrower, loanId);

        emit LoanCancelled(loanId);
    }

    // ══════════════════════════════════════════════════════════════════
    //  ADMIN
    // ══════════════════════════════════════════════════════════════════

    function liftRestriction(address borrower) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_profiles[borrower].restricted, "LoanEngine: not restricted");
        _profiles[borrower].restricted = false;
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // ══════════════════════════════════════════════════════════════════
    //  VIEW FUNCTIONS
    // ══════════════════════════════════════════════════════════════════

    function getLoan(uint256 loanId) external view returns (Loan memory) {
        Loan memory loan = _loans[loanId];
        require(loan.id != 0, "LoanEngine: loan not found");
        return loan;
    }

    function getBorrowerProfile(address borrower) external view returns (BorrowerProfile memory) {
        return _profiles[borrower];
    }

    function getMaxBorrow(address borrower) external view returns (uint256) {
        (, IReputationSystem.ReputationTier tier) = reputationSystem.getScore(borrower);
        return _maxBorrowForTier(tier);
    }

    function getInterestRate(address borrower) external view returns (uint256) {
        (, IReputationSystem.ReputationTier tier) = reputationSystem.getScore(borrower);
        return _interestRateForTier(tier);
    }

    function getCollateralRequired(uint256 principal, address borrower) external view returns (uint256) {
        (, IReputationSystem.ReputationTier tier) = reputationSystem.getScore(borrower);
        uint256 bps = _collateralBpsForTier(tier);
        return (principal * bps) / BPS_DENOMINATOR;
    }

    function getOutstandingAmount(uint256 loanId) external view returns (uint256) {
        Loan storage loan = _loans[loanId];
        require(loan.id != 0, "LoanEngine: loan not found");
        return _outstandingAmount(loan);
    }

    function getTermDuration(LoanTerm term) public pure returns (uint256) {
        if (term == LoanTerm.SevenDays) return 7 days;
        if (term == LoanTerm.FourteenDays) return 14 days;
        if (term == LoanTerm.ThirtyDays) return 30 days;
        if (term == LoanTerm.NinetyDays) return 90 days;
        revert("LoanEngine: invalid term");
    }

    function getActiveLoanIds(address borrower) external view returns (uint256[] memory) {
        return _activeLoanIds[borrower];
    }

    // ══════════════════════════════════════════════════════════════════
    //  INTERNAL
    // ══════════════════════════════════════════════════════════════════

    function _outstandingAmount(Loan storage loan) internal view returns (uint256) {
        uint256 total = loan.principal + loan.interestAmount + loan.protocolFee;
        if (loan.totalRepaid >= total) return 0;
        return total - loan.totalRepaid;
    }

    function _returnCollateral(Loan storage loan) internal {
        if (loan.collateralAmount > 0) {
            lobToken.safeTransfer(loan.borrower, loan.collateralAmount);
        }
    }

    function _removeLoanFromActive(address borrower, uint256 loanId) internal {
        uint256[] storage ids = _activeLoanIds[borrower];
        for (uint256 i = 0; i < ids.length; i++) {
            if (ids[i] == loanId) {
                ids[i] = ids[ids.length - 1];
                ids.pop();
                break;
            }
        }
        _profiles[borrower].activeLoans--;
    }

    function _maxBorrowForTier(IReputationSystem.ReputationTier tier) internal pure returns (uint256) {
        if (tier == IReputationSystem.ReputationTier.Platinum) return PLATINUM_MAX_BORROW;
        if (tier == IReputationSystem.ReputationTier.Gold) return GOLD_MAX_BORROW;
        if (tier == IReputationSystem.ReputationTier.Silver) return SILVER_MAX_BORROW;
        return 0; // Bronze — ineligible
    }

    function _interestRateForTier(IReputationSystem.ReputationTier tier) internal pure returns (uint256) {
        if (tier == IReputationSystem.ReputationTier.Platinum) return PLATINUM_INTEREST_BPS;
        if (tier == IReputationSystem.ReputationTier.Gold) return GOLD_INTEREST_BPS;
        if (tier == IReputationSystem.ReputationTier.Silver) return SILVER_INTEREST_BPS;
        return 0;
    }

    function _collateralBpsForTier(IReputationSystem.ReputationTier tier) internal pure returns (uint256) {
        if (tier == IReputationSystem.ReputationTier.Platinum) return PLATINUM_COLLATERAL_BPS;
        if (tier == IReputationSystem.ReputationTier.Gold) return GOLD_COLLATERAL_BPS;
        if (tier == IReputationSystem.ReputationTier.Silver) return SILVER_COLLATERAL_BPS;
        return 0;
    }
}
