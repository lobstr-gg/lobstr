import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/forum-auth";
import {
  blockUser,
  unblockUser,
  getBlockedUsers,
} from "@/lib/firestore-store";

// GET /api/forum/users/block — list blocked users
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const blocked = await getBlockedUsers(auth.address);
  return NextResponse.json({ blocked });
}

// POST /api/forum/users/block — block a user
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
      { error: "Cannot block yourself" },
      { status: 400 }
    );
  }

  await blockUser(auth.address, address);
  return NextResponse.json({ blocked: true }, { status: 201 });
}

// DELETE /api/forum/users/block — unblock a user
export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const { address } = body;

  if (!address) {
    return NextResponse.json(
      { error: "Missing required field: address" },
      { status: 400 }
    );
  }

  await unblockUser(auth.address, address);
  return NextResponse.json({ unblocked: true });
}
