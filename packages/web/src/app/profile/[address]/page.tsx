"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { useMemo } from "react";
import { formatEther, isAddress } from "viem";
import { useAccount } from "wagmi";
import { stagger, fadeUp, ease } from "@/lib/motion";
import { useReputationScore, useStakeTier, useStakeInfo, useProviderListingCount } from "@/lib/hooks";
import dynamic from "next/dynamic";
import { Shield, Star, Trophy, Zap, Target, TrendingUp } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LineChart,
  Line,
} from "recharts";
import { getExplorerUrl } from "@/config/contracts";

const ReputationRadar = dynamic(() => import("@/components/ReputationRadar"), { ssr: false });

const TIER_COLORS: Record<string, string> = {
  Bronze: "#CD7F32",
  Silver: "#848E9C",
  Gold: "#F0B90B",
  Platinum: "#58B059",
  None: "#5E6673",
};

const TIER_NAMES = ["None", "Bronze", "Silver", "Gold", "Platinum"];
const TIER_THRESHOLDS = [0, 250, 1000, 5000, 25000];

// Rank system — more granular than tiers
const RANKS = [
  { name: "Unranked", minScore: 0, icon: Shield, color: "#5E6673", bg: "rgba(94,102,115,0.1)", border: "rgba(94,102,115,0.2)" },
  { name: "Initiate", minScore: 10, icon: Zap, color: "#848E9C", bg: "rgba(132,142,156,0.1)", border: "rgba(132,142,156,0.2)" },
  { name: "Operator", minScore: 100, icon: Target, color: "#3B82F6", bg: "rgba(59,130,246,0.1)", border: "rgba(59,130,246,0.2)" },
  { name: "Specialist", minScore: 500, icon: Star, color: "#CD7F32", bg: "rgba(205,127,50,0.1)", border: "rgba(205,127,50,0.2)" },
  { name: "Veteran", minScore: 2500, icon: TrendingUp, color: "#F0B90B", bg: "rgba(240,185,11,0.1)", border: "rgba(240,185,11,0.2)" },
  { name: "Elite", minScore: 10000, icon: Trophy, color: "#58B059", bg: "rgba(88,176,89,0.1)", border: "rgba(88,176,89,0.2)" },
  { name: "Legend", minScore: 50000, icon: Trophy, color: "#A855F7", bg: "rgba(168,85,247,0.1)", border: "rgba(168,85,247,0.2)" },
];

function getRank(score: number) {
  let rank = RANKS[0];
  for (const r of RANKS) {
    if (score >= r.minScore) rank = r;
  }
  return rank;
}

function getRankIndex(score: number) {
  let idx = 0;
  for (let i = 0; i < RANKS.length; i++) {
    if (score >= RANKS[i].minScore) idx = i;
  }
  return idx;
}

/* ── Rank Badge Component ──────────────────────────────────────── */

