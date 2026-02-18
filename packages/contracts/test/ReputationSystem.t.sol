// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/ReputationSystem.sol";

contract ReputationSystemTest is Test {
    // Re-declare events for vm.expectEmit (Solidity 0.8.20 limitation)
    event CompletionRecorded(address indexed provider, address indexed client);
    event ScoreUpdated(address indexed user, uint256 newScore, IReputationSystem.ReputationTier newTier);
    ReputationSystem public reputation;

    address public admin = makeAddr("admin");
    address public recorder = makeAddr("recorder");
    address public provider = makeAddr("provider");
    address public client = makeAddr("client");

    function setUp() public {
        vm.startPrank(admin);
        reputation = new ReputationSystem();
        reputation.grantRole(reputation.RECORDER_ROLE(), recorder);
        vm.stopPrank();
    }

    function test_InitialScore() public view {
        (uint256 score, IReputationSystem.ReputationTier tier) = reputation.getScore(provider);
        assertEq(score, 500); // BASE_SCORE
        assertEq(uint256(tier), uint256(IReputationSystem.ReputationTier.Bronze));
    }

    function test_RecordCompletion_IncreasesScore() public {
        vm.prank(recorder);
        reputation.recordCompletion(provider, client); // delivered in half the time

        (uint256 score,) = reputation.getScore(provider);
        assertEq(score, 600); // 500 base + 100 completion
    }

    function test_MultipleCompletions_ReachSilver() public {
        vm.startPrank(recorder);
        for (uint256 i = 0; i < 5; i++) {
            reputation.recordCompletion(provider, client);
        }
        vm.stopPrank();

        (uint256 score, IReputationSystem.ReputationTier tier) = reputation.getScore(provider);
        assertEq(score, 1000); // 500 + 5*100
        assertEq(uint256(tier), uint256(IReputationSystem.ReputationTier.Silver));
    }

    function test_DisputeLoss_DecreasesScore() public {
        // First build up some score
        vm.startPrank(recorder);
        reputation.recordCompletion(provider, client);
        reputation.recordDispute(provider, false); // lost dispute
        vm.stopPrank();

        (uint256 score,) = reputation.getScore(provider);
        // 500 base + 100 completion - 200 dispute loss = 400
        assertEq(score, 400);
    }

    function test_DisputeWin_IncreasesScore() public {
        vm.startPrank(recorder);
        reputation.recordDispute(provider, true); // won dispute
        vm.stopPrank();

        (uint256 score,) = reputation.getScore(provider);
        assertEq(score, 550); // 500 base + 50 dispute win
    }

    function test_Score_CannotGoBelowZero() public {
        vm.startPrank(recorder);
        // Record many dispute losses
        for (uint256 i = 0; i < 10; i++) {
            reputation.recordDispute(provider, false);
        }
        vm.stopPrank();

        (uint256 score,) = reputation.getScore(provider);
        assertEq(score, 0);
    }

    function test_TenureBonus() public {
        vm.prank(recorder);
        reputation.recordCompletion(provider, client);

        // Warp 60 days
        vm.warp(block.timestamp + 60 days);

        (uint256 score,) = reputation.getScore(provider);
        // 500 base + 100 completion + 20 tenure (2 * 30-day periods * 10 points)
        assertEq(score, 620);
    }

    function test_TenureBonus_Capped() public {
        vm.prank(recorder);
        reputation.recordCompletion(provider, client);

        // Warp 3 years
        vm.warp(block.timestamp + 1095 days);

        (uint256 score,) = reputation.getScore(provider);
        // 500 base + 100 completion + 200 max tenure
        assertEq(score, 800);
    }

    function test_RevertNotRecorder() public {
        vm.prank(client);
        vm.expectRevert();
        reputation.recordCompletion(provider, client);
    }

    function test_ReputationTiers() public {
        vm.startPrank(recorder);

        // Reach Gold: need 5000+ score = 500 base + 45*100 completions = 5000
        for (uint256 i = 0; i < 45; i++) {
            reputation.recordCompletion(provider, client);
        }
        vm.stopPrank();

        (, IReputationSystem.ReputationTier tier) = reputation.getScore(provider);
        assertEq(uint256(tier), uint256(IReputationSystem.ReputationTier.Gold));
    }

    function test_GetReputationData() public {
        vm.startPrank(recorder);
        reputation.recordCompletion(provider, client);
        reputation.recordDispute(provider, false);
        reputation.recordDispute(provider, true);
        vm.stopPrank();

        IReputationSystem.ReputationData memory data = reputation.getReputationData(provider);
        assertEq(data.completions, 1);
        assertEq(data.disputesLost, 1);
        assertEq(data.disputesWon, 1);
        assertGt(data.firstActivityTimestamp, 0);
    }

    // --- Pause / Unpause Tests ---

    function test_Paused_RecordCompletionReverts() public {
        vm.prank(admin);
        reputation.pause();

        vm.prank(recorder);
        vm.expectRevert("Pausable: paused");
        reputation.recordCompletion(provider, client);
    }

    function test_Paused_RecordDisputeReverts() public {
        vm.prank(admin);
        reputation.pause();

        vm.prank(recorder);
        vm.expectRevert("Pausable: paused");
        reputation.recordDispute(provider, false);
    }

    function test_Unpause_ResumesOperations() public {
        vm.prank(admin);
        reputation.pause();

        vm.prank(admin);
        reputation.unpause();

        vm.prank(recorder);
        reputation.recordCompletion(provider, client);

        (uint256 score,) = reputation.getScore(provider);
        assertEq(score, 600);
    }

    // --- Event Emission Tests ---

    function test_EmitCompletionRecorded() public {
        vm.prank(recorder);
        vm.expectEmit(true, true, false, false);
        emit CompletionRecorded(provider, client);
        reputation.recordCompletion(provider, client);
    }

    function test_EmitScoreUpdated() public {
        vm.prank(recorder);
        vm.expectEmit(true, false, false, true);
        emit ScoreUpdated(provider, 600, IReputationSystem.ReputationTier.Bronze);
        reputation.recordCompletion(provider, client);
    }
}
