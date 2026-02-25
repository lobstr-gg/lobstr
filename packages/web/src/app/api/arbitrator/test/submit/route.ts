import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { requireAuth } from "@/lib/forum-auth";
import { getDb } from "@/lib/firebase-admin";
import { rateLimit, getIPKey } from "@/lib/rate-limit";
import { gradeAnalysis } from "@/lib/generate-test";
import { CHAIN } from "@/config/contracts";
import { CONTRACTS_BY_CHAIN } from "@/config/contract-addresses";
import { DisputeArbitrationABI } from "@/config/abis";

const MC_PASS_THRESHOLD = 0.8; // 80%
const ANALYSIS_PASS_THRESHOLD = 0.7; // 70%

/**
 * POST /api/arbitrator/test/submit
 *
 * Grade a competency test submission using GPT-4o and certify on-chain if passed.
 * Body: { scenarioId, mcAnswers: number[], analysis: string, ruling: string }
 */
export async function POST(request: NextRequest) {
  const limited = rateLimit(`arb-submit:${getIPKey(request)}`, 60_000, 3);
  if (limited) return limited;

  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const { scenarioId, mcAnswers, analysis, ruling } = body;

  // Validate input
  if (!scenarioId || !mcAnswers || !analysis || !ruling) {
    return NextResponse.json(
      { error: "Missing required fields: scenarioId, mcAnswers, analysis, ruling" },
      { status: 400 }
    );
  }

  if (typeof analysis !== "string" || analysis.trim().length < 100) {
    return NextResponse.json(
      { error: "Analysis must be at least 100 characters" },
      { status: 400 }
    );
  }

  if (!["BuyerWins", "SellerWins"].includes(ruling)) {
    return NextResponse.json(
      { error: "Ruling must be 'BuyerWins' or 'SellerWins'" },
      { status: 400 }
    );
  }

  const db = getDb();

  // Fetch the answer key from the test session
  const sessionDoc = await db
    .collection("arbitrator_test_sessions")
    .doc(scenarioId)
    .get();

  if (!sessionDoc.exists) {
    return NextResponse.json(
      { error: "Test session not found or expired" },
      { status: 404 }
    );
  }

  const session = sessionDoc.data()!;

  // Verify this session belongs to the submitting user
  if (session.address !== auth.address.toLowerCase()) {
    return NextResponse.json(
      { error: "Session does not belong to this wallet" },
      { status: 403 }
    );
  }

  // Check expiry
  if (Date.now() > session.expiresAt) {
    await db.collection("arbitrator_test_sessions").doc(scenarioId).delete();
    return NextResponse.json(
      { error: "Test session expired. Please start a new test." },
      { status: 410 }
    );
  }

  // --- Grade MC Questions ---
  const correctAnswers = session.mcAnswers as number[];

  if (!Array.isArray(mcAnswers) || mcAnswers.length !== correctAnswers.length) {
    return NextResponse.json(
      { error: `Expected ${correctAnswers.length} MC answers` },
      { status: 400 }
    );
  }

  let mcCorrect = 0;
  for (let i = 0; i < correctAnswers.length; i++) {
    if (mcAnswers[i] === correctAnswers[i]) {
      mcCorrect++;
    }
  }
  const mcScore = mcCorrect / correctAnswers.length;

  // --- Grade Ruling ---
  const rulingCorrect = ruling === session.expectedRuling;

  // --- Grade Analysis via GPT-4o ---
  let analysisScore = 0;
  let analysisFeedback = "";
  try {
    const gradeResult = await gradeAnalysis(session.gradingRubric, analysis.trim());
    analysisScore = gradeResult.score / 100;
    analysisFeedback = gradeResult.feedback;
  } catch {
    // Grading service unavailable — fail safe, don't grant free passes
    analysisScore = 0;
    analysisFeedback = "Analysis grading unavailable — please retry.";
  }

  // --- Determine Pass/Fail ---
  const passed =
    mcScore >= MC_PASS_THRESHOLD &&
    analysisScore >= ANALYSIS_PASS_THRESHOLD &&
    rulingCorrect;

  // Store result
  const resultData: Record<string, unknown> = {
    scenarioId,
    mcScore: Math.round(mcScore * 100),
    analysisScore: Math.round(analysisScore * 100),
    analysisFeedback,
    rulingCorrect,
    passed,
    submittedAt: Date.now(),
    lastAttemptAt: Date.now(),
    certifiedAt: null,
    txHash: null,
  };

  // --- On-chain certification if passed ---
  let txHash: string | null = null;

  if (passed) {
    const certifierKey = process.env.CERTIFIER_SIGNER_KEY;
    if (!certifierKey) {
      resultData.certificationError = "CERTIFIER_SIGNER_KEY not configured";
    } else {
      try {
        const contracts = CONTRACTS_BY_CHAIN[CHAIN.id as keyof typeof CONTRACTS_BY_CHAIN];
        if (!contracts || contracts.disputeArbitration === "0x0000000000000000000000000000000000000000") {
          resultData.certificationError = "DisputeArbitration contract not configured";
        } else {
          const account = privateKeyToAccount(certifierKey as `0x${string}`);
          const publicClient = createPublicClient({
            chain: CHAIN,
            transport: http(),
          });

          // Check if already certified on-chain
          const alreadyCertified = await publicClient.readContract({
            address: contracts.disputeArbitration,
            abi: DisputeArbitrationABI,
            functionName: "isCertified",
            args: [auth.address as `0x${string}`],
          });

          if (!alreadyCertified) {
            const walletClient = createWalletClient({
              account,
              chain: CHAIN,
              transport: http(),
            });

            const hash = await walletClient.writeContract({
              address: contracts.disputeArbitration,
              abi: DisputeArbitrationABI,
              functionName: "certifyArbitrator",
              args: [auth.address as `0x${string}`],
            });

            txHash = hash;
            resultData.txHash = hash;
            resultData.certifiedAt = Date.now();
          } else {
            resultData.certifiedAt = Date.now();
            resultData.txHash = "already-certified";
          }
        }
      } catch (err) {
        console.error("[arbitrator/test/submit] Certification tx failed:", err);
        resultData.certificationError = "Certification tx failed";
      }
    }
  }

  // Save result to arbitrator_tests
  await db
    .collection("arbitrator_tests")
    .doc(auth.address.toLowerCase())
    .set(resultData);

  // Delete the one-time test session
  await db.collection("arbitrator_test_sessions").doc(scenarioId).delete();

  return NextResponse.json({
    passed,
    scores: {
      mc: Math.round(mcScore * 100),
      analysis: Math.round(analysisScore * 100),
      rulingCorrect,
    },
    analysisFeedback,
    txHash,
  });
}
