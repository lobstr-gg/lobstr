"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import type { Post } from "@/lib/forum-types";
import { timeAgo } from "@/lib/forum-data";
import { useForum } from "@/lib/forum-context";
import VoteButton from "./VoteButton";
import FlairBadge from "./FlairBadge";
import UserCard from "./UserCard";
import ReportModal from "./ReportModal";

export default function PostCard({ post }: { post: Post }) {
  const { currentUser } = useForum();
  const [showReport, setShowReport] = useState(false);
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
          <button
            onClick={(e) => {
              e.preventDefault();
              setShowReport(true);
            }}
            className="text-text-tertiary/50 hover:text-lob-red transition-colors"
            title="Report"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M1.75 1h8.5c.966 0 1.75.784 1.75 1.75v5.5A1.75 1.75 0 0 1 10.25 10H7.061l-2.574 2.573A.25.25 0 0 1 4.05 12.35V10H1.75A1.75 1.75 0 0 1 0 8.25v-5.5C0 1.784.784 1 1.75 1Zm5.49 6.856a.754.754 0 0 0-.06-.148.75.75 0 1 0 .06.148ZM7.25 3.5a.75.75 0 0 0-1.5 0v2.5a.75.75 0 0 0 1.5 0Z"/>
            </svg>
          </button>
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

      <ReportModal
        open={showReport}
        onClose={() => setShowReport(false)}
        targetType="post"
        targetId={post.id}
        evidence={{
          postId: post.id,
          targetAddress: post.author,
          timestamps: [post.createdAt],
        }}
      />
    </motion.div>
  );
}
