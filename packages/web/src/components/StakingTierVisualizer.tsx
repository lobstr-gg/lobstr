"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ease } from "@/lib/motion";

interface TierInfo {
  name: string;
  threshold: number;
  color: string;
}

const TIERS: TierInfo[] = [
  { name: "Bronze", threshold: 100, color: "#CD7F32" },
  { name: "Silver", threshold: 1_000, color: "#848E9C" },
  { name: "Gold", threshold: 10_000, color: "#F0B90B" },
  { name: "Platinum", threshold: 100_000, color: "#58B059" },
];

interface StakingTierVisualizerProps {
  stakedAmount: number;
  currentTier: number; // 0=None, 1=Bronze, 2=Silver, 3=Gold, 4=Platinum
}

function formatLob(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export default function StakingTierVisualizer({
  stakedAmount,
  currentTier,
}: StakingTierVisualizerProps) {
  const nextTierIdx = Math.min(currentTier, TIERS.length - 1);
  const isMaxTier = currentTier >= 4;

  return (
    <div className="card p-5">
      <h3 className="text-xs font-semibold text-text-primary mb-5 uppercase tracking-wider">
        Tier Progress
      </h3>

      {/* Vertical tier ladder */}
      <div className="relative flex flex-col gap-0">
        {/* Background rail */}
        <div className="absolute left-[15px] top-4 bottom-4 w-0.5 bg-border" />

        {/* Animated fill */}
        <motion.div
          className="absolute left-[15px] bottom-4 w-0.5 bg-lob-green origin-bottom"
          style={{ top: "auto" }}
          initial={{ height: 0 }}
          animate={{
            height: isMaxTier
              ? "calc(100% - 32px)"
              : `${(currentTier / TIERS.length) * 100}%`,
          }}
          transition={{ duration: 1.2, ease }}
        />

        {[...TIERS].reverse().map((tier, reversedIdx) => {
          const tierIdx = TIERS.length - 1 - reversedIdx;
          const tierLevel = tierIdx + 1;
          const isReached = currentTier >= tierLevel;
          const isCurrent = currentTier === tierLevel;
          const isNext = currentTier === tierLevel - 1;

          return (
            <motion.div
              key={tier.name}
              className="flex items-center gap-4 py-3 relative"
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.1 + reversedIdx * 0.08, ease }}
            >
              {/* Checkpoint node */}
              <div className="relative z-10">
                <motion.div
                  className={`w-[30px] h-[30px] rounded-full flex items-center justify-center border-2 ${
                    isCurrent
                      ? "border-transparent"
                      : isReached
                      ? "border-transparent"
                      : "border-border bg-surface-2"
                  }`}
                  style={
                    isReached
                      ? {
                          backgroundColor: `${tier.color}20`,
                          borderColor: `${tier.color}60`,
                        }
                      : undefined
                  }
                  animate={
                    isCurrent
                      ? {
                          boxShadow: [
                            `0 0 0 0 ${tier.color}00`,
                            `0 0 0 8px ${tier.color}25`,
                            `0 0 0 0 ${tier.color}00`,
                          ],
                        }
                      : {}
                  }
                  transition={
                    isCurrent
                      ? { duration: 2, repeat: Infinity }
                      : {}
                  }
                >
                  {isReached ? (
                    <motion.div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: tier.color }}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ duration: 0.4, delay: 0.3 + reversedIdx * 0.1 }}
                    />
                  ) : (
                    <div className="w-2 h-2 rounded-full bg-surface-4" />
                  )}
                </motion.div>
              </div>

              {/* Tier info */}
              <div className="flex-1 flex items-center justify-between">
                <div>
                  <span
                    className={`text-sm font-semibold ${
                      isCurrent ? "text-text-primary" : isReached ? "text-text-secondary" : "text-text-tertiary"
                    }`}
                    style={isCurrent ? { color: tier.color } : undefined}
                  >
                    {tier.name}
                  </span>
                  <span className="text-[10px] text-text-tertiary ml-2 tabular-nums">
                    {formatLob(tier.threshold)} LOB
                  </span>
                </div>

                {/* Status badge */}
                <AnimatePresence>
                  {isCurrent && (
                    <motion.span
                      className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                      style={{
                        color: tier.color,
                        backgroundColor: `${tier.color}15`,
                        border: `1px solid ${tier.color}30`,
                      }}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                    >
                      Current
                    </motion.span>
                  )}
                  {isNext && !isMaxTier && (
                    <motion.span
                      className="text-[9px] font-medium text-text-tertiary uppercase tracking-wider px-2 py-0.5 rounded-full bg-surface-2"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                    >
                      Next
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          );
        })}

        {/* None tier (bottom) */}
        <motion.div
          className="flex items-center gap-4 py-3 relative"
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.5, ease }}
        >
          <div className="relative z-10">
            <div
              className={`w-[30px] h-[30px] rounded-full flex items-center justify-center border-2 ${
                currentTier === 0
                  ? "border-text-tertiary bg-surface-3"
                  : "border-text-tertiary/30 bg-surface-2"
              }`}
            >
              <div className={`w-2 h-2 rounded-full ${currentTier === 0 ? "bg-text-tertiary" : "bg-surface-4"}`} />
            </div>
          </div>
          <span className={`text-sm ${currentTier === 0 ? "text-text-secondary font-medium" : "text-text-tertiary"}`}>
            None
          </span>
        </motion.div>
      </div>

      {/* Distance to next tier */}
      {!isMaxTier && (
        <motion.div
          className="mt-4 pt-4 border-t border-border/30"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-text-tertiary uppercase tracking-wider">
              Progress to {TIERS[nextTierIdx]?.name ?? "Next"}
            </span>
            <span className="text-[10px] text-text-tertiary tabular-nums">
              {formatLob(stakedAmount)} / {formatLob(TIERS[nextTierIdx]?.threshold ?? 0)} LOB
            </span>
          </div>
          <div className="h-2 rounded-full bg-surface-3 overflow-hidden relative">
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: TIERS[nextTierIdx]?.color ?? "#58B059" }}
              initial={{ width: 0 }}
              animate={{
                width: `${Math.min(
                  100,
                  (stakedAmount / (TIERS[nextTierIdx]?.threshold ?? 1)) * 100
                )}%`,
              }}
              transition={{ duration: 1, delay: 0.5, ease }}
            />
            {/* Shimmer effect */}
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
              animate={{ x: ["-100%", "200%"] }}
              transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
            />
          </div>
          <p className="text-[10px] text-text-tertiary mt-1.5">
            {formatLob(Math.max(0, (TIERS[nextTierIdx]?.threshold ?? 0) - stakedAmount))} LOB remaining
          </p>
        </motion.div>
      )}

      {isMaxTier && (
        <motion.div
          className="mt-4 pt-4 border-t border-border/30 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
        >
          <motion.div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-lob-green/30 bg-lob-green/5"
            animate={{
              boxShadow: [
                "0 0 0 rgba(88,176,89,0)",
                "0 0 20px rgba(88,176,89,0.1)",
                "0 0 0 rgba(88,176,89,0)",
              ],
            }}
            transition={{ duration: 3, repeat: Infinity }}
          >
            <span className="text-xs font-semibold text-lob-green">Max Tier Reached</span>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
