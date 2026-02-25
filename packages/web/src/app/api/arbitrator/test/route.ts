import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/forum-auth";
import { getDb } from "@/lib/firebase-admin";
import { rateLimit, getIPKey } from "@/lib/rate-limit";
import { generateTest } from "@/lib/generate-test";

/**
 * GET /api/arbitrator/test
 *
 * Generate a unique AI-powered competency test scenario on the fly.
 * Produces real evidence files (PDFs, DALL-E images, CSVs) uploaded to Firebase Storage.
 * Auth: wallet signature (existing forum auth pattern).
 */
export async function GET(request: NextRequest) {
  // Tighter rate limit — generation is expensive (~$0.10-0.20/call)
  const limited = rateLimit(`arb-test:${getIPKey(request)}`, 300_000, 3);
  if (limited) return limited;

  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const db = getDb();

  // Check if user already has a passed test
  const existingDoc = await db
    .collection("arbitrator_tests")
    .doc(auth.address.toLowerCase())
    .get();

  if (existingDoc.exists) {
    const data = existingDoc.data()!;
    if (data.passed) {
      return NextResponse.json({
        alreadyPassed: true,
        passedAt: data.submittedAt,
        score: {
          mc: data.mcScore,
          analysis: data.analysisScore,
          rulingCorrect: data.rulingCorrect,
        },
      });
    }
  }

  // Create session ID upfront (used as storage folder name)
  const sessionId = crypto.randomUUID();

  // Generate fresh AI scenario with real evidence files
  let result;
  try {
    result = await generateTest(sessionId);
  } catch (err) {
    console.error("[arbitrator/test] Failed to generate test scenario:", err);
    return NextResponse.json(
      { error: "Failed to generate test scenario" },
      { status: 503 }
    );
  }

  const { scenario, evidenceFiles } = result;

  // Store answer key in Firestore
  await db
    .collection("arbitrator_test_sessions")
    .doc(sessionId)
    .set({
      address: auth.address.toLowerCase(),
      mcAnswers: scenario.mcQuestions.map((q) => q.correctIndex),
      expectedRuling: scenario.expectedRuling,
      gradingRubric: scenario.gradingRubric,
      createdAt: Date.now(),
      expiresAt: Date.now() + 60 * 60 * 1000, // 1 hour
    });

  // Return test to client WITHOUT answers
  const safeQuestions = scenario.mcQuestions.map((q) => ({
    question: q.question,
    options: q.options,
  }));

  return NextResponse.json({
    scenarioId: sessionId,
    title: scenario.title,
    description: scenario.description,
    evidenceFiles: evidenceFiles.map((f) => ({
      name: f.name,
      type: f.type,
      url: f.url,
    })),
    mcQuestions: safeQuestions,
    analysisPrompt: scenario.analysisPrompt,
    rulingOptions: ["BuyerWins", "SellerWins"],
  });
}
