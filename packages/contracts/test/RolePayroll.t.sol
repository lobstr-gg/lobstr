// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/LOBToken.sol";
import "../src/StakingManager.sol";
import "../src/RolePayroll.sol";
import "../src/interfaces/IRolePayroll.sol";
import "./helpers/ProxyTestHelper.sol";

// ── Mock Verifier (always returns true for unit tests) ──────────────

contract MockUptimeVerifier {
    bool public shouldPass = true;

    function setPass(bool _pass) external {
        shouldPass = _pass;
    }

    function verifyProof(
        uint[2] calldata,
        uint[2][2] calldata,
        uint[2] calldata,
        uint[4] calldata
    ) external view returns (bool) {
        return shouldPass;
    }
}

// ── Mock USDC (6 decimals) ──────────────────────────────────────────

contract MockUSDC {
    string public name = "USD Coin";
    string public symbol = "USDC";
    uint8 public decimals = 6;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "MockUSDC: insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "MockUSDC: insufficient balance");
        require(allowance[from][msg.sender] >= amount, "MockUSDC: insufficient allowance");
        balanceOf[from] -= amount;
        allowance[from][msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

// ── Mock DisputeArbitration ─────────────────────────────────────────

contract MockDisputeArbitrationRP {
    mapping(address => bool) private _certified;

    function isCertified(address arb) external view returns (bool) {
        return _certified[arb];
    }

    function setCertified(address arb, bool status) external {
        _certified[arb] = status;
    }
}

// ── Tests ───────────────────────────────────────────────────────────

contract RolePayrollTest is Test, ProxyTestHelper {
    LOBToken public lobToken;
    StakingManager public staking;
    MockUSDC public usdc;
    MockUptimeVerifier public verifier;
    MockDisputeArbitrationRP public mockDispute;
    RolePayroll public payroll;

    address public admin = makeAddr("admin");
    address public distributor = makeAddr("distributor");
    address public treasury = makeAddr("treasury");
    address public insurancePool = makeAddr("insurancePool");
    address public user1 = makeAddr("user1");
    address public user2 = makeAddr("user2");
    address public user3 = makeAddr("user3");
    address public founder1 = makeAddr("founder1");

    // Genesis epoch: a Sunday at 00:00 UTC (arbitrary past timestamp)
    uint256 public genesisEpoch = 1708905600; // Sunday Feb 25 2024 00:00 UTC

    function setUp() public {
        vm.startPrank(admin);

        lobToken = LOBToken(_deployProxy(address(new LOBToken()), abi.encodeCall(LOBToken.initialize, (distributor))));
        staking = StakingManager(_deployProxy(address(new StakingManager()), abi.encodeCall(StakingManager.initialize, (address(lobToken)))));
        usdc = new MockUSDC();
        verifier = new MockUptimeVerifier();
        mockDispute = new MockDisputeArbitrationRP();

        payroll = RolePayroll(_deployProxy(address(new RolePayroll()), abi.encodeCall(RolePayroll.initialize, (
            address(lobToken),
            address(usdc),
            address(staking),
            address(mockDispute),
            address(verifier),
            treasury,
            insurancePool,
            genesisEpoch
        ))));

        // Grant roles
        staking.grantRole(staking.LOCKER_ROLE(), address(payroll));
        staking.grantRole(staking.SLASHER_ROLE(), address(payroll));
        payroll.grantRole(payroll.DISPUTE_ROLE(), address(mockDispute));
        payroll.grantRole(payroll.ROOT_POSTER_ROLE(), admin);

        // Mark founder
        payroll.setFounderAgent(founder1, true);

        // Configure roles: Arbitrator Junior (type=0, rank=0)
        payroll.setRoleConfig(0, 0, IRolePayroll.RoleConfig({
            maxSlots: 20,
            certFeeUsdc: 35_000_000, // $35 USDC (6 decimals)
            minStakeLob: 5_000 ether,
            weeklyBaseLob: 150 ether,
            perDisputeLob: 75 ether,
            majorityBonusLob: 25 ether
        }));

        // Configure roles: Arbitrator Senior (type=0, rank=1)
        payroll.setRoleConfig(0, 1, IRolePayroll.RoleConfig({
            maxSlots: 10,
            certFeeUsdc: 75_000_000,
            minStakeLob: 15_000 ether,
            weeklyBaseLob: 350 ether,
            perDisputeLob: 175 ether,
            majorityBonusLob: 50 ether
        }));

        // Configure roles: Moderator Junior (type=1, rank=0)
        payroll.setRoleConfig(1, 0, IRolePayroll.RoleConfig({
            maxSlots: 15,
            certFeeUsdc: 25_000_000,
            minStakeLob: 3_000 ether,
            weeklyBaseLob: 200 ether,
            perDisputeLob: 0,
            majorityBonusLob: 0
        }));

        vm.stopPrank();

        // Fund users with LOB for staking
        vm.startPrank(distributor);
        lobToken.transfer(user1, 100_000 ether);
        lobToken.transfer(user2, 100_000 ether);
        lobToken.transfer(user3, 100_000 ether);
        // Fund treasury with LOB for payouts
        lobToken.transfer(treasury, 10_000_000 ether);
        vm.stopPrank();

        // Treasury approves RolePayroll to pull LOB
        vm.prank(treasury);
        lobToken.approve(address(payroll), type(uint256).max);

        // Fund users with USDC for cert fees
        usdc.mint(user1, 1_000_000_000); // $1000
        usdc.mint(user2, 1_000_000_000);
        usdc.mint(user3, 1_000_000_000);

        // Users approve USDC spending
        vm.prank(user1);
        usdc.approve(address(payroll), type(uint256).max);
        vm.prank(user2);
        usdc.approve(address(payroll), type(uint256).max);
        vm.prank(user3);
        usdc.approve(address(payroll), type(uint256).max);

        // Users stake LOB
        vm.prank(user1);
        lobToken.approve(address(staking), type(uint256).max);
        vm.prank(user1);
        staking.stake(10_000 ether);

        vm.prank(user2);
        lobToken.approve(address(staking), type(uint256).max);
        vm.prank(user2);
        staking.stake(20_000 ether);

        vm.prank(user3);
        lobToken.approve(address(staking), type(uint256).max);
        vm.prank(user3);
        staking.stake(5_000 ether);

        // Certify user1 as arbitrator
        mockDispute.setCertified(user1, true);
        mockDispute.setCertified(user2, true);
    }

    // ── Helper: create valid pub signals ─────────────────────────────

    function _epochRoot(uint256 epoch) internal pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked("epochRoot", epoch)));
    }

    function _postEpochRoot(uint256 epoch) internal {
        uint256 root = _epochRoot(epoch);
        if (payroll.epochRoots(epoch) == 0) {
            vm.prank(admin);
            payroll.postEpochRoot(epoch, root);
        }
    }

    function _pubSignals(address user, uint256 uptime, uint256 epoch) internal view returns (uint256[4] memory) {
        return [
            uint256(uint160(user)),
            uptime,
            genesisEpoch + (epoch * 7 days),
            _epochRoot(epoch)
        ];
    }

    function _dummyProof() internal pure returns (
        uint256[2] memory pA,
        uint256[2][2] memory pB,
        uint256[2] memory pC
    ) {
        pA = [uint256(1), uint256(2)];
        pB = [[uint256(3), uint256(4)], [uint256(5), uint256(6)]];
        pC = [uint256(7), uint256(8)];
    }

    // ═══════════════════════════════════════════════════════════════
    // Enrollment Tests
    // ═══════════════════════════════════════════════════════════════

    function test_enroll_arbitrator_junior() public {
        vm.prank(user1);
        payroll.enroll(0, 0); // Arbitrator Junior

        IRolePayroll.RoleSlot memory slot = payroll.getRoleSlot(user1);
        assertEq(uint8(slot.status), uint8(IRolePayroll.SlotStatus.Active));
        assertEq(uint8(slot.roleType), 0);
        assertEq(uint8(slot.rank), 0);
        assertEq(slot.stakedAmount, 5_000 ether);

        // USDC cert fee collected
        assertEq(usdc.balanceOf(address(payroll)), 35_000_000);
        assertEq(payroll.accumulatedCertFees(), 35_000_000);

        // Slot count updated
        assertEq(payroll.getFilledSlots(0, 0), 1);
    }

    function test_enroll_moderator() public {
        vm.prank(user3);
        payroll.enroll(1, 0); // Moderator Junior

        IRolePayroll.RoleSlot memory slot = payroll.getRoleSlot(user3);
        assertEq(uint8(slot.status), uint8(IRolePayroll.SlotStatus.Active));
        assertEq(uint8(slot.roleType), 1);
    }

    function test_enroll_revert_already_enrolled() public {
        vm.prank(user1);
        payroll.enroll(0, 0);

        vm.prank(user1);
        vm.expectRevert("RP:already enrolled");
        payroll.enroll(0, 0);
    }

    function test_enroll_revert_not_certified_arbitrator() public {
        mockDispute.setCertified(user3, false);

        vm.prank(user3);
        vm.expectRevert("RP:not certified");
        payroll.enroll(0, 0); // Arbitrator but not certified
    }

    function test_enroll_revert_insufficient_stake() public {
        // user3 only has 5000 LOB staked, try senior arb which needs 15000
        mockDispute.setCertified(user3, true);

        vm.prank(user3);
        vm.expectRevert("RP:insufficient stake");
        payroll.enroll(0, 1); // Arb Senior needs 15000 LOB
    }

    function test_enroll_revert_slots_full() public {
        // Configure a role with max 1 slot
        vm.prank(admin);
        payroll.setRoleConfig(1, 2, IRolePayroll.RoleConfig({
            maxSlots: 1,
            certFeeUsdc: 0,
            minStakeLob: 3_000 ether,
            weeklyBaseLob: 900 ether,
            perDisputeLob: 0,
            majorityBonusLob: 0
        }));

        vm.prank(user3);
        payroll.enroll(1, 2); // Takes the one slot

        // user1 has enough stake but slot is full
        vm.prank(user1);
        vm.expectRevert("RP:slots full");
        payroll.enroll(1, 2);
    }

    function test_enroll_revert_founder() public {
        vm.prank(founder1);
        vm.expectRevert("RP:founder exempt");
        payroll.enroll(0, 0);
    }

    // ═══════════════════════════════════════════════════════════════
    // Weekly Claims Tests
    // ═══════════════════════════════════════════════════════════════

    function test_claim_full_uptime() public {
        vm.prank(user1);
        payroll.enroll(0, 0);

        // Warp to epoch 1 (past first week)
        vm.warp(genesisEpoch + 8 days);
        _postEpochRoot(0);

        (uint256[2] memory pA, uint256[2][2] memory pB, uint256[2] memory pC) = _dummyProof();
        uint256[4] memory signals = _pubSignals(user1, 2016, 0); // 100% uptime

        uint256 treasuryBefore = lobToken.balanceOf(treasury);

        vm.prank(user1);
        payroll.claimWeeklyPay(0, pA, pB, pC, signals);

        IRolePayroll.EpochClaim memory claim = payroll.getEpochClaim(user1, 0);
        assertTrue(claim.claimed);
        assertEq(claim.uptimeCount, 2016);
        assertEq(claim.payAmount, 150 ether); // 100% of 150 LOB base

        // LOB pulled from treasury
        assertEq(lobToken.balanceOf(user1), 90_000 ether + 150 ether); // original - staked + payout
        assertEq(lobToken.balanceOf(treasury), treasuryBefore - 150 ether);
    }

    function test_claim_75_percent_uptime() public {
        vm.prank(user1);
        payroll.enroll(0, 0);

        vm.warp(genesisEpoch + 8 days);
        _postEpochRoot(0);

        (uint256[2] memory pA, uint256[2][2] memory pB, uint256[2] memory pC) = _dummyProof();
        uint256[4] memory signals = _pubSignals(user1, 1950, 0); // 96.7% → 75% pay

        vm.prank(user1);
        payroll.claimWeeklyPay(0, pA, pB, pC, signals);

        IRolePayroll.EpochClaim memory claim = payroll.getEpochClaim(user1, 0);
        assertEq(claim.payAmount, 112.5 ether); // 75% of 150 LOB
    }

    function test_claim_50_percent_uptime() public {
        vm.prank(user1);
        payroll.enroll(0, 0);

        vm.warp(genesisEpoch + 8 days);
        _postEpochRoot(0);

        (uint256[2] memory pA, uint256[2][2] memory pB, uint256[2] memory pC) = _dummyProof();
        uint256[4] memory signals = _pubSignals(user1, 1850, 0); // 91.8% → 50% pay

        vm.prank(user1);
        payroll.claimWeeklyPay(0, pA, pB, pC, signals);

        IRolePayroll.EpochClaim memory claim = payroll.getEpochClaim(user1, 0);
        assertEq(claim.payAmount, 75 ether); // 50% of 150 LOB
    }

    function test_claim_25_percent_uptime_gives_strike() public {
        vm.prank(user1);
        payroll.enroll(0, 0);

        vm.warp(genesisEpoch + 8 days);
        _postEpochRoot(0);

        (uint256[2] memory pA, uint256[2][2] memory pB, uint256[2] memory pC) = _dummyProof();
        uint256[4] memory signals = _pubSignals(user1, 1700, 0); // 84.3% → 25% pay + 1 strike

        vm.prank(user1);
        payroll.claimWeeklyPay(0, pA, pB, pC, signals);

        IRolePayroll.EpochClaim memory claim = payroll.getEpochClaim(user1, 0);
        assertEq(claim.payAmount, 37.5 ether); // 25% of 150 LOB

        IRolePayroll.RoleSlot memory slot = payroll.getRoleSlot(user1);
        assertEq(slot.strikes, 1);
    }

    function test_claim_below_80_gives_two_strikes() public {
        vm.prank(user1);
        payroll.enroll(0, 0);

        vm.warp(genesisEpoch + 8 days);
        _postEpochRoot(0);

        (uint256[2] memory pA, uint256[2][2] memory pB, uint256[2] memory pC) = _dummyProof();
        uint256[4] memory signals = _pubSignals(user1, 1200, 0); // 59.5% → 0% pay + 2 strikes

        vm.prank(user1);
        payroll.claimWeeklyPay(0, pA, pB, pC, signals);

        IRolePayroll.EpochClaim memory claim = payroll.getEpochClaim(user1, 0);
        assertEq(claim.payAmount, 0);

        IRolePayroll.RoleSlot memory slot = payroll.getRoleSlot(user1);
        assertEq(slot.strikes, 2);
    }

    function test_claim_below_50_suspends() public {
        vm.prank(user1);
        payroll.enroll(0, 0);

        vm.warp(genesisEpoch + 8 days);
        _postEpochRoot(0);

        (uint256[2] memory pA, uint256[2][2] memory pB, uint256[2] memory pC) = _dummyProof();
        uint256[4] memory signals = _pubSignals(user1, 500, 0); // 24.8% → suspended

        vm.prank(user1);
        payroll.claimWeeklyPay(0, pA, pB, pC, signals);

        IRolePayroll.RoleSlot memory slot = payroll.getRoleSlot(user1);
        assertEq(uint8(slot.status), uint8(IRolePayroll.SlotStatus.Suspended));
    }

    function test_claim_revert_epoch_not_ended() public {
        vm.prank(user1);
        payroll.enroll(0, 0);

        // Still in epoch 0
        vm.warp(genesisEpoch + 3 days);

        (uint256[2] memory pA, uint256[2][2] memory pB, uint256[2] memory pC) = _dummyProof();
        uint256[4] memory signals = _pubSignals(user1, 2016, 0);

        vm.prank(user1);
        vm.expectRevert("RP:epoch not ended");
        payroll.claimWeeklyPay(0, pA, pB, pC, signals);
    }

    function test_claim_revert_already_claimed() public {
        vm.prank(user1);
        payroll.enroll(0, 0);

        vm.warp(genesisEpoch + 8 days);
        _postEpochRoot(0);

        (uint256[2] memory pA, uint256[2][2] memory pB, uint256[2] memory pC) = _dummyProof();
        uint256[4] memory signals = _pubSignals(user1, 2016, 0);

        vm.prank(user1);
        payroll.claimWeeklyPay(0, pA, pB, pC, signals);

        vm.prank(user1);
        vm.expectRevert("RP:already claimed");
        payroll.claimWeeklyPay(0, pA, pB, pC, signals);
    }

    function test_claim_revert_address_mismatch() public {
        vm.prank(user1);
        payroll.enroll(0, 0);

        vm.warp(genesisEpoch + 8 days);

        (uint256[2] memory pA, uint256[2][2] memory pB, uint256[2] memory pC) = _dummyProof();
        uint256[4] memory signals = _pubSignals(user2, 2016, 0); // wrong address

        vm.prank(user1);
        vm.expectRevert("RP:address mismatch");
        payroll.claimWeeklyPay(0, pA, pB, pC, signals);
    }

    function test_claim_revert_invalid_proof() public {
        vm.prank(user1);
        payroll.enroll(0, 0);

        vm.warp(genesisEpoch + 8 days);
        _postEpochRoot(0);

        verifier.setPass(false);

        (uint256[2] memory pA, uint256[2][2] memory pB, uint256[2] memory pC) = _dummyProof();
        uint256[4] memory signals = _pubSignals(user1, 2016, 0);

        vm.prank(user1);
        vm.expectRevert("RP:invalid proof");
        payroll.claimWeeklyPay(0, pA, pB, pC, signals);

        verifier.setPass(true); // Reset for other tests
    }

    function test_claim_revert_founder() public {
        vm.prank(founder1);
        vm.expectRevert("RP:founder exempt");
        payroll.claimWeeklyPay(0, [uint256(0), 0], [[uint256(0), 0], [uint256(0), 0]], [uint256(0), 0], [uint256(0), 0, 0, 0]);
    }

    // ═══════════════════════════════════════════════════════════════
    // Arbitrator Variable Pay Tests
    // ═══════════════════════════════════════════════════════════════

    function test_claim_with_dispute_participation() public {
        vm.prank(user1);
        payroll.enroll(0, 0); // Arb Junior

        // Record 3 disputes, 2 majority votes, in epoch 0
        vm.startPrank(address(mockDispute));
        payroll.recordDisputeParticipation(user1, 0, true);
        payroll.recordDisputeParticipation(user1, 0, true);
        payroll.recordDisputeParticipation(user1, 0, false);
        vm.stopPrank();

        vm.warp(genesisEpoch + 8 days);
        _postEpochRoot(0);

        (uint256[2] memory pA, uint256[2][2] memory pB, uint256[2] memory pC) = _dummyProof();
        uint256[4] memory signals = _pubSignals(user1, 2016, 0); // Full uptime

        vm.prank(user1);
        payroll.claimWeeklyPay(0, pA, pB, pC, signals);

        IRolePayroll.EpochClaim memory claim = payroll.getEpochClaim(user1, 0);
        // Base: 150 + per-dispute: 75*3 + majority bonus: 25*2 = 150 + 225 + 50 = 425
        assertEq(claim.payAmount, 425 ether);
    }

    // ═══════════════════════════════════════════════════════════════
    // Strike Escalation Tests
    // ═══════════════════════════════════════════════════════════════

    function test_strikes_accumulate_to_removal() public {
        vm.prank(user1);
        payroll.enroll(0, 0);

        // Epoch 0: below 80% → +2 strikes
        vm.warp(genesisEpoch + 8 days);
        _postEpochRoot(0);
        (uint256[2] memory pA, uint256[2][2] memory pB, uint256[2] memory pC) = _dummyProof();
        uint256[4] memory signals = _pubSignals(user1, 1200, 0);
        vm.prank(user1);
        payroll.claimWeeklyPay(0, pA, pB, pC, signals);

        IRolePayroll.RoleSlot memory slot = payroll.getRoleSlot(user1);
        assertEq(slot.strikes, 2);

        // Epoch 1: below 80% again → +2 strikes → total 4 → removed
        vm.warp(genesisEpoch + 15 days);
        _postEpochRoot(1);
        uint256[4] memory signals2 = _pubSignals(user1, 1200, 1);
        signals2[3] = _epochRoot(1);
        vm.prank(user1);
        payroll.claimWeeklyPay(1, pA, pB, pC, signals2);

        slot = payroll.getRoleSlot(user1);
        assertEq(uint8(slot.status), uint8(IRolePayroll.SlotStatus.Empty)); // Removed
    }

    // ═══════════════════════════════════════════════════════════════
    // Abandonment Tests
    // ═══════════════════════════════════════════════════════════════

    function test_abandonment_72h_strike() public {
        vm.prank(user1);
        payroll.enroll(0, 0);

        // Warp 73 hours without heartbeat
        vm.warp(block.timestamp + 73 hours);

        payroll.reportAbandonment(user1);

        IRolePayroll.RoleSlot memory slot = payroll.getRoleSlot(user1);
        assertEq(slot.strikes, 2); // 72h → +2 strikes
    }

    function test_abandonment_7d_revoke() public {
        vm.prank(user1);
        payroll.enroll(0, 0);

        // Warp 8 days without heartbeat
        vm.warp(block.timestamp + 8 days);

        payroll.reportAbandonment(user1);

        IRolePayroll.RoleSlot memory slot = payroll.getRoleSlot(user1);
        assertEq(uint8(slot.status), uint8(IRolePayroll.SlotStatus.Empty));
    }

    function test_abandonment_30d_full_forfeit() public {
        vm.prank(user1);
        payroll.enroll(0, 0);

        vm.warp(block.timestamp + 31 days);

        payroll.reportAbandonment(user1);

        IRolePayroll.RoleSlot memory slot = payroll.getRoleSlot(user1);
        assertEq(uint8(slot.status), uint8(IRolePayroll.SlotStatus.Empty));
        assertEq(slot.stakedAmount, 0);
    }

    function test_abandonment_revert_not_abandoned() public {
        vm.prank(user1);
        payroll.enroll(0, 0);

        // Only 1 hour — not abandoned yet
        vm.warp(block.timestamp + 1 hours);

        vm.expectRevert("RP:not abandoned");
        payroll.reportAbandonment(user1);
    }

    function test_abandonment_revert_founder() public {
        vm.expectRevert("RP:founder exempt");
        payroll.reportAbandonment(founder1);
    }

    // ═══════════════════════════════════════════════════════════════
    // Resignation Tests
    // ═══════════════════════════════════════════════════════════════

    function test_resign_and_complete() public {
        vm.prank(user1);
        payroll.enroll(0, 0);

        assertEq(payroll.getFilledSlots(0, 0), 1);

        vm.prank(user1);
        payroll.resign();

        IRolePayroll.RoleSlot memory slot = payroll.getRoleSlot(user1);
        assertEq(uint8(slot.status), uint8(IRolePayroll.SlotStatus.Resigned));
        assertEq(payroll.getFilledSlots(0, 0), 0); // Slot freed

        // Complete resignation after cooldown
        vm.warp(block.timestamp + 7 days + 1);

        vm.prank(user1);
        payroll.completeResignation();

        slot = payroll.getRoleSlot(user1);
        assertEq(uint8(slot.status), uint8(IRolePayroll.SlotStatus.Empty));
        assertEq(slot.stakedAmount, 0);
    }

    function test_resign_revert_cooldown_active() public {
        vm.prank(user1);
        payroll.enroll(0, 0);

        vm.prank(user1);
        payroll.resign();

        // Too early
        vm.warp(block.timestamp + 3 days);

        vm.prank(user1);
        vm.expectRevert("RP:cooldown active");
        payroll.completeResignation();
    }

    // ═══════════════════════════════════════════════════════════════
    // Founder Exemption Tests
    // ═══════════════════════════════════════════════════════════════

    function test_founder_cannot_enroll() public {
        vm.prank(founder1);
        vm.expectRevert("RP:founder exempt");
        payroll.enroll(0, 0);
    }

    function test_founder_cannot_be_reported() public {
        vm.expectRevert("RP:founder exempt");
        payroll.reportAbandonment(founder1);
    }

    function test_set_founder_agent() public {
        address newFounder = makeAddr("newFounder");

        vm.prank(admin);
        payroll.setFounderAgent(newFounder, true);

        assertTrue(payroll.founderAgents(newFounder));

        vm.prank(admin);
        payroll.setFounderAgent(newFounder, false);

        assertFalse(payroll.founderAgents(newFounder));
    }

    // ═══════════════════════════════════════════════════════════════
    // Heartbeat Tests
    // ═══════════════════════════════════════════════════════════════

    function test_report_heartbeat() public {
        vm.prank(user1);
        payroll.enroll(0, 0);

        vm.warp(block.timestamp + 6 hours);

        vm.prank(user1);
        payroll.reportHeartbeat();

        assertEq(payroll.lastHeartbeatTimestamp(user1), block.timestamp);
    }

    function test_heartbeat_revert_not_active() public {
        vm.prank(user2);
        vm.expectRevert("RP:not active");
        payroll.reportHeartbeat(); // user2 not enrolled
    }

    // ═══════════════════════════════════════════════════════════════
    // Edge Cases
    // ═══════════════════════════════════════════════════════════════

    function test_epoch_calculation() public {
        // Warp to a time after genesis
        vm.warp(genesisEpoch + 14 days + 1);
        assertEq(payroll.currentEpoch(), 2);
        assertEq(payroll.epochStartTimestamp(0), genesisEpoch);
        assertEq(payroll.epochStartTimestamp(1), genesisEpoch + 7 days);
        assertEq(payroll.epochStartTimestamp(2), genesisEpoch + 14 days);
    }

    function test_paused_blocks_enroll() public {
        vm.prank(admin);
        payroll.pause();

        vm.prank(user1);
        vm.expectRevert("EnforcedPause()");
        payroll.enroll(0, 0);

        vm.prank(admin);
        payroll.unpause();
    }

    function test_withdraw_cert_fees() public {
        vm.prank(user1);
        payroll.enroll(0, 0);

        assertEq(payroll.accumulatedCertFees(), 35_000_000);

        vm.prank(admin);
        payroll.withdrawCertFees(treasury);

        assertEq(usdc.balanceOf(treasury), 35_000_000);
        assertEq(payroll.accumulatedCertFees(), 0);
    }

    function test_withdraw_cert_fees_revert_no_fees() public {
        vm.prank(admin);
        vm.expectRevert("RP:no fees");
        payroll.withdrawCertFees(treasury);
    }

    function test_dispute_stats_view() public {
        vm.prank(user1);
        payroll.enroll(0, 0);

        vm.startPrank(address(mockDispute));
        payroll.recordDisputeParticipation(user1, 0, true);
        payroll.recordDisputeParticipation(user1, 0, false);
        vm.stopPrank();

        (uint256 disputes, uint256 majority) = payroll.getDisputeStats(user1, 0);
        assertEq(disputes, 2);
        assertEq(majority, 1);
    }

    function test_moderator_no_dispute_variable_pay() public {
        vm.prank(user3);
        payroll.enroll(1, 0); // Mod Junior

        vm.warp(genesisEpoch + 8 days);
        _postEpochRoot(0);

        (uint256[2] memory pA, uint256[2][2] memory pB, uint256[2] memory pC) = _dummyProof();
        uint256[4] memory signals = _pubSignals(user3, 2016, 0);

        vm.prank(user3);
        payroll.claimWeeklyPay(0, pA, pB, pC, signals);

        IRolePayroll.EpochClaim memory claim = payroll.getEpochClaim(user3, 0);
        assertEq(claim.payAmount, 200 ether); // Fixed 200 LOB, no dispute variable
    }

    function test_claim_wrong_week_start_reverts() public {
        vm.prank(user1);
        payroll.enroll(0, 0);

        vm.warp(genesisEpoch + 8 days);

        (uint256[2] memory pA, uint256[2][2] memory pB, uint256[2] memory pC) = _dummyProof();
        uint256[4] memory signals = [
            uint256(uint160(user1)),
            uint256(2016),
            uint256(genesisEpoch + 1 days), // Wrong week start
            uint256(keccak256("root"))
        ];

        vm.prank(user1);
        vm.expectRevert("RP:wrong week start");
        payroll.claimWeeklyPay(0, pA, pB, pC, signals);
    }

    function test_multiple_users_different_ranks() public {
        // user1 = Arb Junior, user2 = Arb Senior
        vm.prank(user1);
        payroll.enroll(0, 0);

        vm.prank(user2);
        payroll.enroll(0, 1);

        vm.warp(genesisEpoch + 8 days);
        _postEpochRoot(0);

        (uint256[2] memory pA, uint256[2][2] memory pB, uint256[2] memory pC) = _dummyProof();

        uint256[4] memory signals1 = _pubSignals(user1, 2016, 0);
        vm.prank(user1);
        payroll.claimWeeklyPay(0, pA, pB, pC, signals1);

        uint256[4] memory signals2 = _pubSignals(user2, 2016, 0);
        vm.prank(user2);
        payroll.claimWeeklyPay(0, pA, pB, pC, signals2);

        assertEq(payroll.getEpochClaim(user1, 0).payAmount, 150 ether); // Junior base
        assertEq(payroll.getEpochClaim(user2, 0).payAmount, 350 ether); // Senior base
    }
}
