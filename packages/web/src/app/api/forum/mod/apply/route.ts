import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/forum-auth";
import { rateLimit, getIPKey } from "@/lib/rate-limit";
import {
  getUserByAddress,
  createModApplication,
} from "@/lib/firestore-store";

// POST /api/forum/mod/apply — submit a moderator application
export async function POST(request: NextRequest) {
  const limited = rateLimit(`mod-apply:${getIPKey(request)}`, 60_000, 3);
  if (limited) return limited;

  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const { tier, reason } = body;

  if (!tier || !reason?.trim()) {
    return NextResponse.json(
      { error: "Tier and reason are required" },
      { status: 400 }
    );
  }

  const validTiers = ["community", "senior", "lead"];
  if (!validTiers.includes(tier)) {
    return NextResponse.json(
      { error: `Invalid tier. Must be one of: ${validTiers.join(", ")}` },
      { status: 400 }
    );
  }

  if (reason.trim().length > 2000) {
    return NextResponse.json(
      { error: "Reason must be under 2000 characters" },
      { status: 400 }
    );
  }

  // Check if user already has mod status
  const user = await getUserByAddress(auth.address);
  if (user?.modTier) {
    return NextResponse.json(
      { error: "You are already a moderator" },
      { status: 400 }
    );
  }

  try {
    await createModApplication({
      address: auth.address,
      tier,
      reason: reason.trim(),
      createdAt: Date.now(),
      status: "pending",
    });

    return NextResponse.json(
      { submitted: true },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to submit application" },
      { status: 500 }
    );
  }
}
