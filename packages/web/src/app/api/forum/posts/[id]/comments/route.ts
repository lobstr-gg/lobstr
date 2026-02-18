import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/forum-auth";
import {
  getPostById,
  updatePost,
  nextId,
  getOrCreateUser,
  getCommentById,
  createComment,
} from "@/lib/firestore-store";
import { rateLimit, getIPKey, checkBodySize } from "@/lib/rate-limit";

// POST /api/forum/posts/[id]/comments — add a comment
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const limited = rateLimit(`comment:${getIPKey(request)}`, 60_000, 20);
  if (limited) return limited;

  const tooLarge = await checkBodySize(request, 1_048_576);
  if (tooLarge) return tooLarge;

  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const post = await getPostById(params.id);
  if (!post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }
  if (post.isLocked) {
    return NextResponse.json({ error: "Post is locked" }, { status: 403 });
  }

  const body = await request.json();
  const { body: commentBody, parentId } = body;

  if (!commentBody) {
    return NextResponse.json(
      { error: "Missing required field: body" },
      { status: 400 }
    );
  }

  await getOrCreateUser(auth.address);

  // Determine depth from parent
  let depth = 0;
  if (parentId) {
    const parent = await getCommentById(params.id, parentId);
    if (!parent || parent.postId !== params.id) {
      return NextResponse.json(
        { error: "Invalid parentId" },
        { status: 400 }
      );
    }
    depth = parent.depth + 1;
  }

  const comment = {
    id: await nextId("comment"),
    postId: params.id,
    parentId: parentId || null,
    author: auth.address,
    body: commentBody,
    upvotes: 0,
    downvotes: 0,
    score: 0,
    depth,
    createdAt: Date.now(),
    children: [] as any[],
  };

  await createComment(params.id, comment);
  await updatePost(params.id, { commentCount: post.commentCount + 1 });

  return NextResponse.json({ comment }, { status: 201 });
}
