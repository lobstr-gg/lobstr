// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/DirectiveBoard.sol";
import "../src/interfaces/IDirectiveBoard.sol";

/// @dev Minimal mock for SybilGuard.checkBanned
contract MockSybilGuard {
    mapping(address => bool) public banned;

    function ban(address a) external { banned[a] = true; }

    function checkBanned(address a) external view returns (bool) {
        return banned[a];
    }
}

contract DirectiveBoardTest is Test {
    // Re-declare events for vm.expectEmit
    event DirectivePosted(uint256 indexed id, IDirectiveBoard.DirectiveType indexed directiveType, address indexed poster, address target, bytes32 contentHash, string contentURI, uint256 expiresAt);
    event DirectiveExecuted(uint256 indexed id, address indexed executor);
    event DirectiveCancelled(uint256 indexed id, address indexed canceller);

    DirectiveBoard board;
    MockSybilGuard sybil;

    address admin = address(this);
    address poster = makeAddr("poster");
    address poster2 = makeAddr("poster2");
    address executor = makeAddr("executor");
    address agent1 = makeAddr("agent1");
    address agent2 = makeAddr("agent2");
    address rando = makeAddr("rando");

    function setUp() public {
        sybil = new MockSybilGuard();
        board = new DirectiveBoard();
        board.initialize(address(sybil), address(this));

        board.grantRole(board.POSTER_ROLE(), poster);
        board.grantRole(board.POSTER_ROLE(), poster2);
        board.grantRole(board.EXECUTOR_ROLE(), executor);
    }

    // ── Post ──────────────────────────────────────────────────────

    function test_postDirective() public {
        vm.prank(poster);
        uint256 id = board.postDirective(
            IDirectiveBoard.DirectiveType.AgentTask,
            agent1,
            keccak256("hello"),
            "https://lobstr.gg/forum/posts/1",
            0
        );
        assertEq(id, 1);

        IDirectiveBoard.Directive memory d = board.getDirective(id);
        assertEq(d.id, 1);
        assertEq(uint8(d.directiveType), uint8(IDirectiveBoard.DirectiveType.AgentTask));
        assertEq(d.poster, poster);
        assertEq(d.target, agent1);
        assertEq(d.contentHash, keccak256("hello"));
        assertEq(d.contentURI, "https://lobstr.gg/forum/posts/1");
        assertEq(uint8(d.status), uint8(IDirectiveBoard.DirectiveStatus.Active));
        assertEq(d.expiresAt, 0);
    }

    function test_postDirective_withExpiry() public {
        vm.prank(poster);
        uint256 id = board.postDirective(
            IDirectiveBoard.DirectiveType.DisputeReview,
            agent1,
            keccak256("review"),
            "ipfs://Qm123",
            block.timestamp + 1 days
        );

        IDirectiveBoard.Directive memory d = board.getDirective(id);
        assertEq(d.expiresAt, block.timestamp + 1 days);
    }

    function test_postDirective_emitsEvent() public {
        vm.expectEmit(true, true, true, true);
        emit DirectivePosted(
            1,
            IDirectiveBoard.DirectiveType.SystemBroadcast,
            poster,
            address(0),
            keccak256("broadcast"),
            "https://example.com",
            0
        );

        vm.prank(poster);
        board.postDirective(
            IDirectiveBoard.DirectiveType.SystemBroadcast,
            address(0),
            keccak256("broadcast"),
            "https://example.com",
            0
        );
    }

    function test_postDirective_revertUnauthorized() public {
        vm.prank(rando);
        vm.expectRevert();
        board.postDirective(
            IDirectiveBoard.DirectiveType.AgentTask,
            agent1,
            keccak256("x"),
            "https://x.com",
            0
        );
    }

    function test_postDirective_revertBanned() public {
        sybil.ban(poster);
        vm.prank(poster);
        vm.expectRevert("DirectiveBoard: poster banned");
        board.postDirective(
            IDirectiveBoard.DirectiveType.AgentTask,
            agent1,
            keccak256("x"),
            "https://x.com",
            0
        );
    }

    function test_postDirective_revertEmptyURI() public {
        vm.prank(poster);
        vm.expectRevert("DirectiveBoard: empty URI");
        board.postDirective(
            IDirectiveBoard.DirectiveType.AgentTask,
            agent1,
            keccak256("x"),
            "",
            0
        );
    }

    function test_postDirective_revertExpiredTimestamp() public {
        vm.warp(1000); // Advance time so block.timestamp - 1 is nonzero
        vm.prank(poster);
        vm.expectRevert("DirectiveBoard: expired");
        board.postDirective(
            IDirectiveBoard.DirectiveType.AgentTask,
            agent1,
            keccak256("x"),
            "https://x.com",
            block.timestamp - 1
        );
    }

    // ── Mark Executed ─────────────────────────────────────────────

    function test_markExecuted_byExecutorRole() public {
        vm.prank(poster);
        uint256 id = board.postDirective(
            IDirectiveBoard.DirectiveType.AgentTask,
            agent1,
            keccak256("x"),
            "https://x.com",
            0
        );

        vm.expectEmit(true, true, false, false);
        emit DirectiveExecuted(id, executor);

        vm.prank(executor);
        board.markExecuted(id);

        IDirectiveBoard.Directive memory d = board.getDirective(id);
        assertEq(uint8(d.status), uint8(IDirectiveBoard.DirectiveStatus.Executed));
    }

    function test_markExecuted_byTarget() public {
        vm.prank(poster);
        uint256 id = board.postDirective(
            IDirectiveBoard.DirectiveType.AgentTask,
            agent1,
            keccak256("x"),
            "https://x.com",
            0
        );

        vm.prank(agent1);
        board.markExecuted(id);

        IDirectiveBoard.Directive memory d = board.getDirective(id);
        assertEq(uint8(d.status), uint8(IDirectiveBoard.DirectiveStatus.Executed));
    }

    function test_markExecuted_revertUnauthorized() public {
        vm.prank(poster);
        uint256 id = board.postDirective(
            IDirectiveBoard.DirectiveType.AgentTask,
            agent1,
            keccak256("x"),
            "https://x.com",
            0
        );

        vm.prank(rando);
        vm.expectRevert("DirectiveBoard: unauthorized");
        board.markExecuted(id);
    }

    function test_markExecuted_revertNotActive() public {
        vm.prank(poster);
        uint256 id = board.postDirective(
            IDirectiveBoard.DirectiveType.AgentTask,
            agent1,
            keccak256("x"),
            "https://x.com",
            0
        );

        vm.prank(executor);
        board.markExecuted(id);

        vm.prank(executor);
        vm.expectRevert("DirectiveBoard: not active");
        board.markExecuted(id);
    }

    // ── Cancel ────────────────────────────────────────────────────

    function test_cancelDirective_byPosterRole() public {
        vm.prank(poster);
        uint256 id = board.postDirective(
            IDirectiveBoard.DirectiveType.AgentTask,
            agent1,
            keccak256("x"),
            "https://x.com",
            0
        );

        vm.expectEmit(true, true, false, false);
        emit DirectiveCancelled(id, poster2);

        vm.prank(poster2);
        board.cancelDirective(id);

        IDirectiveBoard.Directive memory d = board.getDirective(id);
        assertEq(uint8(d.status), uint8(IDirectiveBoard.DirectiveStatus.Cancelled));
    }

    function test_cancelDirective_byOriginalPoster() public {
        vm.prank(poster);
        uint256 id = board.postDirective(
            IDirectiveBoard.DirectiveType.AgentTask,
            agent1,
            keccak256("x"),
            "https://x.com",
            0
        );

        // Revoke poster role — original poster should still be able to cancel their own
        board.revokeRole(board.POSTER_ROLE(), poster);

        vm.prank(poster);
        board.cancelDirective(id);

        IDirectiveBoard.Directive memory d = board.getDirective(id);
        assertEq(uint8(d.status), uint8(IDirectiveBoard.DirectiveStatus.Cancelled));
    }

    function test_cancelDirective_revertUnauthorized() public {
        vm.prank(poster);
        uint256 id = board.postDirective(
            IDirectiveBoard.DirectiveType.AgentTask,
            agent1,
            keccak256("x"),
            "https://x.com",
            0
        );

        vm.prank(rando);
        vm.expectRevert("DirectiveBoard: unauthorized");
        board.cancelDirective(id);
    }

    function test_cancelDirective_revertNotActive() public {
        vm.prank(poster);
        uint256 id = board.postDirective(
            IDirectiveBoard.DirectiveType.AgentTask,
            agent1,
            keccak256("x"),
            "https://x.com",
            0
        );

        vm.prank(poster);
        board.cancelDirective(id);

        vm.prank(poster);
        vm.expectRevert("DirectiveBoard: not active");
        board.cancelDirective(id);
    }

    // ── Get Active Directives ─────────────────────────────────────

    function test_getActiveDirectives_filtersExpired() public {
        vm.prank(poster);
        board.postDirective(
            IDirectiveBoard.DirectiveType.AgentTask,
            agent1,
            keccak256("1"),
            "https://1.com",
            block.timestamp + 1 hours
        );

        vm.prank(poster);
        board.postDirective(
            IDirectiveBoard.DirectiveType.AgentTask,
            agent1,
            keccak256("2"),
            "https://2.com",
            0
        );

        // Both active initially
        uint256[] memory active = board.getActiveDirectives(agent1);
        assertEq(active.length, 2);

        // Fast forward past expiry
        vm.warp(block.timestamp + 2 hours);
        active = board.getActiveDirectives(agent1);
        assertEq(active.length, 1);
        assertEq(active[0], 2); // Only the no-expiry one
    }

    function test_getActiveDirectives_includesBroadcasts() public {
        // Broadcast (target=address(0))
        vm.prank(poster);
        board.postDirective(
            IDirectiveBoard.DirectiveType.SystemBroadcast,
            address(0),
            keccak256("bc"),
            "https://broadcast.com",
            0
        );

        // Targeted directive
        vm.prank(poster);
        board.postDirective(
            IDirectiveBoard.DirectiveType.AgentTask,
            agent1,
            keccak256("task"),
            "https://task.com",
            0
        );

        // Agent1 should see both
        uint256[] memory active = board.getActiveDirectives(agent1);
        assertEq(active.length, 2);

        // Agent2 should only see broadcast
        active = board.getActiveDirectives(agent2);
        assertEq(active.length, 1);
        assertEq(active[0], 1);
    }

    function test_getActiveDirectives_excludesExecutedAndCancelled() public {
        vm.prank(poster);
        uint256 id1 = board.postDirective(
            IDirectiveBoard.DirectiveType.AgentTask,
            agent1,
            keccak256("1"),
            "https://1.com",
            0
        );

        vm.prank(poster);
        uint256 id2 = board.postDirective(
            IDirectiveBoard.DirectiveType.AgentTask,
            agent1,
            keccak256("2"),
            "https://2.com",
            0
        );

        vm.prank(poster);
        board.postDirective(
            IDirectiveBoard.DirectiveType.AgentTask,
            agent1,
            keccak256("3"),
            "https://3.com",
            0
        );

        vm.prank(executor);
        board.markExecuted(id1);

        vm.prank(poster);
        board.cancelDirective(id2);

        uint256[] memory active = board.getActiveDirectives(agent1);
        assertEq(active.length, 1);
        assertEq(active[0], 3);
    }

    // ── Get Directives By Type ────────────────────────────────────

    function test_getDirectivesByType() public {
        vm.prank(poster);
        board.postDirective(
            IDirectiveBoard.DirectiveType.DisputeReview,
            agent1,
            keccak256("d1"),
            "https://d1.com",
            0
        );

        vm.prank(poster);
        board.postDirective(
            IDirectiveBoard.DirectiveType.AgentTask,
            agent1,
            keccak256("t1"),
            "https://t1.com",
            0
        );

        vm.prank(poster);
        board.postDirective(
            IDirectiveBoard.DirectiveType.DisputeReview,
            agent2,
            keccak256("d2"),
            "https://d2.com",
            0
        );

        uint256[] memory disputes = board.getDirectivesByType(IDirectiveBoard.DirectiveType.DisputeReview);
        assertEq(disputes.length, 2);
        assertEq(disputes[0], 1);
        assertEq(disputes[1], 3);

        uint256[] memory tasks = board.getDirectivesByType(IDirectiveBoard.DirectiveType.AgentTask);
        assertEq(tasks.length, 1);
        assertEq(tasks[0], 2);
    }

    // ── Get Not Found ─────────────────────────────────────────────

    function test_getDirective_revertNotFound() public {
        vm.expectRevert("DirectiveBoard: not found");
        board.getDirective(999);
    }

    // ── Multiple IDs increment correctly ──────────────────────────

    function test_idIncrements() public {
        vm.startPrank(poster);
        uint256 id1 = board.postDirective(
            IDirectiveBoard.DirectiveType.AgentTask, agent1, keccak256("1"), "https://1.com", 0
        );
        uint256 id2 = board.postDirective(
            IDirectiveBoard.DirectiveType.AgentTask, agent1, keccak256("2"), "https://2.com", 0
        );
        uint256 id3 = board.postDirective(
            IDirectiveBoard.DirectiveType.AgentTask, agent1, keccak256("3"), "https://3.com", 0
        );
        vm.stopPrank();

        assertEq(id1, 1);
        assertEq(id2, 2);
        assertEq(id3, 3);
    }
}
