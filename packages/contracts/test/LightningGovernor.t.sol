// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/LightningGovernor.sol";
import "../src/StakingManager.sol";
import "../src/LOBToken.sol";

/// @dev Mock target that LightningGovernor proposals will call
contract MockTarget {
    bool public paused;
    uint256 public value;

    function pause() external {
        paused = true;
    }

    function unpause() external {
        paused = false;
    }

    function setValue(uint256 v) external {
        value = v;
    }

    function alwaysReverts() external pure {
        revert("MockTarget: boom");
    }
}

contract LightningGovernorTest is Test {
    // Re-declare events for expectEmit
    event ProposalCreated(uint256 indexed proposalId, address indexed proposer, address target, bytes4 selector, string description);
    event Voted(uint256 indexed proposalId, address indexed voter, uint256 newVoteCount);
    event ProposalApproved(uint256 indexed proposalId, uint256 executionDeadline);
    event ProposalExecuted(uint256 indexed proposalId, address indexed executor);
    event ProposalCancelled(uint256 indexed proposalId, address indexed cancelledBy);
    event WhitelistUpdated(address indexed target, bytes4 indexed selector, bool allowed);
    event QuorumUpdated(uint256 oldQuorum, uint256 newQuorum);
    event ExecutionDelayUpdated(uint256 oldDelay, uint256 newDelay);
    event VotingWindowUpdated(uint256 oldWindow, uint256 newWindow);
    event ExecutionWindowUpdated(uint256 oldWindow, uint256 newWindow);

    LOBToken public token;
    StakingManager public staking;
    LightningGovernor public gov;
    MockTarget public target;

    address public admin = makeAddr("admin"); // TreasuryGovernor stand-in
    address public guardian = makeAddr("guardian");
    address public executor1 = makeAddr("sentinel");
    address public executor2 = makeAddr("arbiter");
    address public executor3 = makeAddr("steward");

    // Platinum stakers (100K+ LOB each)
    address public platinum1 = makeAddr("platinum1");
    address public platinum2 = makeAddr("platinum2");
    address public platinum3 = makeAddr("platinum3");
    address public platinum4 = makeAddr("platinum4");

    // Non-platinum
    address public goldStaker = makeAddr("goldStaker");
    address public nobody = makeAddr("nobody");

    uint256 constant PLATINUM_AMOUNT = 100_000 ether;
    uint256 constant GOLD_AMOUNT = 10_000 ether;

    function setUp() public {
        // Deploy core
        token = new LOBToken();
        token.initialize(address(this));
        staking = new StakingManager();
        staking.initialize(address(token));
        target = new MockTarget();

        // Deploy LightningGovernor
        address[] memory executors = new address[](3);
        executors[0] = executor1;
        executors[1] = executor2;
        executors[2] = executor3;
        gov = new LightningGovernor();
        gov.initialize(address(staking), admin, executors, guardian);

        // Fund & stake Platinum users
        _fundAndStake(platinum1, PLATINUM_AMOUNT);
        _fundAndStake(platinum2, PLATINUM_AMOUNT);
        _fundAndStake(platinum3, PLATINUM_AMOUNT);
        _fundAndStake(platinum4, PLATINUM_AMOUNT);

        // Fund & stake Gold user
        _fundAndStake(goldStaker, GOLD_AMOUNT);

        // Whitelist target functions
        vm.startPrank(admin);
        gov.setWhitelisted(address(target), MockTarget.pause.selector, true);
        gov.setWhitelisted(address(target), MockTarget.unpause.selector, true);
        gov.setWhitelisted(address(target), MockTarget.setValue.selector, true);
        gov.setWhitelisted(address(target), MockTarget.alwaysReverts.selector, true);
        vm.stopPrank();
    }

    function _fundAndStake(address user, uint256 amount) internal {
        token.transfer(user, amount);
        vm.startPrank(user);
        token.approve(address(staking), amount);
        staking.stake(amount);
        vm.stopPrank();
    }

    function _createDefaultProposal(address proposer) internal returns (uint256) {
        bytes memory data = abi.encodeWithSelector(MockTarget.pause.selector);
        vm.prank(proposer);
        return gov.createProposal(address(target), data, "Pause target");
    }

    function _createAndApprove() internal returns (uint256) {
        uint256 pid = _createDefaultProposal(platinum1);
        vm.prank(platinum2);
        gov.vote(pid);
        vm.prank(platinum3);
        gov.vote(pid);
        return pid;
    }

    // ════════════════════════════════════════════════════════════════
    // Constructor tests
    // ════════════════════════════════════════════════════════════════

    function test_constructor_rolesSetCorrectly() public view {
        assertTrue(gov.hasRole(gov.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(gov.hasRole(gov.EXECUTOR_ROLE(), executor1));
        assertTrue(gov.hasRole(gov.EXECUTOR_ROLE(), executor2));
        assertTrue(gov.hasRole(gov.EXECUTOR_ROLE(), executor3));
        assertTrue(gov.hasRole(gov.GUARDIAN_ROLE(), guardian));
    }

    function test_constructor_deployerHasNoRoles() public view {
        assertFalse(gov.hasRole(gov.DEFAULT_ADMIN_ROLE(), address(this)));
        assertFalse(gov.hasRole(gov.EXECUTOR_ROLE(), address(this)));
        assertFalse(gov.hasRole(gov.GUARDIAN_ROLE(), address(this)));
    }

    function test_constructor_defaults() public view {
        assertEq(gov.quorum(), 3);
        assertEq(gov.executionDelay(), 15 minutes);
        assertEq(gov.votingWindow(), 24 hours);
        assertEq(gov.executionWindow(), 6 hours);
    }

    function test_constructor_revertZeroStakingManager() public {
        address[] memory executors = new address[](1);
        executors[0] = executor1;
        LightningGovernor g = new LightningGovernor();
        vm.expectRevert("LightningGovernor: zero staking manager");
        g.initialize(address(0), admin, executors, guardian);
    }

    function test_constructor_revertZeroAdmin() public {
        address[] memory executors = new address[](1);
        executors[0] = executor1;
        LightningGovernor g = new LightningGovernor();
        vm.expectRevert("LightningGovernor: zero admin");
        g.initialize(address(staking), address(0), executors, guardian);
    }

    function test_constructor_revertZeroGuardian() public {
        address[] memory executors = new address[](1);
        executors[0] = executor1;
        LightningGovernor g = new LightningGovernor();
        vm.expectRevert("LightningGovernor: zero guardian");
        g.initialize(address(staking), admin, executors, address(0));
    }

    // ════════════════════════════════════════════════════════════════
    // createProposal tests
    // ════════════════════════════════════════════════════════════════

    function test_createProposal_platinumWorks() public {
        bytes memory data = abi.encodeWithSelector(MockTarget.pause.selector);

        vm.expectEmit(true, true, false, true);
        emit ProposalCreated(1, platinum1, address(target), MockTarget.pause.selector, "Pause it");
        vm.expectEmit(true, true, false, true);
        emit Voted(1, platinum1, 1);

        vm.prank(platinum1);
        uint256 pid = gov.createProposal(address(target), data, "Pause it");
        assertEq(pid, 1);

        ILightningGovernor.Proposal memory p = gov.getProposal(pid);
        assertEq(p.proposer, platinum1);
        assertEq(p.target, address(target));
        assertEq(p.voteCount, 1);
        assertTrue(p.status == ILightningGovernor.ProposalStatus.Active);
        assertTrue(gov.hasVoted(pid, platinum1));
    }

    function test_createProposal_revertNonPlatinum() public {
        bytes memory data = abi.encodeWithSelector(MockTarget.pause.selector);
        vm.prank(goldStaker);
        vm.expectRevert("LightningGovernor: not Platinum");
        gov.createProposal(address(target), data, "Nope");
    }

    function test_createProposal_revertNobody() public {
        bytes memory data = abi.encodeWithSelector(MockTarget.pause.selector);
        vm.prank(nobody);
        vm.expectRevert("LightningGovernor: not Platinum");
        gov.createProposal(address(target), data, "Nope");
    }

    function test_createProposal_revertNotWhitelisted() public {
        // setValue is whitelisted but let's use a non-whitelisted selector
        bytes memory data = abi.encodeWithSelector(bytes4(keccak256("nonexistent()")));
        vm.prank(platinum1);
        vm.expectRevert("LightningGovernor: not whitelisted");
        gov.createProposal(address(target), data, "Bad target");
    }

    function test_createProposal_revertSelfTarget() public {
        // Try to target the governor itself
        bytes memory data = abi.encodeWithSelector(LightningGovernor.pause.selector);
        vm.prank(platinum1);
        vm.expectRevert("LightningGovernor: no self-calls");
        gov.createProposal(address(gov), data, "Self call");
    }

    function test_createProposal_revertShortCalldata() public {
        vm.prank(platinum1);
        vm.expectRevert("LightningGovernor: calldata too short");
        gov.createProposal(address(target), hex"aabb", "Short");
    }

    function test_createProposal_autoVotesProposer() public {
        uint256 pid = _createDefaultProposal(platinum1);
        ILightningGovernor.Proposal memory p = gov.getProposal(pid);
        assertEq(p.voteCount, 1);
        assertTrue(gov.hasVoted(pid, platinum1));
    }

    function test_createProposal_cooldownEnforced() public {
        _createDefaultProposal(platinum1);
        bytes memory data = abi.encodeWithSelector(MockTarget.unpause.selector);
        vm.prank(platinum1);
        vm.expectRevert("LightningGovernor: cooldown active");
        gov.createProposal(address(target), data, "Too soon");

        // After cooldown passes
        vm.warp(block.timestamp + 10 minutes + 1);
        vm.prank(platinum1);
        uint256 pid2 = gov.createProposal(address(target), data, "Now OK");
        assertEq(pid2, 2);
    }

    function test_createProposal_revertWhenPaused() public {
        vm.prank(admin);
        gov.pause();
        bytes memory data = abi.encodeWithSelector(MockTarget.pause.selector);
        vm.prank(platinum1);
        vm.expectRevert("EnforcedPause()");
        gov.createProposal(address(target), data, "Paused");
    }

    // ════════════════════════════════════════════════════════════════
    // vote tests
    // ════════════════════════════════════════════════════════════════

    function test_vote_platinumWorks() public {
        uint256 pid = _createDefaultProposal(platinum1);

        vm.expectEmit(true, true, false, true);
        emit Voted(pid, platinum2, 2);

        vm.prank(platinum2);
        gov.vote(pid);

        ILightningGovernor.Proposal memory p = gov.getProposal(pid);
        assertEq(p.voteCount, 2);
        assertTrue(gov.hasVoted(pid, platinum2));
    }

    function test_vote_revertNonPlatinum() public {
        uint256 pid = _createDefaultProposal(platinum1);
        vm.prank(goldStaker);
        vm.expectRevert("LightningGovernor: not Platinum");
        gov.vote(pid);
    }

    function test_vote_revertAlreadyVoted() public {
        uint256 pid = _createDefaultProposal(platinum1);
        vm.prank(platinum1); // already voted via create
        vm.expectRevert("LightningGovernor: already voted");
        gov.vote(pid);
    }

    function test_vote_revertNotFound() public {
        vm.prank(platinum1);
        vm.expectRevert("LightningGovernor: proposal not found");
        gov.vote(999);
    }

    function test_vote_revertNotActive() public {
        uint256 pid = _createAndApprove();
        vm.prank(platinum4);
        vm.expectRevert("LightningGovernor: not active");
        gov.vote(pid);
    }

    function test_vote_revertVotingClosed() public {
        uint256 pid = _createDefaultProposal(platinum1);
        vm.warp(block.timestamp + 24 hours + 1);
        vm.prank(platinum2);
        vm.expectRevert("LightningGovernor: voting closed");
        gov.vote(pid);
    }

    function test_vote_revertWhenPaused() public {
        uint256 pid = _createDefaultProposal(platinum1);
        vm.prank(admin);
        gov.pause();
        vm.prank(platinum2);
        vm.expectRevert("EnforcedPause()");
        gov.vote(pid);
    }

    // ════════════════════════════════════════════════════════════════
    // Auto-approve tests
    // ════════════════════════════════════════════════════════════════

    function test_autoApprove_triggersOnQuorum() public {
        uint256 pid = _createDefaultProposal(platinum1);

        vm.prank(platinum2);
        gov.vote(pid);

        // Still active at 2 votes
        ILightningGovernor.Proposal memory p = gov.getProposal(pid);
        assertTrue(p.status == ILightningGovernor.ProposalStatus.Active);

        // 3rd vote triggers approval
        vm.expectEmit(true, false, false, true);
        emit ProposalApproved(pid, block.timestamp + 15 minutes + 6 hours);
        vm.prank(platinum3);
        gov.vote(pid);

        p = gov.getProposal(pid);
        assertTrue(p.status == ILightningGovernor.ProposalStatus.Approved);
        assertEq(p.approvedAt, block.timestamp);
    }

    function test_autoApprove_setsTimingCorrectly() public {
        uint256 pid = _createAndApprove();
        ILightningGovernor.Proposal memory p = gov.getProposal(pid);
        assertEq(p.executionDeadline, p.approvedAt + 15 minutes + 6 hours);
    }

    function test_autoApprove_notBelowQuorum() public {
        uint256 pid = _createDefaultProposal(platinum1);
        vm.prank(platinum2);
        gov.vote(pid);

        ILightningGovernor.Proposal memory p = gov.getProposal(pid);
        assertTrue(p.status == ILightningGovernor.ProposalStatus.Active);
        assertEq(p.approvedAt, 0);
    }

    // ════════════════════════════════════════════════════════════════
    // execute tests
    // ════════════════════════════════════════════════════════════════

    function test_execute_worksAfterDelay() public {
        uint256 pid = _createAndApprove();

        vm.warp(block.timestamp + 15 minutes);

        vm.expectEmit(true, true, false, false);
        emit ProposalExecuted(pid, executor1);

        vm.prank(executor1);
        gov.execute(pid);

        assertTrue(target.paused());
        ILightningGovernor.Proposal memory p = gov.getProposal(pid);
        assertTrue(p.status == ILightningGovernor.ProposalStatus.Executed);
    }

    function test_execute_revertBeforeDelay() public {
        uint256 pid = _createAndApprove();
        vm.warp(block.timestamp + 14 minutes);
        vm.prank(executor1);
        vm.expectRevert("LightningGovernor: delay not met");
        gov.execute(pid);
    }

    function test_execute_revertNonExecutor() public {
        uint256 pid = _createAndApprove();
        vm.warp(block.timestamp + 15 minutes);
        vm.prank(platinum1);
        vm.expectRevert();
        gov.execute(pid);
    }

    function test_execute_revertNotApproved() public {
        uint256 pid = _createDefaultProposal(platinum1);
        vm.warp(block.timestamp + 15 minutes);
        vm.prank(executor1);
        vm.expectRevert("LightningGovernor: not approved");
        gov.execute(pid);
    }

    function test_execute_revertExpired() public {
        uint256 pid = _createAndApprove();
        ILightningGovernor.Proposal memory p = gov.getProposal(pid);
        vm.warp(p.executionDeadline + 1);
        vm.prank(executor1);
        vm.expectRevert("LightningGovernor: execution expired");
        gov.execute(pid);
    }

    function test_execute_revertWhitelistRevoked() public {
        uint256 pid = _createAndApprove();
        vm.warp(block.timestamp + 15 minutes);

        // Admin revokes whitelist between approval and execution
        vm.prank(admin);
        gov.setWhitelisted(address(target), MockTarget.pause.selector, false);

        vm.prank(executor1);
        vm.expectRevert("LightningGovernor: whitelist revoked");
        gov.execute(pid);
    }

    function test_execute_revertWhenPaused() public {
        uint256 pid = _createAndApprove();
        vm.warp(block.timestamp + 15 minutes);
        vm.prank(admin);
        gov.pause();
        vm.prank(executor1);
        vm.expectRevert("EnforcedPause()");
        gov.execute(pid);
    }

    // ════════════════════════════════════════════════════════════════
    // cancel tests
    // ════════════════════════════════════════════════════════════════

    function test_cancel_byProposer() public {
        uint256 pid = _createDefaultProposal(platinum1);

        vm.expectEmit(true, true, false, false);
        emit ProposalCancelled(pid, platinum1);

        vm.prank(platinum1);
        gov.cancel(pid);

        ILightningGovernor.Proposal memory p = gov.getProposal(pid);
        assertTrue(p.status == ILightningGovernor.ProposalStatus.Cancelled);
    }

    function test_cancel_byGuardian() public {
        uint256 pid = _createDefaultProposal(platinum1);
        vm.prank(guardian);
        gov.cancel(pid);

        ILightningGovernor.Proposal memory p = gov.getProposal(pid);
        assertTrue(p.status == ILightningGovernor.ProposalStatus.Cancelled);
    }

    function test_cancel_approvedProposal() public {
        uint256 pid = _createAndApprove();
        vm.prank(guardian);
        gov.cancel(pid);

        ILightningGovernor.Proposal memory p = gov.getProposal(pid);
        assertTrue(p.status == ILightningGovernor.ProposalStatus.Cancelled);
    }

    function test_cancel_revertUnauthorized() public {
        uint256 pid = _createDefaultProposal(platinum1);
        vm.prank(platinum2);
        vm.expectRevert("LightningGovernor: unauthorized");
        gov.cancel(pid);
    }

    function test_cancel_revertAlreadyExecuted() public {
        uint256 pid = _createAndApprove();
        vm.warp(block.timestamp + 15 minutes);
        vm.prank(executor1);
        gov.execute(pid);

        vm.prank(guardian);
        vm.expectRevert("LightningGovernor: not cancellable");
        gov.cancel(pid);
    }

    function test_cancel_revertAlreadyCancelled() public {
        uint256 pid = _createDefaultProposal(platinum1);
        vm.prank(platinum1);
        gov.cancel(pid);

        vm.prank(guardian);
        vm.expectRevert("LightningGovernor: not cancellable");
        gov.cancel(pid);
    }

    // ════════════════════════════════════════════════════════════════
    // Admin config tests
    // ════════════════════════════════════════════════════════════════

    function test_setWhitelisted_add() public {
        bytes4 sel = bytes4(keccak256("newFunc()"));
        vm.expectEmit(true, true, false, true);
        emit WhitelistUpdated(address(target), sel, true);
        vm.prank(admin);
        gov.setWhitelisted(address(target), sel, true);
        assertTrue(gov.isWhitelisted(address(target), sel));
    }

    function test_setWhitelisted_remove() public {
        vm.prank(admin);
        gov.setWhitelisted(address(target), MockTarget.pause.selector, false);
        assertFalse(gov.isWhitelisted(address(target), MockTarget.pause.selector));
    }

    function test_setWhitelisted_revertSelfTarget() public {
        vm.prank(admin);
        vm.expectRevert("LightningGovernor: cannot whitelist self");
        gov.setWhitelisted(address(gov), MockTarget.pause.selector, true);
    }

    function test_setWhitelisted_revertZeroTarget() public {
        vm.prank(admin);
        vm.expectRevert("LightningGovernor: zero target");
        gov.setWhitelisted(address(0), MockTarget.pause.selector, true);
    }

    function test_setWhitelisted_revertNonAdmin() public {
        vm.prank(platinum1);
        vm.expectRevert();
        gov.setWhitelisted(address(target), MockTarget.pause.selector, false);
    }

    function test_setQuorum_works() public {
        vm.expectEmit(false, false, false, true);
        emit QuorumUpdated(3, 5);
        vm.prank(admin);
        gov.setQuorum(5);
        assertEq(gov.quorum(), 5);
    }

    function test_setQuorum_revertBelowMin() public {
        vm.prank(admin);
        vm.expectRevert("LightningGovernor: quorum out of bounds");
        gov.setQuorum(1);
    }

    function test_setQuorum_revertAboveMax() public {
        vm.prank(admin);
        vm.expectRevert("LightningGovernor: quorum out of bounds");
        gov.setQuorum(21);
    }

    function test_setExecutionDelay_works() public {
        vm.prank(admin);
        gov.setExecutionDelay(30 minutes);
        assertEq(gov.executionDelay(), 30 minutes);
    }

    function test_setExecutionDelay_revertBelowMin() public {
        vm.prank(admin);
        vm.expectRevert("LightningGovernor: delay out of bounds");
        gov.setExecutionDelay(5 minutes);
    }

    function test_setExecutionDelay_revertAboveMax() public {
        vm.prank(admin);
        vm.expectRevert("LightningGovernor: delay out of bounds");
        gov.setExecutionDelay(7 hours);
    }

    function test_setVotingWindow_works() public {
        vm.prank(admin);
        gov.setVotingWindow(48 hours);
        assertEq(gov.votingWindow(), 48 hours);
    }

    function test_setVotingWindow_revertBelowMin() public {
        vm.prank(admin);
        vm.expectRevert("LightningGovernor: voting window out of bounds");
        gov.setVotingWindow(30 minutes);
    }

    function test_setVotingWindow_revertAboveMax() public {
        vm.prank(admin);
        vm.expectRevert("LightningGovernor: voting window out of bounds");
        gov.setVotingWindow(8 days);
    }

    function test_setExecutionWindow_works() public {
        vm.prank(admin);
        gov.setExecutionWindow(12 hours);
        assertEq(gov.executionWindow(), 12 hours);
    }

    function test_setExecutionWindow_revertBelowMin() public {
        vm.prank(admin);
        vm.expectRevert("LightningGovernor: execution window out of bounds");
        gov.setExecutionWindow(30 minutes);
    }

    function test_setExecutionWindow_revertAboveMax() public {
        vm.prank(admin);
        vm.expectRevert("LightningGovernor: execution window out of bounds");
        gov.setExecutionWindow(49 hours);
    }

    function test_pause_unpause() public {
        vm.prank(admin);
        gov.pause();
        assertTrue(gov.paused());

        vm.prank(admin);
        gov.unpause();
        assertFalse(gov.paused());
    }

    // ════════════════════════════════════════════════════════════════
    // Expiry / getEffectiveStatus tests
    // ════════════════════════════════════════════════════════════════

    function test_effectiveStatus_activeNotExpired() public {
        uint256 pid = _createDefaultProposal(platinum1);
        assertTrue(gov.getEffectiveStatus(pid) == ILightningGovernor.ProposalStatus.Active);
    }

    function test_effectiveStatus_activeExpired() public {
        uint256 pid = _createDefaultProposal(platinum1);
        vm.warp(block.timestamp + 24 hours + 1);
        assertTrue(gov.getEffectiveStatus(pid) == ILightningGovernor.ProposalStatus.Expired);
    }

    function test_effectiveStatus_approvedNotExpired() public {
        uint256 pid = _createAndApprove();
        assertTrue(gov.getEffectiveStatus(pid) == ILightningGovernor.ProposalStatus.Approved);
    }

    function test_effectiveStatus_approvedExpired() public {
        uint256 pid = _createAndApprove();
        ILightningGovernor.Proposal memory p = gov.getProposal(pid);
        vm.warp(p.executionDeadline + 1);
        assertTrue(gov.getEffectiveStatus(pid) == ILightningGovernor.ProposalStatus.Expired);
    }

    // ════════════════════════════════════════════════════════════════
    // Integration tests
    // ════════════════════════════════════════════════════════════════

    function test_integration_fullLifecycle() public {
        // 1. Create proposal to set value
        bytes memory data = abi.encodeWithSelector(MockTarget.setValue.selector, uint256(42));
        vm.prank(platinum1);
        uint256 pid = gov.createProposal(address(target), data, "Set value to 42");

        // 2. Two more votes → quorum
        vm.prank(platinum2);
        gov.vote(pid);
        vm.prank(platinum3);
        gov.vote(pid);

        // 3. Verify approved
        ILightningGovernor.Proposal memory p = gov.getProposal(pid);
        assertTrue(p.status == ILightningGovernor.ProposalStatus.Approved);

        // 4. Wait for delay
        vm.warp(block.timestamp + 15 minutes);

        // 5. Execute
        vm.prank(executor1);
        gov.execute(pid);

        // 6. Verify target state changed
        assertEq(target.value(), 42);

        // 7. Verify proposal finalized
        p = gov.getProposal(pid);
        assertTrue(p.status == ILightningGovernor.ProposalStatus.Executed);
    }

    function test_integration_voterDemotedAfterVoting() public {
        // Platinum1 creates proposal (auto-votes)
        uint256 pid = _createDefaultProposal(platinum1);

        // Platinum2 votes
        vm.prank(platinum2);
        gov.vote(pid);

        // Platinum2 requests unstake — won't complete for 7 days but
        // their vote is already recorded
        vm.prank(platinum2);
        staking.requestUnstake(PLATINUM_AMOUNT);

        // Still at tier Platinum because unstake hasn't completed (cooldown)
        assertEq(uint256(staking.getTier(platinum2)), uint256(IStakingManager.Tier.Platinum));

        // Platinum3 votes → quorum reached
        vm.prank(platinum3);
        gov.vote(pid);

        ILightningGovernor.Proposal memory p = gov.getProposal(pid);
        assertTrue(p.status == ILightningGovernor.ProposalStatus.Approved);
        assertEq(p.voteCount, 3);
    }

    function test_integration_proposalCountIncrement() public {
        assertEq(gov.proposalCount(), 0);

        _createDefaultProposal(platinum1);
        assertEq(gov.proposalCount(), 1);

        vm.warp(block.timestamp + 10 minutes + 1);
        _createDefaultProposal(platinum2);
        assertEq(gov.proposalCount(), 2);
    }

    function test_integration_executionFails() public {
        // Create proposal targeting alwaysReverts
        bytes memory data = abi.encodeWithSelector(MockTarget.alwaysReverts.selector);
        vm.prank(platinum1);
        uint256 pid = gov.createProposal(address(target), data, "Will fail");

        vm.prank(platinum2);
        gov.vote(pid);
        vm.prank(platinum3);
        gov.vote(pid);

        vm.warp(block.timestamp + 15 minutes);

        vm.prank(executor1);
        vm.expectRevert();
        gov.execute(pid);
    }

    function test_integration_multipleExecutors() public {
        // All 3 executors can execute, but only one gets to
        uint256 pid = _createAndApprove();
        vm.warp(block.timestamp + 15 minutes);

        vm.prank(executor2); // Arbiter executes this one
        gov.execute(pid);

        assertTrue(target.paused());
    }
}
