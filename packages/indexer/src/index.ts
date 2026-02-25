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

ponder.on("EscrowEngine:SkillEscrowCreated", async ({ event, context }) => {
  const { db } = context;
  const { jobId, skillId, buyer, seller, amount } = event.args;

  await db.insert(schema.escrowMetaEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    eventType: "skill_escrow_created",
    jobId,
    skillId,
    buyer,
    seller,
    amount,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

ponder.on("EscrowEngine:TokenAllowlisted", async ({ event, context }) => {
  const { db } = context;
  const { token } = event.args;

  await db.insert(schema.escrowMetaEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    eventType: "token_allowlisted",
    token,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

ponder.on("EscrowEngine:TokenRemoved", async ({ event, context }) => {
  const { db } = context;
  const { token } = event.args;

  await db.insert(schema.escrowMetaEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    eventType: "token_removed",
    token,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
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

  // Trigger auto-threading webhook
  if (process.env.LOBSTR_WEBHOOK_SECRET) {
    try {
      await fetch(`${process.env.LOBSTR_API_URL}/api/webhooks/indexer`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Secret": process.env.LOBSTR_WEBHOOK_SECRET,
        },
        body: JSON.stringify({
          event: "DisputeCreated",
          data: {
            disputeId: Number(disputeId),
            jobId: Number(jobId),
            buyer,
            seller,
            amount: amount.toString(),
          },
        }),
      });
    } catch {
      // Webhook failure should not block indexing
    }
  }
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

    // Notify webhook about arbitrator assignment
    if (process.env.LOBSTR_WEBHOOK_SECRET) {
      try {
        await fetch(`${process.env.LOBSTR_API_URL}/api/webhooks/indexer`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Webhook-Secret": process.env.LOBSTR_WEBHOOK_SECRET,
          },
          body: JSON.stringify({
            event: "ArbitratorsAssigned",
            data: {
              disputeId: Number(disputeId),
              arbitrators: [...arbitrators],
            },
          }),
        });
      } catch {
        // Webhook failure should not block indexing
      }
    }
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

ponder.on("DisputeArbitration:VotingAdvanced", async ({ event, context }) => {
  const { db } = context;
  const { disputeId } = event.args;

  await db.insert(schema.arbitrationEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    eventType: "voting_advanced",
    disputeId,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

ponder.on("DisputeArbitration:PanelSealed", async ({ event, context }) => {
  const { db } = context;
  const { disputeId, arbitrators } = event.args;

  await db.insert(schema.arbitrationEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    eventType: "panel_sealed",
    disputeId,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });

  await db.update(schema.dispute, { id: disputeId }).set({
    arbitrator0: arbitrators[0],
    arbitrator1: arbitrators[1],
    arbitrator2: arbitrators[2],
  });
});

ponder.on("DisputeArbitration:RulingFinalized", async ({ event, context }) => {
  const { db } = context;
  const { disputeId, ruling } = event.args;

  await db.insert(schema.arbitrationEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    eventType: "ruling_finalized",
    disputeId,
    ruling,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

ponder.on("DisputeArbitration:AppealFiled", async ({ event, context }) => {
  const { db } = context;
  const { originalDisputeId, appealDisputeId, appealer } = event.args;

  await db.insert(schema.appeal).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    disputeId: originalDisputeId,
    appellant: appealer,
    bondAmount: 0n,
    eventType: "appeal_filed",
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });

  await db.insert(schema.arbitrationEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}-arbitration`,
    eventType: "appeal_filed",
    disputeId: originalDisputeId,
    appealer,
    metric: appealDisputeId,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

ponder.on(
  "DisputeArbitration:AppealBondForfeited",
  async ({ event, context }) => {
    const { db } = context;
    const { disputeId, amount } = event.args;

    await db.insert(schema.arbitrationEvent).values({
      id: `${event.transaction.hash}-${event.log.logIndex}`,
      eventType: "appeal_bond_forfeited",
      disputeId,
      amount,
      timestamp: event.block.timestamp,
      blockNumber: event.block.number,
    });
  }
);

ponder.on(
  "DisputeArbitration:AppealBondReturned",
  async ({ event, context }) => {
    const { db } = context;
    const { disputeId, appealer, amount } = event.args;

    await db.insert(schema.arbitrationEvent).values({
      id: `${event.transaction.hash}-${event.log.logIndex}`,
      eventType: "appeal_bond_returned",
      disputeId,
      appealer,
      amount,
      timestamp: event.block.timestamp,
      blockNumber: event.block.number,
    });
  }
);

ponder.on("DisputeArbitration:ArbitratorPaused", async ({ event, context }) => {
  const { db } = context;
  const { arbitrator } = event.args;

  await db.insert(schema.arbitrationEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    eventType: "arbitrator_paused",
    arbitrator,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

ponder.on("DisputeArbitration:ArbitratorUnpaused", async ({ event, context }) => {
  const { db } = context;
  const { arbitrator } = event.args;

  await db.insert(schema.arbitrationEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    eventType: "arbitrator_unpaused",
    arbitrator,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

ponder.on("DisputeArbitration:CollusionFlagged", async ({ event, context }) => {
  const { db } = context;
  const { arbA, arbB, agreementRate } = event.args;

  await db.insert(schema.arbitrationEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    eventType: "collusion_flagged",
    arbitratorA: arbA,
    arbitratorB: arbB,
    metric: agreementRate,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
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

ponder.on("X402EscrowBridge:DeliveryConfirmedByPayer", async ({ event, context }) => {
  const { db } = context;
  const { jobId, payer } = event.args;

  await db.insert(schema.x402BridgeEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    eventType: "delivery_confirmed",
    jobId,
    payer,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

ponder.on("X402EscrowBridge:DisputeInitiatedByPayer", async ({ event, context }) => {
  const { db } = context;
  const { jobId, payer } = event.args;

  await db.insert(schema.x402BridgeEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    eventType: "dispute_initiated",
    jobId,
    payer,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

ponder.on("X402EscrowBridge:EscrowRefundClaimed", async ({ event, context }) => {
  const { db } = context;
  const { jobId, payer, amount } = event.args;

  await db.insert(schema.x402BridgeEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    eventType: "refund_claimed",
    jobId,
    payer,
    amount,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

ponder.on("X402EscrowBridge:RefundRegistered", async ({ event, context }) => {
  const { db } = context;
  const { jobId, amount } = event.args;

  await db.insert(schema.x402BridgeEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    eventType: "refund_registered",
    jobId,
    amount,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

ponder.on("X402EscrowBridge:EscrowReserveReleased", async ({ event, context }) => {
  const { db } = context;
  const { jobId, token, amount } = event.args;

  await db.insert(schema.x402BridgeEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    eventType: "reserve_released",
    jobId,
    token,
    amount,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

ponder.on("X402EscrowBridge:StrandedDepositRecovered", async ({ event, context }) => {
  const { db } = context;
  const { payer, token, amount } = event.args;

  await db.insert(schema.x402BridgeEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    eventType: "stranded_recovered",
    payer,
    token,
    amount,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

// ============================================
// SybilGuard Events
// ============================================

ponder.on("SybilGuard:ReportCreated", async ({ event, context }) => {
  const { db } = context;
  const { reportId, reporter, violation } = event.args;

  await db.insert(schema.sybilEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    eventType: "report_created",
    reportId,
    account: reporter,
    violation,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

ponder.on("SybilGuard:ReportConfirmed", async ({ event, context }) => {
  const { db } = context;
  const { reportId, judge } = event.args;

  await db.insert(schema.sybilEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    eventType: "report_confirmed",
    reportId,
    actor: judge,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

ponder.on("SybilGuard:ReportRejected", async ({ event, context }) => {
  const { db } = context;
  const { reportId, judge } = event.args;

  await db.insert(schema.sybilEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    eventType: "report_rejected",
    reportId,
    actor: judge,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

ponder.on("SybilGuard:ReportExpired", async ({ event, context }) => {
  const { db } = context;
  const { reportId } = event.args;

  await db.insert(schema.sybilEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    eventType: "report_expired",
    reportId,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

ponder.on("SybilGuard:AddressBanned", async ({ event, context }) => {
  const { db } = context;
  const { account, reason, reportId, seizedAmount } = event.args;

  await db.insert(schema.sybilEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    eventType: "address_banned",
    reportId,
    account,
    amount: seizedAmount,
    violation: reason,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

ponder.on("SybilGuard:AddressUnbanned", async ({ event, context }) => {
  const { db } = context;
  const { account, unbannedBy } = event.args;

  await db.insert(schema.sybilEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    eventType: "address_unbanned",
    account,
    actor: unbannedBy,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

ponder.on("SybilGuard:FundsSeized", async ({ event, context }) => {
  const { db } = context;
  const { account, token, amount, reportId } = event.args;

  await db.insert(schema.sybilEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    eventType: "funds_seized",
    reportId,
    account,
    token,
    amount,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

ponder.on("SybilGuard:WatcherBondCollected", async ({ event, context }) => {
  const { db } = context;
  const { reportId, watcher, amount } = event.args;

  await db.insert(schema.sybilEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    eventType: "watcher_bond_collected",
    reportId,
    account: watcher,
    amount,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

ponder.on("SybilGuard:WatcherBondReturned", async ({ event, context }) => {
  const { db } = context;
  const { reportId, watcher, amount } = event.args;

  await db.insert(schema.sybilEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    eventType: "watcher_bond_returned",
    reportId,
    account: watcher,
    amount,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

ponder.on("SybilGuard:WatcherBondSlashed", async ({ event, context }) => {
  const { db } = context;
  const { reportId, watcher, amount } = event.args;

  await db.insert(schema.sybilEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    eventType: "watcher_bond_slashed",
    reportId,
    account: watcher,
    amount,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

ponder.on("SybilGuard:BanScheduled", async ({ event, context }) => {
  const { db } = context;
  const { reportId, executeAfter } = event.args;

  await db.insert(schema.sybilEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    eventType: "ban_scheduled",
    reportId,
    executeAfter,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

ponder.on("SybilGuard:BanCancelled", async ({ event, context }) => {
  const { db } = context;
  const { reportId } = event.args;

  await db.insert(schema.sybilEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    eventType: "ban_cancelled",
    reportId,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

ponder.on("SybilGuard:EscrowReleased", async ({ event, context }) => {
  const { db } = context;
  const { account, amount } = event.args;

  await db.insert(schema.sybilEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    eventType: "escrow_released",
    account,
    amount,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

ponder.on("SybilGuard:EscrowRefunded", async ({ event, context }) => {
  const { db } = context;
  const { account, amount } = event.args;

  await db.insert(schema.sybilEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    eventType: "escrow_refunded",
    account,
    amount,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

// ============================================
// StakingManager — missing events
// ============================================

ponder.on("StakingManager:UnstakeRequested", async ({ event, context }) => {
  const { db } = context;
  const { user, amount, availableAt } = event.args;

  await db.insert(schema.stakeEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    user,
    eventType: "unstake_request",
    amount,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

ponder.on("StakingManager:TierChanged", async ({ event, context }) => {
  const { db } = context;
  const { user, oldTier, newTier } = event.args;

  await db
    .insert(schema.account)
    .values({ address: user, stakeTier: newTier, createdAt: event.block.timestamp })
    .onConflictDoUpdate({ stakeTier: newTier });
});

ponder.on("SybilGuard:CollusionWarning", async ({ event, context }) => {
  const { db } = context;
  const { reportId, watcher, judge } = event.args;

  await db.insert(schema.sybilEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    eventType: "collusion_warning",
    reportId,
    account: watcher,
    actor: judge,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

ponder.on("SybilGuard:LinkedAccountsRegistered", async ({ event, context }) => {
  const { db } = context;
  const { primary, linked } = event.args;

  await db.insert(schema.sybilEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    eventType: "linked_accounts_registered",
    account: primary,
    // Preserve cardinality signal even though addresses are not yet normalized into a relation table.
    metric: BigInt(linked.length),
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

// ============================================
// DirectiveBoard Events
// ============================================

ponder.on("DirectiveBoard:DirectivePosted", async ({ event, context }) => {
  const { db } = context;
  const { id, directiveType, poster, target, contentHash, contentURI, expiresAt } = event.args;

  await db.insert(schema.directive).values({
    id,
    directiveType,
    poster,
    target,
    contentHash,
    contentURI,
    status: 0, // Active
    createdAt: event.block.timestamp,
    expiresAt,
  });

  // If DisputeReview, trigger auto-threading webhook
  if (directiveType === 0 && process.env.LOBSTR_WEBHOOK_SECRET) {
    try {
      await fetch(`${process.env.LOBSTR_API_URL}/api/webhooks/indexer`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Secret": process.env.LOBSTR_WEBHOOK_SECRET,
        },
        body: JSON.stringify({
          event: "DirectivePosted",
          data: {
            id: Number(id),
            directiveType,
            poster,
            target,
            contentURI,
          },
        }),
      });
    } catch {
      // Webhook failure should not block indexing
    }
  }
});

ponder.on("DirectiveBoard:DirectiveExecuted", async ({ event, context }) => {
  const { db } = context;
  const { id } = event.args;

  await db.update(schema.directive, { id }).set({ status: 1 }); // Executed
});

ponder.on("DirectiveBoard:DirectiveCancelled", async ({ event, context }) => {
  const { db } = context;
  const { id } = event.args;

  await db.update(schema.directive, { id }).set({ status: 2 }); // Cancelled
});

// ============================================
// ReviewRegistry Events
// ============================================

ponder.on("ReviewRegistry:ReviewSubmitted", async ({ event, context }) => {
  const { db } = context;
  const { reviewId, jobId, reviewer, subject, rating, metadataURI } = event.args;

  await db.insert(schema.review).values({
    id: reviewId,
    jobId,
    reviewer,
    subject,
    rating,
    metadataURI,
    timestamp: event.block.timestamp,
  });
});

// ============================================
// LoanEngine Events
// ============================================

ponder.on("LoanEngine:LoanRequested", async ({ event, context }) => {
  const { db } = context;
  const { loanId, borrower, principal, term } = event.args;

  await db.insert(schema.loan).values({
    id: loanId,
    borrower,
    principal,
    status: 0, // Requested
    term,
    requestedAt: event.block.timestamp,
  });

  await db
    .insert(schema.account)
    .values({ address: borrower, createdAt: event.block.timestamp })
    .onConflictDoNothing();
});

ponder.on("LoanEngine:LoanFunded", async ({ event, context }) => {
  const { db } = context;
  const { loanId, lender } = event.args;

  await db.update(schema.loan, { id: loanId }).set({
    status: 1, // Funded
    lender,
    fundedAt: event.block.timestamp,
  });
});

ponder.on("LoanEngine:RepaymentMade", async ({ event, context }) => {
  const { db } = context;
  const { loanId, amount } = event.args;

  await db
    .update(schema.loan, { id: loanId })
    .set((row) => ({ totalRepaid: row.totalRepaid + amount }));
});

ponder.on("LoanEngine:LoanRepaid", async ({ event, context }) => {
  const { db } = context;
  const { loanId } = event.args;

  await db.update(schema.loan, { id: loanId }).set({ status: 2 }); // Repaid
});

ponder.on("LoanEngine:LoanCancelled", async ({ event, context }) => {
  const { db } = context;
  const { loanId } = event.args;

  await db.update(schema.loan, { id: loanId }).set({ status: 4 }); // Cancelled
});

ponder.on("LoanEngine:LoanDefaulted", async ({ event, context }) => {
  const { db } = context;
  const { loanId } = event.args;

  await db.update(schema.loan, { id: loanId }).set({ status: 3 }); // Defaulted
});

ponder.on("LoanEngine:LoanLiquidated", async ({ event, context }) => {
  const { db } = context;
  const { loanId } = event.args;

  await db.update(schema.loan, { id: loanId }).set({ status: 5 }); // Liquidated
});

// ============================================
// SkillRegistry Events
// ============================================

ponder.on("SkillRegistry:SkillListed", async ({ event, context }) => {
  const { db } = context;
  const { skillId, seller, assetType, pricingModel, price } = event.args;

  await db.insert(schema.skill).values({
    id: skillId,
    seller,
    assetType,
    deliveryMethod: 0,
    pricingModel,
    title: "",
    description: "",
    metadataURI: "",
    price,
    settlementToken: "0x0000000000000000000000000000000000000000",
    createdAt: event.block.timestamp,
  });

  await db
    .insert(schema.account)
    .values({ address: seller, createdAt: event.block.timestamp })
    .onConflictDoNothing();
});

ponder.on("SkillRegistry:SkillUpdated", async ({ event, context }) => {
  const { db } = context;
  const { skillId, newPrice, newMetadataURI } = event.args;

  await db.update(schema.skill, { id: skillId }).set({
    price: newPrice,
    metadataURI: newMetadataURI,
  });
});

ponder.on("SkillRegistry:SkillDeactivated", async ({ event, context }) => {
  const { db } = context;
  const { skillId } = event.args;

  await db.update(schema.skill, { id: skillId }).set({ active: false });
});

ponder.on("SkillRegistry:SkillPurchased", async ({ event, context }) => {
  const { db } = context;
  const { skillId, buyer, accessId, pricingModel, amount } = event.args;

  await db
    .update(schema.skill, { id: skillId })
    .set((row) => ({ totalPurchases: row.totalPurchases + 1n }));

  await db.insert(schema.skillPurchase).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    skillId,
    buyer,
    accessId,
    pricingModel,
    amount,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });

  await db
    .insert(schema.account)
    .values({ address: buyer, createdAt: event.block.timestamp })
    .onConflictDoNothing();
});

ponder.on("SkillRegistry:SubscriptionRenewed", async ({ event, context }) => {
  const { db } = context;
  const { accessId, skillId, buyer } = event.args;

  await db.insert(schema.skillPurchase).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    skillId,
    buyer,
    accessId,
    pricingModel: 2, // SUBSCRIPTION
    amount: 0n,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

ponder.on("SkillRegistry:UsageRecorded", async ({ event, context }) => {
  const { db } = context;
  const { accessId, skillId, calls, cost } = event.args;

  await db
    .update(schema.skill, { id: skillId })
    .set((row) => ({ totalCalls: row.totalCalls + calls }));

  await db.insert(schema.skillUsageEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    accessId,
    skillId,
    calls,
    cost,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

ponder.on("SkillRegistry:CallCreditsDeposited", async ({ event, context }) => {
  const { db } = context;
  const { buyer, token, amount } = event.args;

  await db.insert(schema.skillCreditEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    eventType: "deposit",
    account: buyer,
    token,
    amount,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

ponder.on("SkillRegistry:CallCreditsWithdrawn", async ({ event, context }) => {
  const { db } = context;
  const { buyer, token, amount } = event.args;

  await db.insert(schema.skillCreditEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    eventType: "withdrawal",
    account: buyer,
    token,
    amount,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

ponder.on("SkillRegistry:SellerPaid", async ({ event, context }) => {
  const { db } = context;
  const { seller, token, amount } = event.args;

  await db.insert(schema.skillCreditEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    eventType: "seller_paid",
    account: seller,
    token,
    amount,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

// ============================================
// MultiPartyEscrow Events
// ============================================

ponder.on("MultiPartyEscrow:MultiJobCreated", async ({ event, context }) => {
  const { db } = context;
  const { groupId, buyer, jobIds, sellers, shares, token, totalAmount } = event.args;

  await db.insert(schema.multiPartyGroup).values({
    id: groupId,
    buyer,
    totalAmount,
    token,
    jobCount: jobIds.length,
    metadataURI: "",
    createdAt: event.block.timestamp,
  });

  await db
    .insert(schema.account)
    .values({ address: buyer, createdAt: event.block.timestamp })
    .onConflictDoNothing();
});

ponder.on("MultiPartyEscrow:GroupCompleted", async ({ event, context }) => {
  const { db } = context;
  const { groupId } = event.args;

  await db.update(schema.multiPartyGroup, { id: groupId }).set({ completed: true });
});

ponder.on("MultiPartyEscrow:RefundClaimed", async ({ event, context }) => {
  const { db } = context;
  const { jobId, groupId, buyer, amount } = event.args;

  await db.insert(schema.escrowMetaEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    eventType: "multi_party_refund",
    jobId,
    buyer,
    amount,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

// ============================================
// InsurancePool Events
// ============================================

ponder.on("InsurancePool:PoolDeposited", async ({ event, context }) => {
  const { db } = context;
  const { staker, amount } = event.args;

  await db.insert(schema.insuranceEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    eventType: "pool_deposited",
    account: staker,
    amount,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

ponder.on("InsurancePool:PoolWithdrawn", async ({ event, context }) => {
  const { db } = context;
  const { staker, amount } = event.args;

  await db.insert(schema.insuranceEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    eventType: "pool_withdrawn",
    account: staker,
    amount,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

ponder.on("InsurancePool:PremiumCollected", async ({ event, context }) => {
  const { db } = context;
  const { jobId, buyer, premiumAmount } = event.args;

  await db.insert(schema.insuranceEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    eventType: "premium_collected",
    account: buyer,
    jobId,
    amount: premiumAmount,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

ponder.on("InsurancePool:ClaimPaid", async ({ event, context }) => {
  const { db } = context;
  const { jobId, buyer, claimAmount } = event.args;

  await db.insert(schema.insuranceEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    eventType: "claim_paid",
    account: buyer,
    jobId,
    amount: claimAmount,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

ponder.on("InsurancePool:InsuredJobCreated", async ({ event, context }) => {
  const { db } = context;
  const { jobId, buyer, premiumPaid } = event.args;

  await db.insert(schema.insuranceEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    eventType: "insured_job_created",
    account: buyer,
    jobId,
    amount: premiumPaid,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

// ============================================
// SubscriptionEngine Events
// ============================================

ponder.on("SubscriptionEngine:SubscriptionCreated", async ({ event, context }) => {
  const { db } = context;
  const { id, buyer, seller, token, amount, interval, maxCycles } = event.args;

  await db.insert(schema.subscription).values({
    id,
    buyer,
    seller,
    token,
    amount,
    interval,
    nextDue: event.block.timestamp + interval,
    maxCycles,
    status: 0, // Active
    listingId: 0n,
    metadataURI: "",
    createdAt: event.block.timestamp,
  });

  for (const addr of [buyer, seller]) {
    await db
      .insert(schema.account)
      .values({ address: addr, createdAt: event.block.timestamp })
      .onConflictDoNothing();
  }
});

ponder.on("SubscriptionEngine:PaymentProcessed", async ({ event, context }) => {
  const { db } = context;
  const { id, cycleNumber } = event.args;

  await db
    .update(schema.subscription, { id })
    .set((row) => ({
      cyclesCompleted: row.cyclesCompleted + 1n,
      nextDue: row.nextDue + row.interval,
    }));
});

ponder.on("SubscriptionEngine:SubscriptionCancelled", async ({ event, context }) => {
  const { db } = context;
  const { id } = event.args;

  await db.update(schema.subscription, { id }).set({ status: 2 }); // Cancelled
});

ponder.on("SubscriptionEngine:SubscriptionPaused", async ({ event, context }) => {
  const { db } = context;
  const { id } = event.args;

  await db.update(schema.subscription, { id }).set({ status: 1 }); // Paused
});

ponder.on("SubscriptionEngine:SubscriptionResumed", async ({ event, context }) => {
  const { db } = context;
  const { id, newNextDue } = event.args;

  await db.update(schema.subscription, { id }).set({ status: 0, nextDue: newNextDue }); // Active
});

ponder.on("SubscriptionEngine:SubscriptionCompleted", async ({ event, context }) => {
  const { db } = context;
  const { id } = event.args;

  await db.update(schema.subscription, { id }).set({ status: 3 }); // Completed
});

// ============================================
// StakingRewards Events
// ============================================

ponder.on("StakingRewards:StakeSynced", async ({ event, context }) => {
  const { db } = context;
  const { user, effectiveBalance, stakingTier } = event.args;

  await db.insert(schema.stakingRewardEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    eventType: "stake_synced",
    user,
    amount: effectiveBalance,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

ponder.on("StakingRewards:RewardsClaimed", async ({ event, context }) => {
  const { db } = context;
  const { user, token, amount } = event.args;

  await db.insert(schema.stakingRewardEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    eventType: "rewards_claimed",
    user,
    token,
    amount,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

ponder.on("StakingRewards:RewardNotified", async ({ event, context }) => {
  const { db } = context;
  const { token, amount } = event.args;

  await db.insert(schema.stakingRewardEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    eventType: "reward_notified",
    token,
    amount,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

ponder.on("StakingRewards:RewardTokenAdded", async ({ event, context }) => {
  const { db } = context;
  const { token } = event.args;

  await db.insert(schema.stakingRewardEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    eventType: "reward_token_added",
    token,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

// ============================================
// LiquidityMining Events
// ============================================

ponder.on("LiquidityMining:Staked", async ({ event, context }) => {
  const { db } = context;
  const { user, amount } = event.args;

  await db.insert(schema.liquidityMiningEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    eventType: "staked",
    user,
    amount,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

ponder.on("LiquidityMining:Withdrawn", async ({ event, context }) => {
  const { db } = context;
  const { user, amount } = event.args;

  await db.insert(schema.liquidityMiningEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    eventType: "withdrawn",
    user,
    amount,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

ponder.on("LiquidityMining:RewardPaid", async ({ event, context }) => {
  const { db } = context;
  const { user, amount } = event.args;

  await db.insert(schema.liquidityMiningEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    eventType: "reward_paid",
    user,
    amount,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

ponder.on("LiquidityMining:EmergencyWithdrawn", async ({ event, context }) => {
  const { db } = context;
  const { user, amount } = event.args;

  await db.insert(schema.liquidityMiningEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    eventType: "emergency_withdrawn",
    user,
    amount,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

ponder.on("LiquidityMining:RewardNotified", async ({ event, context }) => {
  const { db } = context;
  const { amount } = event.args;

  await db.insert(schema.liquidityMiningEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    eventType: "reward_notified",
    user: "0x0000000000000000000000000000000000000000",
    amount,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

// ============================================
// AffiliateManager Events
// ============================================

ponder.on("AffiliateManager:ReferralRegistered", async ({ event, context }) => {
  const { db } = context;
  const { referrer, referred } = event.args;

  await db.insert(schema.affiliateEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    eventType: "referral_registered",
    referrer,
    referred,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

ponder.on("AffiliateManager:ReferralRewardCredited", async ({ event, context }) => {
  const { db } = context;
  const { referrer, token, amount } = event.args;

  await db.insert(schema.affiliateEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    eventType: "referral_reward_credited",
    referrer,
    token,
    amount,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

ponder.on("AffiliateManager:RewardsClaimed", async ({ event, context }) => {
  const { db } = context;
  const { referrer, token, amount } = event.args;

  await db.insert(schema.affiliateEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    eventType: "rewards_claimed",
    referrer,
    token,
    amount,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

// ============================================
// RewardDistributor Events
// ============================================

ponder.on("RewardDistributor:ArbitratorRewardCredited", async ({ event, context }) => {
  const { db } = context;
  const { arbitrator, token, amount } = event.args;

  await db.insert(schema.arbitrationEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    eventType: "arbitrator_reward_credited",
    arbitrator,
    amount,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

ponder.on("RewardDistributor:WatcherRewardCredited", async ({ event, context }) => {
  const { db } = context;
  const { watcher, token, amount } = event.args;

  await db.insert(schema.arbitrationEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    eventType: "watcher_reward_credited",
    arbitrator: watcher,
    amount,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

ponder.on("RewardDistributor:JudgeRewardCredited", async ({ event, context }) => {
  const { db } = context;
  const { judge, token, amount } = event.args;

  await db.insert(schema.arbitrationEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    eventType: "judge_reward_credited",
    arbitrator: judge,
    amount,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

// ============================================
// X402CreditFacility Events
// ============================================

ponder.on("X402CreditFacility:CreditLineOpened", async ({ event, context }) => {
  const { db } = context;
  const { agent, creditLimit, collateral, interestRateBps } = event.args;

  await db.insert(schema.creditLine).values({
    id: agent,
    creditLimit,
    interestRateBps: BigInt(interestRateBps),
    collateralDeposited: collateral,
    status: 0, // Active
    openedAt: event.block.timestamp,
  });
});

ponder.on("X402CreditFacility:CreditLineClosed", async ({ event, context }) => {
  const { db } = context;
  const { agent } = event.args;

  await db.update(schema.creditLine, { id: agent }).set({ status: 1 }); // Closed
});

ponder.on("X402CreditFacility:CreditLineFrozen", async ({ event, context }) => {
  const { db } = context;
  const { agent, defaults } = event.args;

  await db.update(schema.creditLine, { id: agent }).set({
    status: 2, // Frozen
    defaults: Number(defaults),
  });
});

ponder.on("X402CreditFacility:CreditDrawn", async ({ event, context }) => {
  const { db } = context;
  const { drawId, agent, amount, escrowJobId } = event.args;

  await db.insert(schema.creditDraw).values({
    id: drawId,
    agent,
    amount,
    escrowJobId,
    drawnAt: event.block.timestamp,
  });

  await db
    .update(schema.creditLine, { id: agent })
    .set((row) => ({
      totalDrawn: row.totalDrawn + amount,
      activeDraws: row.activeDraws + 1,
    }));
});

ponder.on("X402CreditFacility:DrawRepaid", async ({ event, context }) => {
  const { db } = context;
  const { drawId, agent, totalPaid } = event.args;

  await db.update(schema.creditDraw, { id: drawId }).set({
    repaidAt: event.block.timestamp,
  });

  await db
    .update(schema.creditLine, { id: agent })
    .set((row) => ({
      totalRepaid: row.totalRepaid + totalPaid,
      activeDraws: row.activeDraws - 1,
    }));
});

ponder.on("X402CreditFacility:DrawLiquidated", async ({ event, context }) => {
  const { db } = context;
  const { drawId, agent } = event.args;

  await db.update(schema.creditDraw, { id: drawId }).set({
    liquidated: true,
  });

  await db
    .update(schema.creditLine, { id: agent })
    .set((row) => ({ activeDraws: row.activeDraws - 1 }));
});

// ============================================
// PipelineRouter Events
// ============================================

ponder.on("PipelineRouter:PipelineCreated", async ({ event, context }) => {
  const { db } = context;
  const { pipelineId, owner } = event.args;

  await db.insert(schema.pipeline).values({
    id: pipelineId,
    owner,
    createdAt: event.block.timestamp,
  });

  await db
    .insert(schema.account)
    .values({ address: owner, createdAt: event.block.timestamp })
    .onConflictDoNothing();
});

ponder.on("PipelineRouter:PipelineExecuted", async ({ event, context }) => {
  const { db } = context;
  const { pipelineId, executor } = event.args;

  await db
    .update(schema.pipeline, { id: pipelineId })
    .set((row) => ({ totalExecutions: row.totalExecutions + 1n }));

  await db
    .insert(schema.account)
    .values({ address: executor, createdAt: event.block.timestamp })
    .onConflictDoNothing();
});

ponder.on("PipelineRouter:PipelineUpdated", async ({ event, context }) => {
  const { db } = context;
  const { pipelineId } = event.args;

  // Pipeline row already exists from PipelineCreated; just confirm it's active
  await db
    .update(schema.pipeline, { id: pipelineId })
    .set({ active: true });
});

ponder.on("PipelineRouter:PipelineDeactivated", async ({ event, context }) => {
  const { db } = context;
  const { pipelineId } = event.args;

  await db
    .update(schema.pipeline, { id: pipelineId })
    .set({ active: false });
});

// ============================================
// BondingEngine Events
// ============================================

ponder.on("BondingEngine:MarketCreated", async ({ event, context }) => {
  const { db } = context;
  const { marketId, quoteToken, pricePer1LOB, discountBps, vestingPeriod, capacity } = event.args;

  await db.insert(schema.bondMarket).values({
    id: marketId,
    quoteToken,
    pricePer1LOB,
    discountBps,
    vestingPeriod,
    capacity,
    createdAt: event.block.timestamp,
  });
});

ponder.on("BondingEngine:MarketClosed", async ({ event, context }) => {
  const { db } = context;
  const { marketId } = event.args;

  await db.update(schema.bondMarket, { id: marketId }).set({ active: false });
});

ponder.on("BondingEngine:MarketPriceUpdated", async ({ event, context }) => {
  const { db } = context;
  const { marketId, newPrice } = event.args;

  await db.update(schema.bondMarket, { id: marketId }).set({ pricePer1LOB: newPrice });
});

ponder.on("BondingEngine:BondPurchased", async ({ event, context }) => {
  const { db } = context;
  const { bondId, marketId, buyer, quoteAmount, payout, vestEnd } = event.args;

  await db.insert(schema.bondPosition).values({
    id: bondId,
    marketId,
    owner: buyer,
    payout,
    vestEnd,
    createdAt: event.block.timestamp,
  });

  await db
    .update(schema.bondMarket, { id: marketId })
    .set((row) => ({ sold: row.sold + payout }));

  await db
    .insert(schema.account)
    .values({ address: buyer, createdAt: event.block.timestamp })
    .onConflictDoNothing();
});

ponder.on("BondingEngine:BondClaimed", async ({ event, context }) => {
  const { db } = context;
  const { bondId, owner, amount } = event.args;

  await db
    .update(schema.bondPosition, { id: bondId })
    .set((row) => ({ claimed: row.claimed + amount }));
});

// ============================================
// LightningGovernor Events
// ============================================

ponder.on("LightningGovernor:ProposalCreated", async ({ event, context }) => {
  const { db } = context;
  const { proposalId, proposer, target, selector, description } = event.args;

  await db.insert(schema.proposal).values({
    id: proposalId,
    proposer,
    target,
    selector,
    description,
    status: 0, // Active
    createdAt: event.block.timestamp,
  });

  await db
    .insert(schema.account)
    .values({ address: proposer, createdAt: event.block.timestamp })
    .onConflictDoNothing();
});

ponder.on("LightningGovernor:Voted", async ({ event, context }) => {
  const { db } = context;
  const { proposalId, voter, newVoteCount } = event.args;

  await db.insert(schema.proposalVote).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    proposalId,
    voter,
    newVoteCount,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });

  await db.update(schema.proposal, { id: proposalId }).set({ voteCount: newVoteCount });
});

ponder.on("LightningGovernor:ProposalApproved", async ({ event, context }) => {
  const { db } = context;
  const { proposalId, executionDeadline } = event.args;

  await db.update(schema.proposal, { id: proposalId }).set({
    status: 1, // Approved
    approvedAt: event.block.timestamp,
    executionDeadline,
  });
});

ponder.on("LightningGovernor:ProposalExecuted", async ({ event, context }) => {
  const { db } = context;
  const { proposalId } = event.args;

  await db.update(schema.proposal, { id: proposalId }).set({ status: 2 }); // Executed
});

ponder.on("LightningGovernor:ProposalCancelled", async ({ event, context }) => {
  const { db } = context;
  const { proposalId } = event.args;

  await db.update(schema.proposal, { id: proposalId }).set({ status: 3 }); // Cancelled
});

// ============================================
// RewardScheduler Events
// ============================================

ponder.on("RewardScheduler:StreamCreated", async ({ event, context }) => {
  const { db } = context;
  const { streamId, targetType, rewardToken, emissionPerSecond, endTime } = event.args;

  await db.insert(schema.rewardStream).values({
    id: streamId,
    targetType,
    rewardToken,
    emissionPerSecond,
    endTime,
    createdAt: event.block.timestamp,
  });
});

ponder.on("RewardScheduler:StreamUpdated", async ({ event, context }) => {
  const { db } = context;
  const { streamId, newEmission } = event.args;

  await db.update(schema.rewardStream, { id: streamId }).set({
    emissionPerSecond: newEmission,
  });

  await db.insert(schema.rewardStreamEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    eventType: "updated",
    streamId,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

ponder.on("RewardScheduler:StreamDripped", async ({ event, context }) => {
  const { db } = context;
  const { streamId, amount } = event.args;

  await db
    .update(schema.rewardStream, { id: streamId })
    .set((row) => ({ totalDripped: row.totalDripped + amount }));

  await db.insert(schema.rewardStreamEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    eventType: "dripped",
    streamId,
    amount,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

ponder.on("RewardScheduler:StreamPaused", async ({ event, context }) => {
  const { db } = context;
  const { streamId } = event.args;

  await db.update(schema.rewardStream, { id: streamId }).set({ active: false });

  await db.insert(schema.rewardStreamEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    eventType: "paused",
    streamId,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

ponder.on("RewardScheduler:StreamResumed", async ({ event, context }) => {
  const { db } = context;
  const { streamId } = event.args;

  await db.update(schema.rewardStream, { id: streamId }).set({ active: true });

  await db.insert(schema.rewardStreamEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    eventType: "resumed",
    streamId,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

ponder.on("RewardScheduler:TopUp", async ({ event, context }) => {
  const { db } = context;
  const { sender, token, amount } = event.args;

  await db.insert(schema.rewardStreamEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    eventType: "top_up",
    token,
    amount,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

ponder.on("RewardScheduler:BudgetWithdrawn", async ({ event, context }) => {
  const { db } = context;
  const { to, token, amount } = event.args;

  await db.insert(schema.rewardStreamEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    eventType: "budget_withdrawn",
    token,
    amount,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

// ============================================
// LOBToken Events
// ============================================

ponder.on("LOBToken:Transfer", async ({ event, context }) => {
  const { db } = context;
  const { from, to, value } = event.args;

  await db.insert(schema.tokenTransfer).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    from,
    to,
    amount: value,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

// ============================================
// TeamVesting Events
// ============================================

ponder.on("TeamVesting:AllocationSet", async ({ event, context }) => {
  const { db } = context;
  const { amount } = event.args;

  await db.insert(schema.vestingEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    eventType: "allocation_set",
    amount,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

ponder.on("TeamVesting:TokensReleased", async ({ event, context }) => {
  const { db } = context;
  const { amount } = event.args;

  await db.insert(schema.vestingEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    eventType: "tokens_released",
    amount,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

ponder.on("TeamVesting:VestingRevoked", async ({ event, context }) => {
  const { db } = context;
  const { returnTo, returned } = event.args;

  await db.insert(schema.vestingEvent).values({
    id: `${event.transaction.hash}-${event.log.logIndex}`,
    eventType: "vesting_revoked",
    amount: returned,
    returnTo,
    returned,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

// ============================================
// TreasuryGovernor Events
// ============================================
// Note: TreasuryGovernor has its own proposal/stream system separate from LightningGovernor
// Required schema tables:
// - treasury_proposal: id, proposer, token, recipient, amount, description, status, approvalCount, createdAt, timelockEnd
// - treasury_stream: id, recipient, token, totalAmount, claimedAmount, startTime, endTime, role, active
// - treasury_governor_event: id, eventType (proposal_approved, stream_created, stream_claimed, funds_received, signer_added), proposalId, streamId, signer, recipient, token, amount, timestamp, blockNumber

ponder.on("TreasuryGovernor:ProposalCreated", async ({ event, context }) => {
  const { db } = context;
  const { proposalId, proposer, token, recipient, amount, description } = event.args;

  // TODO: Add treasury_proposal table to schema
  // await db.insert(schema.treasuryProposal).values({
  //   id: proposalId,
  //   proposer,
  //   token,
  //   recipient,
  //   amount,
  //   description,
  //   status: 0, // Pending
  //   approvalCount: 1,
  //   createdAt: event.block.timestamp,
  //   timelockEnd: 0n,
  // });
  console.log("TreasuryGovernor:ProposalCreated", { proposalId, proposer, token, recipient, amount, description });
});

ponder.on("TreasuryGovernor:ProposalApproved", async ({ event, context }) => {
  const { db } = context;
  const { proposalId, signer } = event.args;

  // TODO: Update treasury_proposal approval count
  // TODO: Add treasury_governor_event for tracking approvals
  console.log("TreasuryGovernor:ProposalApproved", { proposalId, signer });
});

ponder.on("TreasuryGovernor:ProposalExecuted", async ({ event, context }) => {
  const { db } = context;
  const { proposalId, recipient, amount } = event.args;

  // TODO: Update treasury_proposal status to Executed
  console.log("TreasuryGovernor:ProposalExecuted", { proposalId, recipient, amount });
});

ponder.on("TreasuryGovernor:StreamCreated", async ({ event, context }) => {
  const { db } = context;
  const { streamId, recipient, token, totalAmount, startTime, endTime, role } = event.args;

  // TODO: Add treasury_stream table to schema
  // await db.insert(schema.treasuryStream).values({
  //   id: streamId,
  //   recipient,
  //   token,
  //   totalAmount,
  //   claimedAmount: 0n,
  //   startTime,
  //   endTime,
  //   role,
  //   active: true,
  // });
  console.log("TreasuryGovernor:StreamCreated", { streamId, recipient, token, totalAmount, startTime, endTime, role });
});

ponder.on("TreasuryGovernor:StreamClaimed", async ({ event, context }) => {
  const { db } = context;
  const { streamId, recipient, amount } = event.args;

  // TODO: Update treasury_stream claimedAmount
  console.log("TreasuryGovernor:StreamClaimed", { streamId, recipient, amount });
});

ponder.on("TreasuryGovernor:FundsReceived", async ({ event, context }) => {
  const { db } = context;
  const { token, from, amount } = event.args;

  // TODO: Track treasury incoming funds
  console.log("TreasuryGovernor:FundsReceived", { token, from, amount });
});

ponder.on("TreasuryGovernor:SignerAdded", async ({ event, context }) => {
  const { db } = context;
  const { signer } = event.args;

  // TODO: Track signer additions
  console.log("TreasuryGovernor:SignerAdded", { signer });
});

// ============================================
// AirdropClaimV3 Events
// ============================================
// Required schema tables:
// - airdrop_claim: id (address), claimed, immediateRelease, milestonesCompleted, claimedAt
// - airdrop_milestone_event: id (txHash-logIndex), claimant, milestone, amountReleased, timestamp, blockNumber

ponder.on("AirdropClaimV3:AirdropClaimed", async ({ event, context }) => {
  const { db } = context;
  const { claimant, immediateRelease } = event.args;

  // TODO: Add airdrop_claim table to schema
  // await db.insert(schema.airdropClaim).values({
  //   id: claimant,
  //   claimed: true,
  //   immediateRelease,
  //   claimedAt: event.block.timestamp,
  // });
  console.log("AirdropClaimV3:AirdropClaimed", { claimant, immediateRelease });
});

ponder.on("AirdropClaimV3:MilestoneCompleted", async ({ event, context }) => {
  const { db } = context;
  const { claimant, milestone, amountReleased } = event.args;

  // TODO: Add airdrop_claim table to track milestonesCompleted (bitmask)
  // TODO: Add airdrop_milestone_event table
  console.log("AirdropClaimV3:MilestoneCompleted", { claimant, milestone: Number(milestone), amountReleased });
});

// ============================================
// RolePayroll Events
// ============================================
// Required schema tables:
// - role_enrollment: id (address), roleType, rank, status, enrolledAt, stakedAmount, strikes
// - role_pay_event: id (txHash-logIndex), holder, epoch, uptimeCount, payAmount, timestamp, blockNumber
// - role_event: id (txHash-logIndex), eventType (heartbeat_reported, abandonment_detected, role_resigned, strike_issued), holder, timestamp, blockNumber

ponder.on("RolePayroll:RoleEnrolled", async ({ event, context }) => {
  const { db } = context;
  const { holder, roleType, rank, certFee } = event.args;

  // TODO: Add role_enrollment table to schema
  // await db.insert(schema.roleEnrollment).values({
  //   id: holder,
  //   roleType,
  //   rank,
  //   status: 0, // Active
  //   enrolledAt: event.block.timestamp,
  //   stakedAmount: 0n,
  //   strikes: 0,
  // });
  console.log("RolePayroll:RoleEnrolled", { holder, roleType, rank, certFee });
});

ponder.on("RolePayroll:WeeklyPayClaimed", async ({ event, context }) => {
  const { db } = context;
  const { holder, epoch, uptimeCount, payAmount } = event.args;

  // TODO: Add role_pay_event table to schema
  // await db.insert(schema.rolePayEvent).values({
  //   id: `${event.transaction.hash}-${event.log.logIndex}`,
  //   holder,
  //   epoch,
  //   uptimeCount,
  //   payAmount,
  //   timestamp: event.block.timestamp,
  //   blockNumber: event.block.number,
  // });
  console.log("RolePayroll:WeeklyPayClaimed", { holder, epoch, uptimeCount, payAmount });
});

ponder.on("RolePayroll:HeartbeatReported", async ({ event, context }) => {
  const { db } = context;
  const { holder, timestamp } = event.args;

  // TODO: Add role_event table to schema
  // await db.insert(schema.roleEvent).values({
  //   id: `${event.transaction.hash}-${event.log.logIndex}`,
  //   eventType: "heartbeat_reported",
  //   holder,
  //   timestamp: event.block.timestamp,
  //   blockNumber: event.block.number,
  // });
  console.log("RolePayroll:HeartbeatReported", { holder, timestamp });
});

ponder.on("RolePayroll:AbandonmentDetected", async ({ event, context }) => {
  const { db } = context;
  const { holder, silentDuration } = event.args;

  // TODO: Update role_enrollment status to Suspended
  // TODO: Add role_event for abandonment_detected
  console.log("RolePayroll:AbandonmentDetected", { holder, silentDuration });
});

ponder.on("RolePayroll:RoleResigned", async ({ event, context }) => {
  const { db } = context;
  const { holder } = event.args;

  // TODO: Update role_enrollment status to Resigned
  // TODO: Add role_event for role_resigned
  console.log("RolePayroll:RoleResigned", { holder });
});

ponder.on("RolePayroll:StrikeIssued", async ({ event, context }) => {
  const { db } = context;
  const { holder, totalStrikes, reason } = event.args;

  // TODO: Update role_enrollment strikes count
  // TODO: Add role_event for strike_issued
  console.log("RolePayroll:StrikeIssued", { holder, totalStrikes, reason });
});
