"use client";

import { useReputationData, useReputationScore } from "@/lib/hooks";

const TIER_NAMES = ["None", "Bronze", "Silver", "Gold", "Platinum"] as const;
const TIER_COLORS: Record<string, { text: string; bg: string; border: string }> = {
  None: { text: "text-text-tertiary", bg: "bg-surface-2", border: "border-border/30" },
  Bronze: { text: "text-amber-600", bg: "bg-amber-500/10", border: "border-amber-500/30" },
  Silver: { text: "text-gray-300", bg: "bg-gray-400/10", border: "border-gray-400/30" },
  Gold: { text: "text-yellow-400", bg: "bg-yellow-400/10", border: "border-yellow-400/30" },
  Platinum: { text: "text-cyan-300", bg: "bg-cyan-400/10", border: "border-cyan-400/30" },
};

// Known thresholds from the ReputationSystem contract
const TIER_THRESHOLDS = [0n, 100n, 300n, 700n, 1500n];

export default function ReputationCard({ address }: { address: string }) {
  const { data: repData, isLoading: repLoading } = useReputationData(address as `0x${string}`);
  const { data: scoreData, isLoading: scoreLoading } = useReputationScore(address as `0x${string}`);

  const isLoading = repLoading || scoreLoading;

  if (isLoading) {
    return (
      <div className="card p-4 animate-pulse">
        <div className="h-4 bg-surface-2 rounded w-32 mb-3" />
        <div className="h-3 bg-surface-2 rounded w-48" />
      </div>
    );
  }

  // repData is a tuple: [score, completions, disputesLost, disputesWon, firstActivityTimestamp]
  if (!repData || !scoreData) {
    return (
      <div className="card p-4">
        <h3 className="text-xs font-semibold text-text-secondary mb-2">On-Chain Reputation</h3>
        <p className="text-xs text-text-tertiary">No on-chain reputation yet</p>
      </div>
    );
  }

  const data = repData as unknown as { score: bigint; completions: bigint; disputesLost: bigint; disputesWon: bigint; firstActivityTimestamp: bigint };
  const score = data.score;
  const completions = data.completions;
  const disputesLost = data.disputesLost;
  const disputesWon = data.disputesWon;
  const firstActivityTimestamp = data.firstActivityTimestamp;
  const scoreResult = scoreData as unknown as readonly [bigint, number];
  const tier = Number(scoreResult[1]);
  const tierName = TIER_NAMES[tier] ?? "None";
  const colors = TIER_COLORS[tierName];

  const totalDisputes = Number(disputesWon) + Number(disputesLost);
  const winRate = totalDisputes > 0 ? Math.round((Number(disputesWon) / totalDisputes) * 100) : 0;

  // Progress to next tier
  const currentThreshold = TIER_THRESHOLDS[tier] ?? 0n;
  const nextThreshold = tier < 4 ? TIER_THRESHOLDS[tier + 1] : null;
  let progress = 100;
  if (nextThreshold) {
    const range = Number(nextThreshold - currentThreshold);
    const current = Number(score - currentThreshold);
    progress = Math.min(100, Math.round((current / range) * 100));
  }

  const activeSince = Number(firstActivityTimestamp) > 0
    ? new Date(Number(firstActivityTimestamp) * 1000).toLocaleDateString()
    : null;

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-text-secondary">On-Chain Reputation</h3>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${colors.text} ${colors.bg} ${colors.border}`}>
          {tierName}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <div className="text-center">
          <p className="text-lg font-bold text-text-primary tabular-nums">{Number(score)}</p>
          <p className="text-[10px] text-text-tertiary">Score</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-text-primary tabular-nums">{Number(completions)}</p>
          <p className="text-[10px] text-text-tertiary">Completions</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-text-primary tabular-nums">
            {Number(disputesWon)}/{Number(disputesLost)}
          </p>
          <p className="text-[10px] text-text-tertiary">Disputes W/L</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-text-primary tabular-nums">{winRate}%</p>
          <p className="text-[10px] text-text-tertiary">Win Rate</p>
        </div>
      </div>

      {/* Progress bar */}
      {nextThreshold && (
        <div className="mb-2">
          <div className="flex justify-between text-[10px] text-text-tertiary mb-1">
            <span>{tierName}</span>
            <span>{TIER_NAMES[tier + 1]}</span>
          </div>
          <div className="w-full h-1.5 bg-surface-2 rounded-full overflow-hidden">
            <div
              className="h-full bg-lob-green rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {activeSince && (
        <p className="text-[10px] text-text-tertiary">Active since {activeSince}</p>
      )}
    </div>
  );
}
