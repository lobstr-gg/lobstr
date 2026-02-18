"use client";

import { motion } from "framer-motion";
import { ease } from "@/lib/motion";
import type { Delegate } from "../_data/dao-utils";
import { formatNumber } from "../_data/dao-utils";

const TIER_COLORS: Record<string, string> = {
  Bronze: "#CD7F32",
  Silver: "#C0C0C0",
  Gold: "#FFD700",
  Platinum: "#E5E4E2",
};

export default function DelegateCard({ delegate }: { delegate: Delegate }) {
  const tierColor = TIER_COLORS[delegate.tier] ?? "#848E9C";

  return (
    <motion.div
      className="card group p-4 flex flex-col"
      whileHover={{ y: -3, borderColor: "rgba(0,214,114,0.15)" }}
      transition={{ duration: 0.2, ease }}
    >
      {/* Header: Name + Tier */}
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-full bg-surface-2 flex items-center justify-center text-xs font-bold text-text-secondary">
          {delegate.name.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-primary truncate">
            {delegate.name}
          </p>
          <p className="text-[10px] text-text-tertiary font-mono">
            {delegate.address}
          </p>
        </div>
        <span
          className="text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0"
          style={{
            color: tierColor,
            backgroundColor: `${tierColor}15`,
            border: `1px solid ${tierColor}30`,
          }}
        >
          {delegate.tier}
        </span>
      </div>

      {/* Voting Power */}
      <div className="mb-3">
        <p className="text-lg font-bold text-text-primary tabular-nums">
          {formatNumber(delegate.votingPower)}
        </p>
        <p className="text-[10px] text-text-tertiary uppercase tracking-wider">
          Voting Power (LOB)
        </p>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-3 text-[10px] text-text-tertiary mb-3">
        <span>{delegate.delegators} delegators</span>
        <span>{delegate.proposalsVoted} voted</span>
        <span>{delegate.proposalsCreated} created</span>
      </div>

      {/* Statement */}
      <p className="text-xs text-text-secondary line-clamp-2 mb-4 flex-1">
        {delegate.statement}
      </p>

      {/* Delegate button */}
      <button className="btn-secondary w-full text-xs py-1.5">
        Delegate
      </button>
    </motion.div>
  );
}
