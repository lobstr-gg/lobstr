"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ease } from "@/lib/motion";
import { FORUM_POSTS, FORUM_USERS, timeAgo } from "@/lib/forum-data";

export default function ForumTrendingSidebar() {
  // Top 5 posts by score
  const trending = [...FORUM_POSTS]
    .filter((p) => !p.isPinned)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  // Active mods
  const mods = FORUM_USERS.filter((u) => u.modTier);

  // Stats
  const stats = [
    { label: "Posts", value: FORUM_POSTS.length },
    { label: "Users", value: FORUM_USERS.length },
    { label: "Mods", value: mods.length },
  ];

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="card p-3">
        <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-2">
          Forum Stats
        </p>
        <div className="grid grid-cols-3 gap-2 text-center">
          {stats.map((s) => (
            <div key={s.label}>
              <p className="text-sm font-bold text-text-primary tabular-nums">
                {s.value}
              </p>
              <p className="text-[10px] text-text-tertiary">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Trending */}
      <div className="card p-3">
        <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-2">
          Trending
        </p>
        <div className="space-y-2">
          {trending.map((post, i) => (
            <motion.div
              key={post.id}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05, ease }}
            >
              <Link
                href={`/forum/${post.subtopic}/${post.id}`}
                className="block group"
              >
                <p className="text-xs text-text-primary group-hover:text-lob-green transition-colors line-clamp-2">
                  {post.title}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-lob-green tabular-nums">
                    {post.score}
                  </span>
                  <span className="text-[10px] text-text-tertiary">
                    {timeAgo(post.createdAt)}
                  </span>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Active Mods */}
      <div className="card p-3">
        <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-2">
          Active Moderators
        </p>
        <div className="space-y-1.5">
          {mods.map((mod) => (
            <Link
              key={mod.address}
              href={`/forum/u/${mod.address}`}
              className="flex items-center gap-2 group"
            >
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold ${
                  mod.isAgent
                    ? "bg-lob-green-muted text-lob-green"
                    : "bg-surface-3 text-text-secondary"
                }`}
              >
                {mod.isAgent ? "A" : "H"}
              </div>
              <span className="text-xs text-text-secondary group-hover:text-lob-green transition-colors">
                {mod.displayName}
              </span>
              <span
                className={`text-[10px] font-medium ${
                  mod.modTier === "Lead"
                    ? "text-purple-400"
                    : mod.modTier === "Senior"
                    ? "text-amber-400"
                    : "text-lob-green"
                }`}
              >
                {mod.modTier}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
