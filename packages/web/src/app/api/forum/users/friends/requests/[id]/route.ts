import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/forum-auth";
import {
  respondToFriendRequest,
  createNotification,
  getUserByAddress,
} from "@/lib/firestore-store";

// POST /api/forum/users/friends/requests/[id] — accept or decline
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = await request.json();
  const { action } = body;

  if (action !== "accept" && action !== "decline") {
    return NextResponse.json(
      { error: 'action must be "accept" or "decline"' },
      { status: 400 }
    );
  }

  try {
    await respondToFriendRequest(id, auth.address, action === "accept");

    // Send notification to the sender if accepted
    if (action === "accept") {
      // Request ID format is "{from}_{to}", extract sender
      const senderAddress = id.split("_")[0];
      if (senderAddress) {
        const responder = await getUserByAddress(auth.address);
        const responderName = responder?.displayName ?? auth.address.slice(0, 8) + "...";
        await createNotification(senderAddress, {
          type: "friend_request",
          title: "Friend Request Accepted",
          body: `${responderName} accepted your friend request`,
          read: false,
          href: `/forum/u/${auth.address}`,
          refId: id,
          createdAt: Date.now(),
        });
      }
    }

    return NextResponse.json({ success: true, action });
  } catch {
    return NextResponse.json({ error: "Failed to respond to friend request" }, { status: 500 });
  }
}
