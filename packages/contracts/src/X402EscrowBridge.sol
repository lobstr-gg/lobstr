// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "./interfaces/IEscrowEngine.sol";
import "./interfaces/IDisputeArbitration.sol";
import "./interfaces/IERC3009.sol";

/// @title X402EscrowBridge
/// @notice Routes x402 payments through LOBSTR's EscrowEngine for trust-protected settlement.
/// @dev Acts as buyer proxy since EscrowEngine sets buyer = msg.sender in createJob.
///      Two atomic deposit+escrow paths — no intermediate pending-deposit state:
///        1. depositAndCreateJob(): Pull-model with EIP-712 payer signature binding the full
///           payment intent (nonce, token, amount, listingId, seller, deadline). Payer must
///           have approved this contract.
///        2. depositWithAuthorization(): EIP-3009 model with dual payer signatures —
///           an EIP-3009 sig authorizing the token transfer AND an EIP-712 PaymentIntent
///           sig binding the escrow routing params (listingId, seller, deadline).
///           Uses receiveWithAuthorization (not transferWithAuthorization) so only this
///           contract can execute the transfer — prevents front-running.
///      If an EIP-3009 authorization is front-run via direct transferWithAuthorization,
///      recoverStrandedDeposit() returns funds to the payer using their PaymentIntent sig.
///      Payer actions (confirm/dispute) are proxied through the bridge.
///      Escrow refunds are claimable permissionlessly — the bridge reads dispute rulings
///      on-chain to compute exact refund amounts without facilitator intervention.
///
///      Safety invariant: EscrowEngine is immutable and transfers refund tokens synchronously
///      during resolveDispute() — if job.status == Resolved, the refund is already on this
///      contract. To prevent cross-user theft from pooled balances, resolved refunds should
///      be eagerly booked into totalLiabilities via bookRefundCredit() or registerRefund()
///      as soon as resolution is observed (keepers/facilitators should call these promptly).
contract X402EscrowBridge is Initializable, UUPSUpgradeable, OwnableUpgradeable, AccessControlUpgradeable, ReentrancyGuardUpgradeable, EIP712Upgradeable {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    bytes32 public constant FACILITATOR_ROLE = keccak256("FACILITATOR_ROLE");

    /// @dev EIP-712 typehash for payer-signed payment intents (used by depositAndCreateJob)
    bytes32 private constant PAYMENT_INTENT_TYPEHASH = keccak256(
        "PaymentIntent(bytes32 x402Nonce,address token,uint256 amount,uint256 listingId,address seller,uint256 deadline,uint256 deliveryDeadline)"
    );

    IEscrowEngine public escrow;
    IDisputeArbitration public disputeArbitration;

    /// @notice Tracks whether an x402 nonce has been used (prevents replay)
    mapping(bytes32 => bool) public nonceUsed;

    /// @notice x402 payment nonce → escrow job ID
    mapping(bytes32 => uint256) public paymentToJob;

    /// @notice escrow job ID → actual x402 payer address
    mapping(uint256 => address) public jobPayer;

    /// @notice escrow job ID → token used for this job
    mapping(uint256 => address) public jobToken;

    /// @notice Allowlisted tokens (only standard ERC-20s, no fee-on-transfer)
    mapping(address => bool) public allowedTokens;

    /// @notice Per-token total liabilities (sum of all reserved refund credits)
    mapping(address => uint256) public totalLiabilities;

    /// @notice EIP-712 payer-signed payment intent for depositAndCreateJob()
    struct PaymentIntent {
        bytes32 x402Nonce;
        address payer;
        address token;
        uint256 amount;
        uint256 listingId;
        address seller;
        uint256 deadline;
        uint256 deliveryDeadline; // Time after which buyer can cancel
    }

    /// @notice EIP-3009 transfer authorization for depositWithAuthorization()
    /// @dev Only contains EIP-3009 transfer fields. Escrow routing (listingId, seller) is
    ///      bound via a separate EIP-712 PaymentIntent signature from the payer.
    struct ERC3009Auth {
        address from;
        address token;
        uint256 amount;
        uint256 validAfter;
        uint256 validBefore;
        bytes32 eip3009Nonce;
    }

    /// @notice Tracks whether the payer has claimed their escrow refund for a job
    mapping(uint256 => bool) public refundClaimed;

    /// @notice Per-job refund credit (set by facilitator or computed on-chain)
    mapping(uint256 => uint256) public jobRefundCredit;

    /// @notice Per-token total escrow reserves.
    /// @dev Tracks amounts sent to EscrowEngine that may return as refunds.
    ///      Included in solvency checks for recoverTokens() (admin guard).
    ///      NOT included in user-facing claim/refund checks (claimEscrowRefund,
    ///      bookRefundCredit) to avoid blocking payer claims with phantom obligations.
    mapping(address => uint256) public totalEscrowReserves;

    /// @notice Per-job escrow reserve amount (tracks how much was escrowed per job)
    mapping(uint256 => uint256) public jobEscrowReserve;

    /// @notice Tracks unbooked resolved refund amounts per token.
    /// @dev These are funds that have returned from EscrowEngine for resolved jobs
    ///      but haven't been booked into totalLiabilities yet. Included in solvency
    ///      checks to prevent cross-user theft from pooled balances.
    mapping(address => uint256) public unbookedResolvedReserves;

    /// @notice Per-job flag: true once job resolves with refund owed but not yet booked.
    mapping(uint256 => bool) public jobHasUnbookedRefund;


    event EscrowedJobCreated(
        bytes32 indexed x402Nonce,
        uint256 indexed jobId,
        address indexed payer,
        address seller,
        uint256 amount,
        address token
    );

    event DeliveryConfirmedByPayer(uint256 indexed jobId, address indexed payer);
    event DisputeInitiatedByPayer(uint256 indexed jobId, address indexed payer);
    event JobCancelledByPayer(uint256 indexed jobId, address indexed payer);
    event EscrowRefundClaimed(uint256 indexed jobId, address indexed payer, uint256 amount);
    event RefundRegistered(uint256 indexed jobId, uint256 amount);
    event TokenAllowlistUpdated(address indexed token, bool allowed);
    event EscrowReserveReleased(uint256 indexed jobId, address token, uint256 amount);
    event StrandedDepositRecovered(address indexed payer, address indexed token, uint256 amount, bytes32 eip3009Nonce);
    event UnbookedRefundRecorded(uint256 indexed jobId, address token, uint256 amount);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _escrow, address _disputeArbitration) public virtual initializer {
        require(_escrow != address(0), "Bridge: zero escrow");
        require(_disputeArbitration != address(0), "Bridge: zero dispute");

        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();
        __AccessControl_init();
        __ReentrancyGuard_init();
        __EIP712_init("X402EscrowBridge", "1");

        escrow = IEscrowEngine(_escrow);
        disputeArbitration = IDisputeArbitration(_disputeArbitration);

        // Grant roles to owner (can reassign later)
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(FACILITATOR_ROLE, msg.sender);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    /// @notice Admin adds or removes a token from the allowlist
    /// @param token ERC-20 token address
    /// @param allowed Whether the token is permitted
    function setTokenAllowed(address token, bool allowed) external onlyRole(DEFAULT_ADMIN_ROLE) {
        allowedTokens[token] = allowed;
        emit TokenAllowlistUpdated(token, allowed);
    }

    // ─── Atomic Deposit + Escrow Creation ────────────────────────────────────

    /// @notice Atomic EIP-3009 deposit + escrow creation with dual payer authorization.
    ///         Requires two payer signatures:
    ///           1. EIP-3009 signature (v/r/s) authorizing the token transfer to the bridge
    ///           2. EIP-712 PaymentIntent signature (intentV/intentR/intentS) binding the
    ///              escrow routing parameters (listingId, seller, nonce, deadline)
    ///         This prevents a compromised facilitator from misrouting EIP-3009-authorized
    ///         funds to an attacker-controlled seller.
    /// @param auth ERC3009Auth struct with transfer authorization params
    /// @param v EIP-3009 ECDSA signature v
    /// @param r EIP-3009 ECDSA signature r
    /// @param s EIP-3009 ECDSA signature s
    /// @param intent PaymentIntent struct binding the escrow routing params
    /// @param intentV EIP-712 ECDSA signature v for the PaymentIntent
    /// @param intentR EIP-712 ECDSA signature r for the PaymentIntent
    /// @param intentS EIP-712 ECDSA signature s for the PaymentIntent
    /// @return jobId The escrow job ID for lifecycle tracking
    function depositWithAuthorization(
        ERC3009Auth calldata auth,
        uint8 v, bytes32 r, bytes32 s,
        PaymentIntent calldata intent,
        uint8 intentV, bytes32 intentR, bytes32 intentS
    ) external onlyRole(FACILITATOR_ROLE) nonReentrant returns (uint256 jobId) {
        require(!nonceUsed[intent.x402Nonce], "Bridge: nonce already used");
        require(allowedTokens[auth.token], "Bridge: token not allowed");
        require(auth.from != address(0), "Bridge: zero payer");
        require(auth.amount > 0, "Bridge: zero amount");
        require(block.timestamp <= intent.deadline, "Bridge: deadline expired");

        // Cross-validate: EIP-3009 auth and PaymentIntent must agree on payer/token/amount
        require(auth.from == intent.payer, "Bridge: payer mismatch");
        require(auth.token == intent.token, "Bridge: token mismatch");
        require(auth.amount == intent.amount, "Bridge: amount mismatch");

        // Verify payer authorized the escrow routing (EIP-712)
        _verifyPaymentIntent(intent, intentV, intentR, intentS);

        // Execute the EIP-3009 transfer (isolated to reduce stack depth)
        _executeERC3009Transfer(auth, v, r, s);

        // Create escrow job atomically
        jobId = _createEscrowJob(
            intent.x402Nonce, auth.from, auth.token, auth.amount,
            intent.listingId, intent.seller, intent.deliveryDeadline
        );
    }

    /// @notice Atomic payer-authorized pull deposit + escrow creation.
    ///         Requires an EIP-712 signature from the payer over the full payment intent,
    ///         preventing a compromised facilitator from pulling arbitrary approved funds
    ///         or routing them to an attacker-controlled seller.
    /// @param intent PaymentIntent struct with all payment parameters
    /// @param v EIP-712 signature v
    /// @param r EIP-712 signature r
    /// @param s EIP-712 signature s
    /// @return jobId The escrow job ID for lifecycle tracking
    function depositAndCreateJob(
        PaymentIntent calldata intent,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external onlyRole(FACILITATOR_ROLE) nonReentrant returns (uint256 jobId) {
        require(block.timestamp <= intent.deadline, "Bridge: deadline expired");
        require(!nonceUsed[intent.x402Nonce], "Bridge: nonce already used");
        require(allowedTokens[intent.token], "Bridge: token not allowed");
        require(intent.payer != address(0), "Bridge: zero payer");
        require(intent.amount > 0, "Bridge: zero amount");

        // Verify payer authorized this exact payment intent (EIP-712)
        _verifyPaymentIntent(intent, v, r, s);

        // Pull tokens with balance-delta verification
        uint256 pullBalBefore = IERC20(intent.token).balanceOf(address(this));
        IERC20(intent.token).safeTransferFrom(intent.payer, address(this), intent.amount);
        uint256 received = IERC20(intent.token).balanceOf(address(this)) - pullBalBefore;
        require(received == intent.amount, "Bridge: transfer amount mismatch");

        // Create escrow job atomically
        jobId = _createEscrowJob(
            intent.x402Nonce, intent.payer, intent.token, intent.amount,
            intent.listingId, intent.seller, intent.deliveryDeadline
        );
    }

    /// @dev Verifies EIP-712 payer signature over a PaymentIntent.
    function _verifyPaymentIntent(
        PaymentIntent calldata intent,
        uint8 v, bytes32 r, bytes32 s
    ) internal view {
        bytes32 structHash = keccak256(abi.encode(
            PAYMENT_INTENT_TYPEHASH,
            intent.x402Nonce, intent.token, intent.amount,
            intent.listingId, intent.seller, intent.deadline, intent.deliveryDeadline
        ));
        address signer = _hashTypedDataV4(structHash).recover(v, r, s);
        require(signer == intent.payer, "Bridge: invalid payer signature");
    }

    /// @dev Executes EIP-3009 receiveWithAuthorization with balance-delta verification.
    ///      Uses receiveWithAuthorization instead of transferWithAuthorization because:
    ///        - receiveWithAuthorization restricts the caller to the `to` address (this contract)
    ///        - This prevents front-running: third parties cannot execute the transfer first
    ///        - USDC on Base supports receiveWithAuthorization per the EIP-3009 spec
    ///      Isolated into its own function to avoid stack-too-deep in depositWithAuthorization.
    function _executeERC3009Transfer(
        ERC3009Auth calldata auth,
        uint8 v, bytes32 r, bytes32 s
    ) internal {
        uint256 balBefore = IERC20(auth.token).balanceOf(address(this));
        IERC3009(auth.token).receiveWithAuthorization(
            auth.from, address(this), auth.amount,
            auth.validAfter, auth.validBefore, auth.eip3009Nonce,
            v, r, s
        );
        uint256 received = IERC20(auth.token).balanceOf(address(this)) - balBefore;
        require(received >= auth.amount, "Bridge: transfer shortfall");
    }

    /// @dev Shared escrow job creation logic. Tokens must already be on the bridge.
    function _createEscrowJob(
        bytes32 x402Nonce,
        address payerAddr,
        address token,
        uint256 amount,
        uint256 listingId,
        address seller,
        uint256 deliveryDeadline
    ) internal returns (uint256 jobId) {
        nonceUsed[x402Nonce] = true;
        totalEscrowReserves[token] += amount;

        uint256 escrowBalBefore = IERC20(token).balanceOf(address(this));
        IERC20(token).forceApprove(address(escrow), 0);
        IERC20(token).forceApprove(address(escrow), amount);
        jobId = escrow.createJob(listingId, seller, amount, token, deliveryDeadline);
        uint256 escrowBalAfter = IERC20(token).balanceOf(address(this));
        require(escrowBalBefore - escrowBalAfter == amount, "Bridge: escrow funding mismatch");

        // Solvency: bridge must hold enough to cover all tracked obligations.
        uint256 totalObligations = totalLiabilities[token] + unbookedResolvedReserves[token];
        require(escrowBalAfter >= totalObligations, "Bridge: escrow depleted obligations");

        // V-002 FIX: Reject if bridge holds untracked funds (resolved refunds not yet booked).
        // After an atomic deposit+escrow, the bridge balance should equal tracked obligations.
        // Any excess means EscrowEngine returned dispute refunds that haven't been recorded
        // via recordResolvedRefund(). Without this check, those refund tokens could be spent
        // funding new jobs, making earlier payers' refunds unclaimable.
        require(escrowBalAfter <= totalObligations, "Bridge: unbooked refunds, call recordResolvedRefund");

        IEscrowEngine.Job memory job = escrow.getJob(jobId);
        require(job.buyer == address(this), "Bridge: buyer mismatch");
        require(job.token == token, "Bridge: token mismatch");
        require(job.amount == amount, "Bridge: amount mismatch");

        paymentToJob[x402Nonce] = jobId;
        jobPayer[jobId] = payerAddr;
        jobToken[jobId] = token;
        jobEscrowReserve[jobId] = amount;

        // Set the real payer in EscrowEngine so slashed stake goes to the real payer
        escrow.setJobPayer(jobId, payerAddr);

        emit EscrowedJobCreated(x402Nonce, jobId, payerAddr, seller, amount, token);
    }

    // ─── Payer Lifecycle Actions ─────────────────────────────────────────────

    /// @notice Payer confirms delivery (proxied through bridge since bridge is escrow buyer)
    /// @param jobId The escrow job ID
    function confirmDelivery(uint256 jobId) external nonReentrant {
        require(msg.sender == jobPayer[jobId], "Bridge: not payer");
        escrow.confirmDelivery(jobId);
        emit DeliveryConfirmedByPayer(jobId, msg.sender);
    }

    /// @notice Payer raises dispute (proxied through bridge since bridge is escrow buyer)
    /// @param jobId The escrow job ID
    /// @param evidenceURI IPFS/Arweave URI pointing to dispute evidence
    function initiateDispute(uint256 jobId, string calldata evidenceURI) external nonReentrant {
        require(msg.sender == jobPayer[jobId], "Bridge: not payer");
        escrow.initiateDispute(jobId, evidenceURI);
        emit DisputeInitiatedByPayer(jobId, msg.sender);
    }

    /// @notice Payer cancels job after delivery timeout (proxied through bridge since bridge is escrow buyer)
    /// @param jobId The escrow job ID
    function cancelJob(uint256 jobId) external nonReentrant {
        require(msg.sender == jobPayer[jobId], "Bridge: not payer");
        address token = jobToken[jobId];

        uint256 refundAmount = escrow.cancelJob(jobId);

        // Clear escrow reserve — funds returned from EscrowEngine to bridge
        uint256 reserve = jobEscrowReserve[jobId];
        if (reserve > 0) {
            totalEscrowReserves[token] -= reserve;
            delete jobEscrowReserve[jobId];
        }

        // Forward cancellation refund directly to payer
        if (refundAmount > 0) {
            IERC20(token).safeTransfer(msg.sender, refundAmount);
        }

        emit JobCancelledByPayer(jobId, msg.sender);
    }

    // ─── Unbooked Refund Tracking ───────────────────────────────────────────

    /// @notice Permissionless: record a resolved job's refund as unbooked.
    ///         Must be called BEFORE creating a new job if there are resolved jobs
    ///         with refunds not yet booked. This ensures resolved refund funds cannot
    ///         be reused to fund new jobs (preventing cross-user theft).
    /// @param jobId The escrow job ID that has resolved with a refund
    function recordResolvedRefund(uint256 jobId) external {
        require(jobPayer[jobId] != address(0), "Bridge: unknown job");
        require(!jobHasUnbookedRefund[jobId], "Bridge: already recorded");
        require(!refundClaimed[jobId], "Bridge: already claimed");

        // Compute refund from on-chain state
        uint256 refund = _computeRefundFromChain(jobId);
        require(refund > 0, "Bridge: no refund owed");

        address token = jobToken[jobId];

        // Clear escrow reserve - refund has come back from EscrowEngine
        uint256 reserve = jobEscrowReserve[jobId];
        if (reserve > 0) {
            totalEscrowReserves[token] -= reserve;
            delete jobEscrowReserve[jobId];
        }

        // Track as unbooked resolved reserve
        unbookedResolvedReserves[token] += refund;
        jobHasUnbookedRefund[jobId] = true;

        emit UnbookedRefundRecorded(jobId, token, refund);
    }

    // ─── Refund Registration & Claiming ──────────────────────────────────────

    /// @notice Facilitator pre-registers a refund credit after dispute resolution.
    ///         Optional fast-path — payers can also claim permissionlessly via on-chain state.
    ///         The amount is validated against the on-chain dispute ruling to prevent overpayment.
    /// @param jobId The escrow job ID
    /// @param amount The refund amount (must match on-chain dispute ruling exactly)
    function registerRefund(uint256 jobId, uint256 amount) external onlyRole(FACILITATOR_ROLE) {
        require(jobRefundCredit[jobId] == 0, "Bridge: refund already registered");
        require(jobPayer[jobId] != address(0), "Bridge: unknown job");
        require(amount > 0, "Bridge: zero refund");

        // Validate amount matches on-chain dispute ruling — prevents facilitator overpayment.
        // _computeRefundFromChain checks job.status == Resolved internally.
        uint256 expected = _computeRefundFromChain(jobId);
        require(amount == expected, "Bridge: amount != on-chain refund");

        address token = jobToken[jobId];

        // Convert escrow reserve into explicit refund credit (prevents double-counting)
        uint256 reserve = jobEscrowReserve[jobId];
        if (reserve > 0) {
            totalEscrowReserves[token] -= reserve;
            delete jobEscrowReserve[jobId];
        }

        // Clear any unbooked resolved reserve if it was recorded
        if (jobHasUnbookedRefund[jobId]) {
            unbookedResolvedReserves[token] -= amount;
            delete jobHasUnbookedRefund[jobId];
        }

        // Reserve funds via liabilities — check only against on-bridge obligations.
        // Note: totalEscrowReserves excluded — those funds are held by EscrowEngine, not here.
        // Include unbookedResolvedReserves in the check.
        uint256 totalObligations = totalLiabilities[token] + unbookedResolvedReserves[token] + amount;
        require(
            IERC20(token).balanceOf(address(this)) >= totalObligations,
            "Bridge: insufficient balance for refund"
        );
        totalLiabilities[token] = totalLiabilities[token] + amount;
        jobRefundCredit[jobId] = amount;

        emit RefundRegistered(jobId, amount);
    }

    /// @notice Eagerly book a resolved job's refund credit into totalLiabilities.
    ///         Permissionless — anyone can call (keepers, facilitators, payers) to ensure
    ///         resolved refund tokens are tracked as liabilities before the payer claims.
    ///         This prevents cross-user theft from pooled balances: once booked, the credit
    ///         is included in solvency checks for all subsequent operations.
    /// @param jobId The escrow job ID
    function bookRefundCredit(uint256 jobId) external {
        require(jobPayer[jobId] != address(0), "Bridge: unknown job");
        require(jobRefundCredit[jobId] == 0, "Bridge: credit already booked");
        require(!refundClaimed[jobId], "Bridge: already claimed");

        address token = jobToken[jobId];

        // Clear escrow reserve — convert from "potential return" to explicit liability
        uint256 reserve = jobEscrowReserve[jobId];
        if (reserve > 0) {
            totalEscrowReserves[token] -= reserve;
            delete jobEscrowReserve[jobId];
        }

        // Clear any unbooked resolved reserve
        if (jobHasUnbookedRefund[jobId]) {
            // We need to compute the credit first to know how much to unbook
            uint256 pendingCredit = _computeRefundFromChain(jobId);
            if (pendingCredit > 0 && unbookedResolvedReserves[token] >= pendingCredit) {
                unbookedResolvedReserves[token] -= pendingCredit;
            }
            delete jobHasUnbookedRefund[jobId];
        }

        // Compute credit from on-chain dispute state
        uint256 credit = _computeRefundFromChain(jobId);
        require(credit > 0, "Bridge: no refund owed");

        // Cap at escrowed amount (defense-in-depth)
        IEscrowEngine.Job memory job = escrow.getJob(jobId);
        require(credit <= job.amount, "Bridge: refund exceeds escrowed amount");

        // Verify bridge can back this new liability
        // Include unbookedResolvedReserves in the check
        uint256 totalObligations = totalLiabilities[token] + unbookedResolvedReserves[token] + credit;
        require(
            IERC20(token).balanceOf(address(this)) >= totalObligations,
            "Bridge: insufficient balance for refund"
        );

        totalLiabilities[token] = totalLiabilities[token] + credit;
        jobRefundCredit[jobId] = credit;

        emit RefundRegistered(jobId, credit);
    }

    /// @notice Payer claims their refund for a resolved dispute.
    ///         Works three ways:
    ///           1. If facilitator pre-registered via registerRefund — uses stored credit
    ///           2. If booked via bookRefundCredit — uses stored credit
    ///           3. If no credit registered — computes refund from on-chain dispute ruling
    ///         All paths are permissionless for the payer.
    /// @param jobId The escrow job ID
    function claimEscrowRefund(uint256 jobId) external nonReentrant {
        require(msg.sender == jobPayer[jobId], "Bridge: not payer");
        require(!refundClaimed[jobId], "Bridge: already claimed");

        uint256 credit = jobRefundCredit[jobId];
        address token = jobToken[jobId];

        // Clear escrow reserve — refund is being processed now
        // (reverts undo this if the claim ultimately fails)
        uint256 reserve = jobEscrowReserve[jobId];
        if (reserve > 0) {
            totalEscrowReserves[token] -= reserve;
            delete jobEscrowReserve[jobId];
        }

        // Clear any unbooked resolved reserve
        if (jobHasUnbookedRefund[jobId]) {
            if (credit > 0 && unbookedResolvedReserves[token] >= credit) {
                unbookedResolvedReserves[token] -= credit;
            } else if (credit == 0) {
                // Will compute below
                uint256 pendingCredit = _computeRefundFromChain(jobId);
                if (pendingCredit > 0 && unbookedResolvedReserves[token] >= pendingCredit) {
                    unbookedResolvedReserves[token] -= pendingCredit;
                }
            }
            delete jobHasUnbookedRefund[jobId];
        }

        if (credit == 0) {
            // Permissionless path: compute refund from on-chain dispute state
            credit = _computeRefundFromChain(jobId);
            require(credit > 0, "Bridge: no refund owed");

            totalLiabilities[token] += credit;
            jobRefundCredit[jobId] = credit;
        }

        // Cap: refund can never exceed the escrow job's recorded amount
        IEscrowEngine.Job memory job = escrow.getJob(jobId);
        require(credit <= job.amount, "Bridge: refund exceeds escrowed amount");

        // Verify bridge can cover all on-bridge liabilities (which includes the credit).
        // Note: totalEscrowReserves excluded — those funds are held by EscrowEngine, not here.
        // Include unbookedResolvedReserves in the check.
        uint256 totalObligations = totalLiabilities[token] + unbookedResolvedReserves[token];
        require(
            IERC20(token).balanceOf(address(this)) >= totalObligations,
            "Bridge: insufficient balance for refund"
        );

        refundClaimed[jobId] = true;

        // Reduce liabilities before transfer (CEI)
        totalLiabilities[token] -= credit;

        IERC20(token).safeTransfer(msg.sender, credit);
        emit EscrowRefundClaimed(jobId, msg.sender, credit);
    }

    /// @notice Computes the exact refund amount from on-chain dispute ruling.
    /// @dev Mirrors EscrowEngine payout logic exactly. EscrowEngine is non-upgradeable
    ///      (deployed without proxy), so this logic cannot diverge from the escrow's actual
    ///      refund transfers. The formulas are verified against EscrowEngine source:
    ///        BuyerWins → job.amount (full refund, no fees)  [EscrowEngine L211-214]
    ///        Draw      → job.amount / 2 - job.fee / 2       [EscrowEngine L230-237]
    ///        SellerWins/Pending → 0
    ///      registerRefund() validates facilitator-supplied amounts against this function.
    ///      Defense-in-depth: callers cap credit at job.amount and verify full solvency.
    function _computeRefundFromChain(uint256 jobId) internal view returns (uint256) {
        IEscrowEngine.Job memory job = escrow.getJob(jobId);
        require(
            job.status == IEscrowEngine.JobStatus.Resolved,
            "Bridge: job not resolved"
        );

        uint256 disputeId = escrow.getJobDisputeId(jobId);
        IDisputeArbitration.Dispute memory d = disputeArbitration.getDispute(disputeId);

        if (d.ruling == IDisputeArbitration.Ruling.BuyerWins) {
            return job.amount;
        } else if (d.ruling == IDisputeArbitration.Ruling.Draw) {
            uint256 half = job.amount / 2;
            uint256 halfFee = job.fee / 2;
            // Saturate at zero — fee can exceed amount for micro-payments
            return half > halfFee ? half - halfFee : 0;
        } else {
            return 0; // SellerWins or Pending — no refund to buyer
        }
    }

    // ─── Admin ───────────────────────────────────────────────────────────────

    /// @notice Recover tokens accidentally sent to this contract (admin only).
    ///         Cannot withdraw funds reserved for refund credits or escrow reserves.
    /// @dev totalEscrowReserves and unbookedResolvedReserves are intentionally included —
    ///      conservative guard that prevents admin from draining tokens that may return from
    ///      escrow (buyerWins/draw) or are owed to payers as unbooked refunds.
    ///      Admin can use releaseJobReserve() for terminal jobs to free up reserves.
    /// @param token ERC-20 token to recover
    /// @param to Recipient address
    /// @param amount Amount to recover
    function recoverTokens(
        address token,
        address to,
        uint256 amount
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 balance = IERC20(token).balanceOf(address(this));
        uint256 reserved = totalLiabilities[token] + totalEscrowReserves[token] + unbookedResolvedReserves[token];
        require(balance >= reserved + amount, "Bridge: would drain reserved funds");
        IERC20(token).safeTransfer(to, amount);
    }

    // ─── Stranded Deposit Recovery ──────────────────────────────────────────

    /// @notice Recover funds stranded on the bridge from a front-run EIP-3009 authorization.
    ///         If an attacker calls transferWithAuthorization on the token contract directly
    ///         (before the bridge's receiveWithAuthorization executes), funds land on the bridge
    ///         without an escrow job being created. This function lets the facilitator return
    ///         those funds to the payer using the payer's EIP-712 PaymentIntent signature as proof.
    /// @dev Requires the payer's PaymentIntent signature to prevent unauthorized drains.
    ///      Only callable by facilitator (who observed the front-run). The deadline in the
    ///      PaymentIntent is enforced — recovery should happen promptly.
    /// @param intent PaymentIntent proving the payer authorized this payment
    /// @param intentV EIP-712 ECDSA signature v
    /// @param intentR EIP-712 ECDSA signature r
    /// @param intentS EIP-712 ECDSA signature s
    function recoverStrandedDeposit(
        PaymentIntent calldata intent,
        uint8 intentV, bytes32 intentR, bytes32 intentS
    ) external onlyRole(FACILITATOR_ROLE) nonReentrant {
        require(block.timestamp <= intent.deadline, "Bridge: deadline expired");
        require(!nonceUsed[intent.x402Nonce], "Bridge: nonce already used");
        require(allowedTokens[intent.token], "Bridge: token not allowed");
        require(intent.payer != address(0), "Bridge: zero payer");
        require(intent.amount > 0, "Bridge: zero amount");

        // Verify payer authorized this payment intent
        _verifyPaymentIntent(intent, intentV, intentR, intentS);

        // Burn nonce — prevents using this intent for a job or double-recovery
        nonceUsed[intent.x402Nonce] = true;

        // Ensure bridge has sufficient funds to cover on-bridge liabilities + this recovery.
        // Note: totalEscrowReserves is intentionally EXCLUDED — those funds are held by
        // EscrowEngine, not on this contract. Including them would make recovery impossible
        // whenever active escrow jobs exist for the same token.
        // unbookedResolvedReserves IS included to protect payer refunds.
        address token = intent.token;
        uint256 balance = IERC20(token).balanceOf(address(this));
        uint256 totalObligations = totalLiabilities[token] + unbookedResolvedReserves[token] + intent.amount;
        require(balance >= totalObligations, "Bridge: insufficient balance");

        IERC20(token).safeTransfer(intent.payer, intent.amount);
        emit StrandedDepositRecovered(intent.payer, token, intent.amount, intent.x402Nonce);
    }

    // ─── Escrow Reserve Management ──────────────────────────────────────────

    /// @notice Release escrow reserve for a terminal job where no refund is owed.
    ///         Permissionless — anyone can call for cleanup once the job is finalized.
    ///         For Confirmed/Released jobs (no dispute) or Resolved jobs where seller won.
    /// @param jobId The escrow job ID
    function releaseJobReserve(uint256 jobId) external {
        uint256 reserve = jobEscrowReserve[jobId];
        require(reserve > 0, "Bridge: no reserve");

        IEscrowEngine.Job memory job = escrow.getJob(jobId);

        if (job.status == IEscrowEngine.JobStatus.Confirmed ||
            job.status == IEscrowEngine.JobStatus.Released) {
            // Job completed without dispute — no refund possible
        } else if (job.status == IEscrowEngine.JobStatus.Resolved) {
            // Dispute resolved — only release if refund was claimed or no refund owed
            if (!refundClaimed[jobId]) {
                uint256 refundOwed = _computeRefundFromChain(jobId);
                require(refundOwed == 0, "Bridge: payer refund still claimable");
            }
        } else {
            revert("Bridge: job still active");
        }

        address token = jobToken[jobId];
        totalEscrowReserves[token] -= reserve;
        delete jobEscrowReserve[jobId];

        emit EscrowReserveReleased(jobId, token, reserve);
    }
}
