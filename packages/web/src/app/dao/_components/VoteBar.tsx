"use client";

import { motion } from "framer-motion";
import { ease } from "@/lib/motion";

interface VoteBarProps {
  forVotes: number;
  againstVotes: number;
  abstainVotes: number;
  quorum: number;
  showLabels?: boolean;
  className?: string;
}

export default function VoteBar({
  forVotes,
  againstVotes,
  abstainVotes,
  quorum,
  showLabels = false,
  className = "",
}: VoteBarProps) {
  const total = forVotes + againstVotes + abstainVotes;

  const forPct = total > 0 ? (forVotes / total) * 100 : 0;
  const againstPct = total > 0 ? (againstVotes / total) * 100 : 0;
  const abstainPct = total > 0 ? (abstainVotes / total) * 100 : 0;

  // Quorum position as % of total possible votes (quorum itself as reference)
  // Show quorum marker relative to total votes cast vs quorum target
  const quorumPosition = quorum > 0 ? Math.min((quorum / Math.max(total, quorum)) * 100, 100) : 0;

  return (
    <div className={className}>
      {/* Bar */}
      <div className="relative h-2 rounded-full overflow-hidden bg-surface-2">
        {total > 0 && (
          <div className="flex h-full w-full">
            {forVotes > 0 && (
              <motion.div
                className="bg-green-400 h-full"
                initial={{ width: 0 }}
                animate={{ width: `${forPct}%` }}
                transition={{ duration: 0.6, ease }}
                style={{ minWidth: forVotes > 0 ? 2 : 0 }}
              />
            )}
            {againstVotes > 0 && (
              <motion.div
                className="bg-red-400 h-full"
                initial={{ width: 0 }}
                animate={{ width: `${againstPct}%` }}
                transition={{ duration: 0.6, ease, delay: 0.1 }}
                style={{ minWidth: againstVotes > 0 ? 2 : 0 }}
              />
            )}
            {abstainVotes > 0 && (
              <motion.div
                className="bg-zinc-500 h-full"
                initial={{ width: 0 }}
                animate={{ width: `${abstainPct}%` }}
                transition={{ duration: 0.6, ease, delay: 0.2 }}
                style={{ minWidth: abstainVotes > 0 ? 2 : 0 }}
              />
            )}
          </div>
        )}

        {/* Quorum marker */}
        {quorum > 0 && (
          <div
            className="absolute top-0 h-full w-0.5 bg-white/60 group/quorum"
            style={{ left: `${quorumPosition}%` }}
            title={`Quorum: ${(quorum / 1_000_000).toFixed(1)}M`}
          >
            <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[9px] text-text-tertiary whitespace-nowrap opacity-0 group-hover/quorum:opacity-100 transition-opacity bg-surface-3 px-1.5 py-0.5 rounded">
              Quorum: {(quorum / 1_000_000).toFixed(1)}M
            </div>
          </div>
        )}
      </div>

      {/* Labels */}
      {showLabels && total > 0 && (
        <div className="flex justify-between mt-1.5 text-[10px]">
          <span className="text-green-400">{forPct.toFixed(1)}% For</span>
          <span className="text-red-400">{againstPct.toFixed(1)}% Against</span>
          <span className="text-zinc-400">{abstainPct.toFixed(1)}% Abstain</span>
        </div>
      )}
    </div>
  );
}