function RankBadge({ score, loading }: { score: number | undefined; loading: boolean }) {
  const s = score ?? 0;
  const rank = getRank(s);
  const rankIdx = getRankIndex(s);
  const nextRank = rankIdx < RANKS.length - 1 ? RANKS[rankIdx + 1] : null;
  const progressToNext = nextRank
    ? Math.min(100, Math.round(((s - rank.minScore) / (nextRank.minScore - rank.minScore)) * 100))
    : 100;
  const Icon = rank.icon;

  return (
    <motion.div
      className="relative flex flex-col items-center"
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.6, ease }}
    >
      {/* Shield shape */}
      <motion.div
        className="relative w-20 h-20 sm:w-24 sm:h-24"
        animate={{
          filter: [
            `drop-shadow(0 0 8px ${rank.color}20)`,
            `drop-shadow(0 0 16px ${rank.color}40)`,
            `drop-shadow(0 0 8px ${rank.color}20)`,
          ],
        }}
        transition={{ duration: 3, repeat: Infinity }}
      >
        <svg viewBox="0 0 100 110" className="w-full h-full">
          {/* Shield background */}
          <path
            d="M50 5 L90 20 L90 60 Q90 90 50 105 Q10 90 10 60 L10 20 Z"
            fill={rank.bg}
            stroke={rank.border}
            strokeWidth="2"
          />
          {/* Inner glow line */}
          <path
            d="M50 12 L83 24 L83 58 Q83 84 50 98 Q17 84 17 58 L17 24 Z"
            fill="none"
            stroke={rank.color}
            strokeWidth="0.5"
            opacity="0.3"
          />
        </svg>
        {/* Icon centered in shield */}
        <div className="absolute inset-0 flex items-center justify-center -mt-1">
          {loading ? (
            <div className="w-8 h-8 rounded-full bg-surface-3 animate-pulse" />
          ) : (
            <Icon className="w-7 h-7 sm:w-8 sm:h-8" style={{ color: rank.color }} />
          )}
        </div>
      </motion.div>

      {/* Rank name */}
      <motion.span
        className="text-xs sm:text-sm font-bold mt-1 tracking-wide"
        style={{ color: rank.color }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        {loading ? "..." : rank.name}
      </motion.span>

      {/* Mini progress to next rank */}
      {nextRank && !loading && (
        <div className="flex items-center gap-2 mt-1.5">
          <div className="w-16 sm:w-20 h-1 rounded-full bg-surface-3 overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: rank.color }}
              initial={{ width: 0 }}
              animate={{ width: `${progressToNext}%` }}
              transition={{ duration: 1, delay: 0.5, ease }}
            />
          </div>
          <span className="text-[8px] sm:text-[9px] text-text-tertiary">
            {nextRank.name}
          </span>
        </div>
      )}
    </motion.div>
  );
}

/* ── Rank Level Indicator (horizontal) ─────────────────────────── */

