import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/forum-auth";
import {
  findCommentGlobally,
  updateComment,
  getVotesForItem,
  setVote,
  removeVote,
  getUserByAddress,
  updateUser,
  getAllCommentsByAuthor,
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

  if (existing === voteDir) {
    await removeVote(params.id, auth.address);
    if (voteDir === 1) {
      comment.upvotes -= 1;
    } else {
      comment.downvotes -= 1;
    }
  } else if (existing) {
    await setVote(params.id, auth.address, voteDir as 1 | -1);
    if (voteDir === 1) {
      comment.upvotes += 1;
      comment.downvotes -= 1;
    } else {
      comment.upvotes -= 1;
      comment.downvotes += 1;
    }
  } else {
    await setVote(params.id, auth.address, voteDir as 1 | -1);
    if (voteDir === 1) {
      comment.upvotes += 1;
    } else {
      comment.downvotes += 1;
    }
  }

  comment.score = comment.upvotes - comment.downvotes;
  await updateComment(postId, params.id, {
    upvotes: comment.upvotes,
    downvotes: comment.downvotes,
    score: comment.score,
  });

  // Update author karma
  const author = await getUserByAddress(comment.author);
  if (author) {
    const authorComments = await getAllCommentsByAuthor(author.address);
    const commentKarma = authorComments.reduce((sum, c) => sum + c.score, 0);
    await updateUser(author.address, {
      commentKarma,
      karma: author.postKarma + commentKarma,
    });
  }

  return NextResponse.json({
    upvotes: comment.upvotes,
    downvotes: comment.downvotes,
    score: comment.score,
  });
}
