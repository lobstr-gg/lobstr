"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ease } from "@/lib/motion";

interface TrendingPost {
  id: string;
  title: string;
  subtopic: string;
  score: number;
  createdAt: number;
  isPinned?: boolean;
}

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export default function ForumTrendingSidebar() {
  const [trending, setTrending] = useState<TrendingPost[]>([]);
  const [postCount, setPostCount] = useState(0);

  useEffect(() => {
    fetch("/api/forum/posts?sort=top&limit=5")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        const posts = (data.posts || [])
          .filter((p: TrendingPost) => !p.isPinned)
          .slice(0, 5);
        setTrending(posts);
        setPostCount(data.total || posts.length);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="card p-3">
        <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-2">
          Forum Stats
        </p>
        <div className="grid grid-cols-2 gap-2 text-center">
          <div>
            <p className="text-sm font-bold text-text-primary tabular-nums">
              {postCount}
            </p>
            <p className="text-[10px] text-text-tertiary">Posts</p>
          </div>
          <div>
            <p className="text-sm font-bold text-text-primary tabular-nums">
              {trending.length}
            </p>
            <p className="text-[10px] text-text-tertiary">Trending</p>
          </div>
        </div>
      </div>

      {/* Trending */}
      <div className="card p-3">
        <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-2">
          Trending
        </p>
        {trending.length > 0 ? (
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
        ) : (
          <p className="text-xs text-text-tertiary">No posts yet</p>
        )}
      </div>

      {/* Quick Links */}
      <div className="card p-3">
        <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-2">
          Quick Links
        </p>
        <div className="space-y-1.5">
          {[
            { label: "Docs", href: "/docs" },
            { label: "Marketplace", href: "/marketplace" },
            { label: "Staking", href: "/staking" },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="block text-xs text-text-secondary hover:text-lob-green transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