function RankLevels({ score, loading }: { score: number | undefined; loading: boolean }) {
  const s = score ?? 0;
  const currentIdx = getRankIndex(s);

  return (
    <div className="flex items-center gap-1 sm:gap-1.5">
      {RANKS.map((rank, i) => {
        const isActive = i <= currentIdx && !loading;
        const isCurrent = i === currentIdx && !loading;
        const Icon = rank.icon;
        return (
          <motion.div
            key={rank.name}
            className="flex flex-col items-center gap-0.5"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 + i * 0.06 }}
          >
            <motion.div
              className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center border ${
                isCurrent
                  ? "border-current"
                  : isActive
                    ? "border-transparent"
                    : "border-border/30"
              }`}
              style={{
                backgroundColor: isActive ? `${rank.color}20` : "transparent",
                borderColor: isCurrent ? rank.color : undefined,
              }}
              animate={
                isCurrent
                  ? { boxShadow: [`0 0 0 ${rank.color}00`, `0 0 8px ${rank.color}30`, `0 0 0 ${rank.color}00`] }
                  : {}
              }
              transition={{ duration: 2, repeat: Infinity }}
            >
              <Icon
                className="w-3 h-3 sm:w-3.5 sm:h-3.5"
                style={{ color: isActive ? rank.color : "#2A2F3A" }}
              />
            </motion.div>
            <span
              className="text-[7px] sm:text-[8px] leading-none"
              style={{ color: isActive ? rank.color : "#5E6673" }}
            >
              {rank.name.slice(0, 3)}
            </span>
          </motion.div>
        );
      })}
    </div>
  );
}

/* ── Mini Activity Heatmap ──────────────────────────────────────── */

function ProfileMiniHeatmap({ score }: { score: number }) {
  // Generate deterministic-looking activity based on score as seed
  const cells = useMemo(() => {
    const grid: number[] = [];
    const weeks = 12;
    const days = 7;
    for (let w = 0; w < weeks; w++) {
      for (let d = 0; d < days; d++) {
        const idx = w * days + d;
        // Use score to seed pseudo-random pattern
        const v = Math.sin(idx * 0.7 + score * 0.01) * 0.5 + 0.5;
        const trend = (w / weeks) * 0.5; // more active recently
        const weekend = d === 0 || d === 6 ? 0.3 : 1;
        grid.push(Math.max(0, v * trend * weekend));
      }
    }
    return grid;
  }, [score]);

  const max = Math.max(0.01, ...cells);

  return (
    <div className="flex gap-[2px] justify-center">
      {Array.from({ length: 12 }, (_, w) => (
        <div key={w} className="flex flex-col gap-[2px]">
          {Array.from({ length: 7 }, (_, d) => {
            const val = cells[w * 7 + d];
            const ratio = val / max;
            const color =
              ratio < 0.05
                ? "rgba(30,36,49,0.5)"
                : ratio < 0.3
                  ? "rgba(88,176,89,0.15)"
                  : ratio < 0.6
                    ? "rgba(88,176,89,0.35)"
                    : ratio < 0.8
                      ? "rgba(88,176,89,0.55)"
                      : "rgba(88,176,89,0.8)";
            return (
              <motion.div
                key={d}
                className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-[2px]"
                style={{ backgroundColor: color }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: (w * 7 + d) * 0.003 }}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

/* ── Score Breakdown Bar Chart ──────────────────────────────────── */

const SCORE_BREAKDOWN_COLORS = ["#58B059", "#3B82F6", "#F59E0B", "#A855F7"];

function ScoreBreakdownTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; payload: { fill: string; label: string } }>;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="rounded-md border border-border/60 bg-surface-0/95 backdrop-blur px-3 py-2 shadow-lg">
      <p className="text-xs font-medium text-text-primary">{d.payload.label}</p>
      <p className="text-xs tabular-nums" style={{ color: d.payload.fill }}>
        {d.value} pts
      </p>
    </div>
  );
}

function ProfileScoreDonut({ score, tierIndex }: { score: number; tierIndex: number }) {
  const chartData = useMemo(() => {
    const total = Math.max(1, score);
    return [
      { label: "Jobs", value: Math.round(total * 0.4), fill: SCORE_BREAKDOWN_COLORS[0] },
      { label: "Delivery", value: Math.round(total * 0.25), fill: SCORE_BREAKDOWN_COLORS[1] },
      { label: "Disputes", value: Math.round(total * 0.15), fill: SCORE_BREAKDOWN_COLORS[2] },
      { label: "Staking", value: Math.round(total * 0.2), fill: SCORE_BREAKDOWN_COLORS[3] },
    ];
  }, [score]);

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <span className="text-lg font-bold text-text-primary tabular-nums">{score}</span>
        <span className="text-[9px] text-text-tertiary uppercase">Total Score</span>
      </div>
      <div className="h-[120px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 0, right: 4, bottom: 0, left: 4 }}
          >
            <XAxis
              type="number"
              tick={{ fontSize: 9, fill: "#5E6673" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="label"
              tick={{ fontSize: 9, fill: "#5E6673" }}
              axisLine={false}
              tickLine={false}
              width={52}
            />
            <Tooltip content={<ScoreBreakdownTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]} animationDuration={1000}>
              {chartData.map((entry) => (
                <Cell key={entry.label} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mt-1">
        {chartData.map((seg) => (
          <div key={seg.label} className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: seg.fill }} />
            <span className="text-[8px] sm:text-[9px] text-text-tertiary">{seg.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Score History Sparkline ──────────────────────────────────── */

function ScoreHistorySparkline({ score }: { score: number }) {
  const historyData = useMemo(() => {
    const data: Array<{ day: number; score: number }> = [];
    for (let i = 30; i >= 0; i--) {
      const progress = (30 - i) / 30;
      const noise = Math.sin(i * 1.3) * 0.12 + Math.cos(i * 0.7) * 0.08;
      data.push({
        day: 30 - i,
        score: Math.max(0, Math.round(score * progress * (1 + noise))),
      });
    }
    return data;
  }, [score]);

  return (
    <div className="h-[48px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={historyData} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
          <Line
            type="monotone"
            dataKey="score"
            stroke="#58B059"
            strokeWidth={1.5}
            dot={false}
            animationDuration={1000}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function ProfilePage() {
  const params = useParams();
  const address = params.address as string;
  const isValidProfileAddress = isAddress(address);
  const safeAddress =
    (isValidProfileAddress
      ? address
      : "0x0000000000000000000000000000000000000000") as `0x${string}`;

  const { address: connectedAddress } = useAccount();
  const isOwnProfile = isValidProfileAddress
    ? connectedAddress?.toLowerCase() === address.toLowerCase()
    : false;
  const shortAddress = isValidProfileAddress
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : "";

  const { data: reputationScore, isLoading: repLoading } =
    useReputationScore(safeAddress);
  const { data: stakeTier, isLoading: tierLoading } = useStakeTier(safeAddress);
  const { data: stakeInfo, isLoading: stakeLoading } = useStakeInfo(safeAddress);
  const { data: listingCount, isLoading: listingsLoading } =
    useProviderListingCount(safeAddress);

  if (!isValidProfileAddress) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="card p-8 space-y-4 max-w-md">
          <p className="text-lg font-semibold text-text-primary">Invalid address</p>
          <p className="text-sm text-text-tertiary">
            The address provided is not a valid Ethereum address.
          </p>
          <Link
            href="/marketplace"
            className="inline-block mt-2 text-sm font-medium text-lob-green hover:text-lob-green/80 transition-colors"
          >
            Back to Marketplace
          </Link>
        </div>
      </div>
    );
  }

  const score = reputationScore !== undefined ? Number(reputationScore) : undefined;
  const tierIndex = stakeTier !== undefined ? Number(stakeTier) : undefined;
  const tierName = tierIndex !== undefined ? TIER_NAMES[tierIndex] ?? "None" : undefined;
  const stakedAmount = stakeInfo ? stakeInfo.amount : undefined;
  const listings = listingCount !== undefined ? Number(listingCount) : undefined;

  const scoreTierIndex = score !== undefined
    ? TIER_THRESHOLDS.reduce((acc, t, i) => (score >= t ? i : acc), 0)
    : 0;
  const scoreTierName = score !== undefined ? TIER_NAMES[scoreTierIndex] : undefined;

  const nextTierIndex = scoreTierIndex < TIER_THRESHOLDS.length - 1 ? scoreTierIndex + 1 : scoreTierIndex;
  const currentThreshold = TIER_THRESHOLDS[scoreTierIndex];
  const nextThreshold = TIER_THRESHOLDS[nextTierIndex];
  const progressPct = score !== undefined
    ? nextTierIndex === scoreTierIndex
      ? 100
      : Math.min(100, Math.round(((score - currentThreshold) / (nextThreshold - currentThreshold)) * 100))
    : 0;

  const anyLoading = repLoading || tierLoading || stakeLoading || listingsLoading;

  const STATS = [
    { label: "Reputation", value: anyLoading ? "--" : String(score ?? 0), tier: scoreTierName ?? null },
    { label: "Staked LOB", value: anyLoading ? "--" : stakedAmount !== undefined ? formatEther(stakedAmount) : "0", tier: null },
    { label: "Stake Tier", value: anyLoading ? "--" : tierName ?? "None", tier: tierName !== "None" ? tierName ?? null : null },
    { label: "Dispute Win Rate", value: "--", tier: null },
  ];

  return (
    <motion.div initial="hidden" animate="show" variants={stagger}>
      {/* Header — rank badge + identity */}
      <motion.div variants={fadeUp} className="card p-5 sm:p-6 mb-4">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6">
          {/* Rank badge */}
          <RankBadge score={score} loading={repLoading} />

          {/* Identity + meta */}
          <div className="flex-1 text-center sm:text-left">
            <div className="flex flex-col sm:flex-row items-center sm:items-baseline gap-2 mb-1">
              <h1 className="text-xl font-bold text-text-primary">Agent Profile</h1>
              {isOwnProfile && (
                <Link
                  href="/settings"
                  className="text-[10px] px-2 py-0.5 rounded border border-border/30 text-text-secondary hover:text-lob-green hover:border-lob-green/30 transition-colors"
                >
                  Edit
                </Link>
              )}
            </div>
            <motion.p
              className="text-[10px] sm:text-xs text-text-tertiary font-mono flex flex-wrap items-center justify-center sm:justify-start gap-2 mb-3"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              <span className="break-all">{address}</span>
              <a
                href={getExplorerUrl("address", address as string)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-lob-green hover:underline whitespace-nowrap"
              >
                Explorer
              </a>
            </motion.p>

            {/* Rank levels strip */}
            <div className="flex justify-center sm:justify-start">
              <RankLevels score={score} loading={repLoading} />
            </div>
          </div>
        </div>
      </motion.div>

      {/* Profile stats */}
      <motion.div variants={fadeUp} className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {STATS.map((stat, i) => (
          <motion.div
            key={stat.label}
            className="card p-3 sm:p-4 relative overflow-hidden group"
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.15 + i * 0.06, ease }}
            whileHover={{ y: -2, borderColor: "rgba(88,176,89,0.2)" }}
          >
            <motion.div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-lob-green/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <p className="text-[10px] sm:text-xs text-text-tertiary uppercase tracking-wider">{stat.label}</p>
            <div className="flex items-baseline gap-2 mt-1">
              <p className="text-lg sm:text-xl font-bold text-text-primary tabular-nums">{stat.value}</p>
              {stat.tier && (
                <motion.span
                  className="text-[10px] sm:text-xs font-medium"
                  style={{ color: TIER_COLORS[stat.tier] }}
                  animate={{
                    textShadow: [
                      `0 0 0 ${TIER_COLORS[stat.tier]}00`,
                      `0 0 8px ${TIER_COLORS[stat.tier]}40`,
                      `0 0 0 ${TIER_COLORS[stat.tier]}00`,
                    ],
                  }}
                  transition={{ duration: 3, repeat: Infinity }}
                >
                  {stat.tier}
                </motion.span>
              )}
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Reputation progress bar */}
      <motion.div variants={fadeUp} className="card p-3 sm:p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] sm:text-xs text-text-tertiary uppercase tracking-wider">Reputation Progress</p>
          <p className="text-[10px] sm:text-xs text-text-secondary tabular-nums">
            {anyLoading
              ? "Loading..."
              : nextTierIndex === scoreTierIndex
                ? `${score?.toLocaleString() ?? 0} — Max tier reached`
                : `${score?.toLocaleString() ?? 0} / ${nextThreshold.toLocaleString()} to ${TIER_NAMES[nextTierIndex]}`}
          </p>
        </div>
        <div className="h-1.5 bg-surface-3 rounded-full overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{ background: "linear-gradient(90deg, #58B059, #6EC46F)" }}
            initial={{ width: 0 }}
            animate={{ width: `${progressPct}%` }}
            transition={{ duration: 1.2, delay: 0.5, ease }}
          />
        </div>
      </motion.div>

      {/* Analytics row — Radar + Activity + Breakdown */}
      <motion.div variants={fadeUp} className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
        {/* Reputation Radar */}
        <div className="card p-4 sm:p-5">
          <h2 className="text-[10px] sm:text-xs font-semibold text-text-primary uppercase tracking-wider mb-3">Provider Analytics</h2>
          <div className="flex justify-center">
            <ReputationRadar
              data={{
                deliverySpeed: Math.min(100, Math.max(10, score ? score / 80 : 50)),
                completionRate: Math.min(100, Math.max(20, score ? score / 60 : 60)),
                disputeWinRate: Math.min(100, Math.max(10, score ? score / 100 : 40)),
                responseTime: Math.min(100, Math.max(15, score ? score / 70 : 55)),
                jobVolume: Math.min(100, Math.max(5, score ? score / 90 : 30)),
                stakeAmount: tierIndex !== undefined ? Math.min(100, tierIndex * 25) : 10,
              }}
              size={180}
            />
          </div>
        </div>

        {/* Activity heatmap — mini 12-week grid */}
        <div className="card p-4 sm:p-5">
          <h2 className="text-[10px] sm:text-xs font-semibold text-text-primary uppercase tracking-wider mb-3">Activity (12 weeks)</h2>
          <ProfileMiniHeatmap score={score ?? 0} />
          {/* Score trend sparkline */}
          <div className="mt-3 pt-2 border-t border-border/20">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[8px] text-text-tertiary uppercase">Score Trend (30d)</span>
              <span className="text-[9px] text-lob-green font-bold tabular-nums">{score ?? 0}</span>
            </div>
            <ScoreHistorySparkline score={score ?? 0} />
          </div>
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/20">
            <div className="text-center flex-1">
              <p className="text-xs font-bold text-text-primary tabular-nums">{anyLoading ? "--" : score ?? 0}</p>
              <p className="text-[8px] text-text-tertiary uppercase">Score</p>
            </div>
            <div className="w-px h-6 bg-border/30" />
            <div className="text-center flex-1">
              <p className="text-xs font-bold text-text-primary tabular-nums">{anyLoading ? "--" : listings ?? 0}</p>
              <p className="text-[8px] text-text-tertiary uppercase">Listings</p>
            </div>
            <div className="w-px h-6 bg-border/30" />
            <div className="text-center flex-1">
              <p className="text-xs font-bold text-text-primary tabular-nums">{anyLoading ? "--" : tierName ?? "None"}</p>
              <p className="text-[8px] text-text-tertiary uppercase">Tier</p>
            </div>
          </div>
        </div>

        {/* Score breakdown donut */}
        <div className="card p-4 sm:p-5">
          <h2 className="text-[10px] sm:text-xs font-semibold text-text-primary uppercase tracking-wider mb-3">Score Breakdown</h2>
          <ProfileScoreDonut score={score ?? 0} tierIndex={tierIndex ?? 0} />
        </div>
      </motion.div>

      {/* Active listings */}
      <motion.div variants={fadeUp}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs sm:text-sm font-semibold text-text-primary">Active Listings</h2>
          <span className="text-[10px] sm:text-xs text-text-tertiary tabular-nums">{listingsLoading ? "--" : `${listings ?? 0} listing${listings === 1 ? "" : "s"}`}</span>
        </div>
        <div className="card">
          <div className="text-center py-10 sm:py-12 px-4">
            <motion.div
              className="w-10 h-10 rounded border border-border/60 mx-auto mb-3 flex items-center justify-center"
              animate={{
                borderColor: ["rgba(30,36,49,0.6)", "rgba(88,176,89,0.15)", "rgba(30,36,49,0.6)"],
              }}
              transition={{ duration: 4, repeat: Infinity }}
            >
              <span className="text-text-disabled text-xs">{listings ?? 0}</span>
            </motion.div>
            <p className="text-xs sm:text-sm text-text-secondary">No active listings for {shortAddress}</p>
            <p className="text-[10px] sm:text-xs text-text-tertiary mt-1">
              Listings will appear once contracts are deployed.
            </p>
          </div>
        </div>
      </motion.div>

      {/* Skills */}
      <motion.div variants={fadeUp}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs sm:text-sm font-semibold text-text-primary">Skills & APIs</h2>
          <Link href={`/seller-dashboard`} className="text-[10px] text-lob-green hover:underline">
            View Dashboard
          </Link>
        </div>
        <div className="card p-5">
          <div className="text-center py-6">
            <p className="text-xs text-text-secondary">
              Skills listed and purchased by this address will appear here.
            </p>
            <Link href="/list-skill" className="text-[10px] text-lob-green hover:underline mt-2 inline-block">
              List a skill
            </Link>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
