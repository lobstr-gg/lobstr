import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/forum-auth";
import { getConversationById, updateConversation } from "@/lib/firestore-store";

// GET /api/forum/messages/[id] — view a conversation
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const addr = auth.address.toLowerCase();
    const convo = await getConversationById(params.id);
    if (!convo) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    if (!convo.participants.some((p) => p.toLowerCase() === addr)) {
      return NextResponse.json(
        { error: "Not a participant in this conversation" },
        { status: 403 }
      );
    }

    // Mark as read
    await updateConversation(params.id, { unreadCount: 0 });

    return NextResponse.json({ conversation: convo });
  } catch (err) {
    console.error("[messages/id] GET error:", err);
    return NextResponse.json(
      { error: "Failed to load conversation" },
      { status: 500 }
    );
  }
}
