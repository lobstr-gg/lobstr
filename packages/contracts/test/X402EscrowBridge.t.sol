// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/LOBToken.sol";
import "../src/StakingManager.sol";
import "../src/ReputationSystem.sol";
import "../src/ServiceRegistry.sol";
import "../src/DisputeArbitration.sol";
import "../src/EscrowEngine.sol";
import "../src/X402EscrowBridge.sol";

contract MockSybilGuard {
    function checkBanned(address) external pure returns (bool) { return false; }
    function checkAnyBanned(address[] calldata) external pure returns (bool) { return false; }
}

contract MockRewardDistributor {
    function creditArbitratorReward(address, address, uint256) external {}
    function deposit(address, uint256) external {}
    function availableBudget(address) external pure returns (uint256) { return type(uint256).max; }
}

/// @dev Mock ERC-20 that implements EIP-3009 transferWithAuthorization + receiveWithAuthorization.
///      Skips signature verification — just transfers tokens directly.
contract MockERC3009 is LOBToken {
    constructor(address _distributor) LOBToken(_distributor) {}

    function transferWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256, uint256, bytes32,
        uint8, bytes32, bytes32
    ) external {
        _transfer(from, to, value);
    }

    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256, uint256, bytes32,
        uint8, bytes32, bytes32
    ) external {
        require(msg.sender == to, "MockERC3009: caller must be to");
        _transfer(from, to, value);
    }
}

