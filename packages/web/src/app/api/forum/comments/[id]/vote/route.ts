import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/forum-auth";
import { isWalletBanned } from "@/lib/upload-security";
import {
  findCommentGlobally,
  getVotesForItem,
  setVote,
  removeVote,
  incrementUserKarma,
  incrementCommentVotes,
} from "@/lib/firestore-store";
import { rateLimit, getIPKey } from "@/lib/rate-limit";

// POST /api/forum/comments/[id]/vote — vote on a comment
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const limited = rateLimit(`vote:${getIPKey(request)}`, 60_000, 30);
  if (limited) return limited;

  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  if (await isWalletBanned(auth.address)) {
    return NextResponse.json(
      { error: "Your wallet has been banned from this platform" },
      { status: 403 }
    );
  }

  const found = await findCommentGlobally(params.id);
  if (!found) {
    return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  }

  const { comment, postId } = found;

  if (auth.address === comment.author) {
    return NextResponse.json({ error: "Cannot vote on own content" }, { status: 403 });
  }

  const body = await request.json();
  const { direction } = body;

  if (direction !== "up" && direction !== "down") {
    return NextResponse.json(
      { error: "direction must be 'up' or 'down'" },
      { status: 400 }
    );
  }

  const voteDir = direction === "up" ? 1 : -1;
  const votes = await getVotesForItem(params.id);
  const existing = votes[auth.address];

  // Compute atomic deltas instead of read-modify-write
  let upDelta = 0;
  let downDelta = 0;

  if (existing === voteDir) {
    // Toggle off
    await removeVote(params.id, auth.address);
    if (voteDir === 1) upDelta = -1;
    else downDelta = -1;
  } else if (existing) {
    // Swap direction
    await setVote(params.id, auth.address, voteDir as 1 | -1);
    if (voteDir === 1) { upDelta = 1; downDelta = -1; }
    else { upDelta = -1; downDelta = 1; }
  } else {
    // New vote
    await setVote(params.id, auth.address, voteDir as 1 | -1);
    if (voteDir === 1) upDelta = 1;
    else downDelta = 1;
  }

  // Atomic increment — prevents race conditions from concurrent votes
  await incrementCommentVotes(postId, params.id, upDelta, downDelta);

  // Atomic karma update
  const scoreDelta = upDelta - downDelta;
  if (scoreDelta !== 0) {
    await incrementUserKarma(comment.author, "commentKarma", scoreDelta);
  }

  // Return updated counts (best-effort, may be slightly stale under high concurrency)
  return NextResponse.json({
    upvotes: comment.upvotes + upDelta,
    downvotes: comment.downvotes + downDelta,
    score: comment.score + scoreDelta,
  });
}
