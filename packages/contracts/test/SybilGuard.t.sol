// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/LOBToken.sol";
import "../src/StakingManager.sol";
import "../src/SybilGuard.sol";

contract SybilGuardTest is Test {
    LOBToken public lob;
    StakingManager public staking;
    SybilGuard public sybilGuard;

    address public admin = makeAddr("admin");
    address public distributor = makeAddr("distributor");
    address public treasuryGovernor = makeAddr("treasuryGovernor");

    address public watcher = makeAddr("watcher");
    address public judge1 = makeAddr("judge1");
    address public judge2 = makeAddr("judge2");
    address public appeals = makeAddr("appeals");

    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");
    address public charlie = makeAddr("charlie");
    address public eve = makeAddr("eve");
    address public outsider = makeAddr("outsider");

    uint256 public constant STAKE_AMOUNT = 10_000 ether;

    function setUp() public {
        // Deploy LOBToken
        vm.prank(distributor);
        lob = new LOBToken(distributor);

        // Deploy StakingManager
        vm.prank(admin);
        staking = new StakingManager(address(lob));

        // Deploy SybilGuard
        vm.prank(admin);
        sybilGuard = new SybilGuard(address(lob), address(staking), treasuryGovernor);

        // Grant roles on SybilGuard
        vm.startPrank(admin);
        sybilGuard.grantRole(sybilGuard.WATCHER_ROLE(), watcher);
        sybilGuard.grantRole(sybilGuard.JUDGE_ROLE(), judge1);
        sybilGuard.grantRole(sybilGuard.JUDGE_ROLE(), judge2);
        sybilGuard.grantRole(sybilGuard.APPEALS_ROLE(), appeals);
        vm.stopPrank();

        // Grant SLASHER_ROLE on StakingManager to SybilGuard
        // Cache the role hash to avoid the staticcall consuming the prank
        bytes32 slasherRole = staking.SLASHER_ROLE();
        vm.prank(admin);
        staking.grantRole(slasherRole, address(sybilGuard));

        // Fund users with LOB
        vm.startPrank(distributor);
        lob.transfer(alice, 100_000 ether);
        lob.transfer(bob, 100_000 ether);
        lob.transfer(charlie, 100_000 ether);
        lob.transfer(eve, 100_000 ether);
        vm.stopPrank();

        // Users stake LOB
        _stakeFor(alice, STAKE_AMOUNT);
        _stakeFor(bob, STAKE_AMOUNT);
        _stakeFor(charlie, STAKE_AMOUNT);
    }

    function _stakeFor(address user, uint256 amount) internal {
        vm.startPrank(user);
        lob.approve(address(staking), amount);
        staking.stake(amount);
        vm.stopPrank();
    }

    /* ═══════════════════════════════════════════════════════════════
       HELPER FUNCTIONS
       ═══════════════════════════════════════════════════════════════ */

    /// @dev Submit a standard sybil report for given subjects
    function _submitReport(address[] memory subjects) internal returns (uint256) {
        vm.prank(watcher);
        return sybilGuard.submitReport(
            subjects,
            SybilGuard.ViolationType.SybilCluster,
            "ipfs://evidence123",
            "Detected sybil cluster"
        );
    }

    /// @dev Submit and fully confirm (2 judges) a report to trigger auto-ban
    function _submitAndConfirm(address[] memory subjects) internal returns (uint256) {
        uint256 reportId = _submitReport(subjects);

        vm.prank(judge1);
        sybilGuard.confirmReport(reportId);

        vm.prank(judge2);
        sybilGuard.confirmReport(reportId);

        return reportId;
    }

    /* ═══════════════════════════════════════════════════════════════
       CONSTRUCTOR TESTS
       ═══════════════════════════════════════════════════════════════ */

    function test_constructor_sets_immutables() public view {
        assertEq(address(sybilGuard.lobToken()), address(lob));
        assertEq(address(sybilGuard.stakingManager()), address(staking));
        assertEq(sybilGuard.treasuryGovernor(), treasuryGovernor);
    }

    function test_constructor_reverts_zero_lobToken() public {
        vm.expectRevert("SybilGuard: zero lobToken");
        new SybilGuard(address(0), address(staking), treasuryGovernor);
    }

    function test_constructor_reverts_zero_staking() public {
        vm.expectRevert("SybilGuard: zero staking");
        new SybilGuard(address(lob), address(0), treasuryGovernor);
    }

    function test_constructor_reverts_zero_treasury() public {
        vm.expectRevert("SybilGuard: zero treasury");
        new SybilGuard(address(lob), address(staking), address(0));
    }

    /* ═══════════════════════════════════════════════════════════════
       SUBMIT REPORT TESTS
       ═══════════════════════════════════════════════════════════════ */

    function test_submitReport_works() public {
        address[] memory subjects = new address[](2);
        subjects[0] = alice;
        subjects[1] = bob;

        vm.prank(watcher);
        uint256 reportId = sybilGuard.submitReport(
            subjects,
            SybilGuard.ViolationType.SybilCluster,
            "ipfs://evidence",
            "Found linked accounts"
        );

        assertEq(reportId, 1);
        assertEq(sybilGuard.totalReports(), 1);

        SybilGuard.SybilReport memory r = sybilGuard.getReport(reportId);
        assertEq(r.id, 1);
        assertEq(r.reporter, watcher);
        assertEq(uint256(r.violation), uint256(SybilGuard.ViolationType.SybilCluster));
        assertEq(uint256(r.status), uint256(SybilGuard.ReportStatus.Pending));
        assertEq(r.confirmations, 0);

        address[] memory reportSubjects = sybilGuard.getReportSubjects(reportId);
        assertEq(reportSubjects.length, 2);
        assertEq(reportSubjects[0], alice);
        assertEq(reportSubjects[1], bob);
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

    function test_submitReport_reverts_too_many_subjects() public {
        address[] memory subjects = new address[](21);
        for (uint256 i = 0; i < 21; i++) {
            subjects[i] = address(uint160(1000 + i));
        }

        vm.prank(watcher);
        vm.expectRevert("SybilGuard: too many subjects");
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

    function test_submitReport_reverts_zero_address_subject() public {
        address[] memory subjects = new address[](2);
        subjects[0] = alice;
        subjects[1] = address(0);

        vm.prank(watcher);
        vm.expectRevert("SybilGuard: zero address subject");
        sybilGuard.submitReport(
            subjects,
            SybilGuard.ViolationType.SybilCluster,
            "ipfs://evidence",
            "notes"
        );
    }

    /* ═══════════════════════════════════════════════════════════════
       CONFIRM REPORT TESTS
       ═══════════════════════════════════════════════════════════════ */

    function test_confirmReport_works() public {
        address[] memory subjects = new address[](1);
        subjects[0] = alice;
        uint256 reportId = _submitReport(subjects);

        vm.prank(judge1);
        sybilGuard.confirmReport(reportId);

        SybilGuard.SybilReport memory r = sybilGuard.getReport(reportId);
        assertEq(r.confirmations, 1);
        assertEq(uint256(r.status), uint256(SybilGuard.ReportStatus.Pending));

        // Verify judge1 has confirmed
        assertTrue(sybilGuard.reportConfirmations(reportId, judge1));
    }

    function test_confirmReport_triggers_ban_on_threshold() public {
        address[] memory subjects = new address[](1);
        subjects[0] = alice;
        uint256 reportId = _submitReport(subjects);

        // First judge confirms
        vm.prank(judge1);
        sybilGuard.confirmReport(reportId);

        assertFalse(sybilGuard.isBanned(alice));

        // Second judge confirms -> triggers auto-ban
        vm.prank(judge2);
        sybilGuard.confirmReport(reportId);

        assertTrue(sybilGuard.isBanned(alice));

        SybilGuard.SybilReport memory r = sybilGuard.getReport(reportId);
        assertEq(uint256(r.status), uint256(SybilGuard.ReportStatus.Confirmed));
        assertEq(r.confirmations, 2);
    }

    function test_ban_seizes_staked_funds() public {
        uint256 aliceStakeBefore = staking.getStake(alice);
        assertEq(aliceStakeBefore, STAKE_AMOUNT);

        address[] memory subjects = new address[](1);
        subjects[0] = alice;
        _submitAndConfirm(subjects);

        // Alice's stake should be zeroed out
        assertEq(staking.getStake(alice), 0);

        // SybilGuard should track the seized amount
        assertEq(sybilGuard.totalSeized(), STAKE_AMOUNT);
    }

    function test_ban_sends_funds_to_treasury() public {
        uint256 treasuryBalBefore = lob.balanceOf(treasuryGovernor);

        address[] memory subjects = new address[](1);
        subjects[0] = alice;
        _submitAndConfirm(subjects);

        // Treasury should have received the slashed funds
        assertEq(lob.balanceOf(treasuryGovernor), treasuryBalBefore + STAKE_AMOUNT);
    }

    function test_already_banned_address_skipped() public {
        address[] memory subjects = new address[](1);
        subjects[0] = alice;

        // Ban alice first
        _submitAndConfirm(subjects);
        assertTrue(sybilGuard.isBanned(alice));
        uint256 totalBansAfterFirst = sybilGuard.totalBans();

        // Submit another report that includes alice
        address[] memory subjects2 = new address[](2);
        subjects2[0] = alice; // already banned
        subjects2[1] = bob;
        _submitAndConfirm(subjects2);

        // Alice should still be banned (skipped), bob should now be banned
        assertTrue(sybilGuard.isBanned(alice));
        assertTrue(sybilGuard.isBanned(bob));

        // totalBans should only have increased by 1 (for bob), not 2
        assertEq(sybilGuard.totalBans(), totalBansAfterFirst + 1);
    }

    function test_double_confirm_reverts() public {
        address[] memory subjects = new address[](1);
        subjects[0] = alice;
        uint256 reportId = _submitReport(subjects);

        vm.prank(judge1);
        sybilGuard.confirmReport(reportId);

        // judge1 tries to confirm again
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

    function test_confirmReport_reverts_nonexistent_report() public {
        vm.prank(judge1);
        vm.expectRevert("SybilGuard: report not found");
        sybilGuard.confirmReport(999);
    }

    function test_confirmReport_reverts_not_pending() public {
        address[] memory subjects = new address[](1);
        subjects[0] = alice;
        uint256 reportId = _submitReport(subjects);

        // Reject the report (needs 2 judges now)
        vm.prank(judge1);
        sybilGuard.rejectReport(reportId);
        vm.prank(judge2);
        sybilGuard.rejectReport(reportId);

        // Now try to confirm the rejected report
        // judge2 already rejected but confirmReport checks status == Pending first
        vm.prank(judge2);
        vm.expectRevert("SybilGuard: not pending");
        sybilGuard.confirmReport(reportId);
    }

    /* ═══════════════════════════════════════════════════════════════
       REJECT REPORT TESTS
       ═══════════════════════════════════════════════════════════════ */

    function test_rejectReport_works() public {
        address[] memory subjects = new address[](1);
        subjects[0] = alice;
        uint256 reportId = _submitReport(subjects);

        vm.prank(judge1);
        sybilGuard.rejectReport(reportId);

        // First rejection: status should still be Pending
        SybilGuard.SybilReport memory r = sybilGuard.getReport(reportId);
        assertEq(uint256(r.status), uint256(SybilGuard.ReportStatus.Pending));

        // Second judge rejects -> finalized
        vm.prank(judge2);
        sybilGuard.rejectReport(reportId);

        r = sybilGuard.getReport(reportId);
        assertEq(uint256(r.status), uint256(SybilGuard.ReportStatus.Rejected));

        // Alice should NOT be banned
        assertFalse(sybilGuard.isBanned(alice));
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

        // First judge confirms within expiry
        vm.prank(judge1);
        sybilGuard.confirmReport(reportId);

        // Warp past REPORT_EXPIRY (3 days)
        vm.warp(block.timestamp + 3 days + 1);

        // Second judge tries to confirm but report is expired
        vm.prank(judge2);
        vm.expectRevert("SybilGuard: report expired");
        sybilGuard.confirmReport(reportId);

        // Verify isReportExpired view
        assertTrue(sybilGuard.isReportExpired(reportId));

        // Alice should NOT be banned (threshold never reached)
        assertFalse(sybilGuard.isBanned(alice));
    }

    /* ═══════════════════════════════════════════════════════════════
       UNBAN TESTS
       ═══════════════════════════════════════════════════════════════ */

    function test_unban_works() public {
        // Ban alice
        address[] memory subjects = new address[](1);
        subjects[0] = alice;
        _submitAndConfirm(subjects);
        assertTrue(sybilGuard.isBanned(alice));

        // Appeals officer unbans alice
        vm.prank(appeals);
        sybilGuard.unban(alice);

        assertFalse(sybilGuard.isBanned(alice));

        SybilGuard.BanRecord memory record = sybilGuard.getBanRecord(alice);
        assertFalse(record.banned);
        assertTrue(record.unbannedAt > 0);
    }

    function test_unban_reverts_non_appeals() public {
        // Ban alice
        address[] memory subjects = new address[](1);
        subjects[0] = alice;
        _submitAndConfirm(subjects);

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
        _submitAndConfirm(subjects);

        assertTrue(sybilGuard.checkBanned(alice));
        assertFalse(sybilGuard.checkBanned(bob));
    }

    function test_checkAnyBanned_works() public {
        address[] memory check = new address[](3);
        check[0] = alice;
        check[1] = bob;
        check[2] = charlie;

        // None banned initially
        assertFalse(sybilGuard.checkAnyBanned(check));

        // Ban bob
        address[] memory subjects = new address[](1);
        subjects[0] = bob;
        _submitAndConfirm(subjects);

        // Now checkAnyBanned should return true
        assertTrue(sybilGuard.checkAnyBanned(check));
    }

    function test_checkAnyBanned_empty_array() public view {
        address[] memory empty = new address[](0);
        assertFalse(sybilGuard.checkAnyBanned(empty));
    }

    /* ═══════════════════════════════════════════════════════════════
       LINKED ACCOUNTS / CLUSTER TESTS
       ═══════════════════════════════════════════════════════════════ */

    function test_linkedAccounts_set_for_clusters() public {
        address[] memory cluster = new address[](3);
        cluster[0] = alice;
        cluster[1] = bob;
        cluster[2] = charlie;

        _submitAndConfirm(cluster);

        // Each address in the cluster should have linked accounts = the full cluster
        address[] memory aliceLinks = sybilGuard.getLinkedAccounts(alice);
        assertEq(aliceLinks.length, 3);
        assertEq(aliceLinks[0], alice);
        assertEq(aliceLinks[1], bob);
        assertEq(aliceLinks[2], charlie);

        address[] memory bobLinks = sybilGuard.getLinkedAccounts(bob);
        assertEq(bobLinks.length, 3);

        address[] memory charlieLinks = sybilGuard.getLinkedAccounts(charlie);
        assertEq(charlieLinks.length, 3);
    }

    function test_linkedAccounts_not_set_for_single_subject() public {
        address[] memory subjects = new address[](1);
        subjects[0] = alice;

        _submitAndConfirm(subjects);

        address[] memory links = sybilGuard.getLinkedAccounts(alice);
        assertEq(links.length, 0);
    }

    function test_sybil_cluster_bans_all_addresses() public {
        address[] memory cluster = new address[](3);
        cluster[0] = alice;
        cluster[1] = bob;
        cluster[2] = charlie;

        _submitAndConfirm(cluster);

        assertTrue(sybilGuard.isBanned(alice));
        assertTrue(sybilGuard.isBanned(bob));
        assertTrue(sybilGuard.isBanned(charlie));

        assertEq(sybilGuard.totalBans(), 3);
        assertEq(sybilGuard.getBannedCount(), 3);
    }

    function test_sybil_cluster_seizes_all_stakes() public {
        uint256 treasuryBalBefore = lob.balanceOf(treasuryGovernor);

        address[] memory cluster = new address[](3);
        cluster[0] = alice;
        cluster[1] = bob;
        cluster[2] = charlie;

        _submitAndConfirm(cluster);

        // All three stakes should be seized (3 * STAKE_AMOUNT)
        assertEq(staking.getStake(alice), 0);
        assertEq(staking.getStake(bob), 0);
        assertEq(staking.getStake(charlie), 0);

        assertEq(sybilGuard.totalSeized(), STAKE_AMOUNT * 3);
        assertEq(lob.balanceOf(treasuryGovernor), treasuryBalBefore + (STAKE_AMOUNT * 3));
    }

    /* ═══════════════════════════════════════════════════════════════
       SELF-DEALING TESTS
       ═══════════════════════════════════════════════════════════════ */

    function test_self_dealing_detection_and_ban() public {
        address[] memory subjects = new address[](2);
        subjects[0] = alice;
        subjects[1] = bob;

        vm.prank(watcher);
        uint256 reportId = sybilGuard.submitReport(
            subjects,
            SybilGuard.ViolationType.SelfDealing,
            "ipfs://self-dealing-evidence",
            "Alice and Bob are the same entity"
        );

        vm.prank(judge1);
        sybilGuard.confirmReport(reportId);

        vm.prank(judge2);
        sybilGuard.confirmReport(reportId);

        assertTrue(sybilGuard.isBanned(alice));
        assertTrue(sybilGuard.isBanned(bob));

        // Check ban records have SelfDealing reason
        SybilGuard.BanRecord memory aliceRecord = sybilGuard.getBanRecord(alice);
        assertEq(uint256(aliceRecord.reason), uint256(SybilGuard.ViolationType.SelfDealing));
        assertEq(aliceRecord.reportId, reportId);
    }

    /* ═══════════════════════════════════════════════════════════════
       BAN RECORD TESTS
       ═══════════════════════════════════════════════════════════════ */

    function test_getBanRecord_returns_data() public {
        address[] memory subjects = new address[](1);
        subjects[0] = alice;

        uint256 reportId = _submitAndConfirm(subjects);

        SybilGuard.BanRecord memory record = sybilGuard.getBanRecord(alice);
        assertTrue(record.banned);
        assertTrue(record.bannedAt > 0);
        assertEq(record.unbannedAt, 0);
        assertEq(uint256(record.reason), uint256(SybilGuard.ViolationType.SybilCluster));
        assertEq(record.reportId, reportId);
        assertEq(record.seizedAmount, STAKE_AMOUNT);
        assertEq(record.seizedToken, address(lob));
    }

    function test_getBanRecord_unbanned_user() public view {
        // Never-banned address should return a default (empty) record
        SybilGuard.BanRecord memory record = sybilGuard.getBanRecord(outsider);
        assertFalse(record.banned);
        assertEq(record.bannedAt, 0);
        assertEq(record.seizedAmount, 0);
    }

    /* ═══════════════════════════════════════════════════════════════
       SEIZED FUNDS TRACKING TESTS
       ═══════════════════════════════════════════════════════════════ */

    function test_seized_funds_tracking() public {
        assertEq(sybilGuard.totalSeized(), 0);

        // Ban alice (staked STAKE_AMOUNT)
        address[] memory subjects1 = new address[](1);
        subjects1[0] = alice;
        _submitAndConfirm(subjects1);

        assertEq(sybilGuard.totalSeized(), STAKE_AMOUNT);

        // Ban bob (staked STAKE_AMOUNT)
        address[] memory subjects2 = new address[](1);
        subjects2[0] = bob;
        _submitAndConfirm(subjects2);

        assertEq(sybilGuard.totalSeized(), STAKE_AMOUNT * 2);
    }

    function test_seized_funds_tracking_zero_stake() public {
        // Eve has no stake
        assertEq(staking.getStake(eve), 0);

        address[] memory subjects = new address[](1);
        subjects[0] = eve;
        _submitAndConfirm(subjects);

        // Should still be banned but seized amount = 0
        assertTrue(sybilGuard.isBanned(eve));
        SybilGuard.BanRecord memory record = sybilGuard.getBanRecord(eve);
        assertEq(record.seizedAmount, 0);
    }

    /* ═══════════════════════════════════════════════════════════════
       EDGE CASES AND INTEGRATION
       ═══════════════════════════════════════════════════════════════ */

    function test_multiple_reports_sequential_ids() public {
        address[] memory subjects = new address[](1);
        subjects[0] = alice;

        vm.prank(watcher);
        uint256 id1 = sybilGuard.submitReport(
            subjects,
            SybilGuard.ViolationType.SybilCluster,
            "ipfs://evidence1",
            "first"
        );

        subjects[0] = bob;
        vm.prank(watcher);
        uint256 id2 = sybilGuard.submitReport(
            subjects,
            SybilGuard.ViolationType.ReputationFarming,
            "ipfs://evidence2",
            "second"
        );

        assertEq(id1, 1);
        assertEq(id2, 2);
        assertEq(sybilGuard.totalReports(), 2);
    }

    function test_various_violation_types() public {
        SybilGuard.ViolationType[] memory types = new SybilGuard.ViolationType[](4);
        types[0] = SybilGuard.ViolationType.CoordinatedVoting;
        types[1] = SybilGuard.ViolationType.ReputationFarming;
        types[2] = SybilGuard.ViolationType.MultisigAbuse;
        types[3] = SybilGuard.ViolationType.StakeManipulation;

        address[] memory subjects = new address[](1);
        subjects[0] = alice;

        // All violation types should be submittable
        for (uint256 i = 0; i < types.length; i++) {
            vm.prank(watcher);
            uint256 rid = sybilGuard.submitReport(
                subjects,
                types[i],
                "ipfs://evidence",
                "test"
            );

            SybilGuard.SybilReport memory r = sybilGuard.getReport(rid);
            assertEq(uint256(r.violation), uint256(types[i]));

            // Reject so we can submit another one (needs 2 judges)
            vm.prank(judge1);
            sybilGuard.rejectReport(rid);
            vm.prank(judge2);
            sybilGuard.rejectReport(rid);
        }
    }

    function test_ban_and_unban_lifecycle() public {
        // 1. Alice is not banned
        assertFalse(sybilGuard.isBanned(alice));

        // 2. Report + confirm -> banned
        address[] memory subjects = new address[](1);
        subjects[0] = alice;
        _submitAndConfirm(subjects);
        assertTrue(sybilGuard.isBanned(alice));

        // 3. Appeal -> unbanned
        vm.prank(appeals);
        sybilGuard.unban(alice);
        assertFalse(sybilGuard.isBanned(alice));

        // 4. Can be reported and banned again
        // Alice restakes first
        _stakeFor(alice, 5_000 ether);

        address[] memory subjects2 = new address[](1);
        subjects2[0] = alice;
        _submitAndConfirm(subjects2);
        assertTrue(sybilGuard.isBanned(alice));
    }

    function test_report_confirmations_tracking() public {
        address[] memory subjects = new address[](1);
        subjects[0] = alice;
        uint256 reportId = _submitReport(subjects);

        assertFalse(sybilGuard.reportConfirmations(reportId, judge1));
        assertFalse(sybilGuard.reportConfirmations(reportId, judge2));

        vm.prank(judge1);
        sybilGuard.confirmReport(reportId);

        assertTrue(sybilGuard.reportConfirmations(reportId, judge1));
        assertFalse(sybilGuard.reportConfirmations(reportId, judge2));
    }

    function test_bannedAddresses_list_grows() public {
        assertEq(sybilGuard.getBannedCount(), 0);

        address[] memory subjects1 = new address[](1);
        subjects1[0] = alice;
        _submitAndConfirm(subjects1);
        assertEq(sybilGuard.getBannedCount(), 1);

        address[] memory subjects2 = new address[](2);
        subjects2[0] = bob;
        subjects2[1] = charlie;
        _submitAndConfirm(subjects2);
        assertEq(sybilGuard.getBannedCount(), 3);
    }
}
