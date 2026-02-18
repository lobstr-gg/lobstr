import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/forum-auth";
import {
  getFriends,
  getFriendCount,
  sendFriendRequest,
  removeFriend,
  isBlockedEither,
  createNotification,
  getUserByAddress,
} from "@/lib/firestore-store";

// GET /api/forum/users/friends — list friends
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const friends = await getFriends(auth.address);
  const count = friends.length;
  return NextResponse.json({ friends, count });
}

// POST /api/forum/users/friends — send friend request
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const { address } = body;

  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json(
      { error: "Missing or invalid address" },
      { status: 400 }
    );
  }

  if (address === auth.address) {
    return NextResponse.json(
      { error: "Cannot send friend request to yourself" },
      { status: 400 }
    );
  }

  // Check blocks
  const blocked = await isBlockedEither(auth.address, address);
  if (blocked) {
    return NextResponse.json(
      { error: "Cannot send friend request to this user" },
      { status: 403 }
    );
  }

  try {
    const request_doc = await sendFriendRequest(auth.address, address);

    // Send notification to recipient
    const sender = await getUserByAddress(auth.address);
    const senderName = sender?.displayName ?? auth.address.slice(0, 8) + "...";
    await createNotification(address, {
      type: "friend_request",
      title: "New Friend Request",
      body: `${senderName} sent you a friend request`,
      read: false,
      href: `/forum/u/${auth.address}`,
      refId: request_doc.id,
      createdAt: Date.now(),
    });

    return NextResponse.json({ sent: true, request: request_doc }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

// DELETE /api/forum/users/friends — unfriend
export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const { address } = body;

  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json(
      { error: "Missing or invalid address" },
      { status: 400 }
    );
  }

  await removeFriend(auth.address, address);
  return NextResponse.json({ removed: true });
}
