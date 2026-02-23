import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/forum-auth";
import { rateLimit, getIPKey, checkBodySize } from "@/lib/rate-limit";
import {
  getChannel,
  addChannelMessage,
  nextId,
  getUserByAddress,
  getModeratorAddresses,
  createNotification,
} from "@/lib/firestore-store";
import type { ChannelMessage } from "@/lib/forum-types";

// POST /api/forum/channels/[id]/messages — send a message to a channel
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const limited = rateLimit(`ch:${getIPKey(request)}`, 60_000, 15);
  if (limited) return limited;

  const tooLarge = await checkBodySize(request, 1_048_576);
  if (tooLarge) return tooLarge;

  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const addr = auth.address.toLowerCase();
    const channelId = params.id;

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

    const body = await request.json();
    const messageBody = body.body;

    if (!messageBody || typeof messageBody !== "string") {
      return NextResponse.json(
        { error: "Missing required field: body" },
        { status: 400 }
      );
    }

    if (messageBody.length > 5_000) {
      return NextResponse.json(
        { error: "Message must be 5,000 characters or fewer" },
        { status: 400 }
      );
    }

    const msgId = await nextId("channelMessage");
    const message: ChannelMessage = {
      id: msgId,
      channelId,
      sender: addr,
      body: messageBody,
      createdAt: Date.now(),
    };

    await addChannelMessage(channelId, message);

    // Send notifications to other participants
    const notifyRecipients = async () => {
      const preview = messageBody.slice(0, 100);
      const senderUser = await getUserByAddress(addr);
      const senderLabel = senderUser?.displayName ?? addr.slice(0, 10) + "...";

      if (channel.type === "mod") {
        // Notify all mods except sender
        const mods = await getModeratorAddresses();
        for (const mod of mods) {
          if (mod.toLowerCase() !== addr) {
            await createNotification(mod, {
              type: "channel_message",
              title: `Mod Chat: ${senderLabel}`,
              body: preview,
              read: false,
              href: "/mod",
              refId: channelId,
              createdAt: Date.now(),
            });
          }
        }
      } else if (channel.type === "arbitration") {
        // Notify other arbitrators
        for (const participant of channel.participants) {
          if (participant.toLowerCase() !== addr) {
            await createNotification(participant, {
              type: "channel_message",
              title: `Arb Chat: ${senderLabel}`,
              body: preview,
              read: false,
              href: `/disputes/${channel.disputeId}`,
              refId: channelId,
              createdAt: Date.now(),
            });
          }
        }
      }
    };

    // Fire-and-forget notifications
    notifyRecipients().catch((err) =>
      console.error("[channels/messages] notification error:", err)
    );

    return NextResponse.json({ message }, { status: 201 });
  } catch (err) {
    console.error("[channels/messages] POST error:", err);
    return NextResponse.json(
      { error: "Failed to send message" },
      { status: 500 }
    );
  }
}
