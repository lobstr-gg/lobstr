// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "../src/LOBToken.sol";
import "../src/AirdropClaimV3.sol";
import "../src/ReputationSystem.sol";
import "../src/StakingManager.sol";
import "../src/ServiceRegistry.sol";

// Mock verifier that always returns true (for testing without real ZK proofs)
contract MockGroth16VerifierV4 {
    bool public shouldVerify = true;

    function setVerify(bool _shouldVerify) external {
        shouldVerify = _shouldVerify;
    }

    function verifyProof(
        uint[2] calldata,
        uint[2][2] calldata,
        uint[2] calldata,
        uint[2] calldata
    ) external view returns (bool) {
        return shouldVerify;
    }
}

// Mock SybilGuard for ServiceRegistry
contract MockSybilGuardAirdrop {
    function checkBanned(address) external pure returns (bool) { return false; }
    function checkAnyBanned(address[] calldata) external pure returns (bool) { return false; }
}

// Mock DisputeArbitration for milestone check
contract MockDisputeArbitrationAirdrop {
    mapping(address => uint256) private _disputesHandled;

    function setDisputesHandled(address arb, uint256 count) external {
        _disputesHandled[arb] = count;
    }

    function getArbitratorInfo(address arb)
        external
        view
        returns (IDisputeArbitration.ArbitratorInfo memory)
    {
        return IDisputeArbitration.ArbitratorInfo({
            stake: 0,
            rank: IDisputeArbitration.ArbitratorRank.None,
            disputesHandled: _disputesHandled[arb],
            majorityVotes: 0,
            active: false
        });
    }

    function removeArbitrator(address) external {}
}

