import { NextRequest, NextResponse } from "next/server";
import { getUserByAddress, getUserByUsername, getPostsByAuthor, sanitizeUserForPublic, getFriendCount, getReviewSummaryForUser } from "@/lib/firestore-store";
import { rateLimit, getIPKey } from "@/lib/rate-limit";

export async function GET(
  request: NextRequest,
  { params }: { params: { address: string } }
) {
  const limited = rateLimit(`user-profile:${getIPKey(request)}`, 60_000, 30);
  if (limited) return limited;

  const param = params.address;

  // Support @username lookups — e.g. /api/forum/users/@solomon
  let user;
  if (param.startsWith("@")) {
    user = await getUserByUsername(param.slice(1));
  } else {
    user = await getUserByAddress(param);
  }

  if (!user) {
    const minimal = {
      address: param.startsWith("@") ? "" : param,
      displayName: param.startsWith("@") ? param : param.slice(0, 8) + "...",
      username: param.startsWith("@") ? param.slice(1) : null,
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

  const resolvedAddress = user.address;
  const [posts, friendCount, reviewSummary] = await Promise.all([
    getPostsByAuthor(resolvedAddress, 10),
    getFriendCount(resolvedAddress),
    getReviewSummaryForUser(resolvedAddress),
  ]);

  return NextResponse.json({ user: sanitizeUserForPublic(user), posts, friendCount, reviewSummary });
}
