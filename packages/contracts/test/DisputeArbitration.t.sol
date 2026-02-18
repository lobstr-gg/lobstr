// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/LOBToken.sol";
import "../src/StakingManager.sol";
import "../src/ReputationSystem.sol";
import "../src/DisputeArbitration.sol";
import "../src/SybilGuard.sol";

contract MockSybilGuardDA {
    mapping(address => bool) public banned;

    function checkBanned(address user) external view returns (bool) { return banned[user]; }
    function checkAnyBanned(address[] calldata) external pure returns (bool) { return false; }
    function setBanned(address user, bool status) external { banned[user] = status; }
}

/// @dev Mock escrow that records resolveDispute calls (for DisputeArbitration tests)
contract MockEscrow {
    uint256 public lastResolvedJobId;
    bool public lastBuyerWins;
    uint256 public resolveCallCount;
    uint256 public drawCallCount;

    function resolveDispute(uint256 jobId, bool buyerWins) external {
        lastResolvedJobId = jobId;
        lastBuyerWins = buyerWins;
        resolveCallCount++;
    }

    function resolveDisputeDraw(uint256 jobId) external {
        lastResolvedJobId = jobId;
        drawCallCount++;
    }
}

contract DisputeArbitrationTest is Test {
    LOBToken public token;
    StakingManager public staking;
    ReputationSystem public reputation;
    DisputeArbitration public dispute;
    MockSybilGuardDA public mockSybilGuard;
    MockEscrow public mockEscrow;

    address public admin = makeAddr("admin");
    address public distributor = makeAddr("distributor");
    address public buyer = makeAddr("buyer");
    address public seller = makeAddr("seller");

    address public arb1 = makeAddr("arb1");
    address public arb2 = makeAddr("arb2");
    address public arb3 = makeAddr("arb3");
    address public arb4 = makeAddr("arb4");

    function setUp() public {
        vm.startPrank(admin);
        token = new LOBToken(distributor);
        staking = new StakingManager(address(token));
        reputation = new ReputationSystem();
        mockSybilGuard = new MockSybilGuardDA();
        mockEscrow = new MockEscrow();
        dispute = new DisputeArbitration(address(token), address(staking), address(reputation), address(mockSybilGuard));

        // Wire escrow + grant roles
        dispute.setEscrowEngine(address(mockEscrow));
        dispute.grantRole(dispute.ESCROW_ROLE(), address(mockEscrow));
        staking.grantRole(staking.SLASHER_ROLE(), address(dispute));
        reputation.grantRole(reputation.RECORDER_ROLE(), address(dispute));
        vm.stopPrank();

        // Fund arbitrators
        vm.startPrank(distributor);
        token.transfer(arb1, 100_000 ether);
        token.transfer(arb2, 100_000 ether);
        token.transfer(arb3, 100_000 ether);
        token.transfer(arb4, 100_000 ether);
        token.transfer(seller, 10_000 ether);
        vm.stopPrank();

        // Seller stakes
        vm.startPrank(seller);
        token.approve(address(staking), 1_000 ether);
        staking.stake(1_000 ether);
        vm.stopPrank();

        // Register 3 arbitrators (Principal rank)
        _stakeArbitrator(arb1, 100_000 ether);
        _stakeArbitrator(arb2, 100_000 ether);
        _stakeArbitrator(arb3, 100_000 ether);
    }

    function _stakeArbitrator(address arb, uint256 amount) internal {
        vm.startPrank(arb);
        token.approve(address(dispute), amount);
        dispute.stakeAsArbitrator(amount);
        vm.stopPrank();
    }

    function test_StakeAsArbitrator() public view {
        IDisputeArbitration.ArbitratorInfo memory info = dispute.getArbitratorInfo(arb1);
        assertEq(info.stake, 100_000 ether);
        assertEq(uint256(info.rank), uint256(IDisputeArbitration.ArbitratorRank.Principal));
        assertTrue(info.active);
    }

    function test_StakeAsArbitrator_Junior() public {
        vm.startPrank(arb4);
        token.approve(address(dispute), 5_000 ether);
        dispute.stakeAsArbitrator(5_000 ether);
        vm.stopPrank();

        IDisputeArbitration.ArbitratorInfo memory info = dispute.getArbitratorInfo(arb4);
        assertEq(uint256(info.rank), uint256(IDisputeArbitration.ArbitratorRank.Junior));
    }

    function test_StakeAsArbitrator_RevertBelowMinimum() public {
        vm.startPrank(arb4);
        token.approve(address(dispute), 1_000 ether);

        vm.expectRevert("DisputeArbitration: below minimum stake");
        dispute.stakeAsArbitrator(1_000 ether);
        vm.stopPrank();
    }

    function test_UnstakeAsArbitrator() public {
        uint256 balBefore = token.balanceOf(arb1);

        vm.prank(arb1);
        dispute.unstakeAsArbitrator(100_000 ether);

        assertEq(token.balanceOf(arb1), balBefore + 100_000 ether);

        IDisputeArbitration.ArbitratorInfo memory info = dispute.getArbitratorInfo(arb1);
        assertFalse(info.active);
        assertEq(uint256(info.rank), uint256(IDisputeArbitration.ArbitratorRank.None));
    }

    function test_SubmitDispute() public {
        vm.prank(address(mockEscrow));
        uint256 disputeId = dispute.submitDispute(
            1, // jobId
            buyer,
            seller,
            100 ether,
            address(token),
            "ipfs://evidence"
        );

        assertEq(disputeId, 1);

        IDisputeArbitration.Dispute memory d = dispute.getDispute(disputeId);
        assertEq(d.jobId, 1);
        assertEq(d.buyer, buyer);
        assertEq(d.seller, seller);
        assertEq(uint256(d.status), uint256(IDisputeArbitration.DisputeStatus.EvidencePhase));
    }

    function test_SubmitDispute_RevertNotEscrow() public {
        vm.prank(buyer);
        vm.expectRevert();
        dispute.submitDispute(1, buyer, seller, 100 ether, address(token), "ipfs://evidence");
    }

    function test_SubmitCounterEvidence() public {
        vm.prank(address(mockEscrow));
        uint256 disputeId = dispute.submitDispute(1, buyer, seller, 100 ether, address(token), "ipfs://buyer-evidence");

        vm.prank(seller);
        dispute.submitCounterEvidence(disputeId, "ipfs://seller-evidence");

        IDisputeArbitration.Dispute memory d = dispute.getDispute(disputeId);
        assertEq(d.sellerEvidenceURI, "ipfs://seller-evidence");
        assertEq(uint256(d.status), uint256(IDisputeArbitration.DisputeStatus.Voting));
    }

    function test_SubmitCounterEvidence_RevertNotSeller() public {
        vm.prank(address(mockEscrow));
        uint256 disputeId = dispute.submitDispute(1, buyer, seller, 100 ether, address(token), "ipfs://evidence");

        vm.prank(buyer);
        vm.expectRevert("DisputeArbitration: not seller");
        dispute.submitCounterEvidence(disputeId, "ipfs://fake");
    }

    function test_SubmitCounterEvidence_RevertDeadlinePassed() public {
        vm.prank(address(mockEscrow));
        uint256 disputeId = dispute.submitDispute(1, buyer, seller, 100 ether, address(token), "ipfs://evidence");

        vm.warp(block.timestamp + 25 hours);

        vm.prank(seller);
        vm.expectRevert("DisputeArbitration: deadline passed");
        dispute.submitCounterEvidence(disputeId, "ipfs://late");
    }

    function test_AdvanceToVoting() public {
        vm.prank(address(mockEscrow));
        uint256 disputeId = dispute.submitDispute(1, buyer, seller, 100 ether, address(token), "ipfs://evidence");

        vm.warp(block.timestamp + 25 hours);
        dispute.advanceToVoting(disputeId);

        IDisputeArbitration.Dispute memory d = dispute.getDispute(disputeId);
        assertEq(uint256(d.status), uint256(IDisputeArbitration.DisputeStatus.Voting));
    }

    function test_FullDisputeFlow_BuyerWins() public {
        // Submit dispute
        vm.prank(address(mockEscrow));
        uint256 disputeId = dispute.submitDispute(1, buyer, seller, 100 ether, address(token), "ipfs://evidence");

        IDisputeArbitration.Dispute memory d = dispute.getDispute(disputeId);

        // Counter evidence
        vm.prank(seller);
        dispute.submitCounterEvidence(disputeId, "ipfs://counter");

        // Vote — 2 for buyer, 1 for seller
        vm.prank(d.arbitrators[0]);
        dispute.vote(disputeId, true);

        vm.prank(d.arbitrators[1]);
        dispute.vote(disputeId, true);

        vm.prank(d.arbitrators[2]);
        dispute.vote(disputeId, false);

        // Execute ruling
        dispute.executeRuling(disputeId);

        d = dispute.getDispute(disputeId);
        assertEq(uint256(d.status), uint256(IDisputeArbitration.DisputeStatus.Resolved));
        assertEq(uint256(d.ruling), uint256(IDisputeArbitration.Ruling.BuyerWins));
    }

    function test_FullDisputeFlow_SellerWins() public {
        vm.prank(address(mockEscrow));
        uint256 disputeId = dispute.submitDispute(1, buyer, seller, 100 ether, address(token), "ipfs://evidence");

        IDisputeArbitration.Dispute memory d = dispute.getDispute(disputeId);

        vm.prank(seller);
        dispute.submitCounterEvidence(disputeId, "ipfs://counter");

        // Vote — 2 for seller, 1 for buyer
        vm.prank(d.arbitrators[0]);
        dispute.vote(disputeId, false);

        vm.prank(d.arbitrators[1]);
        dispute.vote(disputeId, false);

        vm.prank(d.arbitrators[2]);
        dispute.vote(disputeId, true);

        dispute.executeRuling(disputeId);

        d = dispute.getDispute(disputeId);
        assertEq(uint256(d.ruling), uint256(IDisputeArbitration.Ruling.SellerWins));
    }

    function test_Vote_RevertNotAssigned() public {
        vm.prank(address(mockEscrow));
        uint256 disputeId = dispute.submitDispute(1, buyer, seller, 100 ether, address(token), "ipfs://evidence");

        vm.prank(seller);
        dispute.submitCounterEvidence(disputeId, "ipfs://counter");

        vm.prank(buyer); // not an arbitrator
        vm.expectRevert("DisputeArbitration: not assigned");
        dispute.vote(disputeId, true);
    }

    function test_Vote_RevertDoubleVote() public {
        vm.prank(address(mockEscrow));
        uint256 disputeId = dispute.submitDispute(1, buyer, seller, 100 ether, address(token), "ipfs://evidence");

        IDisputeArbitration.Dispute memory d = dispute.getDispute(disputeId);

        vm.prank(seller);
        dispute.submitCounterEvidence(disputeId, "ipfs://counter");

        vm.startPrank(d.arbitrators[0]);
        dispute.vote(disputeId, true);

        vm.expectRevert("DisputeArbitration: already voted");
        dispute.vote(disputeId, false);
        vm.stopPrank();
    }

    function test_ExecuteRuling_RevertNotAllVotes() public {
        vm.prank(address(mockEscrow));
        uint256 disputeId = dispute.submitDispute(1, buyer, seller, 100 ether, address(token), "ipfs://evidence");

        IDisputeArbitration.Dispute memory d = dispute.getDispute(disputeId);

        vm.prank(seller);
        dispute.submitCounterEvidence(disputeId, "ipfs://counter");

        vm.prank(d.arbitrators[0]);
        dispute.vote(disputeId, true);

        vm.expectRevert("DisputeArbitration: voting still open");
        dispute.executeRuling(disputeId);
    }

    function test_ActiveArbitratorCount() public view {
        assertEq(dispute.getActiveArbitratorCount(), 3);
    }

    function test_NotEnoughArbitrators() public {
        // Unstake 2 arbitrators, leaving only 1
        vm.prank(arb1);
        dispute.unstakeAsArbitrator(100_000 ether);
        vm.prank(arb2);
        dispute.unstakeAsArbitrator(100_000 ether);

        vm.prank(address(mockEscrow));
        vm.expectRevert("DisputeArbitration: not enough arbitrators");
        dispute.submitDispute(1, buyer, seller, 100 ether, address(token), "ipfs://evidence");
    }

    function test_ExecuteRuling_ZeroVotes_BuyerWins() public {
        // Submit dispute
        vm.prank(address(mockEscrow));
        uint256 disputeId = dispute.submitDispute(1, buyer, seller, 100 ether, address(token), "ipfs://evidence");

        IDisputeArbitration.Dispute memory d = dispute.getDispute(disputeId);

        // Advance to voting (skip counter-evidence)
        vm.warp(block.timestamp + 25 hours);
        dispute.advanceToVoting(disputeId);

        // Nobody votes — warp past voting deadline
        vm.warp(block.timestamp + 4 days);

        uint256 sellerStakeBefore = staking.getStake(seller);

        // Execute ruling with 0 votes
        dispute.executeRuling(disputeId);

        d = dispute.getDispute(disputeId);
        assertEq(uint256(d.status), uint256(IDisputeArbitration.DisputeStatus.Resolved));
        assertEq(uint256(d.ruling), uint256(IDisputeArbitration.Ruling.BuyerWins));

        // Seller should NOT be slashed (arbitrator failure, not seller fault)
        assertEq(staking.getStake(seller), sellerStakeBefore);
    }

    // --- A3: whenNotPaused tests ---

    function test_DisputeFunctions_RevertWhenPaused() public {
        // Submit a dispute and advance to voting first
        vm.prank(address(mockEscrow));
        uint256 disputeId = dispute.submitDispute(1, buyer, seller, 100 ether, address(token), "ipfs://evidence");
        IDisputeArbitration.Dispute memory d = dispute.getDispute(disputeId);

        vm.prank(seller);
        dispute.submitCounterEvidence(disputeId, "ipfs://counter");

        // Pause the contract
        vm.prank(admin);
        dispute.pause();

        // advanceToVoting should revert (need a new dispute for this)
        vm.prank(address(mockEscrow));
        uint256 disputeId2 = dispute.submitDispute(2, buyer, seller, 100 ether, address(token), "ipfs://evidence2");
        vm.warp(block.timestamp + 25 hours);

        vm.expectRevert("Pausable: paused");
        dispute.advanceToVoting(disputeId2);

        // vote should revert
        vm.prank(d.arbitrators[0]);
        vm.expectRevert("Pausable: paused");
        dispute.vote(disputeId, true);

        // executeRuling should revert
        vm.expectRevert("Pausable: paused");
        dispute.executeRuling(disputeId);
    }

    // --- A4: Ban check on voting ---

    function test_Vote_RevertIfArbitratorBanned() public {
        vm.prank(address(mockEscrow));
        uint256 disputeId = dispute.submitDispute(1, buyer, seller, 100 ether, address(token), "ipfs://evidence");
        IDisputeArbitration.Dispute memory d = dispute.getDispute(disputeId);

        vm.prank(seller);
        dispute.submitCounterEvidence(disputeId, "ipfs://counter");

        // Ban one of the arbitrators
        mockSybilGuard.setBanned(d.arbitrators[0], true);

        vm.prank(d.arbitrators[0]);
        vm.expectRevert("DisputeArbitration: arbitrator banned");
        dispute.vote(disputeId, true);
    }

    // --- A1: Tied disputes draw ---

    function test_ExecuteRuling_Tie_Draw() public {
        // Register a 4th arbitrator to handle the next dispute
        _stakeArbitrator(arb4, 100_000 ether);

        // Submit dispute
        vm.prank(address(mockEscrow));
        uint256 disputeId = dispute.submitDispute(1, buyer, seller, 100 ether, address(token), "ipfs://evidence");
        IDisputeArbitration.Dispute memory d = dispute.getDispute(disputeId);

        // Counter evidence
        vm.prank(seller);
        dispute.submitCounterEvidence(disputeId, "ipfs://counter");

        // Vote — 1 for buyer, 1 for seller (1 abstains)
        vm.prank(d.arbitrators[0]);
        dispute.vote(disputeId, true);

        vm.prank(d.arbitrators[1]);
        dispute.vote(disputeId, false);

        // Warp past voting deadline so we can execute with 2/3 votes
        vm.warp(block.timestamp + 4 days);

        uint256 sellerStakeBefore = staking.getStake(seller);

        dispute.executeRuling(disputeId);

        d = dispute.getDispute(disputeId);
        assertEq(uint256(d.status), uint256(IDisputeArbitration.DisputeStatus.Resolved));
        assertEq(uint256(d.ruling), uint256(IDisputeArbitration.Ruling.Draw));

        // No slash on draw
        assertEq(staking.getStake(seller), sellerStakeBefore);

        // Draw should call resolveDisputeDraw
        assertEq(mockEscrow.drawCallCount(), 1);
    }

    function test_RemoveArbitrator_BySybilGuard() public {
        assertEq(dispute.getActiveArbitratorCount(), 3);

        // Grant SYBIL_GUARD_ROLE to mockSybilGuard for this test
        bytes32 sybilGuardRole = dispute.SYBIL_GUARD_ROLE();
        vm.prank(admin);
        dispute.grantRole(sybilGuardRole, address(mockSybilGuard));

        // Remove arb1 from the pool
        vm.prank(address(mockSybilGuard));
        dispute.removeArbitrator(arb1);

        assertEq(dispute.getActiveArbitratorCount(), 2);

        IDisputeArbitration.ArbitratorInfo memory info = dispute.getArbitratorInfo(arb1);
        assertFalse(info.active);
    }
}
