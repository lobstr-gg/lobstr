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
        // Need 3+ unique counterparties for Silver tier
        vm.startPrank(recorder);
        for (uint256 i = 0; i < 5; i++) {
            reputation.recordCompletion(provider, address(uint160(0x1000 + i)));
        }
        vm.stopPrank();

        // V-006: Must wait SILVER_MIN_TENURE (7 days) for tier promotion
        vm.warp(block.timestamp + 7 days);

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
        // Need 10+ unique counterparties for Gold tier
        for (uint256 i = 0; i < 45; i++) {
            reputation.recordCompletion(provider, address(uint160(0x1000 + i)));
        }
        vm.stopPrank();

        // V-006: Must wait GOLD_MIN_TENURE (30 days) for Gold tier
        vm.warp(block.timestamp + 30 days);

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

    // --- Anti-Farming Tests ---

    function test_PairCompletionCap() public {
        vm.startPrank(recorder);
        // Record 5 completions with the same client — only 3 should count
        for (uint256 i = 0; i < 5; i++) {
            reputation.recordCompletion(provider, client);
        }
        vm.stopPrank();

        (uint256 score,) = reputation.getScore(provider);
        // Only MAX_PAIR_COMPLETIONS (3) count: 500 + 3*100 = 800
        assertEq(score, 800);

        IReputationSystem.ReputationData memory data = reputation.getReputationData(provider);
        assertEq(data.completions, 3);
        assertEq(data.uniqueCounterparties, 1);
    }

    function test_UniqueCounterpartyTracking() public {
        vm.startPrank(recorder);
        reputation.recordCompletion(provider, address(0xA));
        reputation.recordCompletion(provider, address(0xB));
        reputation.recordCompletion(provider, address(0xC));
        vm.stopPrank();

        IReputationSystem.ReputationData memory data = reputation.getReputationData(provider);
        assertEq(data.uniqueCounterparties, 3);
        assertEq(data.completions, 3);
    }

    function test_TierRequiresMinCounterparties() public {
        vm.startPrank(recorder);
        // Score enough for Silver (1000) but only 1 unique counterparty
        for (uint256 i = 0; i < 3; i++) {
            reputation.recordCompletion(provider, client);
        }
        // 500 + 3*100 = 800 — not Silver anyway. Add 2 more with same client (won't count)
        // Use different clients to get score up
        reputation.recordCompletion(provider, address(0xA));
        reputation.recordCompletion(provider, address(0xB));
        // Score = 500 + 5*100 = 1000, but only 3 unique counterparties
        vm.stopPrank();

        // V-006: Must wait SILVER_MIN_TENURE (7 days)
        vm.warp(block.timestamp + 7 days);

        (uint256 score, IReputationSystem.ReputationTier tier) = reputation.getScore(provider);
        assertEq(score, 1000);
        // 3 unique counterparties == SILVER_MIN_COUNTERPARTIES → Silver
        assertEq(uint256(tier), uint256(IReputationSystem.ReputationTier.Silver));
    }

    function test_HighScoreLowDiversity_StaysBronze() public {
        vm.startPrank(recorder);
        // With pair cap of 3, max score from 1 counterparty = 500 + 3*100 = 800
        // Need unique counterparties to break into Silver
        // 2 unique counterparties with 3 completions each = 6 completions, 500 + 600 = 1100
        // But SILVER_MIN_COUNTERPARTIES = 3, so with only 2 unique → Bronze
        for (uint256 i = 0; i < 3; i++) {
            reputation.recordCompletion(provider, address(0xA));
        }
        for (uint256 i = 0; i < 3; i++) {
            reputation.recordCompletion(provider, address(0xB));
        }
        vm.stopPrank();

        (uint256 score, IReputationSystem.ReputationTier tier) = reputation.getScore(provider);
        assertEq(score, 1100); // 500 + 6*100
        // Only 2 unique counterparties, need 3 for Silver
        assertEq(uint256(tier), uint256(IReputationSystem.ReputationTier.Bronze));
    }

    function test_GetPairCompletions() public {
        vm.startPrank(recorder);
        reputation.recordCompletion(provider, client);
        reputation.recordCompletion(provider, client);
        vm.stopPrank();

        assertEq(reputation.getPairCompletions(provider, client), 2);
        assertEq(reputation.getPairCompletions(provider, address(0xDEAD)), 0);
    }

    // ═══════════════════════════════════════════════════════════════
    //  V-006: TENURE GATING
    // ═══════════════════════════════════════════════════════════════

    function test_silverBlockedBeforeTenure() public {
        vm.startPrank(recorder);
        for (uint256 i = 0; i < 5; i++) {
            reputation.recordCompletion(provider, address(uint160(0x1000 + i)));
        }
        vm.stopPrank();

        // Score = 1000, counterparties = 5, but tenure = 0 — should stay Bronze
        (uint256 score, IReputationSystem.ReputationTier tier) = reputation.getScore(provider);
        assertEq(score, 1000);
        assertEq(uint256(tier), uint256(IReputationSystem.ReputationTier.Bronze));

        // Warp 6 days — still under SILVER_MIN_TENURE (7 days)
        vm.warp(block.timestamp + 6 days);
        (, tier) = reputation.getScore(provider);
        assertEq(uint256(tier), uint256(IReputationSystem.ReputationTier.Bronze));

        // Warp 1 more day → 7 days total → Silver
        vm.warp(block.timestamp + 1 days);
        (, tier) = reputation.getScore(provider);
        assertEq(uint256(tier), uint256(IReputationSystem.ReputationTier.Silver));
    }

    function test_goldBlockedBeforeTenure() public {
        vm.startPrank(recorder);
        for (uint256 i = 0; i < 45; i++) {
            reputation.recordCompletion(provider, address(uint160(0x1000 + i)));
        }
        vm.stopPrank();

        // Score = 5000, counterparties = 45, but tenure = 0 → Bronze
        (, IReputationSystem.ReputationTier tier) = reputation.getScore(provider);
        assertEq(uint256(tier), uint256(IReputationSystem.ReputationTier.Bronze));

        // At 7 days → Silver (meets Silver tenure, not Gold)
        vm.warp(block.timestamp + 7 days);
        (, tier) = reputation.getScore(provider);
        assertEq(uint256(tier), uint256(IReputationSystem.ReputationTier.Silver));

        // At 30 days → Gold
        vm.warp(block.timestamp + 23 days); // total 30 days
        (, tier) = reputation.getScore(provider);
        assertEq(uint256(tier), uint256(IReputationSystem.ReputationTier.Gold));
    }

    function test_platinumBlockedBeforeTenure() public {
        vm.startPrank(recorder);
        for (uint256 i = 0; i < 95; i++) {
            reputation.recordCompletion(provider, address(uint160(0x1000 + i)));
        }
        vm.stopPrank();

        // Score = 10000, counterparties = 95, tenure = 0 → Bronze
        (, IReputationSystem.ReputationTier tier) = reputation.getScore(provider);
        assertEq(uint256(tier), uint256(IReputationSystem.ReputationTier.Bronze));

        // At 30 days → Gold (meets Gold tenure, not Platinum)
        vm.warp(block.timestamp + 30 days);
        (, tier) = reputation.getScore(provider);
        assertEq(uint256(tier), uint256(IReputationSystem.ReputationTier.Gold));

        // At 90 days → Platinum
        vm.warp(block.timestamp + 60 days); // total 90 days
        (, tier) = reputation.getScore(provider);
        assertEq(uint256(tier), uint256(IReputationSystem.ReputationTier.Platinum));
    }
}
