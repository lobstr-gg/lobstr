import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { requireAuth } from "@/lib/forum-auth";
import { getDb } from "@/lib/firebase-admin";
import { rateLimit, getIPKey } from "@/lib/rate-limit";
import { CHAIN } from "@/config/contracts";
import { CONTRACTS_BY_CHAIN } from "@/config/contract-addresses";
import { DisputeArbitrationABI } from "@/config/abis";

/**
 * GET /api/arbitrator/test/status
 *
 * Check certification status for the authenticated user.
 * Reads from both Firestore (test results) and on-chain (isCertified).
 */
export async function GET(request: NextRequest) {
  const limited = rateLimit(`arb-status:${getIPKey(request)}`, 60_000, 30);
  if (limited) return limited;

  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const db = getDb();

  // Check on-chain certification
  let onChainCertified = false;
  try {
    const contracts = CONTRACTS_BY_CHAIN[CHAIN.id as keyof typeof CONTRACTS_BY_CHAIN];
    if (contracts && contracts.disputeArbitration !== "0x0000000000000000000000000000000000000000") {
      const publicClient = createPublicClient({
        chain: CHAIN,
        transport: http(),
      });

      onChainCertified = (await publicClient.readContract({
        address: contracts.disputeArbitration,
        abi: DisputeArbitrationABI,
        functionName: "isCertified",
        args: [auth.address as `0x${string}`],
      })) as boolean;
    }
  } catch {
    // On-chain check failed — fall back to Firestore only
  }

  // Check Firestore test results
  const testDoc = await db
    .collection("arbitrator_tests")
    .doc(auth.address.toLowerCase())
    .get();

  if (!testDoc.exists) {
    return NextResponse.json({
      certified: onChainCertified,
      testTaken: false,
    });
  }

  const data = testDoc.data()!;

  return NextResponse.json({
    certified: onChainCertified || data.passed,
    testTaken: true,
    passed: data.passed,
    score: {
      mc: data.mcScore,
      analysis: data.analysisScore,
      rulingCorrect: data.rulingCorrect,
    },
    submittedAt: data.submittedAt,
    txHash: data.txHash,
  });
}
