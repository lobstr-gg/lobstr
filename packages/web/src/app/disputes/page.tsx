"use client";

import { useState, useMemo } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { stagger, fadeUp, ease } from "@/lib/motion";
import {
  useArbitratorInfo,
  useApproveToken,
  useStakeAsArbitrator,
  useAppealRuling,
  useFinalizeRuling,
  usePauseAsArbitrator,
  useUnpauseAsArbitrator,
  useIsArbitratorPaused,
} from "@/lib/hooks";
import { getContracts, CHAIN } from "@/config/contracts";
import { parseEther, formatEther } from "viem";
import { useQuery } from "@tanstack/react-query";
import { fetchDisputesForAddress, isIndexerConfigured, type IndexerDispute } from "@/lib/indexer";
import {
  Shield,
  FileText,
  Users,
  Gavel,
  Scale,
  ArrowRight,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Eye,
  Vote,
  Pause,
  Play,
  ShieldAlert,
} from "lucide-react";
import { InfoButton } from "@/components/InfoButton";

type TabId = "assigned" | "my-disputes" | "appeals" | "history";

const TABS: { id: TabId; label: string }[] = [
  { id: "assigned", label: "Assigned to Me" },
  { id: "my-disputes", label: "My Disputes" },
  { id: "appeals", label: "Appeals" },
  { id: "history", label: "History" },
];

const RANK_NAMES = ["Unranked", "Junior", "Senior", "Principal"];

const DISPUTE_STATUS_LABELS: Record<number, string> = {
  0: "Open",
  1: "Evidence",
  2: "Voting",
  3: "Resolved",
  4: "Appealed",
  5: "Finalized",
};

const DISPUTE_STATUS_COLORS: Record<number, { bg: string; text: string; border: string }> = {
  0: { bg: "bg-yellow-500/10", text: "text-yellow-400", border: "border-yellow-400/20" },
  1: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-400/20" },
  2: { bg: "bg-purple-500/10", text: "text-purple-400", border: "border-purple-400/20" },
  3: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-400/20" },
  4: { bg: "bg-purple-500/10", text: "text-purple-400", border: "border-purple-400/20" },
  5: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-400/20" },
};

/** Appeal window: 48 hours after resolution */
const APPEAL_WINDOW_SECONDS = 48 * 60 * 60;

/* ──── Status Distribution Mini-Chart ──── */

const STATUS_BAR_COLORS: Record<number, string> = {
  0: "#F59E0B",
  1: "#3B82F6",
  2: "#A855F7",
  3: "#58B059",
  4: "#A855F7",
  5: "#58B059",
};

