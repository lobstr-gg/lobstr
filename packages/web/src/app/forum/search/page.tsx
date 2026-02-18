"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { stagger, fadeUp, ease } from "@/lib/motion";
import { timeAgo } from "@/lib/forum-data";
import type { Post, Comment, ForumUser } from "@/lib/forum-types";
import FlairBadge from "@/components/forum/FlairBadge";
import ForumBreadcrumb from "@/components/forum/ForumBreadcrumb";
import EmptyState from "@/components/forum/EmptyState";

type Tab = "posts" | "comments" | "users";

interface SearchResults {
  posts: Post[];
  comments: Comment[];
  users: ForumUser[];
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="text-text-tertiary text-sm">Loading search...</div>}>
      <SearchContent />
    </Suspense>
  );
}

function SearchContent() {
  const searchParams = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const [activeTab, setActiveTab] = useState<Tab>("posts");
  const [results, setResults] = useState<SearchResults>({ posts: [], comments: [], users: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!query) {
      setResults({ posts: [], comments: [], users: [] });
      return;
    }

    setLoading(true);
    fetch(`/api/forum/search?q=${encodeURIComponent(query)}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch");
        return res.json();
      })
      .then((data) =>
        setResults({
          posts: data.posts ?? [],
          comments: data.comments ?? [],
          users: data.users ?? [],
        })
      )
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [query]);

  const TABS: { value: Tab; label: string; count: number }[] = [
    { value: "posts", label: "Posts", count: results.posts.length },
    { value: "comments", label: "Comments", count: results.comments.length },
    { value: "users", label: "Users", count: results.users.length },
  ];

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

  return (
    <motion.div initial="hidden" animate="show" variants={stagger}>
      <ForumBreadcrumb crumbs={[{ label: `Search: "${query}"` }]} />

      <motion.div variants={fadeUp} className="mb-4">
        <h1 className="text-xl font-bold text-text-primary">Search Results</h1>
        <p className="text-xs text-text-tertiary mt-0.5">
          {results.posts.length + results.comments.length + results.users.length}{" "}
          results for &quot;{query}&quot;
        </p>
      </motion.div>

      {/* Tabs */}
      <motion.div variants={fadeUp} className="flex gap-1 mb-4">
        {TABS.map((tab) => (
          <motion.button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={`rounded px-3 py-1.5 text-xs font-medium transition-colors relative overflow-hidden ${
              activeTab === tab.value
                ? "text-lob-green border border-lob-green/30"
                : "bg-surface-2 text-text-secondary border border-transparent hover:text-text-primary"
            }`}
            whileTap={{ scale: 0.95 }}
          >
            {activeTab === tab.value && (
              <motion.div
                layoutId="search-tab"
                className="absolute inset-0 bg-lob-green-muted rounded -z-10"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
            {tab.label} ({tab.count})
          </motion.button>
        ))}
      </motion.div>

      {/* Results */}
      <motion.div variants={fadeUp} className="space-y-2">
        {activeTab === "posts" &&
          (results.posts.length === 0 ? (
            <EmptyState title="No posts found" />
          ) : (
            results.posts.map((post, i) => (
              <motion.div
                key={post.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03, ease }}
              >
                <Link
                  href={`/forum/${post.subtopic}/${post.id}`}
                  className="block p-3 rounded border border-border/30 hover:bg-surface-1 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <FlairBadge flair={post.flair} />
                    <span className="text-[10px] text-text-tertiary">
                      {post.subtopic}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-text-primary">
                    {post.title}
                  </p>
                  <p className="text-xs text-text-tertiary mt-0.5 line-clamp-2">
                    {post.body}
                  </p>
                  <div className="flex items-center gap-3 mt-1.5 text-[10px] text-text-tertiary">
                    <span>{post.score} points</span>
                    <span>{post.commentCount} comments</span>
                    <span>{timeAgo(post.createdAt)}</span>
                  </div>
                </Link>
              </motion.div>
            ))
          ))}

        {activeTab === "comments" &&
          (results.comments.length === 0 ? (
            <EmptyState title="No comments found" />
          ) : (
            results.comments.map((comment, i) => (
              <motion.div
                key={comment.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03, ease }}
              >
                <Link
                  href={`/forum/general/${comment.postId}`}
                  className="block p-3 rounded border border-border/30 hover:bg-surface-1 transition-colors"
                >
                  <p className="text-xs text-text-tertiary mb-1">
                    Comment by {comment.author}
                  </p>
                  <p className="text-sm text-text-secondary line-clamp-3">
                    {comment.body}
                  </p>
                  <div className="flex items-center gap-3 mt-1.5 text-[10px] text-text-tertiary">
                    <span>{comment.score} points</span>
                    <span>{timeAgo(comment.createdAt)}</span>
                  </div>
                </Link>
              </motion.div>
            ))
          ))}

        {activeTab === "users" &&
          (results.users.length === 0 ? (
            <EmptyState title="No users found" />
          ) : (
            results.users.map((user, i) => (
              <motion.div
                key={user.address}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03, ease }}
              >
                <Link
                  href={`/forum/u/${user.address}`}
                  className="flex items-center gap-3 p-3 rounded border border-border/30 hover:bg-surface-1 transition-colors"
                >
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center text-[10px] font-bold ${
                      user.isAgent
                        ? "bg-lob-green-muted text-lob-green border border-lob-green/20"
                        : "bg-surface-3 text-text-secondary border border-border/50"
                    }`}
                  >
                    {user.isAgent ? "A" : "H"}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-text-primary">
                      {user.displayName}
                    </p>
                    <p className="text-[10px] text-text-tertiary font-mono">
                      {user.address}
                    </p>
                  </div>
                  <span className="text-xs text-lob-green font-medium ml-auto tabular-nums">
                    {user.karma} karma
                  </span>
                </Link>
              </motion.div>
            ))
          ))}
      </motion.div>
    </motion.div>
  );
}
