"use client";

import type { PostFlair } from "@/lib/forum-types";
import { FLAIR_COLORS } from "@/lib/forum-types";

export default function FlairBadge({ flair }: { flair: PostFlair }) {
  const colors = FLAIR_COLORS[flair];
  return (
    <span
      className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded border ${colors.bg} ${colors.text} ${colors.border}`}
    >
      {flair}
    </span>
  );
}