contract AirdropClaimV3Test is Test {
    using ECDSA for bytes32;

    LOBToken public token;
    AirdropClaimV3 public airdrop;
    MockGroth16VerifierV4 public verifier;
    ReputationSystem public reputation;
    StakingManager public staking;
    ServiceRegistry public registry;
    MockSybilGuardAirdrop public mockSybilGuard;
    MockDisputeArbitrationAirdrop public mockDispute;

    address public deployer = address(this);
    address public alice = address(0xA11CE);
    address public bob = address(0xB0B);
    address public treasury = address(0x7BEA);

    uint256 public constant CLAIM_WINDOW = 365 days;
    // Max difficulty — every nonce passes PoW, so _findPoWNonce always returns 0.
    // PoW rejection is tested separately with a strict-difficulty contract.
    uint256 public constant TEST_DIFFICULTY = type(uint256).max;

    uint256 public approvalSignerKey = 0xDEAD5678;
    address public approvalSignerAddr;

    uint256 public constant TEST_MERKLE_ROOT = 12345678;

    function setUp() public {
        approvalSignerAddr = vm.addr(approvalSignerKey);

        token = new LOBToken(deployer);
        verifier = new MockGroth16VerifierV4();
        reputation = new ReputationSystem();
        staking = new StakingManager(address(token));
        mockSybilGuard = new MockSybilGuardAirdrop();
        mockDispute = new MockDisputeArbitrationAirdrop();
        registry = new ServiceRegistry(
            address(staking),
            address(reputation),
            address(mockSybilGuard)
        );

        airdrop = new AirdropClaimV3(
            address(token),
            address(verifier),
            approvalSignerAddr,
            block.timestamp + CLAIM_WINDOW,
            TEST_DIFFICULTY,
            400_000_000 ether,
            address(reputation),
            address(registry),
            address(staking),
            address(mockDispute)
        );

        // Grant ROOT_UPDATER_ROLE and set root
        airdrop.grantRole(airdrop.ROOT_UPDATER_ROLE(), deployer);
        airdrop.updateMerkleRoot(TEST_MERKLE_ROOT);

        // Fund the airdrop contract
        token.transfer(address(airdrop), 400_000_000 ether);

        // Give alice and bob some LOB for staking tests
        token.transfer(alice, 10_000 ether);
        token.transfer(bob, 10_000 ether);

        // Grant RECORDER_ROLE to deployer for milestone testing
        reputation.grantRole(reputation.RECORDER_ROLE(), deployer);
    }

    // --- Helpers ---

    function _signApproval(address user, uint256 merkleRoot) internal view returns (bytes memory) {
        bytes32 msgHash = keccak256(
            abi.encodePacked(user, merkleRoot, block.chainid, address(airdrop), "LOBSTR_AIRDROP_V3_ZK")
        );
        bytes32 ethHash = msgHash.toEthSignedMessageHash();
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(approvalSignerKey, ethHash);
        return abi.encodePacked(r, s, v);
    }

    function _doClaim(address user) internal {
        bytes memory approvalSig = _signApproval(user, TEST_MERKLE_ROOT);

        uint256[2] memory pA = [uint256(0), uint256(0)];
        uint256[2][2] memory pB = [[uint256(0), uint256(0)], [uint256(0), uint256(0)]];
        uint256[2] memory pC = [uint256(0), uint256(0)];
        uint256[2] memory pubSignals = [TEST_MERKLE_ROOT, uint256(uint160(user))];

        vm.prank(user);
        airdrop.claim(pA, pB, pC, pubSignals, approvalSig, 0); // nonce=0 always passes with max difficulty
    }

    // --- Claim Tests ---

    function test_ClaimSuccess() public {
        uint256 balBefore = token.balanceOf(alice);
        _doClaim(alice);

        assertEq(token.balanceOf(alice) - balBefore, 1_000 ether);

        IAirdropClaimV3.ClaimInfo memory info = airdrop.getClaimInfo(alice);
        assertTrue(info.claimed);
        assertEq(info.released, 1_000 ether);
        assertEq(info.milestonesCompleted, 0);
    }

    function test_ClaimRejectsDoubleClaim() public {
        _doClaim(alice);

        // Prepare params before vm.expectRevert to avoid depth issues
        bytes memory approvalSig = _signApproval(alice, TEST_MERKLE_ROOT);
        uint256[2] memory pA = [uint256(0), uint256(0)];
        uint256[2][2] memory pB = [[uint256(0), uint256(0)], [uint256(0), uint256(0)]];
        uint256[2] memory pC = [uint256(0), uint256(0)];
        uint256[2] memory pubSignals = [TEST_MERKLE_ROOT, uint256(uint160(alice))];

        vm.prank(alice);
        vm.expectRevert("V3: already claimed");
        airdrop.claim(pA, pB, pC, pubSignals, approvalSig, 0);
    }

    function test_ClaimRejectsInvalidRoot() public {
        uint256[2] memory pA = [uint256(0), uint256(0)];
        uint256[2][2] memory pB = [[uint256(0), uint256(0)], [uint256(0), uint256(0)]];
        uint256[2] memory pC = [uint256(0), uint256(0)];
        uint256[2] memory pubSignals = [uint256(999999), uint256(uint160(alice))];
        bytes memory approvalSig = _signApproval(alice, 999999);

        vm.prank(alice);
        vm.expectRevert("V3: invalid root");
        airdrop.claim(pA, pB, pC, pubSignals, approvalSig, 0);
    }

    function test_ClaimRejectsAddressMismatch() public {
        bytes memory approvalSig = _signApproval(alice, TEST_MERKLE_ROOT);

        uint256[2] memory pA = [uint256(0), uint256(0)];
        uint256[2][2] memory pB = [[uint256(0), uint256(0)], [uint256(0), uint256(0)]];
        uint256[2] memory pC = [uint256(0), uint256(0)];
        uint256[2] memory pubSignals = [TEST_MERKLE_ROOT, uint256(uint160(bob))]; // bob's address, not alice's

        vm.prank(alice);
        vm.expectRevert("V3: address mismatch");
        airdrop.claim(pA, pB, pC, pubSignals, approvalSig, 0);
    }

    function test_ClaimRejectsInvalidProof() public {
        verifier.setVerify(false);

        bytes memory approvalSig = _signApproval(alice, TEST_MERKLE_ROOT);

        uint256[2] memory pA = [uint256(0), uint256(0)];
        uint256[2][2] memory pB = [[uint256(0), uint256(0)], [uint256(0), uint256(0)]];
        uint256[2] memory pC = [uint256(0), uint256(0)];
        uint256[2] memory pubSignals = [TEST_MERKLE_ROOT, uint256(uint160(alice))];

        vm.prank(alice);
        vm.expectRevert("V3: invalid proof");
        airdrop.claim(pA, pB, pC, pubSignals, approvalSig, 0);
    }

    function test_ClaimRejectsAfterWindowCloses() public {
        vm.warp(block.timestamp + CLAIM_WINDOW + 1);

        bytes memory approvalSig = _signApproval(alice, TEST_MERKLE_ROOT);
        uint256[2] memory pA = [uint256(0), uint256(0)];
        uint256[2][2] memory pB = [[uint256(0), uint256(0)], [uint256(0), uint256(0)]];
        uint256[2] memory pC = [uint256(0), uint256(0)];
        uint256[2] memory pubSignals = [TEST_MERKLE_ROOT, uint256(uint160(alice))];

        vm.prank(alice);
        vm.expectRevert("V3: window closed");
        airdrop.claim(pA, pB, pC, pubSignals, approvalSig, 0);
    }

    function test_ClaimRejectsInvalidPoW() public {
        // Deploy a separate airdrop with very strict PoW (difficulty=1 means hash < 1 = impossible)
        AirdropClaimV3 strictAirdrop = new AirdropClaimV3(
            address(token),
            address(verifier),
            approvalSignerAddr,
            block.timestamp + CLAIM_WINDOW,
            1, // strict difficulty: hash must be < 1, which is impossible
            400_000_000 ether,
            address(reputation),
            address(registry),
            address(staking),
            address(mockDispute)
        );
        strictAirdrop.grantRole(strictAirdrop.ROOT_UPDATER_ROLE(), deployer);
        strictAirdrop.updateMerkleRoot(TEST_MERKLE_ROOT);
        // No need to fund — revert happens before transfer

        // Sign approval against strictAirdrop's address (domain-separated)
        bytes32 msgHash = keccak256(
            abi.encodePacked(alice, TEST_MERKLE_ROOT, block.chainid, address(strictAirdrop), "LOBSTR_AIRDROP_V3_ZK")
        );
        bytes32 ethHash = msgHash.toEthSignedMessageHash();
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(approvalSignerKey, ethHash);
        bytes memory approvalSig = abi.encodePacked(r, s, v);
        uint256[2] memory pA = [uint256(0), uint256(0)];
        uint256[2][2] memory pB = [[uint256(0), uint256(0)], [uint256(0), uint256(0)]];
        uint256[2] memory pC = [uint256(0), uint256(0)];
        uint256[2] memory pubSignals = [TEST_MERKLE_ROOT, uint256(uint160(alice))];

        vm.prank(alice);
        vm.expectRevert("V3: insufficient PoW");
        strictAirdrop.claim(pA, pB, pC, pubSignals, approvalSig, 0);
    }

    // --- Milestone Tests ---

    function test_CompleteMilestone_JobComplete() public {
        _doClaim(alice);

        // Record a completion for alice
        reputation.recordCompletion(alice, bob);

        uint256 balBefore = token.balanceOf(alice);
        airdrop.completeMilestone(alice, IAirdropClaimV3.Milestone.JobComplete);

        assertEq(token.balanceOf(alice) - balBefore, 1_000 ether);
        assertTrue(airdrop.isMilestoneComplete(alice, IAirdropClaimV3.Milestone.JobComplete));
    }

    function test_CompleteMilestone_StakeActive() public {
        _doClaim(alice);

        // Alice stakes 100 LOB
        vm.startPrank(alice);
        token.approve(address(staking), 100 ether);
        staking.stake(100 ether);
        vm.stopPrank();

        uint256 balBefore = token.balanceOf(alice);
        airdrop.completeMilestone(alice, IAirdropClaimV3.Milestone.StakeActive);

        assertEq(token.balanceOf(alice) - balBefore, 1_000 ether);
        assertTrue(airdrop.isMilestoneComplete(alice, IAirdropClaimV3.Milestone.StakeActive));
    }

    function test_CompleteMilestone_ServiceListed() public {
        _doClaim(alice);

        // Alice needs minimum stake for listing
        vm.startPrank(alice);
        token.approve(address(staking), 100 ether);
        staking.stake(100 ether);
        registry.createListing(
            IServiceRegistry.ServiceCategory.CODING,
            "Test Service",
            "Description",
            100 ether,
            address(token),
            3600,
            ""
        );
        vm.stopPrank();

        uint256 balBefore = token.balanceOf(alice);
        airdrop.completeMilestone(alice, IAirdropClaimV3.Milestone.ServiceListed);

        assertEq(token.balanceOf(alice) - balBefore, 1_000 ether);
    }

    function test_CompleteMilestone_GovernanceVote() public {
        _doClaim(alice);

        // Mock that alice has handled 1 dispute
        mockDispute.setDisputesHandled(alice, 1);

        uint256 balBefore = token.balanceOf(alice);
        airdrop.completeMilestone(alice, IAirdropClaimV3.Milestone.GovernanceVote);

        assertEq(token.balanceOf(alice) - balBefore, 1_000 ether);
    }

    function test_MilestoneRejectsIfNotClaimed() public {
        vm.expectRevert("V3: not claimed");
        airdrop.completeMilestone(alice, IAirdropClaimV3.Milestone.JobComplete);
    }

    function test_MilestoneRejectsIfAlreadyCompleted() public {
        _doClaim(alice);
        reputation.recordCompletion(alice, bob);
        airdrop.completeMilestone(alice, IAirdropClaimV3.Milestone.JobComplete);

        vm.expectRevert("V3: milestone already completed");
        airdrop.completeMilestone(alice, IAirdropClaimV3.Milestone.JobComplete);
    }

    function test_MilestoneRejectsIfNotMet() public {
        _doClaim(alice);

        vm.expectRevert("V3: milestone not met");
        airdrop.completeMilestone(alice, IAirdropClaimV3.Milestone.JobComplete);
    }

    function test_AllMilestones_FullAllocation() public {
        _doClaim(alice);

        // Complete all 5 milestones
        reputation.recordCompletion(alice, bob); // JobComplete

        vm.startPrank(alice);
        token.approve(address(staking), 100 ether);
        staking.stake(100 ether); // StakeActive
        registry.createListing(
            IServiceRegistry.ServiceCategory.CODING,
            "Test",
            "Desc",
            100 ether,
            address(token),
            3600,
            ""
        ); // ServiceListed
        vm.stopPrank();

        mockDispute.setDisputesHandled(alice, 1); // GovernanceVote

        // ReputationEarned — need score >= 1000
        // Base score is 500, each completion adds 100
        // Need 5 more completions
        for (uint256 i = 0; i < 5; i++) {
            reputation.recordCompletion(alice, address(uint160(100 + i)));
        }

        // Complete all milestones
        airdrop.completeMilestone(alice, IAirdropClaimV3.Milestone.JobComplete);
        airdrop.completeMilestone(alice, IAirdropClaimV3.Milestone.StakeActive);
        airdrop.completeMilestone(alice, IAirdropClaimV3.Milestone.ServiceListed);
        airdrop.completeMilestone(alice, IAirdropClaimV3.Milestone.GovernanceVote);
        airdrop.completeMilestone(alice, IAirdropClaimV3.Milestone.ReputationEarned);

        IAirdropClaimV3.ClaimInfo memory info = airdrop.getClaimInfo(alice);
        assertEq(info.released, 6_000 ether); // 1K immediate + 5x1K milestones
    }

    function test_PermissionlessMilestoneCall() public {
        _doClaim(alice);
        reputation.recordCompletion(alice, bob);

        // Bob can complete alice's milestone
        vm.prank(bob);
        airdrop.completeMilestone(alice, IAirdropClaimV3.Milestone.JobComplete);

        assertTrue(airdrop.isMilestoneComplete(alice, IAirdropClaimV3.Milestone.JobComplete));
    }

    // --- Admin Tests ---

    function test_UpdateMerkleRoot() public {
        uint256 newRoot = 99999;
        airdrop.updateMerkleRoot(newRoot);
        assertEq(airdrop.getMerkleRoot(), newRoot);
    }

    function test_UpdateMerkleRootRevertsIfNotUpdater() public {
        vm.prank(alice);
        vm.expectRevert();
        airdrop.updateMerkleRoot(99999);
    }

    function test_RecoverTokensAfterWindow() public {
        vm.warp(block.timestamp + CLAIM_WINDOW + 1);

        uint256 balance = token.balanceOf(address(airdrop));
        airdrop.recoverTokens(treasury);
        assertEq(token.balanceOf(treasury), balance);
    }

    function test_RecoverTokensRevertsIfWindowActive() public {
        vm.expectRevert("V3: window active");
        airdrop.recoverTokens(treasury);
    }

    function test_PauseUnpause() public {
        airdrop.pause();

        bytes memory approvalSig = _signApproval(alice, TEST_MERKLE_ROOT);
        uint256[2] memory pA = [uint256(0), uint256(0)];
        uint256[2][2] memory pB = [[uint256(0), uint256(0)], [uint256(0), uint256(0)]];
        uint256[2] memory pC = [uint256(0), uint256(0)];
        uint256[2] memory pubSignals = [TEST_MERKLE_ROOT, uint256(uint160(alice))];

        vm.prank(alice);
        vm.expectRevert("Pausable: paused");
        airdrop.claim(pA, pB, pC, pubSignals, approvalSig, 0);

        airdrop.unpause();
        _doClaim(alice); // Should work now
    }

    // --- View Tests ---

    function test_GetPendingMilestones() public {
        _doClaim(alice);

        bool[5] memory pending = airdrop.getPendingMilestones(alice);
        for (uint256 i = 0; i < 5; i++) {
            assertTrue(pending[i]);
        }

        // Complete one
        reputation.recordCompletion(alice, bob);
        airdrop.completeMilestone(alice, IAirdropClaimV3.Milestone.JobComplete);

        pending = airdrop.getPendingMilestones(alice);
        assertFalse(pending[0]); // JobComplete is not pending
        assertTrue(pending[1]);  // ServiceListed is still pending
    }

    function test_TotalClaimedTracking() public {
        assertEq(airdrop.totalClaimed(), 0);
        _doClaim(alice);
        assertEq(airdrop.totalClaimed(), 6_000 ether); // Full allocation reserved
    }
}
