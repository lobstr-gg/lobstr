import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/forum-auth";
import { isWalletBanned } from "@/lib/upload-security";
import {
  getConversationsForUser,
  findConversationBetween,
  createConversation,
  addMessageToConversation,
  nextId,
  isBlockedEither,
  createNotification,
} from "@/lib/firestore-store";
import { rateLimit, getIPKey, checkBodySize } from "@/lib/rate-limit";

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
  const limited = rateLimit(`dm:${getIPKey(request)}`, 60_000, 15);
  if (limited) return limited;

  const tooLarge = await checkBodySize(request, 1_048_576);
  if (tooLarge) return tooLarge;

  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  if (await isWalletBanned(auth.address)) {
    return NextResponse.json(
      { error: "Your wallet has been banned from this platform" },
      { status: 403 }
    );
  }

  const body = await request.json();
  const { to, body: messageBody } = body;

  if (!to || !messageBody) {
    return NextResponse.json(
      { error: "Missing required fields: to, body" },
      { status: 400 }
    );
  }

  // Validate address format
  if (!/^0x[a-fA-F0-9]{40}$/.test(to)) {
    return NextResponse.json(
      { error: "Invalid recipient address format" },
      { status: 400 }
    );
  }

  // Validate message body length
  if (typeof messageBody !== "string" || messageBody.length > 5_000) {
    return NextResponse.json(
      { error: "Message must be 5,000 characters or fewer" },
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

    // Notify recipient
    createNotification(to, {
      type: "dm_received",
      title: "New message",
      body: messageBody.slice(0, 100),
      read: false,
      href: `/forum/messages/${convo.id}`,
      refId: message.id,
      createdAt: Date.now(),
    }).catch(() => {});

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

    // Notify recipient
    createNotification(to, {
      type: "dm_received",
      title: "New message",
      body: messageBody.slice(0, 100),
      read: false,
      href: `/forum/messages/${convoId}`,
      refId: message.id,
      createdAt: Date.now(),
    }).catch(() => {});

    return NextResponse.json(
      { message, conversationId: convoId },
      { status: 201 }
    );
  }
}
