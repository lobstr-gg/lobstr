import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/forum-auth";
import {
  findConversationBetween,
  createConversation,
  addMessageToConversation,
  nextId,
  getModeratorAddresses,
} from "@/lib/firestore-store";
import { rateLimit, getIPKey } from "@/lib/rate-limit";

// POST /api/forum/messages/mod-team — send a message to the mod team
// Routes to the least-busy available moderator
export async function POST(request: NextRequest) {
  const limited = rateLimit(`mod-dm:${getIPKey(request)}`, 60_000, 5);
  if (limited) return limited;

  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const { body: messageBody, subject } = body;

  if (!messageBody) {
    return NextResponse.json(
      { error: "Missing required field: body" },
      { status: 400 }
    );
  }

  if (typeof messageBody !== "string" || messageBody.length > 5_000) {
    return NextResponse.json(
      { error: "Message must be 5,000 characters or fewer" },
      { status: 400 }
    );
  }

  // Get all moderator addresses
  const mods = await getModeratorAddresses();

  if (mods.length === 0) {
    return NextResponse.json(
      { error: "No moderators available. Please try again later." },
      { status: 503 }
    );
  }

  // Find the mod with the least existing conversations with this user
  // (simple round-robin assignment)
  let assignedMod = mods[0];
  let fewestConvos = Infinity;

  for (const mod of mods) {
    if (mod === auth.address) continue; // skip if user is a mod themselves
    const existing = await findConversationBetween(auth.address, mod);
    const count = existing ? 1 : 0;
    if (count < fewestConvos) {
      fewestConvos = count;
      assignedMod = mod;
    }
  }

  const fullBody = subject
    ? `**[Mod Request] ${subject}**\n\n${messageBody}`
    : `**[Mod Request]**\n\n${messageBody}`;

  const message = {
    id: await nextId("message"),
    sender: auth.address,
    body: fullBody,
    createdAt: Date.now(),
  };

  // Find or create conversation with assigned mod
  const convo = await findConversationBetween(auth.address, assignedMod);

  if (convo) {
    await addMessageToConversation(convo.id, message, {
      lastMessageAt: message.createdAt,
      unreadCount: convo.unreadCount + 1,
    });
    return NextResponse.json(
      { message, conversationId: convo.id, assignedMod },
      { status: 201 }
    );
  } else {
    const convoId = await nextId("conversation");
    await createConversation(
      {
        id: convoId,
        participants: [auth.address, assignedMod],
        unreadCount: 1,
        lastMessageAt: message.createdAt,
      },
      message
    );
    return NextResponse.json(
      { message, conversationId: convoId, assignedMod },
      { status: 201 }
    );
  }
}
