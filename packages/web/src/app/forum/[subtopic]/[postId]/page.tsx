"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { stagger, fadeUp } from "@/lib/motion";
import { useForum } from "@/lib/forum-context";
import { timeAgo } from "@/lib/forum-data";
import { SUBTOPIC_LIST, type Post, type Comment, type SubtopicId } from "@/lib/forum-types";
import VoteButton from "@/components/forum/VoteButton";
import FlairBadge from "@/components/forum/FlairBadge";
import UserCard from "@/components/forum/UserCard";
import CommentThread from "@/components/forum/CommentThread";
import ForumBreadcrumb from "@/components/forum/ForumBreadcrumb";
import ModActionMenu from "@/components/forum/ModActionMenu";
import EmptyState from "@/components/forum/EmptyState";
import Spinner from "@/components/Spinner";

export default function PostDetailPage() {
  const params = useParams();
  const router = useRouter();
  const subtopicId = params.subtopic as SubtopicId;
  const postId = params.postId as string;
  const { currentUser } = useForum();

  const handleModAction = useCallback(async (action: string) => {
    if (action === "remove") {
      if (!confirm("Delete this post? This can't be undone.")) return;
      const res = await fetch(`/api/forum/posts/${postId}`, { method: "DELETE" });
      if (res.ok) {
        router.push(`/forum/${subtopicId}`);
      } else {
        const data = await res.json();
        alert(data.error ?? "Failed to delete post");
      }
    }
  }, [postId, subtopicId, router]);

  const subtopic = SUBTOPIC_LIST.find((s) => s.id === subtopicId);

  const [post, setPost] = useState<Post | null>(null);
  const [commentTree, setCommentTree] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/forum/posts/${postId}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch");
        return res.json();
      })
      .then((data) => {
        setPost(data.post);
        setCommentTree(data.comments ?? []);
      })
      .catch((err) => {
        if (err.name !== "AbortError") setError(err.message);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [postId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="card px-4 py-8 text-center">
        <p className="text-sm text-red-400">Failed to load data</p>
        <button
          onClick={() => window.location.reload()}
          className="text-xs text-lob-green mt-2 hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!subtopic) {
    return <EmptyState title="Invalid subtopic" />;
  }

  if (!post) {
    return <EmptyState title="Post not found" />;
  }

  return (
    <motion.div initial="hidden" animate="show" variants={stagger}>
      <ForumBreadcrumb
        crumbs={[
          { label: subtopic.name, href: `/forum/${subtopicId}` },
          { label: post.title },
        ]}
      />

      {/* Post */}
      <motion.div
        variants={fadeUp}
        className={`card p-5 mb-6 ${
          post.isPinned ? "border-l-2 border-l-lob-green" : ""
        }`}
      >
        <div className="flex gap-4">
          {/* Vote column */}
          <div className="shrink-0">
            <VoteButton id={post.id} score={post.score} />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Meta */}
            <div className="flex items-center gap-2 flex-wrap mb-2">
              {post.isPinned && (
                <span className="text-[10px] text-lob-green font-bold uppercase">
                  Pinned
                </span>
              )}
              <FlairBadge flair={post.flair} />
              {post.isLocked && (
                <span className="text-[10px] text-lob-red font-medium">
                  Locked
                </span>
              )}
            </div>

            <h1 className="text-lg font-bold text-text-primary mb-2">
              {post.title}
            </h1>

            <div className="flex items-center gap-3 mb-4 text-[10px] text-text-tertiary">
              <UserCard address={post.author} />
              <span>{timeAgo(post.createdAt)}</span>
              <span>{post.commentCount} comments</span>
              <button
                onClick={() => navigator.clipboard.writeText(post.id)}
                title={post.id}
                className="text-[10px] text-text-tertiary/50 hover:text-text-secondary transition-colors font-mono"
              >
                #{post.id}
              </button>
              {currentUser?.modTier && (
                <ModActionMenu
                  onAction={handleModAction}
                />
              )}
            </div>

            {/* Body */}
            <div className="prose prose-sm prose-invert max-w-none">
              {post.body.split("\n").map((paragraph, i) => (
                <p
                  key={i}
                  className="text-sm text-text-secondary leading-relaxed mb-2"
                >
                  {paragraph}
                </p>
              ))}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Comments */}
      <motion.div variants={fadeUp}>
        {post.isLocked ? (
          <div className="card p-4 text-center">
            <p className="text-xs text-text-tertiary">
              This thread is locked. No new comments can be added.
            </p>
          </div>
        ) : (
          <CommentThread comments={commentTree} postId={postId} />
        )}
      </motion.div>
    </motion.div>
  );
}
