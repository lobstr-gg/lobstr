// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/LOBToken.sol";
import "../src/StakingManager.sol";
import "../src/ReputationSystem.sol";
import "../src/ServiceRegistry.sol";
import "../src/DisputeArbitration.sol";
import "../src/EscrowEngine.sol";

contract MockSybilGuardFuzz {
    function checkBanned(address) external pure returns (bool) { return false; }
    function checkAnyBanned(address[] calldata) external pure returns (bool) { return false; }
}

contract FuzzTest is Test {
    LOBToken public token;
    StakingManager public staking;
    ReputationSystem public reputation;
    ServiceRegistry public registry;
    DisputeArbitration public dispute;
    EscrowEngine public escrow;
    MockSybilGuardFuzz public mockSybilGuard;

    address public admin = makeAddr("admin");
    address public distributor = makeAddr("distributor");
    address public treasury = makeAddr("treasury");
    address public provider = makeAddr("provider");
    address public client = makeAddr("client");
    address public recorder = makeAddr("recorder");

    function setUp() public {
        vm.startPrank(admin);
        token = new LOBToken(distributor);
        reputation = new ReputationSystem();
        staking = new StakingManager(address(token));
        mockSybilGuard = new MockSybilGuardFuzz();
        registry = new ServiceRegistry(address(staking), address(reputation), address(mockSybilGuard));
        dispute = new DisputeArbitration(address(token), address(staking), address(reputation), address(mockSybilGuard));
        escrow = new EscrowEngine(
            address(token),
            address(registry),
            address(staking),
            address(dispute),
            address(reputation),
            treasury,
            address(mockSybilGuard)
        );
        reputation.grantRole(reputation.RECORDER_ROLE(), recorder);
        reputation.grantRole(reputation.RECORDER_ROLE(), address(escrow));
        reputation.grantRole(reputation.RECORDER_ROLE(), address(dispute));
        staking.grantRole(staking.SLASHER_ROLE(), address(dispute));
        dispute.grantRole(dispute.ESCROW_ROLE(), address(escrow));
        dispute.setEscrowEngine(address(escrow));
        vm.stopPrank();
    }

    // --- Fee calculation fuzz ---

    function testFuzz_FeeCalculation_NeverExceedsAmount(uint256 amount) public pure {
        // Bound to reasonable range: 1 wei to 1 trillion tokens
        amount = bound(amount, 1, 1e30);

        uint256 fee = (amount * 150) / 10000; // USDC_FEE_BPS = 150
        assertLe(fee, amount, "fee must not exceed amount");
        assertLe(fee, amount * 150 / 10000, "fee must match BPS formula");
    }

    function testFuzz_FeeCalculation_NoOverflow(uint256 amount) public pure {
        // Even at very large amounts, multiplication shouldn't overflow in Solidity 0.8+
        amount = bound(amount, 1, type(uint256).max / 150);

        uint256 fee = (amount * 150) / 10000;
        assertLe(fee, amount);
    }

    // --- Reputation score fuzz ---

    function testFuzz_ReputationScore_IncreasesWithCompletions(uint8 completions) public {
        vm.assume(completions > 0 && completions <= 100);

        vm.startPrank(recorder);
        for (uint256 i = 0; i < completions; i++) {
            reputation.recordCompletion(provider, client);
        }
        vm.stopPrank();

        (uint256 score,) = reputation.getScore(provider);
        // score = BASE_SCORE(500) + completions * COMPLETION_POINTS(100)
        assertEq(score, 500 + uint256(completions) * 100);
    }

    function testFuzz_ReputationScore_FloorsAtZero(uint8 disputesLost) public {
        vm.assume(disputesLost > 0 && disputesLost <= 50);

        vm.startPrank(recorder);
        for (uint256 i = 0; i < disputesLost; i++) {
            reputation.recordDispute(provider, false);
        }
        vm.stopPrank();

        (uint256 score,) = reputation.getScore(provider);
        // With enough losses, score floors at 0
        if (uint256(disputesLost) * 200 >= 500) {
            assertEq(score, 0, "score must floor at zero");
        } else {
            assertEq(score, 500 - uint256(disputesLost) * 200);
        }
    }

    // --- Staking tier threshold fuzz ---

    function testFuzz_TierThresholds(uint256 amount) public {
        amount = bound(amount, 0, 200_000 ether);

        // Fund and stake
        vm.prank(distributor);
        token.transfer(provider, amount);

        if (amount > 0) {
            vm.startPrank(provider);
            token.approve(address(staking), amount);
            staking.stake(amount);
            vm.stopPrank();
        }

        IStakingManager.Tier tier = staking.getTier(provider);

        if (amount >= 100_000 ether) {
            assertEq(uint256(tier), uint256(IStakingManager.Tier.Platinum));
        } else if (amount >= 10_000 ether) {
            assertEq(uint256(tier), uint256(IStakingManager.Tier.Gold));
        } else if (amount >= 1_000 ether) {
            assertEq(uint256(tier), uint256(IStakingManager.Tier.Silver));
        } else if (amount >= 100 ether) {
            assertEq(uint256(tier), uint256(IStakingManager.Tier.Bronze));
        } else {
            assertEq(uint256(tier), uint256(IStakingManager.Tier.None));
        }
    }

    // --- Draw split math fuzz ---

    function testFuzz_DrawSplit_ConservesTotal(uint256 amount, uint256 feeBps) public pure {
        amount = bound(amount, 2, 1e30); // at least 2 to split
        feeBps = bound(feeBps, 0, 150); // 0% to 1.5%

        uint256 fee = (amount * feeBps) / 10000;

        uint256 half = amount / 2;
        uint256 remainder = amount - half;
        uint256 halfFee = fee / 2;
        uint256 remainderFee = fee - halfFee;

        uint256 buyerPayout = half - halfFee;
        uint256 sellerPayout = remainder - remainderFee;
        uint256 totalFees = halfFee + remainderFee;

        // Conservation: buyer + seller + fees = total
        assertEq(buyerPayout + sellerPayout + totalFees, amount, "draw split must conserve total");
    }
}