function DisputeStatusDistribution({ disputes }: { disputes: IndexerDispute[] }) {
  const chartData = useMemo(() => {
    const counts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    disputes.forEach((d) => {
      counts[d.status] = (counts[d.status] ?? 0) + 1;
    });
    return [
      { label: "Open", status: 0, count: counts[0], fill: STATUS_BAR_COLORS[0] },
      { label: "Evidence", status: 1, count: counts[1], fill: STATUS_BAR_COLORS[1] },
      { label: "Voting", status: 2, count: counts[2], fill: STATUS_BAR_COLORS[2] },
      { label: "Resolved", status: 3, count: counts[3], fill: STATUS_BAR_COLORS[3] },
      { label: "Appealed", status: 4, count: counts[4], fill: STATUS_BAR_COLORS[4] },
      { label: "Finalized", status: 5, count: counts[5], fill: STATUS_BAR_COLORS[5] },
    ];
  }, [disputes]);

  const total = disputes.length;

  if (total === 0) {
    // Show placeholder with zero counts
    return (
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[10px] sm:text-xs font-semibold text-text-primary uppercase tracking-wider flex items-center gap-1.5">
            Status Distribution
            <InfoButton infoKey="disputes.statusDistribution" />
          </h3>
          <span className="text-[10px] text-text-tertiary tabular-nums">{total} total</span>
        </div>
        {/* Inline horizontal segments */}
        <div className="flex items-center gap-1 h-6 rounded-full bg-surface-3 overflow-hidden mb-3">
          <div className="h-full w-full flex items-center justify-center">
            <span className="text-[10px] text-text-tertiary">No disputes yet</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {chartData.map((d) => (
            <div key={d.label} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.fill }} />
              <span className="text-[10px] text-text-tertiary">{d.label}</span>
              <span className="text-[10px] text-text-secondary font-bold tabular-nums">{d.count}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[10px] sm:text-xs font-semibold text-text-primary uppercase tracking-wider flex items-center gap-1.5">
          Status Distribution
          <InfoButton infoKey="disputes.statusDistribution" />
        </h3>
        <span className="text-[10px] text-text-tertiary tabular-nums">{total} total</span>
      </div>
      {/* Horizontal stacked bar */}
      <div className="flex items-center h-6 rounded-full overflow-hidden mb-3">
        {chartData
          .filter((d) => d.count > 0)
          .map((d) => {
            const pct = (d.count / total) * 100;
            return (
              <motion.div
                key={d.label}
                className="h-full flex items-center justify-center relative group"
                style={{ backgroundColor: d.fill, width: `${pct}%`, minWidth: pct > 0 ? "20px" : "0" }}
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                title={`${d.label}: ${d.count}`}
              >
                {pct > 12 && (
                  <span className="text-[9px] font-bold text-white/90 tabular-nums">{d.count}</span>
                )}
              </motion.div>
            );
          })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {chartData.map((d) => (
          <div key={d.label} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.fill }} />
            <span className="text-[10px] text-text-tertiary">{d.label}</span>
            <span className="text-[10px] text-text-secondary font-bold tabular-nums">{d.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ──── Dispute Resolution Flow (SVG) ──── */
function DisputeFlow() {
  const steps = [
    { icon: FileText, label: "File Dispute", desc: "Buyer submits evidence and locks escrow", color: "#F59E0B" },
    { icon: Eye, label: "Evidence Phase", desc: "Seller has 24h to submit counter-evidence", color: "#3B82F6" },
    { icon: Vote, label: "Arbitrator Vote", desc: "3-person panel reviews and votes (3 days)", color: "#A855F7" },
    { icon: AlertTriangle, label: "Appeal Window", desc: "Losing party has 48h to appeal with 500 LOB bond", color: "#F59E0B" },
    { icon: Gavel, label: "Ruling Finalized", desc: "Anyone calls finalizeRuling() to execute outcome", color: "#58B059" },
  ];

  return (
    <div className="card p-5">
      <h3 className="text-[10px] sm:text-xs font-semibold text-text-primary uppercase tracking-wider mb-5 flex items-center gap-1.5">
        How Disputes Work
        <InfoButton infoKey="disputes.howDisputesWork" />
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 sm:gap-3">
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
              {/* Connector arrow (desktop) */}
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

/* ──── Arbitrator Tiers Visual ──── */
function ArbitratorTiers() {
  const tiers = [
    {
      name: "Junior",
      stake: "5,000 LOB",
      maxDispute: "500 LOB",
      fee: "5%",
      reward: "1x",
      color: "#CD7F32",
      icon: Shield,
    },
    {
      name: "Senior",
      stake: "25,000 LOB",
      maxDispute: "5,000 LOB",
      fee: "4%",
      reward: "1.5x",
      color: "#848E9C",
      icon: Shield,
    },
    {
      name: "Principal",
      stake: "100,000 LOB",
      maxDispute: "Unlimited",
      fee: "3%",
      reward: "2x",
      color: "#58B059",
      icon: Shield,
    },
  ];

  return (
    <div className="card p-5">
      <h3 className="text-[10px] sm:text-xs font-semibold text-text-primary uppercase tracking-wider mb-4 flex items-center gap-1.5">
        Arbitrator Tiers
        <InfoButton infoKey="disputes.arbitratorTiers" />
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {tiers.map((tier, i) => {
          const Icon = tier.icon;
          return (
            <motion.div
              key={tier.name}
              className="rounded-lg border border-border/60 p-4 hover:border-opacity-100 transition-colors relative overflow-hidden group"
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
                  <Icon className="w-4 h-4" style={{ color: tier.color }} />
                </div>
                <div>
                  <p className="text-sm font-bold" style={{ color: tier.color }}>{tier.name}</p>
                  <p className="text-[9px] text-text-tertiary tabular-nums">{tier.stake} min</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-[10px] text-text-tertiary">Max Dispute</span>
                  <span className="text-[10px] text-text-secondary font-medium tabular-nums">{tier.maxDispute}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[10px] text-text-tertiary">Arb Fee</span>
                  <span className="text-[10px] text-text-secondary font-medium tabular-nums">{tier.fee}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[10px] text-text-tertiary">Reward Mult</span>
                  <span className="text-[10px] font-medium tabular-nums" style={{ color: tier.color }}>{tier.reward}</span>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

/* ──── Protocol Stats ──── */
function ProtocolDisputeStats() {
  const stats = [
    { label: "Resolution Rate", value: "100%", sub: "all disputes resolved", icon: CheckCircle2, color: "#58B059" },
    { label: "Avg Resolution", value: "4.2d", sub: "evidence + voting", icon: Clock, color: "#3B82F6" },
    { label: "Active Arbitrators", value: "0", sub: "staked & ready", icon: Users, color: "#A855F7" },
    { label: "Total Disputes", value: "0", sub: "on-chain", icon: Scale, color: "#F59E0B" },
    { label: "Slash Rate", value: "10%", sub: "of loser stake", icon: AlertTriangle, color: "#EF4444" },
    { label: "Reward Pool", value: "2%", sub: "of dispute value", icon: TrendingUp, color: "#58B059" },
    { label: "Appeals Filed", value: "0", sub: "total appeals", icon: Gavel, color: "#F59E0B" },
    { label: "Finalized", value: "0", sub: "rulings executed", icon: CheckCircle2, color: "#58B059" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
      {stats.map((stat, i) => {
        const Icon = stat.icon;
        return (
          <motion.div
            key={stat.label}
            className="card p-3 sm:p-4 relative overflow-hidden group"
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.1 + i * 0.05, ease }}
            whileHover={{ y: -2 }}
          >
            <motion.div
              className="absolute top-0 left-0 right-0 h-px opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ background: `linear-gradient(to right, transparent, ${stat.color}30, transparent)` }}
            />
            <Icon className="w-4 h-4 mb-2" style={{ color: stat.color }} />
            <p className="text-lg sm:text-xl font-bold text-text-primary tabular-nums">{stat.value}</p>
            <p className="text-[9px] text-text-tertiary uppercase tracking-wider mt-0.5">{stat.label}</p>
          </motion.div>
        );
      })}
    </div>
  );
}

/* ──── Appeal Window Countdown ──── */
function AppealCountdown({ resolvedAt }: { resolvedAt: number }) {
  const deadline = resolvedAt + APPEAL_WINDOW_SECONDS;
  const now = Math.floor(Date.now() / 1000);
  const remaining = deadline - now;

  if (remaining <= 0) return null;

  const hours = Math.floor(remaining / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);

  return (
    <span className="text-[10px] text-yellow-400 flex items-center gap-1">
      <Clock className="w-3 h-3" />
      Appeal: {hours}h {minutes}m left
    </span>
  );
}

/* ──── Dispute Card ──── */
function DisputeCard({
  dispute,
  role,
  userAddress,
}: {
  dispute: IndexerDispute;
  role: string;
  userAddress: string;
}) {
  const statusNum = dispute.status;
  const statusLabel = DISPUTE_STATUS_LABELS[statusNum] ?? "Unknown";
  const colors = DISPUTE_STATUS_COLORS[statusNum] ?? DISPUTE_STATUS_COLORS[0];
  const amount = Number(formatEther(BigInt(dispute.amount)));
  const date = new Date(Number(dispute.createdAt) * 1000).toLocaleDateString();
  const contracts = getContracts(CHAIN.id);

  const appealRuling = useAppealRuling();
  const finalizeRuling = useFinalizeRuling();
  const approveToken = useApproveToken();

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Determine if user is the losing party (for appeal eligibility)
  const addr = userAddress.toLowerCase();
  const isBuyer = dispute.buyer.toLowerCase() === addr;
  const isSeller = dispute.seller.toLowerCase() === addr;
  // ruling: 1 = FavorBuyer, 2 = FavorSeller
  const isLosingParty =
    (isBuyer && dispute.ruling === 2) || (isSeller && dispute.ruling === 1);

  // Appeal window timing
  // Approximate: createdAt + some offset for resolved. We use createdAt as a proxy for now.
  // In real usage, the indexer would provide the resolution timestamp.
  const resolvedTimestamp = Number(dispute.createdAt);
  const appealDeadline = resolvedTimestamp + APPEAL_WINDOW_SECONDS;
  const now = Math.floor(Date.now() / 1000);
  const appealWindowActive = statusNum === 3 && now <= appealDeadline;
  const appealWindowExpired = statusNum === 3 && now > appealDeadline;

  const handleAppeal = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!contracts) return;
    setActionError(null);
    setActionLoading("appeal");
    try {
      // Approve 500 LOB bond first
      const bondAmount = parseEther("500");
      await approveToken(contracts.lobToken, contracts.disputeArbitration, bondAmount);
      await appealRuling(BigInt(dispute.id));
      setActionLoading(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Appeal failed");
      setActionLoading(null);
    }
  };

  const handleFinalize = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setActionError(null);
    setActionLoading("finalize");
    try {
      await finalizeRuling(BigInt(dispute.id));
      setActionLoading(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Finalize failed");
      setActionLoading(null);
    }
  };

  return (
    <Link href={`/disputes/${dispute.id}`}>
      <motion.div
        className="card p-4 hover:border-lob-green/20 transition-colors cursor-pointer"
        whileHover={{ y: -2 }}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-text-primary tabular-nums">
              Dispute #{dispute.id}
            </span>
            <span className={`text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded ${colors.bg} ${colors.text} border ${colors.border}`}>
              {statusLabel}
            </span>
            {/* Appeal status indicator */}
            {statusNum >= 4 && (
              <span className="text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-400/20 flex items-center gap-0.5">
                <AlertTriangle className="w-2.5 h-2.5" />
                {statusNum === 4 ? "Under Appeal" : "Final"}
              </span>
            )}
          </div>
          <span className="text-xs text-text-tertiary">{date}</span>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-xs text-text-tertiary">
            <span>Job #{dispute.jobId}</span>
            <span>{amount.toLocaleString()} LOB</span>
            <span className="capitalize">{role}</span>
          </div>
          <div className="flex items-center gap-2">
            {statusNum === 2 && (
              <span className="text-[10px] text-purple-400">
                {dispute.votesForBuyer + dispute.votesForSeller}/3 votes
              </span>
            )}
            {/* Appeal window countdown */}
            {appealWindowActive && (
              <AppealCountdown resolvedAt={resolvedTimestamp} />
            )}
          </div>
        </div>

        {/* Action buttons */}
        {(appealWindowActive || appealWindowExpired) && (
          <div className="mt-3 pt-3 border-t border-border/40 flex items-center gap-2 flex-wrap">
            {/* Appeal button for losing party */}
            {appealWindowActive && isLosingParty && (
              <motion.button
                className="text-[10px] font-medium px-3 py-1.5 rounded bg-purple-500/10 text-purple-400 border border-purple-400/20 hover:bg-purple-500/20 transition-colors"
                whileTap={{ scale: 0.97 }}
                onClick={handleAppeal}
                disabled={actionLoading === "appeal"}
              >
                {actionLoading === "appeal" ? "Appealing..." : "Appeal Ruling (500 LOB bond)"}
              </motion.button>
            )}
            {/* Finalize button (permissionless) */}
            {appealWindowExpired && statusNum === 3 && (
              <motion.button
                className="text-[10px] font-medium px-3 py-1.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-400/20 hover:bg-emerald-500/20 transition-colors"
                whileTap={{ scale: 0.97 }}
                onClick={handleFinalize}
                disabled={actionLoading === "finalize"}
              >
                {actionLoading === "finalize" ? "Finalizing..." : "Finalize Ruling"}
              </motion.button>
            )}
            {actionError && (
              <span className="text-[10px] text-red-400">{actionError}</span>
            )}
          </div>
        )}
      </motion.div>
    </Link>
  );
}

/* ──── Arbitrator Controls ──── */
function ArbitratorControls({
  arbData,
  address,
}: {
  arbData: {
    rank: number;
    disputesHandled: bigint;
    majorityVotes: bigint;
    active: boolean;
    stake: bigint;
  };
  address: `0x${string}`;
}) {
  const { data: isPaused, refetch: refetchPaused } = useIsArbitratorPaused(address);
  const pauseArb = usePauseAsArbitrator();
  const unpauseArb = useUnpauseAsArbitrator();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const disputesHandled = Number(arbData.disputesHandled);
  const majorityVotesPct = Number(arbData.majorityVotes);
  const isActive = arbData.active;

  // Simple collusion risk indicator
  // If majority vote rate is 100% with > 10 disputes, flag as potential rubber-stamp
  const collusionRisk =
    majorityVotesPct === 100 && disputesHandled > 10
      ? "high"
      : majorityVotesPct >= 95 && disputesHandled > 5
      ? "medium"
      : "low";

  const collusionColors: Record<string, { bg: string; text: string; label: string }> = {
    low: { bg: "bg-emerald-500/10", text: "text-emerald-400", label: "Low" },
    medium: { bg: "bg-yellow-500/10", text: "text-yellow-400", label: "Medium" },
    high: { bg: "bg-red-500/10", text: "text-red-400", label: "High" },
  };

  const handleTogglePause = async () => {
    setError(null);
    setLoading(true);
    try {
      if (isPaused) {
        await unpauseArb();
      } else {
        await pauseArb();
      }
      await refetchPaused();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    }
    setLoading(false);
  };

  if (!isActive) return null;

  const risk = collusionColors[collusionRisk];

  return (
    <div className="card p-5">
      <h3 className="text-[10px] sm:text-xs font-semibold text-text-primary uppercase tracking-wider mb-4 flex items-center gap-1.5">
        Arbitrator Controls
        <InfoButton infoKey="disputes.arbitratorControls" />
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Pause/Unpause */}
        <div className="flex items-center justify-between rounded-lg border border-border/60 p-4">
          <div>
            <p className="text-xs font-semibold text-text-primary">Availability</p>
            <p className="text-[10px] text-text-tertiary mt-0.5">
              {isPaused ? "You are paused and will not receive new assignments" : "You are active and accepting dispute assignments"}
            </p>
          </div>
          <motion.button
            className={`flex items-center gap-1.5 text-[10px] font-medium px-3 py-1.5 rounded border transition-colors ${
              isPaused
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-400/20 hover:bg-emerald-500/20"
                : "bg-yellow-500/10 text-yellow-400 border-yellow-400/20 hover:bg-yellow-500/20"
            }`}
            whileTap={{ scale: 0.97 }}
            onClick={handleTogglePause}
            disabled={loading}
          >
            {isPaused ? (
              <>
                <Play className="w-3 h-3" />
                {loading ? "Unpausing..." : "Unpause"}
              </>
            ) : (
              <>
                <Pause className="w-3 h-3" />
                {loading ? "Pausing..." : "Pause"}
              </>
            )}
          </motion.button>
        </div>

        {/* Quality Metrics */}
        <div className="rounded-lg border border-border/60 p-4">
          <p className="text-xs font-semibold text-text-primary mb-3">Quality Metrics</p>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-text-tertiary">Majority Vote Rate</span>
              <span className="text-[10px] text-text-secondary font-medium tabular-nums">{majorityVotesPct}%</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-text-tertiary">Disputes Handled</span>
              <span className="text-[10px] text-text-secondary font-medium tabular-nums">{disputesHandled}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-text-tertiary">Collusion Risk</span>
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${risk.bg} ${risk.text} flex items-center gap-1`}>
                <ShieldAlert className="w-2.5 h-2.5" />
                {risk.label}
              </span>
            </div>
          </div>
        </div>
      </div>
      {error && (
        <p className="text-xs text-red-400 mt-2">{error}</p>
      )}
    </div>
  );
}

/* ──── Main Page ──── */
export default function DisputesPage() {
  const { isConnected, address } = useAccount();
  const [activeTab, setActiveTab] = useState<TabId>("assigned");
  const { data: arbInfo, isLoading: arbLoading } = useArbitratorInfo(address);
  const contracts = getContracts(CHAIN.id);

  // Arbitrator staking state
  const [stakeAmount, setStakeAmount] = useState("");
  const [showStaking, setShowStaking] = useState(false);
  const [stakeStep, setStakeStep] = useState<"input" | "approving" | "staking" | "done">("input");
  const [stakeError, setStakeError] = useState<string | null>(null);
  const approveToken = useApproveToken();
  const stakeAsArbitrator = useStakeAsArbitrator();

  // Fetch disputes from indexer
  const { data: disputes, isLoading: disputesLoading } = useQuery({
    queryKey: ["disputes", address],
    queryFn: () => fetchDisputesForAddress(address!),
    enabled: !!address && isIndexerConfigured(),
    refetchInterval: 30_000,
  });

  // arbInfo may be a tuple or object depending on ABI encoding
  const arbData = useMemo(() => {
    if (!arbInfo) return undefined;
    // Handle both tuple (array) and struct (object) returns
    if (Array.isArray(arbInfo)) {
      return {
        rank: Number(arbInfo[0] ?? 0),
        disputesHandled: BigInt(arbInfo[1] ?? 0),
        majorityVotes: BigInt(arbInfo[2] ?? 0),
        active: Boolean(arbInfo[3]),
        stake: BigInt(arbInfo[4] ?? 0),
      };
    }
    const info = arbInfo as { rank?: number; disputesHandled?: bigint; majorityVotes?: bigint; active?: boolean; stake?: bigint };
    return {
      rank: Number(info.rank ?? 0),
      disputesHandled: BigInt(info.disputesHandled ?? 0),
      majorityVotes: BigInt(info.majorityVotes ?? 0),
      active: Boolean(info.active),
      stake: BigInt(info.stake ?? 0),
    };
  }, [arbInfo]);
  const arbTier = arbData ? arbData.rank : undefined;
  const casesHandled = arbData ? Number(arbData.disputesHandled) : undefined;
  const majorityRate = arbData ? Number(arbData.majorityVotes) : undefined;
  const arbStake = arbData ? arbData.stake : BigInt(0);

  const STATS = [
    { label: "Arbitrator Rank", value: arbLoading ? "--" : RANK_NAMES[arbTier ?? 0] ?? "Unranked", highlight: arbTier !== undefined && arbTier > 0 },
    { label: "Disputes Handled", value: arbLoading ? "--" : String(casesHandled ?? 0), highlight: false },
    { label: "Majority Vote Rate", value: arbLoading ? "--" : majorityRate !== undefined ? `${majorityRate}%` : "--", highlight: false },
    { label: "Arb Stake", value: arbLoading ? "--" : `${Number(formatEther(arbStake)).toLocaleString()}`, sub: "LOB", highlight: false },
  ];

  // Filter disputes by tab
  const addr = address?.toLowerCase() ?? "";
  const filteredDisputes = useMemo(() => (disputes ?? []).filter((d) => {
    const isAssigned = [d.arbitrator0, d.arbitrator1, d.arbitrator2].some(
      (a) => a?.toLowerCase() === addr
    );
    const isParty = d.buyer.toLowerCase() === addr || d.seller.toLowerCase() === addr;

    switch (activeTab) {
      case "assigned":
        return isAssigned && d.status < 3;
      case "my-disputes":
        return isParty && d.status < 3;
      case "appeals":
        return d.status === 4;
      case "history":
        return d.status === 3 || d.status === 5;
      default:
        return false;
    }
  }), [disputes, activeTab, addr]);

  function getRole(d: IndexerDispute): string {
    if (d.buyer.toLowerCase() === addr) return "buyer";
    if (d.seller.toLowerCase() === addr) return "seller";
    if ([d.arbitrator0, d.arbitrator1, d.arbitrator2].some((a) => a?.toLowerCase() === addr)) return "arbitrator";
    return "spectator";
  }

  const tabCounts = useMemo(() => {
    if (!disputes) return { assigned: 0, "my-disputes": 0, appeals: 0, history: 0 };
    return {
      assigned: disputes.filter((d) =>
        [d.arbitrator0, d.arbitrator1, d.arbitrator2].some((a) => a?.toLowerCase() === addr) && d.status < 3
      ).length,
      "my-disputes": disputes.filter((d) =>
        (d.buyer.toLowerCase() === addr || d.seller.toLowerCase() === addr) && d.status < 3
      ).length,
      appeals: disputes.filter((d) => d.status === 4).length,
      history: disputes.filter((d) => d.status === 3 || d.status === 5).length,
    };
  }, [disputes, addr]);

  const handleStake = async () => {
    if (!stakeAmount || !contracts) return;
    setStakeError(null);

    try {
      const amount = parseEther(stakeAmount);

      // Step 1: Approve LOB to dispute arbitration contract
      setStakeStep("approving");
      await approveToken(contracts.lobToken, contracts.disputeArbitration, amount);

      // Step 2: Stake
      setStakeStep("staking");
      stakeAsArbitrator(amount);

      setStakeStep("done");
    } catch (err) {
      setStakeError(err instanceof Error ? err.message : "Staking failed");
      setStakeStep("input");
    }
  };

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
              "rgba(255,59,105,0.3)",
              "rgba(30,36,49,1)",
            ],
          }}
          transition={{ duration: 3, repeat: Infinity }}
        >
          <Scale className="w-6 h-6 text-lob-red/60" />
        </motion.div>
        <h1 className="text-xl font-bold text-text-primary">Dispute Center</h1>
        <p className="text-sm text-text-secondary">Connect your wallet to view disputes.</p>
        <ConnectButton />
      </motion.div>
    );
  }

  return (
    <motion.div initial="hidden" animate="show" variants={stagger}>
      <motion.div variants={fadeUp} className="mb-6">
        <h1 className="text-xl font-bold text-text-primary flex items-center gap-1.5">Dispute Center <InfoButton infoKey="disputes.header" /></h1>
        <p className="text-xs text-text-tertiary mt-0.5">
          Manage arbitration, disputes, and rulings
        </p>
      </motion.div>

      {/* Arbitrator stats */}
      <motion.div variants={fadeUp} className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {STATS.map((stat, i) => (
          <motion.div
            key={stat.label}
            className="card p-4 relative overflow-hidden group"
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.1 + i * 0.06, ease }}
            whileHover={{ y: -2, borderColor: "rgba(88,176,89,0.2)" }}
          >
            <motion.div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-lob-green/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <p className="text-[10px] text-text-tertiary uppercase tracking-wider">{stat.label}</p>
            <div className="flex items-baseline gap-1 mt-1">
              <p className={`text-xl font-bold tabular-nums ${stat.highlight ? "text-lob-green" : "text-text-primary"}`}>
                {stat.value}
              </p>
              {"sub" in stat && stat.sub && <span className="text-xs text-text-tertiary">{stat.sub}</span>}
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Dispute Resolution Flow */}
      <motion.div variants={fadeUp} className="mb-6">
        <DisputeFlow />
      </motion.div>

      {/* Protocol Stats */}
      <motion.div variants={fadeUp} className="mb-6">
        <ProtocolDisputeStats />
      </motion.div>

      {/* Status Distribution Chart */}
      <motion.div variants={fadeUp} className="mb-6">
        <DisputeStatusDistribution disputes={disputes ?? []} />
      </motion.div>

      {/* Arbitrator Tiers */}
      <motion.div variants={fadeUp} className="mb-6">
        <ArbitratorTiers />
      </motion.div>

      {/* Arbitrator Controls (visible to active arbitrators) */}
      {arbData?.active && address && (
        <motion.div variants={fadeUp} className="mb-6">
          <ArbitratorControls arbData={arbData} address={address} />
        </motion.div>
      )}

      {/* Become an Arbitrator */}
      <motion.div variants={fadeUp} className="mb-6">
        <button
          onClick={() => setShowStaking(!showStaking)}
          className="text-xs text-lob-green hover:underline flex items-center gap-1"
        >
          {showStaking ? "Hide" : "Become an Arbitrator"}
          <span className={`transition-transform ${showStaking ? "rotate-180" : ""}`}>{"\u25BE"}</span>
        </button>

        <AnimatePresence>
          {showStaking && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="card p-5 mt-3">
                <h3 className="text-sm font-semibold text-text-primary mb-2">Stake LOB to Arbitrate</h3>
                <p className="text-[10px] text-text-tertiary mb-4">
                  Arbitrator staking is a separate pool from seller staking. LOB staked here qualifies you to resolve disputes and earn fees.
                </p>

                {stakeStep === "done" ? (
                  <div className="text-center py-4">
                    <span className="text-lob-green text-lg">{"\u2713"}</span>
                    <p className="text-xs text-text-secondary mt-1">Staked successfully!</p>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-col sm:flex-row gap-2 mb-3">
                      <input
                        type="number"
                        value={stakeAmount}
                        onChange={(e) => setStakeAmount(e.target.value)}
                        placeholder="Amount in LOB"
                        className="flex-1 bg-surface-2 border border-border rounded px-3 py-2 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-lob-green/40"
                      />
                      <motion.button
                        className="btn-primary text-xs px-4"
                        whileTap={{ scale: 0.97 }}
                        onClick={handleStake}
                        disabled={!stakeAmount || stakeStep !== "input"}
                      >
                        {stakeStep === "approving"
                          ? "Approving..."
                          : stakeStep === "staking"
                          ? "Staking..."
                          : "Approve & Stake"}
                      </motion.button>
                    </div>
                    {stakeError && (
                      <p className="text-xs text-red-400 mt-1">{stakeError}</p>
                    )}
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Tabs */}
      <motion.div variants={fadeUp} className="flex gap-0.5 mb-6 border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="relative px-4 py-2 text-sm font-medium -mb-px"
          >
            <motion.span
              animate={{ color: activeTab === tab.id ? "#EAECEF" : "#5E6673" }}
              className="relative z-10 flex items-center gap-1.5"
            >
              {tab.label}
              <span className={`text-[10px] tabular-nums px-1.5 py-0.5 rounded-full ${
                activeTab === tab.id ? "bg-surface-3 text-text-primary" : "bg-surface-2 text-text-tertiary"
              }`}>
                {tabCounts[tab.id]}
              </span>
            </motion.span>
            {activeTab === tab.id && (
              <motion.div
                layoutId="dispute-tab"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-lob-red"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
          </button>
        ))}
      </motion.div>

      {/* Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25 }}
        >
          {disputesLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="card p-4 animate-pulse">
                  <div className="h-4 bg-surface-3 rounded w-1/3 mb-2" />
                  <div className="h-3 bg-surface-3 rounded w-2/3" />
                </div>
              ))}
            </div>
          ) : filteredDisputes.length === 0 ? (
            <div className="card text-center py-12 px-4">
              <motion.div
                className="w-12 h-12 rounded-xl border border-border/60 mx-auto mb-4 flex items-center justify-center"
                animate={{
                  borderColor: [
                    "rgba(30,36,49,0.6)",
                    "rgba(255,59,105,0.2)",
                    "rgba(30,36,49,0.6)",
                  ],
                }}
                transition={{ duration: 4, repeat: Infinity }}
              >
                <Scale className="w-5 h-5 text-text-tertiary" />
              </motion.div>
              <p className="text-sm font-medium text-text-secondary">
                {activeTab === "assigned"
                  ? "No disputes assigned to you"
                  : activeTab === "my-disputes"
                  ? "No active disputes"
                  : activeTab === "appeals"
                  ? "No active appeals"
                  : "No dispute history"}
              </p>
              <p className="text-xs text-text-tertiary mt-1 max-w-xs mx-auto">
                {!isIndexerConfigured()
                  ? "Indexer not configured. Disputes will appear once connected."
                  : activeTab === "assigned"
                  ? "Stake LOB as an arbitrator to start receiving dispute assignments."
                  : activeTab === "appeals"
                  ? "Appeals appear when a losing party posts a 500 LOB bond to challenge a ruling."
                  : "Disputes are created when a buyer files a claim on an active escrow job."}
              </p>
              {activeTab === "assigned" && !(arbData?.active) && (
                <motion.button
                  className="mt-4 text-xs text-lob-green hover:underline"
                  onClick={() => setShowStaking(true)}
                  whileTap={{ scale: 0.97 }}
                >
                  Become an Arbitrator
                </motion.button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredDisputes.map((d) => (
                <DisputeCard key={d.id} dispute={d} role={getRole(d)} userAddress={addr} />
              ))}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Key mechanics footer */}
      <motion.div variants={fadeUp} className="mt-8">
        <div className="card p-5">
          <h3 className="text-[10px] sm:text-xs font-semibold text-text-primary uppercase tracking-wider mb-4 flex items-center gap-1.5">
            Key Mechanics
            <InfoButton infoKey="disputes.keyMechanics" />
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { title: "Panel of 3", desc: "Each dispute is randomly assigned to 3 qualified arbitrators based on dispute value" },
              { title: "Majority Rules", desc: "2/3 majority required for ruling. Draw = escrowed funds split 50/50" },
              { title: "Stake Slashing", desc: "Losing seller gets 10% of stake slashed. Non-voting arbitrators lose 0.5%" },
              { title: "Reward System", desc: "Majority voters get 30% bonus. Minority gets 20% penalty. Principal rank = 2x rewards" },
              { title: "Appeal System", desc: "Losing party can appeal within 48h by posting a 500 LOB bond. Senior/Principal panel re-reviews." },
              { title: "Finalization", desc: "After appeal window closes, anyone can call finalizeRuling() to execute the final outcome." },
              { title: "Collusion Detection", desc: "Arbitrators who always vote the same way get flagged for rubber-stamp bias." },
            ].map((item, i) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 + i * 0.08 }}
              >
                <p className="text-xs font-semibold text-text-primary mb-1">{item.title}</p>
                <p className="text-[10px] text-text-tertiary leading-relaxed">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
