// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {InsurancePool} from "../src/InsurancePool.sol";
import {LOBToken} from "../src/LOBToken.sol";
import {IEscrowEngine} from "../src/interfaces/IEscrowEngine.sol";
import {IDisputeArbitration} from "../src/interfaces/IDisputeArbitration.sol";
import {IInsurancePool} from "../src/interfaces/IInsurancePool.sol";
import {IReputationSystem} from "../src/interfaces/IReputationSystem.sol";
import {IStakingManager} from "../src/interfaces/IStakingManager.sol";
import {IServiceRegistry} from "../src/interfaces/IServiceRegistry.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockEscrowForInsurance {
    uint256 private _nextJobId = 1;
    mapping(uint256 => IEscrowEngine.Job) private _jobs;
    mapping(uint256 => uint256) private _jobDisputeIds;

    function createJob(uint256 listingId, address seller, uint256 amount, address token) external returns (uint256) {
        uint256 jobId = _nextJobId++;
        _jobs[jobId] = IEscrowEngine.Job({
            id: jobId,
            listingId: listingId,
            buyer: msg.sender,
            seller: seller,
            amount: amount,
            token: token,
            fee: 0,
            status: IEscrowEngine.JobStatus.Created,
            createdAt: block.timestamp,
            disputeWindowEnd: 0,
            deliveryMetadataURI: "",
            escrowType: IEscrowEngine.EscrowType.SERVICE_JOB,
            skillId: 0
        });
        require(IERC20(token).transferFrom(msg.sender, address(this), amount), "transfer failed");
        return jobId;
    }

    function getJob(uint256 jobId) external view returns (IEscrowEngine.Job memory) {
        return _jobs[jobId];
    }

    function getJobDisputeId(uint256 jobId) external view returns (uint256) {
        return _jobDisputeIds[jobId];
    }

    function setJobStatus(uint256 jobId, IEscrowEngine.JobStatus status) external {
        _jobs[jobId].status = status;
    }

    function setJobDisputeId(uint256 jobId, uint256 disputeId) external {
        _jobDisputeIds[jobId] = disputeId;
    }

    uint256 public lastConfirmedJobId;
    uint256 public lastDisputedJobId;
    string public lastEvidenceURI;

    function confirmDelivery(uint256 jobId) external {
        require(_jobs[jobId].id != 0, "MockEscrow: job not found");
        require(msg.sender == _jobs[jobId].buyer, "MockEscrow: not buyer");
        _jobs[jobId].status = IEscrowEngine.JobStatus.Confirmed;
        lastConfirmedJobId = jobId;
    }

    function initiateDispute(uint256 jobId, string calldata evidenceURI) external {
        require(_jobs[jobId].id != 0, "MockEscrow: job not found");
        require(msg.sender == _jobs[jobId].buyer, "MockEscrow: not buyer");
        _jobs[jobId].status = IEscrowEngine.JobStatus.Disputed;
        lastDisputedJobId = jobId;
        lastEvidenceURI = evidenceURI;
    }
}

contract MockDisputeForInsurance {
    mapping(uint256 => IDisputeArbitration.Dispute) private _disputes;

    function setDispute(uint256 disputeId, IDisputeArbitration.Ruling ruling) external {
        _disputes[disputeId].ruling = ruling;
    }

    function getDispute(uint256 disputeId) external view returns (IDisputeArbitration.Dispute memory) {
        return _disputes[disputeId];
    }
}

contract MockReputationForInsurance {
    mapping(address => IReputationSystem.ReputationTier) private _tiers;

    function setTier(address user, IReputationSystem.ReputationTier tier) external {
        _tiers[user] = tier;
    }

    function getScore(address user) external view returns (uint256, IReputationSystem.ReputationTier) {
        return (500, _tiers[user]);
    }

    function getReputationData(address) external pure returns (IReputationSystem.ReputationData memory) {
        return IReputationSystem.ReputationData(0, 0, 0, 0, 0, 0);
    }
}

contract MockStakingManagerForInsurance {
    function getTier(address) external pure returns (IStakingManager.Tier) {
        return IStakingManager.Tier.None;
    }

    function getStake(address) external pure returns (uint256) {
        return 0;
    }

    function lockStake(address, uint256) external {}
    function unlockStake(address, uint256) external {}
    function getLockedStake(address) external pure returns (uint256) { return 0; }
    function getUnlockedStake(address) external pure returns (uint256) { return 0; }
}

