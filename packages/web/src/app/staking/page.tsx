"use client";

import { useState, useMemo } from "react";
import { useAccount } from "wagmi";
import { formatEther, parseEther, type Address } from "viem";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { motion, AnimatePresence } from "framer-motion";
import { stagger, fadeUp, ease } from "@/lib/motion";
import {
  useStakeInfo,
  useStakeTier,
  useLOBBalance,
  useApproveAndStake,
  useRequestUnstake,
  useUnstake,
  useArbitratorInfo,
  useUnstakeAsArbitrator,
} from "@/lib/hooks";
import {
  useStakingEarned as useStakingRewardsEarned,
  useEffectiveBalance,
  useRewardTokens,
  useSyncStake,
  useClaimStakingRewards,
} from "@/lib/useStakingRewards";
import { getContracts, CHAIN } from "@/config/contracts";
import StakingTierVisualizer from "@/components/StakingTierVisualizer";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  RadialBarChart,
  RadialBar,
} from "recharts";
import {
  Store,
  Scale,
  Shield,
  Users,
  Lock,
  Unlock,
  Info,
  CheckCircle2,
  XCircle,
  Coins,
  TrendingUp,
  Clock,
  Zap,
  Gift,
  RefreshCw,
  Loader2,
} from "lucide-react";

type Section = "seller" | "arbitrator" | "moderator";

const TIERS = [
  { name: "Bronze", stake: "100", listings: "3", boost: "1x", color: "#CD7F32" },
  { name: "Silver", stake: "1,000", listings: "10", boost: "2x", color: "#848E9C" },
  { name: "Gold", stake: "10,000", listings: "25", boost: "5x", color: "#F0B90B" },
  { name: "Platinum", stake: "100,000", listings: "\u221E", boost: "10x", color: "#58B059" },
];

const ARB_TIERS = [
  { name: "Junior", stake: "5,000 LOB", maxDispute: "500 LOB", fee: "5%", reward: "1x", color: "#CD7F32" },
  { name: "Senior", stake: "25,000 LOB", maxDispute: "5,000 LOB", fee: "4%", reward: "1.5x", color: "#848E9C" },
  { name: "Principal", stake: "100,000 LOB", maxDispute: "Unlimited", fee: "3%", reward: "2x", color: "#58B059" },
];

const TAB_ICONS: Record<Section, typeof Store> = {
  seller: Store,
  arbitrator: Scale,
  moderator: Shield,
};

const TAB_COLORS: Record<Section, string> = {
  seller: "#58B059",
  arbitrator: "#A855F7",
  moderator: "#60A5FA",
};

const TIER_NAMES = ["None", "Bronze", "Silver", "Gold", "Platinum"];
const TIER_COLORS: Record<string, string> = {
  None: "#5E6673",
  Bronze: "#CD7F32",
  Silver: "#848E9C",
  Gold: "#F0B90B",
  Platinum: "#58B059",
};

// Tier boost multipliers for StakingRewards effective balance
const TIER_BOOST_MULTIPLIERS: Record<string, string> = {
  None: "1x",
  Bronze: "1.25x",
  Silver: "1.5x",
  Gold: "2x",
  Platinum: "3x",
};

const ARB_RANK_NAMES = ["None", "Junior", "Senior", "Principal"];

const SUBTOPICS = ["General", "Marketplace", "Protocol", "Governance", "Off-Topic"];
const AVAILABILITY = ["< 1hr/day", "1-3 hrs/day", "3+ hrs/day"];

const ELIGIBILITY = [
  { label: "Min 1,000 LOB staked (seller pool)", pass: true },
  { label: "Account age 30+ days", pass: true },
  { label: "100+ forum karma", pass: false },
  { label: "No active disputes", pass: true },
];

const PERKS = [
  "Verified Mod badge on profile",
  "500 LOB monthly reward (governance-voted)",
  "Mod-only discussion channel",
  "Priority dispute escalation",
];

