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
