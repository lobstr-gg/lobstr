import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/forum-auth";
import {
  getNotificationsForUser,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/lib/firestore-store";

// GET /api/forum/notifications — list notifications for current user
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;

    const notifications = await getNotificationsForUser(auth.address);
    return NextResponse.json({ notifications });
  } catch (err) {
    console.error("GET /api/forum/notifications error:", err);
    return NextResponse.json(
      { error: "Failed to fetch notifications" },
      { status: 500 }
    );
  }
}

// POST /api/forum/notifications — mark notification(s) as read
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (auth instanceof NextResponse) return auth;

    const body = await request.json();

    if (body.markAllRead) {
      await markAllNotificationsRead(auth.address);
      return NextResponse.json({ ok: true });
    }

    if (body.markRead) {
      await markNotificationRead(body.markRead, auth.address);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    console.error("POST /api/forum/notifications error:", err);
    return NextResponse.json(
      { error: "Failed to update notifications" },
      { status: 500 }
    );
  }
}
