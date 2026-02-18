import { NextRequest, NextResponse } from "next/server";
import { searchAll } from "@/lib/firestore-store";
import { rateLimit, getIPKey } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const limited = rateLimit(`forum-search:${getIPKey(request)}`, 10_000, 10);
  if (limited) return limited;

  const query = request.nextUrl.searchParams.get("q");
  const typeFilter = request.nextUrl.searchParams.get("type"); // posts, comments, users

  if (!query) {
    return NextResponse.json(
      { error: "Missing query parameter: q" },
      { status: 400 }
    );
  }

  if (query.length > 200) {
    return NextResponse.json(
      { error: "Search query must be 200 characters or fewer" },
      { status: 400 }
    );
  }

  const results = await searchAll(query);

  if (typeFilter === "posts") {
    return NextResponse.json({ posts: results.posts });
  }
  if (typeFilter === "comments") {
    return NextResponse.json({ comments: results.comments });
  }
  if (typeFilter === "users") {
    return NextResponse.json({ users: results.users });
  }

  return NextResponse.json(results);
}
