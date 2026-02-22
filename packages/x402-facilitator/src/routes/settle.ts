import type { Context } from "hono";
import type { x402Facilitator } from "@x402/core/facilitator";
import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CHAIN, RPC_URL, FACILITATOR_PRIVATE_KEY } from "../config.js";
import { querySellerTrust } from "../trust.js";
import { settleViaBridge, type BridgeExtension } from "../bridge.js";
import { settleViaCredit, type CreditExtension } from "../credit.js";

export function settleHandler(facilitator: x402Facilitator) {
  return async (c: Context) => {
    const body = await c.req.json();
    const { paymentPayload, paymentRequirements } = body;

    if (!paymentPayload || !paymentRequirements) {
      return c.json({ success: false, errorReason: "Missing paymentPayload or paymentRequirements" }, 400);
    }

    // ─── Check for credit routing extension ────────────────────────────────
    const creditExt = paymentPayload?.extensions?.["lobstr-credit"] as CreditExtension | undefined;

    if (creditExt) {
      console.log("[settle] Credit mode detected, routing through X402CreditFacility");

      // 1. Verify the x402 payment signature
      const verifyResult = await facilitator.verify(paymentPayload, paymentRequirements);
      if (!verifyResult.isValid) {
        return c.json({
          success: false,
          errorReason: verifyResult.invalidReason ?? "Payment verification failed",
        });
      }

      // 2. Trust checks on the seller
      const seller = paymentRequirements.payTo as `0x${string}`;
      let trust;
      try {
        trust = await querySellerTrust(seller);
      } catch (err) {
        console.error("[settle] Trust query failed:", err);
        return c.json({ success: false, errorReason: "Failed to query seller trust" });
      }

      // 3. Settle through the credit facility
      try {
        if (!FACILITATOR_PRIVATE_KEY) {
          return c.json({ success: false, errorReason: "Facilitator key not configured" });
        }

        const account = privateKeyToAccount(FACILITATOR_PRIVATE_KEY);
        const walletClient = createWalletClient({
          account,
          chain: CHAIN,
          transport: http(RPC_URL),
        });
        const readClient = createPublicClient({
          chain: CHAIN,
          transport: http(RPC_URL),
        });

        const { drawId, escrowJobId, txHash } = await settleViaCredit(creditExt, walletClient, readClient as any);

        console.log(`[settle] Credit settlement complete: drawId=${drawId}, jobId=${escrowJobId}, tx=${txHash}`);

        return c.json({
          success: true,
          txHash,
          extensions: {
            "lobstr-credit": { drawId: drawId.toString(), escrowJobId: escrowJobId.toString() },
            "lobstr-trust": trust,
          },
        });
      } catch (err) {
        console.error("[settle] Credit settlement failed:", err);
        return c.json({
          success: false,
          errorReason: err instanceof Error ? err.message : "Credit settlement failed",
        });
      }
    }

    // ─── Check for bridge routing extension ────────────────────────────────
    const bridgeExt = paymentPayload?.extensions?.["lobstr-escrow"] as BridgeExtension | undefined;

    if (bridgeExt) {
      // Phase 2: Route through X402EscrowBridge
      console.log("[settle] Bridge mode detected, routing through X402EscrowBridge");

      // 1. Verify the x402 payment signature (standard check)
      const verifyResult = await facilitator.verify(paymentPayload, paymentRequirements);
      if (!verifyResult.isValid) {
        return c.json({
          success: false,
          errorReason: verifyResult.invalidReason ?? "Payment verification failed",
        });
      }

      // 2. Trust checks on the seller
      const seller = paymentRequirements.payTo as `0x${string}`;
      let trust;
      try {
        trust = await querySellerTrust(seller);
      } catch (err) {
        console.error("[settle] Trust query failed:", err);
        return c.json({ success: false, errorReason: "Failed to query seller trust" });
      }

      // 3. Settle through the bridge
      try {
        if (!FACILITATOR_PRIVATE_KEY) {
          return c.json({ success: false, errorReason: "Facilitator key not configured" });
        }

        const account = privateKeyToAccount(FACILITATOR_PRIVATE_KEY);
        const walletClient = createWalletClient({
          account,
          chain: CHAIN,
          transport: http(RPC_URL),
        });
        const readClient = createPublicClient({
          chain: CHAIN,
          transport: http(RPC_URL),
        });

        const { jobId, txHash } = await settleViaBridge(bridgeExt, walletClient, readClient as any);

        console.log(`[settle] Bridge settlement complete: jobId=${jobId}, tx=${txHash}`);

        return c.json({
          success: true,
          txHash,
          extensions: {
            "lobstr-escrow": { jobId: jobId.toString() },
            "lobstr-trust": trust,
          },
        });
      } catch (err) {
        console.error("[settle] Bridge settlement failed:", err);
        return c.json({
          success: false,
          errorReason: err instanceof Error ? err.message : "Bridge settlement failed",
        });
      }
    }

    // ─── Phase 1: Standard x402 settlement with trust hooks ────────────────
    const result = await facilitator.settle(paymentPayload, paymentRequirements);

    return c.json(result);
  };
}
