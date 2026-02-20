import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/forum-auth";
import { isWalletBanned } from "@/lib/upload-security";
import {
  getPostById,
  updatePost,
  generateId,
  getOrCreateUser,
  getCommentById,
  createComment,
  createNotification,
} from "@/lib/firestore-store";
import { rateLimit, getIPKey, checkBodySize } from "@/lib/rate-limit";
import type { Comment } from "@/lib/forum-types";

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

  if (await isWalletBanned(auth.address)) {
    return NextResponse.json(
      { error: "Your wallet has been banned from this platform" },
      { status: 403 }
    );
  }

  const post = await getPostById(params.id);
  if (!post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }
  if (post.isLocked) {
    return NextResponse.json({ error: "Post is locked" }, { status: 403 });
  }

  const body = await request.json();
  const { body: commentBody, parentId } = body;

  if (!commentBody || typeof commentBody !== "string") {
    return NextResponse.json(
      { error: "Missing required field: body" },
      { status: 400 }
    );
  }

  if (commentBody.length > 10_000) {
    return NextResponse.json(
      { error: "Comment must be 10,000 characters or fewer" },
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

  // Cap nesting depth to prevent abuse
  if (depth > 10) {
    return NextResponse.json(
      { error: "Maximum comment nesting depth reached" },
      { status: 400 }
    );
  }

  const comment = {
    id: generateId(),
    postId: params.id,
    parentId: parentId || null,
    author: auth.address,
    body: commentBody,
    upvotes: 0,
    downvotes: 0,
    score: 0,
    depth,
    createdAt: Date.now(),
    children: [] as Comment[],
  };

  await createComment(params.id, comment);
  await updatePost(params.id, { commentCount: post.commentCount + 1 });

  // Notify the post author (if commenter is not the author)
  if (post.author !== auth.address) {
    createNotification(post.author, {
      type: "forum_reply",
      title: "New reply on your post",
      body: `Someone replied to "${post.title.slice(0, 60)}"`,
      read: false,
      href: `/forum/${post.subtopic}/${post.id}`,
      refId: comment.id,
      createdAt: Date.now(),
    }).catch(() => {});
  }

  // Notify the parent comment author (if replying to a comment)
  if (parentId) {
    const parent = await getCommentById(params.id, parentId);
    if (parent && parent.author !== auth.address && parent.author !== post.author) {
      createNotification(parent.author, {
        type: "forum_reply",
        title: "New reply to your comment",
        body: `Someone replied to your comment on "${post.title.slice(0, 60)}"`,
        read: false,
        href: `/forum/${post.subtopic}/${post.id}`,
        refId: comment.id,
        createdAt: Date.now(),
      }).catch(() => {});
    }
  }

  return NextResponse.json({ comment }, { status: 201 });
}
