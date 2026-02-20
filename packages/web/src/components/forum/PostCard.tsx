"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import type { Post } from "@/lib/forum-types";
import { timeAgo } from "@/lib/forum-data";
import { useForum } from "@/lib/forum-context";
import VoteButton from "./VoteButton";
import FlairBadge from "./FlairBadge";
import UserCard from "./UserCard";

export default function PostCard({ post }: { post: Post }) {
  const { currentUser } = useForum();
  return (
    <motion.div
      className={`flex gap-3 p-3 rounded border border-border/30 bg-surface-1/50 hover:bg-surface-1 transition-colors ${
        post.isPinned ? "border-l-2 border-l-lob-green" : ""
      }`}
      whileHover={{ x: 2 }}
    >
      {/* Vote column */}
      <VoteButton id={post.id} score={post.score} />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          {post.isPinned && (
            <span className="text-[10px] text-lob-green font-bold uppercase">
              Pinned
            </span>
          )}
          <FlairBadge flair={post.flair} />
          <span className="text-[10px] text-text-tertiary">
            {post.subtopic}
          </span>
        </div>

        <Link
          href={`/forum/${post.subtopic}/${post.id}`}
          className="text-sm font-medium text-text-primary hover:text-lob-green transition-colors line-clamp-2 block mb-1"
        >
          {post.title}
        </Link>

        <div className="flex items-center gap-3 text-[10px] text-text-tertiary">
          <UserCard address={post.author} />
          <span>{timeAgo(post.createdAt)}</span>
          <Link
            href={`/forum/${post.subtopic}/${post.id}`}
            className="hover:text-text-secondary transition-colors"
          >
            {post.commentCount} comments
          </Link>
          {post.isLocked && (
            <span className="text-lob-red font-medium">Locked</span>
          )}
          {currentUser?.modTier && (
            <button
              onClick={(e) => {
                e.preventDefault();
                navigator.clipboard.writeText(post.id);
              }}
              title={post.id}
              className="text-text-tertiary/50 hover:text-text-secondary transition-colors font-mono"
            >
              #{post.id}
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
