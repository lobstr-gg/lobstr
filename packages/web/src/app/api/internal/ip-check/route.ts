import { NextRequest, NextResponse } from "next/server";
import { getBannedIp } from "@/lib/firestore-store";

/**
 * GET /api/internal/ip-check?ip=x.x.x.x
 *
 * Lightweight ban check used by middleware. Not authenticated — only
 * callable internally (excluded from the middleware matcher to prevent
 * circular calls). Returns { banned: boolean }.
 */
export async function GET(request: NextRequest) {
  const internalKey = request.headers.get("x-internal-key");
  if (internalKey !== process.env.INTERNAL_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = request.nextUrl.searchParams.get("ip");
  if (!ip) {
    return NextResponse.json({ banned: false });
  }

  try {
    const entry = await getBannedIp(ip);
    const banned = entry?.banned === true && entry.scope === "platform";
    return NextResponse.json({ banned });
  } catch {
    // Fail open — don't block users if Firestore is unreachable
    return NextResponse.json({ banned: false });
  }
}
