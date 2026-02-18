import { NextRequest, NextResponse } from "next/server";
import {
  getPostById,
  getCommentsForPost,
  buildCommentTree,
  getUserByAddress,
} from "@/lib/firestore-store";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const post = await getPostById(params.id);
  if (!post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  const comments = buildCommentTree(await getCommentsForPost(post.id));
  const author = await getUserByAddress(post.author);

  return NextResponse.json({ post, comments, author });
}
