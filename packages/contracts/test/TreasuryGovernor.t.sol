// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/LOBToken.sol";
import "../src/TreasuryGovernor.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Simple mock USDC with 6 decimals for testing
contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {
        _mint(msg.sender, 100_000_000 * 1e6); // 100M USDC
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }
}

contract TreasuryGovernorTest is Test {
    LOBToken public lob;
    MockUSDC public usdc;
    TreasuryGovernor public treasury;

    address public deployer = makeAddr("deployer");
    address public distributor = makeAddr("distributor");

    address public signer1 = makeAddr("signer1");
    address public signer2 = makeAddr("signer2");
    address public signer3 = makeAddr("signer3");

    address public outsider = makeAddr("outsider");
    address public recipient = makeAddr("recipient");
    address public sybilGuard = makeAddr("sybilGuard");

    uint256 public constant TREASURY_LOB = 10_000_000 ether;
    uint256 public constant TREASURY_USDC = 1_000_000 * 1e6;

    function setUp() public {
        // Deploy tokens
        vm.startPrank(distributor);
        lob = new LOBToken(distributor);
        vm.stopPrank();

        vm.prank(deployer);
        usdc = new MockUSDC();

        // Deploy TreasuryGovernor with 3 signers, 2 required approvals
        address[] memory signers = new address[](3);
        signers[0] = signer1;
        signers[1] = signer2;
        signers[2] = signer3;

        vm.prank(deployer);
        treasury = new TreasuryGovernor(signers, 2, address(lob));

        // Fund treasury with LOB
        vm.prank(distributor);
        lob.transfer(address(treasury), TREASURY_LOB);

        // Fund treasury with USDC
        vm.prank(deployer);
        usdc.transfer(address(treasury), TREASURY_USDC);

        // Grant SYBIL_GUARD_ROLE to sybilGuard address
        // DEFAULT_ADMIN_ROLE is the treasury itself, so we prank as the treasury
        // Use startPrank because vm.prank is consumed by the SYBIL_GUARD_ROLE() staticcall
        bytes32 sybilGuardRole = treasury.SYBIL_GUARD_ROLE();
        vm.prank(address(treasury));
        treasury.grantRole(sybilGuardRole, sybilGuard);
    }

    /* ═══════════════════════════════════════════════════════════════
       CONSTRUCTOR TESTS
       ═══════════════════════════════════════════════════════════════ */

    function test_constructor_validates_min_signers() public {
        address[] memory signers = new address[](2);
        signers[0] = makeAddr("a");
        signers[1] = makeAddr("b");

        vm.expectRevert("TreasuryGovernor: min 3 signers");
        new TreasuryGovernor(signers, 2, address(lob));
    }

    function test_constructor_validates_max_signers() public {
        address[] memory signers = new address[](10);
        for (uint256 i = 0; i < 10; i++) {
            signers[i] = address(uint160(100 + i));
        }

        vm.expectRevert("TreasuryGovernor: max 9 signers");
        new TreasuryGovernor(signers, 2, address(lob));
    }

    function test_constructor_rejects_duplicate_signers() public {
        address[] memory signers = new address[](3);
        signers[0] = makeAddr("a");
        signers[1] = makeAddr("b");
        signers[2] = makeAddr("a"); // duplicate

        vm.expectRevert("TreasuryGovernor: duplicate signer");
        new TreasuryGovernor(signers, 2, address(lob));
    }

    function test_constructor_sets_roles_correctly() public {
        // signer1, signer2, signer3 all have SIGNER_ROLE
        assertTrue(treasury.hasRole(treasury.SIGNER_ROLE(), signer1));
        assertTrue(treasury.hasRole(treasury.SIGNER_ROLE(), signer2));
        assertTrue(treasury.hasRole(treasury.SIGNER_ROLE(), signer3));

        // signer1 (first signer) has GUARDIAN_ROLE
        assertTrue(treasury.hasRole(treasury.GUARDIAN_ROLE(), signer1));
        assertFalse(treasury.hasRole(treasury.GUARDIAN_ROLE(), signer2));

        // DEFAULT_ADMIN_ROLE is the treasury contract itself
        assertTrue(treasury.hasRole(treasury.DEFAULT_ADMIN_ROLE(), address(treasury)));

        // State values
        assertEq(treasury.requiredApprovals(), 2);
        assertEq(treasury.signerCount(), 3);
    }

    function test_constructor_rejects_zero_signer() public {
        address[] memory signers = new address[](3);
        signers[0] = makeAddr("a");
        signers[1] = address(0);
        signers[2] = makeAddr("c");

        vm.expectRevert("TreasuryGovernor: zero signer");
        new TreasuryGovernor(signers, 2, address(lob));
    }

    function test_constructor_rejects_invalid_approval_threshold() public {
        address[] memory signers = new address[](3);
        signers[0] = makeAddr("a");
        signers[1] = makeAddr("b");
        signers[2] = makeAddr("c");

        // requiredApprovals = 1 (below minimum of 2)
        vm.expectRevert("TreasuryGovernor: invalid approval threshold");
        new TreasuryGovernor(signers, 1, address(lob));

        // requiredApprovals = 4 (exceeds signer count)
        vm.expectRevert("TreasuryGovernor: invalid approval threshold");
        new TreasuryGovernor(signers, 4, address(lob));
    }

    /* ═══════════════════════════════════════════════════════════════
       DEPOSIT TESTS
       ═══════════════════════════════════════════════════════════════ */

    function test_deposit_works() public {
        uint256 depositAmount = 5_000 ether;
        uint256 balBefore = lob.balanceOf(address(treasury));

        vm.startPrank(distributor);
        lob.approve(address(treasury), depositAmount);
        treasury.deposit(address(lob), depositAmount);
        vm.stopPrank();

        assertEq(lob.balanceOf(address(treasury)), balBefore + depositAmount);
    }

    function test_deposit_reverts_zero_amount() public {
        vm.prank(distributor);
        vm.expectRevert("TreasuryGovernor: zero amount");
        treasury.deposit(address(lob), 0);
    }

    /* ═══════════════════════════════════════════════════════════════
       PROPOSAL TESTS
       ═══════════════════════════════════════════════════════════════ */

    function test_createProposal_works() public {
        vm.prank(signer1);
        uint256 pid = treasury.createProposal(
            address(lob),
            recipient,
            1_000 ether,
            "Fund community grant"
        );

        assertEq(pid, 1);

        TreasuryGovernor.Proposal memory p = treasury.getProposal(pid);
        assertEq(p.id, 1);
        assertEq(p.proposer, signer1);
        assertEq(p.token, address(lob));
        assertEq(p.recipient, recipient);
        assertEq(p.amount, 1_000 ether);
        assertEq(uint256(p.status), uint256(TreasuryGovernor.ProposalStatus.Pending));
        assertEq(p.approvalCount, 1); // auto-approved by proposer
    }

    function test_createProposal_reverts_non_signer() public {
        vm.prank(outsider);
        vm.expectRevert();
        treasury.createProposal(address(lob), recipient, 1_000 ether, "grant");
    }

    function test_createProposal_reverts_zero_amount() public {
        vm.prank(signer1);
        vm.expectRevert("TreasuryGovernor: zero amount");
        treasury.createProposal(address(lob), recipient, 0, "grant");
    }

    function test_createProposal_reverts_zero_recipient() public {
        vm.prank(signer1);
        vm.expectRevert("TreasuryGovernor: zero recipient");
        treasury.createProposal(address(lob), address(0), 1_000 ether, "grant");
    }

    function test_createProposal_reverts_insufficient_balance() public {
        // Try to create a proposal for more LOB than treasury holds
        uint256 excessive = TREASURY_LOB + 1;

        vm.prank(signer1);
        vm.expectRevert("TreasuryGovernor: insufficient balance");
        treasury.createProposal(address(lob), recipient, excessive, "too much");
    }

    function test_approveProposal_works() public {
        vm.prank(signer1);
        uint256 pid = treasury.createProposal(address(lob), recipient, 1_000 ether, "grant");

        // signer2 approves — triggers Approved status (not Executed, due to timelock)
        vm.prank(signer2);
        treasury.approveProposal(pid);

        TreasuryGovernor.Proposal memory p = treasury.getProposal(pid);
        assertEq(uint256(p.status), uint256(TreasuryGovernor.ProposalStatus.Approved));
        assertEq(p.approvalCount, 2);
        assertGt(p.timelockEnd, block.timestamp);

        // Wait for timelock and execute
        vm.warp(p.timelockEnd);
        treasury.executeProposal(pid);

        p = treasury.getProposal(pid);
        assertEq(uint256(p.status), uint256(TreasuryGovernor.ProposalStatus.Executed));
    }

    function test_proposal_executes_on_threshold() public {
        uint256 recipientBalBefore = lob.balanceOf(recipient);
        uint256 treasuryBalBefore = lob.balanceOf(address(treasury));
        uint256 transferAmount = 5_000 ether;

        // signer1 creates proposal (auto-approves)
        vm.prank(signer1);
        uint256 pid = treasury.createProposal(address(lob), recipient, transferAmount, "payment");

        // signer2 approves -> triggers Approved + timelock
        vm.prank(signer2);
        treasury.approveProposal(pid);

        // Not yet executed — still in timelock
        TreasuryGovernor.Proposal memory p = treasury.getProposal(pid);
        assertEq(uint256(p.status), uint256(TreasuryGovernor.ProposalStatus.Approved));

        // Wait for timelock and execute
        vm.warp(p.timelockEnd);
        treasury.executeProposal(pid);

        // Check balances
        assertEq(lob.balanceOf(recipient), recipientBalBefore + transferAmount);
        assertEq(lob.balanceOf(address(treasury)), treasuryBalBefore - transferAmount);

        // Check proposal status
        p = treasury.getProposal(pid);
        assertEq(uint256(p.status), uint256(TreasuryGovernor.ProposalStatus.Executed));
    }

    function test_proposal_double_approval_reverts() public {
        vm.prank(signer1);
        uint256 pid = treasury.createProposal(address(lob), recipient, 1_000 ether, "grant");

        // signer1 tries to approve again (already auto-approved as proposer)
        vm.prank(signer1);
        vm.expectRevert("TreasuryGovernor: already approved");
        treasury.approveProposal(pid);
    }

    function test_proposal_expired_reverts() public {
        vm.prank(signer1);
        uint256 pid = treasury.createProposal(address(lob), recipient, 1_000 ether, "grant");

        // Warp past PROPOSAL_EXPIRY (7 days)
        vm.warp(block.timestamp + 7 days + 1);

        vm.prank(signer2);
        vm.expectRevert("TreasuryGovernor: proposal expired");
        treasury.approveProposal(pid);

        // Verify isProposalExpired view function
        assertTrue(treasury.isProposalExpired(pid));
    }

    function test_approveProposal_reverts_non_signer() public {
        vm.prank(signer1);
        uint256 pid = treasury.createProposal(address(lob), recipient, 1_000 ether, "grant");

        vm.prank(outsider);
        vm.expectRevert();
        treasury.approveProposal(pid);
    }

    function test_approveProposal_reverts_nonexistent() public {
        vm.prank(signer1);
        vm.expectRevert("TreasuryGovernor: proposal not found");
        treasury.approveProposal(999);
    }

    /* ═══════════════════════════════════════════════════════════════
       CANCEL PROPOSAL TESTS
       ═══════════════════════════════════════════════════════════════ */

    function test_cancelProposal_by_proposer() public {
        vm.prank(signer1);
        uint256 pid = treasury.createProposal(address(lob), recipient, 1_000 ether, "grant");

        // Proposer (signer1) cancels
        vm.prank(signer1);
        treasury.cancelProposal(pid);

        TreasuryGovernor.Proposal memory p = treasury.getProposal(pid);
        assertEq(uint256(p.status), uint256(TreasuryGovernor.ProposalStatus.Cancelled));
    }

    function test_cancelProposal_by_guardian() public {
        // signer2 creates a proposal
        vm.prank(signer2);
        uint256 pid = treasury.createProposal(address(lob), recipient, 1_000 ether, "grant");

        // signer1 (guardian) cancels it even though they are not the proposer
        vm.prank(signer1);
        treasury.cancelProposal(pid);

        TreasuryGovernor.Proposal memory p = treasury.getProposal(pid);
        assertEq(uint256(p.status), uint256(TreasuryGovernor.ProposalStatus.Cancelled));
    }

    function test_cancelProposal_reverts_unauthorized() public {
        vm.prank(signer1);
        uint256 pid = treasury.createProposal(address(lob), recipient, 1_000 ether, "grant");

        // signer2 is neither the proposer nor a guardian
        vm.prank(signer2);
        vm.expectRevert("TreasuryGovernor: unauthorized");
        treasury.cancelProposal(pid);
    }

    function test_cancelProposal_reverts_already_executed() public {
        vm.prank(signer1);
        uint256 pid = treasury.createProposal(address(lob), recipient, 1_000 ether, "grant");

        // Approve and execute the proposal (with timelock)
        vm.prank(signer2);
        treasury.approveProposal(pid);

        TreasuryGovernor.Proposal memory p = treasury.getProposal(pid);
        vm.warp(p.timelockEnd);
        treasury.executeProposal(pid);

        // Now try to cancel an already-executed proposal
        vm.prank(signer1);
        vm.expectRevert("TreasuryGovernor: not cancellable");
        treasury.cancelProposal(pid);
    }

    /* ═══════════════════════════════════════════════════════════════
       STREAM TESTS
       ═══════════════════════════════════════════════════════════════ */

    // Helper: create a stream via the treasury itself (DEFAULT_ADMIN_ROLE)
    function _createStream(
        address _recipient,
        address _token,
        uint256 _amount,
        uint256 _duration,
        string memory _role
    ) internal returns (uint256) {
        vm.prank(address(treasury));
        return treasury.createStream(_recipient, _token, _amount, _duration, _role);
    }

    function test_createStream_works() public {
        uint256 streamAmount = 12_000 ether;
        uint256 duration = 30 days;

        uint256 sid = _createStream(recipient, address(lob), streamAmount, duration, "moderator");

        assertEq(sid, 1);

        TreasuryGovernor.PaymentStream memory s = treasury.getStream(sid);
        assertEq(s.id, 1);
        assertEq(s.recipient, recipient);
        assertEq(s.token, address(lob));
        assertEq(s.totalAmount, streamAmount);
        assertEq(s.claimedAmount, 0);
        assertEq(s.endTime, s.startTime + duration);
        assertTrue(s.active);

        // Check recipientStreams mapping
        uint256[] memory recipientStreamIds = treasury.getRecipientStreams(recipient);
        assertEq(recipientStreamIds.length, 1);
        assertEq(recipientStreamIds[0], sid);
    }

    function test_createStream_reverts_non_admin() public {
        // Signer (non-admin) cannot create streams directly
        vm.prank(signer1);
        vm.expectRevert();
        treasury.createStream(recipient, address(lob), 1_000 ether, 30 days, "mod");

        // Outsider also cannot
        vm.prank(outsider);
        vm.expectRevert();
        treasury.createStream(recipient, address(lob), 1_000 ether, 30 days, "mod");
    }

    function test_createStream_reverts_zero_recipient() public {
        vm.prank(address(treasury));
        vm.expectRevert("TreasuryGovernor: zero recipient");
        treasury.createStream(address(0), address(lob), 1_000 ether, 30 days, "mod");
    }

    function test_createStream_reverts_zero_amount() public {
        vm.prank(address(treasury));
        vm.expectRevert("TreasuryGovernor: zero amount");
        treasury.createStream(recipient, address(lob), 0, 30 days, "mod");
    }

    function test_createStream_reverts_invalid_duration() public {
        vm.prank(address(treasury));
        vm.expectRevert("TreasuryGovernor: invalid duration");
        treasury.createStream(recipient, address(lob), 1_000 ether, 0, "mod");

        vm.prank(address(treasury));
        vm.expectRevert("TreasuryGovernor: invalid duration");
        treasury.createStream(recipient, address(lob), 1_000 ether, 366 days, "mod");
    }

    function test_claimStream_partial_vesting() public {
        uint256 streamAmount = 30_000 ether;
        uint256 duration = 30 days;

        uint256 sid = _createStream(recipient, address(lob), streamAmount, duration, "moderator");

        // Warp to 10 days (1/3 of the way through)
        vm.warp(block.timestamp + 10 days);

        uint256 claimable = treasury.streamClaimable(sid);
        // Should be approximately 10_000 ether (10/30 * 30000)
        assertEq(claimable, 10_000 ether);

        uint256 recipientBalBefore = lob.balanceOf(recipient);

        vm.prank(recipient);
        treasury.claimStream(sid);

        assertEq(lob.balanceOf(recipient), recipientBalBefore + 10_000 ether);

        TreasuryGovernor.PaymentStream memory s = treasury.getStream(sid);
        assertEq(s.claimedAmount, 10_000 ether);
    }

    function test_claimStream_full_vesting() public {
        uint256 streamAmount = 30_000 ether;
        uint256 duration = 30 days;

        uint256 sid = _createStream(recipient, address(lob), streamAmount, duration, "arbitrator");

        // Warp past end time
        vm.warp(block.timestamp + 31 days);

        uint256 claimable = treasury.streamClaimable(sid);
        assertEq(claimable, streamAmount);

        uint256 recipientBalBefore = lob.balanceOf(recipient);

        vm.prank(recipient);
        treasury.claimStream(sid);

        assertEq(lob.balanceOf(recipient), recipientBalBefore + streamAmount);

        TreasuryGovernor.PaymentStream memory s = treasury.getStream(sid);
        assertEq(s.claimedAmount, streamAmount);

        // Should not be able to claim again
        assertEq(treasury.streamClaimable(sid), 0);
    }

    function test_claimStream_reverts_non_recipient() public {
        uint256 sid = _createStream(recipient, address(lob), 10_000 ether, 30 days, "mod");

        vm.warp(block.timestamp + 5 days);

        vm.prank(outsider);
        vm.expectRevert("TreasuryGovernor: not recipient");
        treasury.claimStream(sid);
    }

    function test_claimStream_reverts_nothing_to_claim() public {
        uint256 sid = _createStream(recipient, address(lob), 10_000 ether, 30 days, "mod");

        // Do not warp -- nothing vested yet
        vm.prank(recipient);
        vm.expectRevert("TreasuryGovernor: nothing to claim");
        treasury.claimStream(sid);
    }

    function test_claimStream_multiple_partial_claims() public {
        uint256 streamAmount = 30_000 ether;
        uint256 duration = 30 days;

        uint256 sid = _createStream(recipient, address(lob), streamAmount, duration, "grant");

        // First claim at day 10
        vm.warp(block.timestamp + 10 days);
        vm.prank(recipient);
        treasury.claimStream(sid);
        assertEq(lob.balanceOf(recipient), 10_000 ether);

        // Second claim at day 20
        vm.warp(block.timestamp + 10 days);
        vm.prank(recipient);
        treasury.claimStream(sid);
        assertEq(lob.balanceOf(recipient), 20_000 ether);

        // Final claim at day 30
        vm.warp(block.timestamp + 10 days);
        vm.prank(recipient);
        treasury.claimStream(sid);
        assertEq(lob.balanceOf(recipient), 30_000 ether);
    }

    function test_cancelStream_stops_future_claims() public {
        uint256 streamAmount = 30_000 ether;
        uint256 duration = 30 days;

        uint256 sid = _createStream(recipient, address(lob), streamAmount, duration, "mod");

        // Warp 10 days and claim
        vm.warp(block.timestamp + 10 days);
        vm.prank(recipient);
        treasury.claimStream(sid);

        // Guardian cancels the stream
        vm.prank(signer1);
        treasury.cancelStream(sid);

        TreasuryGovernor.PaymentStream memory s = treasury.getStream(sid);
        assertFalse(s.active);

        // Warp more time and try to claim
        vm.warp(block.timestamp + 10 days);
        vm.prank(recipient);
        vm.expectRevert("TreasuryGovernor: stream cancelled");
        treasury.claimStream(sid);
    }

    function test_cancelStream_reverts_non_guardian() public {
        uint256 sid = _createStream(recipient, address(lob), 10_000 ether, 30 days, "mod");

        vm.prank(signer2); // Not a guardian
        vm.expectRevert();
        treasury.cancelStream(sid);
    }

    function test_cancelStream_reverts_already_cancelled() public {
        uint256 sid = _createStream(recipient, address(lob), 10_000 ether, 30 days, "mod");

        vm.prank(signer1);
        treasury.cancelStream(sid);

        vm.prank(signer1);
        vm.expectRevert("TreasuryGovernor: already cancelled");
        treasury.cancelStream(sid);
    }

    /* ═══════════════════════════════════════════════════════════════
       SIGNER MANAGEMENT TESTS
       ═══════════════════════════════════════════════════════════════ */

    function test_addSigner_works() public {
        address newSigner = makeAddr("newSigner");

        // Only DEFAULT_ADMIN_ROLE (the contract itself) can add signers
        vm.prank(address(treasury));
        treasury.addSigner(newSigner);

        assertTrue(treasury.hasRole(treasury.SIGNER_ROLE(), newSigner));
        assertEq(treasury.signerCount(), 4);
    }

    function test_addSigner_reverts_non_admin() public {
        vm.prank(signer1);
        vm.expectRevert();
        treasury.addSigner(makeAddr("newSigner"));
    }

    function test_addSigner_reverts_already_signer() public {
        vm.prank(address(treasury));
        vm.expectRevert("TreasuryGovernor: already signer");
        treasury.addSigner(signer1);
    }

    function test_addSigner_reverts_max_signers() public {
        // Add signers up to MAX_SIGNERS (9), we have 3 already
        for (uint256 i = 0; i < 6; i++) {
            address newSigner = address(uint160(200 + i));
            vm.prank(address(treasury));
            treasury.addSigner(newSigner);
        }
        assertEq(treasury.signerCount(), 9);

        // 10th signer should fail
        vm.prank(address(treasury));
        vm.expectRevert("TreasuryGovernor: max signers reached");
        treasury.addSigner(makeAddr("extra"));
    }

    function test_removeSigner_validates_minimum() public {
        // We have exactly MIN_SIGNERS (3), removing one should fail
        vm.prank(address(treasury));
        vm.expectRevert("TreasuryGovernor: cannot go below minimum");
        treasury.removeSigner(signer3);
    }

    function test_removeSigner_works_above_minimum() public {
        // First add a 4th signer
        address signer4 = makeAddr("signer4");
        vm.prank(address(treasury));
        treasury.addSigner(signer4);
        assertEq(treasury.signerCount(), 4);

        // Now remove signer4 (4 > MIN_SIGNERS=3, and 3 >= requiredApprovals=2)
        vm.prank(address(treasury));
        treasury.removeSigner(signer4);

        assertFalse(treasury.hasRole(treasury.SIGNER_ROLE(), signer4));
        assertEq(treasury.signerCount(), 3);
    }

    function test_removeSigner_reverts_would_break_threshold() public {
        // Add signer4
        address signer4 = makeAddr("signer4");
        vm.prank(address(treasury));
        treasury.addSigner(signer4);

        // Set requiredApprovals to 4 (all 4 signers required)
        vm.prank(address(treasury));
        treasury.setRequiredApprovals(4);

        // Now try to remove a signer: signerCount-1=3 < requiredApprovals=4
        vm.prank(address(treasury));
        vm.expectRevert("TreasuryGovernor: would break threshold");
        treasury.removeSigner(signer4);
    }

    function test_setRequiredApprovals_works() public {
        vm.prank(address(treasury));
        treasury.setRequiredApprovals(3);

        assertEq(treasury.requiredApprovals(), 3);
    }

    function test_setRequiredApprovals_reverts_below_minimum() public {
        vm.prank(address(treasury));
        vm.expectRevert("TreasuryGovernor: min 2 approvals");
        treasury.setRequiredApprovals(1);
    }

    function test_setRequiredApprovals_reverts_exceeds_signer_count() public {
        vm.prank(address(treasury));
        vm.expectRevert("TreasuryGovernor: exceeds signer count");
        treasury.setRequiredApprovals(4);
    }

    /* ═══════════════════════════════════════════════════════════════
       RECEIVE SEIZED FUNDS TESTS
       ═══════════════════════════════════════════════════════════════ */

    function test_receiveSeizedFunds_works() public {
        uint256 seizeAmount = 5_000 ether;

        // Give sybilGuard some LOB
        vm.prank(distributor);
        lob.transfer(sybilGuard, seizeAmount);

        uint256 treasuryBalBefore = lob.balanceOf(address(treasury));

        vm.startPrank(sybilGuard);
        lob.approve(address(treasury), seizeAmount);
        treasury.receiveSeizedFunds(address(lob), seizeAmount, makeAddr("banned"), "sybil cluster");
        vm.stopPrank();

        assertEq(lob.balanceOf(address(treasury)), treasuryBalBefore + seizeAmount);
        assertEq(treasury.totalSeizedLOB(), seizeAmount);
    }

    function test_receiveSeizedFunds_reverts_non_sybil_guard() public {
        vm.prank(outsider);
        vm.expectRevert();
        treasury.receiveSeizedFunds(address(lob), 100 ether, makeAddr("x"), "test");
    }

    function test_receiveSeizedFunds_reverts_zero_amount() public {
        vm.prank(sybilGuard);
        vm.expectRevert("TreasuryGovernor: zero amount");
        treasury.receiveSeizedFunds(address(lob), 0, makeAddr("x"), "test");
    }

    /* ═══════════════════════════════════════════════════════════════
       CANCEL STREAMS FOR ADDRESS (SYBIL GUARD)
       ═══════════════════════════════════════════════════════════════ */

    function test_cancelStreamsForAddress_works() public {
        address banned = makeAddr("banned");

        // Create multiple streams for banned address (must use admin = address(treasury))
        uint256 sid1 = _createStream(banned, address(lob), 10_000 ether, 30 days, "mod");
        uint256 sid2 = _createStream(banned, address(lob), 5_000 ether, 60 days, "grant");

        // SybilGuard cancels all streams for banned address
        vm.prank(sybilGuard);
        treasury.cancelStreamsForAddress(banned);

        TreasuryGovernor.PaymentStream memory s1 = treasury.getStream(sid1);
        TreasuryGovernor.PaymentStream memory s2 = treasury.getStream(sid2);

        assertFalse(s1.active);
        assertFalse(s2.active);
    }

    function test_cancelStreamsForAddress_reverts_non_sybil_guard() public {
        vm.prank(outsider);
        vm.expectRevert();
        treasury.cancelStreamsForAddress(makeAddr("banned"));
    }

    function test_cancelStreamsForAddress_no_streams_is_noop() public {
        // Should not revert even if the address has no streams
        vm.prank(sybilGuard);
        treasury.cancelStreamsForAddress(makeAddr("no_streams"));
    }

    /* ═══════════════════════════════════════════════════════════════
       VIEW FUNCTION TESTS
       ═══════════════════════════════════════════════════════════════ */

    function test_getBalance() public view {
        assertEq(treasury.getBalance(address(lob)), TREASURY_LOB);
        assertEq(treasury.getBalance(address(usdc)), TREASURY_USDC);
    }

    function test_usdc_proposal_and_execution() public {
        uint256 usdcAmount = 50_000 * 1e6; // 50k USDC
        uint256 recipientBalBefore = usdc.balanceOf(recipient);

        vm.prank(signer1);
        uint256 pid = treasury.createProposal(address(usdc), recipient, usdcAmount, "USDC payment");

        vm.prank(signer2);
        treasury.approveProposal(pid);

        // Wait for timelock and execute
        TreasuryGovernor.Proposal memory p = treasury.getProposal(pid);
        vm.warp(p.timelockEnd);
        treasury.executeProposal(pid);

        assertEq(usdc.balanceOf(recipient), recipientBalBefore + usdcAmount);
    }

    function test_multiple_proposals_sequential_ids() public {
        vm.prank(signer1);
        uint256 pid1 = treasury.createProposal(address(lob), recipient, 100 ether, "first");

        vm.prank(signer2);
        uint256 pid2 = treasury.createProposal(address(lob), recipient, 200 ether, "second");

        assertEq(pid1, 1);
        assertEq(pid2, 2);
    }

    /* ═══════════════════════════════════════════════════════════════
       TIMELOCK TESTS (M-2)
       ═══════════════════════════════════════════════════════════════ */

    function test_executeProposal_reverts_before_timelock() public {
        vm.prank(signer1);
        uint256 pid = treasury.createProposal(address(lob), recipient, 1_000 ether, "grant");

        vm.prank(signer2);
        treasury.approveProposal(pid);

        // Try to execute immediately — should revert
        vm.expectRevert("TreasuryGovernor: timelock not expired");
        treasury.executeProposal(pid);
    }

    function test_executeProposal_works_after_timelock() public {
        uint256 recipientBalBefore = lob.balanceOf(recipient);

        vm.prank(signer1);
        uint256 pid = treasury.createProposal(address(lob), recipient, 1_000 ether, "grant");

        vm.prank(signer2);
        treasury.approveProposal(pid);

        // Warp past timelock (24 hours)
        vm.warp(block.timestamp + 24 hours);

        treasury.executeProposal(pid);

        assertEq(lob.balanceOf(recipient), recipientBalBefore + 1_000 ether);
        TreasuryGovernor.Proposal memory p = treasury.getProposal(pid);
        assertEq(uint256(p.status), uint256(TreasuryGovernor.ProposalStatus.Executed));
    }

    function test_cancelProposal_approved_status() public {
        vm.prank(signer1);
        uint256 pid = treasury.createProposal(address(lob), recipient, 1_000 ether, "grant");

        vm.prank(signer2);
        treasury.approveProposal(pid);

        // Cancel during timelock window (proposer cancels)
        vm.prank(signer1);
        treasury.cancelProposal(pid);

        TreasuryGovernor.Proposal memory p = treasury.getProposal(pid);
        assertEq(uint256(p.status), uint256(TreasuryGovernor.ProposalStatus.Cancelled));
    }

    function test_executeProposal_reverts_expired() public {
        vm.prank(signer1);
        uint256 pid = treasury.createProposal(address(lob), recipient, 1_000 ether, "grant");

        vm.prank(signer2);
        treasury.approveProposal(pid);

        // Warp past PROPOSAL_EXPIRY (7 days)
        vm.warp(block.timestamp + 7 days + 1);

        vm.expectRevert("TreasuryGovernor: proposal expired");
        treasury.executeProposal(pid);
    }

    /* ═══════════════════════════════════════════════════════════════
       ADMIN PROPOSAL TESTS (M-3)
       ═══════════════════════════════════════════════════════════════ */

    function test_createAdminProposal_works() public {
        // Create a mock target (we'll use the lob token address for demonstration)
        address target = address(lob);
        bytes memory data = abi.encodeWithSignature("totalSupply()");

        vm.prank(signer1);
        uint256 pid = treasury.createAdminProposal(target, data, "Check total supply");

        assertEq(pid, 1);

        (
            uint256 id,
            address proposer,
            address t,
            ,
            string memory desc,
            TreasuryGovernor.ProposalStatus status,
            uint256 approvalCount,
            ,
        ) = treasury.adminProposals(pid);

        assertEq(id, 1);
        assertEq(proposer, signer1);
        assertEq(t, target);
        assertEq(uint256(status), uint256(TreasuryGovernor.ProposalStatus.Pending));
        assertEq(approvalCount, 1);
    }

    function test_adminProposal_execute_after_timelock() public {
        // Use a real call: pause() on EscrowEngine-like mock
        // For simplicity, we create an admin proposal that calls lob.totalSupply() (view but callable)
        address target = address(lob);
        bytes memory data = abi.encodeWithSignature("totalSupply()");

        vm.prank(signer1);
        uint256 pid = treasury.createAdminProposal(target, data, "Read total supply");

        vm.prank(signer2);
        treasury.approveAdminProposal(pid);

        // Should be Approved now
        (, , , , , TreasuryGovernor.ProposalStatus status, , , uint256 timelockEnd) = treasury.adminProposals(pid);
        assertEq(uint256(status), uint256(TreasuryGovernor.ProposalStatus.Approved));

        // Wait for timelock
        vm.warp(timelockEnd);

        treasury.executeAdminProposal(pid);

        (, , , , , status, , , ) = treasury.adminProposals(pid);
        assertEq(uint256(status), uint256(TreasuryGovernor.ProposalStatus.Executed));
    }

    function test_adminProposal_reverts_before_timelock() public {
        address target = address(lob);
        bytes memory data = abi.encodeWithSignature("totalSupply()");

        vm.prank(signer1);
        uint256 pid = treasury.createAdminProposal(target, data, "test");

        vm.prank(signer2);
        treasury.approveAdminProposal(pid);

        vm.expectRevert("TreasuryGovernor: timelock not expired");
        treasury.executeAdminProposal(pid);
    }

    function test_adminProposal_cancel_during_timelock() public {
        address target = address(lob);
        bytes memory data = abi.encodeWithSignature("totalSupply()");

        vm.prank(signer1);
        uint256 pid = treasury.createAdminProposal(target, data, "test");

        vm.prank(signer2);
        treasury.approveAdminProposal(pid);

        // Cancel during timelock
        vm.prank(signer1);
        treasury.cancelAdminProposal(pid);

        (, , , , , TreasuryGovernor.ProposalStatus status, , , ) = treasury.adminProposals(pid);
        assertEq(uint256(status), uint256(TreasuryGovernor.ProposalStatus.Cancelled));
    }

    function test_adminProposal_reverts_unauthorized_self_call() public {
        // deposit() is not in the governance allowlist
        bytes memory data = abi.encodeWithSignature("deposit(address,uint256)", address(lob), 100);

        vm.prank(signer1);
        vm.expectRevert("TreasuryGovernor: unauthorized self-call");
        treasury.createAdminProposal(address(treasury), data, "bad");
    }

    function test_adminProposal_self_target_addSigner() public {
        address newSigner = makeAddr("newSigner");
        bytes memory data = abi.encodeWithSelector(treasury.addSigner.selector, newSigner);

        // Propose
        vm.prank(signer1);
        uint256 pid = treasury.createAdminProposal(address(treasury), data, "Add new signer");

        // Approve (meets 2-of-3 threshold)
        vm.prank(signer2);
        treasury.approveAdminProposal(pid);

        // Wait for timelock
        (, , , , , , , , uint256 timelockEnd) = treasury.adminProposals(pid);
        vm.warp(timelockEnd);

        // Execute
        treasury.executeAdminProposal(pid);

        // Verify signer added
        assertTrue(treasury.hasRole(treasury.SIGNER_ROLE(), newSigner));
        assertEq(treasury.signerCount(), 4);
    }

    function test_adminProposal_self_target_removeSigner() public {
        // First add a 4th signer so we can remove one
        address signer4 = makeAddr("signer4");
        vm.prank(address(treasury));
        treasury.addSigner(signer4);
        assertEq(treasury.signerCount(), 4);

        // Propose removal via admin proposal
        bytes memory data = abi.encodeWithSelector(treasury.removeSigner.selector, signer4);

        vm.prank(signer1);
        uint256 pid = treasury.createAdminProposal(address(treasury), data, "Remove signer4");

        vm.prank(signer2);
        treasury.approveAdminProposal(pid);

        (, , , , , , , , uint256 timelockEnd) = treasury.adminProposals(pid);
        vm.warp(timelockEnd);

        treasury.executeAdminProposal(pid);

        // Verify signer removed
        assertFalse(treasury.hasRole(treasury.SIGNER_ROLE(), signer4));
        assertEq(treasury.signerCount(), 3);
    }

    function test_adminProposal_self_target_setRequiredApprovals() public {
        bytes memory data = abi.encodeWithSelector(treasury.setRequiredApprovals.selector, 3);

        vm.prank(signer1);
        uint256 pid = treasury.createAdminProposal(address(treasury), data, "Raise threshold to 3");

        vm.prank(signer2);
        treasury.approveAdminProposal(pid);

        (, , , , , , , , uint256 timelockEnd) = treasury.adminProposals(pid);
        vm.warp(timelockEnd);

        treasury.executeAdminProposal(pid);

        assertEq(treasury.requiredApprovals(), 3);
    }

    function test_adminProposal_reverts_non_signer() public {
        address target = address(lob);
        bytes memory data = abi.encodeWithSignature("totalSupply()");

        vm.prank(outsider);
        vm.expectRevert();
        treasury.createAdminProposal(target, data, "test");
    }

    /* ═══════════════════════════════════════════════════════════════
       BOUNTY TESTS
       ═══════════════════════════════════════════════════════════════ */

    // Helper: create a bounty via the treasury itself (DEFAULT_ADMIN_ROLE)
    function _createBounty(
        string memory title,
        string memory desc,
        uint256 reward,
        address token,
        string memory category,
        uint8 difficulty,
        uint256 deadline
    ) internal returns (uint256) {
        vm.prank(address(treasury));
        return treasury.createBounty(title, desc, reward, token, category, difficulty, deadline);
    }

    function test_createBounty_works() public {
        uint256 bid = _createBounty(
            "Build Python SDK",
            "Create a Python SDK for LOBSTR",
            50_000 ether,
            address(lob),
            "development",
            3,
            block.timestamp + 30 days
        );

        assertEq(bid, 1);

        TreasuryGovernor.Bounty memory b = treasury.getBounty(bid);
        assertEq(b.id, 1);
        assertEq(b.creator, address(treasury));
        assertEq(b.reward, 50_000 ether);
        assertEq(b.token, address(lob));
        assertEq(uint256(b.status), uint256(TreasuryGovernor.BountyStatus.Open));
        assertEq(b.difficulty, 3);
        assertEq(b.claimant, address(0));
    }

    function test_createBounty_reverts_non_admin() public {
        // Signer (non-admin) cannot create bounties directly
        vm.prank(signer1);
        vm.expectRevert();
        treasury.createBounty("test", "desc", 100 ether, address(lob), "dev", 1, block.timestamp + 1 days);

        vm.prank(outsider);
        vm.expectRevert();
        treasury.createBounty("test", "desc", 100 ether, address(lob), "dev", 1, block.timestamp + 1 days);
    }

    function test_createBounty_reverts_zero_reward() public {
        vm.prank(address(treasury));
        vm.expectRevert("TreasuryGovernor: zero reward");
        treasury.createBounty("test", "desc", 0, address(lob), "dev", 1, block.timestamp + 1 days);
    }

    function test_createBounty_reverts_invalid_difficulty() public {
        vm.prank(address(treasury));
        vm.expectRevert("TreasuryGovernor: invalid difficulty");
        treasury.createBounty("test", "desc", 100 ether, address(lob), "dev", 0, block.timestamp + 1 days);

        vm.prank(address(treasury));
        vm.expectRevert("TreasuryGovernor: invalid difficulty");
        treasury.createBounty("test", "desc", 100 ether, address(lob), "dev", 6, block.timestamp + 1 days);
    }

    function test_createBounty_reverts_deadline_in_past() public {
        vm.prank(address(treasury));
        vm.expectRevert("TreasuryGovernor: deadline in past");
        treasury.createBounty("test", "desc", 100 ether, address(lob), "dev", 1, block.timestamp - 1);
    }

    function test_createBounty_reverts_insufficient_balance() public {
        uint256 excessive = TREASURY_LOB + 1;
        vm.prank(address(treasury));
        vm.expectRevert("TreasuryGovernor: insufficient balance for bounty");
        treasury.createBounty("test", "desc", excessive, address(lob), "dev", 1, block.timestamp + 1 days);
    }

    function test_claimBounty_works() public {
        uint256 bid = _createBounty("test", "desc", 1_000 ether, address(lob), "dev", 2, block.timestamp + 30 days);

        vm.prank(outsider);
        treasury.claimBounty(bid);

        TreasuryGovernor.Bounty memory b = treasury.getBounty(bid);
        assertEq(uint256(b.status), uint256(TreasuryGovernor.BountyStatus.Claimed));
        assertEq(b.claimant, outsider);
    }

    function test_claimBounty_reverts_not_open() public {
        uint256 bid = _createBounty("test", "desc", 1_000 ether, address(lob), "dev", 2, block.timestamp + 30 days);

        // First claim
        vm.prank(outsider);
        treasury.claimBounty(bid);

        // Second claim should fail
        vm.prank(recipient);
        vm.expectRevert("TreasuryGovernor: not open");
        treasury.claimBounty(bid);
    }

    function test_claimBounty_reverts_expired() public {
        uint256 bid = _createBounty("test", "desc", 1_000 ether, address(lob), "dev", 2, block.timestamp + 1 days);

        vm.warp(block.timestamp + 2 days);

        vm.prank(outsider);
        vm.expectRevert("TreasuryGovernor: bounty expired");
        treasury.claimBounty(bid);
    }

    function test_completeBounty_lifecycle() public {
        uint256 reward = 5_000 ether;

        uint256 bid = _createBounty("test", "desc", reward, address(lob), "dev", 3, block.timestamp + 30 days);

        // Claim
        vm.prank(outsider);
        treasury.claimBounty(bid);

        uint256 claimantBalBefore = lob.balanceOf(outsider);

        // Complete via admin
        vm.prank(address(treasury));
        treasury.completeBounty(bid);

        assertEq(lob.balanceOf(outsider), claimantBalBefore + reward);

        TreasuryGovernor.Bounty memory b = treasury.getBounty(bid);
        assertEq(uint256(b.status), uint256(TreasuryGovernor.BountyStatus.Completed));
    }

    function test_completeBounty_reverts_non_admin() public {
        uint256 bid = _createBounty("test", "desc", 1_000 ether, address(lob), "dev", 2, block.timestamp + 30 days);

        vm.prank(outsider);
        treasury.claimBounty(bid);

        // Signer (non-admin) cannot complete
        vm.prank(signer1);
        vm.expectRevert();
        treasury.completeBounty(bid);

        vm.prank(outsider);
        vm.expectRevert();
        treasury.completeBounty(bid);
    }

    function test_completeBounty_reverts_not_claimed() public {
        uint256 bid = _createBounty("test", "desc", 1_000 ether, address(lob), "dev", 2, block.timestamp + 30 days);

        vm.prank(address(treasury));
        vm.expectRevert("TreasuryGovernor: not claimed");
        treasury.completeBounty(bid);
    }

    function test_cancelBounty_open() public {
        uint256 bid = _createBounty("test", "desc", 1_000 ether, address(lob), "dev", 2, block.timestamp + 30 days);

        vm.prank(signer1);
        treasury.cancelBounty(bid);

        TreasuryGovernor.Bounty memory b = treasury.getBounty(bid);
        assertEq(uint256(b.status), uint256(TreasuryGovernor.BountyStatus.Cancelled));
    }

    function test_cancelBounty_claimed() public {
        uint256 bid = _createBounty("test", "desc", 1_000 ether, address(lob), "dev", 2, block.timestamp + 30 days);

        vm.prank(outsider);
        treasury.claimBounty(bid);

        vm.prank(signer1);
        treasury.cancelBounty(bid);

        TreasuryGovernor.Bounty memory b = treasury.getBounty(bid);
        assertEq(uint256(b.status), uint256(TreasuryGovernor.BountyStatus.Cancelled));
    }

    function test_cancelBounty_reverts_completed() public {
        uint256 bid = _createBounty("test", "desc", 1_000 ether, address(lob), "dev", 2, block.timestamp + 30 days);

        vm.prank(outsider);
        treasury.claimBounty(bid);

        vm.prank(address(treasury));
        treasury.completeBounty(bid);

        vm.prank(signer1);
        vm.expectRevert("TreasuryGovernor: not cancellable");
        treasury.cancelBounty(bid);
    }

    function test_cancelBounty_reverts_non_signer() public {
        uint256 bid = _createBounty("test", "desc", 1_000 ether, address(lob), "dev", 2, block.timestamp + 30 days);

        vm.prank(outsider);
        vm.expectRevert();
        treasury.cancelBounty(bid);
    }

    function test_bounty_usdc_reward() public {
        uint256 reward = 5_000 * 1e6; // 5K USDC

        uint256 bid = _createBounty("Design", "Brand kit", reward, address(usdc), "design", 2, block.timestamp + 30 days);

        vm.prank(outsider);
        treasury.claimBounty(bid);

        uint256 claimantBalBefore = usdc.balanceOf(outsider);

        vm.prank(address(treasury));
        treasury.completeBounty(bid);

        assertEq(usdc.balanceOf(outsider), claimantBalBefore + reward);
    }

    function test_nextBountyId_auto_increments() public {
        uint256 bid1 = _createBounty("b1", "d1", 100 ether, address(lob), "dev", 1, block.timestamp + 1 days);
        uint256 bid2 = _createBounty("b2", "d2", 200 ether, address(lob), "dev", 2, block.timestamp + 1 days);
        uint256 bid3 = _createBounty("b3", "d3", 300 ether, address(lob), "dev", 3, block.timestamp + 1 days);

        assertEq(bid1, 1);
        assertEq(bid2, 2);
        assertEq(bid3, 3);
        assertEq(treasury.nextBountyId(), 4);
    }

    function test_CreateBounty_ReservesFunds_BlocksOvercommit() public {
        // Create a bounty that uses most of the treasury
        uint256 firstReward = TREASURY_LOB - 1_000 ether;
        uint256 bid1 = _createBounty("big", "desc", firstReward, address(lob), "dev", 3, block.timestamp + 30 days);

        // Reserved balance should track the bounty
        assertEq(treasury.reservedBalance(address(lob)), firstReward);

        // Creating another bounty for more than remaining available should fail
        vm.prank(address(treasury));
        vm.expectRevert("TreasuryGovernor: insufficient balance for bounty");
        treasury.createBounty("big2", "desc", 2_000 ether, address(lob), "dev", 2, block.timestamp + 30 days);

        // But one within available should work
        uint256 bid2 = _createBounty("small", "desc", 500 ether, address(lob), "dev", 1, block.timestamp + 30 days);
        assertEq(treasury.reservedBalance(address(lob)), firstReward + 500 ether);

        // Cancel first bounty → frees reserved funds
        vm.prank(signer1);
        treasury.cancelBounty(bid1);
        assertEq(treasury.reservedBalance(address(lob)), 500 ether);

        // Complete second bounty → frees reserved funds
        vm.prank(outsider);
        treasury.claimBounty(bid2);
        vm.prank(address(treasury));
        treasury.completeBounty(bid2);
        assertEq(treasury.reservedBalance(address(lob)), 0);
    }

    function test_bounty_via_admin_proposal() public {
        // Create bounty via admin proposal flow
        bytes memory data = abi.encodeWithSelector(
            treasury.createBounty.selector,
            "SDK Bounty",
            "Build Python SDK",
            10_000 ether,
            address(lob),
            "dev",
            uint8(3),
            block.timestamp + 30 days
        );

        vm.prank(signer1);
        uint256 pid = treasury.createAdminProposal(address(treasury), data, "Create SDK bounty");

        vm.prank(signer2);
        treasury.approveAdminProposal(pid);

        (, , , , , , , , uint256 timelockEnd) = treasury.adminProposals(pid);
        vm.warp(timelockEnd);

        treasury.executeAdminProposal(pid);

        // Verify bounty was created
        TreasuryGovernor.Bounty memory b = treasury.getBounty(1);
        assertEq(b.reward, 10_000 ether);
    }

    function test_adminProposal_self_target_createStream() public {
        bytes memory data = abi.encodeWithSelector(
            treasury.createStream.selector,
            recipient,
            address(lob),
            10_000 ether,
            30 days,
            "moderator"
        );

        vm.prank(signer1);
        uint256 pid = treasury.createAdminProposal(address(treasury), data, "Create moderator stream");

        vm.prank(signer2);
        treasury.approveAdminProposal(pid);

        (, , , , , , , , uint256 timelockEnd) = treasury.adminProposals(pid);
        vm.warp(timelockEnd);

        treasury.executeAdminProposal(pid);

        // Verify stream was created
        TreasuryGovernor.PaymentStream memory s = treasury.getStream(1);
        assertEq(s.recipient, recipient);
        assertEq(s.totalAmount, 10_000 ether);
    }

    /* ═══════════════════════════════════════════════════════════════
       DELEGATION TESTS
       ═══════════════════════════════════════════════════════════════ */

    function test_delegate_works() public {
        vm.prank(outsider);
        treasury.delegate(signer1);

        assertEq(treasury.getDelegatee(outsider), signer1);
        assertEq(treasury.delegatorCount(signer1), 1);
    }

    function test_delegate_updates_count_on_change() public {
        vm.prank(outsider);
        treasury.delegate(signer1);

        assertEq(treasury.delegatorCount(signer1), 1);
        assertEq(treasury.delegatorCount(signer2), 0);

        // Change delegation
        vm.prank(outsider);
        treasury.delegate(signer2);

        assertEq(treasury.delegatorCount(signer1), 0);
        assertEq(treasury.delegatorCount(signer2), 1);
        assertEq(treasury.getDelegatee(outsider), signer2);
    }

    function test_delegate_reverts_zero_address() public {
        vm.prank(outsider);
        vm.expectRevert("TreasuryGovernor: zero delegate");
        treasury.delegate(address(0));
    }

    function test_delegate_reverts_self_delegate() public {
        vm.prank(outsider);
        vm.expectRevert("TreasuryGovernor: cannot self-delegate");
        treasury.delegate(outsider);
    }

    function test_undelegate_works() public {
        vm.prank(outsider);
        treasury.delegate(signer1);

        assertEq(treasury.delegatorCount(signer1), 1);

        vm.prank(outsider);
        treasury.undelegate();

        assertEq(treasury.getDelegatee(outsider), address(0));
        assertEq(treasury.delegatorCount(signer1), 0);
    }

    function test_undelegate_reverts_not_delegated() public {
        vm.prank(outsider);
        vm.expectRevert("TreasuryGovernor: not delegated");
        treasury.undelegate();
    }

    function test_multiple_delegators() public {
        address user1 = makeAddr("user1");
        address user2 = makeAddr("user2");
        address user3 = makeAddr("user3");

        vm.prank(user1);
        treasury.delegate(signer1);
        vm.prank(user2);
        treasury.delegate(signer1);
        vm.prank(user3);
        treasury.delegate(signer1);

        assertEq(treasury.delegatorCount(signer1), 3);

        // user2 undelegates
        vm.prank(user2);
        treasury.undelegate();

        assertEq(treasury.delegatorCount(signer1), 2);
    }
}
