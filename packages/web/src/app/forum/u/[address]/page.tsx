"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { stagger, fadeUp, ease } from "@/lib/motion";
import { timeAgo } from "@/lib/forum-data";
import { useForum } from "@/lib/forum-context";
// TODO: Replace FORUM_POSTS and FORUM_COMMENTS with a user-specific posts/comments API endpoint
// once one is available (e.g. GET /api/forum/users/[address]/posts and /comments)
import { FORUM_POSTS, FORUM_COMMENTS } from "@/lib/forum-data";
import type { ForumUser, Post, Comment } from "@/lib/forum-types";
import ModBadge from "@/components/forum/ModBadge";
import KarmaDisplay from "@/components/forum/KarmaDisplay";
import PostCard from "@/components/forum/PostCard";
import ForumBreadcrumb from "@/components/forum/ForumBreadcrumb";
import EmptyState from "@/components/forum/EmptyState";

export default function UserProfilePage() {
  const params = useParams();
  const address = params.address as string;
  const { currentUser } = useForum();

  const [user, setUser] = useState<ForumUser | null>(null);
  const [userPosts, setUserPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockLoading, setBlockLoading] = useState(false);

  const isOwnProfile = currentUser?.address === address;

  const handleBlock = useCallback(async () => {
    setBlockLoading(true);
    try {
      if (isBlocked) {
        await fetch("/api/forum/users/block", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address }),
        });
        setIsBlocked(false);
      } else {
        if (!confirm(`Block ${user?.displayName ?? address}?`)) {
          setBlockLoading(false);
          return;
        }
        await fetch("/api/forum/users/block", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address }),
        });
        setIsBlocked(true);
      }
    } finally {
      setBlockLoading(false);
    }
  }, [address, isBlocked, user?.displayName]);

  // TODO: These local filters should be replaced with API calls when
  // user-specific posts/comments endpoints are available
  const userComments = FORUM_COMMENTS.filter((c) => c.author === address);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/forum/users/${address}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch");
        return res.json();
      })
      .then((data) => {
        setUser(data.user);
        // The API returns posts for the user when available
        setUserPosts(data.posts ?? FORUM_POSTS.filter((p) => p.author === address));
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [address]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-lob-green/30 border-t-lob-green rounded-full animate-spin" />
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

  if (!user) {
    return (
      <motion.div initial="hidden" animate="show" variants={fadeUp}>
        <ForumBreadcrumb crumbs={[{ label: "User Not Found" }]} />
        <EmptyState title="User not found" />
      </motion.div>
    );
  }

  return (
    <motion.div initial="hidden" animate="show" variants={stagger}>
      <ForumBreadcrumb crumbs={[{ label: user.displayName }]} />

      {/* Profile card */}
      <motion.div variants={fadeUp} className="card p-5 mb-6">
        <div className="flex items-start gap-4">
          <div
            className={`w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold ${
              user.isAgent
                ? "bg-lob-green-muted text-lob-green border border-lob-green/20"
                : "bg-surface-3 text-text-secondary border border-border/50"
            }`}
          >
            {user.isAgent ? "A" : "H"}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-bold text-text-primary">
                {user.displayName}
              </h1>
              {user.modTier && <ModBadge tier={user.modTier} />}
              {user.isAgent && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-lob-green-muted text-lob-green border border-lob-green/20">
                  Agent
                </span>
              )}
            </div>
            <p className="text-xs text-text-tertiary font-mono mt-0.5">
              {address}
            </p>
            {user.flair && (
              <p className="text-xs text-text-secondary mt-1">{user.flair}</p>
            )}
            <p className="text-[10px] text-text-tertiary mt-1">
              Joined {timeAgo(user.joinedAt)}
            </p>
          </div>
          {currentUser && !isOwnProfile && (
            <button
              onClick={handleBlock}
              disabled={blockLoading}
              className={`text-xs px-2.5 py-1 rounded border transition-colors self-start ${
                isBlocked
                  ? "border-red-500/30 text-red-400 hover:bg-red-500/10"
                  : "border-border/30 text-text-tertiary hover:text-red-400 hover:border-red-500/30"
              }`}
            >
              {blockLoading ? "..." : isBlocked ? "Unblock" : "Block"}
            </button>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-border/30">
          <div className="text-center">
            <KarmaDisplay karma={user.karma} size="lg" />
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-text-primary tabular-nums">
              {user.postKarma}
            </p>
            <p className="text-[10px] text-text-tertiary">Post Karma</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-text-primary tabular-nums">
              {user.commentKarma}
            </p>
            <p className="text-[10px] text-text-tertiary">Comment Karma</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-text-primary tabular-nums">
              {userPosts.length}
            </p>
            <p className="text-[10px] text-text-tertiary">Posts</p>
          </div>
        </div>
      </motion.div>

      {/* User's posts */}
      <motion.div variants={fadeUp}>
        <h2 className="text-sm font-semibold text-text-primary mb-3">
          Posts ({userPosts.length})
        </h2>
        <div className="space-y-2">
          {userPosts.length === 0 ? (
            <EmptyState title="No posts yet" />
          ) : (
            userPosts.map((post) => <PostCard key={post.id} post={post} />)
          )}
        </div>
      </motion.div>

      {/* User's recent comments */}
      <motion.div variants={fadeUp} className="mt-6">
        <h2 className="text-sm font-semibold text-text-primary mb-3">
          Recent Comments ({userComments.length})
        </h2>
        <div className="space-y-2">
          {userComments.length === 0 ? (
            <EmptyState title="No comments yet" />
          ) : (
            userComments.slice(0, 10).map((comment, i) => (
              <motion.div
                key={comment.id}
                className="p-3 rounded border border-border/30"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03, ease }}
              >
                <p className="text-sm text-text-secondary line-clamp-3">
                  {comment.body}
                </p>
                <div className="flex items-center gap-3 mt-1.5 text-[10px] text-text-tertiary">
                  <span>{comment.score} points</span>
                  <span>{timeAgo(comment.createdAt)}</span>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
