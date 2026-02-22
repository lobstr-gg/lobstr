"use client";

import { useState, useCallback } from "react";
import type { SortMode } from "@/lib/forum-types";
import SortControls from "./SortControls";
import CommentNode from "./CommentNode";
import CommentComposer from "./CommentComposer";
import type { Comment } from "@/lib/forum-types";

function sortComments(comments: Comment[], mode: SortMode): Comment[] {
  const sorted = [...comments];
  sorted.sort((a, b) => {
    switch (mode) {
      case "top":
        return b.score - a.score;
      case "new":
        return b.createdAt - a.createdAt;
      case "hot":
      default:
        const ageA = (Date.now() - a.createdAt) / 3600000;
        const ageB = (Date.now() - b.createdAt) / 3600000;
        return b.score / (ageB + 2) - a.score / (ageA + 2);
    }
  });
  return sorted.map((c) => ({
    ...c,
    children: sortComments(c.children, mode),
  }));
}

export default function CommentThread({
  comments,
  postId,
  onRefresh,
}: {
  comments: Comment[];
  postId: string;
  onRefresh?: () => void;
}) {
  const [sortMode, setSortMode] = useState<SortMode>("hot");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sortedComments = sortComments(comments, sortMode);

  const submitComment = useCallback(
    async (body: string, parentId?: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/forum/posts/${postId}/comments`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body, parentId }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Failed to post comment");
        }
        onRefresh?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to post comment");
      } finally {
        setLoading(false);
      }
    },
    [postId, onRefresh]
  );

  return (
    <div className="space-y-4">
      {/* New comment */}
      <CommentComposer
        onSubmit={(body) => submitComment(body)}
        loading={loading}
        error={error}
      />

      {/* Sort + count */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-text-tertiary">
          {comments.length} comment{comments.length !== 1 ? "s" : ""}
        </p>
        <SortControls value={sortMode} onChange={setSortMode} />
      </div>

      {/* Comments */}
      <div className="space-y-3">
        {sortedComments.map((comment) => (
          <CommentNode
            key={comment.id}
            comment={comment}
            onReply={submitComment}
          />
        ))}
      </div>
    </div>
  );
}
