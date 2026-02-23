import { onchainTable, relations } from "@ponder/core";

// === Accounts ===

export const account = onchainTable("account", (t) => ({
  address: t.hex().primaryKey(),
  lobBalance: t.bigint().notNull().default(0n),
  stakeAmount: t.bigint().notNull().default(0n),
  stakeTier: t.integer().notNull().default(0), // 0=None,1=Bronze,2=Silver,3=Gold,4=Platinum
  reputationScore: t.bigint().notNull().default(0n),
  reputationTier: t.integer().notNull().default(0),
  completions: t.integer().notNull().default(0),
  disputesWon: t.integer().notNull().default(0),
  disputesLost: t.integer().notNull().default(0),
  isArbitrator: t.boolean().notNull().default(false),
  arbitratorStake: t.bigint().notNull().default(0n),
  arbitratorRank: t.integer().notNull().default(0),
  createdAt: t.bigint().notNull(),
}));

// === Listings ===

export const listing = onchainTable("listing", (t) => ({
  id: t.bigint().primaryKey(),
  provider: t.hex().notNull(),
  category: t.integer().notNull(),
  title: t.text().notNull(),
  description: t.text().notNull(),
  pricePerUnit: t.bigint().notNull(),
  settlementToken: t.hex().notNull(),
  estimatedDeliverySeconds: t.bigint().notNull(),
  metadataURI: t.text().notNull(),
  active: t.boolean().notNull().default(true),
  createdAt: t.bigint().notNull(),
}));

export const listingRelations = relations(listing, ({ one }) => ({
  providerAccount: one(account, {
    fields: [listing.provider],
    references: [account.address],
  }),
}));

// === Jobs ===

export const job = onchainTable("job", (t) => ({
  id: t.bigint().primaryKey(),
  listingId: t.bigint().notNull(),
  buyer: t.hex().notNull(),
  seller: t.hex().notNull(),
  amount: t.bigint().notNull(),
  token: t.hex().notNull(),
  fee: t.bigint().notNull(),
  status: t.integer().notNull(), // 0=Created,1=Active,2=Delivered,3=Confirmed,4=Disputed,5=Released,6=Resolved
  createdAt: t.bigint().notNull(),
  disputeWindowEnd: t.bigint().notNull().default(0n),
  deliveryMetadataURI: t.text().notNull().default(""),
  disputeId: t.bigint(),
  // x402 bridge fields
  isX402: t.boolean().notNull().default(false),
  x402Payer: t.hex(),
  x402Nonce: t.hex(),
}));

export const jobRelations = relations(job, ({ one }) => ({
  listingRef: one(listing, {
    fields: [job.listingId],
    references: [listing.id],
  }),
  buyerAccount: one(account, {
    fields: [job.buyer],
    references: [account.address],
  }),
  sellerAccount: one(account, {
    fields: [job.seller],
    references: [account.address],
  }),
}));

// === Disputes ===

export const dispute = onchainTable("dispute", (t) => ({
  id: t.bigint().primaryKey(),
  jobId: t.bigint().notNull(),
  buyer: t.hex().notNull(),
  seller: t.hex().notNull(),
  amount: t.bigint().notNull(),
  token: t.hex().notNull(),
  buyerEvidenceURI: t.text().notNull(),
  sellerEvidenceURI: t.text().notNull().default(""),
  status: t.integer().notNull(), // 0=Open,1=EvidencePhase,2=Voting,3=Resolved
  ruling: t.integer().notNull().default(0), // 0=Pending,1=BuyerWins,2=SellerWins
  createdAt: t.bigint().notNull(),
  counterEvidenceDeadline: t.bigint().notNull(),
  arbitrator0: t.hex(),
  arbitrator1: t.hex(),
  arbitrator2: t.hex(),
  votesForBuyer: t.integer().notNull().default(0),
  votesForSeller: t.integer().notNull().default(0),
}));

// === Stake Events ===

export const stakeEvent = onchainTable("stake_event", (t) => ({
  id: t.text().primaryKey(), // txHash-logIndex
  user: t.hex().notNull(),
  eventType: t.text().notNull(), // "stake" | "unstake_request" | "unstake" | "slash"
  amount: t.bigint().notNull(),
  newTier: t.integer(),
  timestamp: t.bigint().notNull(),
  blockNumber: t.bigint().notNull(),
}));

// === Fund Release Events ===

