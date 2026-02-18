import { NextRequest, NextResponse } from "next/server";
import {
  getPostById,
  getCommentsForPost,
  buildCommentTree,
  getUserByAddress,
  sanitizeUserForPublic,
} from "@/lib/firestore-store";
import { rateLimit, getIPKey } from "@/lib/rate-limit";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const limited = rateLimit(`post-detail:${getIPKey(request)}`, 60_000, 30);
  if (limited) return limited;

  const post = await getPostById(params.id);
  if (!post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  const comments = buildCommentTree(await getCommentsForPost(post.id));
  const author = await getUserByAddress(post.author);

  return NextResponse.json({
    post,
    comments,
    author: author ? sanitizeUserForPublic(author) : null,
  });
}
