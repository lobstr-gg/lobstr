import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/forum-auth";
import { rateLimit, getIPKey } from "@/lib/rate-limit";
import { createReport, generateId } from "@/lib/firestore-store";

const VALID_REASONS = ["scam", "spam", "harassment", "impersonation", "other"];
const VALID_TARGET_TYPES = ["post", "listing", "user"];

// POST /api/forum/report — submit a user report
export async function POST(request: NextRequest) {
  const limited = rateLimit(`report:${getIPKey(request)}`, 60_000, 5);
  if (limited) return limited;

  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const { targetType, targetId, reason, description, evidence } = body;

  if (!targetType || !VALID_TARGET_TYPES.includes(targetType)) {
    return NextResponse.json(
      { error: "Invalid targetType" },
      { status: 400 }
    );
  }

  if (!targetId) {
    return NextResponse.json(
      { error: "Missing targetId" },
      { status: 400 }
    );
  }

  if (!reason || !VALID_REASONS.includes(reason)) {
    return NextResponse.json(
      { error: "Invalid reason" },
      { status: 400 }
    );
  }

  if (!description || typeof description !== "string" || description.length > 500) {
    return NextResponse.json(
      { error: "Description is required (max 500 chars)" },
      { status: 400 }
    );
  }

  const id = `rpt_${generateId()}`;

  await createReport({
    id,
    reporter: auth.address,
    targetType,
    targetId,
    reason,
    description,
    evidence: {
      postId: evidence?.postId ?? undefined,
      listingId: evidence?.listingId ?? undefined,
      targetAddress: evidence?.targetAddress ?? undefined,
      txHashes: Array.isArray(evidence?.txHashes) ? evidence.txHashes.slice(0, 10) : [],
      timestamps: Array.isArray(evidence?.timestamps) ? evidence.timestamps.slice(0, 10) : [],
      capturedAt: evidence?.capturedAt ?? Date.now(),
    },
    status: "pending",
    createdAt: Date.now(),
  });

  return NextResponse.json({ id }, { status: 201 });
}
