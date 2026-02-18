import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/forum-auth";
import { getPendingFriendRequests } from "@/lib/firestore-store";

// GET /api/forum/users/friends/requests — list incoming pending requests
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const requests = await getPendingFriendRequests(auth.address);
  return NextResponse.json({ requests });
}
