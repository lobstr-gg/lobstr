import { NextRequest, NextResponse } from "next/server";
import type { SubtopicId, SortMode, PostFlair } from "@/lib/forum-types";
import {
  getPostsBySubtopic,
  sortPosts,
  nextId,
  getOrCreateUser,
  createPost,
} from "@/lib/firestore-store";
import { requireAuth } from "@/lib/forum-auth";
import { rateLimit, getIPKey, checkBodySize } from "@/lib/rate-limit";

// GET /api/forum/posts?subtopic=general&sort=hot&limit=25&offset=0
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const subtopic = (params.get("subtopic") || "all") as SubtopicId | "all";
  const sort = (params.get("sort") || "hot") as SortMode;
  const limit = Math.min(parseInt(params.get("limit") || "25", 10), 100);
  const offset = parseInt(params.get("offset") || "0", 10);

  let posts = await getPostsBySubtopic(subtopic);
  posts = sortPosts(posts, sort);

  const total = posts.length;
  posts = posts.slice(offset, offset + limit);

  return NextResponse.json({ posts, total, offset, limit });
}

// POST /api/forum/posts — create a new post (authed)
export async function POST(request: NextRequest) {
  const limited = rateLimit(`forum-post:${getIPKey(request)}`, 60_000, 10);
  if (limited) return limited;

  const tooLarge = await checkBodySize(request, 1_048_576);
  if (tooLarge) return tooLarge;

  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const { title, subtopic, flair, body: postBody } = body;

  if (!title || !subtopic || !postBody) {
    return NextResponse.json(
      { error: "Missing required fields: title, subtopic, body" },
      { status: 400 }
    );
  }

  if (typeof title !== "string" || title.length > 300) {
    return NextResponse.json(
      { error: "Title must be 300 characters or fewer" },
      { status: 400 }
    );
  }

  if (typeof postBody !== "string" || postBody.length > 50_000) {
    return NextResponse.json(
      { error: "Post body must be 50,000 characters or fewer" },
      { status: 400 }
    );
  }

  const validSubtopics = ["general", "agents", "governance", "marketplace", "support", "dev"];
  if (!validSubtopics.includes(subtopic)) {
    return NextResponse.json(
      { error: "Invalid subtopic" },
      { status: 400 }
    );
  }

  await getOrCreateUser(auth.address);

  const post = {
    id: await nextId("post"),
    subtopic: subtopic as SubtopicId,
    title,
    body: postBody,
    author: auth.address,
    upvotes: 0,
    downvotes: 0,
    score: 0,
    commentCount: 0,
    flair: (flair || "discussion") as PostFlair,
    isPinned: false,
    isLocked: false,
    createdAt: Date.now(),
  };

  await createPost(post);

  return NextResponse.json({ post }, { status: 201 });
}
