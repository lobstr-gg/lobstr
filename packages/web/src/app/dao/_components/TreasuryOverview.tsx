"use client";

import { motion } from "framer-motion";
import { fadeUp, stagger, ease } from "@/lib/motion";
import type { TreasuryAsset } from "../_data/dao-utils";
import { formatUSD } from "../_data/dao-utils";

interface TreasuryOverviewProps {
  assets: TreasuryAsset[];
}

function formatBalance(balance: number): string {
  if (balance >= 1_000_000) return `${(balance / 1_000_000).toFixed(1)}M`;
  if (balance >= 1_000) return `${(balance / 1_000).toFixed(1)}K`;
  return balance.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default function TreasuryOverview({ assets }: TreasuryOverviewProps) {
  const totalUSD = assets.reduce((sum, a) => sum + a.valueUSD, 0);

  return (
    <motion.div
      className="card p-4"
      variants={fadeUp}
      initial="hidden"
      animate="show"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-text-primary">Treasury</h2>
        <span className="text-sm font-bold text-text-primary tabular-nums">
          {formatUSD(totalUSD)}
        </span>
      </div>

      {/* Asset list */}
      <motion.div variants={stagger} initial="hidden" animate="show">
        {/* Column headers */}
        <div className="flex items-center text-[10px] text-text-tertiary uppercase tracking-wider mb-2 px-1">
          <span className="flex-1">Asset</span>
          <span className="w-24 text-right">Balance</span>
          <span className="w-24 text-right">Value</span>
          <span className="w-16 text-right">24h</span>
        </div>

        {assets.map((asset, i) => (
          <motion.div
            key={asset.symbol}
            variants={fadeUp}
            className={`flex items-center py-2.5 px-1 ${
              i < assets.length - 1 ? "border-b border-border/40" : ""
            }`}
          >
            {/* Symbol */}
            <div className="flex-1 flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-surface-2 flex items-center justify-center text-[10px] font-bold text-text-secondary">
                {asset.symbol.charAt(0)}
              </div>
              <span className="text-xs font-medium text-text-primary">
                {asset.symbol}
              </span>
            </div>

            {/* Balance */}
            <span className="w-24 text-right text-xs text-text-secondary tabular-nums">
              {formatBalance(asset.balance)}
            </span>

            {/* USD Value */}
            <span className="w-24 text-right text-xs font-medium text-text-primary tabular-nums">
              {formatUSD(asset.valueUSD)}
            </span>

            {/* 24h Change */}
            <span
              className={`w-16 text-right text-xs tabular-nums ${
                asset.change24h > 0
                  ? "text-green-400"
                  : asset.change24h < 0
                    ? "text-red-400"
                    : "text-text-tertiary"
              }`}
            >
              {asset.change24h > 0 ? "+" : ""}
              {asset.change24h.toFixed(1)}%
            </span>
          </motion.div>
        ))}

        {/* Total row */}
        <div className="flex items-center pt-3 mt-1 border-t border-border/60 px-1">
          <span className="flex-1 text-xs font-medium text-text-tertiary uppercase tracking-wider">
            Total
          </span>
          <span className="w-24" />
          <span className="w-24 text-right text-sm font-bold text-text-primary tabular-nums">
            {formatUSD(totalUSD)}
          </span>
          <span className="w-16" />
        </div>
      </motion.div>
    </motion.div>
  );
}