contract X402EscrowBridgeTest is Test {
    // Re-declare events for vm.expectEmit
    event EscrowedJobCreated(bytes32 indexed x402Nonce, uint256 indexed jobId, address indexed payer, address seller, uint256 amount, address token);
    event DeliveryConfirmedByPayer(uint256 indexed jobId, address indexed payer);
    event DisputeInitiatedByPayer(uint256 indexed jobId, address indexed payer);
    event EscrowRefundClaimed(uint256 indexed jobId, address indexed payer, uint256 amount);
    event RefundRegistered(uint256 indexed jobId, uint256 amount);
    event TokenAllowlistUpdated(address indexed token, bool allowed);

    LOBToken public token;
    StakingManager public staking;
    ReputationSystem public reputation;
    ServiceRegistry public registry;
    DisputeArbitration public dispute;
    EscrowEngine public escrow;
    X402EscrowBridge public bridge;
    MockSybilGuard public mockSybilGuard;
    MockRewardDistributor public mockRewardDist;

    address public admin = makeAddr("admin");
    address public distributor = makeAddr("distributor");
    address public treasury = makeAddr("treasury");
    address public facilitator = makeAddr("facilitator");
    address public seller = makeAddr("seller");
    address public arb1 = makeAddr("arb1");
    address public arb2 = makeAddr("arb2");
    address public arb3 = makeAddr("arb3");
    address public random = makeAddr("random");

    // EIP-712 signing key pair — payer address derived from private key
    uint256 public payerPk = 0xA11CE;
    address public payer;

    uint256 public listingId;
    bytes32 public constant NONCE_1 = keccak256("payment-1");
    bytes32 public constant NONCE_2 = keccak256("payment-2");
    bytes32 public constant NONCE_3 = keccak256("payment-3");

    // EIP-712 constants for PaymentIntent signing
    bytes32 private constant PAYMENT_INTENT_TYPEHASH = keccak256(
        "PaymentIntent(bytes32 x402Nonce,address token,uint256 amount,uint256 listingId,address seller,uint256 deadline)"
    );

    function setUp() public {
        payer = vm.addr(payerPk);

        vm.startPrank(admin);

        // Deploy protocol stack
        token = new LOBToken(distributor);
        reputation = new ReputationSystem();
        staking = new StakingManager(address(token));
        mockSybilGuard = new MockSybilGuard();
        mockRewardDist = new MockRewardDistributor();
        registry = new ServiceRegistry(address(staking), address(reputation), address(mockSybilGuard));
        dispute = new DisputeArbitration(address(token), address(staking), address(reputation), address(mockSybilGuard), address(mockRewardDist));
        escrow = new EscrowEngine(
            address(token),
            address(registry),
            address(staking),
            address(dispute),
            address(reputation),
            treasury,
            address(mockSybilGuard)
        );

        // Deploy bridge
        bridge = new X402EscrowBridge(address(escrow), address(dispute));
        bridge.grantRole(bridge.FACILITATOR_ROLE(), facilitator);
        bridge.setTokenAllowed(address(token), true);

        // Grant protocol roles
        reputation.grantRole(reputation.RECORDER_ROLE(), address(escrow));
        reputation.grantRole(reputation.RECORDER_ROLE(), address(dispute));
        staking.grantRole(staking.SLASHER_ROLE(), address(dispute));
        dispute.grantRole(dispute.ESCROW_ROLE(), address(escrow));
        dispute.setEscrowEngine(address(escrow));
        vm.stopPrank();

        // Fund participants
        vm.startPrank(distributor);
        token.transfer(payer, 100_000 ether);
        token.transfer(seller, 100_000 ether);
        token.transfer(arb1, 100_000 ether);
        token.transfer(arb2, 100_000 ether);
        token.transfer(arb3, 100_000 ether);
        vm.stopPrank();

        // Seller stakes to meet registry requirements
        vm.startPrank(seller);
        token.approve(address(staking), 1_000 ether);
        staking.stake(1_000 ether);
        vm.stopPrank();

        // Seller creates listing
        vm.prank(seller);
        listingId = registry.createListing(
            IServiceRegistry.ServiceCategory.DATA_SCRAPING,
            "Scraping Service",
            "I scrape stuff",
            50 ether,
            address(token),
            3600,
            ""
        );

        // Register arbitrators
        _stakeArbitrator(arb1, 100_000 ether);
        _stakeArbitrator(arb2, 100_000 ether);
        _stakeArbitrator(arb3, 100_000 ether);
    }

    function _stakeArbitrator(address arb, uint256 amount) internal {
        vm.startPrank(arb);
        token.approve(address(dispute), amount);
        dispute.stakeAsArbitrator(amount);
        vm.stopPrank();
    }

    // ─── EIP-712 Helpers ────────────────────────────────────────────────────

    function _domainSeparator() internal view returns (bytes32) {
        return keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256("X402EscrowBridge"),
            keccak256("1"),
            block.chainid,
            address(bridge)
        ));
    }

    function _signPaymentIntent(
        bytes32 x402Nonce,
        address _token,
        uint256 amount,
        uint256 _listingId,
        address _seller,
        uint256 deadline
    ) internal view returns (uint8 v, bytes32 r, bytes32 s) {
        bytes32 structHash = keccak256(abi.encode(
            PAYMENT_INTENT_TYPEHASH, x402Nonce, _token, amount, _listingId, _seller, deadline
        ));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), structHash));
        (v, r, s) = vm.sign(payerPk, digest);
    }

    /// Helper: signed deposit + escrow creation (primary path for all tests)
    function _depositAndCreateJob(bytes32 nonce, uint256 amount) internal returns (uint256 jobId) {
        vm.prank(payer);
        token.approve(address(bridge), amount);

        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _signPaymentIntent(
            nonce, address(token), amount, listingId, seller, deadline
        );

        X402EscrowBridge.PaymentIntent memory intent = X402EscrowBridge.PaymentIntent({
            x402Nonce: nonce,
            payer: payer,
            token: address(token),
            amount: amount,
            listingId: listingId,
            seller: seller,
            deadline: deadline
        });

        vm.prank(facilitator);
        jobId = bridge.depositAndCreateJob(intent, v, r, s);
    }

    // ─── Dispute Helpers ────────────────────────────────────────────────────

    function _disputeAndResolveBuyerWins(uint256 jobId) internal {
        vm.prank(seller);
        escrow.submitDelivery(jobId, "ipfs://delivery");

        vm.prank(payer);
        bridge.initiateDispute(jobId, "ipfs://evidence");

        uint256 disputeId = escrow.getJobDisputeId(jobId);

        vm.roll(block.number + 11);
        dispute.sealPanel(disputeId);

        vm.warp(block.timestamp + 25 hours);
        dispute.advanceToVoting(disputeId);

        vm.prank(arb1);
        dispute.vote(disputeId, true);
        vm.prank(arb2);
        dispute.vote(disputeId, true);
        vm.prank(arb3);
        dispute.vote(disputeId, true);

        vm.prank(arb1);
        dispute.executeRuling(disputeId);

        // Finalize after appeal window
        vm.warp(block.timestamp + 49 hours);
        dispute.finalizeRuling(disputeId);
    }

    function _disputeAndResolveSellerWins(uint256 jobId) internal {
        vm.prank(seller);
        escrow.submitDelivery(jobId, "ipfs://delivery");

        vm.prank(payer);
        bridge.initiateDispute(jobId, "ipfs://evidence");

        uint256 disputeId = escrow.getJobDisputeId(jobId);

        vm.roll(block.number + 11);
        dispute.sealPanel(disputeId);

        vm.warp(block.timestamp + 25 hours);
        dispute.advanceToVoting(disputeId);

        vm.prank(arb1);
        dispute.vote(disputeId, false);
        vm.prank(arb2);
        dispute.vote(disputeId, false);
        vm.prank(arb3);
        dispute.vote(disputeId, false);

        vm.prank(arb1);
        dispute.executeRuling(disputeId);

        // Finalize after appeal window
        vm.warp(block.timestamp + 49 hours);
        dispute.finalizeRuling(disputeId);
    }

    function _disputeAndResolveDraw(uint256 jobId) internal {
        vm.prank(seller);
        escrow.submitDelivery(jobId, "ipfs://delivery");

        vm.prank(payer);
        bridge.initiateDispute(jobId, "ipfs://evidence");

        uint256 disputeId = escrow.getJobDisputeId(jobId);

        vm.roll(block.number + 11);
        dispute.sealPanel(disputeId);

        vm.warp(block.timestamp + 25 hours);
        dispute.advanceToVoting(disputeId);

        vm.prank(arb1);
        dispute.vote(disputeId, true);
        vm.prank(arb2);
        dispute.vote(disputeId, false);

        vm.warp(block.timestamp + 4 days);
        vm.prank(arb1);
        dispute.executeRuling(disputeId);

        // Finalize after appeal window
        vm.warp(block.timestamp + 49 hours);
        dispute.finalizeRuling(disputeId);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ─── depositAndCreateJob (EIP-712 signed) ───────────────────────────────
    // ═══════════════════════════════════════════════════════════════════════════

    function test_DepositAndCreateJob() public {
        uint256 payerBalBefore = token.balanceOf(payer);

        uint256 jobId = _depositAndCreateJob(NONCE_1, 50 ether);

        assertEq(jobId, 1);
        assertTrue(bridge.nonceUsed(NONCE_1));
        assertEq(bridge.paymentToJob(NONCE_1), 1);
        assertEq(bridge.jobPayer(jobId), payer);
        assertEq(bridge.jobToken(jobId), address(token));
        assertEq(bridge.jobEscrowReserve(jobId), 50 ether);
        assertEq(bridge.totalEscrowReserves(address(token)), 50 ether);
        assertEq(payerBalBefore - token.balanceOf(payer), 50 ether);

        IEscrowEngine.Job memory job = escrow.getJob(jobId);
        assertEq(job.buyer, address(bridge));
        assertEq(job.seller, seller);
        assertEq(job.amount, 50 ether);
    }

    function test_DepositAndCreateJob_MultipleJobs() public {
        uint256 jobId1 = _depositAndCreateJob(NONCE_1, 50 ether);
        uint256 jobId2 = _depositAndCreateJob(NONCE_2, 30 ether);

        assertEq(jobId1, 1);
        assertEq(jobId2, 2);
        assertEq(bridge.totalEscrowReserves(address(token)), 80 ether);
    }

    function test_DepositAndCreateJob_RevertBadSignature() public {
        vm.prank(payer);
        token.approve(address(bridge), 50 ether);

        uint256 deadline = block.timestamp + 1 hours;

        // Sign with wrong seller
        (uint8 v, bytes32 r, bytes32 s) = _signPaymentIntent(
            NONCE_1, address(token), 50 ether, listingId, random, deadline
        );

        X402EscrowBridge.PaymentIntent memory intent = X402EscrowBridge.PaymentIntent({
            x402Nonce: NONCE_1,
            payer: payer,
            token: address(token),
            amount: 50 ether,
            listingId: listingId,
            seller: seller, // mismatch with signature
            deadline: deadline
        });

        vm.prank(facilitator);
        vm.expectRevert("Bridge: invalid payer signature");
        bridge.depositAndCreateJob(intent, v, r, s);
    }

    function test_DepositAndCreateJob_RevertDeadlineExpired() public {
        vm.prank(payer);
        token.approve(address(bridge), 50 ether);

        uint256 deadline = block.timestamp - 1;
        (uint8 v, bytes32 r, bytes32 s) = _signPaymentIntent(
            NONCE_1, address(token), 50 ether, listingId, seller, deadline
        );

        X402EscrowBridge.PaymentIntent memory intent = X402EscrowBridge.PaymentIntent({
            x402Nonce: NONCE_1,
            payer: payer,
            token: address(token),
            amount: 50 ether,
            listingId: listingId,
            seller: seller,
            deadline: deadline
        });

        vm.prank(facilitator);
        vm.expectRevert("Bridge: deadline expired");
        bridge.depositAndCreateJob(intent, v, r, s);
    }

    function test_DepositAndCreateJob_RevertFacilitatorCantFakeAmount() public {
        vm.prank(payer);
        token.approve(address(bridge), 100 ether);

        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _signPaymentIntent(
            NONCE_1, address(token), 50 ether, listingId, seller, deadline
        );

        // Facilitator inflates amount
        X402EscrowBridge.PaymentIntent memory intent = X402EscrowBridge.PaymentIntent({
            x402Nonce: NONCE_1,
            payer: payer,
            token: address(token),
            amount: 100 ether,
            listingId: listingId,
            seller: seller,
            deadline: deadline
        });

        vm.prank(facilitator);
        vm.expectRevert("Bridge: invalid payer signature");
        bridge.depositAndCreateJob(intent, v, r, s);
    }

    function test_DepositAndCreateJob_RevertFacilitatorCantChangeSeller() public {
        vm.prank(payer);
        token.approve(address(bridge), 50 ether);

        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _signPaymentIntent(
            NONCE_1, address(token), 50 ether, listingId, seller, deadline
        );

        X402EscrowBridge.PaymentIntent memory intent = X402EscrowBridge.PaymentIntent({
            x402Nonce: NONCE_1,
            payer: payer,
            token: address(token),
            amount: 50 ether,
            listingId: listingId,
            seller: random, // attacker address
            deadline: deadline
        });

        vm.prank(facilitator);
        vm.expectRevert("Bridge: invalid payer signature");
        bridge.depositAndCreateJob(intent, v, r, s);
    }

    function test_DepositAndCreateJob_RevertNotFacilitator() public {
        vm.prank(payer);
        token.approve(address(bridge), 50 ether);

        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _signPaymentIntent(
            NONCE_1, address(token), 50 ether, listingId, seller, deadline
        );

        X402EscrowBridge.PaymentIntent memory intent = X402EscrowBridge.PaymentIntent({
            x402Nonce: NONCE_1,
            payer: payer,
            token: address(token),
            amount: 50 ether,
            listingId: listingId,
            seller: seller,
            deadline: deadline
        });

        vm.prank(random);
        vm.expectRevert();
        bridge.depositAndCreateJob(intent, v, r, s);
    }

    function test_DepositAndCreateJob_RevertTokenNotAllowed() public {
        vm.prank(admin);
        bridge.setTokenAllowed(address(token), false);

        vm.prank(payer);
        token.approve(address(bridge), 50 ether);

        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _signPaymentIntent(
            NONCE_1, address(token), 50 ether, listingId, seller, deadline
        );

        X402EscrowBridge.PaymentIntent memory intent = X402EscrowBridge.PaymentIntent({
            x402Nonce: NONCE_1, payer: payer, token: address(token),
            amount: 50 ether, listingId: listingId, seller: seller, deadline: deadline
        });

        vm.prank(facilitator);
        vm.expectRevert("Bridge: token not allowed");
        bridge.depositAndCreateJob(intent, v, r, s);
    }

    function test_DepositAndCreateJob_RevertDuplicateNonce() public {
        _depositAndCreateJob(NONCE_1, 50 ether);

        vm.prank(payer);
        token.approve(address(bridge), 50 ether);

        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _signPaymentIntent(
            NONCE_1, address(token), 50 ether, listingId, seller, deadline
        );

        X402EscrowBridge.PaymentIntent memory intent = X402EscrowBridge.PaymentIntent({
            x402Nonce: NONCE_1, payer: payer, token: address(token),
            amount: 50 ether, listingId: listingId, seller: seller, deadline: deadline
        });

        vm.prank(facilitator);
        vm.expectRevert("Bridge: nonce already used");
        bridge.depositAndCreateJob(intent, v, r, s);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ─── depositWithAuthorization (EIP-3009 path) ───────────────────────────
    // ═══════════════════════════════════════════════════════════════════════════

    function test_DepositWithAuthorization() public {
        vm.startPrank(admin);
        MockERC3009 erc3009 = new MockERC3009(admin);
        bridge.setTokenAllowed(address(erc3009), true);
        escrow.allowlistToken(address(erc3009)); // V-002: EscrowEngine also needs allowlist
        vm.stopPrank();

        // Create a listing that accepts ERC3009 token
        vm.prank(seller);
        uint256 erc3009ListingId = registry.createListing(
            IServiceRegistry.ServiceCategory.DATA_SCRAPING,
            "ERC3009 Service", "desc", 50 ether, address(erc3009), 3600, ""
        );

        vm.prank(admin);
        erc3009.transfer(payer, 100 ether);

        uint256 payerBalBefore = erc3009.balanceOf(payer);
        uint256 deadline = block.timestamp + 1 hours;

        X402EscrowBridge.ERC3009Auth memory auth = X402EscrowBridge.ERC3009Auth({
            from: payer,
            token: address(erc3009),
            amount: 50 ether,
            validAfter: 0,
            validBefore: type(uint256).max,
            eip3009Nonce: bytes32(uint256(1))
        });

        // Payer signs the PaymentIntent binding escrow routing params
        (uint8 iv, bytes32 ir, bytes32 is_) = _signPaymentIntent(
            NONCE_1, address(erc3009), 50 ether, erc3009ListingId, seller, deadline
        );
        X402EscrowBridge.PaymentIntent memory intent = X402EscrowBridge.PaymentIntent({
            x402Nonce: NONCE_1, payer: payer, token: address(erc3009),
            amount: 50 ether, listingId: erc3009ListingId, seller: seller, deadline: deadline
        });

        vm.prank(facilitator);
        uint256 jobId = bridge.depositWithAuthorization(
            auth, 0, bytes32(0), bytes32(0),
            intent, iv, ir, is_
        );

        assertEq(payerBalBefore - erc3009.balanceOf(payer), 50 ether);
        assertEq(bridge.jobPayer(jobId), payer);
        assertEq(bridge.jobToken(jobId), address(erc3009));
        assertEq(bridge.totalEscrowReserves(address(erc3009)), 50 ether);
    }

    function test_DepositWithAuthorization_RevertTokenNotAllowed() public {
        vm.prank(admin);
        MockERC3009 erc3009 = new MockERC3009(admin);
        // NOT allowlisted

        uint256 deadline = block.timestamp + 1 hours;

        X402EscrowBridge.ERC3009Auth memory auth = X402EscrowBridge.ERC3009Auth({
            from: payer, token: address(erc3009),
            amount: 50 ether, validAfter: 0, validBefore: type(uint256).max,
            eip3009Nonce: bytes32(uint256(1))
        });

        (uint8 iv, bytes32 ir, bytes32 is_) = _signPaymentIntent(
            NONCE_1, address(erc3009), 50 ether, 1, seller, deadline
        );
        X402EscrowBridge.PaymentIntent memory intent = X402EscrowBridge.PaymentIntent({
            x402Nonce: NONCE_1, payer: payer, token: address(erc3009),
            amount: 50 ether, listingId: 1, seller: seller, deadline: deadline
        });

        vm.prank(facilitator);
        vm.expectRevert("Bridge: token not allowed");
        bridge.depositWithAuthorization(
            auth, 0, bytes32(0), bytes32(0),
            intent, iv, ir, is_
        );
    }

    function test_DepositWithAuthorization_RevertNotFacilitator() public {
        uint256 deadline = block.timestamp + 1 hours;

        X402EscrowBridge.ERC3009Auth memory auth = X402EscrowBridge.ERC3009Auth({
            from: payer, token: address(token),
            amount: 50 ether, validAfter: 0, validBefore: type(uint256).max,
            eip3009Nonce: bytes32(uint256(1))
        });

        (uint8 iv, bytes32 ir, bytes32 is_) = _signPaymentIntent(
            NONCE_1, address(token), 50 ether, listingId, seller, deadline
        );
        X402EscrowBridge.PaymentIntent memory intent = X402EscrowBridge.PaymentIntent({
            x402Nonce: NONCE_1, payer: payer, token: address(token),
            amount: 50 ether, listingId: listingId, seller: seller, deadline: deadline
        });

        vm.prank(random);
        vm.expectRevert();
        bridge.depositWithAuthorization(
            auth, 0, bytes32(0), bytes32(0),
            intent, iv, ir, is_
        );
    }

    function test_DepositWithAuthorization_RevertPayerMismatch() public {
        vm.startPrank(admin);
        MockERC3009 erc3009 = new MockERC3009(admin);
        bridge.setTokenAllowed(address(erc3009), true);
        erc3009.transfer(payer, 100 ether);
        vm.stopPrank();

        uint256 deadline = block.timestamp + 1 hours;

        // EIP-3009 auth from payer
        X402EscrowBridge.ERC3009Auth memory auth = X402EscrowBridge.ERC3009Auth({
            from: payer, token: address(erc3009),
            amount: 50 ether, validAfter: 0, validBefore: type(uint256).max,
            eip3009Nonce: bytes32(uint256(1))
        });

        // Intent claims random as payer — cross-validation should catch this
        (uint8 iv, bytes32 ir, bytes32 is_) = _signPaymentIntent(
            NONCE_1, address(erc3009), 50 ether, listingId, seller, deadline
        );
        X402EscrowBridge.PaymentIntent memory intent = X402EscrowBridge.PaymentIntent({
            x402Nonce: NONCE_1, payer: random,  // mismatch with auth.from
            token: address(erc3009),
            amount: 50 ether, listingId: listingId, seller: seller, deadline: deadline
        });

        vm.prank(facilitator);
        vm.expectRevert("Bridge: payer mismatch");
        bridge.depositWithAuthorization(
            auth, 0, bytes32(0), bytes32(0),
            intent, iv, ir, is_
        );
    }

    function test_DepositWithAuthorization_RevertRoutingTamper() public {
        vm.startPrank(admin);
        MockERC3009 erc3009 = new MockERC3009(admin);
        bridge.setTokenAllowed(address(erc3009), true);
        erc3009.transfer(payer, 100 ether);
        vm.stopPrank();

        vm.prank(seller);
        uint256 erc3009ListingId = registry.createListing(
            IServiceRegistry.ServiceCategory.DATA_SCRAPING,
            "ERC3009 Service", "desc", 50 ether, address(erc3009), 3600, ""
        );

        uint256 deadline = block.timestamp + 1 hours;

        X402EscrowBridge.ERC3009Auth memory auth = X402EscrowBridge.ERC3009Auth({
            from: payer, token: address(erc3009),
            amount: 50 ether, validAfter: 0, validBefore: type(uint256).max,
            eip3009Nonce: bytes32(uint256(1))
        });

        // Payer signs intent with legit seller
        (uint8 iv, bytes32 ir, bytes32 is_) = _signPaymentIntent(
            NONCE_1, address(erc3009), 50 ether, erc3009ListingId, seller, deadline
        );

        // Facilitator tampers: changes seller to attacker
        X402EscrowBridge.PaymentIntent memory intent = X402EscrowBridge.PaymentIntent({
            x402Nonce: NONCE_1, payer: payer, token: address(erc3009),
            amount: 50 ether, listingId: erc3009ListingId,
            seller: random,  // attacker-controlled seller
            deadline: deadline
        });

        vm.prank(facilitator);
        vm.expectRevert("Bridge: invalid payer signature");
        bridge.depositWithAuthorization(
            auth, 0, bytes32(0), bytes32(0),
            intent, iv, ir, is_
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ─── confirmDelivery ────────────────────────────────────────────────────
    // ═══════════════════════════════════════════════════════════════════════════

    function test_ConfirmDelivery() public {
        uint256 jobId = _depositAndCreateJob(NONCE_1, 50 ether);

        vm.prank(seller);
        escrow.submitDelivery(jobId, "ipfs://delivery");

        vm.prank(payer);
        vm.expectEmit(true, true, false, false);
        emit DeliveryConfirmedByPayer(jobId, payer);
        bridge.confirmDelivery(jobId);

        IEscrowEngine.Job memory job = escrow.getJob(jobId);
        assertEq(uint8(job.status), uint8(IEscrowEngine.JobStatus.Confirmed));
    }

    function test_ConfirmDelivery_RevertNotPayer() public {
        uint256 jobId = _depositAndCreateJob(NONCE_1, 50 ether);

        vm.prank(seller);
        escrow.submitDelivery(jobId, "ipfs://delivery");

        vm.prank(random);
        vm.expectRevert("Bridge: not payer");
        bridge.confirmDelivery(jobId);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ─── initiateDispute ────────────────────────────────────────────────────
    // ═══════════════════════════════════════════════════════════════════════════

    function test_InitiateDispute() public {
        uint256 jobId = _depositAndCreateJob(NONCE_1, 50 ether);

        vm.prank(seller);
        escrow.submitDelivery(jobId, "ipfs://delivery");

        vm.prank(payer);
        vm.expectEmit(true, true, false, false);
        emit DisputeInitiatedByPayer(jobId, payer);
        bridge.initiateDispute(jobId, "ipfs://evidence");

        IEscrowEngine.Job memory job = escrow.getJob(jobId);
        assertEq(uint8(job.status), uint8(IEscrowEngine.JobStatus.Disputed));
    }

    function test_InitiateDispute_RevertNotPayer() public {
        uint256 jobId = _depositAndCreateJob(NONCE_1, 50 ether);

        vm.prank(seller);
        escrow.submitDelivery(jobId, "ipfs://delivery");

        vm.prank(random);
        vm.expectRevert("Bridge: not payer");
        bridge.initiateDispute(jobId, "ipfs://evidence");
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ─── registerRefund ─────────────────────────────────────────────────────
    // ═══════════════════════════════════════════════════════════════════════════

    function test_RegisterRefund() public {
        uint256 jobId = _depositAndCreateJob(NONCE_1, 50 ether);
        _disputeAndResolveBuyerWins(jobId);

        vm.prank(facilitator);
        vm.expectEmit(true, false, false, true);
        emit RefundRegistered(jobId, 50 ether);
        bridge.registerRefund(jobId, 50 ether);

        assertEq(bridge.jobRefundCredit(jobId), 50 ether);
        assertEq(bridge.totalLiabilities(address(token)), 50 ether);
    }

    function test_RegisterRefund_RevertAmountMismatch() public {
        uint256 jobId = _depositAndCreateJob(NONCE_1, 50 ether);
        _disputeAndResolveBuyerWins(jobId);

        vm.prank(facilitator);
        vm.expectRevert("Bridge: amount != on-chain refund");
        bridge.registerRefund(jobId, 51 ether);
    }

    function test_RegisterRefund_RevertDuplicate() public {
        uint256 jobId = _depositAndCreateJob(NONCE_1, 50 ether);
        _disputeAndResolveBuyerWins(jobId);

        vm.prank(facilitator);
        bridge.registerRefund(jobId, 50 ether);

        vm.prank(facilitator);
        vm.expectRevert("Bridge: refund already registered");
        bridge.registerRefund(jobId, 50 ether);
    }

    function test_RegisterRefund_RevertNotResolved() public {
        uint256 jobId = _depositAndCreateJob(NONCE_1, 50 ether);

        vm.prank(facilitator);
        vm.expectRevert("Bridge: job not resolved");
        bridge.registerRefund(jobId, 50 ether);
    }

    function test_RegisterRefund_RevertUnknownJob() public {
        vm.prank(facilitator);
        vm.expectRevert("Bridge: unknown job");
        bridge.registerRefund(999, 50 ether);
    }

    function test_RegisterRefund_RevertZeroAmount() public {
        uint256 jobId = _depositAndCreateJob(NONCE_1, 50 ether);
        _disputeAndResolveBuyerWins(jobId);

        vm.prank(facilitator);
        vm.expectRevert("Bridge: zero refund");
        bridge.registerRefund(jobId, 0);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ─── claimEscrowRefund ──────────────────────────────────────────────────
    // ═══════════════════════════════════════════════════════════════════════════

    function test_ClaimEscrowRefund_WithRegisteredCredit() public {
        uint256 jobId = _depositAndCreateJob(NONCE_1, 50 ether);
        _disputeAndResolveBuyerWins(jobId);

        vm.prank(facilitator);
        bridge.registerRefund(jobId, 50 ether);

        uint256 payerBalBefore = token.balanceOf(payer);
        vm.prank(payer);
        bridge.claimEscrowRefund(jobId);

        assertEq(token.balanceOf(payer) - payerBalBefore, 50 ether);
        assertTrue(bridge.refundClaimed(jobId));
        assertEq(bridge.totalLiabilities(address(token)), 0);
    }

    function test_ClaimEscrowRefund_Permissionless_BuyerWins() public {
        uint256 jobId = _depositAndCreateJob(NONCE_1, 50 ether);
        _disputeAndResolveBuyerWins(jobId);

        uint256 payerBalBefore = token.balanceOf(payer);
        vm.prank(payer);
        bridge.claimEscrowRefund(jobId);

        assertEq(token.balanceOf(payer) - payerBalBefore, 50 ether);
        assertTrue(bridge.refundClaimed(jobId));
        assertEq(bridge.jobRefundCredit(jobId), 50 ether);
    }

    function test_ClaimEscrowRefund_Permissionless_SellerWins_NoRefund() public {
        uint256 jobId = _depositAndCreateJob(NONCE_1, 50 ether);
        _disputeAndResolveSellerWins(jobId);

        vm.prank(payer);
        vm.expectRevert("Bridge: no refund owed");
        bridge.claimEscrowRefund(jobId);
    }

    function test_ClaimEscrowRefund_Permissionless_NotResolved() public {
        uint256 jobId = _depositAndCreateJob(NONCE_1, 50 ether);

        vm.prank(payer);
        vm.expectRevert("Bridge: job not resolved");
        bridge.claimEscrowRefund(jobId);
    }

    function test_ClaimEscrowRefund_RevertNotPayer() public {
        uint256 jobId = _depositAndCreateJob(NONCE_1, 50 ether);

        vm.prank(random);
        vm.expectRevert("Bridge: not payer");
        bridge.claimEscrowRefund(jobId);
    }

    function test_ClaimEscrowRefund_RevertDoubleClaim() public {
        uint256 jobId = _depositAndCreateJob(NONCE_1, 50 ether);
        _disputeAndResolveBuyerWins(jobId);

        vm.prank(facilitator);
        bridge.registerRefund(jobId, 50 ether);

        vm.prank(payer);
        bridge.claimEscrowRefund(jobId);

        vm.prank(payer);
        vm.expectRevert("Bridge: already claimed");
        bridge.claimEscrowRefund(jobId);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ─── Full lifecycle ─────────────────────────────────────────────────────
    // ═══════════════════════════════════════════════════════════════════════════

    function test_FullLifecycle_HappyPath() public {
        uint256 jobId = _depositAndCreateJob(NONCE_1, 50 ether);

        vm.prank(seller);
        escrow.submitDelivery(jobId, "ipfs://delivery-result");

        vm.prank(payer);
        bridge.confirmDelivery(jobId);

        IEscrowEngine.Job memory job = escrow.getJob(jobId);
        assertEq(uint8(job.status), uint8(IEscrowEngine.JobStatus.Confirmed));
    }

    function test_FullLifecycle_DisputeBuyerWins() public {
        uint256 jobId = _depositAndCreateJob(NONCE_1, 50 ether);
        _disputeAndResolveBuyerWins(jobId);

        uint256 payerBalBefore = token.balanceOf(payer);
        vm.prank(payer);
        bridge.claimEscrowRefund(jobId);

        assertEq(token.balanceOf(payer) - payerBalBefore, 50 ether);
        assertEq(bridge.totalLiabilities(address(token)), 0);
        assertEq(bridge.totalEscrowReserves(address(token)), 0);
    }

    function test_FullLifecycle_DisputeDraw() public {
        uint256 jobId = _depositAndCreateJob(NONCE_1, 50 ether);
        _disputeAndResolveDraw(jobId);

        // LOB token has 0% fee, so draw refund = amount / 2 = 25 ether
        uint256 payerBalBefore = token.balanceOf(payer);
        vm.prank(payer);
        bridge.claimEscrowRefund(jobId);

        assertEq(token.balanceOf(payer) - payerBalBefore, 25 ether);
        assertEq(bridge.jobRefundCredit(jobId), 25 ether);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ─── Token allowlist ────────────────────────────────────────────────────
    // ═══════════════════════════════════════════════════════════════════════════

    function test_SetTokenAllowed() public {
        address newToken = makeAddr("newToken");
        assertFalse(bridge.allowedTokens(newToken));

        vm.prank(admin);
        bridge.setTokenAllowed(newToken, true);
        assertTrue(bridge.allowedTokens(newToken));

        vm.prank(admin);
        bridge.setTokenAllowed(newToken, false);
        assertFalse(bridge.allowedTokens(newToken));
    }

    function test_SetTokenAllowed_RevertNotAdmin() public {
        vm.prank(random);
        vm.expectRevert();
        bridge.setTokenAllowed(address(token), false);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ─── recoverTokens ──────────────────────────────────────────────────────
    // ═══════════════════════════════════════════════════════════════════════════

    function test_RecoverTokens() public {
        // Send surplus tokens to bridge
        vm.prank(distributor);
        token.transfer(address(bridge), 1_000 ether);

        uint256 balBefore = token.balanceOf(admin);
        vm.prank(admin);
        bridge.recoverTokens(address(token), admin, 1_000 ether);
        assertEq(token.balanceOf(admin) - balBefore, 1_000 ether);
    }

    function test_RecoverTokens_RevertNotAdmin() public {
        vm.prank(random);
        vm.expectRevert();
        bridge.recoverTokens(address(token), random, 1_000 ether);
    }

    function test_RecoverTokens_RespectsRefundLiabilities() public {
        uint256 jobId = _depositAndCreateJob(NONCE_1, 50 ether);
        _disputeAndResolveBuyerWins(jobId);

        vm.prank(facilitator);
        bridge.registerRefund(jobId, 50 ether);

        uint256 bridgeBal = token.balanceOf(address(bridge));
        vm.prank(admin);
        vm.expectRevert("Bridge: would drain reserved funds");
        bridge.recoverTokens(address(token), admin, bridgeBal);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ─── Escrow reserve management ──────────────────────────────────────────
    // ═══════════════════════════════════════════════════════════════════════════

    function test_EscrowReserve_SetDuringJobCreation() public {
        uint256 jobId = _depositAndCreateJob(NONCE_1, 50 ether);

        assertEq(bridge.jobEscrowReserve(jobId), 50 ether);
        assertEq(bridge.totalEscrowReserves(address(token)), 50 ether);
    }

    function test_EscrowReserve_ProtectsRefundFromRecovery() public {
        uint256 jobId = _depositAndCreateJob(NONCE_1, 50 ether);
        _disputeAndResolveBuyerWins(jobId);

        uint256 bridgeBal = token.balanceOf(address(bridge));

        vm.prank(admin);
        vm.expectRevert("Bridge: would drain reserved funds");
        bridge.recoverTokens(address(token), admin, bridgeBal);

        // Admin can take surplus (bridgeBal - 50 escrow reserve)
        uint256 available = bridgeBal - 50 ether;
        vm.prank(admin);
        bridge.recoverTokens(address(token), admin, available);

        // Payer can still claim
        uint256 payerBalBefore = token.balanceOf(payer);
        vm.prank(payer);
        bridge.claimEscrowRefund(jobId);
        assertEq(token.balanceOf(payer) - payerBalBefore, 50 ether);
    }

    function test_EscrowReserve_ClearedByPermissionlessClaim() public {
        uint256 jobId = _depositAndCreateJob(NONCE_1, 50 ether);
        _disputeAndResolveBuyerWins(jobId);

        assertEq(bridge.totalEscrowReserves(address(token)), 50 ether);

        vm.prank(payer);
        bridge.claimEscrowRefund(jobId);

        assertEq(bridge.jobEscrowReserve(jobId), 0);
        assertEq(bridge.totalEscrowReserves(address(token)), 0);
    }

    function test_EscrowReserve_ClearedByRegisterRefund() public {
        uint256 jobId = _depositAndCreateJob(NONCE_1, 50 ether);
        _disputeAndResolveBuyerWins(jobId);

        vm.prank(facilitator);
        bridge.registerRefund(jobId, 50 ether);

        assertEq(bridge.jobEscrowReserve(jobId), 0);
        assertEq(bridge.totalEscrowReserves(address(token)), 0);
        assertEq(bridge.totalLiabilities(address(token)), 50 ether);
    }

    function test_EscrowReserve_MultipleJobs_IndependentReserves() public {
        uint256 jobId1 = _depositAndCreateJob(NONCE_1, 50 ether);
        uint256 jobId2 = _depositAndCreateJob(NONCE_2, 30 ether);

        assertEq(bridge.totalEscrowReserves(address(token)), 80 ether);

        _disputeAndResolveBuyerWins(jobId1);
        vm.prank(payer);
        bridge.claimEscrowRefund(jobId1);

        assertEq(bridge.totalEscrowReserves(address(token)), 30 ether);
        assertEq(bridge.jobEscrowReserve(jobId2), 30 ether);
    }

    // ─── releaseJobReserve ──────────────────────────────────────────────────

    function test_ReleaseJobReserve_Confirmed() public {
        uint256 jobId = _depositAndCreateJob(NONCE_1, 50 ether);

        vm.prank(seller);
        escrow.submitDelivery(jobId, "ipfs://delivery");

        vm.prank(payer);
        bridge.confirmDelivery(jobId);

        bridge.releaseJobReserve(jobId);

        assertEq(bridge.jobEscrowReserve(jobId), 0);
        assertEq(bridge.totalEscrowReserves(address(token)), 0);
    }

    function test_ReleaseJobReserve_SellerWins() public {
        uint256 jobId = _depositAndCreateJob(NONCE_1, 50 ether);
        _disputeAndResolveSellerWins(jobId);

        bridge.releaseJobReserve(jobId);

        assertEq(bridge.jobEscrowReserve(jobId), 0);
        assertEq(bridge.totalEscrowReserves(address(token)), 0);
    }

    function test_ReleaseJobReserve_RevertJobStillActive() public {
        uint256 jobId = _depositAndCreateJob(NONCE_1, 50 ether);

        vm.expectRevert("Bridge: job still active");
        bridge.releaseJobReserve(jobId);
    }

    function test_ReleaseJobReserve_RevertBuyerWinsNotClaimed() public {
        uint256 jobId = _depositAndCreateJob(NONCE_1, 50 ether);
        _disputeAndResolveBuyerWins(jobId);

        vm.expectRevert("Bridge: payer refund still claimable");
        bridge.releaseJobReserve(jobId);
    }

    function test_ReleaseJobReserve_RevertNoReserve() public {
        vm.expectRevert("Bridge: no reserve");
        bridge.releaseJobReserve(999);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ─── Solvency tests ─────────────────────────────────────────────────────
    // ═══════════════════════════════════════════════════════════════════════════

    function test_Solvency_ClaimNotBlockedByActiveJob() public {
        uint256 jobId1 = _depositAndCreateJob(NONCE_1, 50 ether);
        _depositAndCreateJob(NONCE_2, 50 ether);

        assertEq(bridge.totalEscrowReserves(address(token)), 100 ether);

        _disputeAndResolveBuyerWins(jobId1);

        uint256 payerBalBefore = token.balanceOf(payer);
        vm.prank(payer);
        bridge.claimEscrowRefund(jobId1);

        assertEq(token.balanceOf(payer) - payerBalBefore, 50 ether);
        assertEq(bridge.totalEscrowReserves(address(token)), 50 ether);
    }

    function test_Solvency_RegisterRefundNotBlockedByActiveJob() public {
        uint256 jobId1 = _depositAndCreateJob(NONCE_1, 50 ether);
        _depositAndCreateJob(NONCE_2, 50 ether);

        _disputeAndResolveBuyerWins(jobId1);

        vm.prank(facilitator);
        bridge.registerRefund(jobId1, 50 ether);

        assertEq(bridge.totalEscrowReserves(address(token)), 50 ether);
        assertEq(bridge.totalLiabilities(address(token)), 50 ether);
    }

    function test_Solvency_CreditCappedAtJobAmount() public {
        uint256 jobId = _depositAndCreateJob(NONCE_1, 50 ether);
        _disputeAndResolveBuyerWins(jobId);

        vm.prank(payer);
        bridge.claimEscrowRefund(jobId);
        assertEq(bridge.jobRefundCredit(jobId), 50 ether);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ─── bookRefundCredit ───────────────────────────────────────────────────
    // ═══════════════════════════════════════════════════════════════════════════

    function test_BookRefundCredit_Permissionless() public {
        uint256 jobId = _depositAndCreateJob(NONCE_1, 50 ether);
        _disputeAndResolveBuyerWins(jobId);

        assertEq(bridge.totalEscrowReserves(address(token)), 50 ether);
        assertEq(bridge.totalLiabilities(address(token)), 0);

        vm.prank(random);
        bridge.bookRefundCredit(jobId);

        assertEq(bridge.totalEscrowReserves(address(token)), 0);
        assertEq(bridge.totalLiabilities(address(token)), 50 ether);
        assertEq(bridge.jobRefundCredit(jobId), 50 ether);
    }

    function test_BookRefundCredit_ThenClaim() public {
        uint256 jobId = _depositAndCreateJob(NONCE_1, 50 ether);
        _disputeAndResolveBuyerWins(jobId);

        bridge.bookRefundCredit(jobId);

        uint256 payerBalBefore = token.balanceOf(payer);
        vm.prank(payer);
        bridge.claimEscrowRefund(jobId);

        assertEq(token.balanceOf(payer) - payerBalBefore, 50 ether);
        assertEq(bridge.totalLiabilities(address(token)), 0);
    }

    function test_BookRefundCredit_Draw() public {
        uint256 jobId = _depositAndCreateJob(NONCE_1, 50 ether);
        _disputeAndResolveDraw(jobId);

        bridge.bookRefundCredit(jobId);
        assertEq(bridge.jobRefundCredit(jobId), 25 ether);
        assertEq(bridge.totalLiabilities(address(token)), 25 ether);
    }

    function test_BookRefundCredit_RevertAlreadyBooked() public {
        uint256 jobId = _depositAndCreateJob(NONCE_1, 50 ether);
        _disputeAndResolveBuyerWins(jobId);

        bridge.bookRefundCredit(jobId);

        vm.expectRevert("Bridge: credit already booked");
        bridge.bookRefundCredit(jobId);
    }

    function test_BookRefundCredit_RevertAlreadyClaimed() public {
        uint256 jobId = _depositAndCreateJob(NONCE_1, 50 ether);
        _disputeAndResolveBuyerWins(jobId);

        vm.prank(payer);
        bridge.claimEscrowRefund(jobId);

        vm.expectRevert("Bridge: credit already booked");
        bridge.bookRefundCredit(jobId);
    }

    function test_BookRefundCredit_RevertUnknownJob() public {
        vm.expectRevert("Bridge: unknown job");
        bridge.bookRefundCredit(999);
    }

    function test_BookRefundCredit_RevertSellerWins() public {
        uint256 jobId = _depositAndCreateJob(NONCE_1, 50 ether);
        _disputeAndResolveSellerWins(jobId);

        vm.expectRevert("Bridge: no refund owed");
        bridge.bookRefundCredit(jobId);
    }

    function test_BookRefundCredit_RevertNotResolved() public {
        uint256 jobId = _depositAndCreateJob(NONCE_1, 50 ether);

        vm.expectRevert("Bridge: job not resolved");
        bridge.bookRefundCredit(jobId);
    }

    function test_BookRefundCredit_AfterRegisterRefund() public {
        uint256 jobId = _depositAndCreateJob(NONCE_1, 50 ether);
        _disputeAndResolveBuyerWins(jobId);

        vm.prank(facilitator);
        bridge.registerRefund(jobId, 50 ether);

        vm.expectRevert("Bridge: credit already booked");
        bridge.bookRefundCredit(jobId);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ─── recoverStrandedDeposit ──────────────────────────────────────────────
    // ═══════════════════════════════════════════════════════════════════════════

    function test_RecoverStrandedDeposit() public {
        // Simulate front-run: attacker calls transferWithAuthorization directly on token,
        // funds land on bridge without a job being created
        vm.prank(payer);
        token.transfer(address(bridge), 50 ether);

        uint256 payerBalBefore = token.balanceOf(payer);
        uint256 deadline = block.timestamp + 1 hours;

        (uint8 v, bytes32 r, bytes32 s) = _signPaymentIntent(
            NONCE_1, address(token), 50 ether, listingId, seller, deadline
        );
        X402EscrowBridge.PaymentIntent memory intent = X402EscrowBridge.PaymentIntent({
            x402Nonce: NONCE_1, payer: payer, token: address(token),
            amount: 50 ether, listingId: listingId, seller: seller, deadline: deadline
        });

        vm.prank(facilitator);
        bridge.recoverStrandedDeposit(intent, v, r, s);

        assertEq(token.balanceOf(payer) - payerBalBefore, 50 ether);
        assertTrue(bridge.nonceUsed(NONCE_1)); // nonce burned
    }

    function test_RecoverStrandedDeposit_RevertNotFacilitator() public {
        vm.prank(payer);
        token.transfer(address(bridge), 50 ether);

        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _signPaymentIntent(
            NONCE_1, address(token), 50 ether, listingId, seller, deadline
        );
        X402EscrowBridge.PaymentIntent memory intent = X402EscrowBridge.PaymentIntent({
            x402Nonce: NONCE_1, payer: payer, token: address(token),
            amount: 50 ether, listingId: listingId, seller: seller, deadline: deadline
        });

        vm.prank(random);
        vm.expectRevert();
        bridge.recoverStrandedDeposit(intent, v, r, s);
    }

    function test_RecoverStrandedDeposit_RevertDeadlineExpired() public {
        vm.prank(payer);
        token.transfer(address(bridge), 50 ether);

        uint256 deadline = block.timestamp - 1;
        (uint8 v, bytes32 r, bytes32 s) = _signPaymentIntent(
            NONCE_1, address(token), 50 ether, listingId, seller, deadline
        );
        X402EscrowBridge.PaymentIntent memory intent = X402EscrowBridge.PaymentIntent({
            x402Nonce: NONCE_1, payer: payer, token: address(token),
            amount: 50 ether, listingId: listingId, seller: seller, deadline: deadline
        });

        vm.prank(facilitator);
        vm.expectRevert("Bridge: deadline expired");
        bridge.recoverStrandedDeposit(intent, v, r, s);
    }

    function test_RecoverStrandedDeposit_RevertNonceAlreadyUsed() public {
        // Create a job first — nonce is used
        _depositAndCreateJob(NONCE_1, 50 ether);

        // Try to "recover" using the same nonce
        vm.prank(payer);
        token.transfer(address(bridge), 50 ether);

        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _signPaymentIntent(
            NONCE_1, address(token), 50 ether, listingId, seller, deadline
        );
        X402EscrowBridge.PaymentIntent memory intent = X402EscrowBridge.PaymentIntent({
            x402Nonce: NONCE_1, payer: payer, token: address(token),
            amount: 50 ether, listingId: listingId, seller: seller, deadline: deadline
        });

        vm.prank(facilitator);
        vm.expectRevert("Bridge: nonce already used");
        bridge.recoverStrandedDeposit(intent, v, r, s);
    }

    function test_RecoverStrandedDeposit_RevertInsufficientBalance() public {
        // No funds sent to bridge — nothing to recover
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _signPaymentIntent(
            NONCE_1, address(token), 50 ether, listingId, seller, deadline
        );
        X402EscrowBridge.PaymentIntent memory intent = X402EscrowBridge.PaymentIntent({
            x402Nonce: NONCE_1, payer: payer, token: address(token),
            amount: 50 ether, listingId: listingId, seller: seller, deadline: deadline
        });

        vm.prank(facilitator);
        vm.expectRevert("Bridge: insufficient balance");
        bridge.recoverStrandedDeposit(intent, v, r, s);
    }

    function test_RecoverStrandedDeposit_RespectsLiabilities() public {
        // Create a job and register refund credit — this creates a liability
        _depositAndCreateJob(NONCE_1, 50 ether);
        _disputeAndResolveBuyerWins(1);

        vm.prank(facilitator);
        bridge.registerRefund(1, 50 ether);

        // Bridge has liabilities reserved — compute available surplus (liabilities only, not escrow reserves)
        uint256 bridgeBal = token.balanceOf(address(bridge));
        uint256 liabilities = bridge.totalLiabilities(address(token));
        uint256 surplus = bridgeBal - liabilities;

        // Try to recover MORE than the available surplus — should fail
        uint256 drainAmount = surplus + 1 ether;
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _signPaymentIntent(
            NONCE_2, address(token), drainAmount, listingId, seller, deadline
        );
        X402EscrowBridge.PaymentIntent memory intent = X402EscrowBridge.PaymentIntent({
            x402Nonce: NONCE_2, payer: payer, token: address(token),
            amount: drainAmount, listingId: listingId, seller: seller, deadline: deadline
        });

        vm.prank(facilitator);
        vm.expectRevert("Bridge: insufficient balance");
        bridge.recoverStrandedDeposit(intent, v, r, s);
    }

    function test_RecoverStrandedDeposit_WorksWithActiveEscrowReserves() public {
        // Create an active job — escrow reserves are non-zero but funds are in EscrowEngine
        _depositAndCreateJob(NONCE_1, 50 ether);
        assertEq(bridge.totalEscrowReserves(address(token)), 50 ether);
        assertEq(token.balanceOf(address(bridge)), 0); // all funds sent to escrow

        // Simulate front-run: stranded funds land on bridge
        vm.prank(payer);
        token.transfer(address(bridge), 10 ether);

        // Recovery should work despite 50 ether in escrow reserves
        // (escrow reserves are NOT on the bridge — they're in EscrowEngine)
        uint256 payerBalBefore = token.balanceOf(payer);
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _signPaymentIntent(
            NONCE_2, address(token), 10 ether, listingId, seller, deadline
        );
        X402EscrowBridge.PaymentIntent memory intent = X402EscrowBridge.PaymentIntent({
            x402Nonce: NONCE_2, payer: payer, token: address(token),
            amount: 10 ether, listingId: listingId, seller: seller, deadline: deadline
        });

        vm.prank(facilitator);
        bridge.recoverStrandedDeposit(intent, v, r, s);

        assertEq(token.balanceOf(payer) - payerBalBefore, 10 ether);
        assertTrue(bridge.nonceUsed(NONCE_2));
    }

    function test_RecoverStrandedDeposit_RevertBadSignature() public {
        vm.prank(payer);
        token.transfer(address(bridge), 50 ether);

        uint256 deadline = block.timestamp + 1 hours;
        // Sign with correct params
        (uint8 v, bytes32 r, bytes32 s) = _signPaymentIntent(
            NONCE_1, address(token), 50 ether, listingId, seller, deadline
        );
        // Tamper: change amount in the intent
        X402EscrowBridge.PaymentIntent memory intent = X402EscrowBridge.PaymentIntent({
            x402Nonce: NONCE_1, payer: payer, token: address(token),
            amount: 100 ether, // tampered
            listingId: listingId, seller: seller, deadline: deadline
        });

        vm.prank(facilitator);
        vm.expectRevert("Bridge: invalid payer signature");
        bridge.recoverStrandedDeposit(intent, v, r, s);
    }

    // ─── receiveWithAuthorization front-run protection ──────────────────────

    function test_DepositWithAuthorization_FrontRunProtection() public {
        // Verify that MockERC3009.receiveWithAuthorization enforces caller == to
        vm.startPrank(admin);
        MockERC3009 erc3009 = new MockERC3009(admin);
        bridge.setTokenAllowed(address(erc3009), true);
        erc3009.transfer(payer, 100 ether);
        vm.stopPrank();

        // A third party (random) tries to call receiveWithAuthorization directly
        // This should revert because msg.sender != to
        vm.prank(random);
        vm.expectRevert("MockERC3009: caller must be to");
        erc3009.receiveWithAuthorization(
            payer, address(bridge), 50 ether,
            0, type(uint256).max, bytes32(uint256(1)),
            0, bytes32(0), bytes32(0)
        );
    }
}
