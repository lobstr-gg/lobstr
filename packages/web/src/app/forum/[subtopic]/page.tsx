"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { stagger, fadeUp } from "@/lib/motion";
import { useForum } from "@/lib/forum-context";
import { SUBTOPIC_LIST, type Post, type SortMode, type SubtopicId } from "@/lib/forum-types";
import SortControls from "@/components/forum/SortControls";
import PostCard from "@/components/forum/PostCard";
import ForumBreadcrumb from "@/components/forum/ForumBreadcrumb";
import EmptyState from "@/components/forum/EmptyState";
import Spinner from "@/components/Spinner";

export default function SubtopicPage() {
  const params = useParams();
  const subtopicId = params.subtopic as SubtopicId;
  const subtopic = SUBTOPIC_LIST.find((s) => s.id === subtopicId);
  const { isConnected } = useForum();
  const [sortMode, setSortMode] = useState<SortMode>("hot");
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/forum/posts?subtopic=${subtopicId}&sort=${sortMode}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch");
        return res.json();
      })
      .then((data) => setPosts(data.posts))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [subtopicId, sortMode]);

  if (!subtopic) {
    return <EmptyState title="Subtopic not found" />;
  }

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

  return (
    <motion.div initial="hidden" animate="show" variants={stagger}>
      <ForumBreadcrumb crumbs={[{ label: subtopic.name }]} />

      {/* Header */}
      <motion.div
        variants={fadeUp}
        className="flex items-center justify-between mb-4"
      >
        <div>
          <h1 className="text-xl font-bold text-text-primary">
            {subtopic.name}
          </h1>
          <p className="text-xs text-text-tertiary mt-0.5">
            {subtopic.description}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <SortControls value={sortMode} onChange={setSortMode} />
          {isConnected && (
            <motion.div whileTap={{ scale: 0.97 }}>
              <Link
                href={`/forum/${subtopicId}/submit`}
                className="btn-primary text-sm"
              >
                New Post
              </Link>
            </motion.div>
          )}
        </div>
      </motion.div>

      {/* Stats bar */}
      <motion.div
        variants={fadeUp}
        className="flex items-center gap-4 mb-4 text-xs text-text-tertiary"
      >
        <span>{subtopic.postCount} posts</span>
        <span>{subtopic.memberCount} members</span>
        <span>{subtopic.mods.length} mods</span>
      </motion.div>

      {/* Posts */}
      <motion.div variants={fadeUp} className="space-y-2">
        {posts.length === 0 ? (
          <EmptyState
            title="No posts yet"
            subtitle="Be the first to post in this subtopic"
          />
        ) : (
          posts.map((post) => <PostCard key={post.id} post={post} />)
        )}
      </motion.div>

      {/* Rules */}
      {subtopic.rules.length > 0 && (
        <motion.div variants={fadeUp} className="mt-6 card p-4">
          <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-2">
            Rules
          </p>
          <ul className="space-y-1">
            {subtopic.rules.map((rule, i) => (
              <li
                key={i}
                className="text-xs text-text-secondary flex items-start gap-2"
              >
                <span className="text-lob-green text-[8px] mt-1">{i + 1}.</span>
                {rule}
              </li>
            ))}
          </ul>
        </motion.div>
      )}
    </motion.div>
  );
}
