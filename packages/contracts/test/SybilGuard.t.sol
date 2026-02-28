// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/LOBToken.sol";
import "../src/StakingManager.sol";
import "../src/SybilGuard.sol";
import "../src/RewardDistributor.sol";
import "./helpers/ProxyTestHelper.sol";

contract SybilGuardTest is Test, ProxyTestHelper {
    LOBToken public lob;
    StakingManager public staking;
    SybilGuard public sybilGuard;
    RewardDistributor public rewardDist;

    address public admin = makeAddr("admin");
    address public distributor = makeAddr("distributor");
    address public treasuryGovernor = makeAddr("treasuryGovernor");

    address public watcher = makeAddr("watcher");
    address public judge1 = makeAddr("judge1");
    address public judge2 = makeAddr("judge2");
    address public judge3 = makeAddr("judge3");
    address public appeals = makeAddr("appeals");

    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");
    address public charlie = makeAddr("charlie");
    address public eve = makeAddr("eve");
    address public outsider = makeAddr("outsider");

    uint256 public constant STAKE_AMOUNT = 10_000 ether;
    uint256 public constant WATCHER_BOND = 500 ether; // min bond = 500, 5% of 10K = 500

    function setUp() public {
        vm.prank(distributor);
        lob = LOBToken(_deployProxy(address(new LOBToken()), abi.encodeCall(LOBToken.initialize, (distributor))));

        vm.startPrank(admin);
        staking = StakingManager(_deployProxy(address(new StakingManager()), abi.encodeCall(StakingManager.initialize, (address(lob)))));
        rewardDist = RewardDistributor(_deployProxy(address(new RewardDistributor()), abi.encodeCall(RewardDistributor.initialize, ())));
        vm.stopPrank();

        // Initialize with admin as owner (so admin gets DEFAULT_ADMIN_ROLE in OZ 5.x)
        vm.startPrank(admin);
        sybilGuard = SybilGuard(_deployProxy(address(new SybilGuard()), abi.encodeCall(SybilGuard.initialize, (
            address(lob),
            address(staking),
            treasuryGovernor,
            address(rewardDist)
        ))));

        sybilGuard.grantRole(sybilGuard.WATCHER_ROLE(), watcher);
        sybilGuard.grantRole(sybilGuard.JUDGE_ROLE(), judge1);
        sybilGuard.grantRole(sybilGuard.JUDGE_ROLE(), judge2);
        sybilGuard.grantRole(sybilGuard.JUDGE_ROLE(), judge3);
        sybilGuard.grantRole(sybilGuard.APPEALS_ROLE(), appeals);

        rewardDist.grantRole(rewardDist.SYBIL_GUARD_ROLE(), address(sybilGuard));
        vm.stopPrank();

        bytes32 slasherRole = staking.SLASHER_ROLE();
        vm.prank(admin);
        staking.grantRole(slasherRole, address(sybilGuard));

        // Fund users
        vm.startPrank(distributor);
        lob.transfer(alice, 200_000 ether);
        lob.transfer(bob, 200_000 ether);
        lob.transfer(charlie, 200_000 ether);
        lob.transfer(eve, 200_000 ether);
        lob.transfer(watcher, 100_000 ether);
        lob.transfer(address(rewardDist), 100_000 ether);
        vm.stopPrank();

        // Users stake LOB
        _stakeFor(alice, STAKE_AMOUNT);
        _stakeFor(bob, STAKE_AMOUNT);
        _stakeFor(charlie, STAKE_AMOUNT);

        // Watcher approves SybilGuard for bond deposits
        vm.prank(watcher);
        lob.approve(address(sybilGuard), type(uint256).max);
    }

    function _stakeFor(address user, uint256 amount) internal {
        vm.startPrank(user);
        lob.approve(address(staking), amount);
        staking.stake(amount);
        vm.stopPrank();
    }

    function _submitReport(address[] memory subjects) internal returns (uint256) {
        vm.prank(watcher);
        return sybilGuard.submitReport(
            subjects,
            SybilGuard.ViolationType.SybilCluster,
            "ipfs://evidence123",
            "Detected sybil cluster"
        );
    }

    /// @dev Confirms with 2 judges — sufficient for low-stake targets.
    function _submitAndConfirm2(address[] memory subjects) internal returns (uint256) {
        uint256 reportId = _submitReport(subjects);
        vm.prank(judge1);
        sybilGuard.confirmReport(reportId);
        vm.prank(judge2);
        sybilGuard.confirmReport(reportId);
        return reportId;
    }

    /// @dev Confirms with 3 judges — schedules ban (does NOT execute).
    ///      Uses 3 judges to handle high-stake targets (>= 10K LOB).
    function _submitAndConfirm(address[] memory subjects) internal returns (uint256) {
        uint256 reportId = _submitReport(subjects);

        vm.prank(judge1);
        sybilGuard.confirmReport(reportId);

        vm.prank(judge2);
        sybilGuard.confirmReport(reportId);

        vm.prank(judge3);
        sybilGuard.confirmReport(reportId);

        return reportId;
    }

    /// @dev Full flow: submit → confirm (3 judges) → wait 48hr → executeBan
    function _submitConfirmAndExecute(address[] memory subjects) internal returns (uint256) {
        uint256 reportId = _submitAndConfirm(subjects);
        vm.warp(block.timestamp + 48 hours);
        sybilGuard.executeBan(reportId);
        return reportId;
    }

    /* ═══════════════════════════════════════════════════════════════
       CONSTRUCTOR TESTS
       ═══════════════════════════════════════════════════════════════ */

    function test_constructor_sets_immutables() public view {
        assertEq(address(sybilGuard.lobToken()), address(lob));
        assertEq(address(sybilGuard.stakingManager()), address(staking));
        assertEq(sybilGuard.treasuryGovernor(), treasuryGovernor);
        assertEq(address(sybilGuard.rewardDistributor()), address(rewardDist));
    }

    function test_constructor_reverts_zero_lobToken() public {
        address impl = address(new SybilGuard());
        vm.expectRevert("SybilGuard: zero lobToken");
        _deployProxy(impl, abi.encodeCall(SybilGuard.initialize, (address(0), address(staking), treasuryGovernor, address(rewardDist))));
    }

    function test_constructor_reverts_zero_staking() public {
        address impl = address(new SybilGuard());
        vm.expectRevert("SybilGuard: zero staking");
        _deployProxy(impl, abi.encodeCall(SybilGuard.initialize, (address(lob), address(0), treasuryGovernor, address(rewardDist))));
    }

    function test_constructor_reverts_zero_treasury() public {
        address impl = address(new SybilGuard());
        vm.expectRevert("SybilGuard: zero treasury");
        _deployProxy(impl, abi.encodeCall(SybilGuard.initialize, (address(lob), address(staking), address(0), address(rewardDist))));
    }

    function test_constructor_reverts_zero_rewardDistributor() public {
        address impl = address(new SybilGuard());
        vm.expectRevert("SybilGuard: zero rewardDistributor");
        _deployProxy(impl, abi.encodeCall(SybilGuard.initialize, (address(lob), address(staking), treasuryGovernor, address(0))));
    }

    /* ═══════════════════════════════════════════════════════════════
       SUBMIT REPORT TESTS (with bond)
       ═══════════════════════════════════════════════════════════════ */

    function test_submitReport_collectsBond() public {
        address[] memory subjects = new address[](1);
        subjects[0] = alice;

        uint256 watcherBalBefore = lob.balanceOf(watcher);

        vm.prank(watcher);
        uint256 reportId = sybilGuard.submitReport(
            subjects,
            SybilGuard.ViolationType.SybilCluster,
            "ipfs://evidence",
            "Found linked accounts"
        );

        assertEq(reportId, 1);
        assertEq(sybilGuard.totalReports(), 1);
        assertEq(lob.balanceOf(watcher), watcherBalBefore - WATCHER_BOND);
        assertEq(sybilGuard.reportBondAmount(reportId), WATCHER_BOND);
    }

    function test_submitReport_reverts_selfReport() public {
        address[] memory subjects = new address[](1);
        subjects[0] = watcher;

        vm.prank(watcher);
        vm.expectRevert("SybilGuard: cannot self-report");
        sybilGuard.submitReport(
            subjects,
            SybilGuard.ViolationType.SybilCluster,
            "ipfs://evidence",
            "notes"
        );
    }

    function test_submitReport_reverts_reportCooldown() public {
        address[] memory subjects = new address[](1);
        subjects[0] = alice;
        _submitReport(subjects);

        // Try to submit another report immediately
        subjects[0] = bob;
        vm.prank(watcher);
        vm.expectRevert("SybilGuard: report cooldown");
        sybilGuard.submitReport(
            subjects,
            SybilGuard.ViolationType.SybilCluster,
            "ipfs://evidence2",
            "notes"
        );

        // After cooldown, should work
        vm.warp(block.timestamp + 4 hours + 1);
        subjects[0] = bob;
        _submitReport(subjects);
    }

    function test_submitReport_reverts_non_watcher() public {
        address[] memory subjects = new address[](1);
        subjects[0] = alice;

        vm.prank(outsider);
        vm.expectRevert();
        sybilGuard.submitReport(
            subjects,
            SybilGuard.ViolationType.SybilCluster,
            "ipfs://evidence",
            "notes"
        );
    }

    function test_submitReport_reverts_empty_subjects() public {
        address[] memory subjects = new address[](0);

        vm.prank(watcher);
        vm.expectRevert("SybilGuard: no subjects");
        sybilGuard.submitReport(
            subjects,
            SybilGuard.ViolationType.SybilCluster,
            "ipfs://evidence",
            "notes"
        );
    }

    function test_submitReport_reverts_no_evidence() public {
        address[] memory subjects = new address[](1);
        subjects[0] = alice;

        vm.prank(watcher);
        vm.expectRevert("SybilGuard: no evidence");
        sybilGuard.submitReport(
            subjects,
            SybilGuard.ViolationType.SybilCluster,
            "",
            "notes"
        );
    }

    /* ═══════════════════════════════════════════════════════════════
       CONFIRM + EXECUTE BAN TESTS
       ═══════════════════════════════════════════════════════════════ */

    function test_confirmReport_schedulesBanNotImmediate() public {
        address[] memory subjects = new address[](1);
        subjects[0] = alice;

        uint256 reportId = _submitAndConfirm(subjects); // 3 judges for high-stake

        // Ban is SCHEDULED but NOT executed
        assertFalse(sybilGuard.isBanned(alice));
        assertGt(sybilGuard.reportBanScheduledAt(reportId), 0);
        assertFalse(sybilGuard.reportBanExecuted(reportId));
    }

    function test_executeBan_afterDelay() public {
        address[] memory subjects = new address[](1);
        subjects[0] = alice;

        uint256 watcherBalBefore = lob.balanceOf(watcher);
        uint256 reportId = _submitReport(subjects);
        uint256 watcherBalAfterReport = lob.balanceOf(watcher);
        assertEq(watcherBalBefore - watcherBalAfterReport, WATCHER_BOND);

        vm.prank(judge1);
        sybilGuard.confirmReport(reportId);
        vm.prank(judge2);
        sybilGuard.confirmReport(reportId);
        vm.prank(judge3);
        sybilGuard.confirmReport(reportId);

        // Wait 48hr delay
        vm.warp(block.timestamp + 48 hours);
        sybilGuard.executeBan(reportId);

        // Now banned
        assertTrue(sybilGuard.isBanned(alice));
        // Bond returned after execution
        assertEq(lob.balanceOf(watcher), watcherBalAfterReport + WATCHER_BOND);
        assertTrue(sybilGuard.reportBondReturned(reportId));
    }

    function test_executeBan_revertBeforeDelay() public {
        // Use eve (no stake) so 2 judges suffice
        address[] memory subjects = new address[](1);
        subjects[0] = eve;

        uint256 reportId = _submitReport(subjects);
        vm.prank(judge1);
        sybilGuard.confirmReport(reportId);
        vm.prank(judge2);
        sybilGuard.confirmReport(reportId);

        // Ban is scheduled
        assertGt(sybilGuard.reportBanScheduledAt(reportId), 0);

        // Try to execute before 48hr delay
        vm.warp(block.timestamp + 47 hours);
        vm.expectRevert("SybilGuard: ban delay not elapsed");
        sybilGuard.executeBan(reportId);
    }

    function test_ban_seizes_staked_funds() public {
        uint256 aliceStakeBefore = staking.getStake(alice);
        assertEq(aliceStakeBefore, STAKE_AMOUNT);

        address[] memory subjects = new address[](1);
        subjects[0] = alice;
        _submitConfirmAndExecute(subjects);

        assertEq(staking.getStake(alice), 0);
        assertEq(sybilGuard.totalSeized(), STAKE_AMOUNT);
    }

    function test_ban_seizureGoesToEscrow() public {
        address[] memory subjects = new address[](1);
        subjects[0] = alice;
        _submitConfirmAndExecute(subjects);

        // Seized funds are in SybilGuard escrow, minus watcher+judge rewards
        // Watcher gets 10% of 10K = 1000. Judges get 100 LOB / 3 * 3 (integer division)
        uint256 watcherReward = 1000 ether;
        uint256 judgePool = 100 ether;
        uint256 judgeRewardTotal = (judgePool / 3) * 3;
        uint256 expectedEscrow = STAKE_AMOUNT - watcherReward - judgeRewardTotal;
        assertEq(sybilGuard.seizedInEscrow(alice), expectedEscrow);
        assertGt(sybilGuard.seizureEscrowExpiry(alice), block.timestamp);
    }

    function test_watcherGetsRewardOnExecute() public {
        address[] memory subjects = new address[](1);
        subjects[0] = alice;
        _submitConfirmAndExecute(subjects);

        // Watcher should have claimable reward (10% of seized = 10% of 10,000 = 1000 LOB)
        uint256 watcherReward = rewardDist.claimableBalance(watcher, address(lob));
        assertEq(watcherReward, 1000 ether);
    }

    function test_judgesGetFlatRewardOnExecute() public {
        address[] memory subjects = new address[](1);
        subjects[0] = alice;
        _submitConfirmAndExecute(subjects);

        // Each judge gets 100 LOB / 3 judges (integer division)
        uint256 totalJudgeReward = 100 ether;
        uint256 perJudge = totalJudgeReward / 3;
        uint256 judge1Reward = rewardDist.claimableBalance(judge1, address(lob));
        uint256 judge2Reward = rewardDist.claimableBalance(judge2, address(lob));
        uint256 judge3Reward = rewardDist.claimableBalance(judge3, address(lob));
        assertEq(judge1Reward, perJudge);
        assertEq(judge2Reward, perJudge);
        assertEq(judge3Reward, perJudge);
    }

    function test_double_confirm_reverts() public {
        address[] memory subjects = new address[](1);
        subjects[0] = alice;
        uint256 reportId = _submitReport(subjects);

        vm.prank(judge1);
        sybilGuard.confirmReport(reportId);

        vm.prank(judge1);
        vm.expectRevert("SybilGuard: already confirmed");
        sybilGuard.confirmReport(reportId);
    }

    function test_confirmReport_reverts_non_judge() public {
        address[] memory subjects = new address[](1);
        subjects[0] = alice;
        uint256 reportId = _submitReport(subjects);

        vm.prank(outsider);
        vm.expectRevert();
        sybilGuard.confirmReport(reportId);
    }

    /* ═══════════════════════════════════════════════════════════════
       REJECT REPORT TESTS (with bond slash)
       ═══════════════════════════════════════════════════════════════ */

    function test_rejectReport_slashesBond() public {
        address[] memory subjects = new address[](1);
        subjects[0] = alice;
        uint256 reportId = _submitReport(subjects);

        uint256 treasuryBalBefore = lob.balanceOf(treasuryGovernor);

        vm.prank(judge1);
        sybilGuard.rejectReport(reportId);

        // First rejection: still pending
        SybilGuard.SybilReport memory r = sybilGuard.getReport(reportId);
        assertEq(uint256(r.status), uint256(SybilGuard.ReportStatus.Pending));

        vm.prank(judge2);
        sybilGuard.rejectReport(reportId);

        // Second rejection: finalized, bond slashed
        r = sybilGuard.getReport(reportId);
        assertEq(uint256(r.status), uint256(SybilGuard.ReportStatus.Rejected));
        assertFalse(sybilGuard.isBanned(alice));

        // Bond sent to treasury
        assertEq(lob.balanceOf(treasuryGovernor), treasuryBalBefore + WATCHER_BOND);
        assertTrue(sybilGuard.reportBondReturned(reportId));

        // Watcher quality updated
        (uint256 submitted, uint256 confirmed, uint256 rejected) = sybilGuard.getWatcherStats(watcher);
        assertEq(submitted, 1);
        assertEq(confirmed, 0);
        assertEq(rejected, 1);
    }

    function test_rejectReport_reverts_non_judge() public {
        address[] memory subjects = new address[](1);
        subjects[0] = alice;
        uint256 reportId = _submitReport(subjects);

        vm.prank(outsider);
        vm.expectRevert();
        sybilGuard.rejectReport(reportId);
    }

    /* ═══════════════════════════════════════════════════════════════
       REPORT EXPIRY TESTS
       ═══════════════════════════════════════════════════════════════ */

    function test_report_expiry() public {
        address[] memory subjects = new address[](1);
        subjects[0] = alice;
        uint256 reportId = _submitReport(subjects);

        vm.prank(judge1);
        sybilGuard.confirmReport(reportId);

        vm.warp(block.timestamp + 3 days + 1);

        vm.prank(judge2);
        vm.expectRevert("SybilGuard: report expired");
        sybilGuard.confirmReport(reportId);

        assertTrue(sybilGuard.isReportExpired(reportId));
        assertFalse(sybilGuard.isBanned(alice));
    }

    /* ═══════════════════════════════════════════════════════════════
       UNBAN TESTS
       ═══════════════════════════════════════════════════════════════ */

    function test_unban_works() public {
        address[] memory subjects = new address[](1);
        subjects[0] = alice;
        _submitConfirmAndExecute(subjects);
        assertTrue(sybilGuard.isBanned(alice));

        vm.prank(appeals);
        sybilGuard.unban(alice);

        assertFalse(sybilGuard.isBanned(alice));

        SybilGuard.BanRecord memory record = sybilGuard.getBanRecord(alice);
        assertFalse(record.banned);
        assertTrue(record.unbannedAt > 0);
    }

    function test_unban_reverts_non_appeals() public {
        address[] memory subjects = new address[](1);
        subjects[0] = alice;
        _submitConfirmAndExecute(subjects);

        vm.prank(outsider);
        vm.expectRevert();
        sybilGuard.unban(alice);
    }

    function test_unban_reverts_not_banned() public {
        vm.prank(appeals);
        vm.expectRevert("SybilGuard: not banned");
        sybilGuard.unban(alice);
    }

    /* ═══════════════════════════════════════════════════════════════
       BAN CHECK TESTS
       ═══════════════════════════════════════════════════════════════ */

    function test_checkBanned_returns_correct() public {
        assertFalse(sybilGuard.checkBanned(alice));

        address[] memory subjects = new address[](1);
        subjects[0] = alice;
        _submitConfirmAndExecute(subjects);

        assertTrue(sybilGuard.checkBanned(alice));
        assertFalse(sybilGuard.checkBanned(bob));
    }

    function test_checkAnyBanned_works() public {
        address[] memory check = new address[](3);
        check[0] = alice;
        check[1] = bob;
        check[2] = charlie;

        assertFalse(sybilGuard.checkAnyBanned(check));

        address[] memory subjects = new address[](1);
        subjects[0] = bob;
        _submitConfirmAndExecute(subjects);

        assertTrue(sybilGuard.checkAnyBanned(check));
    }

    /* ═══════════════════════════════════════════════════════════════
       CLUSTER TESTS
       ═══════════════════════════════════════════════════════════════ */

    function test_sybil_cluster_bans_all_addresses() public {
        address[] memory cluster = new address[](3);
        cluster[0] = alice;
        cluster[1] = bob;
        cluster[2] = charlie;

        _submitConfirmAndExecute(cluster);

        assertTrue(sybilGuard.isBanned(alice));
        assertTrue(sybilGuard.isBanned(bob));
        assertTrue(sybilGuard.isBanned(charlie));
        assertEq(sybilGuard.totalBans(), 3);
        assertEq(sybilGuard.getBannedCount(), 3);
    }

    function test_linkedAccounts_set_for_clusters() public {
        address[] memory cluster = new address[](3);
        cluster[0] = alice;
        cluster[1] = bob;
        cluster[2] = charlie;

        _submitConfirmAndExecute(cluster);

        address[] memory aliceLinks = sybilGuard.getLinkedAccounts(alice);
        assertEq(aliceLinks.length, 3);
    }

    /* ═══════════════════════════════════════════════════════════════
       WATCHER STATS + QUALITY TESTS
       ═══════════════════════════════════════════════════════════════ */

    function test_watcherStats_tracked() public {
        // Use unstaked target (eve) so 2 judges suffice — but _submitAndConfirm uses 3
        address[] memory subjects = new address[](1);
        subjects[0] = alice;
        _submitAndConfirm(subjects); // Stats update on confirm (ban scheduled), not execute

        (uint256 submitted, uint256 confirmed, uint256 rejected) = sybilGuard.getWatcherStats(watcher);
        assertEq(submitted, 1);
        assertEq(confirmed, 1);
        assertEq(rejected, 0);
    }

    /* ═══════════════════════════════════════════════════════════════
       SCALED WATCHER BOND TESTS
       ═══════════════════════════════════════════════════════════════ */

    function test_scaledBond_scalesWithTargetStake() public {
        // Stake 100K LOB for alice → 5% = 5000 LOB bond
        vm.startPrank(alice);
        lob.approve(address(staking), 90_000 ether); // already has 10K staked
        staking.stake(90_000 ether);
        vm.stopPrank();
        assertEq(staking.getStake(alice), 100_000 ether);

        address[] memory subjects = new address[](1);
        subjects[0] = alice;

        uint256 watcherBalBefore = lob.balanceOf(watcher);
        uint256 reportId = _submitReport(subjects);

        // Bond should be 5% of 100K = 5000 LOB
        assertEq(sybilGuard.reportBondAmount(reportId), 5_000 ether);
        assertEq(watcherBalBefore - lob.balanceOf(watcher), 5_000 ether);
    }

    function test_scaledBond_minimum500Applies() public {
        // Eve has no stake → bond should be minimum 500
        address[] memory subjects = new address[](1);
        subjects[0] = eve; // eve is not staked

        uint256 watcherBalBefore = lob.balanceOf(watcher);
        uint256 reportId = _submitReport(subjects);

        assertEq(sybilGuard.reportBondAmount(reportId), 500 ether);
        assertEq(watcherBalBefore - lob.balanceOf(watcher), 500 ether);
    }

    function test_scaledBond_usesMaxStakeAcrossSubjects() public {
        // alice has 10K, bob has 10K, stake eve with 50K
        _stakeFor(eve, 50_000 ether);

        address[] memory subjects = new address[](2);
        subjects[0] = alice;
        subjects[1] = eve;

        uint256 reportId = _submitReport(subjects);

        // Bond = 5% of max(10K, 50K) = 5% of 50K = 2500 LOB
        assertEq(sybilGuard.reportBondAmount(reportId), 2_500 ether);
    }

    /* ═══════════════════════════════════════════════════════════════
       HIGH-STAKE JUDGE REQUIREMENT TESTS
       ═══════════════════════════════════════════════════════════════ */

    function test_highStake_2JudgesInsufficient() public {
        // Alice has 10K staked (= HIGH_STAKE_THRESHOLD) → needs 3 judges
        address[] memory subjects = new address[](1);
        subjects[0] = alice;

        uint256 reportId = _submitAndConfirm2(subjects); // only 2 judges

        // Ban NOT scheduled because 2 < 3 required
        assertEq(sybilGuard.reportBanScheduledAt(reportId), 0);
        SybilGuard.SybilReport memory r = sybilGuard.getReport(reportId);
        assertEq(uint256(r.status), uint256(SybilGuard.ReportStatus.Pending));
    }

    function test_highStake_3JudgesBans() public {
        // Alice has 10K staked (= HIGH_STAKE_THRESHOLD) → needs 3 judges
        address[] memory subjects = new address[](1);
        subjects[0] = alice;

        uint256 reportId = _submitReport(subjects);

        vm.prank(judge1);
        sybilGuard.confirmReport(reportId);
        vm.prank(judge2);
        sybilGuard.confirmReport(reportId);
        vm.prank(judge3);
        sybilGuard.confirmReport(reportId);

        // Ban should now be scheduled
        assertGt(sybilGuard.reportBanScheduledAt(reportId), 0);
        SybilGuard.SybilReport memory r = sybilGuard.getReport(reportId);
        assertEq(uint256(r.status), uint256(SybilGuard.ReportStatus.Confirmed));

        // Execute after delay
        vm.warp(block.timestamp + 48 hours);
        sybilGuard.executeBan(reportId);
        assertTrue(sybilGuard.isBanned(alice));
    }

    function test_lowStake_2JudgesSufficient() public {
        // Eve has no stake → only needs 2 judges
        address[] memory subjects = new address[](1);
        subjects[0] = eve;

        uint256 reportId = _submitAndConfirm2(subjects);

        // Ban should be scheduled with just 2 judges
        assertGt(sybilGuard.reportBanScheduledAt(reportId), 0);
    }

    /* ═══════════════════════════════════════════════════════════════
       CANCEL BAN TESTS
       ═══════════════════════════════════════════════════════════════ */

    function test_cancelBan_duringWindow() public {
        address[] memory subjects = new address[](1);
        subjects[0] = eve; // low stake, only needs 2 judges

        uint256 reportId = _submitAndConfirm2(subjects);
        assertGt(sybilGuard.reportBanScheduledAt(reportId), 0);

        // Cancel during 48hr window
        vm.prank(appeals);
        sybilGuard.cancelBan(reportId);

        // Cannot execute after cancel
        vm.warp(block.timestamp + 48 hours);
        vm.expectRevert("SybilGuard: ban already executed");
        sybilGuard.executeBan(reportId);

        // Not banned
        assertFalse(sybilGuard.isBanned(eve));
    }

    function test_cancelBan_slashesBondAndUpdatesStats() public {
        address[] memory subjects = new address[](1);
        subjects[0] = eve;

        uint256 reportId = _submitAndConfirm2(subjects);

        uint256 treasuryBalBefore = lob.balanceOf(treasuryGovernor);

        vm.prank(appeals);
        sybilGuard.cancelBan(reportId);

        // Bond slashed to treasury
        assertEq(lob.balanceOf(treasuryGovernor), treasuryBalBefore + WATCHER_BOND);
        assertTrue(sybilGuard.reportBondReturned(reportId));

        // Watcher rejected count incremented
        (, , uint256 rejected) = sybilGuard.getWatcherStats(watcher);
        assertEq(rejected, 1);
    }

    /* ═══════════════════════════════════════════════════════════════
       SEIZURE ESCROW TESTS
       ═══════════════════════════════════════════════════════════════ */

    function test_seizureEscrow_goesToEscrowNotTreasury() public {
        uint256 treasuryBalBefore = lob.balanceOf(treasuryGovernor);

        address[] memory subjects = new address[](1);
        subjects[0] = alice;
        _submitConfirmAndExecute(subjects);

        // Seized funds in escrow minus rewards already sent to RewardDistributor
        uint256 watcherReward = 1000 ether;
        uint256 judgePool = 100 ether;
        uint256 judgeRewardTotal = (judgePool / 3) * 3;
        uint256 expectedEscrow = STAKE_AMOUNT - watcherReward - judgeRewardTotal;
        assertEq(sybilGuard.seizedInEscrow(alice), expectedEscrow);
        // Treasury should NOT have received the seized stake
        assertEq(lob.balanceOf(treasuryGovernor), treasuryBalBefore);
    }

    function test_releaseEscrow_afterPeriodDistributes() public {
        address[] memory subjects = new address[](1);
        subjects[0] = alice;
        _submitConfirmAndExecute(subjects);

        uint256 treasuryBalBefore = lob.balanceOf(treasuryGovernor);
        uint256 escrowed = sybilGuard.seizedInEscrow(alice);
        // Escrow is reduced by rewards already sent to RewardDistributor
        uint256 watcherReward = 1000 ether;
        uint256 judgePool = 100 ether;
        uint256 judgeRewardTotal = (judgePool / 3) * 3;
        uint256 expectedEscrow = STAKE_AMOUNT - watcherReward - judgeRewardTotal;
        assertEq(escrowed, expectedEscrow);

        // Warp past 30-day escrow period
        vm.warp(block.timestamp + 30 days);
        sybilGuard.releaseEscrow(alice);

        // Remaining escrowed funds sent to treasury
        assertEq(lob.balanceOf(treasuryGovernor), treasuryBalBefore + expectedEscrow);
        assertEq(sybilGuard.seizedInEscrow(alice), 0);
    }

    function test_releaseEscrow_revertDuringEscrowPeriod() public {
        address[] memory subjects = new address[](1);
        subjects[0] = alice;
        _submitConfirmAndExecute(subjects);

        // Try to release before escrow period
        vm.warp(block.timestamp + 29 days);
        vm.expectRevert("SybilGuard: escrow period active");
        sybilGuard.releaseEscrow(alice);
    }

    function test_unbanDuringEscrow_returnsFunds() public {
        address[] memory subjects = new address[](1);
        subjects[0] = alice;
        _submitConfirmAndExecute(subjects);

        uint256 aliceBalBefore = lob.balanceOf(alice);
        uint256 escrowed = sybilGuard.seizedInEscrow(alice);

        // Unban during escrow period → funds returned
        vm.prank(appeals);
        sybilGuard.unban(alice);

        assertFalse(sybilGuard.isBanned(alice));
        assertEq(lob.balanceOf(alice), aliceBalBefore + escrowed);
        assertEq(sybilGuard.seizedInEscrow(alice), 0);
    }

    function test_unbanAfterEscrow_noRefund() public {
        address[] memory subjects = new address[](1);
        subjects[0] = alice;
        _submitConfirmAndExecute(subjects);

        // Warp past escrow period
        vm.warp(block.timestamp + 31 days);

        uint256 aliceBalBefore = lob.balanceOf(alice);

        // Unban after escrow expired → no refund (escrow still positive but expired)
        vm.prank(appeals);
        sybilGuard.unban(alice);

        assertFalse(sybilGuard.isBanned(alice));
        // Alice does NOT get escrowed funds back (expired)
        assertEq(lob.balanceOf(alice), aliceBalBefore);
    }

    // ═══════════════════════════════════════════════════════════════
    //  V-001: SAFEAPPROVE NON-ZERO REGRESSION
    // ═══════════════════════════════════════════════════════════════

    function test_secondExecuteBan_doesNotRevert() public {
        // First ban: alice
        address[] memory subjects1 = new address[](1);
        subjects1[0] = alice;
        _submitConfirmAndExecute(subjects1);
        assertTrue(sybilGuard.isBanned(alice));

        // Need cooldown between reports
        vm.warp(block.timestamp + 4 hours + 1);

        // Second ban: bob — this would revert before the fix because
        // safeApprove(nonzero) fails when residual allowance != 0
        address[] memory subjects2 = new address[](1);
        subjects2[0] = bob;
        uint256 reportId2 = _submitReport(subjects2);

        vm.prank(judge1);
        sybilGuard.confirmReport(reportId2);
        vm.prank(judge2);
        sybilGuard.confirmReport(reportId2);
        vm.prank(judge3);
        sybilGuard.confirmReport(reportId2);

        vm.warp(block.timestamp + 48 hours);
        sybilGuard.executeBan(reportId2); // would revert without zero-first fix

        assertTrue(sybilGuard.isBanned(bob));

        // Verify both watchers and judges got rewards for both bans
        uint256 watcherReward = rewardDist.claimableBalance(watcher, address(lob));
        assertEq(watcherReward, 2000 ether); // 10% of 10K * 2 bans
    }

    function test_doubleReleaseEscrow_reverts() public {
        address[] memory subjects = new address[](1);
        subjects[0] = alice;
        _submitConfirmAndExecute(subjects);

        vm.warp(block.timestamp + 30 days);
        sybilGuard.releaseEscrow(alice);

        vm.expectRevert("SybilGuard: no escrow");
        sybilGuard.releaseEscrow(alice);
    }
}
