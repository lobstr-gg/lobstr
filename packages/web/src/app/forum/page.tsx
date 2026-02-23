"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { stagger, fadeUp } from "@/lib/motion";
import type { Post, SortMode } from "@/lib/forum-types";
import SortControls from "@/components/forum/SortControls";
import PostCard from "@/components/forum/PostCard";
import Spinner from "@/components/Spinner";
import { InfoButton } from "@/components/InfoButton";

export default function ForumHomePage() {
  const [sortMode, setSortMode] = useState<SortMode>("hot");
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/forum/posts?sort=${sortMode}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch");
        return res.json();
      })
      .then((data) => setPosts(data.posts))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [sortMode]);

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
      {/* Header */}
      <motion.div
        variants={fadeUp}
        className="flex items-center justify-between mb-4"
      >
        <div>
          <h1 className="text-xl font-bold text-text-primary flex items-center gap-1.5">
            Forum
            <InfoButton infoKey="forum.header" />
          </h1>
          <p className="text-xs text-text-tertiary mt-0.5">
            All posts across every subtopic
          </p>
        </div>
        <SortControls value={sortMode} onChange={setSortMode} />
      </motion.div>

      {/* Posts */}
      <motion.div variants={fadeUp} className="space-y-2">
        {posts.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </motion.div>
    </motion.div>
  );
}