export const fundsReleasedEvent = onchainTable("funds_released_event", (t) => ({
  id: t.text().primaryKey(),
  jobId: t.bigint().notNull(),
  recipient: t.hex().notNull(),
  amount: t.bigint().notNull(),
  timestamp: t.bigint().notNull(),
  blockNumber: t.bigint().notNull(),
}));

// === Directives ===

export const directive = onchainTable("directive", (t) => ({
  id: t.bigint().primaryKey(),
  directiveType: t.integer().notNull(),
  poster: t.hex().notNull(),
  target: t.hex().notNull(),
  contentHash: t.hex().notNull(),
  contentURI: t.text().notNull(),
  status: t.integer().notNull(), // 0=Active, 1=Executed, 2=Cancelled
  createdAt: t.bigint().notNull(),
  expiresAt: t.bigint().notNull(),
}));

// === X402 Bridge Events ===

export const x402BridgeEvent = onchainTable("x402_bridge_event", (t) => ({
  id: t.text().primaryKey(), // txHash-logIndex
  eventType: t.text().notNull(), // "delivery_confirmed" | "dispute_initiated" | "refund_claimed" | "refund_registered" | "reserve_released" | "stranded_recovered"
  jobId: t.bigint(),
  payer: t.hex(),
  token: t.hex(),
  amount: t.bigint(),
  timestamp: t.bigint().notNull(),
  blockNumber: t.bigint().notNull(),
}));

// === Reviews ===

export const review = onchainTable("review", (t) => ({
  id: t.bigint().primaryKey(),
  jobId: t.bigint().notNull(),
  reviewer: t.hex().notNull(),
  subject: t.hex().notNull(),
  rating: t.integer().notNull(), // 1-5
  metadataURI: t.text().notNull(),
  timestamp: t.bigint().notNull(),
}));

export const reviewRelations = relations(review, ({ one }) => ({
  jobRef: one(job, {
    fields: [review.jobId],
    references: [job.id],
  }),
  reviewerAccount: one(account, {
    fields: [review.reviewer],
    references: [account.address],
  }),
}));

// === Loans ===

export const loan = onchainTable("loan", (t) => ({
  id: t.bigint().primaryKey(),
  borrower: t.hex().notNull(),
  lender: t.hex(),
  principal: t.bigint().notNull(),
  interestAmount: t.bigint().notNull().default(0n),
  protocolFee: t.bigint().notNull().default(0n),
  collateralAmount: t.bigint().notNull().default(0n),
  totalRepaid: t.bigint().notNull().default(0n),
  status: t.integer().notNull(), // 0=Requested,1=Funded,2=Repaid,3=Defaulted,4=Cancelled,5=Liquidated
  term: t.integer().notNull(), // 0=Week,1=Month,2=Quarter
  requestedAt: t.bigint().notNull(),
  fundedAt: t.bigint().notNull().default(0n),
  dueDate: t.bigint().notNull().default(0n),
}));

export const loanRelations = relations(loan, ({ one }) => ({
  borrowerAccount: one(account, {
    fields: [loan.borrower],
    references: [account.address],
  }),
}));

// === Skills ===

export const skill = onchainTable("skill", (t) => ({
  id: t.bigint().primaryKey(),
  seller: t.hex().notNull(),
  assetType: t.integer().notNull(), // 0=API,1=Model,2=Dataset,3=Tool,4=Pipeline
  deliveryMethod: t.integer().notNull(), // 0=API,1=Download,2=Escrow
  pricingModel: t.integer().notNull(), // 0=OneTime,1=Subscription,2=PerCall
  title: t.text().notNull(),
  description: t.text().notNull(),
  metadataURI: t.text().notNull(),
  price: t.bigint().notNull(),
  settlementToken: t.hex().notNull(),
  active: t.boolean().notNull().default(true),
  totalPurchases: t.bigint().notNull().default(0n),
  totalCalls: t.bigint().notNull().default(0n),
  createdAt: t.bigint().notNull(),
}));

export const skillRelations = relations(skill, ({ one, many }) => ({
  sellerAccount: one(account, {
    fields: [skill.seller],
    references: [account.address],
  }),
  purchases: many(skillPurchase),
}));

// === Skill Purchases ===

export const skillPurchase = onchainTable("skill_purchase", (t) => ({
  id: t.text().primaryKey(), // txHash-logIndex
  skillId: t.bigint().notNull(),
  buyer: t.hex().notNull(),
  accessId: t.bigint().notNull(),
  pricingModel: t.integer().notNull(),
  amount: t.bigint().notNull(),
  timestamp: t.bigint().notNull(),
  blockNumber: t.bigint().notNull(),
}));

