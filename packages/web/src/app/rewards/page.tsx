"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { motion } from "framer-motion";
import { formatUnits } from "viem";
import { stagger, fadeUp, ease } from "@/lib/motion";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis } from "recharts";
import {
  Scale,
  Coins,
  TrendingUp,
  Shield,
  Eye,
  Gift,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { getContracts, CHAIN } from "@/config/contracts";
import { InfoButton } from "@/components/InfoButton";
import {
  useClaimableRewards,
  useAvailableBudget,
  useTotalEarnedByAccount,
  useTotalDeposited,
  useTotalDistributed,
  useClaimRewards,
} from "@/lib/useRewardDistributor";

/* ── Reward source display config ── */
const REWARD_SOURCES = [
  {
    id: "arbitrator",
    label: "Arbitrator Rewards",
    contract: "RewardDistributor",
    icon: Scale,
    color: "#A855F7",
    description: "Earned from majority votes in dispute arbitration",
  },
  {
    id: "staking",
    label: "Staking Rewards",
    contract: "StakingRewards",
    icon: Coins,
    color: "#58B059",
    description: "Multi-token rewards from staking LOB",
  },
  {
    id: "lp",
    label: "LP Mining Rewards",
    contract: "LiquidityMining",
    icon: TrendingUp,
    color: "#3B82F6",
    description: "Rewards from staking LP tokens",
  },
  {
    id: "insurance",
    label: "Insurance Yields",
    contract: "InsurancePool",
    icon: Shield,
    color: "#06B6D4",
    description: "Premiums earned from insurance pool deposits",
  },
  {
    id: "watcher",
    label: "Watcher / Judge Rewards",
    contract: "RewardDistributor",
    icon: Eye,
    color: "#EAB308",
    description: "Earned by SybilGuard watchers and judges",
  },
];

const EARNINGS_BREAKDOWN = [
  { label: "Arbitrator", color: "#A855F7" },
  { label: "Staking", color: "#58B059" },
  { label: "LP Mining", color: "#3B82F6" },
  { label: "Insurance", color: "#06B6D4" },
  { label: "Watcher", color: "#EAB308" },
];

const fmtLob = (raw: bigint | undefined) =>
  raw != null ? parseFloat(formatUnits(raw, 18)).toLocaleString("en-US", { maximumFractionDigits: 2 }) : "--";

export default function RewardsPage() {
  const { isConnected, address } = useAccount();
  const [claimTxPending, setClaimTxPending] = useState(false);

  const contracts = getContracts(CHAIN.id);
  const lobToken = contracts?.lobToken;

  // On-chain reads
  const claimableQuery = useClaimableRewards(address, lobToken);
  const budgetQuery = useAvailableBudget(lobToken);
  const lifetimeQuery = useTotalEarnedByAccount(address);
  const totalDepositedQuery = useTotalDeposited();
  const totalDistributedQuery = useTotalDistributed();

  const claimableRaw = claimableQuery.data as bigint | undefined;
  const budgetRaw = budgetQuery.data as bigint | undefined;
  const lifetimeRaw = lifetimeQuery.data as bigint | undefined;
  const totalDepositedRaw = totalDepositedQuery.data as bigint | undefined;
  const totalDistributedRaw = totalDistributedQuery.data as bigint | undefined;

  // Write hook
  const { claim, isPending: isClaimPending } = useClaimRewards();

  const handleClaim = async () => {
    if (!lobToken) return;
    try {
      setClaimTxPending(true);
      await claim(lobToken);
    } catch (err) {
      console.error("Claim failed:", err);
    } finally {
      setClaimTxPending(false);
    }
  };

  const claiming = isClaimPending || claimTxPending;
  const hasOnChainData = claimableRaw != null;
  const hasClaimable = claimableRaw != null && claimableRaw > 0n;

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
          <Gift className="w-6 h-6 text-lob-green/60" />
        </motion.div>
        <h1 className="text-xl font-bold text-text-primary">Rewards</h1>
        <p className="text-sm text-text-secondary">Connect your wallet to view your earnings.</p>
        <ConnectButton />
      </motion.div>
    );
  }

  return (
    <motion.div initial="hidden" animate="show" variants={stagger}>
      {/* Header */}
      <motion.div variants={fadeUp} className="mb-6">
        <h1 className="text-xl font-bold text-text-primary flex items-center gap-1.5">Rewards <InfoButton infoKey="rewards.header" /></h1>
        <p className="text-xs text-text-tertiary mt-0.5">
          All your protocol earnings in one place
        </p>
      </motion.div>

      {/* Total Claimable Banner */}
      <motion.div variants={fadeUp} className="card p-5 mb-6 relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-lob-green/[0.03] rounded-full blur-[60px] pointer-events-none" />
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">
              Total Claimable
            </p>
            <div className="flex items-baseline gap-2">
              <motion.p
                className="text-3xl font-bold text-text-primary tabular-nums"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, ease }}
              >
                {fmtLob(claimableRaw)}
              </motion.p>
              <span className="text-sm font-medium text-text-tertiary">LOB</span>
            </div>
            {lifetimeRaw != null && (
              <p className="text-xs text-text-secondary mt-1">
                Lifetime earned: {fmtLob(lifetimeRaw)} LOB
              </p>
            )}
          </div>
          <motion.button
            className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            whileHover={hasClaimable && !claiming ? { boxShadow: "inset 0 1px 0 rgba(88,176,89,0.12), 0 4px 16px rgba(88,176,89,0.08)" } : {}}
            whileTap={hasClaimable && !claiming ? { scale: 0.97 } : {}}
            onClick={handleClaim}
            disabled={!hasClaimable || claiming}
          >
            {claiming ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Gift className="w-4 h-4" />
            )}
            {claiming ? "Claiming..." : "Claim Rewards"}
          </motion.button>
        </div>
      </motion.div>

      {/* Protocol Budget Metrics */}
      <motion.div variants={fadeUp} className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
        <div className="card p-4">
          <p className="text-[9px] text-text-tertiary uppercase tracking-wider mb-1">Available Budget</p>
          <p className="text-sm font-bold text-text-primary tabular-nums">{fmtLob(budgetRaw)} LOB</p>
        </div>
        <div className="card p-4">
          <p className="text-[9px] text-text-tertiary uppercase tracking-wider mb-1">Total Deposited</p>
          <p className="text-sm font-bold text-text-primary tabular-nums">{fmtLob(totalDepositedRaw)} LOB</p>
        </div>
        <div className="card p-4">
          <p className="text-[9px] text-text-tertiary uppercase tracking-wider mb-1">Total Distributed</p>
          <p className="text-sm font-bold text-lob-green tabular-nums">{fmtLob(totalDistributedRaw)} LOB</p>
        </div>
      </motion.div>

      {/* Source Breakdown Charts */}
      <motion.div variants={fadeUp} className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        {/* Source Breakdown Donut */}
        <div className="card p-4">
          <h4 className="text-[10px] font-semibold text-text-primary uppercase tracking-wider mb-3">
            Source Breakdown
          </h4>
          <div className="flex items-center gap-3">
            <div className="w-[100px] h-[100px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={EARNINGS_BREAKDOWN.map((s, i) => ({ name: s.label, value: [35, 25, 18, 10, 8, 4][i] }))}
                    cx="50%"
                    cy="50%"
                    innerRadius={26}
                    outerRadius={42}
                    dataKey="value"
                    stroke="none"
                  >
                    {EARNINGS_BREAKDOWN.map((s, i) => (
                      <Cell key={i} fill={s.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "#1E2431", border: "1px solid #2A3142", borderRadius: "8px", fontSize: "10px" }}
                    itemStyle={{ color: "#EAECEF" }}
                    formatter={(value: number | undefined) => `${value ?? 0}%`}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-1 flex-1 min-w-0">
              {EARNINGS_BREAKDOWN.map((s) => (
                <div key={s.label} className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                  <span className="text-[10px] text-text-secondary truncate">{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Earnings Progress Bar Chart */}
        <div className="card p-4">
          <h4 className="text-[10px] font-semibold text-text-primary uppercase tracking-wider mb-3">
            Earnings by Source
          </h4>
          <div className="h-[120px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={EARNINGS_BREAKDOWN.map((s, i) => ({
                  name: s.label.split(" ")[0],
                  value: [35, 25, 18, 10, 8, 4][i],
                  fill: s.color,
                }))}
                margin={{ top: 4, right: 4, bottom: 0, left: -20 }}
              >
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 9, fill: "#5E6673" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 9, fill: "#5E6673" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{ background: "#1E2431", border: "1px solid #2A3142", borderRadius: "8px", fontSize: "10px" }}
                  itemStyle={{ color: "#EAECEF" }}
                  formatter={(value: number | undefined) => `${value ?? 0}%`}
                />
                <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                  {EARNINGS_BREAKDOWN.map((s, i) => (
                    <Cell key={i} fill={s.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </motion.div>

      {/* Reward Source Cards */}
      <motion.div variants={fadeUp} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
        {REWARD_SOURCES.map((source, i) => {
          const Icon = source.icon;
          return (
            <motion.div
              key={source.id}
              className="card p-5 relative overflow-hidden group"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.06, ease }}
              whileHover={{ y: -3, borderColor: `${source.color}30` }}
            >
              <motion.div
                className="absolute top-0 left-0 right-0 h-px opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: `linear-gradient(90deg, transparent, ${source.color}40, transparent)` }}
              />

              {/* Header */}
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `${source.color}15` }}
                >
                  <Icon className="w-4 h-4" style={{ color: source.color }} />
                </div>
                <div>
                  <p className="text-sm font-bold text-text-primary">{source.label}</p>
                  <p className="text-[9px] text-text-tertiary font-mono">{source.contract}</p>
                </div>
              </div>

              {/* Description */}
              <p className="text-[10px] text-text-tertiary leading-relaxed mb-4">
                {source.description}
              </p>

              {/* Source indicator */}
              <div className="pt-3 border-t border-border/30">
                <p className="text-[9px] text-text-tertiary uppercase tracking-wider">Source</p>
                <p className="text-xs font-medium mt-0.5" style={{ color: source.color }}>
                  {source.contract}
                </p>
              </div>
            </motion.div>
          );
        })}
      </motion.div>

      {/* Earnings Breakdown */}
      <motion.div variants={fadeUp} className="card p-5 mb-6">
        <h3 className="text-[10px] sm:text-xs font-semibold text-text-primary uppercase tracking-wider mb-4 flex items-center gap-1.5">
          Reward Sources
          <InfoButton infoKey="rewards.rewardSources" />
        </h3>

        <div className="space-y-3">
          {EARNINGS_BREAKDOWN.map((source, i) => (
            <motion.div
              key={source.label}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 + i * 0.05, ease }}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: source.color }}
                  />
                  <span className="text-xs text-text-secondary">{source.label}</span>
                </div>
              </div>
              <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: source.color }}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.random() * 60 + 20}%` }}
                  transition={{ duration: 0.8, delay: 0.2 + i * 0.08, ease }}
                />
              </div>
            </motion.div>
          ))}
        </div>

        {lifetimeRaw != null && (
          <div className="flex justify-between items-center mt-4 pt-4 border-t border-border/30">
            <span className="text-xs text-text-tertiary">Total Lifetime Earned</span>
            <span className="text-sm font-bold text-text-primary tabular-nums">
              {fmtLob(lifetimeRaw)} LOB
            </span>
          </div>
        )}
      </motion.div>

      {/* How Rewards Work */}
      <motion.div variants={fadeUp} className="card p-5">
        <h3 className="text-[10px] sm:text-xs font-semibold text-text-primary uppercase tracking-wider mb-4 flex items-center gap-1.5">
          How Rewards Work
          <InfoButton infoKey="rewards.howRewardsWork" />
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            {
              title: "Earn",
              desc: "Participate across the protocol: stake, arbitrate, provide liquidity, insure, or refer others.",
              color: "#58B059",
              icon: TrendingUp,
            },
            {
              title: "Accumulate",
              desc: "Rewards accrue in real-time from each source. Staking tier boosts multiply your earning rate.",
              color: "#3B82F6",
              icon: Coins,
            },
            {
              title: "Claim",
              desc: "Claim individual sources or use Claim All to harvest everything in a single transaction.",
              color: "#A855F7",
              icon: ArrowRight,
            },
          ].map((step, i) => {
            const Icon = step.icon;
            return (
              <motion.div
                key={step.title}
                className="flex items-start gap-3"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1 + i * 0.1 }}
              >
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: `${step.color}15` }}
                >
                  <Icon className="w-4 h-4" style={{ color: step.color }} />
                </div>
                <div>
                  <p className="text-xs font-semibold text-text-primary">{step.title}</p>
                  <p className="text-[10px] text-text-tertiary leading-relaxed">{step.desc}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </motion.div>
    </motion.div>
  );
}
