// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/LOBToken.sol";
import "../src/StakingManager.sol";
import "../src/ReputationSystem.sol";
import "../src/ServiceRegistry.sol";
import "../src/DisputeArbitration.sol";
import "../src/EscrowEngine.sol";
import "../src/SkillRegistry.sol";
import "../src/PipelineRouter.sol";

contract MockSybilGuardPipe {
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

contract MockRewardDistributorPipe {
    function creditArbitratorReward(address, address, uint256) external {}
    function creditWatcherReward(address, address, uint256) external {}
    function creditJudgeReward(address, address, uint256) external {}
    function deposit(address, uint256) external {}
    function availableBudget(address) external pure returns (uint256) { return type(uint256).max; }
}

contract PipelineRouterTest is Test {
    LOBToken public token;
    StakingManager public staking;
    ReputationSystem public reputation;
    ServiceRegistry public registry;
    DisputeArbitration public dispute;
    EscrowEngine public escrow;
    SkillRegistry public skillRegistry;
    PipelineRouter public pipelineRouter;
    MockSybilGuardPipe public mockSybilGuard;
    MockRewardDistributorPipe public mockRewardDist;

    address public admin = makeAddr("admin");
    address public distributor = makeAddr("distributor");
    address public treasury = makeAddr("treasury");
    address public buyer = makeAddr("buyer");
    address public seller = makeAddr("seller");
    address public other = makeAddr("other");

    uint256 public skill1Id;
    uint256 public skill2Id;

    function setUp() public {
        vm.startPrank(admin);
        token = new LOBToken();
        token.initialize(distributor);
        reputation = new ReputationSystem();
        reputation.initialize();
        staking = new StakingManager();
        staking.initialize(address(token));
        mockSybilGuard = new MockSybilGuardPipe();
        mockRewardDist = new MockRewardDistributorPipe();
        registry = new ServiceRegistry();
        registry.initialize(address(staking), address(reputation), address(mockSybilGuard));
        dispute = new DisputeArbitration();
        dispute.initialize(address(token), address(staking), address(reputation), address(mockSybilGuard), address(mockRewardDist));
        escrow = new EscrowEngine();
        escrow.initialize(
            address(token),
            address(registry),
            address(staking),
            address(dispute),
            address(reputation),
            treasury,
            address(mockSybilGuard)
        );
        skillRegistry = new SkillRegistry();
        skillRegistry.initialize(
            address(token),
            address(staking),
            address(reputation),
            address(mockSybilGuard),
            address(escrow),
            treasury
        );
        pipelineRouter = new PipelineRouter();
        pipelineRouter.initialize(
            address(skillRegistry),
            address(staking),
            address(reputation),
            address(mockSybilGuard),
            address(this)
        );
        vm.stopPrank();

        // OZ 5.x: DEFAULT_ADMIN_ROLE granted to _owner (address(this)), grant to admin for tests
        pipelineRouter.grantRole(pipelineRouter.DEFAULT_ADMIN_ROLE(), admin);

        vm.startPrank(admin);
        // Grant roles
        reputation.grantRole(reputation.RECORDER_ROLE(), address(escrow));
        reputation.grantRole(reputation.RECORDER_ROLE(), address(dispute));
        reputation.grantRole(reputation.RECORDER_ROLE(), address(skillRegistry));
        reputation.grantRole(reputation.RECORDER_ROLE(), admin);
        staking.grantRole(staking.SLASHER_ROLE(), address(dispute));
        dispute.grantRole(dispute.ESCROW_ROLE(), address(escrow));
        dispute.setEscrowEngine(address(escrow));
        escrow.grantRole(escrow.SKILL_REGISTRY_ROLE(), address(skillRegistry));
        vm.stopPrank();

        // Fund participants
        vm.startPrank(distributor);
        token.transfer(buyer, 500_000 ether);
        token.transfer(seller, 500_000 ether);
        token.transfer(other, 500_000 ether);
        vm.stopPrank();

        // Seller stakes Gold (10k) and builds Gold rep (25 completions → 500 + 2500 = 3000)
        vm.startPrank(seller);
        token.approve(address(staking), 10_000 ether);
        staking.stake(10_000 ether);
        vm.stopPrank();

        vm.startPrank(admin);
        for (uint256 i = 0; i < 25; i++) {
            reputation.recordCompletion(seller, address(uint160(0x5000 + i)));
        }
        vm.stopPrank();

        // Buyer stakes Gold and builds Gold rep (need score >= 5000 → 45 completions: 500 + 4500 = 5000)
        vm.startPrank(buyer);
        token.approve(address(staking), 10_000 ether);
        staking.stake(10_000 ether);
        vm.stopPrank();

        vm.startPrank(admin);
        for (uint256 i = 0; i < 45; i++) {
            reputation.recordCompletion(buyer, address(uint160(0x6000 + i)));
        }
        vm.stopPrank();

        vm.warp(block.timestamp + 30 days); // V-006: GOLD_MIN_TENURE for both seller and buyer

        // Create 2 per-call skills and purchase access for buyer
        _createAndPurchaseSkills();
    }

    function _createAndPurchaseSkills() internal {
        ISkillRegistry.ListSkillParams memory params = ISkillRegistry.ListSkillParams({
            assetType: ISkillRegistry.AssetType.SKILL,
            deliveryMethod: ISkillRegistry.DeliveryMethod.HOSTED_API,
            pricingModel: ISkillRegistry.PricingModel.PER_CALL,
            price: 1 ether,
            settlementToken: address(token),
            apiEndpointHash: keccak256("api1"),
            packageHash: bytes32(0)
        });

        uint256[] memory noDeps = new uint256[](0);

        vm.prank(seller);
        skill1Id = skillRegistry.listSkill(params, "Skill 1", "First skill", "ipfs://1", noDeps);

        params.apiEndpointHash = keccak256("api2");
        vm.prank(seller);
        skill2Id = skillRegistry.listSkill(params, "Skill 2", "Second skill", "ipfs://2", noDeps);

        // Buyer purchases access to both
        vm.startPrank(buyer);
        skillRegistry.purchaseSkill(skill1Id);
        skillRegistry.purchaseSkill(skill2Id);
        vm.stopPrank();
    }

    function _emptyConfigs(uint256 count) internal pure returns (bytes[] memory) {
        bytes[] memory configs = new bytes[](count);
        for (uint256 i = 0; i < count; i++) {
            configs[i] = "";
        }
        return configs;
    }

    // ═══════════════════════════════════════════════════════════════
    //  CREATE PIPELINE
    // ═══════════════════════════════════════════════════════════════

    function test_CreatePipeline_HappyPath() public {
        uint256[] memory steps = new uint256[](2);
        steps[0] = skill1Id;
        steps[1] = skill2Id;

        vm.prank(buyer);
        uint256 pipelineId = pipelineRouter.createPipeline("My Pipeline", steps, _emptyConfigs(2), false);

        assertEq(pipelineId, 1);

        IPipelineRouter.Pipeline memory pipeline = pipelineRouter.getPipeline(pipelineId);
        assertEq(pipeline.owner, buyer);
        assertEq(pipeline.name, "My Pipeline");
        assertFalse(pipeline.isPublic);
        assertTrue(pipeline.active);

        uint256[] memory returnedSteps = pipelineRouter.getPipelineSteps(pipelineId);
        assertEq(returnedSteps.length, 2);
        assertEq(returnedSteps[0], skill1Id);
        assertEq(returnedSteps[1], skill2Id);
    }

    function test_CreatePipeline_RevertNoAccess() public {
        uint256[] memory steps = new uint256[](1);
        steps[0] = skill1Id;

        vm.prank(other);
        vm.expectRevert("PipelineRouter: no access to skill");
        pipelineRouter.createPipeline("Bad Pipeline", steps, _emptyConfigs(1), false);
    }

    function test_CreatePipeline_RevertEmptyName() public {
        uint256[] memory steps = new uint256[](1);
        steps[0] = skill1Id;

        vm.prank(buyer);
        vm.expectRevert("PipelineRouter: empty name");
        pipelineRouter.createPipeline("", steps, _emptyConfigs(1), false);
    }

    function test_CreatePipeline_PublicRequiresGold() public {
        uint256[] memory steps = new uint256[](1);
        steps[0] = skill1Id;

        // buyer has Gold marketplace tier
        vm.prank(buyer);
        uint256 pipelineId = pipelineRouter.createPipeline("Public Pipeline", steps, _emptyConfigs(1), true);

        IPipelineRouter.Pipeline memory pipeline = pipelineRouter.getPipeline(pipelineId);
        assertTrue(pipeline.isPublic);
    }

    // ═══════════════════════════════════════════════════════════════
    //  EXECUTE PIPELINE
    // ═══════════════════════════════════════════════════════════════

    function test_ExecutePipeline_OwnerAlwaysAllowed() public {
        uint256[] memory steps = new uint256[](1);
        steps[0] = skill1Id;

        vm.prank(buyer);
        uint256 pipelineId = pipelineRouter.createPipeline("Pipeline", steps, _emptyConfigs(1), false);

        vm.prank(buyer);
        pipelineRouter.executePipeline(pipelineId);

        IPipelineRouter.Pipeline memory pipeline = pipelineRouter.getPipeline(pipelineId);
        assertEq(pipeline.executionCount, 1);
    }

    function test_ExecutePipeline_NonOwnerNeedsPublicAndAccess() public {
        uint256[] memory steps = new uint256[](1);
        steps[0] = skill1Id;

        vm.prank(buyer);
        uint256 pipelineId = pipelineRouter.createPipeline("Pipeline", steps, _emptyConfigs(1), false);

        // Other user can't execute private pipeline
        vm.prank(other);
        vm.expectRevert("PipelineRouter: not public");
        pipelineRouter.executePipeline(pipelineId);
    }

    function test_ExecutePipeline_RevertInactive() public {
        uint256[] memory steps = new uint256[](1);
        steps[0] = skill1Id;

        vm.prank(buyer);
        uint256 pipelineId = pipelineRouter.createPipeline("Pipeline", steps, _emptyConfigs(1), false);

        vm.prank(buyer);
        pipelineRouter.deactivatePipeline(pipelineId);

        vm.prank(buyer);
        vm.expectRevert("PipelineRouter: inactive");
        pipelineRouter.executePipeline(pipelineId);
    }

    // ═══════════════════════════════════════════════════════════════
    //  UPDATE PIPELINE
    // ═══════════════════════════════════════════════════════════════

    function test_UpdatePipeline_HappyPath() public {
        uint256[] memory steps = new uint256[](1);
        steps[0] = skill1Id;

        vm.prank(buyer);
        uint256 pipelineId = pipelineRouter.createPipeline("Pipeline", steps, _emptyConfigs(1), false);

        // Update with new steps
        uint256[] memory newSteps = new uint256[](2);
        newSteps[0] = skill1Id;
        newSteps[1] = skill2Id;

        vm.prank(buyer);
        pipelineRouter.updatePipeline(pipelineId, "Updated Pipeline", newSteps, _emptyConfigs(2), false);

        IPipelineRouter.Pipeline memory pipeline = pipelineRouter.getPipeline(pipelineId);
        assertEq(pipeline.name, "Updated Pipeline");

        uint256[] memory returnedSteps = pipelineRouter.getPipelineSteps(pipelineId);
        assertEq(returnedSteps.length, 2);
    }

    function test_UpdatePipeline_RevertNotOwner() public {
        uint256[] memory steps = new uint256[](1);
        steps[0] = skill1Id;

        vm.prank(buyer);
        uint256 pipelineId = pipelineRouter.createPipeline("Pipeline", steps, _emptyConfigs(1), false);

        vm.prank(other);
        vm.expectRevert("PipelineRouter: not owner");
        pipelineRouter.updatePipeline(pipelineId, "Updated", steps, _emptyConfigs(1), false);
    }

    // ═══════════════════════════════════════════════════════════════
    //  DEACTIVATE PIPELINE
    // ═══════════════════════════════════════════════════════════════

    function test_DeactivatePipeline_HappyPath() public {
        uint256[] memory steps = new uint256[](1);
        steps[0] = skill1Id;

        vm.prank(buyer);
        uint256 pipelineId = pipelineRouter.createPipeline("Pipeline", steps, _emptyConfigs(1), false);

        vm.prank(buyer);
        pipelineRouter.deactivatePipeline(pipelineId);

        IPipelineRouter.Pipeline memory pipeline = pipelineRouter.getPipeline(pipelineId);
        assertFalse(pipeline.active);
    }

    function test_DeactivatePipeline_RevertNotOwner() public {
        uint256[] memory steps = new uint256[](1);
        steps[0] = skill1Id;

        vm.prank(buyer);
        uint256 pipelineId = pipelineRouter.createPipeline("Pipeline", steps, _emptyConfigs(1), false);

        vm.prank(other);
        vm.expectRevert("PipelineRouter: not owner");
        pipelineRouter.deactivatePipeline(pipelineId);
    }

    // ═══════════════════════════════════════════════════════════════
    //  PAUSE TESTS
    // ═══════════════════════════════════════════════════════════════

    function test_Paused_CreatePipelineReverts() public {
        vm.prank(admin);
        pipelineRouter.pause();

        uint256[] memory steps = new uint256[](1);
        steps[0] = skill1Id;

        vm.prank(buyer);
        vm.expectRevert("EnforcedPause()");
        pipelineRouter.createPipeline("Pipeline", steps, _emptyConfigs(1), false);
    }

    function test_Paused_ExecutePipelineReverts() public {
        uint256[] memory steps = new uint256[](1);
        steps[0] = skill1Id;

        vm.prank(buyer);
        uint256 pipelineId = pipelineRouter.createPipeline("Pipeline", steps, _emptyConfigs(1), false);

        vm.prank(admin);
        pipelineRouter.pause();

        vm.prank(buyer);
        vm.expectRevert("EnforcedPause()");
        pipelineRouter.executePipeline(pipelineId);
    }
}
