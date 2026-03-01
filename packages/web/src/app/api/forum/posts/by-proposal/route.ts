import { NextRequest, NextResponse } from "next/server";
import type { ProposalRef } from "@/lib/forum-types";
import { getPostByProposalRef } from "@/lib/firestore-store";
import { rateLimit, getIPKey } from "@/lib/rate-limit";

const VALID_TYPES = ["treasury", "admin", "lightning"];

// GET /api/forum/posts/by-proposal?type=admin&id=3
export async function GET(request: NextRequest) {
  const limited = rateLimit(`forum-by-proposal:${getIPKey(request)}`, 60_000, 30);
  if (limited) return limited;

  const params = request.nextUrl.searchParams;
  const type = params.get("type");
  const id = params.get("id");

  if (!type || !VALID_TYPES.includes(type)) {
    return NextResponse.json(
      { error: "Invalid or missing type parameter. Must be: treasury, admin, or lightning" },
      { status: 400 }
    );
  }

  if (!id) {
    return NextResponse.json(
      { error: "Missing id parameter" },
      { status: 400 }
    );
  }

  const ref: ProposalRef = { type: type as ProposalRef["type"], onChainId: id };
  const post = await getPostByProposalRef(ref);

  if (!post) {
    return NextResponse.json({ post: null });
  }

  return NextResponse.json({
    post: { id: post.id, subtopic: post.subtopic, title: post.title },
  });
}
