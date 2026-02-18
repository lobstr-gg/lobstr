import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/forum-auth";
import { getNotificationsForUser } from "@/lib/firestore-store";

// GET /api/forum/notifications — list notifications for current user
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const notifications = await getNotificationsForUser(auth.address);
  return NextResponse.json({ notifications });
}
