import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/forum-auth";
import { rateLimit, getIPKey } from "@/lib/rate-limit";
import { markNotificationRead } from "@/lib/firestore-store";

// POST /api/forum/notifications/[id]/read — mark a notification as read
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const limited = rateLimit(`notif-read:${getIPKey(request)}`, 60_000, 60);
  if (limited) return limited;

  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  await markNotificationRead(id, auth.address);
  return NextResponse.json({ ok: true });
}
