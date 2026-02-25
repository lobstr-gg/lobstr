// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {MultiPartyEscrow} from "../src/MultiPartyEscrow.sol";
import {LOBToken} from "../src/LOBToken.sol";
import {IEscrowEngine} from "../src/interfaces/IEscrowEngine.sol";
import {IDisputeArbitration} from "../src/interfaces/IDisputeArbitration.sol";
import {IMultiPartyEscrow} from "../src/interfaces/IMultiPartyEscrow.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockEscrowForMulti {
    uint256 private _nextJobId = 1;
    mapping(uint256 => IEscrowEngine.Job) private _jobs;
    mapping(uint256 => uint256) private _jobDisputeIds;
    mapping(uint256 => address) private _jobPayers;

    function createJob(uint256 listingId, address seller, uint256 amount, address token, uint256 deliveryDeadline) external returns (uint256) {
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
            skillId: 0,
            deliveryDeadline: deliveryDeadline
        });

        // Transfer tokens from caller (MultiPartyEscrow)
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

    function jobPayer(uint256 jobId) external view returns (address) {
        return _jobPayers[jobId];
    }

    function setJobPayer(uint256 jobId, address payer) external {
        _jobPayers[jobId] = payer;
    }

    function setJobFee(uint256 jobId, uint256 fee) external {
        _jobs[jobId].fee = fee;
    }

    // Track proxy calls for testing
    uint256 public lastConfirmedJobId;
    uint256 public lastDisputedJobId;
    string public lastEvidenceURI;

    function confirmDelivery(uint256 jobId) external {
        require(_jobs[jobId].buyer == msg.sender, "MockEscrow: not buyer");
        lastConfirmedJobId = jobId;
        _jobs[jobId].status = IEscrowEngine.JobStatus.Confirmed;
    }

    function initiateDispute(uint256 jobId, string calldata evidenceURI) external {
        require(_jobs[jobId].buyer == msg.sender, "MockEscrow: not buyer");
        lastDisputedJobId = jobId;
        lastEvidenceURI = evidenceURI;
        _jobs[jobId].status = IEscrowEngine.JobStatus.Disputed;
    }
}

contract MockDisputeForMulti {
    mapping(uint256 => IDisputeArbitration.Dispute) private _disputes;

    function setDispute(uint256 disputeId, IDisputeArbitration.Ruling ruling) external {
        _disputes[disputeId].ruling = ruling;
    }

    function getDispute(uint256 disputeId) external view returns (IDisputeArbitration.Dispute memory) {
        return _disputes[disputeId];
    }
}

