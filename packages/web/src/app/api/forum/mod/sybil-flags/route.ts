import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isModerator } from "@/lib/forum-auth";
import { rateLimit, getIPKey } from "@/lib/rate-limit";
import { getSybilFlags, createSybilFlag } from "@/lib/firestore-store";

// GET /api/forum/mod/sybil-flags — fetch all pending sybil flags (mod-only)
export async function GET(request: NextRequest) {
  const limited = rateLimit(`sybil-flags:${getIPKey(request)}`, 60_000, 30);
  if (limited) return limited;

  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  if (!(await isModerator(auth.address))) {
    return NextResponse.json(
      { error: "Moderator access required" },
      { status: 403 }
    );
  }

  const flags = await getSybilFlags();
  return NextResponse.json({ flags });
}

// POST /api/forum/mod/sybil-flags — submit a new sybil flag (mod or API key)
export async function POST(request: NextRequest) {
  const limited = rateLimit(`sybil-flag-create:${getIPKey(request)}`, 60_000, 10);
  if (limited) return limited;

  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  if (!(await isModerator(auth.address))) {
    return NextResponse.json(
      { error: "Moderator access required" },
      { status: 403 }
    );
  }

  const body = await request.json();
  const { address, signals, txHashes, score } = body;

  if (!address || !signals || !Array.isArray(signals)) {
    return NextResponse.json(
      { error: "Missing required fields: address, signals" },
      { status: 400 }
    );
  }

  // Validate array contents
  if (!signals.every((s: unknown) => typeof s === "string" && s.length <= 200) || signals.length > 50) {
    return NextResponse.json(
      { error: "signals must be an array of strings (max 50 items, 200 chars each)" },
      { status: 400 }
    );
  }

  if (txHashes !== undefined && (!Array.isArray(txHashes) || !txHashes.every((h: unknown) => typeof h === "string" && /^0x[a-fA-F0-9]{64}$/.test(h as string)) || txHashes.length > 100)) {
    return NextResponse.json(
      { error: "txHashes must be an array of valid transaction hashes (max 100)" },
      { status: 400 }
    );
  }

  await createSybilFlag({
    address,
    signals,
    txHashes: txHashes ?? [],
    score: score ?? signals.length,
    createdAt: Date.now(),
    status: "pending",
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
