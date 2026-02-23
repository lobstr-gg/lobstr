// Human-readable viem ABIs derived from packages/contracts/src/interfaces/
// NOTE: abitype 1.2.3 does not support tuple() wrappers in return types — use flat returns

export const LOB_TOKEN_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
] as const;

export const STAKING_MANAGER_ABI = [
  'function stake(uint256 amount)',
  'function requestUnstake(uint256 amount)',
  'function unstake()',
  'function getTier(address user) view returns (uint8)',
  'function getStake(address user) view returns (uint256)',
  'function getStakeInfo(address user) view returns (uint256 amount, uint256 unstakeRequestTime, uint256 unstakeRequestAmount)',
  'function tierThreshold(uint8 tier) pure returns (uint256)',
  'function maxListings(uint8 tier) pure returns (uint256)',
  'event Staked(address indexed user, uint256 amount, uint8 newTier)',
  'event UnstakeRequested(address indexed user, uint256 amount, uint256 availableAt)',
  'event Unstaked(address indexed user, uint256 amount, uint8 newTier)',
] as const;

export const SERVICE_REGISTRY_ABI = [
  'function createListing(uint8 category, string title, string description, uint256 pricePerUnit, address settlementToken, uint256 estimatedDeliverySeconds, string metadataURI) returns (uint256)',
  'function updateListing(uint256 listingId, string title, string description, uint256 pricePerUnit, address settlementToken, uint256 estimatedDeliverySeconds, string metadataURI)',
  'function deactivateListing(uint256 listingId)',
  'function getListing(uint256 listingId) view returns (uint256 id, address provider, uint8 category, string title, string description, uint256 pricePerUnit, address settlementToken, uint256 estimatedDeliverySeconds, string metadataURI, bool active, uint256 createdAt)',
  'function getProviderListingCount(address provider) view returns (uint256)',
  'event ListingCreated(uint256 indexed listingId, address indexed provider, uint8 category, uint256 pricePerUnit, address settlementToken)',
  'event ListingUpdated(uint256 indexed listingId, uint256 pricePerUnit, address settlementToken)',
  'event ListingDeactivated(uint256 indexed listingId)',
] as const;

export const ESCROW_ENGINE_ABI = [
  'function createJob(uint256 listingId, address seller, uint256 amount, address token) returns (uint256)',
  'function submitDelivery(uint256 jobId, string metadataURI)',
  'function confirmDelivery(uint256 jobId)',
  'function initiateDispute(uint256 jobId, string evidenceURI)',
  'function autoRelease(uint256 jobId)',
  'function getJob(uint256 jobId) view returns (uint256 id, uint256 listingId, address buyer, address seller, uint256 amount, address token, uint256 fee, uint8 status, uint256 createdAt, uint256 disputeWindowEnd, string deliveryMetadataURI)',
  'event JobCreated(uint256 indexed jobId, uint256 indexed listingId, address indexed buyer, address seller, uint256 amount, address token, uint256 fee)',
  'event DeliverySubmitted(uint256 indexed jobId, string metadataURI)',
  'event DeliveryConfirmed(uint256 indexed jobId, address indexed buyer)',
  'event DisputeInitiated(uint256 indexed jobId, uint256 indexed disputeId, string evidenceURI)',
  'event FundsReleased(uint256 indexed jobId, address indexed seller, uint256 amount)',
  'event AutoReleased(uint256 indexed jobId, address indexed caller)',
] as const;

export const AIRDROP_CLAIM_V2_ABI = [
  'function submitProof(uint256[2] pA, uint256[2][2] pB, uint256[2] pC, uint256[3] pubSignals, bytes approvalSig, uint256 powNonce)',
  'function releaseVestedTokens()',
  'function getClaimInfo(address claimant) view returns (bool claimed, uint256 amount, uint256 vestedAmount, uint256 claimedAt, uint8 tier, uint256 workspaceHash)',
  'function isWorkspaceHashUsed(uint256 hash) view returns (bool)',
  'function approvalSigner() view returns (address)',
  'function difficultyTarget() view returns (uint256)',
  'function totalClaimed() view returns (uint256)',
  'function claimWindowStart() view returns (uint256)',
  'function claimWindowEnd() view returns (uint256)',
  'event ProofSubmitted(address indexed claimant, uint256 workspaceHash, uint8 tier)',
  'event AirdropClaimed(address indexed claimant, uint256 amount, uint256 immediateRelease, uint8 tier)',
  'event VestedTokensReleased(address indexed claimant, uint256 amount)',
] as const;

