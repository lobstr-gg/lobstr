"use client";

import { motion } from "framer-motion";
import { ease } from "@/lib/motion";
import type { Bounty } from "../_data/dao-utils";
import {
  BOUNTY_STATUS_COLORS,
  DIFFICULTY_COLORS,
  CATEGORY_ICONS,
  formatNumber,
  timeUntil,
  timeAgo,
} from "../_data/dao-utils";

const DIFFICULTY_LABELS: Record<string, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
  expert: "Expert",
};

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  claimed: "Claimed",
  in_review: "In Review",
  completed: "Completed",
  expired: "Expired",
};

export default function BountyCard({ bounty }: { bounty: Bounty }) {
  const statusColor = BOUNTY_STATUS_COLORS[bounty.status];
  const difficultyColor = DIFFICULTY_COLORS[bounty.difficulty];
  const categoryIcon = CATEGORY_ICONS[bounty.category];
  const isActive = bounty.status === "open" || bounty.status === "claimed";

  return (
    <motion.div
      className="card group p-4 flex flex-col cursor-pointer"
      whileHover={{ y: -3, borderColor: "rgba(88,176,89,0.15)" }}
      transition={{ duration: 0.2, ease }}
    >
      {/* Header: Status + ID + Category + Difficulty */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${statusColor.dot}`} />
          <span
            className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${statusColor.bg} ${statusColor.text}`}
          >
            {STATUS_LABELS[bounty.status]}
          </span>
        </div>

        <div className="flex items-center gap-1.5 ml-auto">
          <span className="text-[10px] font-mono text-text-tertiary">
            {bounty.id}
          </span>
          <span className="text-[10px] text-text-tertiary font-mono">
            {categoryIcon}
          </span>
          <span
            className={`text-[10px] font-medium ${difficultyColor}`}
          >
            {DIFFICULTY_LABELS[bounty.difficulty]}
          </span>
        </div>
      </div>

      {/* Title */}
      <h3 className="text-sm font-medium text-text-primary group-hover:text-lob-green transition-colors mb-1.5 line-clamp-2">
        {bounty.title}
      </h3>

      {/* Description */}
      <p className="text-xs text-text-tertiary line-clamp-2 mb-3 flex-1">
        {bounty.description}
      </p>

      {/* Reward */}
      <div className="flex items-center gap-2 mb-3">
        <span
          className={`text-sm font-bold tabular-nums ${
            bounty.rewardToken === "LOB" ? "text-lob-green" : "text-blue-400"
          }`}
        >
          {formatNumber(bounty.reward)}
        </span>
        <span className="text-[10px] text-text-tertiary">
          {bounty.rewardToken}
        </span>
      </div>

      {/* Stats: requirements, submissions, deadline */}
      <div className="flex items-center gap-3 text-[10px] text-text-tertiary mb-3">
        <span>{bounty.requirements.length} requirements</span>
        <span>{bounty.submissions} submissions</span>
        <span className="ml-auto">
          {isActive ? timeUntil(bounty.deadline) : bounty.completedAt ? `Done ${timeAgo(bounty.completedAt)}` : "Ended"}
        </span>
      </div>

      {/* Claimer info */}
      {bounty.claimedBy && (
        <div className="flex items-center gap-2 mb-3 py-2 px-2 bg-surface-2/50 rounded">
          <div className="w-5 h-5 rounded-full bg-surface-3 flex items-center justify-center text-[9px] font-bold text-text-secondary">
            {bounty.claimedBy.name.charAt(0)}
          </div>
          <div className="min-w-0">
            <p className="text-[10px] text-text-secondary truncate">
              {bounty.claimedBy.name}
            </p>
            <p className="text-[9px] text-text-tertiary font-mono">
              {bounty.claimedBy.address}
            </p>
          </div>
          <span className="text-[9px] text-yellow-400 ml-auto">Claimed</span>
        </div>
      )}

      {/* Tags */}
      <div className="flex flex-wrap gap-1">
        {bounty.tags.slice(0, 3).map((tag) => (
          <span
            key={tag}
            className="text-[10px] text-text-tertiary bg-surface-2 px-1.5 py-0.5 rounded"
          >
            {tag}
          </span>
        ))}
      </div>
    </motion.div>
  );
}
