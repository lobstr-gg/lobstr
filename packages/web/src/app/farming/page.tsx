"use client";

import { useState, useMemo } from "react";
import { useAccount } from "wagmi";
import { formatEther, parseEther, type Address } from "viem";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { motion, AnimatePresence } from "framer-motion";
import { stagger, fadeUp, ease } from "@/lib/motion";
import {
  useLPEarned,
  useLPBalance,
  useLPTotalSupply,
  useBoostMultiplier,
  useLPRewardRate,
  useLPPeriodFinish,
  useLPTokenAddress,
  useLPWalletBalance,
  useLPAllowance,
  useApproveLPToken,
  useStakeLP,
  useWithdrawLP,
  useGetLPReward,
  useExitLP,
  useEmergencyWithdraw,
} from "@/lib/useFarming";
import {
  RadialBarChart,
  RadialBar,
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  Tooltip,
} from "recharts";
import {
  TrendingUp,
  Coins,
  ArrowDownToLine,
  ArrowUpFromLine,
  Gift,
  AlertTriangle,
  Calculator,
  Zap,
  Info,
  Loader2,
} from "lucide-react";
import { InfoButton } from "@/components/InfoButton";

const BOOST_TIERS = [
  { tier: "None", multiplier: "1x", requirement: "0 LOB staked", color: "#5E6673" },
  { tier: "Bronze", multiplier: "1.25x", requirement: "100+ LOB staked", color: "#CD7F32" },
  { tier: "Silver", multiplier: "1.5x", requirement: "1,000+ LOB staked", color: "#848E9C" },
  { tier: "Gold", multiplier: "2x", requirement: "10,000+ LOB staked", color: "#F0B90B" },
  { tier: "Platinum", multiplier: "3x", requirement: "100,000+ LOB staked", color: "#58B059" },
];

// Map on-chain boost multiplier (1e18 based) to tier name
const BOOST_TIER_MAP: Record<string, string> = {
  "1000000000000000000": "None",     // 1e18 = 1x
  "1250000000000000000": "Bronze",   // 1.25e18
  "1500000000000000000": "Silver",   // 1.5e18
  "2000000000000000000": "Gold",     // 2e18
  "3000000000000000000": "Platinum", // 3e18
};

type Tab = "stake" | "unstake" | "rewards";

const TAB_CONFIG: { id: Tab; label: string; icon: typeof Coins }[] = [
  { id: "stake", label: "Stake", icon: ArrowDownToLine },
  { id: "unstake", label: "Unstake", icon: ArrowUpFromLine },
  { id: "rewards", label: "Rewards", icon: Gift },
];

/** Format a bigint (18-decimal) to a display string */
function fmtBig(val: bigint | undefined, decimals = 2): string {
  if (val === undefined) return "0";
  const num = parseFloat(formatEther(val));
  return num.toLocaleString("en-US", { maximumFractionDigits: decimals });
}