export const REPUTATION_SYSTEM_ABI = [
  'function getScore(address user) view returns (uint256 score, uint8 tier)',
  'function getReputationData(address user) view returns (uint256 score, uint256 completions, uint256 disputesLost, uint256 disputesWon, uint256 firstActivityTimestamp)',
  'event ScoreUpdated(address indexed user, uint256 newScore, uint8 newTier)',
] as const;

export const DISPUTE_ARBITRATION_ABI = [
  'function stakeAsArbitrator(uint256 amount)',
  'function unstakeAsArbitrator(uint256 amount)',
  'function submitCounterEvidence(uint256 disputeId, string sellerEvidenceURI)',
  'function vote(uint256 disputeId, bool favorBuyer)',
  'function executeRuling(uint256 disputeId)',
  'function getDispute(uint256 disputeId) view returns (uint256 id, uint256 jobId, address buyer, address seller, uint256 amount, address token, string buyerEvidenceURI, string sellerEvidenceURI, uint8 status, uint8 ruling, uint256 createdAt, uint256 counterEvidenceDeadline, uint256 votingDeadline, uint8 votesForBuyer, uint8 votesForSeller, uint8 totalVotes)',
  'function getArbitratorInfo(address arbitrator) view returns (uint256 stake, uint8 rank, uint256 disputesHandled, uint256 majorityVotes, bool active)',
  'event DisputeCreated(uint256 indexed disputeId, uint256 indexed jobId, address indexed buyer, address seller, uint256 amount)',
  'event ArbitratorsAssigned(uint256 indexed disputeId)',
  'event CounterEvidenceSubmitted(uint256 indexed disputeId, string evidenceURI)',
  'event VoteCast(uint256 indexed disputeId, address indexed arbitrator, bool favorBuyer)',
  'event RulingExecuted(uint256 indexed disputeId, uint8 ruling)',
  'event ArbitratorStaked(address indexed arbitrator, uint256 amount, uint8 rank)',
  'event ArbitratorUnstaked(address indexed arbitrator, uint256 amount)',
  'event VotingAdvanced(uint256 indexed disputeId)',
] as const;

