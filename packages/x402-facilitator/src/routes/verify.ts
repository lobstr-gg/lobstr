import type { Context } from "hono";
import type { x402Facilitator } from "@x402/core/facilitator";
import { querySellerTrust } from "../trust.js";

export function verifyHandler(facilitator: x402Facilitator) {
  return async (c: Context) => {
    const body = await c.req.json();
    const { paymentPayload, paymentRequirements } = body;

    if (!paymentPayload || !paymentRequirements) {
      return c.json({ isValid: false, invalidReason: "Missing paymentPayload or paymentRequirements" }, 400);
    }

    // Run standard x402 verification (signature, balance, etc.)
    const result = await facilitator.verify(paymentPayload, paymentRequirements);

    // Enrich with trust data if verification passed
    if (result.isValid) {
      try {
        const seller = paymentRequirements.payTo as `0x${string}`;
        const trust = await querySellerTrust(seller);
        result.extensions = {
          ...result.extensions,
          "lobstr-trust": trust,
        };
      } catch (err) {
        console.error("[verify] Failed to enrich with trust data:", err);
      }
    }

    return c.json(result);
  };
}
