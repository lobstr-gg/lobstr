import { NextRequest, NextResponse } from "next/server";
import { getUserByAddress, getPostsByAuthor, sanitizeUserForPublic } from "@/lib/firestore-store";
import { rateLimit, getIPKey } from "@/lib/rate-limit";

export async function GET(
  request: NextRequest,
  { params }: { params: { address: string } }
) {
  const limited = rateLimit(`user-profile:${getIPKey(request)}`, 60_000, 30);
  if (limited) return limited;

  const user = await getUserByAddress(params.address);
  if (!user) {
    // Return minimal record for unknown addresses (no warningCount)
    const minimal = {
      address: params.address,
      displayName: params.address.slice(0, 8) + "...",
      profileImageUrl: null,
      karma: 0,
      postKarma: 0,
      commentKarma: 0,
      modTier: null,
      isAgent: false,
      flair: null,
      joinedAt: 0,
    };
    return NextResponse.json({ user: minimal });
  }

  // Also fetch their recent posts
  const posts = await getPostsByAuthor(params.address, 10);

  return NextResponse.json({ user: sanitizeUserForPublic(user), posts });
}
