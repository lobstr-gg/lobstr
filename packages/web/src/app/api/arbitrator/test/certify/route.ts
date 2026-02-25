import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { requireAuth } from "@/lib/forum-auth";
import { getDb } from "@/lib/firebase-admin";
import { rateLimit, getIPKey } from "@/lib/rate-limit";
import { CHAIN } from "@/config/contracts";
import { CONTRACTS_BY_CHAIN } from "@/config/contract-addresses";
import { DisputeArbitrationABI } from "@/config/abis";

/**
 * POST /api/arbitrator/test/certify
 *
 * Retry on-chain certification for wallets that passed the test but whose
 * certifyArbitrator tx failed (e.g. they hadn't staked yet at submission time).
 * Requires: Firestore passed === true, txHash === null, address must be staked.
 */
export async function POST(request: NextRequest) {
  const limited = rateLimit(`arb-certify:${getIPKey(request)}`, 60_000, 5);
  if (limited) return limited;

  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const db = getDb();

  const testDoc = await db
    .collection("arbitrator_tests")
    .doc(auth.address.toLowerCase())
    .get();

  if (!testDoc.exists) {
    return NextResponse.json(
      { error: "No test record found for this wallet." },
      { status: 404 }
    );
  }

  const data = testDoc.data()!;

  if (!data.passed) {
    return NextResponse.json(
      { error: "Test not passed. Complete the certification test first." },
      { status: 400 }
    );
  }

  if (data.txHash && data.txHash !== "already-certified") {
    return NextResponse.json(
      { error: "Already certified on-chain.", txHash: data.txHash },
      { status: 400 }
    );
  }

  const certifierKey = process.env.CERTIFIER_SIGNER_KEY;
  if (!certifierKey) {
    return NextResponse.json(
      { error: "Certifier not configured." },
      { status: 503 }
    );
  }

  const contracts = CONTRACTS_BY_CHAIN[CHAIN.id as keyof typeof CONTRACTS_BY_CHAIN];
  if (!contracts || contracts.disputeArbitration === "0x0000000000000000000000000000000000000000") {
    return NextResponse.json(
      { error: "DisputeArbitration contract not configured." },
      { status: 503 }
    );
  }

  const publicClient = createPublicClient({ chain: CHAIN, transport: http() });

  // Check already certified on-chain
  const alreadyCertified = await publicClient.readContract({
    address: contracts.disputeArbitration,
    abi: DisputeArbitrationABI,
    functionName: "isCertified",
    args: [auth.address as `0x${string}`],
  });

  if (alreadyCertified) {
    await db.collection("arbitrator_tests").doc(auth.address.toLowerCase()).update({
      txHash: "already-certified",
      certifiedAt: Date.now(),
    });
    return NextResponse.json({ certified: true, txHash: "already-certified" });
  }

  // Attempt certification
  try {
    const account = privateKeyToAccount(certifierKey as `0x${string}`);
    const walletClient = createWalletClient({ account, chain: CHAIN, transport: http() });

    const hash = await walletClient.writeContract({
      address: contracts.disputeArbitration,
      abi: DisputeArbitrationABI,
      functionName: "certifyArbitrator",
      args: [auth.address as `0x${string}`],
    });

    await db.collection("arbitrator_tests").doc(auth.address.toLowerCase()).update({
      txHash: hash,
      certifiedAt: Date.now(),
      certificationError: null,
    });

    return NextResponse.json({ certified: true, txHash: hash });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    // Common case: address hasn't staked yet — return a clear message
    const notStaked = message.includes("NotActive") || message.includes("BelowMinStake");
    return NextResponse.json(
      {
        error: notStaked
          ? "Wallet has not staked as arbitrator yet. Stake LOB first, then retry."
          : "Certification tx failed. Try again later.",
        detail: message,
      },
      { status: 400 }
    );
  }
}
