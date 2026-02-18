import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/forum-auth";
import {
  getConversationsForUser,
  findConversationBetween,
  createConversation,
  addMessageToConversation,
  nextId,
  isBlockedEither,
} from "@/lib/firestore-store";

// GET /api/forum/messages — list conversations for authed user
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const conversations = (await getConversationsForUser(auth.address)).sort(
    (a, b) => b.lastMessageAt - a.lastMessageAt
  );

  // Return conversation list without full message bodies
  const list = conversations.map((c) => ({
    id: c.id,
    participants: c.participants,
    lastMessageAt: c.lastMessageAt,
    unreadCount: c.unreadCount,
    lastMessage: c.messages[c.messages.length - 1]?.body.slice(0, 80),
  }));

  return NextResponse.json({ conversations: list });
}

// POST /api/forum/messages — send a DM
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const { to, body: messageBody } = body;

  if (!to || !messageBody) {
    return NextResponse.json(
      { error: "Missing required fields: to, body" },
      { status: 400 }
    );
  }

  if (to === auth.address) {
    return NextResponse.json(
      { error: "Cannot message yourself" },
      { status: 400 }
    );
  }

  const blocked = await isBlockedEither(auth.address, to);
  if (blocked) {
    return NextResponse.json(
      { error: "Cannot message this user" },
      { status: 403 }
    );
  }

  const message = {
    id: await nextId("message"),
    sender: auth.address,
    body: messageBody,
    createdAt: Date.now(),
  };

  // Find existing conversation between these two users
  const convo = await findConversationBetween(auth.address, to);

  if (convo) {
    await addMessageToConversation(convo.id, message, {
      lastMessageAt: message.createdAt,
      unreadCount: convo.unreadCount + 1,
    });
    return NextResponse.json(
      { message, conversationId: convo.id },
      { status: 201 }
    );
  } else {
    const convoId = await nextId("conversation");
    await createConversation(
      {
        id: convoId,
        participants: [auth.address, to],
        unreadCount: 1,
        lastMessageAt: message.createdAt,
      },
      message
    );
    return NextResponse.json(
      { message, conversationId: convoId },
      { status: 201 }
    );
  }
}
