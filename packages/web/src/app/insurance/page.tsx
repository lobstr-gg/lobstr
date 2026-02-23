"use client";

import { useState, useMemo } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { motion, AnimatePresence } from "framer-motion";
import { stagger, fadeUp, ease } from "@/lib/motion";
import { formatEther, parseEther } from "viem";
import Link from "next/link";
import {
  usePoolStats,
  usePoolStakerInfo,
  useCoverageCap,
  usePoolEarned,
  useDepositToInsurancePool,
  useWithdrawFromInsurancePool,
  useClaimPoolRewards,
  useFileClaim,
  useApproveToken,
  useLOBBalance,
  useLOBAllowance,
} from "@/lib/useInsurance";
import { getContracts, CHAIN } from "@/config/contracts";
import {
  BarChart,
  Bar,
  XAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  Shield,
  TrendingUp,
  Users,
  Coins,
  Lock,
  Unlock,
  ArrowRight,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Activity,
  FileText,
  Percent,
  Heart,
  Zap,
  Loader2,
} from "lucide-react";

/* ──── Types ──── */
type TabId = "overview" | "stake" | "coverage" | "claims";

/* ──── Constants ──── */
const TABS: { id: TabId; label: string; icon: typeof Shield }[] = [
  { id: "overview", label: "Pool Overview", icon: Activity },
  { id: "stake", label: "Stake", icon: Coins },
  { id: "coverage", label: "Coverage", icon: Shield },
  { id: "claims", label: "Claims", icon: FileText },
];

const TAB_COLORS: Record<TabId, string> = {
  overview: "#58B059",
  stake: "#A855F7",
  coverage: "#3B82F6",
  claims: "#F59E0B",
};

const COVERAGE_TIERS = [
  { name: "Bronze", maxCoverage: "100", color: "#CD7F32", minStake: "100 LOB" },
  { name: "Silver", maxCoverage: "500", color: "#848E9C", minStake: "1,000 LOB" },
  { name: "Gold", maxCoverage: "2,500", color: "#F0B90B", minStake: "10,000 LOB" },
  { name: "Platinum", maxCoverage: "10,000", color: "#58B059", minStake: "100,000 LOB" },
];

const PREMIUM_RATE_BPS = 50; // 0.5%

/* ──── Helpers ──── */
function fmtLob(wei: bigint | undefined): string {
  if (!wei) return "0";
  const num = Number(formatEther(wei));
  return num.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function fmtLobCompact(wei: bigint | undefined): string {
  if (!wei) return "0";
  const num = Number(formatEther(wei));
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(2) + "M";
  if (num >= 1_000) return (num / 1_000).toFixed(1) + "K";
  return num.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/* ──── Pool Health Ring ──── */
function PoolHealthRing({ utilization }: { utilization: number }) {
  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference - (utilization / 100) * circumference;
  const healthColor = utilization < 50 ? "#58B059" : utilization < 75 ? "#F0B90B" : "#EF4444";

  return (
    <div className="relative w-32 h-32 mx-auto">
      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
        <circle
          cx="50" cy="50" r="45"
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          className="text-surface-2"
        />
        <motion.circle
          cx="50" cy="50" r="45"
          fill="none"
          stroke={healthColor}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 1.2, ease }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p className="text-lg font-bold text-text-primary tabular-nums">{utilization}%</p>
        <p className="text-[9px] text-text-tertiary uppercase tracking-wider">Utilized</p>
      </div>
    </div>
  );
}

/* ──── How Insurance Works Flow ──── */
function InsuranceFlow() {
  const steps = [
    { icon: Shield, label: "Create Insured Job", desc: "Buyer creates escrow job with insurance flag", color: "#3B82F6" },
    { icon: Percent, label: "Pay Premium", desc: "0.5% of job value goes to the insurance pool", color: "#A855F7" },
    { icon: AlertTriangle, label: "Dispute Filed", desc: "If seller fails, buyer files an insurance claim", color: "#F59E0B" },
    { icon: CheckCircle2, label: "Claim Paid", desc: "Approved claims are paid from the pool", color: "#58B059" },
  ];

  return (
    <div className="card p-3 sm:p-5">
      <h3 className="text-[10px] sm:text-xs font-semibold text-text-primary uppercase tracking-wider mb-5">
        How Insured Jobs Work
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 sm:gap-3">
        {steps.map((step, i) => {
          const Icon = step.icon;
          return (
            <motion.div
              key={step.label}
              className="flex sm:flex-col items-start sm:items-center gap-3 sm:gap-2 text-center relative"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.15 + i * 0.1, ease }}
            >
              {i < steps.length - 1 && (
                <motion.div
                  className="hidden sm:block absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-10"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.3 }}
                  transition={{ delay: 0.5 + i * 0.15 }}
                >
                  <ArrowRight className="w-3 h-3 text-text-tertiary" />
                </motion.div>
              )}
              <motion.div
                className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: `${step.color}15`, border: `1px solid ${step.color}25` }}
                whileHover={{ scale: 1.1 }}
                animate={{
                  boxShadow: [
                    `0 0 0 0 ${step.color}00`,
                    `0 0 12px 0 ${step.color}15`,
                    `0 0 0 0 ${step.color}00`,
                  ],
                }}
                transition={{ duration: 3, delay: i * 0.5, repeat: Infinity }}
              >
                <Icon className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: step.color }} />
              </motion.div>
              <div className="sm:text-center text-left">
                <p className="text-xs font-semibold text-text-primary">{step.label}</p>
                <p className="text-[10px] text-text-tertiary leading-tight mt-0.5">{step.desc}</p>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