export const TREASURY_GOVERNOR_ABI = [
  'function createProposal(address token, address recipient, uint256 amount, string description) returns (uint256)',
  'function approveProposal(uint256 proposalId)',
  'function executeProposal(uint256 proposalId)',
  'function cancelProposal(uint256 proposalId)',
  'function getProposal(uint256 proposalId) view returns ((uint256 id, address proposer, address token, address recipient, uint256 amount, string description, uint8 status, uint256 approvalCount, uint256 createdAt, uint256 timelockEnd))',
  'function isProposalExpired(uint256 proposalId) view returns (bool)',
  'function createAdminProposal(address target, bytes data, string description) returns (uint256)',
  'function approveAdminProposal(uint256 proposalId)',
  'function executeAdminProposal(uint256 proposalId)',
  'function cancelAdminProposal(uint256 proposalId)',
  'function getAdminProposal(uint256 proposalId) view returns ((uint256 id, address proposer, address target, bytes callData, string description, uint8 status, uint256 approvalCount, uint256 createdAt, uint256 timelockEnd))',
  'function adminProposalApprovals(uint256 proposalId, address signer) view returns (bool)',
  'function createStream(address recipient, address token, uint256 totalAmount, uint256 duration, string role) returns (uint256)',
  'function claimStream(uint256 streamId)',
  'function cancelStream(uint256 streamId)',
  'function getStream(uint256 streamId) view returns ((uint256 id, address recipient, address token, uint256 totalAmount, uint256 claimedAmount, uint256 startTime, uint256 endTime, string role, bool active))',
  'function streamClaimable(uint256 streamId) view returns (uint256)',
  'function getRecipientStreams(address recipient) view returns (uint256[])',
  'function getBalance(address token) view returns (uint256)',
  'function deposit(address token, uint256 amount)',
  'function requiredApprovals() view returns (uint256)',
  'function signerCount() view returns (uint256)',
  'event ProposalCreated(uint256 indexed proposalId, address indexed proposer, address token, address recipient, uint256 amount, string description)',
  'event ProposalApproved(uint256 indexed proposalId, address indexed signer)',
  'event ProposalApprovedForExecution(uint256 indexed proposalId, uint256 timelockEnd)',
  'event ProposalExecuted(uint256 indexed proposalId, address indexed recipient, uint256 amount)',
  'event ProposalCancelled(uint256 indexed proposalId, address indexed canceller)',
  'event AdminProposalCreated(uint256 indexed proposalId, address indexed target, address indexed proposer)',
  'event AdminProposalApproved(uint256 indexed proposalId, address indexed signer)',
  'event AdminProposalApprovedForExecution(uint256 indexed proposalId, uint256 timelockEnd)',
  'event AdminProposalExecuted(uint256 indexed proposalId, address indexed target)',
  'event AdminProposalCancelled(uint256 indexed proposalId, address indexed canceller)',
  'event StreamCreated(uint256 indexed streamId, address indexed recipient, address token, uint256 totalAmount, uint256 startTime, uint256 endTime, string role)',
  'event StreamClaimed(uint256 indexed streamId, address indexed recipient, uint256 amount)',
  'event StreamCancelled(uint256 indexed streamId)',
  'event FundsReceived(address indexed token, address indexed from, uint256 amount)',
  'event FundsSeized(address indexed token, address indexed from, uint256 amount, string reason)',
  'event SignerAdded(address indexed signer)',
  'event SignerRemoved(address indexed signer)',
  'event RequiredApprovalsChanged(uint256 oldValue, uint256 newValue)',
] as const;

export const SYBIL_GUARD_ABI = [
  'function submitReport(address[] subjects, uint8 violation, string evidenceURI, string notes) returns (uint256)',
  'function confirmReport(uint256 reportId)',
  'function rejectReport(uint256 reportId)',
  'function unban(address account)',
  'function checkBanned(address account) view returns (bool)',
  'function checkAnyBanned(address[] accounts) view returns (bool)',
  'function reports(uint256 reportId) view returns (uint256 id, address reporter, uint8 violation, string evidenceURI, uint8 status, uint256 confirmations, uint256 createdAt, string notes)',
  'function banRecords(address account) view returns (bool banned, uint256 bannedAt, uint256 unbannedAt, uint8 reason, uint256 reportId, uint256 seizedAmount, address seizedToken)',
  'function isBanned(address account) view returns (bool)',
  'function totalBans() view returns (uint256)',
  'function totalSeized() view returns (uint256)',
  'function totalReports() view returns (uint256)',
  'event ReportCreated(uint256 indexed reportId, address indexed reporter, uint8 violation, address[] subjects, string evidenceURI)',
  'event ReportConfirmed(uint256 indexed reportId, address indexed judge)',
  'event ReportRejected(uint256 indexed reportId, address indexed judge)',
  'event AddressBanned(address indexed account, uint8 reason, uint256 indexed reportId, uint256 seizedAmount)',
  'event AddressUnbanned(address indexed account, address indexed unbannedBy)',
  'event FundsSeized(address indexed account, address indexed token, uint256 amount, uint256 indexed reportId)',
  'event LinkedAccountsRegistered(address indexed primary, address[] linked)',
] as const;

export const STAKING_REWARDS_ABI = [
  'function earned(address user, address token) view returns (uint256)',
  'function claimRewards(address token)',
  'function syncStake()',
  'function rewardPerToken(address token) view returns (uint256)',
  'function getEffectiveBalance(address user) view returns (uint256)',
  'function getTotalEffectiveBalance() view returns (uint256)',
  'function getRewardTokens() view returns (address[])',
  'function getLastSyncTimestamp(address user) view returns (uint256)',
] as const;