export const skillPurchaseRelations = relations(skillPurchase, ({ one }) => ({
  skillRef: one(skill, {
    fields: [skillPurchase.skillId],
    references: [skill.id],
  }),
  buyerAccount: one(account, {
    fields: [skillPurchase.buyer],
    references: [account.address],
  }),
}));

// === Pipelines ===

export const pipeline = onchainTable("pipeline", (t) => ({
  id: t.bigint().primaryKey(),
  owner: t.hex().notNull(),
  active: t.boolean().notNull().default(true),
  totalExecutions: t.bigint().notNull().default(0n),
  createdAt: t.bigint().notNull(),
}));

export const pipelineRelations = relations(pipeline, ({ one }) => ({
  ownerAccount: one(account, {
    fields: [pipeline.owner],
    references: [account.address],
  }),
}));

// === Skill Usage Events ===

export const skillUsageEvent = onchainTable("skill_usage_event", (t) => ({
  id: t.text().primaryKey(), // txHash-logIndex
  accessId: t.bigint().notNull(),
  skillId: t.bigint().notNull(),
  calls: t.bigint().notNull(),
  cost: t.bigint().notNull(),
  timestamp: t.bigint().notNull(),
  blockNumber: t.bigint().notNull(),
}));

// === Skill Credit Events ===

export const skillCreditEvent = onchainTable("skill_credit_event", (t) => ({
  id: t.text().primaryKey(), // txHash-logIndex
  eventType: t.text().notNull(), // "deposit" | "withdrawal" | "seller_paid"
  account: t.hex().notNull(),
  token: t.hex().notNull(),
  amount: t.bigint().notNull(),
  timestamp: t.bigint().notNull(),
  blockNumber: t.bigint().notNull(),
}));

// === Subscriptions ===

export const subscription = onchainTable("subscription", (t) => ({
  id: t.bigint().primaryKey(),
  buyer: t.hex().notNull(),
  seller: t.hex().notNull(),
  token: t.hex().notNull(),
  amount: t.bigint().notNull(),
  interval: t.bigint().notNull(),
  nextDue: t.bigint().notNull(),
  maxCycles: t.bigint().notNull(),
  cyclesCompleted: t.bigint().notNull().default(0n),
  status: t.integer().notNull(), // 0=Active,1=Paused,2=Cancelled,3=Completed
  listingId: t.bigint().notNull(),
  metadataURI: t.text().notNull(),
  createdAt: t.bigint().notNull(),
}));

export const subscriptionRelations = relations(subscription, ({ one }) => ({
  buyerAccount: one(account, {
    fields: [subscription.buyer],
    references: [account.address],
  }),
}));

// === Insurance Events ===

export const insuranceEvent = onchainTable("insurance_event", (t) => ({
  id: t.text().primaryKey(), // txHash-logIndex
  eventType: t.text().notNull(), // "pool_deposited" | "pool_withdrawn" | "insured_job_created" | "premium_collected" | "claim_paid"
  account: t.hex().notNull(),
  jobId: t.bigint(),
  amount: t.bigint().notNull(),
  timestamp: t.bigint().notNull(),
  blockNumber: t.bigint().notNull(),
}));

// === Staking Reward Events ===

export const stakingRewardEvent = onchainTable("staking_reward_event", (t) => ({
  id: t.text().primaryKey(), // txHash-logIndex
  eventType: t.text().notNull(), // "reward_notified" | "reward_token_added" | "rewards_claimed" | "stake_synced"
  user: t.hex(),
  token: t.hex(),
  amount: t.bigint(),
  timestamp: t.bigint().notNull(),
  blockNumber: t.bigint().notNull(),
}));

// === Liquidity Mining Events ===

export const liquidityMiningEvent = onchainTable("liquidity_mining_event", (t) => ({
  id: t.text().primaryKey(), // txHash-logIndex
  eventType: t.text().notNull(), // "staked" | "withdrawn" | "reward_paid" | "reward_notified" | "emergency_withdrawn"
  user: t.hex(),
  amount: t.bigint().notNull(),
  timestamp: t.bigint().notNull(),
  blockNumber: t.bigint().notNull(),
}));

// === Affiliate Events ===

