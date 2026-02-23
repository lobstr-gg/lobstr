import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/forum-auth";
import {
  getChannelsForUser,
  ensureArbChannel,
  getChannel,
  getUserByAddress,
} from "@/lib/firestore-store";

// GET /api/forum/channels — list channels accessible to authed user
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const addr = auth.address.toLowerCase();
    const channels = await getChannelsForUser(addr);

    return NextResponse.json({
      channels: channels.map((c) => ({
        id: c.id,
        type: c.type,
        name: c.name,
        disputeId: c.disputeId,
        participantCount: c.type === "mod" ? 0 : c.participants.length,
        lastMessageAt: c.lastMessageAt,
        createdAt: c.createdAt,
      })),
    });
  } catch (err) {
    console.error("[channels] GET error:", err);
    return NextResponse.json(
      { error: "Failed to load channels" },
      { status: 500 }
    );
  }
}

// POST /api/forum/channels — create an arbitration channel
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const { disputeId, participants } = body;

    if (!disputeId || !Array.isArray(participants) || participants.length === 0) {
      return NextResponse.json(
        { error: "Missing required fields: disputeId, participants" },
        { status: 400 }
      );
    }

    const addr = auth.address.toLowerCase();
    const normalizedParticipants = participants.map((p: string) =>
      p.toLowerCase()
    );

    // Verify caller is one of the participants
    if (!normalizedParticipants.includes(addr)) {
      return NextResponse.json(
        { error: "You must be one of the participants" },
        { status: 403 }
      );
    }

    // Idempotent — returns existing if already exists
    const channel = await ensureArbChannel(disputeId, normalizedParticipants);

    return NextResponse.json({ channel }, { status: 201 });
  } catch (err) {
    console.error("[channels] POST error:", err);
    return NextResponse.json(
      { error: "Failed to create channel" },
      { status: 500 }
    );
  }
}