/* ──── Tier Progress Donut ──── */
function TierProgressDonut({
  currentTier,
  stakedAmount,
  tierProgress,
  lobToNextTier,
}: {
  currentTier: number;
  stakedAmount: bigint;
  tierProgress: number;
  lobToNextTier: string;
}) {
  const tiers = [
    { name: "None", threshold: 0, color: "#5E6673" },
    { name: "Bronze", threshold: 100, color: "#CD7F32" },
    { name: "Silver", threshold: 1000, color: "#848E9C" },
    { name: "Gold", threshold: 10000, color: "#F0B90B" },
    { name: "Platinum", threshold: 100000, color: "#58B059" },
  ];

  const current = tiers[currentTier] ?? tiers[0];
  const next = tiers[Math.min(currentTier + 1, 4)];
  const clampedProgress = Math.max(0, Math.min(100, tierProgress));

  // Donut data: filled portion vs remaining
  const donutData = [
    { name: "Progress", value: clampedProgress, fill: next.color },
    { name: "Remaining", value: 100 - clampedProgress, fill: "#1E2431" },
  ];

  // Radial bar for tier overview
  const radialData = tiers.slice(1).map((t, i) => ({
    name: t.name,
    value: i + 1 <= currentTier ? 100 : i + 1 === currentTier + 1 ? clampedProgress : 0,
    fill: t.color,
  }));

  return (
    <div className="card p-3 sm:p-5">
      <h3 className="text-[10px] sm:text-xs font-semibold text-text-primary uppercase tracking-wider mb-3">
        Tier Progress
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
        {/* Donut chart */}
        <div className="relative" style={{ height: 140 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={donutData}
                cx="50%"
                cy="50%"
                innerRadius={42}
                outerRadius={58}
                dataKey="value"
                startAngle={90}
                endAngle={-270}
                stroke="none"
              >
                {donutData.map((entry, idx) => (
                  <Cell key={idx} fill={entry.fill} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          {/* Center label */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-sm font-bold" style={{ color: current.color }}>
              {current.name}
            </span>
            <span className="text-[9px] text-text-tertiary">
              {currentTier >= 4 ? "Max Tier" : `${clampedProgress}%`}
            </span>
          </div>
        </div>

        {/* Tier overview radial bars */}
        <div className="relative" style={{ height: 140 }}>
          <ResponsiveContainer width="100%" height="100%">
            <RadialBarChart
              cx="50%"
              cy="50%"
              innerRadius={20}
              outerRadius={65}
              barSize={8}
              data={radialData}
              startAngle={180}
              endAngle={-180}
            >
              <RadialBar
                dataKey="value"
                background={{ fill: "#1E2431" }}
                cornerRadius={4}
              />
            </RadialBarChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-[10px] font-bold text-text-primary">
              {currentTier}/4
            </span>
            <span className="text-[8px] text-text-tertiary">Tiers</span>
          </div>
        </div>
      </div>

      {/* Next tier info */}
      <div className="mt-3 pt-3 border-t border-border/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {currentTier < 4 && (
              <>
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: next.color }} />
                <span className="text-[10px] text-text-secondary">
                  Next: <span className="font-medium" style={{ color: next.color }}>{next.name}</span>
                </span>
              </>
            )}
            {currentTier >= 4 && (
              <span className="text-[10px] text-lob-green font-medium">Maximum tier reached</span>
            )}
          </div>
          <span className="text-[10px] text-text-tertiary tabular-nums">{lobToNextTier}</span>
        </div>
      </div>
    </div>
  );
}

/* ──── Staking Rewards Section ──── */
function StakingRewardsSection({
  address,
  tierName,
  tierColor,
}: {
  address: Address;
  tierName: string;
  tierColor: string;
}) {
  const { data: rewardTokens } = useRewardTokens();
  const { data: effectiveBalance } = useEffectiveBalance(address);
  const syncStake = useSyncStake();
  const { fn: claimRewards, isPending: claimPending, reset: claimReset } = useClaimStakingRewards();
  const contracts = getContracts(CHAIN.id);

  const [syncPending, setSyncPending] = useState(false);

  const tokens = (rewardTokens as Address[]) ?? [];
  const effectiveBal = effectiveBalance ? formatEther(effectiveBalance as bigint) : "0";
  const effectiveBalNum = parseFloat(effectiveBal);
  const boostMultiplier = TIER_BOOST_MULTIPLIERS[tierName] ?? "1x";

  const handleSync = () => {
    setSyncPending(true);
    try {
      syncStake();
    } finally {
      // Reset after a brief delay (fire-and-forget write)
      setTimeout(() => setSyncPending(false), 3000);
    }
  };

  const handleClaim = async (token: Address) => {
    claimReset();
    try {
      await claimRewards(token);
    } catch {
      // Error handled by hook
    }
  };

  return (
    <motion.div variants={fadeUp} className="mt-6">
      <div className="card p-3 sm:p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[10px] sm:text-xs font-semibold text-text-primary uppercase tracking-wider flex items-center gap-2">
            <Gift className="w-4 h-4 text-lob-green" />
            Staking Rewards
          </h3>
          <span
            className="text-[10px] font-medium px-2 py-0.5 rounded"
            style={{
              color: tierColor,
              backgroundColor: `${tierColor}15`,
              border: `1px solid ${tierColor}25`,
            }}
          >
            {boostMultiplier} Boost
          </span>
        </div>

        {/* Effective balance + tier boost */}
        <div className="rounded-lg border border-border/40 bg-surface-1/30 p-4 mb-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Effective Balance</p>
              <p className="text-sm font-bold text-text-primary mt-0.5 tabular-nums">
                {effectiveBalNum.toLocaleString("en-US", { maximumFractionDigits: 2 })} LOB
              </p>
              <p className="text-[9px] text-text-tertiary mt-0.5">
                Raw stake * tier multiplier
              </p>
            </div>
            <div>
              <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Tier Boost</p>
              <p className="text-sm font-bold mt-0.5" style={{ color: tierColor }}>
                {boostMultiplier}
              </p>
              <p className="text-[9px] text-text-tertiary mt-0.5">
                {tierName} tier
              </p>
            </div>
            <div>
              <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Reward Tokens</p>
              <p className="text-sm font-bold text-text-primary mt-0.5 tabular-nums">
                {tokens.length}
              </p>
              <p className="text-[9px] text-text-tertiary mt-0.5">
                active reward streams
              </p>
            </div>
          </div>
        </div>

        {/* Tier boost breakdown */}
        <div className="mb-4">
          <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-2">
            Boost Multipliers by Tier
          </p>
          <div className="flex gap-2 flex-wrap">
            {(["None", "Bronze", "Silver", "Gold", "Platinum"] as const).map((t) => {
              const isActive = t === tierName;
              const color = TIER_COLORS[t] ?? "#5E6673";
              return (
                <div
                  key={t}
                  className={`rounded-md px-2 py-1 text-[10px] font-medium border transition-colors ${
                    isActive
                      ? "border-opacity-40"
                      : "border-border/30 opacity-50"
                  }`}
                  style={
                    isActive
                      ? { color, backgroundColor: `${color}10`, borderColor: `${color}40` }
                      : {}
                  }
                >
                  {t}: {TIER_BOOST_MULTIPLIERS[t]}
                </div>
              );
            })}
          </div>
        </div>

        {/* Reward tokens list */}
        {tokens.length > 0 ? (
          <div className="space-y-2 mb-4">
            <p className="text-[10px] text-text-tertiary uppercase tracking-wider">
              Claimable Rewards
            </p>
            {tokens.map((token) => (
              <RewardTokenRow
                key={token}
                token={token}
                address={address}
                onClaim={handleClaim}
                claimPending={claimPending}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-border/30 bg-surface-1/20 p-4 text-center mb-4">
            <Coins className="w-5 h-5 text-text-tertiary mx-auto mb-2" />
            <p className="text-xs text-text-secondary">No reward tokens configured yet</p>
            <p className="text-[10px] text-text-tertiary mt-0.5">
              Rewards will appear here once the protocol distributes staking incentives.
            </p>
          </div>
        )}

        {/* Sync stake button */}
        <div className="pt-3 border-t border-border/30">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-text-primary">Sync Stake</p>
              <p className="text-[10px] text-text-tertiary">
                Update your effective balance after a tier change or stake adjustment.
              </p>
            </div>
            <motion.button
              className="btn-secondary text-xs disabled:opacity-50 flex items-center gap-1.5"
              whileTap={syncPending ? undefined : { scale: 0.97 }}
              disabled={syncPending}
              onClick={handleSync}
            >
              {syncPending ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" /> Syncing...
                </>
              ) : (
                <>
                  <RefreshCw className="w-3 h-3" /> Sync Stake
                </>
              )}
            </motion.button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ──── Individual Reward Token Row ──── */
function RewardTokenRow({
  token,
  address,
  onClaim,
  claimPending,
}: {
  token: Address;
  address: Address;
  onClaim: (token: Address) => void;
  claimPending: boolean;
}) {
  const { data: earned } = useStakingRewardsEarned(address, token);
  const earnedAmt = earned ? (earned as bigint) : BigInt(0);
  const earnedFmt = formatEther(earnedAmt);
  const earnedNum = parseFloat(earnedFmt);
  const hasRewards = earnedAmt > BigInt(0);

  // Truncate token address for display
  const tokenLabel = `${token.slice(0, 6)}...${token.slice(-4)}`;

  return (
    <div className="flex items-center justify-between rounded-lg border border-border/30 bg-surface-1/20 px-3 py-2">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-md bg-lob-green/10 flex items-center justify-center">
          <Coins className="w-3 h-3 text-lob-green" />
        </div>
        <div>
          <p className="text-xs font-medium text-text-primary font-mono">{tokenLabel}</p>
          <p className="text-[10px] text-text-tertiary tabular-nums">
            {earnedNum.toLocaleString("en-US", { maximumFractionDigits: 4 })} earned
          </p>
        </div>
      </div>
      <motion.button
        className="btn-primary text-[10px] px-3 py-1 disabled:opacity-50"
        whileTap={claimPending ? undefined : { scale: 0.97 }}
        disabled={claimPending || !hasRewards}
        onClick={() => onClaim(token)}
      >
        {claimPending ? (
          <span className="flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" /> Claiming...
          </span>
        ) : "Claim"}
      </motion.button>
    </div>
  );
}

/* ──── Staking Pools Overview ──── */
function StakingOverview({
  sellerStake,
  arbStake,
  sellerTier,
  arbRank,
  lobBalance,
  rewardsPending,
}: {
  sellerStake: bigint;
  arbStake: bigint;
  sellerTier: string;
  arbRank: string;
  lobBalance: string;
  rewardsPending: string;
}) {
  const pools = [
    {
      label: "Seller Pool",
      contract: "StakingManager",
      staked: Number(formatEther(sellerStake)).toLocaleString(),
      tier: sellerTier,
      purpose: "Marketplace listings, search boost, moderator eligibility",
      icon: Store,
      color: "#58B059",
    },
    {
      label: "Arbitrator Pool",
      contract: "DisputeArbitration",
      staked: Number(formatEther(arbStake)).toLocaleString(),
      tier: arbRank,
      purpose: "Dispute resolution, arbitration fees, reward multiplier",
      icon: Scale,
      color: "#A855F7",
    },
  ];

  return (
    <div className="card p-3 sm:p-5 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <Info className="w-4 h-4 text-text-tertiary" />
        <h3 className="text-[10px] sm:text-xs font-semibold text-text-primary uppercase tracking-wider">
          Staking Pools Overview
        </h3>
      </div>

      <div className="rounded-lg border border-border/40 bg-surface-1/30 p-3 mb-5">
        <p className="text-[10px] sm:text-xs text-text-secondary leading-relaxed">
          LOBSTR has <span className="text-text-primary font-semibold">two separate staking pools</span>.
          Each pool locks LOB in a different contract for different purposes.
          You cannot use the same LOB for both. Moderator eligibility is tied to seller staking (1K+ LOB).
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {pools.map((pool, i) => {
          const Icon = pool.icon;
          return (
            <motion.div
              key={pool.label}
              className="rounded-lg border p-4 relative overflow-hidden group"
              style={{ borderColor: `${pool.color}20` }}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 + i * 0.08, ease }}
              whileHover={{ y: -2, borderColor: `${pool.color}35` }}
            >
              <motion.div
                className="absolute top-0 left-0 right-0 h-px opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: `linear-gradient(to right, transparent, ${pool.color}30, transparent)` }}
              />
              <div className="flex items-center gap-2 mb-3">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `${pool.color}15` }}
                >
                  <Icon className="w-4 h-4" style={{ color: pool.color }} />
                </div>
                <div>
                  <p className="text-sm font-bold text-text-primary">{pool.label}</p>
                  <p className="text-[9px] text-text-tertiary font-mono">{pool.contract}</p>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-[10px] text-text-tertiary">Staked</span>
                  <span className="text-xs font-bold text-text-primary tabular-nums">{pool.staked} LOB</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[10px] text-text-tertiary">Tier</span>
                  <span className="text-xs font-semibold" style={{ color: pool.color }}>{pool.tier}</span>
                </div>
              </div>
              <p className="text-[9px] text-text-tertiary mt-3 leading-relaxed">{pool.purpose}</p>
            </motion.div>
          );
        })}
      </div>

      {/* Total summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-border/30">
        <div className="text-center">
          <p className="text-[9px] text-text-tertiary uppercase tracking-wider">Total Staked</p>
          <p className="text-sm font-bold text-text-primary tabular-nums mt-0.5">
            {Number(formatEther(sellerStake + arbStake)).toLocaleString()} LOB
          </p>
        </div>
        <div className="text-center">
          <p className="text-[9px] text-text-tertiary uppercase tracking-wider">Available</p>
          <p className="text-sm font-bold text-text-primary tabular-nums mt-0.5">{lobBalance} LOB</p>
        </div>
        <div className="text-center">
          <p className="text-[9px] text-text-tertiary uppercase tracking-wider">Rewards Pending</p>
          <p className="text-sm font-bold text-lob-green tabular-nums mt-0.5">{rewardsPending} LOB</p>
        </div>
        <div className="text-center">
          <p className="text-[9px] text-text-tertiary uppercase tracking-wider">Mod Eligible</p>
          <p className="text-sm font-bold mt-0.5">
            {sellerStake >= parseEther("1000") ? (
              <span className="text-lob-green">Yes</span>
            ) : (
              <span className="text-text-tertiary">No</span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ──── Main Page ──── */
export default function StakingPage() {
  const { isConnected, address } = useAccount();
  const { data: stakeData } = useStakeInfo(address);
  const { data: tierNum } = useStakeTier(address);
  const { data: lobBalance } = useLOBBalance(address);
  const { approve, stake, isPending: txPending, isError: txError, error: txErrorObj, reset: txReset } = useApproveAndStake();
  const { requestUnstake, isPending: reqUnstakePending, isError: reqUnstakeError, error: reqUnstakeErrorObj, reset: reqUnstakeReset } = useRequestUnstake();
  const { unstake, isPending: unstakePending, isError: unstakeError, error: unstakeErrorObj, reset: unstakeReset } = useUnstake();
  const { unstakeAsArbitrator, isPending: arbUnstakePending, reset: arbUnstakeReset } = useUnstakeAsArbitrator();
  const { data: arbData } = useArbitratorInfo(address);

  // StakingRewards hooks
  const { data: rewardTokens } = useRewardTokens();
  const { data: effectiveBalance } = useEffectiveBalance(address);

  // Derived values from contract data
  const stakedAmount = stakeData ? stakeData.amount : BigInt(0);
  const cooldownEnd = stakeData ? stakeData.unstakeRequestTime : BigInt(0);
  const pendingUnstakeAmount = stakeData ? stakeData.unstakeRequestAmount : BigInt(0);
  const hasPendingUnstake = pendingUnstakeAmount > BigInt(0);
  const cooldownReady = cooldownEnd > BigInt(0) && BigInt(Math.floor(Date.now() / 1000)) >= cooldownEnd;
  const currentTier = tierNum !== undefined ? tierNum : 0;
  const tierName = TIER_NAMES[currentTier] ?? "None";
  const tierColor = TIER_COLORS[tierName] ?? "#5E6673";

  const arbIsActive = arbData ? arbData.active : false;
  const arbTier = arbData ? arbData.rank : 0;
  const arbStake = arbData ? arbData.stake : BigInt(0);
  const arbCasesHandled = arbData ? arbData.disputesHandled : BigInt(0);
  const arbMajorityRate = arbData ? arbData.majorityVotes : BigInt(0);

  // Format a bigint LOB value for display (no trailing zeros)
  const fmtLob = (val: bigint) => {
    const raw = formatEther(val);
    const num = parseFloat(raw);
    return num.toLocaleString("en-US", { maximumFractionDigits: 2 });
  };

  // Cooldown display
  const cooldownDisplay = (() => {
    if (cooldownEnd === BigInt(0)) return "None";
    const endMs = Number(cooldownEnd) * 1000;
    const now = Date.now();
    if (endMs <= now) return "Ready";
    const diffSec = Math.floor((endMs - now) / 1000);
    const days = Math.floor(diffSec / 86400);
    const hours = Math.floor((diffSec % 86400) / 3600);
    if (days > 0) return `${days}d ${hours}h`;
    return `${hours}h`;
  })();

  // Tier progress: how far through the current tier toward the next one
  const TIER_THRESHOLDS = [BigInt(0), BigInt(100), BigInt(1000), BigInt(10000), BigInt(100000)];
  const nextTierIdx = Math.min(currentTier + 1, 4);
  const currentThreshold = parseEther(TIER_THRESHOLDS[currentTier].toString());
  const nextThreshold = parseEther(TIER_THRESHOLDS[nextTierIdx].toString());
  const tierProgress =
    currentTier >= 4
      ? 100
      : nextThreshold > currentThreshold
        ? Number(((stakedAmount - currentThreshold) * BigInt(100)) / (nextThreshold - currentThreshold))
        : 0;
  const lobToNextTier =
    currentTier >= 4 ? "Max" : `${fmtLob(nextThreshold - stakedAmount)} LOB to ${TIER_NAMES[nextTierIdx]}`;

  // Compute total pending rewards across all reward tokens
  // We'll display a placeholder since we can't call hooks in a loop easily
  // The actual per-token amounts are shown in the StakingRewardsSection
  const rewardsPendingDisplay = useMemo(() => {
    // We don't have a single "total rewards" query, so display "-- " if tokens exist
    const tokens = (rewardTokens as Address[]) ?? [];
    if (tokens.length === 0) return "0";
    return "--"; // individual amounts shown in rewards section
  }, [rewardTokens]);

  const [stakeAmount, setStakeAmount] = useState("");
  const [unstakeAmount, setUnstakeAmount] = useState("");
  const [arbStakeAmount, setArbStakeAmount] = useState("");
  const [activeSection, setActiveSection] = useState<Section>("seller");

  // Moderator form state
  const [showModForm, setShowModForm] = useState(false);
  const [modMotivation, setModMotivation] = useState("");
  const [modExperience, setModExperience] = useState("");
  const [modSubtopic, setModSubtopic] = useState("General");
  const [modAvailability, setModAvailability] = useState("1-3 hrs/day");
  const [modSubmitted, setModSubmitted] = useState(false);

  const lobBalanceFmt = lobBalance !== undefined ? fmtLob(lobBalance) : "\u2014";

  if (!isConnected) {
    return (
      <motion.div
        className="flex flex-col items-center justify-center min-h-[50vh] gap-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <motion.div
          className="w-16 h-16 rounded-full border border-border flex items-center justify-center"
          animate={{
            borderColor: ["rgba(30,36,49,1)", "rgba(88,176,89,0.4)", "rgba(30,36,49,1)"],
            boxShadow: [
              "0 0 0 rgba(88,176,89,0)",
              "0 0 30px rgba(88,176,89,0.08)",
              "0 0 0 rgba(88,176,89,0)",
            ],
          }}
          transition={{ duration: 3, repeat: Infinity }}
        >
          <Coins className="w-6 h-6 text-lob-green/60" />
        </motion.div>
        <h1 className="text-xl font-bold text-text-primary">Staking</h1>
        <p className="text-sm text-text-secondary">Connect your wallet to manage staking.</p>
        <ConnectButton />
      </motion.div>
    );
  }

  return (
    <motion.div initial="hidden" animate="show" variants={stagger}>
      <motion.div variants={fadeUp} className="mb-6">
        <h1 className="text-xl font-bold text-text-primary">Staking</h1>
        <p className="text-xs text-text-tertiary mt-0.5">
          Stake $LOB across separate pools to unlock marketplace listings, arbitrate disputes, or moderate the forum
        </p>
      </motion.div>

      {/* Pools overview */}
      <motion.div variants={fadeUp}>
        <StakingOverview
          sellerStake={stakedAmount}
          arbStake={arbStake}
          sellerTier={tierName}
          arbRank={ARB_RANK_NAMES[arbTier] ?? "None"}
          lobBalance={lobBalanceFmt}
          rewardsPending={rewardsPendingDisplay}
        />
      </motion.div>

      {/* Section toggle */}
      <motion.div variants={fadeUp} className="flex gap-0.5 mb-6 border-b border-border">
        {(["seller", "arbitrator", "moderator"] as const).map((section) => {
          const Icon = TAB_ICONS[section];
          return (
            <button
              key={section}
              onClick={() => setActiveSection(section)}
              className="relative px-4 py-2 text-sm font-medium -mb-px"
            >
              <motion.span
                animate={{ color: activeSection === section ? "#EAECEF" : "#5E6673" }}
                className="relative z-10 flex items-center gap-1.5"
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="capitalize hidden sm:inline">
                  {section === "seller" ? "Seller Staking" : section === "arbitrator" ? "Arbitrator Staking" : "Moderator"}
                </span>
                <span className="capitalize sm:hidden">
                  {section === "moderator" ? "Mod" : section[0].toUpperCase() + section.slice(1)}
                </span>
              </motion.span>
              {activeSection === section && (
                <motion.div
                  layoutId="stake-tab"
                  className="absolute bottom-0 left-0 right-0 h-0.5"
                  style={{ background: TAB_COLORS[section] }}
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
            </button>
          );
        })}
      </motion.div>

      <AnimatePresence mode="wait">
        {/* ── Seller Tab ── */}
        {activeSection === "seller" && (
          <motion.div
            key="seller"
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            transition={{ duration: 0.3, ease }}
            className="space-y-4"
          >
            {/* What this pool does */}
            <div className="rounded-lg border border-lob-green/15 bg-lob-green/[0.03] p-4">
              <div className="flex items-start gap-3">
                <Store className="w-4 h-4 text-lob-green mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-text-primary mb-1">Seller Staking Pool</p>
                  <p className="text-[10px] text-text-secondary leading-relaxed">
                    Stakes LOB into the <span className="font-mono text-text-tertiary">StakingManager</span> contract.
                    Unlocks marketplace listings, grants a search boost multiplier, and makes you eligible
                    for moderator status (1,000+ LOB). 7-day cooldown on unstaking. Can be slashed if you lose a dispute as a seller.
                  </p>
                </div>
              </div>
            </div>

            {/* Position card */}
            <div className="card p-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                <div>
                  <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Staked</p>
                  <p className="text-sm font-bold text-text-primary mt-0.5 tabular-nums">{fmtLob(stakedAmount)} LOB</p>
                </div>
                <div>
                  <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Tier</p>
                  <p className="text-sm font-bold mt-0.5" style={{ color: tierColor }}>{tierName}</p>
                </div>
                <div>
                  <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Cooldown</p>
                  <p className="text-sm font-bold text-text-primary mt-0.5">{cooldownDisplay}</p>
                </div>
                <div>
                  <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Mod Eligible</p>
                  <p className="text-sm font-bold mt-0.5">
                    {stakedAmount >= parseEther("1000") ? (
                      <span className="text-lob-green flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Yes</span>
                    ) : (
                      <span className="text-text-tertiary flex items-center gap-1"><XCircle className="w-3.5 h-3.5" /> No</span>
                    )}
                  </p>
                </div>
              </div>

              {/* Tier progress bar */}
              <div className="mt-4">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[10px] text-text-tertiary">
                    {currentTier >= 4 ? "Platinum (Max)" : `${tierName} \u2192 ${TIER_NAMES[nextTierIdx]}`}
                  </span>
                  <span className="text-[10px] text-text-tertiary tabular-nums">{lobToNextTier}</span>
                </div>
                <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-lob-green"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(0, Math.min(100, tierProgress))}%` }}
                    transition={{ duration: 0.8, ease }}
                  />
                </div>
              </div>
            </div>

            {/* Stake form */}
            <div className="card p-3 sm:p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-text-tertiary" />
                  Stake $LOB
                </h2>
                <span className="text-xs text-text-tertiary tabular-nums">
                  Available: {lobBalanceFmt} LOB
                </span>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="number"
                  value={stakeAmount}
                  onChange={(e) => setStakeAmount(e.target.value)}
                  placeholder="Amount to stake"
                  className="input-field flex-1 tabular-nums"
                />
                <motion.button
                  className="btn-primary disabled:opacity-50"
                  whileHover={txPending ? undefined : { boxShadow: "inset 0 1px 0 rgba(88,176,89,0.12), 0 4px 16px rgba(88,176,89,0.08)" }}
                  whileTap={txPending ? undefined : { scale: 0.97 }}
                  disabled={txPending || !stakeAmount}
                  onClick={async () => {
                    if (!stakeAmount) return;
                    txReset();
                    try {
                      const amt = parseEther(stakeAmount);
                      await approve(amt);
                      await stake(amt);
                      setStakeAmount("");
                    } catch {
                      // Error state handled via txError
                    }
                  }}
                >
                  {txPending ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                      Confirming...
                    </span>
                  ) : "Approve & Stake"}
                </motion.button>
              </div>
              {txError && (
                <p className="text-xs text-red-400 mt-2">
                  Transaction failed: {txErrorObj?.message?.includes("User rejected")
                    ? "Transaction rejected in wallet"
                    : "Something went wrong. Please try again."}
                </p>
              )}
              <p className="text-[10px] text-text-tertiary mt-2">
                7-day cooldown on unstaking. Minimum 100 LOB to activate listings.
              </p>
            </div>

            {/* Unstake form */}
            {stakedAmount > BigInt(0) && (
              <div className="card p-3 sm:p-5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
                    <Unlock className="w-3.5 h-3.5 text-text-tertiary" />
                    Unstake $LOB
                  </h2>
                  <span className="text-xs text-text-tertiary tabular-nums">
                    Staked: {fmtLob(stakedAmount)} LOB
                  </span>
                </div>

                {hasPendingUnstake ? (
                  <div className="space-y-3">
                    <div className="rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2">
                      <p className="text-xs text-amber-400 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        Pending unstake: {fmtLob(pendingUnstakeAmount)} LOB
                        {cooldownReady
                          ? " \u2014 Cooldown complete, ready to withdraw."
                          : ` \u2014 Cooldown: ${cooldownDisplay}`}
                      </p>
                    </div>
                    {cooldownReady && (
                      <motion.button
                        className="btn-primary disabled:opacity-50"
                        whileTap={unstakePending ? undefined : { scale: 0.97 }}
                        disabled={unstakePending}
                        onClick={async () => {
                          unstakeReset();
                          try {
                            await unstake();
                          } catch {
                            // Error handled via unstakeError
                          }
                        }}
                      >
                        {unstakePending ? (
                          <span className="flex items-center gap-2">
                            <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                            Withdrawing...
                          </span>
                        ) : "Withdraw LOB"}
                      </motion.button>
                    )}
                    {unstakeError && (
                      <p className="text-xs text-red-400">
                        {unstakeErrorObj?.message?.includes("User rejected")
                          ? "Transaction rejected in wallet"
                          : "Unstake failed. Please try again."}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="number"
                        value={unstakeAmount}
                        onChange={(e) => setUnstakeAmount(e.target.value)}
                        placeholder="Amount to unstake"
                        className="input-field flex-1 tabular-nums"
                      />
                      <motion.button
                        className="btn-secondary disabled:opacity-50"
                        whileTap={reqUnstakePending ? undefined : { scale: 0.97 }}
                        disabled={reqUnstakePending || !unstakeAmount}
                        onClick={async () => {
                          if (!unstakeAmount) return;
                          reqUnstakeReset();
                          try {
                            await requestUnstake(parseEther(unstakeAmount));
                            setUnstakeAmount("");
                          } catch {
                            // Error handled via reqUnstakeError
                          }
                        }}
                      >
                        {reqUnstakePending ? (
                          <span className="flex items-center gap-2">
                            <span className="w-4 h-4 border-2 border-text-tertiary/30 border-t-text-tertiary rounded-full animate-spin" />
                            Requesting...
                          </span>
                        ) : "Request Unstake"}
                      </motion.button>
                    </div>
                    {reqUnstakeError && (
                      <p className="text-xs text-red-400">
                        {reqUnstakeErrorObj?.message?.includes("User rejected")
                          ? "Transaction rejected in wallet"
                          : "Request failed. Please try again."}
                      </p>
                    )}
                    <p className="text-[10px] text-text-tertiary">
                      Starts a 7-day cooldown. After cooldown, return here to withdraw.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Tier progress donut */}
            <TierProgressDonut
              currentTier={currentTier}
              stakedAmount={stakedAmount}
              tierProgress={tierProgress}
              lobToNextTier={lobToNextTier}
            />

            {/* Tier visualizer — only shown when user has staked */}
            {stakedAmount > BigInt(0) && (
              <StakingTierVisualizer
                stakedAmount={Number(formatEther(stakedAmount))}
                currentTier={currentTier}
              />
            )}

            {/* Tier table */}
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <h3 className="text-[10px] sm:text-xs font-semibold text-text-primary uppercase tracking-wider">
                  Seller Tier Benefits
                </h3>
              </div>
              <div className="hidden sm:grid grid-cols-4 gap-4 px-4 py-2.5 text-[10px] font-medium text-text-tertiary uppercase tracking-wider border-b border-border/50">
                <div>Tier</div>
                <div>Stake Required</div>
                <div>Max Listings</div>
                <div>Search Boost</div>
              </div>
              {TIERS.map((tier, i) => (
                <motion.div
                  key={tier.name}
                  className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 px-4 py-3 text-sm border-b border-border/50 last:border-0 group hover:bg-surface-1 transition-colors"
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: 0.1 + i * 0.06, ease }}
                  whileHover={{ x: 4 }}
                >
                  <div className="flex items-center gap-2">
                    <motion.div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: tier.color }}
                      animate={{
                        boxShadow: [
                          `0 0 0 ${tier.color}00`,
                          `0 0 8px ${tier.color}40`,
                          `0 0 0 ${tier.color}00`,
                        ],
                      }}
                      transition={{ duration: 2, delay: i * 0.5, repeat: Infinity }}
                    />
                    <span className="text-text-primary font-medium">{tier.name}</span>
                  </div>
                  <div className="text-text-secondary tabular-nums">{tier.stake} LOB</div>
                  <div className="text-text-secondary tabular-nums">{tier.listings}</div>
                  <div className="text-text-secondary">{tier.boost}</div>
                </motion.div>
              ))}
            </div>

            {/* Staking Rewards section */}
            {address && (
              <StakingRewardsSection
                address={address}
                tierName={tierName}
                tierColor={tierColor}
              />
            )}
          </motion.div>
        )}

        {/* ── Arbitrator Tab ── */}
        {activeSection === "arbitrator" && (
          <motion.div
            key="arbitrator"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.3, ease }}
            className="space-y-4"
          >
            {/* What this pool does */}
            <div className="rounded-lg border border-purple-500/15 bg-purple-500/[0.03] p-4">
              <div className="flex items-start gap-3">
                <Scale className="w-4 h-4 text-purple-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-text-primary mb-1">Arbitrator Staking Pool</p>
                  <p className="text-[10px] text-text-secondary leading-relaxed">
                    Stakes LOB into the <span className="font-mono text-text-tertiary">DisputeArbitration</span> contract
                    (separate from seller staking). Qualifies you to review disputes, cast votes, and earn arbitration fees.
                    Higher tiers handle bigger disputes and earn higher reward multipliers.
                    No cooldown on unstaking, but you cannot unstake while assigned to active disputes.
                    Non-voters get 0.5% of their arbitrator stake slashed.
                  </p>
                </div>
              </div>
            </div>

            {/* Arbitrator stats */}
            <div className="card p-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                <div>
                  <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Status</p>
                  <p className={`text-sm font-bold mt-0.5 flex items-center gap-1 ${arbIsActive ? "text-lob-green" : "text-text-tertiary"}`}>
                    {arbIsActive ? <><Zap className="w-3.5 h-3.5" /> Active</> : "Inactive"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Arb Rank</p>
                  <p className="text-sm font-bold text-text-primary mt-0.5">
                    {ARB_RANK_NAMES[arbTier] ?? "None"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Cases Reviewed</p>
                  <p className="text-sm font-bold text-text-primary mt-0.5 tabular-nums">
                    {arbCasesHandled.toString()}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Majority Rate</p>
                  <p className="text-sm font-bold text-text-primary mt-0.5 tabular-nums">
                    {arbCasesHandled > BigInt(0) ? `${arbMajorityRate.toString()}%` : "\u2014"}
                  </p>
                </div>
              </div>
            </div>

            {/* How it works */}
            <div className="card p-3 sm:p-5">
              <h3 className="text-[10px] sm:text-xs font-semibold text-text-primary mb-4 uppercase tracking-wider">
                How It Works
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { step: 1, title: "Stake $LOB", desc: "Stake tokens into the arbitrator pool to qualify at your tier level", icon: Lock, color: "#A855F7" },
                  { step: 2, title: "Get Assigned", desc: "Cases matching your tier are randomly assigned to a panel of 3 arbitrators", icon: Users, color: "#3B82F6" },
                  { step: 3, title: "Vote & Earn", desc: "Review evidence, cast your vote, and earn fees if you're in the majority", icon: TrendingUp, color: "#58B059" },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <motion.div
                      key={item.step}
                      className="flex items-start gap-3"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, delay: item.step * 0.1 }}
                    >
                      <div
                        className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: `${item.color}15` }}
                      >
                        <Icon className="w-4 h-4" style={{ color: item.color }} />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-text-primary">{item.title}</p>
                        <p className="text-[10px] text-text-tertiary leading-relaxed">{item.desc}</p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>

            {/* Tier cards + stake form */}
            <div className="card p-3 sm:p-5 space-y-5">
              <div>
                <h2 className="text-sm font-semibold text-text-primary mb-1">
                  Arbitrator Tiers
                </h2>
                <p className="text-xs text-text-secondary">
                  Higher tiers handle larger disputes and earn bigger reward multipliers.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {ARB_TIERS.map((tier, i) => (
                  <motion.div
                    key={tier.name}
                    className="rounded-lg border p-4 relative overflow-hidden group"
                    style={{ borderColor: `${tier.color}20` }}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: i * 0.08, ease }}
                    whileHover={{ y: -2, borderColor: `${tier.color}40` }}
                  >
                    <motion.div
                      className="absolute top-0 left-0 right-0 h-px opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ background: `linear-gradient(to right, transparent, ${tier.color}30, transparent)` }}
                    />
                    <div className="flex items-center gap-2 mb-3">
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: `${tier.color}15` }}
                      >
                        <Shield className="w-3.5 h-3.5" style={{ color: tier.color }} />
                      </div>
                      <div>
                        <p className="text-sm font-bold" style={{ color: tier.color }}>{tier.name}</p>
                      </div>
                    </div>
                    <div className="space-y-1.5 text-[10px]">
                      <div className="flex justify-between">
                        <span className="text-text-tertiary">Min Stake</span>
                        <span className="text-text-secondary font-medium tabular-nums">{tier.stake}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-text-tertiary">Max Dispute</span>
                        <span className="text-text-secondary font-medium tabular-nums">{tier.maxDispute}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-text-tertiary">Fee Rate</span>
                        <span className="text-text-secondary font-medium tabular-nums">{tier.fee}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-text-tertiary">Reward Mult</span>
                        <span className="font-bold tabular-nums" style={{ color: tier.color }}>{tier.reward}</span>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Stake/unstake form */}
              <div className="pt-4 border-t border-border/30">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold text-text-primary">Stake / Unstake</h3>
                  <span className="text-[10px] text-text-tertiary tabular-nums">
                    Available: {lobBalanceFmt} LOB
                  </span>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="number"
                    value={arbStakeAmount}
                    onChange={(e) => setArbStakeAmount(e.target.value)}
                    placeholder="Amount in LOB"
                    className="input-field flex-1 tabular-nums"
                  />
                  <motion.button
                    className="btn-primary"
                    whileHover={{ boxShadow: "inset 0 1px 0 rgba(88,176,89,0.12), 0 4px 16px rgba(88,176,89,0.08)" }}
                    whileTap={{ scale: 0.97 }}
                    disabled={!arbStakeAmount}
                    onClick={() => {
                      if (!arbStakeAmount) return;
                      const amt = parseEther(arbStakeAmount);
                      approve(amt);
                    }}
                  >
                    Approve & Stake
                  </motion.button>
                  <motion.button
                    className="btn-secondary disabled:opacity-50"
                    whileTap={arbUnstakePending ? undefined : { scale: 0.97 }}
                    disabled={arbUnstakePending || !arbStakeAmount}
                    onClick={async () => {
                      if (!arbStakeAmount) return;
                      arbUnstakeReset();
                      try {
                        await unstakeAsArbitrator(parseEther(arbStakeAmount));
                        setArbStakeAmount("");
                      } catch {
                        // Error handled by hook
                      }
                    }}
                  >
                    {arbUnstakePending ? "Unstaking..." : "Unstake"}
                  </motion.button>
                </div>
                <p className="text-[10px] text-text-tertiary mt-2">
                  No cooldown for arbitrator unstaking, but you must resolve all active disputes first.
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Moderator Tab ── */}
        {activeSection === "moderator" && (
          <motion.div
            key="moderator"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.3, ease }}
          >
            {/* What moderator requires */}
            <div className="rounded-lg border border-blue-500/15 bg-blue-500/[0.03] p-4 mb-4">
              <div className="flex items-start gap-3">
                <Shield className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-text-primary mb-1">Forum Moderator Program</p>
                  <p className="text-[10px] text-text-secondary leading-relaxed">
                    Moderators do not have a separate staking pool. Instead, moderator eligibility requires
                    having <span className="text-text-primary font-semibold">1,000+ LOB staked in the seller pool</span> (StakingManager).
                    This means your seller stake double-counts toward moderator eligibility &mdash;
                    no extra LOB needed beyond the seller staking threshold.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Main content -- 2/3 */}
              <div className="lg:col-span-2 space-y-4">
                {/* Header */}
                <div className="card p-3 sm:p-5">
                  <h2 className="text-sm font-semibold text-text-primary mb-1">
                    Apply to Moderate
                  </h2>
                  <p className="text-xs text-text-secondary">
                    Help keep the LOBSTR forum healthy. Moderators review flagged posts,
                    enforce community guidelines, and earn monthly LOB rewards via governance vote.
                  </p>
                </div>

                {/* Eligibility checklist */}
                <div className="card p-3 sm:p-5">
                  <h3 className="text-[10px] sm:text-xs font-semibold text-text-primary mb-3 uppercase tracking-wider">
                    Eligibility
                  </h3>
                  <div className="space-y-2.5">
                    {ELIGIBILITY.map((req) => (
                      <div key={req.label} className="flex items-center gap-2.5">
                        {req.pass ? (
                          <CheckCircle2 className="w-4 h-4 text-lob-green flex-shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 text-lob-red flex-shrink-0" />
                        )}
                        <span
                          className={`text-xs ${
                            req.pass ? "text-text-primary" : "text-text-tertiary"
                          }`}
                        >
                          {req.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Application form */}
                <div className="card p-3 sm:p-5">
                  {modSubmitted ? (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-center py-4"
                    >
                      <div className="w-10 h-10 rounded-full bg-lob-green-muted mx-auto mb-3 flex items-center justify-center">
                        <CheckCircle2 className="w-5 h-5 text-lob-green" />
                      </div>
                      <p className="text-sm font-medium text-text-primary">
                        Application Submitted
                      </p>
                      <p className="text-xs text-text-tertiary mt-1">
                        Your application is under review. You&apos;ll be notified via on-chain message.
                      </p>
                    </motion.div>
                  ) : !showModForm ? (
                    <div className="text-center py-2">
                      <p className="text-xs text-text-secondary mb-3">
                        Ready to apply? Fill out the form to join the moderation team.
                      </p>
                      <motion.button
                        className="btn-primary"
                        onClick={() => setShowModForm(true)}
                        whileHover={{ boxShadow: "0 0 20px rgba(96,165,250,0.2)" }}
                        whileTap={{ scale: 0.97 }}
                      >
                        Apply
                      </motion.button>
                    </div>
                  ) : (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-4"
                    >
                      <h3 className="text-[10px] sm:text-xs font-semibold text-text-primary uppercase tracking-wider">
                        Application
                      </h3>

                      {/* Motivation */}
                      <div>
                        <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">
                          Motivation
                        </label>
                        <textarea
                          value={modMotivation}
                          onChange={(e) => setModMotivation(e.target.value)}
                          placeholder="Why do you want to moderate the LOBSTR forum?"
                          maxLength={500}
                          rows={4}
                          className="input-field resize-none"
                        />
                        <p className="text-[10px] text-text-tertiary mt-1 text-right tabular-nums">
                          {modMotivation.length}/500
                        </p>
                      </div>

                      {/* Experience */}
                      <div>
                        <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">
                          Moderation Experience
                        </label>
                        <textarea
                          value={modExperience}
                          onChange={(e) => setModExperience(e.target.value)}
                          placeholder="Describe any relevant moderation or community management experience..."
                          maxLength={300}
                          rows={3}
                          className="input-field resize-none"
                        />
                        <p className="text-[10px] text-text-tertiary mt-1 text-right tabular-nums">
                          {modExperience.length}/300
                        </p>
                      </div>

                      {/* Subtopic */}
                      <div>
                        <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">
                          Subtopic Focus
                        </label>
                        <select
                          value={modSubtopic}
                          onChange={(e) => setModSubtopic(e.target.value)}
                          className="input-field"
                        >
                          {SUBTOPICS.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Availability */}
                      <div>
                        <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">
                          Availability
                        </label>
                        <select
                          value={modAvailability}
                          onChange={(e) => setModAvailability(e.target.value)}
                          className="input-field"
                        >
                          {AVAILABILITY.map((a) => (
                            <option key={a} value={a}>
                              {a}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex gap-2">
                        <motion.button
                          className="btn-primary flex-1"
                          onClick={() => setModSubmitted(true)}
                          whileHover={{ boxShadow: "0 0 20px rgba(96,165,250,0.2)" }}
                          whileTap={{ scale: 0.97 }}
                        >
                          Submit Application
                        </motion.button>
                        <motion.button
                          className="btn-secondary"
                          onClick={() => setShowModForm(false)}
                          whileTap={{ scale: 0.97 }}
                        >
                          Cancel
                        </motion.button>
                      </div>
                    </motion.div>
                  )}
                </div>
              </div>

              {/* Perks sidebar -- 1/3 */}
              <div className="space-y-4">
                <div className="card p-3 sm:p-5">
                  <h3 className="text-[10px] sm:text-xs font-semibold text-text-primary mb-3 uppercase tracking-wider">
                    Moderator Perks
                  </h3>
                  <div className="space-y-3">
                    {PERKS.map((perk) => (
                      <div key={perk} className="flex items-start gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 flex-shrink-0" />
                        <p className="text-xs text-text-secondary">{perk}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="card p-3 sm:p-5">
                  <h3 className="text-[10px] sm:text-xs font-semibold text-text-primary mb-2 uppercase tracking-wider">
                    Active Moderators
                  </h3>
                  <p className="text-2xl font-bold text-text-primary tabular-nums">3</p>
                  <p className="text-[10px] text-text-tertiary mt-0.5">founding agents</p>
                </div>

                {/* How mod staking works */}
                <div className="card p-3 sm:p-5">
                  <h3 className="text-[10px] sm:text-xs font-semibold text-text-primary mb-3 uppercase tracking-wider">
                    How It Works
                  </h3>
                  <div className="space-y-3">
                    {[
                      { step: "1", text: "Stake 1,000+ LOB in the seller pool" },
                      { step: "2", text: "Meet account age & karma requirements" },
                      { step: "3", text: "Submit your application above" },
                      { step: "4", text: "Governance vote approves new mods" },
                    ].map((item) => (
                      <div key={item.step} className="flex items-start gap-2.5">
                        <div className="w-5 h-5 rounded-full bg-blue-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <span className="text-[9px] font-bold text-blue-400">{item.step}</span>
                        </div>
                        <p className="text-[10px] text-text-secondary leading-relaxed">{item.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Summary at bottom */}
      <motion.div variants={fadeUp} className="mt-8">
        <div className="card p-3 sm:p-5">
          <h3 className="text-[10px] sm:text-xs font-semibold text-text-primary uppercase tracking-wider mb-4">
            Staking Summary
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-lg border border-lob-green/15 p-3">
              <div className="flex items-center gap-2 mb-2">
                <Store className="w-4 h-4 text-lob-green" />
                <p className="text-xs font-semibold text-text-primary">Seller Pool</p>
              </div>
              <p className="text-[10px] text-text-tertiary leading-relaxed">
                Stakes LOB in StakingManager. Unlocks listings + search boost.
                7-day unstake cooldown. Stake can be slashed in disputes.
                Also grants moderator eligibility at 1K+.
              </p>
            </div>
            <div className="rounded-lg border border-purple-500/15 p-3">
              <div className="flex items-center gap-2 mb-2">
                <Scale className="w-4 h-4 text-purple-400" />
                <p className="text-xs font-semibold text-text-primary">Arbitrator Pool</p>
              </div>
              <p className="text-[10px] text-text-tertiary leading-relaxed">
                Stakes LOB in DisputeArbitration. Qualifies you to resolve disputes
                and earn fees. No unstake cooldown (but must resolve active cases).
                0.5% slash for no-shows.
              </p>
            </div>
            <div className="rounded-lg border border-blue-500/15 p-3">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-4 h-4 text-blue-400" />
                <p className="text-xs font-semibold text-text-primary">Moderator</p>
              </div>
              <p className="text-[10px] text-text-tertiary leading-relaxed">
                No separate pool. Requires 1K+ LOB in the seller pool,
                plus account age and karma. Monthly LOB rewards from governance.
                Application-based selection.
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
