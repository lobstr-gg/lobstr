"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useVoteOnDispute } from "@/lib/hooks";

interface VotingPanelProps {
  disputeId: bigint;
  votesForBuyer: number;
  votesForSeller: number;
  onSuccess: () => void;
}

export default function VotingPanel({ disputeId, votesForBuyer, votesForSeller, onSuccess }: VotingPanelProps) {
  const voteOnDispute = useVoteOnDispute();
  const [voting, setVoting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalVotes = votesForBuyer + votesForSeller;

  const handleVote = async (favorBuyer: boolean) => {
    setVoting(true);
    setError(null);
    try {
      voteOnDispute(disputeId, favorBuyer);
      // Give the tx time to process then refresh
      setTimeout(onSuccess, 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Vote failed");
    } finally {
      setVoting(false);
    }
  };

  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold text-text-primary mb-3">Cast Your Vote</h3>

      {/* Tally */}
      <div className="flex items-center gap-4 mb-4">
        <div className="flex-1 text-center">
          <p className="text-lg font-bold text-blue-400 tabular-nums">{votesForBuyer}</p>
          <p className="text-[10px] text-text-tertiary uppercase tracking-wider">For Buyer</p>
        </div>
        <div className="text-xs text-text-tertiary">vs</div>
        <div className="flex-1 text-center">
          <p className="text-lg font-bold text-orange-400 tabular-nums">{votesForSeller}</p>
          <p className="text-[10px] text-text-tertiary uppercase tracking-wider">For Seller</p>
        </div>
      </div>

      {totalVotes > 0 && (
        <div className="flex h-1.5 rounded-full overflow-hidden mb-4 bg-surface-3">
          <div
            className="bg-blue-400 transition-all"
            style={{ width: `${(votesForBuyer / Math.max(totalVotes, 1)) * 100}%` }}
          />
          <div
            className="bg-orange-400 transition-all"
            style={{ width: `${(votesForSeller / Math.max(totalVotes, 1)) * 100}%` }}
          />
        </div>
      )}

      {error && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded p-2 mb-3">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <motion.button
          className="flex-1 py-2 text-xs font-medium rounded-lg border border-blue-500/30 text-blue-400 hover:bg-blue-500/10 transition-colors"
          whileTap={{ scale: 0.97 }}
          onClick={() => handleVote(true)}
          disabled={voting}
        >
          {voting ? "Submitting..." : "Vote for Buyer"}
        </motion.button>
        <motion.button
          className="flex-1 py-2 text-xs font-medium rounded-lg border border-orange-500/30 text-orange-400 hover:bg-orange-500/10 transition-colors"
          whileTap={{ scale: 0.97 }}
          onClick={() => handleVote(false)}
          disabled={voting}
        >
          {voting ? "Submitting..." : "Vote for Seller"}
        </motion.button>
      </div>
    </div>
  );
}
