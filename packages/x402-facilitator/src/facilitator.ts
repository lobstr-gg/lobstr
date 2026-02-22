import { x402Facilitator } from "@x402/core/facilitator";
import type { FacilitatorSettleContext, FacilitatorSettleResultContext } from "@x402/core/facilitator";
import { ExactEvmScheme } from "@x402/evm/exact/facilitator";
import { toFacilitatorEvmSigner, type FacilitatorEvmSigner } from "@x402/evm";
import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  CHAIN,
  RPC_URL,
  CAIP2_NETWORK,
  FACILITATOR_PRIVATE_KEY,
  MIN_REPUTATION_SCORE,
  REQUIRE_STAKE,
} from "./config.js";
import { querySellerTrust } from "./trust.js";
import type { Network } from "@x402/core/types";

// ─── Build Facilitator ───────────────────────────────────────────────────────

export function buildFacilitator() {
  if (!FACILITATOR_PRIVATE_KEY) {
    throw new Error("FACILITATOR_PRIVATE_KEY is required");
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

  // Build the EVM signer adapter matching x402's FacilitatorEvmSigner interface
  const signerInput: Omit<FacilitatorEvmSigner, "getAddresses"> & { address: `0x${string}` } = {
    address: account.address,
    readContract: (args) => readClient.readContract(args as Parameters<typeof readClient.readContract>[0]),
    verifyTypedData: (args) => readClient.verifyTypedData(args as Parameters<typeof readClient.verifyTypedData>[0]),
    writeContract: (args) => walletClient.writeContract(args as Parameters<typeof walletClient.writeContract>[0]),
    sendTransaction: (args) => walletClient.sendTransaction(args as Parameters<typeof walletClient.sendTransaction>[0]),
    waitForTransactionReceipt: (args) => readClient.waitForTransactionReceipt(args),
    getCode: (args) => readClient.getCode(args),
  };

  const evmSigner = toFacilitatorEvmSigner(signerInput);
  const evmScheme = new ExactEvmScheme(evmSigner);

  const facilitator = new x402Facilitator();
  facilitator.register(CAIP2_NETWORK as Network, evmScheme);

  // ─── Hook: Check seller trust before settling ────────────────────────────

  facilitator.onBeforeSettle(async (ctx: FacilitatorSettleContext) => {
    const seller = ctx.requirements.payTo as `0x${string}`;

    try {
      const trust = await querySellerTrust(seller);

      if (REQUIRE_STAKE && trust.stakeTier === "None") {
        return {
          abort: true as const,
          reason: `Seller ${seller} has no active stake on LOBSTR`,
        };
      }

      if (trust.reputationScore < MIN_REPUTATION_SCORE) {
        return {
          abort: true as const,
          reason: `Seller reputation ${trust.reputationScore} below minimum ${MIN_REPUTATION_SCORE}`,
        };
      }
    } catch (err) {
      console.error("[trust] Failed to query seller trust:", err);
    }

    // Return void when not aborting
  });

  // ─── Hook: Enrich settlement response with trust data ────────────────────

  facilitator.onAfterSettle(async (ctx: FacilitatorSettleResultContext) => {
    const seller = ctx.requirements.payTo as `0x${string}`;

    try {
      const trust = await querySellerTrust(seller);
      ctx.result.extensions = {
        ...ctx.result.extensions,
        "lobstr-trust": trust,
      };
    } catch (err) {
      console.error("[trust] Failed to enrich settlement response:", err);
    }
  });

  return facilitator;
}
