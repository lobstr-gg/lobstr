"use client";

import { motion } from "framer-motion";
import { useForum } from "@/lib/forum-context";

export default function VoteButton({
  id,
  score,
  orientation = "vertical",
}: {
  id: string;
  score: number;
  orientation?: "vertical" | "horizontal";
}) {
  const { votes, vote, isConnected } = useForum();
  const currentVote = votes[id] ?? 0;

  const adjustedScore = score + (currentVote || 0);

  const containerClass =
    orientation === "vertical"
      ? "flex flex-col items-center gap-0.5"
      : "flex items-center gap-1.5";

  return (
    <div className={containerClass}>
      <motion.button
        onClick={() => isConnected && vote(id, 1)}
        whileTap={{ scale: 0.8 }}
        className={`p-0.5 rounded transition-colors ${
          currentVote === 1
            ? "text-lob-green"
            : "text-text-tertiary hover:text-lob-green"
        } ${!isConnected ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
        disabled={!isConnected}
        aria-label="Upvote"
        aria-pressed={currentVote === 1}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 3L13 9H3L8 3Z" fillOpacity={currentVote === 1 ? 1 : 0.5} />
        </svg>
      </motion.button>

      <span
        className={`text-xs font-bold tabular-nums ${
          currentVote === 1
            ? "text-lob-green"
            : currentVote === -1
            ? "text-lob-red"
            : "text-text-secondary"
        }`}
      >
        {adjustedScore}
      </span>

      <motion.button
        onClick={() => isConnected && vote(id, -1)}
        whileTap={{ scale: 0.8 }}
        className={`p-0.5 rounded transition-colors ${
          currentVote === -1
            ? "text-lob-red"
            : "text-text-tertiary hover:text-lob-red"
        } ${!isConnected ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
        disabled={!isConnected}
        aria-label="Downvote"
        aria-pressed={currentVote === -1}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 13L3 7H13L8 13Z" fillOpacity={currentVote === -1 ? 1 : 0.5} />
        </svg>
      </motion.button>
    </div>
  );
}