/* ──── Pool Composition Chart ──── */
function PoolCompositionChart({
  deposits,
  premiums,
  claims,
}: {
  deposits: bigint | undefined;
  premiums: bigint | undefined;
  claims: bigint | undefined;
}) {
  const data = [
    {
      name: "Deposits",
      value: deposits ? parseFloat(Number(formatEther(deposits)).toFixed(0)) : 0,
    },
    {
      name: "Premiums",
      value: premiums ? parseFloat(Number(formatEther(premiums)).toFixed(0)) : 0,
    },
    {
      name: "Claims",
      value: claims ? parseFloat(Number(formatEther(claims)).toFixed(0)) : 0,
    },
  ];

  const colors = ["#58B059", "#A855F7", "#F59E0B"];

  return (
    <div style={{ height: 140 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
            formatter={(value?: number) => [`${(value ?? 0).toLocaleString()} LOB`, "Amount"]}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={32}>
            {data.map((_, idx) => (
              <Cell key={idx} fill={colors[idx]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ──── User Pool Share Donut ──── */
function UserShareDonut({
  myDeposited,
  totalDeposits,
  poolSharePct,
}: {
  myDeposited: bigint;
  totalDeposits: bigint | undefined;
  poolSharePct: string;
}) {
  const myNum = parseFloat(Number(formatEther(myDeposited)).toFixed(0));
  const totalNum = totalDeposits
    ? parseFloat(Number(formatEther(totalDeposits)).toFixed(0))
    : 0;
  const othersNum = Math.max(0, totalNum - myNum);

  const data =
    myNum > 0
      ? [
          { name: "Your Share", value: myNum, fill: "#A855F7" },
          { name: "Others", value: othersNum, fill: "#1E2431" },
        ]
      : [{ name: "Pool", value: totalNum || 1, fill: "#1E2431" }];

  return (
    <div className="relative" style={{ height: 140 }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={38}
            outerRadius={54}
            dataKey="value"
            startAngle={90}
            endAngle={-270}
            stroke="none"
          >
            {data.map((entry, idx) => (
              <Cell key={idx} fill={entry.fill} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-sm font-bold text-purple-400 tabular-nums">{poolSharePct}%</span>
        <span className="text-[9px] text-text-tertiary">Your Share</span>
      </div>
    </div>
  );
}

/* ──── Main Page ──── */
export default function InsurancePage() {
  const { isConnected, address } = useAccount();
  const contracts = getContracts(CHAIN.id);
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [claimJobId, setClaimJobId] = useState("");
  const [claimReason, setClaimReason] = useState("");
  const [claimSubmitted, setClaimSubmitted] = useState(false);
  const [txPending, setTxPending] = useState(false);
  const [txError, setTxError] = useState("");

  // ─── Contract reads ────────────────────────────────────────────────
  const poolStatsQuery = usePoolStats();
  const poolStats = poolStatsQuery.data as
    | readonly [bigint, bigint, bigint, bigint]
    | undefined;

  const stakerInfoQuery = usePoolStakerInfo(address);
  const stakerInfo = stakerInfoQuery.data as
    | { deposited: bigint; rewardPerTokenPaid: bigint; pendingRewards: bigint }
    | undefined;

  const coverageCapQuery = useCoverageCap(address);
  const coverageCap = coverageCapQuery.data as bigint | undefined;

  const earnedQuery = usePoolEarned(address);
  const earned = earnedQuery.data as bigint | undefined;

  const lobBalanceQuery = useLOBBalance(address);
  const lobBalance = lobBalanceQuery.data as bigint | undefined;

  const allowanceQuery = useLOBAllowance(
    address,
    contracts?.insurancePool as `0x${string}` | undefined
  );
  const currentAllowance = allowanceQuery.data as bigint | undefined;

  // ─── Contract writes ───────────────────────────────────────────────
  const depositHook = useDepositToInsurancePool();
  const withdrawHook = useWithdrawFromInsurancePool();
  const claimRewards = useClaimPoolRewards();
  const fileClaimHook = useFileClaim();
  const approveToken = useApproveToken();

  // ─── Derived values ────────────────────────────────────────────────
  const totalDeposits = poolStats?.[0];
  const totalPremiums = poolStats?.[1];
  const totalClaims = poolStats?.[2];
  const available = poolStats?.[3];

  const myDeposited = stakerInfo?.deposited ?? 0n;
  const myEarned = earned ?? 0n;

  const poolUtilization = useMemo(() => {
    if (!totalDeposits || totalDeposits === 0n) return 0;
    const claimsNum = Number(formatEther(totalClaims ?? 0n));
    const depositsNum = Number(formatEther(totalDeposits));
    if (depositsNum === 0) return 0;
    return Math.min(100, Math.round((claimsNum / depositsNum) * 100));
  }, [totalDeposits, totalClaims]);

  const poolSharePct = useMemo(() => {
    if (!totalDeposits || totalDeposits === 0n || !myDeposited || myDeposited === 0n) return "0.00";
    const share = (Number(formatEther(myDeposited)) / Number(formatEther(totalDeposits))) * 100;
    return share < 0.01 ? "<0.01" : share.toFixed(2);
  }, [totalDeposits, myDeposited]);

  const premiumRateDisplay = `${(PREMIUM_RATE_BPS / 100).toFixed(1)}%`;

  // APY estimate: annualized net premium income / total deposits
  const apyEstimate = useMemo(() => {
    if (!totalDeposits || totalDeposits === 0n || !totalPremiums) return "--";
    const premiums = Number(formatEther(totalPremiums));
    const claims = Number(formatEther(totalClaims ?? 0n));
    const deposits = Number(formatEther(totalDeposits));
    if (deposits === 0) return "--";
    // Simple annualization: assume pool has been active ~30 days
    const net30d = premiums - claims;
    const annual = (net30d * 12) / deposits * 100;
    if (annual <= 0) return "0.0%";
    return annual.toFixed(1) + "%";
  }, [totalDeposits, totalPremiums, totalClaims]);

  const claimsRatio = useMemo(() => {
    if (!totalPremiums || totalPremiums === 0n) return "--";
    const premiums = Number(formatEther(totalPremiums));
    const claims = Number(formatEther(totalClaims ?? 0n));
    if (premiums === 0) return "0%";
    return ((claims / premiums) * 100).toFixed(1) + "%";
  }, [totalPremiums, totalClaims]);

  const STATS = [
    { label: "Pool TVL", value: fmtLobCompact(totalDeposits), sub: "LOB", icon: Coins, color: "#58B059" },
    { label: "APY", value: apyEstimate, icon: TrendingUp, color: "#A855F7" },
    { label: "Premiums", value: fmtLobCompact(totalPremiums), sub: "LOB", icon: Users, color: "#3B82F6" },
    { label: "Claims Ratio", value: claimsRatio, icon: Heart, color: "#F59E0B" },
  ];

  // ─── Action handlers ───────────────────────────────────────────────
  async function handleDeposit() {
    if (!depositAmount || !contracts) return;
    setTxPending(true);
    setTxError("");
    try {
      const amount = parseEther(depositAmount);
      // Check allowance and approve if needed
      const needsApproval = !currentAllowance || currentAllowance < amount;
      if (needsApproval) {
        await approveToken(
          contracts.lobToken,
          contracts.insurancePool,
          amount
        );
        // Wait a moment for the chain to pick up approval
        await new Promise((r) => setTimeout(r, 2000));
      }
      await depositHook.fn(amount);
      setDepositAmount("");
      // Refetch data
      poolStatsQuery.refetch();
      stakerInfoQuery.refetch();
      lobBalanceQuery.refetch();
      allowanceQuery.refetch();
      earnedQuery.refetch();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      setTxError(msg.length > 120 ? msg.slice(0, 120) + "..." : msg);
    } finally {
      setTxPending(false);
    }
  }

  async function handleWithdraw() {
    if (!withdrawAmount) return;
    setTxPending(true);
    setTxError("");
    try {
      const amount = parseEther(withdrawAmount);
      await withdrawHook.fn(amount);
      setWithdrawAmount("");
      poolStatsQuery.refetch();
      stakerInfoQuery.refetch();
      lobBalanceQuery.refetch();
      earnedQuery.refetch();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      setTxError(msg.length > 120 ? msg.slice(0, 120) + "..." : msg);
    } finally {
      setTxPending(false);
    }
  }

  async function handleClaimRewards() {
    setTxPending(true);
    setTxError("");
    try {
      claimRewards();
      // Brief delay then refetch
      await new Promise((r) => setTimeout(r, 3000));
      earnedQuery.refetch();
      stakerInfoQuery.refetch();
      lobBalanceQuery.refetch();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      setTxError(msg.length > 120 ? msg.slice(0, 120) + "..." : msg);
    } finally {
      setTxPending(false);
    }
  }

  async function handleFileClaim() {
    if (!claimJobId) return;
    setTxPending(true);
    setTxError("");
    try {
      await fileClaimHook.fn(BigInt(claimJobId));
      setClaimSubmitted(true);
      poolStatsQuery.refetch();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      setTxError(msg.length > 120 ? msg.slice(0, 120) + "..." : msg);
    } finally {
      setTxPending(false);
    }
  }

  if (!isConnected) {
    return (
      <motion.div
        className="flex flex-col items-center justify-center min-h-[50vh] gap-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <motion.div
          className="w-16 h-16 rounded-lg border border-border flex items-center justify-center"
          animate={{
            borderColor: [
              "rgba(30,36,49,1)",
              "rgba(88,176,89,0.3)",
              "rgba(30,36,49,1)",
            ],
          }}
          transition={{ duration: 3, repeat: Infinity }}
        >
          <Shield className="w-6 h-6 text-lob-green/60" />
        </motion.div>
        <h1 className="text-xl font-bold text-text-primary">Insurance Pool</h1>
        <p className="text-sm text-text-secondary">Connect your wallet to access the insurance pool.</p>
        <ConnectButton />
      </motion.div>
    );
  }

  return (
    <motion.div initial="hidden" animate="show" variants={stagger}>
      {/* Header */}
      <motion.div variants={fadeUp} className="mb-6">
        <h1 className="text-xl font-bold text-text-primary">Insurance Pool</h1>
        <p className="text-xs text-text-tertiary mt-0.5">
          Protect your jobs &mdash; earn yield on staked LOB
        </p>
      </motion.div>

      {/* Global tx error */}
      {txError && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-lg border border-red-500/20 bg-red-500/[0.05] p-3 mb-4"
        >
          <p className="text-[10px] text-red-400 flex items-start gap-2">
            <XCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>{txError}</span>
          </p>
        </motion.div>
      )}

      {/* Stats banner */}
      <motion.div variants={fadeUp} className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {STATS.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <motion.div
              key={stat.label}
              className="card p-4 relative overflow-hidden group"
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.1 + i * 0.06, ease }}
              whileHover={{ y: -2, borderColor: "rgba(88,176,89,0.2)" }}
            >
              <motion.div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-lob-green/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <Icon className="w-4 h-4 mb-2" style={{ color: stat.color }} />
              <p className="text-[10px] text-text-tertiary uppercase tracking-wider">{stat.label}</p>
              <div className="flex items-baseline gap-1 mt-1">
                <p className="text-xl font-bold tabular-nums text-text-primary">{stat.value}</p>
                {"sub" in stat && stat.sub && <span className="text-xs text-text-tertiary">{stat.sub}</span>}
              </div>
            </motion.div>
          );
        })}
      </motion.div>

      {/* Tabs */}
      <motion.div variants={fadeUp} className="flex gap-0.5 mb-6 border-b border-border">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="relative px-4 py-2 text-sm font-medium -mb-px"
            >
              <motion.span
                animate={{ color: activeTab === tab.id ? "#EAECEF" : "#5E6673" }}
                className="relative z-10 flex items-center gap-1.5"
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">
                  {tab.id === "overview" ? "Pool" : tab.id === "stake" ? "Stake" : tab.id === "coverage" ? "Cover" : "Claims"}
                </span>
              </motion.span>
              {activeTab === tab.id && (
                <motion.div
                  layoutId="insurance-tab"
                  className="absolute bottom-0 left-0 right-0 h-0.5"
                  style={{ background: TAB_COLORS[tab.id] }}
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
            </button>
          );
        })}
      </motion.div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        {/* ── Pool Overview Tab ── */}
        {activeTab === "overview" && (
          <motion.div
            key="overview"
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            transition={{ duration: 0.3, ease }}
            className="space-y-4"
          >
            {/* Pool explainer */}
            <div className="rounded-lg border border-lob-green/15 bg-lob-green/[0.03] p-4">
              <div className="flex items-start gap-3">
                <Shield className="w-4 h-4 text-lob-green mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-text-primary mb-1">Insurance Pool</p>
                  <p className="text-[10px] text-text-secondary leading-relaxed">
                    The <span className="font-mono text-text-tertiary">InsurancePool</span> contract allows LOB stakers to earn yield
                    from premiums charged on insured jobs. Buyers can create insured escrow jobs that are covered if the seller fails
                    to deliver. Premiums ({premiumRateDisplay} of job value) are distributed pro-rata to pool stakers.
                  </p>
                </div>
              </div>
            </div>

            {/* Pool stats + health ring */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Stats */}
              <div className="lg:col-span-2 card p-3 sm:p-5">
                <h3 className="text-[10px] sm:text-xs font-semibold text-text-primary uppercase tracking-wider mb-4">
                  Pool Metrics
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div>
                    <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Total Value Locked</p>
                    <p className="text-sm font-bold text-text-primary mt-0.5 tabular-nums">{fmtLob(totalDeposits)} LOB</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Premium Rate</p>
                    <p className="text-sm font-bold text-text-primary mt-0.5 tabular-nums">{premiumRateDisplay}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Total Premiums</p>
                    <p className="text-sm font-bold text-text-primary mt-0.5 tabular-nums">{fmtLob(totalPremiums)} LOB</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Claims Paid</p>
                    <p className="text-sm font-bold text-text-primary mt-0.5 tabular-nums">{fmtLob(totalClaims)} LOB</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Available</p>
                    <p className="text-sm font-bold text-text-primary mt-0.5 tabular-nums">{fmtLob(available)} LOB</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Est. APY</p>
                    <p className="text-sm font-bold text-lob-green mt-0.5 tabular-nums">{apyEstimate}</p>
                  </div>
                </div>
              </div>

              {/* Health ring */}
              <div className="card p-3 sm:p-5 flex flex-col items-center justify-center">
                <h3 className="text-[10px] sm:text-xs font-semibold text-text-primary uppercase tracking-wider mb-4">
                  Pool Health
                </h3>
                <PoolHealthRing utilization={poolUtilization} />
                <p className="text-[10px] text-text-tertiary mt-3 text-center">
                  {poolUtilization < 50
                    ? "Pool is healthy with low utilization"
                    : poolUtilization < 75
                    ? "Pool is moderately utilized"
                    : "Pool is highly utilized -- more deposits needed"}
                </p>
              </div>
            </div>

            {/* Pool Composition + User Share */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="card p-4">
                <h3 className="text-[10px] sm:text-xs font-semibold text-text-primary uppercase tracking-wider mb-2">
                  Pool Composition
                </h3>
                <PoolCompositionChart
                  deposits={totalDeposits}
                  premiums={totalPremiums}
                  claims={totalClaims}
                />
              </div>
              <div className="card p-4">
                <h3 className="text-[10px] sm:text-xs font-semibold text-text-primary uppercase tracking-wider mb-2">
                  Your Pool Share
                </h3>
                <UserShareDonut
                  myDeposited={myDeposited}
                  totalDeposits={totalDeposits}
                  poolSharePct={poolSharePct}
                />
              </div>
            </div>

            {/* How it works */}
            <InsuranceFlow />

            {/* Key mechanics */}
            <div className="card p-3 sm:p-5">
              <h3 className="text-[10px] sm:text-xs font-semibold text-text-primary uppercase tracking-wider mb-4">
                Key Mechanics
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { title: "Premium Collection", desc: `${premiumRateDisplay} of every insured job value is collected as a premium and deposited into the pool.`, icon: Percent, color: "#A855F7" },
                  { title: "Pro-Rata Yield", desc: "Premiums are distributed proportionally to all pool stakers based on their share of TVL.", icon: TrendingUp, color: "#58B059" },
                  { title: "Coverage Caps", desc: "Max payout per claim is determined by the buyer's staking tier (Bronze to Platinum).", icon: Shield, color: "#3B82F6" },
                  { title: "Claim Approval", desc: "Claims go through arbitration. Approved claims are paid from the pool within 24 hours.", icon: CheckCircle2, color: "#F59E0B" },
                ].map((item, i) => {
                  const Icon = item.icon;
                  return (
                    <motion.div
                      key={item.title}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.3 + i * 0.08 }}
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <Icon className="w-3.5 h-3.5" style={{ color: item.color }} />
                        <p className="text-xs font-semibold text-text-primary">{item.title}</p>
                      </div>
                      <p className="text-[10px] text-text-tertiary leading-relaxed">{item.desc}</p>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Stake Tab ── */}
        {activeTab === "stake" && (
          <motion.div
            key="stake"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.3, ease }}
            className="space-y-4"
          >
            {/* Stake explainer */}
            <div className="rounded-lg border border-purple-500/15 bg-purple-500/[0.03] p-4">
              <div className="flex items-start gap-3">
                <Coins className="w-4 h-4 text-purple-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-text-primary mb-1">Insurance Pool Staking</p>
                  <p className="text-[10px] text-text-secondary leading-relaxed">
                    Deposit LOB into the <span className="font-mono text-text-tertiary">InsurancePool</span> contract to earn
                    yield from premiums. This is a separate pool from seller and arbitrator staking. Your share of premiums
                    is proportional to your deposit.
                  </p>
                </div>
              </div>
            </div>

            {/* Your position */}
            <div className="card p-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                <div>
                  <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Your Deposit</p>
                  <p className="text-sm font-bold text-text-primary mt-0.5 tabular-nums">{fmtLob(myDeposited)} LOB</p>
                </div>
                <div>
                  <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Earned Premiums</p>
                  <p className="text-sm font-bold text-lob-green mt-0.5 tabular-nums">{fmtLob(myEarned)} LOB</p>
                </div>
                <div>
                  <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Pool Share</p>
                  <p className="text-sm font-bold text-text-primary mt-0.5 tabular-nums">{poolSharePct}%</p>
                </div>
                <div>
                  <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Est. APY</p>
                  <p className="text-sm font-bold text-purple-400 mt-0.5 tabular-nums">{apyEstimate}</p>
                </div>
              </div>

              {/* Pool share bar */}
              <div className="mt-4">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[10px] text-text-tertiary">Your pool share</span>
                  <span className="text-[10px] text-text-tertiary tabular-nums">
                    {fmtLob(myDeposited)} / {fmtLob(totalDeposits)} LOB
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-purple-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(0.3, parseFloat(poolSharePct === "<0.01" ? "0.01" : poolSharePct))}%` }}
                    transition={{ duration: 0.8, ease }}
                    style={{ minWidth: myDeposited > 0n ? "4px" : "0px" }}
                  />
                </div>
              </div>
            </div>

            {/* Claim rewards */}
            <div className="card p-3 sm:p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-lob-green" />
                  Claimable Rewards
                </h2>
                <span className="text-xs text-lob-green font-bold tabular-nums">{fmtLob(myEarned)} LOB</span>
              </div>
              <motion.button
                className="btn-primary w-full sm:w-auto disabled:opacity-50"
                whileHover={myEarned > 0n ? { boxShadow: "inset 0 1px 0 rgba(88,176,89,0.12), 0 4px 16px rgba(88,176,89,0.08)" } : undefined}
                whileTap={myEarned > 0n ? { scale: 0.97 } : undefined}
                disabled={myEarned === 0n || txPending}
                onClick={handleClaimRewards}
              >
                {txPending ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Processing...
                  </span>
                ) : (
                  "Claim Rewards"
                )}
              </motion.button>
              <p className="text-[10px] text-text-tertiary mt-2">
                Rewards accrue continuously from premiums on insured jobs.
              </p>
            </div>

            {/* Deposit form */}
            <div className="card p-3 sm:p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-text-tertiary" />
                  Deposit LOB
                </h2>
                <span className="text-xs text-text-tertiary tabular-nums">
                  Available: {fmtLob(lobBalance)} LOB
                </span>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="number"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  placeholder="Amount to deposit"
                  className="input-field flex-1 tabular-nums"
                />
                <motion.button
                  className="btn-primary disabled:opacity-50"
                  whileHover={depositAmount ? { boxShadow: "inset 0 1px 0 rgba(88,176,89,0.12), 0 4px 16px rgba(88,176,89,0.08)" } : undefined}
                  whileTap={depositAmount ? { scale: 0.97 } : undefined}
                  disabled={!depositAmount || txPending}
                  onClick={handleDeposit}
                >
                  {txPending ? (
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Processing...
                    </span>
                  ) : (
                    "Approve & Deposit"
                  )}
                </motion.button>
              </div>
              <p className="text-[10px] text-text-tertiary mt-2">
                No lockup period. Withdrawals may be delayed if pool utilization is above 90%.
              </p>
            </div>

            {/* Withdraw form */}
            <div className="card p-3 sm:p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
                  <Unlock className="w-3.5 h-3.5 text-text-tertiary" />
                  Withdraw LOB
                </h2>
                <span className="text-xs text-text-tertiary tabular-nums">
                  Deposited: {fmtLob(myDeposited)} LOB
                </span>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="number"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  placeholder="Amount to withdraw"
                  className="input-field flex-1 tabular-nums"
                />
                <motion.button
                  className="btn-secondary disabled:opacity-50"
                  whileTap={withdrawAmount ? { scale: 0.97 } : undefined}
                  disabled={!withdrawAmount || txPending}
                  onClick={handleWithdraw}
                >
                  {txPending ? (
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Processing...
                    </span>
                  ) : (
                    "Withdraw"
                  )}
                </motion.button>
              </div>
              <p className="text-[10px] text-text-tertiary mt-2">
                Withdrawals reduce your pool share and future premium earnings.
              </p>
            </div>

            {/* APY breakdown */}
            <div className="card p-3 sm:p-5">
              <h3 className="text-[10px] sm:text-xs font-semibold text-text-primary uppercase tracking-wider mb-3">
                APY Breakdown
              </h3>
              <div className="rounded-lg border border-border/40 bg-surface-1/30 p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-[10px] text-text-tertiary">Total premiums collected</span>
                  <span className="text-xs text-text-secondary tabular-nums">{fmtLob(totalPremiums)} LOB</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[10px] text-text-tertiary">Total claims paid</span>
                  <span className="text-xs text-text-secondary tabular-nums">-{fmtLob(totalClaims)} LOB</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[10px] text-text-tertiary">Net premium income</span>
                  <span className="text-xs text-text-primary font-medium tabular-nums">
                    {fmtLob(
                      totalPremiums && totalClaims
                        ? totalPremiums > totalClaims
                          ? totalPremiums - totalClaims
                          : 0n
                        : totalPremiums ?? 0n
                    )} LOB
                  </span>
                </div>
                <div className="border-t border-border/30 pt-2 mt-2 flex justify-between">
                  <span className="text-[10px] text-text-primary font-semibold">Annualized Yield</span>
                  <span className="text-xs text-lob-green font-bold tabular-nums">{apyEstimate}</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Coverage Tab ── */}
        {activeTab === "coverage" && (
          <motion.div
            key="coverage"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.3, ease }}
            className="space-y-4"
          >
            {/* Coverage explainer */}
            <div className="rounded-lg border border-blue-500/15 bg-blue-500/[0.03] p-4">
              <div className="flex items-start gap-3">
                <Shield className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-text-primary mb-1">How Insured Jobs Work</p>
                  <p className="text-[10px] text-text-secondary leading-relaxed">
                    When creating an escrow job, buyers can opt-in to insurance by paying a {premiumRateDisplay} premium.
                    If the seller fails to deliver and a dispute is resolved in the buyer&apos;s favor,
                    the insurance pool covers the loss up to the coverage cap for the buyer&apos;s tier.
                    Coverage caps are determined by the buyer&apos;s staking tier in the seller pool.
                  </p>
                </div>
              </div>
            </div>

            {/* Your coverage cap */}
            {coverageCap !== undefined && (
              <div className="card p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Your Coverage Cap</p>
                    <p className="text-lg font-bold text-blue-400 mt-0.5 tabular-nums">{fmtLob(coverageCap)} LOB</p>
                  </div>
                  <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                    <Shield className="w-5 h-5 text-blue-400" />
                  </div>
                </div>
                <p className="text-[10px] text-text-tertiary mt-2">
                  Based on your current staking tier. Stake more LOB to unlock higher coverage caps.
                </p>
              </div>
            )}

            {/* Coverage tiers */}
            <div className="card p-3 sm:p-5">
              <h3 className="text-[10px] sm:text-xs font-semibold text-text-primary uppercase tracking-wider mb-4">
                Coverage Caps by Tier
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {COVERAGE_TIERS.map((tier, i) => (
                  <motion.div
                    key={tier.name}
                    className="rounded-lg border p-4 relative overflow-hidden group"
                    style={{ borderColor: `${tier.color}20` }}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.2 + i * 0.1, ease }}
                    whileHover={{ y: -2, borderColor: `${tier.color}40` }}
                  >
                    <motion.div
                      className="absolute top-0 left-0 right-0 h-px opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ background: `linear-gradient(to right, transparent, ${tier.color}30, transparent)` }}
                    />
                    <div className="flex items-center gap-2 mb-3">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: `${tier.color}15` }}
                      >
                        <Shield className="w-4 h-4" style={{ color: tier.color }} />
                      </div>
                      <div>
                        <p className="text-sm font-bold" style={{ color: tier.color }}>{tier.name}</p>
                        <p className="text-[9px] text-text-tertiary">Requires {tier.minStake} staked</p>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex justify-between">
                        <span className="text-[10px] text-text-tertiary">Max Coverage</span>
                        <span className="text-[10px] font-bold tabular-nums" style={{ color: tier.color }}>
                          {tier.maxCoverage} LOB
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[10px] text-text-tertiary">Premium Cost</span>
                        <span className="text-[10px] text-text-secondary font-medium tabular-nums">{premiumRateDisplay} of job</span>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Create insured job CTA */}
            <div className="card p-3 sm:p-5 text-center">
              <div className="w-10 h-10 rounded-full bg-blue-500/10 mx-auto mb-3 flex items-center justify-center">
                <Shield className="w-5 h-5 text-blue-400" />
              </div>
              <p className="text-sm font-medium text-text-primary">Create an Insured Job</p>
              <p className="text-xs text-text-tertiary mt-1 max-w-sm mx-auto">
                Head to the marketplace to create an escrow job with insurance coverage.
              </p>
              <Link href="/marketplace">
                <motion.button
                  className="btn-primary mt-4"
                  whileHover={{ boxShadow: "inset 0 1px 0 rgba(88,176,89,0.12), 0 4px 16px rgba(88,176,89,0.08)" }}
                  whileTap={{ scale: 0.97 }}
                >
                  Go to Marketplace
                </motion.button>
              </Link>
            </div>
          </motion.div>
        )}

        {/* ── Claims Tab ── */}
        {activeTab === "claims" && (
          <motion.div
            key="claims"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.3, ease }}
            className="space-y-4"
          >
            {/* File a claim */}
            <div className="card p-3 sm:p-5">
              <h3 className="text-[10px] sm:text-xs font-semibold text-text-primary uppercase tracking-wider mb-4">
                File an Insurance Claim
              </h3>

              {claimSubmitted ? (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-center py-4"
                >
                  <div className="w-10 h-10 rounded-full bg-lob-green-muted mx-auto mb-3 flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5 text-lob-green" />
                  </div>
                  <p className="text-sm font-medium text-text-primary">Claim Filed On-Chain</p>
                  <p className="text-xs text-text-tertiary mt-1">
                    Your claim has been submitted to the InsurancePool contract. Approved claims will be paid automatically.
                  </p>
                  <motion.button
                    className="btn-secondary mt-4"
                    whileTap={{ scale: 0.97 }}
                    onClick={() => { setClaimSubmitted(false); setClaimJobId(""); setClaimReason(""); setTxError(""); }}
                  >
                    File Another Claim
                  </motion.button>
                </motion.div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-lg border border-amber-500/15 bg-amber-500/[0.03] p-3">
                    <p className="text-[10px] text-amber-400 flex items-start gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                      <span>
                        Claims can only be filed on insured jobs where you are the buyer and the job
                        has an active dispute resolved in your favor, or the seller failed to deliver.
                        The <span className="font-mono">fileClaim</span> contract call will revert if conditions are not met.
                      </span>
                    </p>
                  </div>

                  <div>
                    <label className="block text-[10px] font-medium text-text-tertiary uppercase tracking-wider mb-1.5">
                      Job ID
                    </label>
                    <input
                      type="number"
                      value={claimJobId}
                      onChange={(e) => setClaimJobId(e.target.value)}
                      placeholder="Enter insured job ID"
                      className="input-field w-full tabular-nums"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-medium text-text-tertiary uppercase tracking-wider mb-1.5">
                      Reason for Claim (local notes only)
                    </label>
                    <textarea
                      value={claimReason}
                      onChange={(e) => setClaimReason(e.target.value)}
                      placeholder="Describe why you are filing this claim..."
                      maxLength={500}
                      rows={4}
                      className="input-field resize-none"
                    />
                    <p className="text-[10px] text-text-tertiary mt-1 text-right tabular-nums">
                      {claimReason.length}/500
                    </p>
                  </div>

                  <motion.button
                    className="btn-primary disabled:opacity-50"
                    whileHover={claimJobId ? { boxShadow: "inset 0 1px 0 rgba(88,176,89,0.12), 0 4px 16px rgba(88,176,89,0.08)" } : undefined}
                    whileTap={claimJobId ? { scale: 0.97 } : undefined}
                    disabled={!claimJobId || txPending}
                    onClick={handleFileClaim}
                  >
                    {txPending ? (
                      <span className="flex items-center gap-1.5">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Filing Claim...
                      </span>
                    ) : (
                      "Submit Claim"
                    )}
                  </motion.button>
                </div>
              )}
            </div>

            {/* Pool claims summary */}
            <div className="card p-3 sm:p-5">
              <h3 className="text-[10px] sm:text-xs font-semibold text-text-primary uppercase tracking-wider mb-4">
                Pool Claims Summary
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div>
                  <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Total Claims Paid</p>
                  <p className="text-sm font-bold text-text-primary mt-0.5 tabular-nums">{fmtLob(totalClaims)} LOB</p>
                </div>
                <div>
                  <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Total Premiums</p>
                  <p className="text-sm font-bold text-text-primary mt-0.5 tabular-nums">{fmtLob(totalPremiums)} LOB</p>
                </div>
                <div>
                  <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Claims Ratio</p>
                  <p className="text-sm font-bold text-amber-400 mt-0.5 tabular-nums">{claimsRatio}</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer summary */}
      <motion.div variants={fadeUp} className="mt-8">
        <div className="card p-3 sm:p-5">
          <h3 className="text-[10px] sm:text-xs font-semibold text-text-primary uppercase tracking-wider mb-4">
            Insurance Pool Summary
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-lg border border-lob-green/15 p-3">
              <div className="flex items-center gap-2 mb-2">
                <Coins className="w-4 h-4 text-lob-green" />
                <p className="text-xs font-semibold text-text-primary">Stakers</p>
              </div>
              <p className="text-[10px] text-text-tertiary leading-relaxed">
                Deposit LOB to earn yield from premiums. Pro-rata distribution based on pool share.
                No lockup, but withdrawals may be delayed during high utilization.
              </p>
            </div>
            <div className="rounded-lg border border-blue-500/15 p-3">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-4 h-4 text-blue-400" />
                <p className="text-xs font-semibold text-text-primary">Buyers</p>
              </div>
              <p className="text-[10px] text-text-tertiary leading-relaxed">
                Opt-in to insurance when creating escrow jobs. {premiumRateDisplay} premium covers you if the seller
                fails to deliver. Coverage caps depend on your staking tier.
              </p>
            </div>
            <div className="rounded-lg border border-amber-500/15 p-3">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-4 h-4 text-amber-400" />
                <p className="text-xs font-semibold text-text-primary">Claims</p>
              </div>
              <p className="text-[10px] text-text-tertiary leading-relaxed">
                File a claim on a disputed insured job. Claims are reviewed by arbitrators.
                Approved claims are paid from the pool up to your coverage cap.
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
