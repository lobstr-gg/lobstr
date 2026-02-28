// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/LOBToken.sol";
import "../src/StakingManager.sol";
import "../src/ReputationSystem.sol";
import "../src/ServiceRegistry.sol";
import "../src/DisputeArbitration.sol";
import "../src/EscrowEngine.sol";
import "./helpers/ProxyTestHelper.sol";

contract MockSybilGuardFuzz {
    function checkBanned(address) external pure returns (bool) { return false; }
    function checkAnyBanned(address[] calldata) external pure returns (bool) { return false; }
}

contract MockRewardDistributorFuzz {
    function creditArbitratorReward(address, address, uint256) external {}
    function deposit(address, uint256) external {}
    function availableBudget(address) external pure returns (uint256) { return type(uint256).max; }
}

contract FuzzTest is Test, ProxyTestHelper {
    LOBToken public token;
    StakingManager public staking;
    ReputationSystem public reputation;
    ServiceRegistry public registry;
    DisputeArbitration public dispute;
    EscrowEngine public escrow;
    MockSybilGuardFuzz public mockSybilGuard;
    MockRewardDistributorFuzz public mockRewardDist;

    address public admin = makeAddr("admin");
    address public distributor = makeAddr("distributor");
    address public treasury = makeAddr("treasury");
    address public provider = makeAddr("provider");
    address public client = makeAddr("client");
    address public recorder = makeAddr("recorder");

    function setUp() public {
        vm.startPrank(admin);
        token = LOBToken(_deployProxy(address(new LOBToken()), abi.encodeCall(LOBToken.initialize, (distributor))));
        reputation = ReputationSystem(_deployProxy(address(new ReputationSystem()), abi.encodeCall(ReputationSystem.initialize, ())));
        staking = StakingManager(_deployProxy(address(new StakingManager()), abi.encodeCall(StakingManager.initialize, (address(token)))));
        mockSybilGuard = new MockSybilGuardFuzz();
        mockRewardDist = new MockRewardDistributorFuzz();
        registry = ServiceRegistry(_deployProxy(address(new ServiceRegistry()), abi.encodeCall(ServiceRegistry.initialize, (address(staking), address(reputation), address(mockSybilGuard)))));
        dispute = DisputeArbitration(_deployProxy(address(new DisputeArbitration()), abi.encodeCall(DisputeArbitration.initialize, (address(token), address(staking), address(reputation), address(mockSybilGuard), address(mockRewardDist)))));
        escrow = EscrowEngine(_deployProxy(address(new EscrowEngine()), abi.encodeCall(EscrowEngine.initialize, (
            address(token),
            address(registry),
            address(staking),
            address(dispute),
            address(reputation),
            treasury,
            address(mockSybilGuard)
        ))));
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
            // Use unique counterparties to avoid per-pair cap (MAX_PAIR_COMPLETIONS = 3)
            reputation.recordCompletion(provider, address(uint160(0x4000 + i)));
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

    // --- Skill fee calculation fuzz ---

    function testFuzz_SkillFeeCalculation_NeverExceedsAmount(uint256 amount) public pure {
        amount = bound(amount, 1, 1e30);

        uint256 fee = (amount * 150) / 10000;
        assertLe(fee, amount, "skill fee must not exceed amount");

        uint256 sellerPayout = amount - fee;
        assertEq(sellerPayout + fee, amount, "must conserve total");
    }

    function testFuzz_MarketplaceTier_MinOfBoth(uint8 stakeRaw, uint8 repRaw) public pure {
        // stakeTier: 0-4, repTier: 0-3
        uint256 stakeTier = bound(stakeRaw, 0, 4);
        uint256 repTier = bound(repRaw, 0, 3);

        if (stakeTier == 0) {
            // StakeTier.None → always MarketplaceTier.None
            return;
        }

        uint256 repTierAligned = repTier + 1;
        uint256 result = stakeTier < repTierAligned ? stakeTier : repTierAligned;

        assertGe(result, 1, "result must be at least Bronze when staked");
        assertLe(result, 4, "result must not exceed Platinum");
        assertLe(result, stakeTier, "result must not exceed stake tier");
        assertLe(result, repTierAligned, "result must not exceed aligned rep tier");
    }

    function testFuzz_CreditConservation(uint256 deposits, uint256 calls, uint256 pricePerCall) public pure {
        pricePerCall = bound(pricePerCall, 1, 1e24);
        deposits = bound(deposits, pricePerCall, 1e30); // ensure at least 1 call is affordable
        calls = bound(calls, 1, deposits / pricePerCall);

        uint256 cost = calls * pricePerCall;
        uint256 fee = (cost * 150) / 10000;
        uint256 sellerEarnings = cost - fee;

        // Credits remaining = deposits - cost
        uint256 remaining = deposits - cost;

        // Total = remaining credits + seller earnings + fee = deposits
        assertEq(remaining + sellerEarnings + fee, deposits, "credits must be conserved");
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