/* ──── Boost Gauge ──── */
function BoostGauge({ boostMultiplier, tierName }: { boostMultiplier: bigint; tierName: string }) {
  const boostFloat = parseFloat(formatEther(boostMultiplier));
  // Map 1x-3x to 0-100 percent
  const pct = Math.min(100, Math.max(0, ((boostFloat - 1) / 2) * 100));
  const tierColor =
    BOOST_TIERS.find((t) => t.tier === tierName)?.color ?? "#5E6673";

  const gaugeData = [
    { name: "Boost", value: pct, fill: tierColor },
  ];

  return (
    <div className="relative" style={{ height: 120 }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          cx="50%"
          cy="80%"
          innerRadius={50}
          outerRadius={70}
          barSize={12}
          data={gaugeData}
          startAngle={180}
          endAngle={0}
        >
          <RadialBar
            dataKey="value"
            background={{ fill: "#1E2431" }}
            cornerRadius={6}
          />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-end pb-3 pointer-events-none">
        <span className="text-lg font-bold tabular-nums" style={{ color: tierColor }}>
          {boostFloat.toFixed(2)}x
        </span>
        <span className="text-[9px] text-text-tertiary">{tierName} Boost</span>
      </div>
      {/* Scale labels */}
      <div className="absolute bottom-0 left-0 right-0 flex justify-between px-4 pointer-events-none">
        <span className="text-[8px] text-text-tertiary">1x</span>
        <span className="text-[8px] text-text-tertiary">3x</span>
      </div>
    </div>
  );
}

/* ──── Yield Projection Chart ──── */
function YieldProjectionChart({
  rewardRate,
  totalSupply,
  boostMultiplier,
  stakedBal,
}: {
  rewardRate: bigint;
  totalSupply: bigint;
  boostMultiplier: bigint;
  stakedBal: bigint;
}) {
  const projectionData = useMemo(() => {
    if (totalSupply === BigInt(0) || rewardRate === BigInt(0) || stakedBal === BigInt(0)) return [];
    const supply = parseFloat(formatEther(totalSupply));
    const rate = parseFloat(formatEther(rewardRate));
    const bal = parseFloat(formatEther(stakedBal));
    const boost = parseFloat(formatEther(boostMultiplier));
    if (supply === 0 || bal === 0) return [];

    const shareBase = bal / supply;
    const shareBoosted = (bal * boost) / supply;
    const periods = [
      { label: "7d", days: 7 },
      { label: "30d", days: 30 },
      { label: "90d", days: 90 },
      { label: "365d", days: 365 },
    ];

    return periods.map((p) => ({
      name: p.label,
      base: parseFloat((shareBase * rate * 86400 * p.days).toFixed(2)),
      boosted: parseFloat((shareBoosted * rate * 86400 * p.days).toFixed(2)),
    }));
  }, [rewardRate, totalSupply, boostMultiplier, stakedBal]);

  if (projectionData.length === 0) {
    return (
      <div className="h-[120px] flex items-center justify-center">
        <p className="text-[10px] text-text-tertiary">Stake LP tokens to see yield projections</p>
      </div>
    );
  }

  return (
    <div style={{ height: 140 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={projectionData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="farmBoostGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#58B059" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#58B059" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="farmBaseGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#5E6673" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#5E6673" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="name"
            tick={{ fill: "#5E6673", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#1E2431",
              border: "1px solid #2A3142",
              borderRadius: 8,
              fontSize: 11,
              color: "#EAECEF",
            }}
            formatter={(value?: number, name?: string) => [
              `${(value ?? 0).toLocaleString()} LOB`,
              name === "boosted" ? "Boosted" : "Base",
            ]}
          />
          <Area
            type="monotone"
            dataKey="base"
            stroke="#5E6673"
            strokeWidth={1.5}
            fill="url(#farmBaseGrad)"
          />
          <Area
            type="monotone"
            dataKey="boosted"
            stroke="#58B059"
            strokeWidth={2}
            fill="url(#farmBoostGrad)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function FarmingPage() {
  const { isConnected, address } = useAccount();
  const [activeTab, setActiveTab] = useState<Tab>("stake");
  const [stakeAmount, setStakeAmount] = useState("");
  const [unstakeAmount, setUnstakeAmount] = useState("");
  const [calcAmount, setCalcAmount] = useState("");
  const [showEmergencyConfirm, setShowEmergencyConfirm] = useState(false);

  // ── On-chain reads ──────────────────────────────────────────────────
  const { data: earnedRaw } = useLPEarned(address);
  const { data: stakedBalRaw } = useLPBalance(address);
  const { data: totalSupplyRaw } = useLPTotalSupply();
  const { data: boostRaw } = useBoostMultiplier(address);
  const { data: rewardRateRaw } = useLPRewardRate();
  const { data: periodFinishRaw } = useLPPeriodFinish();
  const { data: lpTokenAddr } = useLPTokenAddress();
  const { data: lpWalletBalRaw } = useLPWalletBalance(address, lpTokenAddr as Address | undefined);
  const { data: allowanceRaw } = useLPAllowance(address, lpTokenAddr as Address | undefined);

  // ── Derived values ──────────────────────────────────────────────────
  const earned = (earnedRaw as bigint) ?? BigInt(0);
  const stakedBal = (stakedBalRaw as bigint) ?? BigInt(0);
  const totalSupply = (totalSupplyRaw as bigint) ?? BigInt(0);
  const boostMultiplier = (boostRaw as bigint) ?? BigInt(10) ** BigInt(18); // default 1x
  const rewardRate = (rewardRateRaw as bigint) ?? BigInt(0);
  const periodFinish = (periodFinishRaw as bigint) ?? BigInt(0);
  const lpWalletBal = (lpWalletBalRaw as bigint) ?? BigInt(0);
  const allowance = (allowanceRaw as bigint) ?? BigInt(0);

  // Boost tier name from on-chain multiplier
  const boostStr = boostMultiplier.toString();
  const boostTierName = BOOST_TIER_MAP[boostStr] ?? "None";
  const boostDisplay = `${parseFloat(formatEther(boostMultiplier)).toFixed(2)}x`;

  // Reward rate per day
  const rewardPerDay = rewardRate * BigInt(86400);

  // Period end date string
  const periodEndStr = useMemo(() => {
    if (periodFinish === BigInt(0)) return "--";
    const date = new Date(Number(periodFinish) * 1000);
    return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  }, [periodFinish]);

  // Simple APR estimate: (rewardRate * 365 days / totalSupply) * 100
  const aprDisplay = useMemo(() => {
    if (totalSupply === BigInt(0) || rewardRate === BigInt(0)) return "--";
    const yearlyRewards = parseFloat(formatEther(rewardRate * BigInt(365 * 86400)));
    const supply = parseFloat(formatEther(totalSupply));
    if (supply === 0) return "--";
    const apr = (yearlyRewards / supply) * 100;
    return `${apr.toFixed(1)}%`;
  }, [rewardRate, totalSupply]);

  // ── Write hooks ─────────────────────────────────────────────────────
  const { fn: approveLPFn, isPending: approvePending, reset: approveReset } = useApproveLPToken();
  const { fn: stakeLPFn, isPending: stakePending, isError: stakeError, error: stakeErrorObj, reset: stakeReset } = useStakeLP();
  const { fn: withdrawLPFn, isPending: withdrawPending, isError: withdrawError, error: withdrawErrorObj, reset: withdrawReset } = useWithdrawLP();
  const { fn: getRewardFn, isPending: claimPending, reset: claimReset } = useGetLPReward();
  const { fn: exitFn, isPending: exitPending, reset: exitReset } = useExitLP();
  const { fn: emergencyFn, isPending: emergencyPending, reset: emergencyReset } = useEmergencyWithdraw();

  const txPending = approvePending || stakePending;

  // ── Handlers ────────────────────────────────────────────────────────
  const handleStake = async () => {
    if (!stakeAmount || !lpTokenAddr) return;
    stakeReset();
    approveReset();
    try {
      const amt = parseEther(stakeAmount);
      // Approve if needed
      if (allowance < amt) {
        await approveLPFn(lpTokenAddr as Address, amt);
      }
      await stakeLPFn(amt);
      setStakeAmount("");
    } catch {
      // Error handled by hook state
    }
  };

  const handleWithdraw = async () => {
    if (!unstakeAmount) return;
    withdrawReset();
    try {
      await withdrawLPFn(parseEther(unstakeAmount));
      setUnstakeAmount("");
    } catch {
      // Error handled by hook state
    }
  };

  const handleClaim = async () => {
    claimReset();
    try {
      await getRewardFn();
    } catch {
      // Error handled by hook state
    }
  };

  const handleExit = async () => {
    exitReset();
    try {
      await exitFn();
    } catch {
      // Error handled by hook state
    }
  };

  const handleEmergency = async () => {
    emergencyReset();
    try {
      await emergencyFn();
      setShowEmergencyConfirm(false);
    } catch {
      // Error handled by hook state
    }
  };

  // ── APR Calculator ──────────────────────────────────────────────────
  const estimates = useMemo(() => {
    const amount = parseFloat(calcAmount) || 0;
    if (amount <= 0 || rewardRate === BigInt(0) || totalSupply === BigInt(0)) return null;
    const yearlyRewards = parseFloat(formatEther(rewardRate * BigInt(365 * 86400)));
    const supply = parseFloat(formatEther(totalSupply));
    if (supply === 0) return null;
    const baseApr = yearlyRewards / supply;
    const boostMult = parseFloat(formatEther(boostMultiplier));
    const boostedApr = baseApr * boostMult;
    const dailyBase = (amount * baseApr) / 365;
    const dailyBoosted = (amount * boostedApr) / 365;
    return {
      daily: { base: dailyBase.toFixed(2), boosted: dailyBoosted.toFixed(2) },
      weekly: { base: (dailyBase * 7).toFixed(2), boosted: (dailyBoosted * 7).toFixed(2) },
      monthly: { base: (dailyBase * 30).toFixed(2), boosted: (dailyBoosted * 30).toFixed(2) },
      yearly: { base: (dailyBase * 365).toFixed(2), boosted: (dailyBoosted * 365).toFixed(2) },
    };
  }, [calcAmount, rewardRate, totalSupply, boostMultiplier]);

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
            borderColor: ["rgba(30,36,49,1)", "rgba(59,130,246,0.4)", "rgba(30,36,49,1)"],
            boxShadow: [
              "0 0 0 rgba(59,130,246,0)",
              "0 0 30px rgba(59,130,246,0.08)",
              "0 0 0 rgba(59,130,246,0)",
            ],
          }}
          transition={{ duration: 3, repeat: Infinity }}
        >
          <TrendingUp className="w-6 h-6 text-blue-400/60" />
        </motion.div>
        <h1 className="text-xl font-bold text-text-primary">LP Farming</h1>
        <p className="text-sm text-text-secondary">Connect your wallet to start farming.</p>
        <ConnectButton />
      </motion.div>
    );
  }

  return (
    <motion.div initial="hidden" animate="show" variants={stagger}>
      {/* Header */}
      <motion.div variants={fadeUp} className="mb-6">
        <h1 className="text-xl font-bold text-text-primary flex items-center gap-1.5">LP Farming <InfoButton infoKey="farming.header" /></h1>
        <p className="text-xs text-text-tertiary mt-0.5">
          Stake LP tokens, earn LOB rewards with tier boosts
        </p>
      </motion.div>

      {/* Stats Banner */}
      <motion.div variants={fadeUp} className="card p-3 sm:p-5 mb-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Total Staked</p>
            <p className="text-sm font-bold text-text-primary mt-0.5 tabular-nums">{fmtBig(totalSupply)} LP</p>
          </div>
          <div>
            <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Reward Rate</p>
            <p className="text-sm font-bold text-text-primary mt-0.5 tabular-nums">{fmtBig(rewardPerDay)} LOB/day</p>
          </div>
          <div>
            <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Period End</p>
            <p className="text-sm font-bold text-text-primary mt-0.5 tabular-nums">{periodEndStr}</p>
          </div>
          <div>
            <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Your APR</p>
            <p className="text-sm font-bold text-lob-green mt-0.5 tabular-nums">{aprDisplay}</p>
          </div>
        </div>
      </motion.div>

      {/* Boost Gauge + Yield Projection */}
      <motion.div variants={fadeUp} className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="card p-4">
          <h3 className="text-[10px] sm:text-xs font-semibold text-text-primary uppercase tracking-wider mb-2 flex items-center gap-1.5">
            Boost Multiplier
            <InfoButton infoKey="farming.boostMultiplier" />
          </h3>
          <BoostGauge boostMultiplier={boostMultiplier} tierName={boostTierName} />
        </div>
        <div className="card p-4">
          <h3 className="text-[10px] sm:text-xs font-semibold text-text-primary uppercase tracking-wider mb-2 flex items-center gap-1.5">
            Yield Projection
            <InfoButton infoKey="farming.yieldProjection" />
          </h3>
          <YieldProjectionChart
            rewardRate={rewardRate}
            totalSupply={totalSupply}
            boostMultiplier={boostMultiplier}
            stakedBal={stakedBal}
          />
        </div>
      </motion.div>

      {/* Main Card with Tabs */}
      <motion.div variants={fadeUp} className="card overflow-hidden mb-6">
        {/* Tab bar */}
        <div className="flex border-b border-border">
          {TAB_CONFIG.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="relative flex-1 px-4 py-3 text-sm font-medium -mb-px"
              >
                <motion.span
                  animate={{ color: activeTab === tab.id ? "#EAECEF" : "#5E6673" }}
                  className="relative z-10 flex items-center justify-center gap-1.5"
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                </motion.span>
                {activeTab === tab.id && (
                  <motion.div
                    layoutId="farm-tab"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <div className="p-5">
          <AnimatePresence mode="wait">
            {/* ── Stake Tab ── */}
            {activeTab === "stake" && (
              <motion.div
                key="stake"
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 16 }}
                transition={{ duration: 0.3, ease }}
                className="space-y-4"
              >
                {/* Current position */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] text-text-tertiary uppercase tracking-wider">LP Balance</p>
                    <p className="text-sm font-bold text-text-primary mt-0.5 tabular-nums">{fmtBig(lpWalletBal, 4)} LP</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Currently Staked</p>
                    <p className="text-sm font-bold text-text-primary mt-0.5 tabular-nums">{fmtBig(stakedBal, 4)} LP</p>
                  </div>
                </div>

                {/* Stake input */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-medium text-text-secondary">Amount to Stake</label>
                    <span className="text-[10px] text-text-tertiary tabular-nums">
                      Available: {fmtBig(lpWalletBal, 4)} LP
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <input
                        type="number"
                        value={stakeAmount}
                        onChange={(e) => setStakeAmount(e.target.value)}
                        placeholder="0.00"
                        className="input-field w-full tabular-nums pr-14"
                      />
                      <button
                        onClick={() => setStakeAmount(formatEther(lpWalletBal))}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-blue-400 hover:text-blue-300 transition-colors"
                      >
                        MAX
                      </button>
                    </div>
                    <motion.button
                      className="btn-primary disabled:opacity-50"
                      whileHover={txPending ? undefined : { boxShadow: "inset 0 1px 0 rgba(59,130,246,0.12), 0 4px 16px rgba(59,130,246,0.08)" }}
                      whileTap={txPending ? undefined : { scale: 0.97 }}
                      disabled={txPending || !stakeAmount}
                      onClick={handleStake}
                    >
                      {txPending ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          {approvePending ? "Approving..." : "Staking..."}
                        </span>
                      ) : allowance < (stakeAmount ? parseEther(stakeAmount) : BigInt(0))
                        ? "Approve & Stake"
                        : "Stake"
                      }
                    </motion.button>
                  </div>
                </div>

                {stakeError && (
                  <p className="text-xs text-red-400">
                    {stakeErrorObj?.message?.includes("User rejected")
                      ? "Transaction rejected in wallet"
                      : "Staking failed. Please try again."}
                  </p>
                )}

                <p className="text-[10px] text-text-tertiary">
                  Staking LP tokens earns LOB rewards proportional to your share of the pool, boosted by your staking tier.
                </p>
              </motion.div>
            )}

            {/* ── Unstake Tab ── */}
            {activeTab === "unstake" && (
              <motion.div
                key="unstake"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.3, ease }}
                className="space-y-4"
              >
                {/* Staked balance */}
                <div>
                  <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Staked Balance</p>
                  <p className="text-sm font-bold text-text-primary mt-0.5 tabular-nums">{fmtBig(stakedBal, 4)} LP</p>
                </div>

                {/* Withdraw input */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-medium text-text-secondary">Amount to Withdraw</label>
                    <span className="text-[10px] text-text-tertiary tabular-nums">
                      Staked: {fmtBig(stakedBal, 4)} LP
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <input
                        type="number"
                        value={unstakeAmount}
                        onChange={(e) => setUnstakeAmount(e.target.value)}
                        placeholder="0.00"
                        className="input-field w-full tabular-nums pr-14"
                      />
                      <button
                        onClick={() => setUnstakeAmount(formatEther(stakedBal))}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-blue-400 hover:text-blue-300 transition-colors"
                      >
                        MAX
                      </button>
                    </div>
                    <motion.button
                      className="btn-secondary disabled:opacity-50"
                      whileTap={withdrawPending ? undefined : { scale: 0.97 }}
                      disabled={withdrawPending || !unstakeAmount}
                      onClick={handleWithdraw}
                    >
                      {withdrawPending ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" /> Withdrawing...
                        </span>
                      ) : "Withdraw"}
                    </motion.button>
                  </div>
                </div>

                {withdrawError && (
                  <p className="text-xs text-red-400">
                    {withdrawErrorObj?.message?.includes("User rejected")
                      ? "Transaction rejected in wallet"
                      : "Withdrawal failed. Please try again."}
                  </p>
                )}

                {/* Exit button */}
                <div className="pt-3 border-t border-border/30 space-y-3">
                  <motion.button
                    className="w-full py-2.5 rounded-lg text-xs font-medium bg-lob-green/10 text-lob-green hover:bg-lob-green/20 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                    whileTap={exitPending ? undefined : { scale: 0.98 }}
                    disabled={exitPending || stakedBal === BigInt(0)}
                    onClick={handleExit}
                  >
                    {exitPending ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Exiting...</>
                    ) : (
                      <><Gift className="w-3.5 h-3.5" /> Exit (Withdraw All + Claim Rewards)</>
                    )}
                  </motion.button>

                  {/* Emergency withdraw */}
                  <div className="rounded-lg border border-red-500/20 bg-red-500/[0.03] p-3">
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs font-semibold text-red-400 mb-1">Emergency Withdraw</p>
                        <p className="text-[10px] text-text-tertiary leading-relaxed mb-2">
                          Withdraws all staked LP tokens immediately but forfeits any unclaimed rewards.
                          Only use this if the normal withdraw path is blocked.
                        </p>
                        {!showEmergencyConfirm ? (
                          <motion.button
                            className="text-[10px] font-medium text-red-400 hover:text-red-300 transition-colors"
                            whileTap={{ scale: 0.97 }}
                            onClick={() => setShowEmergencyConfirm(true)}
                          >
                            Emergency Withdraw
                          </motion.button>
                        ) : (
                          <div className="flex items-center gap-2 mt-1">
                            <motion.button
                              className="text-[10px] font-bold text-red-400 bg-red-400/10 px-3 py-1.5 rounded hover:bg-red-400/20 transition-colors disabled:opacity-50"
                              whileTap={emergencyPending ? undefined : { scale: 0.97 }}
                              disabled={emergencyPending || stakedBal === BigInt(0)}
                              onClick={handleEmergency}
                            >
                              {emergencyPending ? (
                                <span className="flex items-center gap-1">
                                  <Loader2 className="w-3 h-3 animate-spin" /> Withdrawing...
                                </span>
                              ) : "Confirm -- Forfeit Rewards"}
                            </motion.button>
                            <motion.button
                              className="text-[10px] text-text-tertiary hover:text-text-secondary transition-colors"
                              onClick={() => setShowEmergencyConfirm(false)}
                            >
                              Cancel
                            </motion.button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── Rewards Tab ── */}
            {activeTab === "rewards" && (
              <motion.div
                key="rewards"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.3, ease }}
                className="space-y-4"
              >
                {/* Earned rewards */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Earned Rewards</p>
                    <p className="text-lg font-bold text-lob-green mt-0.5 tabular-nums">{fmtBig(earned, 4)} LOB</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Boost Multiplier</p>
                    <p className="text-lg font-bold text-text-primary mt-0.5 tabular-nums flex items-center gap-1.5">
                      <Zap className="w-4 h-4 text-yellow-400" />
                      {boostDisplay}
                      <span className="text-xs font-normal text-text-tertiary">from {boostTierName} tier</span>
                    </p>
                  </div>
                </div>

                {/* Claim button */}
                <motion.button
                  className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
                  whileHover={claimPending ? undefined : { boxShadow: "inset 0 1px 0 rgba(88,176,89,0.12), 0 4px 16px rgba(88,176,89,0.08)" }}
                  whileTap={claimPending ? undefined : { scale: 0.97 }}
                  disabled={claimPending || earned === BigInt(0)}
                  onClick={handleClaim}
                >
                  {claimPending ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Claiming...</>
                  ) : (
                    <><Gift className="w-4 h-4" /> Claim Rewards</>
                  )}
                </motion.button>

                {/* Boost explainer */}
                <div className="rounded-lg border border-border/40 bg-surface-1/30 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Info className="w-4 h-4 text-text-tertiary" />
                    <h4 className="text-[10px] sm:text-xs font-semibold text-text-primary uppercase tracking-wider">
                      Tier Boost Multipliers
                    </h4>
                    <InfoButton infoKey="farming.tierBoosts" />
                  </div>
                  <div className="space-y-2">
                    {BOOST_TIERS.map((bt, i) => {
                      const isActive = bt.tier === boostTierName;
                      return (
                        <motion.div
                          key={bt.tier}
                          className={`flex items-center justify-between ${isActive ? "" : "opacity-60"}`}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: isActive ? 1 : 0.6, x: 0 }}
                          transition={{ delay: i * 0.05, ease }}
                        >
                          <div className="flex items-center gap-2">
                            <div
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: bt.color }}
                            />
                            <span className="text-xs text-text-secondary">{bt.tier}</span>
                            {isActive && (
                              <span className="text-[9px] font-bold text-lob-green bg-lob-green/10 px-1.5 py-0.5 rounded">
                                ACTIVE
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] text-text-tertiary">{bt.requirement}</span>
                            <span
                              className="text-xs font-bold tabular-nums w-10 text-right"
                              style={{ color: bt.color }}
                            >
                              {bt.multiplier}
                            </span>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-text-tertiary mt-3 leading-relaxed">
                    Your boost is determined by your LOB staking tier in the StakingManager contract.
                    Higher tiers multiply your effective balance for reward calculations.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* APR Calculator */}
      <motion.div variants={fadeUp} className="card p-3 sm:p-5 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Calculator className="w-4 h-4 text-text-tertiary" />
          <h3 className="text-[10px] sm:text-xs font-semibold text-text-primary uppercase tracking-wider">
            APR Calculator
          </h3>
          <InfoButton infoKey="farming.aprCalculator" />
        </div>

        <div className="mb-4">
          <label className="text-xs font-medium text-text-secondary mb-2 block">
            Amount to Stake (LP tokens)
          </label>
          <input
            type="number"
            value={calcAmount}
            onChange={(e) => setCalcAmount(e.target.value)}
            placeholder="Enter LP amount..."
            className="input-field w-full sm:w-64 tabular-nums"
          />
        </div>

        {estimates && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease }}
          >
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              {(["daily", "weekly", "monthly", "yearly"] as const).map((period) => (
                <div key={period} className="rounded-lg border border-border/40 bg-surface-1/30 p-3">
                  <p className="text-[9px] text-text-tertiary uppercase tracking-wider mb-1 capitalize">{period}</p>
                  <p className="text-sm font-bold text-lob-green tabular-nums">
                    {estimates[period].boosted} LOB
                  </p>
                  <p className="text-[10px] text-text-tertiary tabular-nums mt-0.5">
                    {estimates[period].base} unboosted
                  </p>
                </div>
              ))}
            </div>

            {/* Boosted vs unboosted comparison */}
            <div className="rounded-lg border border-border/40 bg-surface-1/30 p-3">
              <p className="text-[10px] text-text-tertiary mb-2">Yearly Earnings Comparison</p>
              <div className="space-y-2">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-text-tertiary">Unboosted (1x)</span>
                    <span className="text-xs text-text-secondary tabular-nums">{estimates.yearly.base} LOB</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                    <motion.div
                      className="h-full rounded-full bg-text-tertiary"
                      initial={{ width: 0 }}
                      animate={{ width: "50%" }}
                      transition={{ duration: 0.6, ease }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-lob-green">Boosted ({boostDisplay} {boostTierName})</span>
                    <span className="text-xs font-bold text-lob-green tabular-nums">{estimates.yearly.boosted} LOB</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                    <motion.div
                      className="h-full rounded-full bg-lob-green"
                      initial={{ width: 0 }}
                      animate={{ width: "100%" }}
                      transition={{ duration: 0.8, delay: 0.1, ease }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {!estimates && (
          <p className="text-[10px] text-text-tertiary">
            Enter an LP amount to see estimated rewards at current rates.
          </p>
        )}
      </motion.div>

      {/* How It Works */}
      <motion.div variants={fadeUp} className="card p-3 sm:p-5">
        <h3 className="text-[10px] sm:text-xs font-semibold text-text-primary uppercase tracking-wider mb-4 flex items-center gap-1.5">
          How LP Farming Works
          <InfoButton infoKey="farming.howItWorks" />
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            {
              step: 1,
              title: "Provide Liquidity",
              desc: "Add liquidity to the LOB/ETH pool on the DEX to receive LP tokens.",
              icon: Coins,
              color: "#3B82F6",
            },
            {
              step: 2,
              title: "Stake LP Tokens",
              desc: "Deposit your LP tokens into the LiquidityMining contract to start earning.",
              icon: ArrowDownToLine,
              color: "#58B059",
            },
            {
              step: 3,
              title: "Earn Boosted Rewards",
              desc: "LOB rewards accrue based on your share of the pool, multiplied by your staking tier boost.",
              icon: Zap,
              color: "#F0B90B",
            },
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
      </motion.div>
    </motion.div>
  );
}