export const REWARD_DISTRIBUTOR_ABI = [
  'function claimableBalance(address account, address token) view returns (uint256)',
  'function claim(address token)',
  'function totalDistributed() view returns (uint256)',
  'function totalDeposited() view returns (uint256)',
  'function availableBudget(address token) view returns (uint256)',
] as const;

export const LIQUIDITY_MINING_ABI = [
  'function stake(uint256 amount)',
  'function withdraw(uint256 amount)',
  'function getReward()',
  'function exit()',
  'function emergencyWithdraw()',
  'function earned(address account) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function rewardRate() view returns (uint256)',
  'function getBoostMultiplier(address account) view returns (uint256)',
] as const;

export const INSURANCE_POOL_ABI = [
  // Pool staking
  'function depositToPool(uint256 amount)',
  'function withdrawFromPool(uint256 amount)',
  'function claimPoolRewards()',

  // Insured jobs
  'function createInsuredJob(uint256 listingId, address seller, uint256 amount, address token) returns (uint256 jobId)',
  'function confirmInsuredDelivery(uint256 jobId)',
  'function initiateInsuredDispute(uint256 jobId, string evidenceURI)',
  'function fileClaim(uint256 jobId)',
  'function claimRefund(uint256 jobId)',
  'function bookJob(uint256 jobId)',

  // Admin / Governor
  'function updatePremiumRate(uint256 newBps)',
  'function updateCoverageCaps(uint256 bronze, uint256 silver, uint256 gold, uint256 platinum)',
  'function pause()',
  'function unpause()',

  // Views
  'function getPoolStats() view returns (uint256 totalDeposits, uint256 totalPremiums, uint256 totalClaims, uint256 available)',
  'function getStakerInfo(address staker) view returns (uint256 deposited, uint256 rewardPerTokenPaid, uint256 pendingRewards)',
  'function poolEarned(address staker) view returns (uint256)',
  'function getCoverageCap(address buyer) view returns (uint256)',
  'function isInsuredJob(uint256 jobId) view returns (bool)',
  'function premiumRateBps() view returns (uint256)',
  'function coverageCapBronze() view returns (uint256)',
  'function coverageCapSilver() view returns (uint256)',
  'function coverageCapGold() view returns (uint256)',
  'function coverageCapPlatinum() view returns (uint256)',
  'function paused() view returns (bool)',
] as const;

export const LIGHTNING_GOVERNOR_ABI = [
  'function createProposal(address target, bytes data, string description) returns (uint256)',
  'function vote(uint256 proposalId)',
  'function execute(uint256 proposalId)',
  'function cancel(uint256 proposalId)',
  'function getProposal(uint256 proposalId) view returns (uint256 id, address proposer, address target, bytes callData, string description, uint8 status, uint256 voteCount, uint256 createdAt, uint256 votingDeadline, uint256 approvedAt, uint256 executionDeadline)',
  'function hasVoted(uint256 proposalId, address voter) view returns (bool)',
  'function isWhitelisted(address target, bytes4 selector) view returns (bool)',
  'function getEffectiveStatus(uint256 proposalId) view returns (uint8)',
  'function proposalCount() view returns (uint256)',
  'function quorum() view returns (uint256)',
  'function executionDelay() view returns (uint256)',
  'function votingWindow() view returns (uint256)',
  'function executionWindow() view returns (uint256)',
  'event ProposalCreated(uint256 indexed proposalId, address indexed proposer, address target, bytes4 selector, string description)',
  'event Voted(uint256 indexed proposalId, address indexed voter, uint256 newVoteCount)',
  'event ProposalApproved(uint256 indexed proposalId, uint256 executionDeadline)',
  'event ProposalExecuted(uint256 indexed proposalId, address indexed executor)',
  'event ProposalCancelled(uint256 indexed proposalId, address indexed cancelledBy)',
] as const;
