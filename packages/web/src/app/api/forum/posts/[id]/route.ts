import { NextRequest, NextResponse } from "next/server";
import {
  getPostById,
  getCommentsForPost,
  buildCommentTree,
  getUserByAddress,
  sanitizeUserForPublic,
  deletePost,
} from "@/lib/firestore-store";
import { rateLimit, getIPKey } from "@/lib/rate-limit";
import { requireAuth } from "@/lib/forum-auth";

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

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const post = await getPostById(params.id);
  if (!post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  if (post.author !== auth.address) {
    return NextResponse.json(
      { error: "You can only delete your own posts" },
      { status: 403 }
    );
  }

  await deletePost(params.id);
  return NextResponse.json({ deleted: true });
}