contract MockSybilGuardForInsurance {
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

contract MockServiceRegistryForInsurance {
    function getListing(uint256) external pure returns (IServiceRegistry.Listing memory) {
        return IServiceRegistry.Listing(0, address(0), IServiceRegistry.ServiceCategory.OTHER, "", "", 0, address(0), 0, "", false, 0);
    }
}

contract InsurancePoolTest is Test {
    event PoolDeposited(address indexed staker, uint256 amount);
    event PoolWithdrawn(address indexed staker, uint256 amount);
    event PremiumCollected(uint256 indexed jobId, address indexed buyer, uint256 premiumAmount);
    event ClaimPaid(uint256 indexed jobId, address indexed buyer, uint256 claimAmount);
    event InsuredJobCreated(uint256 indexed jobId, address indexed buyer, uint256 premiumPaid);
    event RefundClaimed(uint256 indexed jobId, address indexed buyer, uint256 amount);
    event PremiumRateUpdated(uint256 newRateBps);
    event CoverageCapUpdated(uint256 bronze, uint256 silver, uint256 gold, uint256 platinum);

    LOBToken public lobToken;
    InsurancePool public pool;
    MockEscrowForInsurance public escrow;
    MockDisputeForInsurance public dispute;
    MockReputationForInsurance public reputation;
    MockStakingManagerForInsurance public stakingManager;
    MockSybilGuardForInsurance public sybilGuard;
    MockServiceRegistryForInsurance public serviceRegistry;

    address public admin = makeAddr("admin");
    address public distributor = makeAddr("distributor");
    address public governor = makeAddr("governor");
    address public treasury = makeAddr("treasury");
    address public buyer = makeAddr("buyer");
    address public buyer2 = makeAddr("buyer2");
    address public seller = makeAddr("seller");
    address public staker1 = makeAddr("staker1");
    address public staker2 = makeAddr("staker2");

    function setUp() public {
        vm.startPrank(admin);
        lobToken = new LOBToken(distributor);
        escrow = new MockEscrowForInsurance();
        dispute = new MockDisputeForInsurance();
        reputation = new MockReputationForInsurance();
        stakingManager = new MockStakingManagerForInsurance();
        sybilGuard = new MockSybilGuardForInsurance();
        serviceRegistry = new MockServiceRegistryForInsurance();

        pool = new InsurancePool(
            address(lobToken),
            address(escrow),
            address(dispute),
            address(reputation),
            address(stakingManager),
            address(sybilGuard),
            address(serviceRegistry),
            treasury
        );
        pool.grantRole(pool.GOVERNOR_ROLE(), governor);
        vm.stopPrank();

        // Fund participants
        vm.startPrank(distributor);
        require(lobToken.transfer(buyer, 100_000 ether));
        require(lobToken.transfer(buyer2, 100_000 ether));
        require(lobToken.transfer(staker1, 100_000 ether));
        require(lobToken.transfer(staker2, 100_000 ether));
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════
    //  HELPERS
    // ═══════════════════════════════════════════════════════════════

    function _deposit(address staker, uint256 amount) internal {
        vm.startPrank(staker);
        lobToken.approve(address(pool), amount);
        pool.depositToPool(amount);
        vm.stopPrank();
    }

    function _createInsuredJob(uint256 amount) internal returns (uint256) {
        return _createInsuredJobFor(buyer, amount);
    }

    function _createInsuredJobFor(address _buyer, uint256 amount) internal returns (uint256) {
        uint256 premium = (amount * 50) / 10000;
        vm.startPrank(_buyer);
        lobToken.approve(address(pool), amount + premium);
        uint256 jobId = pool.createInsuredJob(1, seller, amount, address(lobToken));
        vm.stopPrank();
        return jobId;
    }

    // ═══════════════════════════════════════════════════════════════
    //  POOL DEPOSIT / WITHDRAW
    // ═══════════════════════════════════════════════════════════════

    function test_depositToPool() public {
        _deposit(staker1, 5000 ether);

        IInsurancePool.PoolStaker memory info = pool.getStakerInfo(staker1);
        assertEq(info.deposited, 5000 ether);
        assertEq(lobToken.balanceOf(address(pool)), 5000 ether);
    }

    function test_withdrawFromPool() public {
        _deposit(staker1, 5000 ether);

        vm.prank(staker1);
        pool.withdrawFromPool(2000 ether);

        IInsurancePool.PoolStaker memory info = pool.getStakerInfo(staker1);
        assertEq(info.deposited, 3000 ether);
    }

    function test_revertWithdrawInsufficient() public {
        _deposit(staker1, 5000 ether);

        vm.prank(staker1);
        vm.expectRevert("InsurancePool: insufficient deposit");
        pool.withdrawFromPool(5001 ether);
    }

    function test_revertDepositZero() public {
        vm.prank(staker1);
        vm.expectRevert("InsurancePool: zero amount");
        pool.depositToPool(0);
    }

    // ═══════════════════════════════════════════════════════════════
    //  CREATE INSURED JOB
    // ═══════════════════════════════════════════════════════════════

    function test_createInsuredJobWithPremium() public {
        _deposit(staker1, 10_000 ether);

        uint256 amount = 1000 ether;
        uint256 premium = (amount * 50) / 10000; // 5 ether

        uint256 jobId = _createInsuredJob(amount);

        assertTrue(pool.isInsuredJob(jobId));
        assertEq(pool.totalPremiumsCollected(), premium);
    }

    function test_revertInsuredJobBannedBuyer() public {
        sybilGuard.setBanned(buyer, true);

        vm.startPrank(buyer);
        lobToken.approve(address(pool), 2000 ether);
        vm.expectRevert("InsurancePool: buyer banned");
        pool.createInsuredJob(1, seller, 1000 ether, address(lobToken));
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════
    //  FILE CLAIM — NET LOSS MODEL
    // ═══════════════════════════════════════════════════════════════

    function test_fileClaimSellerWins() public {
        _deposit(staker1, 10_000 ether);

        // Fund pool with insurance capital (treasury seed)
        vm.prank(distributor);
        require(lobToken.transfer(address(pool), 10_000 ether));

        uint256 jobId = _createInsuredJob(100 ether);

        // SellerWins: no escrow refund → net loss = 100 ether
        escrow.setJobStatus(jobId, IEscrowEngine.JobStatus.Resolved);
        escrow.setJobDisputeId(jobId, 1);
        dispute.setDispute(1, IDisputeArbitration.Ruling.SellerWins);

        uint256 buyerBefore = lobToken.balanceOf(buyer);

        vm.prank(buyer);
        pool.fileClaim(jobId);

        // Buyer gets insurance payout (100 ether, within Bronze cap)
        assertEq(lobToken.balanceOf(buyer), buyerBefore + 100 ether);
    }

    function test_fileClaimDraw() public {
        _deposit(staker1, 10_000 ether);

        // Fund pool with insurance capital (treasury seed)
        vm.prank(distributor);
        require(lobToken.transfer(address(pool), 10_000 ether));

        uint256 jobId = _createInsuredJob(100 ether);

        // Draw: escrow refund = 50 (half, no fee for LOB) → net loss = 50
        escrow.setJobStatus(jobId, IEscrowEngine.JobStatus.Resolved);
        escrow.setJobDisputeId(jobId, 1);
        dispute.setDispute(1, IDisputeArbitration.Ruling.Draw);

        // Simulate escrow partial refund arriving
        vm.prank(distributor);
        require(lobToken.transfer(address(pool), 50 ether));

        uint256 buyerBefore = lobToken.balanceOf(buyer);

        vm.prank(buyer);
        pool.fileClaim(jobId);

        // Insurance covers the gap: 50 ether
        assertEq(lobToken.balanceOf(buyer), buyerBefore + 50 ether);
    }

    function test_revertFileClaimBuyerWins_NoNetLoss() public {
        _deposit(staker1, 10_000 ether);

        uint256 jobId = _createInsuredJob(100 ether);

        // BuyerWins: escrow refund = 100 ether → net loss = 0
        escrow.setJobStatus(jobId, IEscrowEngine.JobStatus.Resolved);
        escrow.setJobDisputeId(jobId, 1);
        dispute.setDispute(1, IDisputeArbitration.Ruling.BuyerWins);

        vm.prank(buyer);
        vm.expectRevert("InsurancePool: no net loss");
        pool.fileClaim(jobId);
    }

    function test_fileClaimCappedByTier() public {
        _deposit(staker1, 50_000 ether);

        // Fund pool with insurance capital (treasury seed)
        vm.prank(distributor);
        require(lobToken.transfer(address(pool), 10_000 ether));

        // Buyer is Bronze (cap = 100e18), SellerWins on 500 ether job → net loss = 500
        uint256 jobId = _createInsuredJob(500 ether);

        escrow.setJobStatus(jobId, IEscrowEngine.JobStatus.Resolved);
        escrow.setJobDisputeId(jobId, 1);
        dispute.setDispute(1, IDisputeArbitration.Ruling.SellerWins);

        uint256 buyerBefore = lobToken.balanceOf(buyer);

        vm.prank(buyer);
        pool.fileClaim(jobId);

        // Capped at 100e18 (Bronze cap)
        assertEq(lobToken.balanceOf(buyer), buyerBefore + 100e18);
    }

    // ═══════════════════════════════════════════════════════════════
    //  REVERT DOUBLE CLAIM
    // ═══════════════════════════════════════════════════════════════

    function test_revertDoubleClaim() public {
        _deposit(staker1, 10_000 ether);

        // Fund pool with insurance capital (treasury seed)
        vm.prank(distributor);
        require(lobToken.transfer(address(pool), 10_000 ether));

        uint256 jobId = _createInsuredJob(100 ether);

        escrow.setJobStatus(jobId, IEscrowEngine.JobStatus.Resolved);
        escrow.setJobDisputeId(jobId, 1);
        dispute.setDispute(1, IDisputeArbitration.Ruling.SellerWins);

        vm.prank(buyer);
        pool.fileClaim(jobId);

        vm.prank(buyer);
        vm.expectRevert("InsurancePool: already claimed");
        pool.fileClaim(jobId);
    }

    // ═══════════════════════════════════════════════════════════════
    //  REVERT UNRESOLVED JOB
    // ═══════════════════════════════════════════════════════════════

    function test_revertClaimUnresolvedJob() public {
        _deposit(staker1, 10_000 ether);

        uint256 jobId = _createInsuredJob(100 ether);

        vm.prank(buyer);
        vm.expectRevert("InsurancePool: not resolved");
        pool.fileClaim(jobId);
    }

    // ═══════════════════════════════════════════════════════════════
    //  COVERAGE CAP BY TIER
    // ═══════════════════════════════════════════════════════════════

    function test_coverageCapBronze() public view {
        assertEq(pool.getCoverageCap(buyer), 100e18);
    }

    function test_coverageCapSilver() public {
        reputation.setTier(buyer, IReputationSystem.ReputationTier.Silver);
        assertEq(pool.getCoverageCap(buyer), 500e18);
    }

    function test_coverageCapGold() public {
        reputation.setTier(buyer, IReputationSystem.ReputationTier.Gold);
        assertEq(pool.getCoverageCap(buyer), 2500e18);
    }

    function test_coverageCapPlatinum() public {
        reputation.setTier(buyer, IReputationSystem.ReputationTier.Platinum);
        assertEq(pool.getCoverageCap(buyer), 10000e18);
    }

    // ═══════════════════════════════════════════════════════════════
    //  POOL REWARDS FROM PREMIUMS
    // ═══════════════════════════════════════════════════════════════

    function test_poolRewardsFromPremiums() public {
        _deposit(staker1, 5000 ether);

        _createInsuredJob(1000 ether);

        uint256 premium = (1000 ether * 50) / 10000; // 5 ether
        uint256 earned = pool.poolEarned(staker1);
        assertEq(earned, premium);
    }

    function test_poolRewardsProportional() public {
        _deposit(staker1, 3000 ether);
        _deposit(staker2, 1000 ether);

        _createInsuredJob(1000 ether);

        uint256 premium = (1000 ether * 50) / 10000; // 5 ether

        uint256 earned1 = pool.poolEarned(staker1);
        uint256 earned2 = pool.poolEarned(staker2);

        assertApproxEqAbs(earned1, (premium * 3) / 4, 1);
        assertApproxEqAbs(earned2, premium / 4, 1);
    }

    // ═══════════════════════════════════════════════════════════════
    //  ADMIN — UPDATE PREMIUM RATE
    // ═══════════════════════════════════════════════════════════════

    function test_updatePremiumRate() public {
        vm.prank(governor);
        pool.updatePremiumRate(100); // 1%

        assertEq(pool.premiumRateBps(), 100);
    }

    function test_revertUpdatePremiumRateTooHigh() public {
        vm.prank(governor);
        vm.expectRevert("InsurancePool: rate too high");
        pool.updatePremiumRate(1001);
    }

    function test_revertUpdatePremiumRateNotGovernor() public {
        vm.prank(buyer);
        vm.expectRevert();
        pool.updatePremiumRate(100);
    }

    // ═══════════════════════════════════════════════════════════════
    //  ADMIN — UPDATE COVERAGE CAPS
    // ═══════════════════════════════════════════════════════════════

    function test_updateCoverageCaps() public {
        vm.prank(governor);
        pool.updateCoverageCaps(200e18, 1000e18, 5000e18, 20000e18);

        assertEq(pool.coverageCapBronze(), 200e18);
        assertEq(pool.coverageCapSilver(), 1000e18);
        assertEq(pool.coverageCapGold(), 5000e18);
        assertEq(pool.coverageCapPlatinum(), 20000e18);
    }

    // ═══════════════════════════════════════════════════════════════
    //  POOL STATS
    // ═══════════════════════════════════════════════════════════════

    function test_getPoolStats() public {
        _deposit(staker1, 5000 ether);
        _createInsuredJob(1000 ether);

        (uint256 totalDeposits, uint256 totalPremiums, uint256 totalClaims, uint256 available) = pool.getPoolStats();

        assertEq(totalDeposits, 5000 ether);
        assertEq(totalPremiums, 5 ether); // 0.5% of 1000
        assertEq(totalClaims, 0);
        // V-002 fix: staker deposits are risk capital, NOT reserved.
        // available = balance - rewards - refundLiabilities - inFlightPrincipal
        // balance = 5005, rewards = 5, refundLiabilities = 0, inFlight = 1000
        // available = 5005 - 5 - 0 - 1000 = 4000
        assertEq(available, 4000 ether);
    }

    // ═══════════════════════════════════════════════════════════════
    //  PAUSE
    // ═══════════════════════════════════════════════════════════════

    function test_pauseBlocksDeposit() public {
        vm.prank(admin);
        pool.pause();

        vm.startPrank(staker1);
        lobToken.approve(address(pool), 1000 ether);
        vm.expectRevert("Pausable: paused");
        pool.depositToPool(1000 ether);
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════
    //  NOT INSURED
    // ═══════════════════════════════════════════════════════════════

    function test_revertClaimNotInsured() public {
        vm.prank(buyer);
        vm.expectRevert("InsurancePool: not insured");
        pool.fileClaim(999);
    }

    // ═══════════════════════════════════════════════════════════════
    //  CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════

    function test_revertZeroLobToken() public {
        vm.expectRevert("InsurancePool: zero lobToken");
        new InsurancePool(address(0), address(escrow), address(dispute), address(reputation), address(stakingManager), address(sybilGuard), address(serviceRegistry), treasury);
    }

    function test_revertZeroEscrowEngine() public {
        vm.expectRevert("InsurancePool: zero escrowEngine");
        new InsurancePool(address(lobToken), address(0), address(dispute), address(reputation), address(stakingManager), address(sybilGuard), address(serviceRegistry), treasury);
    }

    // ═══════════════════════════════════════════════════════════════
    //  PROXY BUYER FUNCTIONS
    // ═══════════════════════════════════════════════════════════════

    function test_confirmInsuredDelivery() public {
        _deposit(staker1, 10_000 ether);
        uint256 jobId = _createInsuredJob(100 ether);

        escrow.setJobStatus(jobId, IEscrowEngine.JobStatus.Delivered);

        vm.prank(buyer);
        pool.confirmInsuredDelivery(jobId);

        assertEq(escrow.lastConfirmedJobId(), jobId);
    }

    function test_initiateInsuredDispute() public {
        _deposit(staker1, 10_000 ether);
        uint256 jobId = _createInsuredJob(100 ether);

        escrow.setJobStatus(jobId, IEscrowEngine.JobStatus.Delivered);

        vm.prank(buyer);
        pool.initiateInsuredDispute(jobId, "ipfs://my-evidence");

        assertEq(escrow.lastDisputedJobId(), jobId);
        assertEq(escrow.lastEvidenceURI(), "ipfs://my-evidence");
    }

    function test_revertConfirmInsuredDelivery_NotInsured() public {
        vm.prank(buyer);
        vm.expectRevert("InsurancePool: not insured");
        pool.confirmInsuredDelivery(999);
    }

    function test_revertConfirmInsuredDelivery_NotOriginalBuyer() public {
        _deposit(staker1, 10_000 ether);
        uint256 jobId = _createInsuredJob(100 ether);

        vm.prank(seller);
        vm.expectRevert("InsurancePool: not original buyer");
        pool.confirmInsuredDelivery(jobId);
    }

    function test_revertInitiateInsuredDispute_NotInsured() public {
        vm.prank(buyer);
        vm.expectRevert("InsurancePool: not insured");
        pool.initiateInsuredDispute(999, "ipfs://evidence");
    }

    function test_revertInitiateInsuredDispute_NotOriginalBuyer() public {
        _deposit(staker1, 10_000 ether);
        uint256 jobId = _createInsuredJob(100 ether);

        vm.prank(seller);
        vm.expectRevert("InsurancePool: not original buyer");
        pool.initiateInsuredDispute(jobId, "ipfs://evidence");
    }

    // ═══════════════════════════════════════════════════════════════
    //  CLAIM REFUND (escrow principal, no caps)
    // ═══════════════════════════════════════════════════════════════

    function test_claimRefundBuyerWins() public {
        _deposit(staker1, 10_000 ether);
        uint256 jobId = _createInsuredJob(100 ether);

        escrow.setJobStatus(jobId, IEscrowEngine.JobStatus.Resolved);
        escrow.setJobDisputeId(jobId, 1);
        dispute.setDispute(1, IDisputeArbitration.Ruling.BuyerWins);

        // Simulate EscrowEngine refund arriving
        vm.prank(distributor);
        require(lobToken.transfer(address(pool), 100 ether));

        uint256 buyerBefore = lobToken.balanceOf(buyer);

        vm.prank(buyer);
        pool.claimRefund(jobId);

        assertEq(lobToken.balanceOf(buyer), buyerBefore + 100 ether);
    }

    function test_claimRefundBuyerWins_AboveCoverageCap() public {
        _deposit(staker1, 10_000 ether);

        uint256 jobId = _createInsuredJob(500 ether);

        escrow.setJobStatus(jobId, IEscrowEngine.JobStatus.Resolved);
        escrow.setJobDisputeId(jobId, 1);
        dispute.setDispute(1, IDisputeArbitration.Ruling.BuyerWins);

        vm.prank(distributor);
        require(lobToken.transfer(address(pool), 500 ether));

        uint256 buyerBefore = lobToken.balanceOf(buyer);

        vm.prank(buyer);
        pool.claimRefund(jobId);

        // Full 500 ether refund, NOT capped
        assertEq(lobToken.balanceOf(buyer), buyerBefore + 500 ether);
    }

    function test_claimRefundDraw() public {
        _deposit(staker1, 10_000 ether);
        uint256 jobId = _createInsuredJob(100 ether);

        escrow.setJobStatus(jobId, IEscrowEngine.JobStatus.Resolved);
        escrow.setJobDisputeId(jobId, 1);
        dispute.setDispute(1, IDisputeArbitration.Ruling.Draw);

        vm.prank(distributor);
        require(lobToken.transfer(address(pool), 50 ether));

        uint256 buyerBefore = lobToken.balanceOf(buyer);

        vm.prank(buyer);
        pool.claimRefund(jobId);

        assertEq(lobToken.balanceOf(buyer), buyerBefore + 50 ether);
    }

    function test_revertClaimRefundSellerWins() public {
        _deposit(staker1, 10_000 ether);
        uint256 jobId = _createInsuredJob(100 ether);

        escrow.setJobStatus(jobId, IEscrowEngine.JobStatus.Resolved);
        escrow.setJobDisputeId(jobId, 1);
        dispute.setDispute(1, IDisputeArbitration.Ruling.SellerWins);

        vm.prank(buyer);
        vm.expectRevert("InsurancePool: no buyer refund");
        pool.claimRefund(jobId);
    }

    function test_revertClaimRefundDoubleClaim() public {
        _deposit(staker1, 10_000 ether);
        uint256 jobId = _createInsuredJob(100 ether);

        escrow.setJobStatus(jobId, IEscrowEngine.JobStatus.Resolved);
        escrow.setJobDisputeId(jobId, 1);
        dispute.setDispute(1, IDisputeArbitration.Ruling.BuyerWins);

        vm.prank(distributor);
        require(lobToken.transfer(address(pool), 100 ether));

        vm.prank(buyer);
        pool.claimRefund(jobId);

        vm.prank(buyer);
        vm.expectRevert("InsurancePool: refund already claimed");
        pool.claimRefund(jobId);
    }

    function test_revertClaimRefundNotResolved() public {
        _deposit(staker1, 10_000 ether);
        uint256 jobId = _createInsuredJob(100 ether);

        vm.prank(buyer);
        vm.expectRevert("InsurancePool: no buyer refund");
        pool.claimRefund(jobId);
    }

    function test_revertClaimRefundNotBuyer() public {
        _deposit(staker1, 10_000 ether);
        uint256 jobId = _createInsuredJob(100 ether);

        escrow.setJobStatus(jobId, IEscrowEngine.JobStatus.Resolved);
        escrow.setJobDisputeId(jobId, 1);
        dispute.setDispute(1, IDisputeArbitration.Ruling.BuyerWins);

        vm.prank(seller);
        vm.expectRevert("InsurancePool: not original buyer");
        pool.claimRefund(jobId);
    }

    function test_revertClaimRefundNotInsured() public {
        vm.prank(buyer);
        vm.expectRevert("InsurancePool: not insured");
        pool.claimRefund(999);
    }

    // ═══════════════════════════════════════════════════════════════
    //  V-002: ANTI DOUBLE-DIP
    //  BuyerWins: claimRefund gives full refund, fileClaim reverts
    // ═══════════════════════════════════════════════════════════════

    function test_noDoubleDipBuyerWins() public {
        _deposit(staker1, 10_000 ether);
        uint256 jobId = _createInsuredJob(100 ether);

        escrow.setJobStatus(jobId, IEscrowEngine.JobStatus.Resolved);
        escrow.setJobDisputeId(jobId, 1);
        dispute.setDispute(1, IDisputeArbitration.Ruling.BuyerWins);

        vm.prank(distributor);
        require(lobToken.transfer(address(pool), 100 ether));

        // Buyer claims refund — gets 100 ether
        vm.prank(buyer);
        pool.claimRefund(jobId);

        // Buyer tries fileClaim — reverts (no net loss on BuyerWins)
        vm.prank(buyer);
        vm.expectRevert("InsurancePool: no net loss");
        pool.fileClaim(jobId);
    }

    function test_drawRefundPlusInsurance() public {
        _deposit(staker1, 10_000 ether);

        // Fund pool with insurance capital (treasury seed)
        vm.prank(distributor);
        require(lobToken.transfer(address(pool), 10_000 ether));

        uint256 jobId = _createInsuredJob(100 ether);

        escrow.setJobStatus(jobId, IEscrowEngine.JobStatus.Resolved);
        escrow.setJobDisputeId(jobId, 1);
        dispute.setDispute(1, IDisputeArbitration.Ruling.Draw);

        // Simulate partial escrow refund (50 ether)
        vm.prank(distributor);
        require(lobToken.transfer(address(pool), 50 ether));

        uint256 buyerBefore = lobToken.balanceOf(buyer);

        // Buyer claims refund — gets 50 ether (escrow principal)
        vm.prank(buyer);
        pool.claimRefund(jobId);

        // Buyer claims insurance — gets 50 ether (net loss gap)
        vm.prank(buyer);
        pool.fileClaim(jobId);

        // Total = 100 ether (made whole, no double-dip)
        assertEq(lobToken.balanceOf(buyer), buyerBefore + 100 ether);
    }

    // ═══════════════════════════════════════════════════════════════
    //  V-001: REFUND SEGREGATION
    //  fileClaim cannot consume other users' refunded principals
    // ═══════════════════════════════════════════════════════════════

    function test_fileClaimCannotDrainOtherBuyerRefund() public {
        // Pool has 200 ether staked (staker capital backs claims after V-002 fix)
        _deposit(staker1, 200 ether);

        // Two buyers create insured jobs
        uint256 jobA = _createInsuredJob(100 ether);        // buyer
        uint256 jobB = _createInsuredJobFor(buyer2, 100 ether); // buyer2

        // Both resolve: A = BuyerWins, B = SellerWins
        escrow.setJobStatus(jobA, IEscrowEngine.JobStatus.Resolved);
        escrow.setJobDisputeId(jobA, 1);
        dispute.setDispute(1, IDisputeArbitration.Ruling.BuyerWins);

        escrow.setJobStatus(jobB, IEscrowEngine.JobStatus.Resolved);
        escrow.setJobDisputeId(jobB, 2);
        dispute.setDispute(2, IDisputeArbitration.Ruling.SellerWins);

        // Simulate: escrow refunds 100 ether for job A (BuyerWins) to pool
        vm.prank(distributor);
        require(lobToken.transfer(address(pool), 100 ether));

        // V-002 fix: staker deposits are risk capital.
        // _settleJob(B) inside fileClaim releases B's 100 from in-flight.
        // reserved = 1(rewards) + 0(refundLiabilities) + 100(inFlight for A) = 101
        // balance = 301, poolAvailable = 200 → buyer2 CAN claim (staker capital backs it)
        uint256 buyer2Before = lobToken.balanceOf(buyer2);
        vm.prank(buyer2);
        pool.fileClaim(jobB);
        assertEq(lobToken.balanceOf(buyer2), buyer2Before + 100 ether);

        // Buyer can still claim their refund (protected by _totalRefundLiabilities)
        uint256 buyerBefore = lobToken.balanceOf(buyer);
        vm.prank(buyer);
        pool.claimRefund(jobA);
        assertEq(lobToken.balanceOf(buyer), buyerBefore + 100 ether);
    }

    function test_refundLiabilityReservesBalance() public {
        _deposit(staker1, 100 ether);

        uint256 jobId = _createInsuredJob(100 ether);

        // BuyerWins: refund 100 ether arrives at pool
        escrow.setJobStatus(jobId, IEscrowEngine.JobStatus.Resolved);
        escrow.setJobDisputeId(jobId, 1);
        dispute.setDispute(1, IDisputeArbitration.Ruling.BuyerWins);

        vm.prank(distributor);
        require(lobToken.transfer(address(pool), 100 ether));

        // Before claimRefund, pool stats should NOT show refund as available
        // (lazy accounting: liability not yet tracked until interaction)
        // After claimRefund, the liability is accounted and paid, so it cancels out

        uint256 buyerBefore = lobToken.balanceOf(buyer);

        vm.prank(buyer);
        pool.claimRefund(jobId);

        // Buyer gets their full 100 ether refund
        assertEq(lobToken.balanceOf(buyer), buyerBefore + 100 ether);

        // Pool balance = 100(staked) + 0.5(premium) + 100(refund) - 100(paid) = 100.5
        // Staker can still withdraw their 100 ether
        vm.prank(staker1);
        pool.withdrawFromPool(100 ether);

        assertEq(lobToken.balanceOf(staker1), 100_000 ether); // back to original
    }

    // ═══════════════════════════════════════════════════════════════
    //  BOOK JOB (permissionless settlement)
    // ═══════════════════════════════════════════════════════════════

    function test_bookJobReleasesInFlightReserve() public {
        _deposit(staker1, 10_000 ether);

        // Fund pool with insurance capital
        vm.prank(distributor);
        require(lobToken.transfer(address(pool), 10_000 ether));

        uint256 jobId = _createInsuredJob(100 ether);

        // Before resolve: in-flight reserve blocks 100 from poolAvailable
        (, , , uint256 availBefore) = pool.getPoolStats();

        // Resolve SellerWins (no refund owed)
        escrow.setJobStatus(jobId, IEscrowEngine.JobStatus.Resolved);
        escrow.setJobDisputeId(jobId, 1);
        dispute.setDispute(1, IDisputeArbitration.Ruling.SellerWins);

        // Anyone can call bookJob to settle and release in-flight reserve
        vm.prank(makeAddr("anyone"));
        pool.bookJob(jobId);

        (, , , uint256 availAfter) = pool.getPoolStats();
        // In-flight reserve released → poolAvailable increases by job.amount
        assertEq(availAfter, availBefore + 100 ether);
    }

    function test_revertBookJobNotInsured() public {
        vm.expectRevert("InsurancePool: not insured");
        pool.bookJob(999);
    }

    function test_confirmDeliveryReleasesInFlightReserve() public {
        _deposit(staker1, 10_000 ether);

        // Fund pool with insurance capital
        vm.prank(distributor);
        require(lobToken.transfer(address(pool), 10_000 ether));

        uint256 jobId = _createInsuredJob(100 ether);

        (, , , uint256 availBefore) = pool.getPoolStats();

        // Buyer confirms delivery → settles the job, releases in-flight reserve
        escrow.setJobStatus(jobId, IEscrowEngine.JobStatus.Delivered);

        vm.prank(buyer);
        pool.confirmInsuredDelivery(jobId);

        (, , , uint256 availAfter) = pool.getPoolStats();
        assertEq(availAfter, availBefore + 100 ether);
    }

    // ═══════════════════════════════════════════════════════════════
    //  IN-FLIGHT RESERVE: pre-claim protection
    // ═══════════════════════════════════════════════════════════════

    function test_inFlightReserveProtectsRefundBeforeClaim() public {
        // Pool has staker deposits — they ARE the risk capital after V-002 fix
        _deposit(staker1, 500 ether);

        // Two buyers: A creates 100 job, B creates 100 job
        uint256 jobA = _createInsuredJob(100 ether);
        uint256 jobB = _createInsuredJobFor(buyer2, 100 ether);

        // A resolves BuyerWins (refund arrives at pool)
        escrow.setJobStatus(jobA, IEscrowEngine.JobStatus.Resolved);
        escrow.setJobDisputeId(jobA, 1);
        dispute.setDispute(1, IDisputeArbitration.Ruling.BuyerWins);
        vm.prank(distributor);
        require(lobToken.transfer(address(pool), 100 ether));

        // B resolves SellerWins
        escrow.setJobStatus(jobB, IEscrowEngine.JobStatus.Resolved);
        escrow.setJobDisputeId(jobB, 2);
        dispute.setDispute(2, IDisputeArbitration.Ruling.SellerWins);

        // V-002 fix: staker deposits are risk capital.
        // _settleJob(B) releases B's 100 from in-flight. A's 100 stays reserved.
        // reserved = 1(rewards) + 0(refundLiabilities) + 100(inFlight for A) = 101
        // balance = 601, poolAvailable = 500 → claim succeeds using staker capital
        uint256 buyer2Before = lobToken.balanceOf(buyer2);
        vm.prank(buyer2);
        pool.fileClaim(jobB);
        assertEq(lobToken.balanceOf(buyer2), buyer2Before + 100 ether);

        // Buyer A's refund is still protected by _totalRefundLiabilities
        uint256 buyerBefore = lobToken.balanceOf(buyer);
        vm.prank(buyer);
        pool.claimRefund(jobA);
        assertEq(lobToken.balanceOf(buyer), buyerBefore + 100 ether);
    }

    // ═══════════════════════════════════════════════════════════════
    //  V-002: WITHDRAWAL SOLVENCY GUARD
    // ═══════════════════════════════════════════════════════════════

    function test_withdrawRevertsWhenBreachSolvency() public {
        _deposit(staker1, 1000 ether);

        // Create an insured job — adds to _totalInFlightPrincipal
        uint256 jobId = _createInsuredJob(500 ether);

        // Pool balance = 1000 + 2.5(premium) = 1002.5
        // in-flight = 500, rewards = 2.5
        // liabilities = 502.5
        // Staker tries to withdraw full 1000 → postBalance = 2.5 < 502.5 → revert
        vm.prank(staker1);
        vm.expectRevert("InsurancePool: would breach solvency");
        pool.withdrawFromPool(1000 ether);
    }

    function test_withdrawSucceedsWhenNoLiabilities() public {
        _deposit(staker1, 1000 ether);

        // No insured jobs → no liabilities
        // Full withdraw should succeed
        vm.prank(staker1);
        pool.withdrawFromPool(1000 ether);

        IInsurancePool.PoolStaker memory info = pool.getStakerInfo(staker1);
        assertEq(info.deposited, 0);
    }
}
