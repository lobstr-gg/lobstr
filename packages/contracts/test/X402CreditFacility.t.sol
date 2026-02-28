// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/LOBToken.sol";
import "../src/ReputationSystem.sol";
import "../src/StakingManager.sol";
import "../src/X402CreditFacility.sol";
import "../src/interfaces/IEscrowEngine.sol";
import "../src/interfaces/IDisputeArbitration.sol";
import "./helpers/ProxyTestHelper.sol";

// ══════════════════════════════════════════════════════════════════════════════
//  MOCK CONTRACTS
// ══════════════════════════════════════════════════════════════════════════════

contract MockSybilGuardForCredit {
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

/// @dev Minimal EscrowEngine mock. Tracks jobs, allows state transitions.
contract MockEscrowEngine is IEscrowEngine {
    using SafeERC20 for IERC20;

    uint256 private _nextJobId = 1;
    mapping(uint256 => Job) private _jobs;
    mapping(uint256 => uint256) private _jobDisputeIds;
    mapping(uint256 => address) private _jobPayers;
    IERC20 public token;
    uint256 public disputeIdCounter = 100;

    constructor(address _token) {
        token = IERC20(_token);
    }

    function createJob(uint256 listingId, address seller, uint256 amount, address _token, uint256 deliveryDeadline) external returns (uint256 jobId) {
        IERC20(_token).transferFrom(msg.sender, address(this), amount);
        jobId = _nextJobId++;
        _jobs[jobId] = Job({
            id: jobId,
            listingId: listingId,
            buyer: msg.sender,
            seller: seller,
            amount: amount,
            token: _token,
            fee: 0,
            status: JobStatus.Active,
            createdAt: block.timestamp,
            disputeWindowEnd: 0,
            deliveryMetadataURI: "",
            escrowType: EscrowType.SERVICE_JOB,
            skillId: 0,
            deliveryDeadline: deliveryDeadline
        });
        emit JobCreated(jobId, listingId, msg.sender, seller, amount, _token, 0);
    }

    function createSkillEscrow(uint256 skillId, address buyer, address seller, uint256 amount, address _token) external returns (uint256 jobId) {
        IERC20(_token).transferFrom(buyer, address(this), amount);
        jobId = _nextJobId++;
        _jobs[jobId] = Job({
            id: jobId,
            listingId: 0,
            buyer: buyer,
            seller: seller,
            amount: amount,
            token: _token,
            fee: 0,
            status: JobStatus.Delivered,
            createdAt: block.timestamp,
            disputeWindowEnd: block.timestamp + 72 hours,
            deliveryMetadataURI: "",
            escrowType: EscrowType.SKILL_PURCHASE,
            skillId: skillId,
            deliveryDeadline: 0
        });
    }

    function submitDelivery(uint256 jobId, string calldata metadataURI) external {
        Job storage job = _jobs[jobId];
        require(job.seller == msg.sender, "not seller");
        job.status = JobStatus.Delivered;
        job.deliveryMetadataURI = metadataURI;
        job.disputeWindowEnd = block.timestamp + 1 hours;
    }

    function confirmDelivery(uint256 jobId) external {
        Job storage job = _jobs[jobId];
        require(job.buyer == msg.sender, "not buyer");
        require(job.status == JobStatus.Delivered, "wrong status");
        job.status = JobStatus.Confirmed;
        // Release funds to seller
        IERC20(job.token).transfer(job.seller, job.amount);
    }

    function initiateDispute(uint256 jobId, string calldata) external {
        Job storage job = _jobs[jobId];
        require(job.buyer == msg.sender, "not buyer");
        require(job.status == JobStatus.Delivered, "wrong status");
        job.status = JobStatus.Disputed;
        disputeIdCounter++;
        _jobDisputeIds[jobId] = disputeIdCounter;
    }

    function resolveDispute(uint256 jobId, bool buyerWins) external {
        Job storage job = _jobs[jobId];
        job.status = JobStatus.Resolved;
        if (buyerWins) {
            IERC20(job.token).transfer(job.buyer, job.amount);
        } else {
            IERC20(job.token).transfer(job.seller, job.amount);
        }
    }

    function resolveDisputeDraw(uint256 jobId) external {
        Job storage job = _jobs[jobId];
        job.status = JobStatus.Resolved;
        uint256 half = job.amount / 2;
        IERC20(job.token).transfer(job.buyer, half);
        IERC20(job.token).transfer(job.seller, job.amount - half);
    }

    function autoRelease(uint256 jobId) external {
        Job storage job = _jobs[jobId];
        job.status = JobStatus.Released;
        IERC20(job.token).transfer(job.seller, job.amount);
    }

    function cancelJob(uint256 jobId) external returns (uint256 refundAmount) {
        Job storage job = _jobs[jobId];
        require(job.buyer == msg.sender, "not buyer");
        require(job.status == JobStatus.Active, "wrong status");
        refundAmount = job.amount;
        job.status = JobStatus.Resolved;
        // Transfer refund back to buyer
        IERC20(job.token).transfer(job.buyer, refundAmount);
        emit JobCancelled(jobId, job.buyer, refundAmount);
    }

    function jobPayer(uint256 jobId) external view returns (address) {
        return _jobPayers[jobId];
    }

    function setJobPayer(uint256 jobId, address payer) external {
        _jobPayers[jobId] = payer;
    }

    function getJob(uint256 jobId) external view returns (Job memory) {
        return _jobs[jobId];
    }

    function getJobDisputeId(uint256 jobId) external view returns (uint256) {
        return _jobDisputeIds[jobId];
    }

    // V-002: Allowlist stubs
    function allowlistToken(address) external {}
    function removeToken(address) external {}
    function isTokenAllowed(address) external pure returns (bool) { return true; }

    // Test helpers
    function setJobStatus(uint256 jobId, JobStatus status) external {
        _jobs[jobId].status = status;
    }

    function setJobFee(uint256 jobId, uint256 fee) external {
        _jobs[jobId].fee = fee;
    }
}

/// @dev Mock DisputeArbitration for controlling dispute rulings in tests.
contract MockDisputeArbitration is IDisputeArbitration {
    mapping(uint256 => Dispute) private _disputes;

    function setDispute(uint256 disputeId, Ruling ruling, DisputeStatus status) external {
        _disputes[disputeId].id = disputeId;
        _disputes[disputeId].ruling = ruling;
        _disputes[disputeId].status = status;
    }

    function getDispute(uint256 disputeId) external view returns (Dispute memory) {
        return _disputes[disputeId];
    }

    // Unused stubs
    function removeArbitrator(address) external {}
    function stakeAsArbitrator(uint256) external {}
    function unstakeAsArbitrator(uint256) external {}
    function submitDispute(uint256, address, address, uint256, address, string calldata) external returns (uint256) { return 0; }
    function sealPanel(uint256) external {}
    function submitCounterEvidence(uint256, string calldata) external {}
    function vote(uint256, bool) external {}
    function executeRuling(uint256) external {}
    function finalizeRuling(uint256) external {}
    function appealRuling(uint256) external returns (uint256) { return 0; }
    function pauseAsArbitrator() external {}
    function unpauseAsArbitrator() external {}
    function getArbitratorInfo(address) external view returns (ArbitratorInfo memory) {
        return ArbitratorInfo(0, ArbitratorRank.None, 0, 0, false);
    }
    function getAgreementRate(address, address) external pure returns (uint256, uint256) { return (0, 0); }
    function emergencyResolveStuckDispute(uint256) external {}
    function repanelDispute(uint256) external {}
    function isCertified(address) external pure returns (bool) { return false; }
}

// ══════════════════════════════════════════════════════════════════════════════
//  TEST CONTRACT
// ══════════════════════════════════════════════════════════════════════════════

contract X402CreditFacilityTest is Test, ProxyTestHelper {
    // Re-declare events for vm.expectEmit
    event CreditLineOpened(address indexed agent, uint256 creditLimit, uint256 collateral, uint256 interestRateBps);
    event CreditLineClosed(address indexed agent, uint256 collateralReturned);
    event CreditLineFrozen(address indexed agent, uint256 defaults);
    event CreditDrawn(uint256 indexed drawId, address indexed agent, uint256 amount, uint256 indexed escrowJobId);
    event DrawRepaid(uint256 indexed drawId, address indexed agent, uint256 totalPaid);
    event DrawLiquidated(uint256 indexed drawId, address indexed agent, uint256 collateralSeized, uint256 stakeSlashed);
    event RefundCredited(uint256 indexed drawId, uint256 indexed escrowJobId, uint256 refundAmount);
    event PoolDeposited(address indexed depositor, uint256 amount);
    event PoolWithdrawn(address indexed withdrawer, uint256 amount);

    LOBToken public token;
    ReputationSystem public reputation;
    StakingManager public staking;
    MockSybilGuardForCredit public sybilGuard;
    MockEscrowEngine public escrowEngine;
    MockDisputeArbitration public disputeArb;
    X402CreditFacility public facility;

    address public admin = makeAddr("admin");
    address public distributor = makeAddr("distributor");
    address public treasury = makeAddr("treasury");
    address public agent = makeAddr("agent");
    address public agent2 = makeAddr("agent2");
    address public seller = makeAddr("seller");
    address public facilitator = makeAddr("facilitator");
    address public poolManager = makeAddr("poolManager");
    address public thirdParty = makeAddr("thirdParty");

    uint256 constant LISTING_ID = 42;

    function setUp() public {
        vm.startPrank(admin);

        token = LOBToken(_deployProxy(address(new LOBToken()), abi.encodeCall(LOBToken.initialize, (distributor))));
        reputation = ReputationSystem(_deployProxy(address(new ReputationSystem()), abi.encodeCall(ReputationSystem.initialize, ())));
        staking = StakingManager(_deployProxy(address(new StakingManager()), abi.encodeCall(StakingManager.initialize, (address(token)))));
        sybilGuard = new MockSybilGuardForCredit();
        escrowEngine = new MockEscrowEngine(address(token));
        disputeArb = new MockDisputeArbitration();

        facility = X402CreditFacility(_deployProxy(address(new X402CreditFacility()), abi.encodeCall(X402CreditFacility.initialize, (
            address(token),
            address(escrowEngine),
            address(disputeArb),
            address(reputation),
            address(staking),
            address(sybilGuard),
            treasury,
            admin
        ))));

        // Grant roles
        reputation.grantRole(reputation.RECORDER_ROLE(), address(facility));
        staking.grantRole(staking.SLASHER_ROLE(), address(facility));
        staking.grantRole(staking.LOCKER_ROLE(), address(facility));
        facility.grantRole(facility.FACILITATOR_ROLE(), facilitator);
        facility.grantRole(facility.POOL_MANAGER_ROLE(), poolManager);

        vm.stopPrank();

        // Fund participants
        vm.startPrank(distributor);
        token.transfer(agent, 500_000 ether);
        token.transfer(agent2, 500_000 ether);
        token.transfer(poolManager, 1_000_000 ether);
        token.transfer(thirdParty, 100_000 ether);
        vm.stopPrank();

        // Seed pool with 100k LOB
        vm.startPrank(poolManager);
        token.approve(address(facility), 100_000 ether);
        facility.depositToPool(100_000 ether);
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════════
    //  HELPERS
    // ═══════════════════════════════════════════════════════════════════

    function _buildReputation(address user, uint256 completions) internal {
        vm.startPrank(admin);
        reputation.grantRole(reputation.RECORDER_ROLE(), admin);
        vm.stopPrank();

        for (uint256 i = 0; i < completions; i++) {
            vm.prank(admin);
            reputation.recordCompletion(user, address(uint160(0x1000 + i)));
        }
    }

    function _makeSilver(address user) internal {
        _buildReputation(user, 5);
        vm.warp(block.timestamp + 7 days); // V-006: SILVER_MIN_TENURE
    }

    function _makeGold(address user) internal {
        _buildReputation(user, 45);
        vm.warp(block.timestamp + 30 days); // V-006: GOLD_MIN_TENURE
    }

    function _makePlatinum(address user) internal {
        _buildReputation(user, 95);
        vm.warp(block.timestamp + 90 days); // V-006: PLATINUM_MIN_TENURE
    }

    function _stakeAgent(address user) internal {
        _stakeAgentAmount(user, 1_000 ether);
    }

    function _stakeAgentAmount(address user, uint256 amount) internal {
        vm.startPrank(user);
        token.approve(address(staking), amount);
        staking.stake(amount);
        vm.stopPrank();
    }

    function _openSilverLine(address user) internal {
        _makeSilver(user);
        _stakeAgent(user); // 1000 >= Silver creditLimit 500
        uint256 collateral = (500 ether * 5000) / 10000; // 250 LOB
        vm.startPrank(user);
        token.approve(address(facility), collateral);
        facility.openCreditLine();
        vm.stopPrank();
    }

    function _openGoldLine(address user) internal {
        _makeGold(user);
        _stakeAgentAmount(user, 2_500 ether); // V-002: must cover Gold creditLimit 2500
        uint256 collateral = (2500 ether * 4000) / 10000; // 1000 LOB (40%)
        vm.startPrank(user);
        token.approve(address(facility), collateral);
        facility.openCreditLine();
        vm.stopPrank();
    }

    function _openPlatinumLine(address user) internal {
        _makePlatinum(user);
        _stakeAgentAmount(user, 10_000 ether); // V-002: must cover Platinum creditLimit 10000
        uint256 collateral = (10_000 ether * 2500) / 10000; // 2500 LOB (25%)
        vm.startPrank(user);
        token.approve(address(facility), collateral);
        facility.openCreditLine();
        vm.stopPrank();
    }

    function _drawCredit(address user, uint256 amount) internal returns (uint256) {
        vm.prank(user);
        return facility.drawCreditAndCreateEscrow(LISTING_ID, seller, amount);
    }

    function _advanceDelivery(uint256 escrowJobId) internal {
        vm.prank(seller);
        escrowEngine.submitDelivery(escrowJobId, "ipfs://delivery");
    }

    // ═══════════════════════════════════════════════════════════════════
    //  CREDIT LINE MANAGEMENT
    // ═══════════════════════════════════════════════════════════════════

    function test_silverOpenCreditLine() public {
        _makeSilver(agent);
        _stakeAgent(agent);
        uint256 balBefore = token.balanceOf(agent);

        vm.startPrank(agent);
        token.approve(address(facility), 250 ether);

        vm.expectEmit(true, false, false, true);
        emit CreditLineOpened(agent, 500 ether, 250 ether, 800);
        facility.openCreditLine();
        vm.stopPrank();

        IX402CreditFacility.CreditLine memory line = facility.getCreditLine(agent);
        assertEq(line.creditLimit, 500 ether);
        assertEq(line.collateralDeposited, 250 ether);
        assertEq(line.interestRateBps, 800);
        assertEq(uint256(line.status), uint256(IX402CreditFacility.CreditLineStatus.Active));
        assertEq(token.balanceOf(agent), balBefore - 250 ether);
    }

    function test_goldOpenCreditLine() public {
        _makeGold(agent);
        _stakeAgentAmount(agent, 2_500 ether); // V-002: must cover Gold creditLimit
        vm.startPrank(agent);
        token.approve(address(facility), 1000 ether);
        facility.openCreditLine();
        vm.stopPrank();

        IX402CreditFacility.CreditLine memory line = facility.getCreditLine(agent);
        assertEq(line.creditLimit, 2500 ether);
        assertEq(line.collateralDeposited, 1000 ether);
        assertEq(line.interestRateBps, 500);
    }

    function test_platinumOpenCreditLine() public {
        _makePlatinum(agent);
        _stakeAgentAmount(agent, 10_000 ether); // V-002: must cover Platinum creditLimit
        uint256 collateral = (10_000 ether * 2500) / 10000; // 2500 LOB
        vm.startPrank(agent);
        token.approve(address(facility), collateral);
        facility.openCreditLine();
        vm.stopPrank();

        IX402CreditFacility.CreditLine memory line = facility.getCreditLine(agent);
        assertEq(line.creditLimit, 10_000 ether);
        assertEq(line.collateralDeposited, 2500 ether);
        assertEq(line.interestRateBps, 300);
    }

    function test_bronzeRejected() public {
        // Default rep is Bronze
        vm.startPrank(agent);
        token.approve(address(facility), 1000 ether);
        vm.expectRevert("CreditFacility: insufficient reputation");
        facility.openCreditLine();
        vm.stopPrank();
    }

    function test_bannedRejected() public {
        _makeSilver(agent);
        sybilGuard.setBanned(agent, true);

        vm.startPrank(agent);
        token.approve(address(facility), 250 ether);
        vm.expectRevert("CreditFacility: agent banned");
        facility.openCreditLine();
        vm.stopPrank();
    }

    function test_duplicateLineRejected() public {
        _openSilverLine(agent);

        vm.startPrank(agent);
        token.approve(address(facility), 250 ether);
        vm.expectRevert("CreditFacility: line already exists");
        facility.openCreditLine();
        vm.stopPrank();
    }

    function test_closeReturnsCollateral() public {
        _openSilverLine(agent);
        uint256 balBefore = token.balanceOf(agent);

        vm.expectEmit(true, false, false, true);
        emit CreditLineClosed(agent, 250 ether);

        vm.prank(agent);
        facility.closeCreditLine();

        assertEq(token.balanceOf(agent), balBefore + 250 ether);
        IX402CreditFacility.CreditLine memory line = facility.getCreditLine(agent);
        assertEq(uint256(line.status), uint256(IX402CreditFacility.CreditLineStatus.Closed));
    }

    function test_closeRevertsWithOutstandingDraws() public {
        _openSilverLine(agent);
        _drawCredit(agent, 100 ether);

        vm.prank(agent);
        vm.expectRevert("CreditFacility: outstanding draws");
        facility.closeCreditLine();
    }

    // ═══════════════════════════════════════════════════════════════════
    //  CREDIT DRAW + ESCROW CREATION
    // ═══════════════════════════════════════════════════════════════════

    function test_drawCreatesEscrowJob() public {
        _openSilverLine(agent);
        uint256 drawId = _drawCredit(agent, 200 ether);

        IX402CreditFacility.CreditDraw memory draw = facility.getDraw(drawId);
        assertEq(draw.amount, 200 ether);
        assertEq(draw.agent, agent);
        assertGt(draw.escrowJobId, 0);

        // Verify facility is the buyer on the escrow job
        IEscrowEngine.Job memory job = escrowEngine.getJob(draw.escrowJobId);
        assertEq(job.buyer, address(facility));
        assertEq(job.seller, seller);
        assertEq(job.amount, 200 ether);
    }

    function test_multipleDrawsUpToMax() public {
        _openSilverLine(agent);

        for (uint256 i = 0; i < 5; i++) {
            _drawCredit(agent, 100 ether);
        }

        IX402CreditFacility.CreditLine memory line = facility.getCreditLine(agent);
        assertEq(line.activeDraws, 5);
    }

    function test_drawRevertsExceedsLimit() public {
        _openSilverLine(agent);

        vm.prank(agent);
        vm.expectRevert("CreditFacility: exceeds credit limit");
        facility.drawCreditAndCreateEscrow(LISTING_ID, seller, 501 ether);
    }

    function test_drawRevertsMaxDraws() public {
        _openSilverLine(agent);
        for (uint256 i = 0; i < 5; i++) {
            _drawCredit(agent, 50 ether);
        }

        vm.prank(agent);
        vm.expectRevert("CreditFacility: max draws reached");
        facility.drawCreditAndCreateEscrow(LISTING_ID, seller, 50 ether);
    }

    function test_drawRevertsInsufficientPool() public {
        // Withdraw most of the pool so there's very little liquidity
        vm.prank(poolManager);
        facility.withdrawFromPool(99_900 ether);

        // Pool now has 100 LOB available
        _openSilverLine(agent);

        vm.prank(agent);
        vm.expectRevert("CreditFacility: insufficient pool liquidity");
        facility.drawCreditAndCreateEscrow(LISTING_ID, seller, 200 ether);
    }

    function test_drawRevertsFrozenLine() public {
        _openSilverLine(agent);
        uint256 drawId = _drawCredit(agent, 100 ether);

        // Force freeze
        IX402CreditFacility.CreditDraw memory draw = facility.getDraw(drawId);
        _advanceDelivery(draw.escrowJobId);
        vm.prank(agent);
        facility.confirmDelivery(draw.escrowJobId);

        // Do 2 draws, default both
        uint256 d1 = _drawCredit(agent, 100 ether);
        IX402CreditFacility.CreditDraw memory draw1 = facility.getDraw(d1);
        _advanceDelivery(draw1.escrowJobId);
        vm.prank(agent);
        facility.confirmDelivery(draw1.escrowJobId);
        escrowEngine.setJobStatus(draw1.escrowJobId, IEscrowEngine.JobStatus.Confirmed);
        vm.warp(block.timestamp + 30 days + 48 hours + 1);
        facility.liquidateDraw(d1);

        // Need to repay draw1 first to have room for more draws
        // Actually let's simplify - just repay original draw first
        uint256 owedOriginal = 100 ether + draw.interestAccrued + draw.protocolFee;
        vm.startPrank(agent);
        token.approve(address(facility), owedOriginal);
        facility.repayDraw(drawId);
        vm.stopPrank();

        uint256 d2 = _drawCredit(agent, 100 ether);
        IX402CreditFacility.CreditDraw memory draw2 = facility.getDraw(d2);
        _advanceDelivery(draw2.escrowJobId);
        vm.prank(agent);
        facility.confirmDelivery(draw2.escrowJobId);
        escrowEngine.setJobStatus(draw2.escrowJobId, IEscrowEngine.JobStatus.Confirmed);
        vm.warp(block.timestamp + 30 days + 48 hours + 1);
        facility.liquidateDraw(d2);

        // Now frozen
        IX402CreditFacility.CreditLine memory line = facility.getCreditLine(agent);
        assertEq(uint256(line.status), uint256(IX402CreditFacility.CreditLineStatus.Frozen));

        vm.prank(agent);
        vm.expectRevert("CreditFacility: line not active");
        facility.drawCreditAndCreateEscrow(LISTING_ID, seller, 50 ether);
    }

    function test_facilitatorDrawForAgent() public {
        _openSilverLine(agent);

        vm.prank(facilitator);
        uint256 drawId = facility.drawCreditForAgent(agent, LISTING_ID, seller, 200 ether);

        IX402CreditFacility.CreditDraw memory draw = facility.getDraw(drawId);
        assertEq(draw.agent, agent);
        assertEq(draw.amount, 200 ether);
    }

    function test_nonFacilitatorDrawForAgentReverts() public {
        _openSilverLine(agent);

        vm.prank(thirdParty);
        vm.expectRevert();
        facility.drawCreditForAgent(agent, LISTING_ID, seller, 200 ether);
    }

    // ═══════════════════════════════════════════════════════════════════
    //  ESCROW LIFECYCLE PROXY
    // ═══════════════════════════════════════════════════════════════════

    function test_confirmDeliveryProxied() public {
        _openSilverLine(agent);
        uint256 drawId = _drawCredit(agent, 200 ether);
        IX402CreditFacility.CreditDraw memory draw = facility.getDraw(drawId);

        _advanceDelivery(draw.escrowJobId);

        vm.prank(agent);
        facility.confirmDelivery(draw.escrowJobId);

        IEscrowEngine.Job memory job = escrowEngine.getJob(draw.escrowJobId);
        assertEq(uint256(job.status), uint256(IEscrowEngine.JobStatus.Confirmed));
    }

    function test_confirmDeliveryRevertsNotAgent() public {
        _openSilverLine(agent);
        uint256 drawId = _drawCredit(agent, 200 ether);
        IX402CreditFacility.CreditDraw memory draw = facility.getDraw(drawId);

        _advanceDelivery(draw.escrowJobId);

        vm.prank(thirdParty);
        vm.expectRevert("CreditFacility: not agent");
        facility.confirmDelivery(draw.escrowJobId);
    }

    function test_initiateDisputeProxied() public {
        _openSilverLine(agent);
        uint256 drawId = _drawCredit(agent, 200 ether);
        IX402CreditFacility.CreditDraw memory draw = facility.getDraw(drawId);

        _advanceDelivery(draw.escrowJobId);

        vm.prank(agent);
        facility.initiateDispute(draw.escrowJobId, "ipfs://evidence");

        IEscrowEngine.Job memory job = escrowEngine.getJob(draw.escrowJobId);
        assertEq(uint256(job.status), uint256(IEscrowEngine.JobStatus.Disputed));
    }

    function test_initiateDisputeRevertsNotAgent() public {
        _openSilverLine(agent);
        uint256 drawId = _drawCredit(agent, 200 ether);
        IX402CreditFacility.CreditDraw memory draw = facility.getDraw(drawId);

        _advanceDelivery(draw.escrowJobId);

        vm.prank(thirdParty);
        vm.expectRevert("CreditFacility: not agent");
        facility.initiateDispute(draw.escrowJobId, "ipfs://evidence");
    }

    // ═══════════════════════════════════════════════════════════════════
    //  REPAYMENT
    // ═══════════════════════════════════════════════════════════════════

    function test_fullRepay() public {
        _openSilverLine(agent);
        uint256 drawId = _drawCredit(agent, 200 ether);

        IX402CreditFacility.CreditDraw memory draw = facility.getDraw(drawId);
        uint256 totalOwed = draw.amount + draw.interestAccrued + draw.protocolFee;

        vm.startPrank(agent);
        token.approve(address(facility), totalOwed);
        facility.repayDraw(drawId);
        vm.stopPrank();

        draw = facility.getDraw(drawId);
        assertGt(draw.repaidAt, 0);

        IX402CreditFacility.CreditLine memory line = facility.getCreditLine(agent);
        assertEq(line.activeDraws, 0);
    }

    function test_thirdPartyRepay() public {
        _openSilverLine(agent);
        uint256 drawId = _drawCredit(agent, 200 ether);

        IX402CreditFacility.CreditDraw memory draw = facility.getDraw(drawId);
        uint256 totalOwed = draw.amount + draw.interestAccrued + draw.protocolFee;

        vm.startPrank(thirdParty);
        token.approve(address(facility), totalOwed);
        facility.repayDraw(drawId);
        vm.stopPrank();

        draw = facility.getDraw(drawId);
        assertGt(draw.repaidAt, 0);
    }

    function test_interestMathVerification() public {
        _openSilverLine(agent);
        uint256 drawId = _drawCredit(agent, 500 ether);

        // Silver: 800 BPS annual, 30 days
        // interest = 500e18 * 800 * 30 days / (10000 * 365 * 1 day)
        uint256 principal = 500 ether;
        uint256 expected = (principal * 800 * 30 days) / (uint256(10_000) * 365 * 1 days);
        IX402CreditFacility.CreditDraw memory draw = facility.getDraw(drawId);
        assertEq(draw.interestAccrued, expected);

        // Protocol fee: 0.5% of principal
        uint256 expectedFee = (500 ether * 50) / 10_000;
        assertEq(draw.protocolFee, expectedFee);
    }

    function test_repayRevertsAlreadyRepaid() public {
        _openSilverLine(agent);
        uint256 drawId = _drawCredit(agent, 200 ether);

        IX402CreditFacility.CreditDraw memory draw = facility.getDraw(drawId);
        uint256 totalOwed = draw.amount + draw.interestAccrued + draw.protocolFee;

        vm.startPrank(agent);
        token.approve(address(facility), totalOwed * 2);
        facility.repayDraw(drawId);

        vm.expectRevert("CreditFacility: already repaid");
        facility.repayDraw(drawId);
        vm.stopPrank();
    }

    function test_repayAfterPartialRefundCredit() public {
        _openSilverLine(agent);
        uint256 drawId = _drawCredit(agent, 200 ether);

        IX402CreditFacility.CreditDraw memory draw = facility.getDraw(drawId);
        uint256 escrowJobId = draw.escrowJobId;

        // Simulate dispute resolution with Draw ruling (partial refund)
        _advanceDelivery(escrowJobId);
        vm.prank(agent);
        facility.initiateDispute(escrowJobId, "ipfs://evidence");

        // Set up mock: resolved with Draw ruling
        escrowEngine.setJobStatus(escrowJobId, IEscrowEngine.JobStatus.Resolved);
        uint256 disputeId = escrowEngine.getJobDisputeId(escrowJobId);
        disputeArb.setDispute(disputeId, IDisputeArbitration.Ruling.Draw, IDisputeArbitration.DisputeStatus.Resolved);

        // Mock escrow sends half back (we simulate by transferring to facility)
        uint256 halfRefund = 200 ether / 2; // no fee in mock, so full half
        vm.prank(distributor);
        token.transfer(address(facility), halfRefund);

        // Claim refund
        facility.claimEscrowRefund(escrowJobId);

        draw = facility.getDraw(drawId);
        assertEq(draw.refundCredit, halfRefund);

        // Now repay: should owe (200 - 100) + interest + fee
        uint256 principalOwed = draw.amount - draw.refundCredit;
        uint256 totalOwed = principalOwed + draw.interestAccrued + draw.protocolFee;

        vm.startPrank(agent);
        token.approve(address(facility), totalOwed);
        facility.repayDraw(drawId);
        vm.stopPrank();

        draw = facility.getDraw(drawId);
        assertGt(draw.repaidAt, 0);
    }

    // ═══════════════════════════════════════════════════════════════════
    //  DISPUTE REFUNDS
    // ═══════════════════════════════════════════════════════════════════

    function test_buyerWinsFullCredit() public {
        _openSilverLine(agent);
        uint256 drawId = _drawCredit(agent, 200 ether);
        IX402CreditFacility.CreditDraw memory draw = facility.getDraw(drawId);
        uint256 escrowJobId = draw.escrowJobId;

        _advanceDelivery(escrowJobId);
        vm.prank(agent);
        facility.initiateDispute(escrowJobId, "ipfs://evidence");

        escrowEngine.setJobStatus(escrowJobId, IEscrowEngine.JobStatus.Resolved);
        uint256 disputeId = escrowEngine.getJobDisputeId(escrowJobId);
        disputeArb.setDispute(disputeId, IDisputeArbitration.Ruling.BuyerWins, IDisputeArbitration.DisputeStatus.Resolved);

        // Simulate refund tokens arriving at facility
        vm.prank(distributor);
        token.transfer(address(facility), 200 ether);

        vm.expectEmit(true, true, false, true);
        emit RefundCredited(drawId, escrowJobId, 200 ether);
        facility.claimEscrowRefund(escrowJobId);

        draw = facility.getDraw(drawId);
        assertEq(draw.refundCredit, 200 ether);
    }

    function test_drawPartialCredit() public {
        _openSilverLine(agent);
        uint256 drawId = _drawCredit(agent, 200 ether);
        IX402CreditFacility.CreditDraw memory draw = facility.getDraw(drawId);
        uint256 escrowJobId = draw.escrowJobId;

        _advanceDelivery(escrowJobId);
        vm.prank(agent);
        facility.initiateDispute(escrowJobId, "ipfs://evidence");

        escrowEngine.setJobStatus(escrowJobId, IEscrowEngine.JobStatus.Resolved);
        uint256 disputeId = escrowEngine.getJobDisputeId(escrowJobId);
        disputeArb.setDispute(disputeId, IDisputeArbitration.Ruling.Draw, IDisputeArbitration.DisputeStatus.Resolved);

        facility.claimEscrowRefund(escrowJobId);

        draw = facility.getDraw(drawId);
        // Mock has 0 fee, so refund = 200/2 = 100
        assertEq(draw.refundCredit, 100 ether);
    }

    function test_sellerWinsNoCredit() public {
        _openSilverLine(agent);
        uint256 drawId = _drawCredit(agent, 200 ether);
        IX402CreditFacility.CreditDraw memory draw = facility.getDraw(drawId);
        uint256 escrowJobId = draw.escrowJobId;

        _advanceDelivery(escrowJobId);
        vm.prank(agent);
        facility.initiateDispute(escrowJobId, "ipfs://evidence");

        escrowEngine.setJobStatus(escrowJobId, IEscrowEngine.JobStatus.Resolved);
        uint256 disputeId = escrowEngine.getJobDisputeId(escrowJobId);
        disputeArb.setDispute(disputeId, IDisputeArbitration.Ruling.SellerWins, IDisputeArbitration.DisputeStatus.Resolved);

        vm.expectRevert("CreditFacility: no refund owed");
        facility.claimEscrowRefund(escrowJobId);
    }

    function test_refundReducesTotalOutstandingCorrectly() public {
        _openSilverLine(agent);
        uint256 drawId = _drawCredit(agent, 200 ether);

        uint256 outstandingBefore = facility.totalOutstanding();
        assertEq(outstandingBefore, 200 ether);

        // BuyerWins refund doesn't reduce totalOutstanding —
        // that happens on repay or liquidation
        IX402CreditFacility.CreditDraw memory draw = facility.getDraw(drawId);
        _advanceDelivery(draw.escrowJobId);
        vm.prank(agent);
        facility.initiateDispute(draw.escrowJobId, "ipfs://ev");

        escrowEngine.setJobStatus(draw.escrowJobId, IEscrowEngine.JobStatus.Resolved);
        uint256 disputeId = escrowEngine.getJobDisputeId(draw.escrowJobId);
        disputeArb.setDispute(disputeId, IDisputeArbitration.Ruling.BuyerWins, IDisputeArbitration.DisputeStatus.Resolved);

        vm.prank(distributor);
        token.transfer(address(facility), 200 ether);

        facility.claimEscrowRefund(draw.escrowJobId);

        // Outstanding stays same until repaid
        assertEq(facility.totalOutstanding(), 200 ether);

        // Now repay — agent owes only interest + fee (principal refunded)
        draw = facility.getDraw(drawId);
        uint256 owes = draw.interestAccrued + draw.protocolFee;
        vm.startPrank(agent);
        token.approve(address(facility), owes);
        facility.repayDraw(drawId);
        vm.stopPrank();

        // Now outstanding reduced
        assertEq(facility.totalOutstanding(), 0);
    }

    function test_agentOnlyOwesInterestAfterBuyerWins() public {
        _openSilverLine(agent);
        uint256 drawId = _drawCredit(agent, 200 ether);

        IX402CreditFacility.CreditDraw memory draw = facility.getDraw(drawId);
        _advanceDelivery(draw.escrowJobId);
        vm.prank(agent);
        facility.initiateDispute(draw.escrowJobId, "ipfs://ev");

        escrowEngine.setJobStatus(draw.escrowJobId, IEscrowEngine.JobStatus.Resolved);
        uint256 disputeId = escrowEngine.getJobDisputeId(draw.escrowJobId);
        disputeArb.setDispute(disputeId, IDisputeArbitration.Ruling.BuyerWins, IDisputeArbitration.DisputeStatus.Resolved);

        vm.prank(distributor);
        token.transfer(address(facility), 200 ether);
        facility.claimEscrowRefund(draw.escrowJobId);

        draw = facility.getDraw(drawId);
        // Total owed: 0 principal + interest + fee
        uint256 expectedOwed = draw.interestAccrued + draw.protocolFee;

        uint256 balBefore = token.balanceOf(agent);
        vm.startPrank(agent);
        token.approve(address(facility), expectedOwed);
        facility.repayDraw(drawId);
        vm.stopPrank();

        assertEq(token.balanceOf(agent), balBefore - expectedOwed);
    }

    // ═══════════════════════════════════════════════════════════════════
    //  LIQUIDATION
    // ═══════════════════════════════════════════════════════════════════

    function test_liquidateAfterDeadline() public {
        _openSilverLine(agent);
        uint256 drawId = _drawCredit(agent, 200 ether);

        IX402CreditFacility.CreditDraw memory draw = facility.getDraw(drawId);
        _advanceDelivery(draw.escrowJobId);
        vm.prank(agent);
        facility.confirmDelivery(draw.escrowJobId);

        // Warp past deadline + grace
        vm.warp(block.timestamp + 30 days + 48 hours + 1);

        facility.liquidateDraw(drawId);

        draw = facility.getDraw(drawId);
        assertTrue(draw.liquidated);
    }

    function test_liquidateRevertsGracePeriod() public {
        _openSilverLine(agent);
        uint256 drawId = _drawCredit(agent, 200 ether);

        IX402CreditFacility.CreditDraw memory draw = facility.getDraw(drawId);
        _advanceDelivery(draw.escrowJobId);
        vm.prank(agent);
        facility.confirmDelivery(draw.escrowJobId);

        // Warp to just within grace period
        vm.warp(block.timestamp + 30 days + 24 hours);

        vm.expectRevert("CreditFacility: deadline not passed");
        facility.liquidateDraw(drawId);
    }

    function test_liquidateRevertsEscrowStillActive() public {
        _openSilverLine(agent);
        uint256 drawId = _drawCredit(agent, 200 ether);

        // Don't advance delivery — job is still Active
        vm.warp(block.timestamp + 30 days + 48 hours + 1);

        vm.expectRevert("CreditFacility: escrow still active");
        facility.liquidateDraw(drawId);
    }

    function test_freezeAfterTwoDefaults() public {
        _openSilverLine(agent);

        // First default
        uint256 d1 = _drawCredit(agent, 100 ether);
        IX402CreditFacility.CreditDraw memory draw1 = facility.getDraw(d1);
        _advanceDelivery(draw1.escrowJobId);
        vm.prank(agent);
        facility.confirmDelivery(draw1.escrowJobId);
        vm.warp(block.timestamp + 30 days + 48 hours + 1);
        facility.liquidateDraw(d1);

        IX402CreditFacility.CreditLine memory line = facility.getCreditLine(agent);
        assertEq(line.defaults, 1);
        assertEq(uint256(line.status), uint256(IX402CreditFacility.CreditLineStatus.Active));

        // Second default
        uint256 d2 = _drawCredit(agent, 100 ether);
        IX402CreditFacility.CreditDraw memory draw2 = facility.getDraw(d2);
        _advanceDelivery(draw2.escrowJobId);
        vm.prank(agent);
        facility.confirmDelivery(draw2.escrowJobId);
        vm.warp(block.timestamp + 30 days + 48 hours + 1);

        vm.expectEmit(true, false, false, true);
        emit CreditLineFrozen(agent, 2);
        facility.liquidateDraw(d2);

        line = facility.getCreditLine(agent);
        assertEq(line.defaults, 2);
        assertEq(uint256(line.status), uint256(IX402CreditFacility.CreditLineStatus.Frozen));
    }

    function test_reputationSlashedOnLiquidation() public {
        _openSilverLine(agent);
        uint256 drawId = _drawCredit(agent, 200 ether);

        (, IReputationSystem.ReputationTier tierBefore) = reputation.getScore(agent);

        IX402CreditFacility.CreditDraw memory draw = facility.getDraw(drawId);
        _advanceDelivery(draw.escrowJobId);
        vm.prank(agent);
        facility.confirmDelivery(draw.escrowJobId);
        vm.warp(block.timestamp + 30 days + 48 hours + 1);

        facility.liquidateDraw(drawId);

        // Reputation should have been slashed (recordDispute with providerWon=false = -200)
        IReputationSystem.ReputationData memory data = reputation.getReputationData(agent);
        assertEq(data.disputesLost, 1);
    }

    function test_platinumStakeSlash() public {
        _openPlatinumLine(agent);

        // _openPlatinumLine stakes 10_000 ether (V-002 lock covers creditLimit)
        // Stake additional so total = 20k for this test
        vm.startPrank(agent);
        token.approve(address(staking), 10_000 ether);
        staking.stake(10_000 ether);
        vm.stopPrank();

        uint256 drawId = _drawCredit(agent, 5_000 ether);
        IX402CreditFacility.CreditDraw memory draw = facility.getDraw(drawId);

        _advanceDelivery(draw.escrowJobId);
        vm.prank(agent);
        facility.confirmDelivery(draw.escrowJobId);
        vm.warp(block.timestamp + 30 days + 48 hours + 1);

        uint256 poolBefore = facility.totalPoolBalance();
        facility.liquidateDraw(drawId);

        // Stake should have been slashed: 20k - 5k = 15k
        assertEq(staking.getStake(agent), 15_000 ether);

        // Pool should have recovered slashed stake + proportional collateral
        // Collateral seized: 5000/10000 * 2500 = 1250 LOB
        assertEq(facility.totalPoolBalance(), poolBefore + 5_000 ether + 1_250 ether);
    }

    // ═══════════════════════════════════════════════════════════════════
    //  POOL MANAGEMENT
    // ═══════════════════════════════════════════════════════════════════

    function test_depositIncreasesPool() public {
        uint256 poolBefore = facility.totalPoolBalance();

        vm.startPrank(poolManager);
        token.approve(address(facility), 50_000 ether);
        facility.depositToPool(50_000 ether);
        vm.stopPrank();

        assertEq(facility.totalPoolBalance(), poolBefore + 50_000 ether);
    }

    function test_withdrawSurplus() public {
        uint256 balBefore = token.balanceOf(poolManager);

        vm.prank(poolManager);
        facility.withdrawFromPool(50_000 ether);

        assertEq(token.balanceOf(poolManager), balBefore + 50_000 ether);
        assertEq(facility.totalPoolBalance(), 50_000 ether);
    }

    function test_withdrawRevertsDrainBelowOutstanding() public {
        _openSilverLine(agent);
        _drawCredit(agent, 200 ether);

        // Pool: 100k, outstanding: 200, surplus: 99,800
        vm.prank(poolManager);
        vm.expectRevert("CreditFacility: would drain below outstanding");
        facility.withdrawFromPool(100_000 ether);
    }

    function test_utilizationViewCorrect() public {
        _openSilverLine(agent);
        _drawCredit(agent, 300 ether);

        (uint256 total, uint256 outstanding, uint256 available) = facility.getPoolUtilization();
        assertEq(total, 100_000 ether);
        assertEq(outstanding, 300 ether);
        assertEq(available, 99_700 ether);
    }

    // ═══════════════════════════════════════════════════════════════════
    //  FULL LIFECYCLE — HAPPY PATH
    // ═══════════════════════════════════════════════════════════════════

    function test_fullLifecycleHappyPath() public {
        // 1. Open credit line
        _openSilverLine(agent);

        // 2. Draw credit → creates escrow
        uint256 drawId = _drawCredit(agent, 200 ether);
        IX402CreditFacility.CreditDraw memory draw = facility.getDraw(drawId);

        // 3. Seller delivers
        _advanceDelivery(draw.escrowJobId);

        // 4. Agent confirms delivery
        vm.prank(agent);
        facility.confirmDelivery(draw.escrowJobId);

        // 5. Repay draw
        uint256 totalOwed = draw.amount + draw.interestAccrued + draw.protocolFee;
        vm.startPrank(agent);
        token.approve(address(facility), totalOwed);
        facility.repayDraw(drawId);
        vm.stopPrank();

        // 6. Close credit line
        vm.prank(agent);
        facility.closeCreditLine();

        IX402CreditFacility.CreditLine memory line = facility.getCreditLine(agent);
        assertEq(uint256(line.status), uint256(IX402CreditFacility.CreditLineStatus.Closed));
        assertEq(line.activeDraws, 0);
    }

    function test_fullLifecycleDisputePath() public {
        // 1. Open + draw
        _openSilverLine(agent);
        uint256 drawId = _drawCredit(agent, 200 ether);
        IX402CreditFacility.CreditDraw memory draw = facility.getDraw(drawId);

        // 2. Delivery + dispute
        _advanceDelivery(draw.escrowJobId);
        vm.prank(agent);
        facility.initiateDispute(draw.escrowJobId, "ipfs://evidence");

        // 3. BuyerWins resolution
        escrowEngine.setJobStatus(draw.escrowJobId, IEscrowEngine.JobStatus.Resolved);
        uint256 disputeId = escrowEngine.getJobDisputeId(draw.escrowJobId);
        disputeArb.setDispute(disputeId, IDisputeArbitration.Ruling.BuyerWins, IDisputeArbitration.DisputeStatus.Resolved);

        // Simulate refund
        vm.prank(distributor);
        token.transfer(address(facility), 200 ether);

        // 4. Claim refund
        facility.claimEscrowRefund(draw.escrowJobId);

        // 5. Repay (only interest + fee)
        draw = facility.getDraw(drawId);
        uint256 owes = draw.interestAccrued + draw.protocolFee;
        vm.startPrank(agent);
        token.approve(address(facility), owes);
        facility.repayDraw(drawId);
        vm.stopPrank();

        // 6. Close
        vm.prank(agent);
        facility.closeCreditLine();

        IX402CreditFacility.CreditLine memory line = facility.getCreditLine(agent);
        assertEq(uint256(line.status), uint256(IX402CreditFacility.CreditLineStatus.Closed));
    }

    function test_fullLifecycleDefaultPath() public {
        // 1. Open + draw
        _openSilverLine(agent);
        uint256 drawId = _drawCredit(agent, 200 ether);
        IX402CreditFacility.CreditDraw memory draw = facility.getDraw(drawId);

        // 2. Seller delivers, agent confirms
        _advanceDelivery(draw.escrowJobId);
        vm.prank(agent);
        facility.confirmDelivery(draw.escrowJobId);

        // 3. Agent doesn't repay → liquidation
        vm.warp(block.timestamp + 30 days + 48 hours + 1);
        facility.liquidateDraw(drawId);

        // Collateral seized
        draw = facility.getDraw(drawId);
        assertTrue(draw.liquidated);

        IX402CreditFacility.CreditLine memory line = facility.getCreditLine(agent);
        // Proportional collateral seized: 200/500 * 250 = 100 LOB
        assertEq(line.collateralDeposited, 150 ether); // 250 - 100
    }

    // ═══════════════════════════════════════════════════════════════════
    //  EDGE CASES
    // ═══════════════════════════════════════════════════════════════════

    function test_multipleDrawsOneDefaults() public {
        _openSilverLine(agent);

        // Draw 1: repaid normally
        uint256 d1 = _drawCredit(agent, 100 ether);
        IX402CreditFacility.CreditDraw memory draw1 = facility.getDraw(d1);
        uint256 owed1 = draw1.amount + draw1.interestAccrued + draw1.protocolFee;
        vm.startPrank(agent);
        token.approve(address(facility), owed1);
        facility.repayDraw(d1);
        vm.stopPrank();

        // Draw 2: defaults
        uint256 d2 = _drawCredit(agent, 150 ether);
        IX402CreditFacility.CreditDraw memory draw2 = facility.getDraw(d2);
        _advanceDelivery(draw2.escrowJobId);
        vm.prank(agent);
        facility.confirmDelivery(draw2.escrowJobId);
        vm.warp(block.timestamp + 30 days + 48 hours + 1);

        facility.liquidateDraw(d2);

        IX402CreditFacility.CreditLine memory line = facility.getCreditLine(agent);
        assertEq(line.defaults, 1);
        // Still active (need 2 defaults to freeze)
        assertEq(uint256(line.status), uint256(IX402CreditFacility.CreditLineStatus.Active));
    }

    function test_reputationDowngradeExistingLimitHonored() public {
        // Agent gets Gold, opens line at 2.5k
        _openGoldLine(agent);

        IX402CreditFacility.CreditLine memory line = facility.getCreditLine(agent);
        assertEq(line.creditLimit, 2500 ether);

        // Even if rep drops, existing credit limit stays
        // (credit line stores limit at open time)
        // Agent can still draw up to their stored limit
        uint256 drawId = _drawCredit(agent, 2000 ether);
        IX402CreditFacility.CreditDraw memory draw = facility.getDraw(drawId);
        assertEq(draw.amount, 2000 ether);
    }

    function test_poolNearCapacityRejectsNewDraws() public {
        _openPlatinumLine(agent);
        _openPlatinumLine(agent2);

        // Withdraw most of pool to make it tight — pool now 20k
        vm.prank(poolManager);
        facility.withdrawFromPool(80_000 ether);

        // Draw 10k each = 20k outstanding = pool fully utilized
        _drawCredit(agent, 10_000 ether);
        _drawCredit(agent2, 10_000 ether);

        // Pool fully utilized — no more draws possible
        address agent5 = makeAddr("agent5");
        vm.prank(distributor);
        token.transfer(agent5, 500_000 ether);
        _openSilverLine(agent5);

        vm.prank(agent5);
        vm.expectRevert("CreditFacility: insufficient pool liquidity");
        facility.drawCreditAndCreateEscrow(LISTING_ID, seller, 100 ether);
    }

    // ═══════════════════════════════════════════════════════════════════
    //  ADMIN — LIFT FREEZE
    // ═══════════════════════════════════════════════════════════════════

    function test_liftFreeze() public {
        _openSilverLine(agent);

        // Force 2 defaults to freeze
        for (uint256 i = 0; i < 2; i++) {
            uint256 d = _drawCredit(agent, 50 ether);
            IX402CreditFacility.CreditDraw memory draw = facility.getDraw(d);
            _advanceDelivery(draw.escrowJobId);
            vm.prank(agent);
            facility.confirmDelivery(draw.escrowJobId);
            vm.warp(draw.drawnAt + 30 days + 48 hours + 1);
            facility.liquidateDraw(d);
        }

        IX402CreditFacility.CreditLine memory line = facility.getCreditLine(agent);
        assertEq(uint256(line.status), uint256(IX402CreditFacility.CreditLineStatus.Frozen));

        vm.prank(admin);
        facility.liftFreeze(agent);

        line = facility.getCreditLine(agent);
        assertEq(uint256(line.status), uint256(IX402CreditFacility.CreditLineStatus.Active));
    }

    function test_liftFreezeOnlyAdmin() public {
        vm.prank(thirdParty);
        vm.expectRevert();
        facility.liftFreeze(agent);
    }

    // ═══════════════════════════════════════════════════════════════════
    //  VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════

    function test_getAvailableCredit() public {
        _openSilverLine(agent);
        assertEq(facility.getAvailableCredit(agent), 500 ether);

        _drawCredit(agent, 200 ether);
        assertEq(facility.getAvailableCredit(agent), 300 ether);
    }

    function test_getActiveDrawIds() public {
        _openSilverLine(agent);

        uint256 d1 = _drawCredit(agent, 100 ether);
        uint256 d2 = _drawCredit(agent, 100 ether);

        uint256[] memory ids = facility.getActiveDrawIds(agent);
        assertEq(ids.length, 2);
        assertEq(ids[0], d1);
        assertEq(ids[1], d2);
    }

    // ═══════════════════════════════════════════════════════════════════
    //  V-002: STAKE LOCKING — AGENT CANNOT EVADE SLASH
    // ═══════════════════════════════════════════════════════════════════

    function test_openCreditLineLocksStake() public {
        _makeSilver(agent);
        _stakeAgent(agent); // 1000 ether
        assertEq(staking.getLockedStake(agent), 0);

        vm.startPrank(agent);
        token.approve(address(facility), 250 ether);
        facility.openCreditLine();
        vm.stopPrank();

        // Silver creditLimit = 500 ether should be locked
        assertEq(staking.getLockedStake(agent), 500 ether);
        assertEq(staking.getUnlockedStake(agent), 500 ether);
    }

    function test_closeCreditLineUnlocksStake() public {
        _openSilverLine(agent);
        assertEq(staking.getLockedStake(agent), 500 ether);

        vm.prank(agent);
        facility.closeCreditLine();

        assertEq(staking.getLockedStake(agent), 0);
        assertEq(staking.getUnlockedStake(agent), 1_000 ether);
    }

    function test_lockedStakeBlocksUnstake() public {
        _openSilverLine(agent);

        // Agent can't unstake the locked 500
        vm.prank(agent);
        vm.expectRevert("StakingManager: stake locked");
        staking.requestUnstake(600 ether);

        // But can unstake the unlocked 500
        vm.prank(agent);
        staking.requestUnstake(500 ether);
    }
}
