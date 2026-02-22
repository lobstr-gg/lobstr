import { ponder } from "@/generated";
import * as schema from "../ponder.schema";

// ============================================
// StakingManager Events
// ============================================

ponder.on("StakingManager:Staked", async ({ event, context }) => {
  const { db } = context;
  const { user, amount, newTier } = event.args;

  await db
    .insert(schema.account)
    .values({
      address: user,
      stakeAmount: amount,
      stakeTier: newTier,
      createdAt: event.block.timestamp,
    })
    .onConflictDoUpdate((row) => ({
      stakeAmount: row.stakeAmount + amount,
      stakeTier: newTier,
    }));

  await db.insert(schema.stakeEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    user,
    eventType: "stake",
    amount,
    newTier,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

ponder.on("StakingManager:Unstaked", async ({ event, context }) => {
  const { db } = context;
  const { user, amount, newTier } = event.args;

  await db
    .insert(schema.account)
    .values({
      address: user,
      stakeAmount: 0n,
      stakeTier: newTier,
      createdAt: event.block.timestamp,
    })
    .onConflictDoUpdate((row) => ({
      stakeAmount: row.stakeAmount - amount,
      stakeTier: newTier,
    }));

  await db.insert(schema.stakeEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    user,
    eventType: "unstake",
    amount,
    newTier,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

ponder.on("StakingManager:Slashed", async ({ event, context }) => {
  const { db } = context;
  const { user, amount, beneficiary } = event.args;

  await db
    .insert(schema.account)
    .values({
      address: user,
      createdAt: event.block.timestamp,
    })
    .onConflictDoUpdate((row) => ({
      stakeAmount: row.stakeAmount - amount,
    }));

  await db.insert(schema.stakeEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    user,
    eventType: "slash",
    amount,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

// ============================================
// ReputationSystem Events
// ============================================

ponder.on("ReputationSystem:ScoreUpdated", async ({ event, context }) => {
  const { db } = context;
  const { user, newScore, newTier } = event.args;

  await db
    .insert(schema.account)
    .values({
      address: user,
      reputationScore: newScore,
      reputationTier: newTier,
      createdAt: event.block.timestamp,
    })
    .onConflictDoUpdate({
      reputationScore: newScore,
      reputationTier: newTier,
    });
});

ponder.on("ReputationSystem:CompletionRecorded", async ({ event, context }) => {
  const { db } = context;
  const { provider } = event.args;

  await db
    .insert(schema.account)
    .values({
      address: provider,
      completions: 1,
      createdAt: event.block.timestamp,
    })
    .onConflictDoUpdate((row) => ({
      completions: row.completions + 1,
    }));
});

// ============================================
// ServiceRegistry Events
// ============================================

ponder.on("ServiceRegistry:ListingCreated", async ({ event, context }) => {
  const { db } = context;
  const { listingId, provider, category, pricePerUnit, settlementToken } =
    event.args;

  // We store minimal data from the event; full listing data should be
  // read from the contract or metadata URI
  await db.insert(schema.listing).values({
    id: listingId,
    provider,
    category,
    title: "", // populated by reading contract or metadata
    description: "",
    pricePerUnit,
    settlementToken,
    estimatedDeliverySeconds: 0n,
    metadataURI: "",
    active: true,
    createdAt: event.block.timestamp,
  });

  // Ensure provider account exists
  await db
    .insert(schema.account)
    .values({
      address: provider,
      createdAt: event.block.timestamp,
    })
    .onConflictDoNothing();
});

ponder.on("ServiceRegistry:ListingUpdated", async ({ event, context }) => {
  const { db } = context;
  const { listingId, pricePerUnit, settlementToken } = event.args;

  await db
    .update(schema.listing, { id: listingId })
    .set({
      pricePerUnit,
      settlementToken,
    });
});

ponder.on("ServiceRegistry:ListingDeactivated", async ({ event, context }) => {
  const { db } = context;
  const { listingId } = event.args;

  await db.update(schema.listing, { id: listingId }).set({ active: false });
});

// ============================================
// EscrowEngine Events
// ============================================

ponder.on("EscrowEngine:JobCreated", async ({ event, context }) => {
  const { db } = context;
  const { jobId, listingId, buyer, seller, amount, token, fee } = event.args;

  await db.insert(schema.job).values({
    id: jobId,
    listingId,
    buyer,
    seller,
    amount,
    token,
    fee,
    status: 1, // Active
    createdAt: event.block.timestamp,
  });

  // Ensure buyer/seller accounts exist
  for (const addr of [buyer, seller]) {
    await db
      .insert(schema.account)
      .values({ address: addr, createdAt: event.block.timestamp })
      .onConflictDoNothing();
  }
});

ponder.on("EscrowEngine:DeliverySubmitted", async ({ event, context }) => {
  const { db } = context;
  const { jobId, metadataURI } = event.args;

  await db.update(schema.job, { id: jobId }).set({
    status: 2, // Delivered
    deliveryMetadataURI: metadataURI,
  });
});

ponder.on("EscrowEngine:DeliveryConfirmed", async ({ event, context }) => {
  const { db } = context;
  const { jobId } = event.args;

  await db.update(schema.job, { id: jobId }).set({ status: 3 }); // Confirmed
});

ponder.on("EscrowEngine:DisputeInitiated", async ({ event, context }) => {
  const { db } = context;
  const { jobId, disputeId } = event.args;

  await db.update(schema.job, { id: jobId }).set({
    status: 4, // Disputed
    disputeId,
  });
});

ponder.on("EscrowEngine:FundsReleased", async ({ event, context }) => {
  const { db } = context;
  const { jobId, seller, amount } = event.args;

  await db.insert(schema.fundsReleasedEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    jobId,
    recipient: seller,
    amount,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

ponder.on("EscrowEngine:AutoReleased", async ({ event, context }) => {
  const { db } = context;
  const { jobId } = event.args;

  await db.update(schema.job, { id: jobId }).set({ status: 5 }); // Released
});

// ============================================
// DisputeArbitration Events
// ============================================

ponder.on("DisputeArbitration:DisputeCreated", async ({ event, context }) => {
  const { db } = context;
  const { disputeId, jobId, buyer, seller, amount } = event.args;

  await db.insert(schema.dispute).values({
    id: disputeId,
    jobId,
    buyer,
    seller,
    amount,
    token: "0x0000000000000000000000000000000000000000", // updated by ArbitratorsAssigned if needed
    buyerEvidenceURI: "",
    status: 1, // EvidencePhase
    createdAt: event.block.timestamp,
    counterEvidenceDeadline: event.block.timestamp + 86400n, // 24h
  });
});

ponder.on(
  "DisputeArbitration:ArbitratorsAssigned",
  async ({ event, context }) => {
    const { db } = context;
    const { disputeId, arbitrators } = event.args;

    await db.update(schema.dispute, { id: disputeId }).set({
      arbitrator0: arbitrators[0],
      arbitrator1: arbitrators[1],
      arbitrator2: arbitrators[2],
    });
  }
);

ponder.on(
  "DisputeArbitration:CounterEvidenceSubmitted",
  async ({ event, context }) => {
    const { db } = context;
    const { disputeId, evidenceURI } = event.args;

    await db.update(schema.dispute, { id: disputeId }).set({
      sellerEvidenceURI: evidenceURI,
      status: 2, // Voting
    });
  }
);

ponder.on("DisputeArbitration:VoteCast", async ({ event, context }) => {
  const { db } = context;
  const { disputeId, favorBuyer } = event.args;

  if (favorBuyer) {
    await db
      .update(schema.dispute, { id: disputeId })
      .set((row) => ({ votesForBuyer: row.votesForBuyer + 1 }));
  } else {
    await db
      .update(schema.dispute, { id: disputeId })
      .set((row) => ({ votesForSeller: row.votesForSeller + 1 }));
  }
});

ponder.on("DisputeArbitration:RulingExecuted", async ({ event, context }) => {
  const { db } = context;
  const { disputeId, ruling } = event.args;

  await db.update(schema.dispute, { id: disputeId }).set({
    status: 3, // Resolved
    ruling,
  });
});

ponder.on("DisputeArbitration:ArbitratorStaked", async ({ event, context }) => {
  const { db } = context;
  const { arbitrator, amount, rank } = event.args;

  await db
    .insert(schema.account)
    .values({
      address: arbitrator,
      isArbitrator: true,
      arbitratorStake: amount,
      arbitratorRank: rank,
      createdAt: event.block.timestamp,
    })
    .onConflictDoUpdate({
      isArbitrator: true,
      arbitratorStake: amount,
      arbitratorRank: rank,
    });
});

ponder.on(
  "DisputeArbitration:ArbitratorUnstaked",
  async ({ event, context }) => {
    const { db } = context;
    const { arbitrator, amount } = event.args;

    await db
      .insert(schema.account)
      .values({
        address: arbitrator,
        createdAt: event.block.timestamp,
      })
      .onConflictDoUpdate((row) => ({
        arbitratorStake: row.arbitratorStake - amount,
        isArbitrator: row.arbitratorStake - amount > 0n,
      }));
  }
);

// ============================================
// X402EscrowBridge Events
// ============================================

ponder.on("X402EscrowBridge:EscrowedJobCreated", async ({ event, context }) => {
  const { db } = context;
  const { x402Nonce, jobId, payer } = event.args;

  // The EscrowEngine:JobCreated handler already inserted the job row.
  // Annotate it with x402 bridge metadata.
  await db.update(schema.job, { id: jobId }).set({
    isX402: true,
    x402Payer: payer,
    x402Nonce: x402Nonce,
  });

  // Ensure payer account exists (buyer on the job is the bridge address)
  await db
    .insert(schema.account)
    .values({ address: payer, createdAt: event.block.timestamp })
    .onConflictDoNothing();
});