export const affiliateEvent = onchainTable("affiliate_event", (t) => ({
  id: t.text().primaryKey(), // txHash-logIndex
  eventType: t.text().notNull(), // "referral_registered" | "referral_reward_credited" | "rewards_claimed"
  referrer: t.hex().notNull(),
  referred: t.hex(),
  token: t.hex(),
  amount: t.bigint(),
  timestamp: t.bigint().notNull(),
  blockNumber: t.bigint().notNull(),
}));

// === Credit Lines (X402CreditFacility) ===

export const creditLine = onchainTable("credit_line", (t) => ({
  id: t.hex().primaryKey(), // agent address
  creditLimit: t.bigint().notNull(),
  totalDrawn: t.bigint().notNull().default(0n),
  totalRepaid: t.bigint().notNull().default(0n),
  interestRateBps: t.bigint().notNull(),
  collateralDeposited: t.bigint().notNull(),
  status: t.integer().notNull(), // 0=Active,1=Closed,2=Frozen
  openedAt: t.bigint().notNull(),
  defaults: t.integer().notNull().default(0),
  activeDraws: t.integer().notNull().default(0),
}));

// === Credit Draws (X402CreditFacility) ===

export const creditDraw = onchainTable("credit_draw", (t) => ({
  id: t.bigint().primaryKey(),
  agent: t.hex().notNull(),
  amount: t.bigint().notNull(),
  escrowJobId: t.bigint().notNull(),
  drawnAt: t.bigint().notNull(),
  repaidAt: t.bigint().notNull().default(0n),
  liquidated: t.boolean().notNull().default(false),
}));

// === Appeals (DisputeArbitration v3) ===

export const appeal = onchainTable("appeal", (t) => ({
  id: t.text().primaryKey(), // txHash-logIndex
  disputeId: t.bigint().notNull(),
  appellant: t.hex().notNull(),
  bondAmount: t.bigint().notNull(),
  eventType: t.text().notNull(), // "appeal_filed" | "appeal_bond_forfeited" | "appeal_bond_returned" | "ruling_finalized"
  timestamp: t.bigint().notNull(),
  blockNumber: t.bigint().notNull(),
}));

// === Arbitration Event Stream ===

export const arbitrationEvent = onchainTable("arbitration_event", (t) => ({
  id: t.text().primaryKey(), // txHash-logIndex
  eventType: t.text().notNull(), // "voting_advanced" | "ruling_finalized" | "appeal_*" | "arbitrator_*" | "collusion_flagged"
  disputeId: t.bigint(),
  arbitrator: t.hex(),
  arbitratorA: t.hex(),
  arbitratorB: t.hex(),
  appealer: t.hex(),
  amount: t.bigint(),
  ruling: t.integer(),
  metric: t.bigint(), // agreement rate, etc.
  timestamp: t.bigint().notNull(),
  blockNumber: t.bigint().notNull(),
}));

// === Escrow Meta Event Stream ===

export const escrowMetaEvent = onchainTable("escrow_meta_event", (t) => ({
  id: t.text().primaryKey(), // txHash-logIndex
  eventType: t.text().notNull(), // "skill_escrow_created" | "token_allowlisted" | "token_removed"
  jobId: t.bigint(),
  skillId: t.bigint(),
  token: t.hex(),
  buyer: t.hex(),
  seller: t.hex(),
  amount: t.bigint(),
  timestamp: t.bigint().notNull(),
  blockNumber: t.bigint().notNull(),
}));

// === SybilGuard Event Stream ===

export const sybilEvent = onchainTable("sybil_event", (t) => ({
  id: t.text().primaryKey(), // txHash-logIndex
  eventType: t.text().notNull(),
  reportId: t.bigint(),
  account: t.hex(),
  actor: t.hex(),
  token: t.hex(),
  amount: t.bigint(),
  metric: t.bigint(),
  violation: t.integer(),
  executeAfter: t.bigint(),
  timestamp: t.bigint().notNull(),
  blockNumber: t.bigint().notNull(),
}));

// === Multi-Party Groups ===

export const multiPartyGroup = onchainTable("multi_party_group", (t) => ({
  id: t.bigint().primaryKey(),
  buyer: t.hex().notNull(),
  totalAmount: t.bigint().notNull(),
  token: t.hex().notNull(),
  jobCount: t.integer().notNull(),
  metadataURI: t.text().notNull(),
  createdAt: t.bigint().notNull(),
  completed: t.boolean().notNull().default(false),
}));

