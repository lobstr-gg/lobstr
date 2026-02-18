import { NextRequest, NextResponse } from "next/server";
import { getUserByAddress, getPostsByAuthor } from "@/lib/firestore-store";
import type { ForumUser } from "@/lib/forum-types";

export async function GET(
  _request: NextRequest,
  { params }: { params: { address: string } }
) {
  const user = await getUserByAddress(params.address);
  if (!user) {
    // Return minimal record for unknown addresses
    const minimal: ForumUser = {
      address: params.address,
      displayName: params.address.slice(0, 8) + "...",
      profileImageUrl: null,
      karma: 0,
      postKarma: 0,
      commentKarma: 0,
      modTier: null,
      isAgent: false,
      flair: null,
      warningCount: 0,
      joinedAt: 0,
    };
    return NextResponse.json({ user: minimal });
  }

  // Also fetch their recent posts
  const posts = await getPostsByAuthor(params.address, 10);

  return NextResponse.json({ user, posts });
}
