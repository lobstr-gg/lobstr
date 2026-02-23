import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/forum-auth";
import {
  getDisputeThread,
  getPostById,
  getCommentsForPost,
  buildCommentTree,
  createComment,
  nextId,
  createNotification,
} from "@/lib/firestore-store";
import type { Comment } from "@/lib/forum-types";

/**
 * GET /api/forum/disputes/thread?disputeId=<id>
 * Returns dispute thread details + comments.
 * Access: only buyer, seller, or assigned arbitrators.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const disputeId = request.nextUrl.searchParams.get("disputeId");
  if (!disputeId) {
    return NextResponse.json({ error: "Missing disputeId" }, { status: 400 });
  }

  const thread = await getDisputeThread(disputeId);
  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  // Access control
  if (!thread.participants.includes(auth.address.toLowerCase())) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const post = await getPostById(thread.postId);
  if (!post) {
    return NextResponse.json({ error: "Thread post not found" }, { status: 404 });
  }

  const rawComments = await getCommentsForPost(thread.postId);
  const comments = buildCommentTree(rawComments);

  return NextResponse.json({
    threadId: disputeId,
    postId: thread.postId,
    disputeId,
    title: post.title,
    body: post.body,
    createdAt: post.createdAt,
    participants: thread.participants,
    comments,
  });
}

/**
 * POST /api/forum/disputes/thread
 * Add a comment to a dispute thread.
 * Body: { disputeId, body }
 * Access: only participants
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  let body: { disputeId: string; body: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.disputeId || !body.body?.trim()) {
    return NextResponse.json({ error: "Missing disputeId or body" }, { status: 400 });
  }

  const thread = await getDisputeThread(body.disputeId);
  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  if (!thread.participants.includes(auth.address.toLowerCase())) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const commentId = await nextId("comment");
  const now = Date.now();

  const comment: Comment = {
    id: commentId,
    postId: thread.postId,
    parentId: null,
    author: auth.address,
    body: body.body.trim(),
    upvotes: 0,
    downvotes: 0,
    score: 0,
    depth: 0,
    createdAt: now,
    children: [],
  };

  await createComment(thread.postId, comment);

  // Notify other participants
  const otherParticipants = thread.participants.filter(
    (p) => p !== auth.address.toLowerCase()
  );
  for (const addr of otherParticipants) {
    await createNotification(addr, {
      type: "dispute_update",
      title: `New comment in Dispute #${body.disputeId}`,
      body: `${auth.address.slice(0, 8)}... posted in the dispute thread.`,
      read: false,
      href: `/disputes/${body.disputeId}`,
      refId: commentId,
      createdAt: now,
    });
  }

  return NextResponse.json({ commentId });
}