contract MockSybilGuardForMulti {
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

contract MultiPartyEscrowTest is Test {
    event MultiJobCreated(
        uint256 indexed groupId,
        address indexed buyer,
        uint256[] jobIds,
        address[] sellers,
        uint256[] shares,
        address token,
        uint256 totalAmount
    );

    LOBToken public token;
    MultiPartyEscrow public multiEscrow;
    MockEscrowForMulti public escrow;
    MockDisputeForMulti public dispute;
    MockSybilGuardForMulti public sybilGuard;

    address public admin = makeAddr("admin");
    address public distributor = makeAddr("distributor");
    address public buyer = makeAddr("buyer");
    address public seller1 = makeAddr("seller1");
    address public seller2 = makeAddr("seller2");
    address public seller3 = makeAddr("seller3");

    function setUp() public {
        vm.startPrank(admin);
        token = new LOBToken();
        token.initialize(distributor);
        escrow = new MockEscrowForMulti();
        dispute = new MockDisputeForMulti();
        sybilGuard = new MockSybilGuardForMulti();
        multiEscrow = new MultiPartyEscrow();
        multiEscrow.initialize(
            address(escrow),
            address(dispute),
            address(token),
            address(sybilGuard)
        );
        vm.stopPrank();

        // Fund buyer
        vm.prank(distributor);
        require(token.transfer(buyer, 100_000 ether));
    }

    // ═══════════════════════════════════════════════════════════════
    //  HELPERS
    // ═══════════════════════════════════════════════════════════════

    function _create3SellerJob() internal returns (uint256) {
        address[] memory sellers = new address[](3);
        sellers[0] = seller1;
        sellers[1] = seller2;
        sellers[2] = seller3;

        uint256[] memory shares = new uint256[](3);
        shares[0] = 500 ether;
        shares[1] = 300 ether;
        shares[2] = 200 ether;

        uint256[] memory listingIds = new uint256[](3);
        listingIds[0] = 1;
        listingIds[1] = 2;
        listingIds[2] = 3;

        vm.startPrank(buyer);
        token.approve(address(multiEscrow), 1000 ether);
        uint256 groupId = multiEscrow.createMultiJob(sellers, shares, listingIds, address(token), 1000 ether, block.timestamp + 7 days, "ipfs://group");
        vm.stopPrank();

        return groupId;
    }

    // ═══════════════════════════════════════════════════════════════
    //  CREATE
    // ═══════════════════════════════════════════════════════════════

    function test_create3SellerJob() public {
        uint256 groupId = _create3SellerJob();

        IMultiPartyEscrow.JobGroup memory group = multiEscrow.getGroup(groupId);
        assertEq(group.groupId, 1);
        assertEq(group.buyer, buyer);
        assertEq(group.totalAmount, 1000 ether);
        assertEq(group.jobCount, 3);

        uint256[] memory jobIds = multiEscrow.getGroupJobIds(groupId);
        assertEq(jobIds.length, 3);

        // Verify individual jobs on mock escrow
        IEscrowEngine.Job memory job1 = escrow.getJob(jobIds[0]);
        assertEq(job1.seller, seller1);
        assertEq(job1.amount, 500 ether);

        IEscrowEngine.Job memory job2 = escrow.getJob(jobIds[1]);
        assertEq(job2.seller, seller2);
        assertEq(job2.amount, 300 ether);
    }

    // ═══════════════════════════════════════════════════════════════
    //  REVERTS
    // ═══════════════════════════════════════════════════════════════

    function test_revertMismatchedArrays() public {
        address[] memory sellers = new address[](2);
        sellers[0] = seller1;
        sellers[1] = seller2;

        uint256[] memory shares = new uint256[](3);
        shares[0] = 500 ether;
        shares[1] = 300 ether;
        shares[2] = 200 ether;

        uint256[] memory listingIds = new uint256[](2);
        listingIds[0] = 1;
        listingIds[1] = 2;

        vm.startPrank(buyer);
        token.approve(address(multiEscrow), 1000 ether);
        vm.expectRevert("MultiPartyEscrow: array length mismatch");
        multiEscrow.createMultiJob(sellers, shares, listingIds, address(token), 1000 ether, block.timestamp + 7 days, "");
        vm.stopPrank();
    }

    function test_revertSharesSumMismatch() public {
        address[] memory sellers = new address[](2);
        sellers[0] = seller1;
        sellers[1] = seller2;

        uint256[] memory shares = new uint256[](2);
        shares[0] = 500 ether;
        shares[1] = 300 ether; // sum = 800, but totalAmount = 1000

        uint256[] memory listingIds = new uint256[](2);
        listingIds[0] = 1;
        listingIds[1] = 2;

        vm.startPrank(buyer);
        token.approve(address(multiEscrow), 1000 ether);
        vm.expectRevert("MultiPartyEscrow: shares sum mismatch");
        multiEscrow.createMultiJob(sellers, shares, listingIds, address(token), 1000 ether, block.timestamp + 7 days, "");
        vm.stopPrank();
    }

    function test_revertSingleSeller() public {
        address[] memory sellers = new address[](1);
        sellers[0] = seller1;

        uint256[] memory shares = new uint256[](1);
        shares[0] = 1000 ether;

        uint256[] memory listingIds = new uint256[](1);
        listingIds[0] = 1;

        vm.startPrank(buyer);
        token.approve(address(multiEscrow), 1000 ether);
        vm.expectRevert("MultiPartyEscrow: min 2 sellers");
        multiEscrow.createMultiJob(sellers, shares, listingIds, address(token), 1000 ether, block.timestamp + 7 days, "");
        vm.stopPrank();
    }

    function test_revertTooManySellers() public {
        address[] memory sellers = new address[](11);
        uint256[] memory shares = new uint256[](11);
        uint256[] memory listingIds = new uint256[](11);

        for (uint256 i = 0; i < 11; i++) {
            sellers[i] = makeAddr(string(abi.encodePacked("seller", i)));
            shares[i] = 100 ether;
            listingIds[i] = i + 1;
        }

        vm.startPrank(buyer);
        token.approve(address(multiEscrow), 1100 ether);
        vm.expectRevert("MultiPartyEscrow: max sellers exceeded");
        multiEscrow.createMultiJob(sellers, shares, listingIds, address(token), 1100 ether, block.timestamp + 7 days, "");
        vm.stopPrank();
    }

    function test_revertBuyerBanned() public {
        sybilGuard.setBanned(buyer, true);

        address[] memory sellers = new address[](2);
        sellers[0] = seller1;
        sellers[1] = seller2;

        uint256[] memory shares = new uint256[](2);
        shares[0] = 500 ether;
        shares[1] = 500 ether;

        uint256[] memory listingIds = new uint256[](2);
        listingIds[0] = 1;
        listingIds[1] = 2;

        vm.startPrank(buyer);
        token.approve(address(multiEscrow), 1000 ether);
        vm.expectRevert("MultiPartyEscrow: buyer banned");
        multiEscrow.createMultiJob(sellers, shares, listingIds, address(token), 1000 ether, block.timestamp + 7 days, "");
        vm.stopPrank();
    }

    // ═══════════════════════════════════════════════════════════════
    //  GROUP STATUS
    // ═══════════════════════════════════════════════════════════════

    function test_groupStatusActive() public {
        uint256 groupId = _create3SellerJob();

        IMultiPartyEscrow.GroupStatus status = multiEscrow.getGroupStatus(groupId);
        assertEq(uint256(status), uint256(IMultiPartyEscrow.GroupStatus.Active));
    }

    function test_groupStatusAllConfirmed() public {
        uint256 groupId = _create3SellerJob();
        uint256[] memory jobIds = multiEscrow.getGroupJobIds(groupId);

        for (uint256 i = 0; i < jobIds.length; i++) {
            escrow.setJobStatus(jobIds[i], IEscrowEngine.JobStatus.Confirmed);
        }

        IMultiPartyEscrow.GroupStatus status = multiEscrow.getGroupStatus(groupId);
        assertEq(uint256(status), uint256(IMultiPartyEscrow.GroupStatus.AllConfirmed));
    }

    function test_groupStatusPartialDispute() public {
        uint256 groupId = _create3SellerJob();
        uint256[] memory jobIds = multiEscrow.getGroupJobIds(groupId);

        escrow.setJobStatus(jobIds[0], IEscrowEngine.JobStatus.Confirmed);
        escrow.setJobStatus(jobIds[1], IEscrowEngine.JobStatus.Disputed);
        escrow.setJobStatus(jobIds[2], IEscrowEngine.JobStatus.Confirmed);

        IMultiPartyEscrow.GroupStatus status = multiEscrow.getGroupStatus(groupId);
        assertEq(uint256(status), uint256(IMultiPartyEscrow.GroupStatus.PartialDispute));
    }

    function test_groupStatusReleasedCountsAsConfirmed() public {
        uint256 groupId = _create3SellerJob();
        uint256[] memory jobIds = multiEscrow.getGroupJobIds(groupId);

        escrow.setJobStatus(jobIds[0], IEscrowEngine.JobStatus.Released);
        escrow.setJobStatus(jobIds[1], IEscrowEngine.JobStatus.Confirmed);
        escrow.setJobStatus(jobIds[2], IEscrowEngine.JobStatus.Resolved);

        IMultiPartyEscrow.GroupStatus status = multiEscrow.getGroupStatus(groupId);
        assertEq(uint256(status), uint256(IMultiPartyEscrow.GroupStatus.AllConfirmed));
    }

    // ═══════════════════════════════════════════════════════════════
    //  VIEW REVERTS
    // ═══════════════════════════════════════════════════════════════

    function test_revertGetGroupNotFound() public {
        vm.expectRevert("MultiPartyEscrow: group not found");
        multiEscrow.getGroup(999);
    }

    function test_revertGetGroupStatusNotFound() public {
        vm.expectRevert("MultiPartyEscrow: group not found");
        multiEscrow.getGroupStatus(999);
    }

    // ═══════════════════════════════════════════════════════════════
    //  JOB TO GROUP MAPPING
    // ═══════════════════════════════════════════════════════════════

    function test_jobToGroupMapping() public {
        uint256 groupId = _create3SellerJob();
        uint256[] memory jobIds = multiEscrow.getGroupJobIds(groupId);

        for (uint256 i = 0; i < jobIds.length; i++) {
            assertEq(multiEscrow.getJobGroup(jobIds[i]), groupId);
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════

    function test_revertZeroEscrowEngine() public {
        MultiPartyEscrow m = new MultiPartyEscrow();
        vm.expectRevert("MultiPartyEscrow: zero escrowEngine");
        m.initialize(address(0), address(dispute), address(token), address(sybilGuard));
    }

    function test_revertZeroDisputeArbitration() public {
        MultiPartyEscrow m = new MultiPartyEscrow();
        vm.expectRevert("MultiPartyEscrow: zero disputeArbitration");
        m.initialize(address(escrow), address(0), address(token), address(sybilGuard));
    }

    function test_revertZeroLobToken() public {
        MultiPartyEscrow m = new MultiPartyEscrow();
        vm.expectRevert("MultiPartyEscrow: zero lobToken");
        m.initialize(address(escrow), address(dispute), address(0), address(sybilGuard));
    }

    function test_revertZeroSybilGuard() public {
        MultiPartyEscrow m = new MultiPartyEscrow();
        vm.expectRevert("MultiPartyEscrow: zero sybilGuard");
        m.initialize(address(escrow), address(dispute), address(token), address(0));
    }

    // ═══════════════════════════════════════════════════════════════
    //  V-001: PROXY BUYER FUNCTIONS
    // ═══════════════════════════════════════════════════════════════

    function test_confirmDeliveryProxy() public {
        uint256 groupId = _create3SellerJob();
        uint256[] memory jobIds = multiEscrow.getGroupJobIds(groupId);

        // Set job to Delivered so it can be confirmed
        escrow.setJobStatus(jobIds[0], IEscrowEngine.JobStatus.Delivered);

        vm.prank(buyer);
        multiEscrow.confirmDelivery(jobIds[0]);

        assertEq(escrow.lastConfirmedJobId(), jobIds[0]);
    }

    function test_initiateDisputeProxy() public {
        uint256 groupId = _create3SellerJob();
        uint256[] memory jobIds = multiEscrow.getGroupJobIds(groupId);

        // Set job to Delivered so it can be disputed
        escrow.setJobStatus(jobIds[1], IEscrowEngine.JobStatus.Delivered);

        vm.prank(buyer);
        multiEscrow.initiateDispute(jobIds[1], "ipfs://evidence");

        assertEq(escrow.lastDisputedJobId(), jobIds[1]);
    }

    function test_revertConfirmNotBuyer() public {
        uint256 groupId = _create3SellerJob();
        uint256[] memory jobIds = multiEscrow.getGroupJobIds(groupId);

        vm.prank(seller1);
        vm.expectRevert("MultiPartyEscrow: not buyer");
        multiEscrow.confirmDelivery(jobIds[0]);
    }

    function test_revertDisputeNotBuyer() public {
        uint256 groupId = _create3SellerJob();
        uint256[] memory jobIds = multiEscrow.getGroupJobIds(groupId);

        vm.prank(seller1);
        vm.expectRevert("MultiPartyEscrow: not buyer");
        multiEscrow.initiateDispute(jobIds[0], "ipfs://evidence");
    }

    function test_revertConfirmJobNotInGroup() public {
        vm.prank(buyer);
        vm.expectRevert("MultiPartyEscrow: job not in group");
        multiEscrow.confirmDelivery(999);
    }

    function test_revertDisputeJobNotInGroup() public {
        vm.prank(buyer);
        vm.expectRevert("MultiPartyEscrow: job not in group");
        multiEscrow.initiateDispute(999, "ipfs://evidence");
    }

    // ═══════════════════════════════════════════════════════════════
    //  V-001: CLAIM REFUND
    // ═══════════════════════════════════════════════════════════════

    function test_claimRefundBuyerWins() public {
        uint256 groupId = _create3SellerJob();
        uint256[] memory jobIds = multiEscrow.getGroupJobIds(groupId);

        // Simulate: job resolved with BuyerWins
        escrow.setJobStatus(jobIds[0], IEscrowEngine.JobStatus.Resolved);
        escrow.setJobDisputeId(jobIds[0], 1);
        dispute.setDispute(1, IDisputeArbitration.Ruling.BuyerWins);

        // Simulate: EscrowEngine sends refund (500 ether) to MultiPartyEscrow
        vm.prank(distributor);
        require(token.transfer(address(multiEscrow), 500 ether));

        uint256 buyerBefore = token.balanceOf(buyer);

        vm.prank(buyer);
        multiEscrow.claimRefund(jobIds[0]);

        assertEq(token.balanceOf(buyer), buyerBefore + 500 ether);
    }

    function test_claimRefundDraw() public {
        uint256 groupId = _create3SellerJob();
        uint256[] memory jobIds = multiEscrow.getGroupJobIds(groupId);

        // Set fee so Draw split math is exercised
        escrow.setJobFee(jobIds[0], 10 ether);

        // Simulate: job resolved with Draw
        escrow.setJobStatus(jobIds[0], IEscrowEngine.JobStatus.Resolved);
        escrow.setJobDisputeId(jobIds[0], 2);
        dispute.setDispute(2, IDisputeArbitration.Ruling.Draw);

        // Draw buyer payout: half - halfFee = (500/2) - (10/2) = 250 - 5 = 245
        uint256 expectedRefund = 245 ether;

        vm.prank(distributor);
        require(token.transfer(address(multiEscrow), expectedRefund));

        uint256 buyerBefore = token.balanceOf(buyer);

        vm.prank(buyer);
        multiEscrow.claimRefund(jobIds[0]);

        assertEq(token.balanceOf(buyer), buyerBefore + expectedRefund);
    }

    function test_revertClaimRefundSellerWins() public {
        uint256 groupId = _create3SellerJob();
        uint256[] memory jobIds = multiEscrow.getGroupJobIds(groupId);

        escrow.setJobStatus(jobIds[0], IEscrowEngine.JobStatus.Resolved);
        escrow.setJobDisputeId(jobIds[0], 3);
        dispute.setDispute(3, IDisputeArbitration.Ruling.SellerWins);

        vm.prank(buyer);
        vm.expectRevert("MultiPartyEscrow: no buyer refund");
        multiEscrow.claimRefund(jobIds[0]);
    }

    function test_revertClaimRefundNotResolved() public {
        uint256 groupId = _create3SellerJob();
        uint256[] memory jobIds = multiEscrow.getGroupJobIds(groupId);

        vm.prank(buyer);
        vm.expectRevert("MultiPartyEscrow: not resolved");
        multiEscrow.claimRefund(jobIds[0]);
    }

    function test_revertClaimRefundDoubleClaim() public {
        uint256 groupId = _create3SellerJob();
        uint256[] memory jobIds = multiEscrow.getGroupJobIds(groupId);

        escrow.setJobStatus(jobIds[0], IEscrowEngine.JobStatus.Resolved);
        escrow.setJobDisputeId(jobIds[0], 1);
        dispute.setDispute(1, IDisputeArbitration.Ruling.BuyerWins);

        vm.prank(distributor);
        require(token.transfer(address(multiEscrow), 500 ether));

        vm.prank(buyer);
        multiEscrow.claimRefund(jobIds[0]);

        vm.prank(buyer);
        vm.expectRevert("MultiPartyEscrow: already claimed");
        multiEscrow.claimRefund(jobIds[0]);
    }

    function test_revertClaimRefundNotBuyer() public {
        uint256 groupId = _create3SellerJob();
        uint256[] memory jobIds = multiEscrow.getGroupJobIds(groupId);

        escrow.setJobStatus(jobIds[0], IEscrowEngine.JobStatus.Resolved);
        escrow.setJobDisputeId(jobIds[0], 1);
        dispute.setDispute(1, IDisputeArbitration.Ruling.BuyerWins);

        vm.prank(seller1);
        vm.expectRevert("MultiPartyEscrow: not buyer");
        multiEscrow.claimRefund(jobIds[0]);
    }

    function test_revertClaimRefundJobNotInGroup() public {
        vm.prank(buyer);
        vm.expectRevert("MultiPartyEscrow: job not in group");
        multiEscrow.claimRefund(999);
    }
}