// === Bond Markets (BondingEngine) ===

export const bondMarket = onchainTable("bond_market", (t) => ({
  id: t.bigint().primaryKey(),
  quoteToken: t.hex().notNull(),
  pricePer1LOB: t.bigint().notNull(),
  discountBps: t.bigint().notNull(),
  vestingPeriod: t.bigint().notNull(),
  capacity: t.bigint().notNull(),
  sold: t.bigint().notNull().default(0n),
  active: t.boolean().notNull().default(true),
  createdAt: t.bigint().notNull(),
}));

export const bondPosition = onchainTable("bond_position", (t) => ({
  id: t.bigint().primaryKey(),
  marketId: t.bigint().notNull(),
  owner: t.hex().notNull(),
  payout: t.bigint().notNull(),
  claimed: t.bigint().notNull().default(0n),
  vestEnd: t.bigint().notNull(),
  createdAt: t.bigint().notNull(),
}));

export const bondPositionRelations = relations(bondPosition, ({ one }) => ({
  market: one(bondMarket, {
    fields: [bondPosition.marketId],
    references: [bondMarket.id],
  }),
  ownerAccount: one(account, {
    fields: [bondPosition.owner],
    references: [account.address],
  }),
}));

// === Proposals (LightningGovernor) ===

export const proposal = onchainTable("proposal", (t) => ({
  id: t.bigint().primaryKey(),
  proposer: t.hex().notNull(),
  target: t.hex().notNull(),
  selector: t.hex().notNull(),
  description: t.text().notNull(),
  status: t.integer().notNull(), // 0=Active,1=Approved,2=Executed,3=Cancelled,4=Expired
  voteCount: t.bigint().notNull().default(0n),
  createdAt: t.bigint().notNull(),
  approvedAt: t.bigint().notNull().default(0n),
  executionDeadline: t.bigint().notNull().default(0n),
}));

export const proposalRelations = relations(proposal, ({ one }) => ({
  proposerAccount: one(account, {
    fields: [proposal.proposer],
    references: [account.address],
  }),
}));

export const proposalVote = onchainTable("proposal_vote", (t) => ({
  id: t.text().primaryKey(), // txHash-logIndex
  proposalId: t.bigint().notNull(),
  voter: t.hex().notNull(),
  newVoteCount: t.bigint().notNull(),
  timestamp: t.bigint().notNull(),
  blockNumber: t.bigint().notNull(),
}));

// === Reward Streams (RewardScheduler) ===

export const rewardStream = onchainTable("reward_stream", (t) => ({
  id: t.bigint().primaryKey(),
  targetType: t.integer().notNull(), // 0=STAKING_REWARDS,1=LIQUIDITY_MINING
  rewardToken: t.hex().notNull(),
  emissionPerSecond: t.bigint().notNull(),
  endTime: t.bigint().notNull(),
  active: t.boolean().notNull().default(true),
  totalDripped: t.bigint().notNull().default(0n),
  createdAt: t.bigint().notNull(),
}));

export const rewardStreamEvent = onchainTable("reward_stream_event", (t) => ({
  id: t.text().primaryKey(), // txHash-logIndex
  eventType: t.text().notNull(), // "dripped" | "paused" | "resumed" | "updated" | "top_up" | "budget_withdrawn"
  streamId: t.bigint(),
  token: t.hex(),
  amount: t.bigint(),
  timestamp: t.bigint().notNull(),
  blockNumber: t.bigint().notNull(),
}));

// === Token Transfers (LOBToken) ===

export const tokenTransfer = onchainTable("token_transfer", (t) => ({
  id: t.text().primaryKey(), // txHash-logIndex
  from: t.hex().notNull(),
  to: t.hex().notNull(),
  amount: t.bigint().notNull(),
  timestamp: t.bigint().notNull(),
  blockNumber: t.bigint().notNull(),
}));

// === Vesting Events (TeamVesting) ===

export const vestingEvent = onchainTable("vesting_event", (t) => ({
  id: t.text().primaryKey(), // txHash-logIndex
  eventType: t.text().notNull(), // "allocation_set" | "tokens_released" | "vesting_revoked"
  amount: t.bigint().notNull(),
  beneficiary: t.hex(),
  returnTo: t.hex(),
  returned: t.bigint(),
  timestamp: t.bigint().notNull(),
  blockNumber: t.bigint().notNull(),
}));
