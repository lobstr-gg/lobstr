import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/forum-auth";
import {
  getChannel,
  getChannelMessages,
  ensureModChannel,
  getUserByAddress,
} from "@/lib/firestore-store";

// GET /api/forum/channels/[id] — get channel detail + messages
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const addr = auth.address.toLowerCase();
    const channelId = params.id;

    // Lazy-create mod channel on first access
    if (channelId === "mod-channel") {
      await ensureModChannel();
    }

    const channel = await getChannel(channelId);
    if (!channel) {
      return NextResponse.json(
        { error: "Channel not found" },
        { status: 404 }
      );
    }

    // Access control
    if (channel.type === "mod") {
      const user = await getUserByAddress(addr);
      if (!user?.modTier) {
        return NextResponse.json(
          { error: "Mod access required" },
          { status: 403 }
        );
      }
    } else if (channel.type === "arbitration") {
      if (!channel.participants.some((p) => p.toLowerCase() === addr)) {
        return NextResponse.json(
          { error: "Not a participant in this channel" },
          { status: 403 }
        );
      }
    }

    const messages = await getChannelMessages(channelId);

    return NextResponse.json({ channel, messages });
  } catch (err) {
    console.error("[channels/id] GET error:", err);
    return NextResponse.json(
      { error: "Failed to load channel" },
      { status: 500 }
    );
  }
}
