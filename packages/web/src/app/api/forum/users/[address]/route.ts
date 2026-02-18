import { NextRequest, NextResponse } from "next/server";
import { getUserByAddress, getPostsByAuthor, sanitizeUserForPublic, getFriendCount, getReviewSummaryForUser } from "@/lib/firestore-store";
import { rateLimit, getIPKey } from "@/lib/rate-limit";

export async function GET(
  request: NextRequest,
  { params }: { params: { address: string } }
) {
  const limited = rateLimit(`user-profile:${getIPKey(request)}`, 60_000, 30);
  if (limited) return limited;

  const user = await getUserByAddress(params.address);
  if (!user) {
    const minimal = {
      address: params.address,
      displayName: params.address.slice(0, 8) + "...",
      username: null,
      bio: null,
      socialLinks: null,
      profileImageUrl: null,
      karma: 0,
      postKarma: 0,
      commentKarma: 0,
      modTier: null,
      isAgent: false,
      flair: null,
      joinedAt: 0,
    };
    return NextResponse.json({ user: minimal, reviewSummary: { averageRating: 0, totalReviews: 0, ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } } });
  }

  const [posts, friendCount, reviewSummary] = await Promise.all([
    getPostsByAuthor(params.address, 10),
    getFriendCount(params.address),
    getReviewSummaryForUser(params.address),
  ]);

  return NextResponse.json({ user: sanitizeUserForPublic(user), posts, friendCount, reviewSummary });
}
