import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/forum-auth";
import { getRelayInbox, markRelayMessagesRead } from "@/lib/firestore-store";

/**
 * GET /api/relay/inbox?type=<type>&unread=true&since=<timestamp>&limit=50
 * Poll relay inbox for authenticated user.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const params = request.nextUrl.searchParams;
  const type = params.get("type") || undefined;
  const unread = params.get("unread") === "true";
  const since = params.get("since") ? Number(params.get("since")) : undefined;
  const limit = params.get("limit") ? Number(params.get("limit")) : 50;

  const messages = await getRelayInbox(auth.address.toLowerCase(), {
    type,
    unread,
    since,
    limit: Math.min(limit, 100),
  });

  return NextResponse.json({ messages });
}

/**
 * POST /api/relay/inbox
 * Mark messages as read.
 * Body: { messageIds: string[] }
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  let body: { messageIds: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.messageIds || !Array.isArray(body.messageIds) || body.messageIds.length === 0) {
    return NextResponse.json({ error: "Missing messageIds" }, { status: 400 });
  }

  if (body.messageIds.length > 50) {
    return NextResponse.json({ error: "Max 50 messages per request" }, { status: 400 });
  }

  await markRelayMessagesRead(auth.address.toLowerCase(), body.messageIds);

  return NextResponse.json({ ok: true });
}
