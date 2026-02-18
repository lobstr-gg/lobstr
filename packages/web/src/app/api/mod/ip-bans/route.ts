import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isModerator } from "@/lib/forum-auth";
import { getAllBannedIps } from "@/lib/firestore-store";

/**
 * GET /api/mod/ip-bans — List all currently banned IPs (mod-only)
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  if (!(await isModerator(auth.address))) {
    return NextResponse.json(
      { error: "Moderator access required" },
      { status: 403 }
    );
  }

  const bans = await getAllBannedIps();
  return NextResponse.json({ bans });
}
