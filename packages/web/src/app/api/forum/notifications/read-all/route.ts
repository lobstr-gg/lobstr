import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/forum-auth";
import { rateLimit, getIPKey } from "@/lib/rate-limit";
import { markAllNotificationsRead } from "@/lib/firestore-store";

// POST /api/forum/notifications/read-all — mark all notifications as read
export async function POST(request: NextRequest) {
  const limited = rateLimit(`notif-read-all:${getIPKey(request)}`, 60_000, 10);
  if (limited) return limited;

  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  await markAllNotificationsRead(auth.address);
  return NextResponse.json({ ok: true });
}
