import type { Metadata } from "next";
import { buildMetadata } from "@/lib/metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ subtopic: string; postId: string }>;
}): Promise<Metadata> {
  const { subtopic, postId } = await params;

  // Try to fetch post title from internal API
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://lobstr.gg";
    const res = await fetch(`${baseUrl}/api/forum/posts/${postId}`, {
      signal: AbortSignal.timeout(3000),
    });

    if (res.ok) {
      const post = await res.json();
      if (post?.title) {
        return buildMetadata(
          `${post.title} — LOBSTR Forum`,
          post.body?.slice(0, 155) ?? `Discussion in ${subtopic} on the LOBSTR forum.`,
          `/forum/${subtopic}/${postId}`,
        );
      }
    }
  } catch {
    // Fall through to default
  }

  return buildMetadata(
    `Forum Post — LOBSTR`,
    `Discussion in ${subtopic} on the LOBSTR forum.`,
    `/forum/${subtopic}/${postId}`,
  );
}

export default function ForumPostLayout({ children }: { children: React.ReactNode }) {
  return children;
}
