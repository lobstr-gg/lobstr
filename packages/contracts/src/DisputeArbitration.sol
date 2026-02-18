// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IDisputeArbitration.sol";
import "./interfaces/IEscrowEngine.sol";
import "./interfaces/IStakingManager.sol";
import "./interfaces/IReputationSystem.sol";
import "./interfaces/ISybilGuard.sol";

contract DisputeArbitration is IDisputeArbitration, AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    bytes32 public constant ESCROW_ROLE = keccak256("ESCROW_ROLE");
    bytes32 public constant SYBIL_GUARD_ROLE = keccak256("SYBIL_GUARD_ROLE");

    uint256 public constant COUNTER_EVIDENCE_WINDOW = 24 hours;
    uint256 public constant VOTING_DEADLINE = 3 days; // C-3: Timeout for voting phase
    uint256 public constant JUNIOR_THRESHOLD = 5_000 ether;
    uint256 public constant SENIOR_THRESHOLD = 25_000 ether;
    uint256 public constant PRINCIPAL_THRESHOLD = 100_000 ether;
    uint256 public constant JUNIOR_MAX_DISPUTE = 500 ether;
    uint256 public constant SENIOR_MAX_DISPUTE = 5_000 ether;

    uint256 public constant JUNIOR_FEE_BPS = 500;   // 5%
    uint256 public constant SENIOR_FEE_BPS = 400;   // 4%
    uint256 public constant PRINCIPAL_FEE_BPS = 300; // 3%

    uint256 public constant SLASH_MIN_BPS = 1000; // 10%
    uint256 public constant SLASH_DISTRIBUTION_BPS = 5000; // 50% to buyer, 50% to arbitration pool

    IERC20 public immutable lobToken;
    IStakingManager public immutable stakingManager;
    IReputationSystem public immutable reputationSystem;
    ISybilGuard public immutable sybilGuard; // H-4: Ban checks
    IEscrowEngine public escrowEngine; // Set post-deploy (circular dependency)

    uint256 private _nextDisputeId = 1;
    uint256 private _arbitratorNonce;

    mapping(uint256 => Dispute) private _disputes;
    mapping(address => ArbitratorInfo) private _arbitrators;
    mapping(uint256 => mapping(address => bool)) private _hasVoted;

    // H-1: Per-vote storage for accurate arbitrator reputation tracking
    mapping(uint256 => mapping(address => bool)) private _votedForBuyer;

    // C-4: Track active dispute count per arbitrator to block unstaking
    mapping(address => uint256) private _activeDisputeCount;

    address[] private _activeArbitrators;
    mapping(address => uint256) private _arbitratorIndex;
    mapping(address => bool) private _isActiveArbitrator;

    constructor(
        address _lobToken,
        address _stakingManager,
        address _reputationSystem,
        address _sybilGuard
    ) {
        require(_lobToken != address(0), "DisputeArbitration: zero token");
        require(_stakingManager != address(0), "DisputeArbitration: zero staking");
        require(_reputationSystem != address(0), "DisputeArbitration: zero reputation");
        require(_sybilGuard != address(0), "DisputeArbitration: zero sybilGuard");

        lobToken = IERC20(_lobToken);
        stakingManager = IStakingManager(_stakingManager);
        reputationSystem = IReputationSystem(_reputationSystem);
        sybilGuard = ISybilGuard(_sybilGuard);

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function stakeAsArbitrator(uint256 amount) external nonReentrant whenNotPaused {
        require(amount > 0, "DisputeArbitration: zero amount");
        // H-4: Ban check
        require(!sybilGuard.checkBanned(msg.sender), "DisputeArbitration: banned");

        ArbitratorInfo storage info = _arbitrators[msg.sender];
        info.stake += amount;

        ArbitratorRank newRank = _rankFromStake(info.stake);
        require(newRank != ArbitratorRank.None, "DisputeArbitration: below minimum stake");

        info.rank = newRank;
        info.active = true;

        if (!_isActiveArbitrator[msg.sender]) {
            _arbitratorIndex[msg.sender] = _activeArbitrators.length;
            _activeArbitrators.push(msg.sender);
            _isActiveArbitrator[msg.sender] = true;
        }

        lobToken.safeTransferFrom(msg.sender, address(this), amount);

        emit ArbitratorStaked(msg.sender, amount, newRank);
    }

    function unstakeAsArbitrator(uint256 amount) external nonReentrant {
        ArbitratorInfo storage info = _arbitrators[msg.sender];
        require(amount > 0 && amount <= info.stake, "DisputeArbitration: invalid amount");
        // C-4: Block unstaking while assigned to active disputes
        require(_activeDisputeCount[msg.sender] == 0, "DisputeArbitration: active disputes pending");

        info.stake -= amount;

        ArbitratorRank newRank = _rankFromStake(info.stake);
        info.rank = newRank;

        if (newRank == ArbitratorRank.None) {
            info.active = false;
            _removeActiveArbitrator(msg.sender);
        }

        lobToken.safeTransfer(msg.sender, amount);

        emit ArbitratorUnstaked(msg.sender, amount);
    }

    function submitDispute(
        uint256 jobId,
        address buyer,
        address seller,
        uint256 amount,
        address token,
        string calldata buyerEvidenceURI
    ) external onlyRole(ESCROW_ROLE) nonReentrant returns (uint256 disputeId) {
        require(buyer != address(0) && seller != address(0), "DisputeArbitration: zero address");
        require(amount > 0, "DisputeArbitration: zero amount");

        disputeId = _nextDisputeId++;

        Dispute storage d = _disputes[disputeId];
        d.id = disputeId;
        d.jobId = jobId;
        d.buyer = buyer;
        d.seller = seller;
        d.amount = amount;
        d.token = token;
        d.buyerEvidenceURI = buyerEvidenceURI;
        d.status = DisputeStatus.EvidencePhase;
        d.ruling = Ruling.Pending;
        d.createdAt = block.timestamp;
        d.counterEvidenceDeadline = block.timestamp + COUNTER_EVIDENCE_WINDOW;

        // Select 3 arbitrators
        address[3] memory selected = _selectArbitrators(amount);
        d.arbitrators = selected;

        // C-4: Increment active dispute count for selected arbitrators
        for (uint8 i = 0; i < 3; i++) {
            _activeDisputeCount[selected[i]] += 1;
        }

        emit DisputeCreated(disputeId, jobId, buyer, seller, amount);
        emit ArbitratorsAssigned(disputeId, selected);
    }

    function submitCounterEvidence(uint256 disputeId, string calldata sellerEvidenceURI) external nonReentrant {
        Dispute storage d = _disputes[disputeId];
        require(d.id != 0, "DisputeArbitration: dispute not found");
        require(msg.sender == d.seller, "DisputeArbitration: not seller");
        require(d.status == DisputeStatus.EvidencePhase, "DisputeArbitration: wrong status");
        require(block.timestamp <= d.counterEvidenceDeadline, "DisputeArbitration: deadline passed");

        d.sellerEvidenceURI = sellerEvidenceURI;

        // Move to voting phase with deadline
        d.status = DisputeStatus.Voting;
        d.votingDeadline = block.timestamp + VOTING_DEADLINE; // C-3

        emit CounterEvidenceSubmitted(disputeId, sellerEvidenceURI);
    }

    function advanceToVoting(uint256 disputeId) external whenNotPaused {
        Dispute storage d = _disputes[disputeId];
        require(d.id != 0, "DisputeArbitration: dispute not found");
        require(d.status == DisputeStatus.EvidencePhase, "DisputeArbitration: wrong status");
        require(block.timestamp > d.counterEvidenceDeadline, "DisputeArbitration: deadline not passed");

        d.status = DisputeStatus.Voting;
        d.votingDeadline = block.timestamp + VOTING_DEADLINE; // C-3

        emit VotingAdvanced(disputeId); // L-3: Emit event
    }

    function vote(uint256 disputeId, bool favorBuyer) external nonReentrant whenNotPaused {
        Dispute storage d = _disputes[disputeId];
        require(d.id != 0, "DisputeArbitration: dispute not found");
        require(d.status == DisputeStatus.Voting, "DisputeArbitration: not in voting");
        require(!_hasVoted[disputeId][msg.sender], "DisputeArbitration: already voted");
        require(_isAssignedArbitrator(disputeId, msg.sender), "DisputeArbitration: not assigned");
        require(block.timestamp <= d.votingDeadline, "DisputeArbitration: voting deadline passed");
        require(!sybilGuard.checkBanned(msg.sender), "DisputeArbitration: arbitrator banned");

        _hasVoted[disputeId][msg.sender] = true;
        // H-1: Store individual vote direction
        _votedForBuyer[disputeId][msg.sender] = favorBuyer;
        d.totalVotes += 1;

        if (favorBuyer) {
            d.votesForBuyer += 1;
        } else {
            d.votesForSeller += 1;
        }

        emit VoteCast(disputeId, msg.sender, favorBuyer);
    }

    /// @notice Execute ruling. Requires either all 3 votes OR voting deadline passed with >= 1 vote.
    function executeRuling(uint256 disputeId) external nonReentrant whenNotPaused {
        Dispute storage d = _disputes[disputeId];
        require(d.id != 0, "DisputeArbitration: dispute not found");
        require(d.status == DisputeStatus.Voting, "DisputeArbitration: not in voting");

        // C-3: Allow resolution with partial votes after deadline, or all 3 votes anytime
        if (d.totalVotes < 3) {
            require(block.timestamp > d.votingDeadline, "DisputeArbitration: voting still open");
        }

        d.status = DisputeStatus.Resolved;

        // C-4: Decrement active dispute count for arbitrators
        for (uint8 i = 0; i < 3; i++) {
            if (_activeDisputeCount[d.arbitrators[i]] > 0) {
                _activeDisputeCount[d.arbitrators[i]] -= 1;
            }
        }

        // Determine ruling based on available votes (majority of cast votes)
        if (d.totalVotes == 0) {
            // No arbitrators voted — arbitrator failure, not seller fault.
            // Default to buyer wins without slashing seller.
            d.ruling = Ruling.BuyerWins;
        } else if (d.votesForBuyer > d.votesForSeller) {
            d.ruling = Ruling.BuyerWins;

            // Slash seller's stake (minimum 10%)
            uint256 slashAmount = (stakingManager.getStake(d.seller) * SLASH_MIN_BPS) / 10000;
            if (slashAmount > 0) {
                stakingManager.slash(d.seller, slashAmount, d.buyer);
            }

            // Record dispute loss for seller reputation
            reputationSystem.recordDispute(d.seller, false);
        } else if (d.votesForBuyer == d.votesForSeller) {
            // Tied vote — no slash, no reputation impact, escrow splits 50/50
            d.ruling = Ruling.Draw;
        } else {
            d.ruling = Ruling.SellerWins;

            // Record dispute win for seller reputation
            reputationSystem.recordDispute(d.seller, true);
        }

        // H-1: Update arbitrator stats using actual per-vote storage
        for (uint8 i = 0; i < 3; i++) {
            address arb = d.arbitrators[i];
            ArbitratorInfo storage arbInfo = _arbitrators[arb];

            // Only credit arbitrators who actually voted
            if (_hasVoted[disputeId][arb]) {
                arbInfo.disputesHandled += 1;

                bool votedBuyer = _votedForBuyer[disputeId][arb];
                bool majorityForBuyer = d.votesForBuyer > d.votesForSeller;
                if (votedBuyer == majorityForBuyer) {
                    arbInfo.majorityVotes += 1;
                }
            }
        }

        // Release escrowed funds based on ruling
        if (d.ruling == Ruling.Draw) {
            escrowEngine.resolveDisputeDraw(d.jobId);
        } else {
            escrowEngine.resolveDispute(d.jobId, d.ruling == Ruling.BuyerWins);
        }

        emit RulingExecuted(disputeId, d.ruling);
    }

    function getDispute(uint256 disputeId) external view returns (Dispute memory) {
        Dispute memory d = _disputes[disputeId];
        require(d.id != 0, "DisputeArbitration: not found");
        return d;
    }

    function getArbitratorInfo(address arbitrator) external view returns (ArbitratorInfo memory) {
        return _arbitrators[arbitrator];
    }

    function getActiveArbitratorCount() external view returns (uint256) {
        return _activeArbitrators.length;
    }

    function getActiveDisputeCount(address arbitrator) external view returns (uint256) {
        return _activeDisputeCount[arbitrator];
    }

    // --- Admin ---

    /// @notice One-time setter for EscrowEngine (circular deployment dependency).
    ///         Must be called immediately after EscrowEngine is deployed.
    function setEscrowEngine(address _escrowEngine) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(address(escrowEngine) == address(0), "DisputeArbitration: escrow already set");
        require(_escrowEngine != address(0), "DisputeArbitration: zero escrow");
        escrowEngine = IEscrowEngine(_escrowEngine);
    }

    /// @notice Remove an arbitrator from the active pool (called by SybilGuard on ban)
    function removeArbitrator(address arbitrator) external onlyRole(SYBIL_GUARD_ROLE) {
        ArbitratorInfo storage info = _arbitrators[arbitrator];
        info.active = false;
        _removeActiveArbitrator(arbitrator);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // --- Internal ---

    function _selectArbitrators(uint256 disputeAmount) internal returns (address[3] memory selected) {
        uint256 count = _activeArbitrators.length;
        require(count >= 3, "DisputeArbitration: not enough arbitrators");

        // Non-grindable entropy: no buyer-controlled salt
        uint256 seed = uint256(keccak256(abi.encodePacked(
            block.timestamp,
            block.number,
            msg.sender,
            _arbitratorNonce++
        )));

        uint256 found = 0;
        uint256 attempts = 0;

        while (found < 3 && attempts < count * 10) {
            uint256 idx = uint256(keccak256(abi.encodePacked(seed, attempts))) % count;
            attempts++;

            // Skip if already selected
            bool duplicate = false;
            for (uint256 j = 0; j < found; j++) {
                if (_activeArbitrators[idx] == selected[j]) {
                    duplicate = true;
                    break;
                }
            }
            if (duplicate) continue;

            address candidate = _activeArbitrators[idx];
            ArbitratorInfo storage info = _arbitrators[candidate];

            // Skip banned arbitrators (safety check)
            if (sybilGuard.checkBanned(candidate)) continue;

            // Check if arbitrator can handle this dispute value
            if (info.rank == ArbitratorRank.Junior && disputeAmount > JUNIOR_MAX_DISPUTE) continue;
            if (info.rank == ArbitratorRank.Senior && disputeAmount > SENIOR_MAX_DISPUTE) continue;

            selected[found] = candidate;
            found++;
        }

        require(found == 3, "DisputeArbitration: could not select 3 arbitrators");
    }

    function _isAssignedArbitrator(uint256 disputeId, address addr) internal view returns (bool) {
        Dispute storage d = _disputes[disputeId];
        return d.arbitrators[0] == addr || d.arbitrators[1] == addr || d.arbitrators[2] == addr;
    }

    function _rankFromStake(uint256 amount) internal pure returns (ArbitratorRank) {
        if (amount >= PRINCIPAL_THRESHOLD) return ArbitratorRank.Principal;
        if (amount >= SENIOR_THRESHOLD) return ArbitratorRank.Senior;
        if (amount >= JUNIOR_THRESHOLD) return ArbitratorRank.Junior;
        return ArbitratorRank.None;
    }

    function _removeActiveArbitrator(address arb) internal {
        if (!_isActiveArbitrator[arb]) return;

        uint256 idx = _arbitratorIndex[arb];
        uint256 lastIdx = _activeArbitrators.length - 1;

        if (idx != lastIdx) {
            address lastArb = _activeArbitrators[lastIdx];
            _activeArbitrators[idx] = lastArb;
            _arbitratorIndex[lastArb] = idx;
        }

        _activeArbitrators.pop();
        delete _arbitratorIndex[arb];
        _isActiveArbitrator[arb] = false;
    }
}
