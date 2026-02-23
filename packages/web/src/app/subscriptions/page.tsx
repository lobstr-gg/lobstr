"use client";

import { useState, useMemo } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { motion, AnimatePresence } from "framer-motion";
import { stagger, fadeUp, ease } from "@/lib/motion";
import { formatEther, parseEther, type Address } from "viem";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import {
  Repeat,
  TrendingUp,
  Users,
  Coins,
  Clock,
  CheckCircle2,
  Pause,
  Play,
  XCircle,
  ArrowRight,
  Zap,
  Wallet,
  FileText,
  Plus,
  Loader2,
  AlertCircle,
  Info,
} from "lucide-react";
import { InfoButton } from "@/components/InfoButton";
import {
  useSubscriptionsByBuyer,
  useSubscriptionsBySeller,
  useSubscriptionDetails,
  useCreateSubscription,
  useProcessPayment,
  useCancelSubscription,
  usePauseSubscription,
  useResumeSubscription,
  useApproveTokenForSubscriptions,
  useTokenAllowanceForSubscriptions,
  isLobToken,
  getTokenAddress,
  intervalToSeconds,
  secondsToIntervalLabel,
  formatDueDate,
  isPaymentDue,
  isWithinProcessingWindow,
  type OnChainSubscription,
  type SubscriptionStatusEnum,
  STATUS_LABELS,
} from "@/lib/useSubscriptions";

/* ──── Types ──── */
type TabId = "my-subscriptions" | "incoming" | "create";
type IntervalType = "weekly" | "monthly" | "quarterly";
type TokenType = "LOB" | "USDC";

/* ──── Constants ──── */
const TABS: { id: TabId; label: string; mobileLabel: string; icon: typeof Repeat }[] = [
  { id: "my-subscriptions", label: "My Subscriptions", mobileLabel: "Mine", icon: Wallet },
  { id: "incoming", label: "Incoming", mobileLabel: "Incoming", icon: TrendingUp },
  { id: "create", label: "Create", mobileLabel: "Create", icon: Plus },
];

const TAB_COLORS: Record<TabId, string> = {
  "my-subscriptions": "#58B059",
  incoming: "#A855F7",
  create: "#3B82F6",
};

type SubStatusLabel = "Active" | "Paused" | "Cancelled" | "Completed";

const STATUS_COLORS: Record<SubStatusLabel, { bg: string; text: string; border: string }> = {
  Active: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-400/20" },
  Paused: { bg: "bg-yellow-500/10", text: "text-yellow-400", border: "border-yellow-400/20" },
  Cancelled: { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-400/20" },
  Completed: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-400/20" },
};

function shortenAddress(addr: string): string {
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

/* ──── How It Works ──── */
function SubscriptionFlow() {
  const steps = [
    { icon: FileText, label: "Create", desc: "Buyer creates a recurring payment plan", color: "#3B82F6" },
    { icon: Coins, label: "Approve", desc: "Approve token allowance for the engine", color: "#A855F7" },
    { icon: Clock, label: "Auto-Pay", desc: "Payments process each cycle automatically", color: "#F59E0B" },
    { icon: CheckCircle2, label: "Deliver", desc: "Seller provides ongoing service", color: "#58B059" },
  ];

  return (
    <div className="card p-5">
      <h3 className="text-[10px] sm:text-xs font-semibold text-text-primary uppercase tracking-wider mb-5 flex items-center gap-1.5">
        How Subscriptions Work
        <InfoButton infoKey="subscriptions.howItWorks" />
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

/* ──── Subscription Card ──── */
function SubscriptionCard({
  sub,
  showActions,
  onPause,
  onResume,
  onCancel,
  onProcess,
  actionPending,
}: {
  sub: OnChainSubscription;
  showActions: boolean;
  onPause: (id: bigint) => void;
  onResume: (id: bigint) => void;
  onCancel: (id: bigint) => void;
  onProcess: (id: bigint) => void;
  actionPending: boolean;
}) {
  const statusLabel = STATUS_LABELS[sub.status] as SubStatusLabel;
  const colors = STATUS_COLORS[statusLabel];
  const isDue = isPaymentDue(sub);
  const inWindow = isWithinProcessingWindow(sub);
  const tokenIsLob = isLobToken(sub.token);
  const tokenLabel = tokenIsLob ? "LOB" : "USDC";
  const feeInfo = tokenIsLob ? "0% fee" : "1.5% fee";
  const amountFormatted = Number(formatEther(sub.amount)).toLocaleString(undefined, { maximumFractionDigits: 4 });
  const intervalLabel = secondsToIntervalLabel(sub.interval);
  const nextDueFormatted = formatDueDate(sub.nextDue);
  const maxCycles = Number(sub.maxCycles);
  const cyclesCompleted = Number(sub.cyclesCompleted);

  return (
    <motion.div
      className="card p-4 hover:border-lob-green/20 transition-colors"
      whileHover={{ y: -2 }}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-text-primary tabular-nums">
            Sub #{Number(sub.id)}
          </span>
          <span className={`text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded ${colors.bg} ${colors.text} border ${colors.border}`}>
            {statusLabel}
          </span>
          {isDue && (
            <span className="text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-400/20">
              Due
            </span>
          )}
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${tokenIsLob ? "bg-lob-green/10 text-lob-green border border-lob-green/20" : "bg-blue-500/10 text-blue-400 border border-blue-400/20"}`}>
            {feeInfo}
          </span>
        </div>
        <span className="text-xs text-text-tertiary">{intervalLabel}</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs text-text-tertiary mb-3">
        <div>
          <span className="text-[10px] uppercase tracking-wider block">
            {showActions ? "Seller" : "Buyer"}
          </span>
          <span className="text-text-secondary font-mono">
            {shortenAddress(showActions ? sub.seller : sub.buyer)}
          </span>
        </div>
        <div>
          <span className="text-[10px] uppercase tracking-wider block">Amount</span>
          <span className="text-text-primary font-bold tabular-nums">
            {amountFormatted} {tokenLabel}
          </span>
        </div>
        <div>
          <span className="text-[10px] uppercase tracking-wider block">Next Payment</span>
          <span className="text-text-secondary tabular-nums">{nextDueFormatted}</span>
        </div>
        <div>
          <span className="text-[10px] uppercase tracking-wider block">Cycles</span>
          <span className="text-text-secondary tabular-nums">
            {cyclesCompleted}{maxCycles > 0 ? ` / ${maxCycles}` : ""}
          </span>
        </div>
        <div>
          <span className="text-[10px] uppercase tracking-wider block">Interval</span>
          <span className="text-text-secondary tabular-nums">
            {(Number(sub.interval) / 3600).toFixed(0)}h
          </span>
        </div>
      </div>

      {showActions && sub.status !== 2 && sub.status !== 3 && (
        <div className="flex items-center gap-2 pt-2 border-t border-border/30">
          {sub.status === 0 && (
            <>
              <motion.button
                className="flex items-center gap-1 text-[10px] font-medium text-yellow-400 hover:text-yellow-300 transition-colors px-2 py-1 rounded border border-yellow-400/20 hover:border-yellow-400/40 disabled:opacity-50"
                whileTap={{ scale: 0.97 }}
                disabled={actionPending}
                onClick={() => onPause(sub.id)}
              >
                {actionPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Pause className="w-3 h-3" />} Pause
              </motion.button>
              <motion.button
                className="flex items-center gap-1 text-[10px] font-medium text-red-400 hover:text-red-300 transition-colors px-2 py-1 rounded border border-red-400/20 hover:border-red-400/40 disabled:opacity-50"
                whileTap={{ scale: 0.97 }}
                disabled={actionPending}
                onClick={() => onCancel(sub.id)}
              >
                {actionPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />} Cancel
              </motion.button>
              {inWindow && (
                <motion.button
                  className="flex items-center gap-1 text-[10px] font-medium text-blue-400 hover:text-blue-300 transition-colors px-2 py-1 rounded border border-blue-400/20 hover:border-blue-400/40 ml-auto disabled:opacity-50"
                  whileTap={{ scale: 0.97 }}
                  disabled={actionPending}
                  onClick={() => onProcess(sub.id)}
                >
                  {actionPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />} Process Payment
                </motion.button>
              )}
            </>
          )}
          {sub.status === 1 && (
            <>
              <motion.button
                className="flex items-center gap-1 text-[10px] font-medium text-lob-green hover:text-lob-green-light transition-colors px-2 py-1 rounded border border-lob-green/20 hover:border-lob-green/40 disabled:opacity-50"
                whileTap={{ scale: 0.97 }}
                disabled={actionPending}
                onClick={() => onResume(sub.id)}
              >
                {actionPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />} Resume
              </motion.button>
              <motion.button
                className="flex items-center gap-1 text-[10px] font-medium text-red-400 hover:text-red-300 transition-colors px-2 py-1 rounded border border-red-400/20 hover:border-red-400/40 disabled:opacity-50"
                whileTap={{ scale: 0.97 }}
                disabled={actionPending}
                onClick={() => onCancel(sub.id)}
              >
                {actionPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />} Cancel
              </motion.button>
            </>
          )}
        </div>
      )}

      {/* Process Payment button shown for incoming (seller) view too -- permissionless */}
      {!showActions && sub.status === 0 && inWindow && (
        <div className="flex items-center gap-2 pt-2 border-t border-border/30">
          <motion.button
            className="flex items-center gap-1 text-[10px] font-medium text-blue-400 hover:text-blue-300 transition-colors px-2 py-1 rounded border border-blue-400/20 hover:border-blue-400/40 ml-auto disabled:opacity-50"
            whileTap={{ scale: 0.97 }}
            disabled={actionPending}
            onClick={() => onProcess(sub.id)}
          >
            {actionPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />} Process Payment
          </motion.button>
        </div>
      )}
    </motion.div>
  );
}

/* ──── Loading Skeleton ──── */
function SubscriptionSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="card p-4 animate-pulse">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-4 w-16 bg-surface-2 rounded" />
            <div className="h-4 w-12 bg-surface-2 rounded" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[0, 1, 2, 3].map((j) => (
              <div key={j}>
                <div className="h-2 w-12 bg-surface-2 rounded mb-1" />
                <div className="h-3 w-16 bg-surface-2 rounded" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ──── Main Page ──── */
export default function SubscriptionsPage() {
  const { isConnected, address } = useAccount();
  const [activeTab, setActiveTab] = useState<TabId>("my-subscriptions");

  // Create form state
  const [sellerAddress, setSellerAddress] = useState("");
  const [subToken, setSubToken] = useState<TokenType>("LOB");
  const [subAmount, setSubAmount] = useState("");
  const [subInterval, setSubInterval] = useState<IntervalType>("monthly");
  const [subMaxCycles, setSubMaxCycles] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [createSubmitted, setCreateSubmitted] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);
  const [actionSubId, setActionSubId] = useState<bigint | null>(null);

  // Contract reads - buyer subscriptions
  const { data: buyerIds, isLoading: buyerIdsLoading } = useSubscriptionsByBuyer(address);
  const { data: buyerSubs, isLoading: buyerSubsLoading } = useSubscriptionDetails(buyerIds as readonly bigint[] | undefined);

  // Contract reads - seller subscriptions
  const { data: sellerIds, isLoading: sellerIdsLoading } = useSubscriptionsBySeller(address);
  const { data: sellerSubs, isLoading: sellerSubsLoading } = useSubscriptionDetails(sellerIds as readonly bigint[] | undefined);

  // Token approval
  const tokenAddress = getTokenAddress(subToken);
  const { data: currentAllowance } = useTokenAllowanceForSubscriptions(
    address as Address | undefined,
    tokenAddress
  );

  // Write hooks
  const createSub = useCreateSubscription();
  const processPayment = useProcessPayment();
  const cancelSub = useCancelSubscription();
  const pauseSub = usePauseSubscription();
  const resumeSub = useResumeSubscription();
  const approveTx = useApproveTokenForSubscriptions();

  const isAnyWritePending = createSub.isPending || processPayment.isPending || cancelSub.isPending || pauseSub.isPending || resumeSub.isPending || approveTx.isPending;

  // Computed stats from real data
  const mySubscriptions = buyerSubs ?? [];
  const incomingSubscriptions = sellerSubs ?? [];

  const activeSubs = mySubscriptions.filter((s) => s.status === 0).length;
  const monthlyRevenue = useMemo(() => {
    return incomingSubscriptions
      .filter((s) => s.status === 0)
      .reduce((acc, s) => {
        const amt = Number(formatEther(s.amount));
        const intervalSec = Number(s.interval);
        // Convert to monthly equivalent (30 days = 2592000 seconds)
        const multiplier = 2592000 / intervalSec;
        return acc + amt * multiplier;
      }, 0);
  }, [incomingSubscriptions]);

  const totalProcessed = useMemo(() => {
    return mySubscriptions.reduce((acc, s) => {
      const amt = Number(formatEther(s.amount));
      return acc + amt * Number(s.cyclesCompleted);
    }, 0);
  }, [mySubscriptions]);

  const avgDuration = useMemo(() => {
    const activeSubs = mySubscriptions.filter((s) => s.status === 0 || s.status === 1);
    if (activeSubs.length === 0) return "--";
    const now = Date.now() / 1000;
    const totalMonths = activeSubs.reduce((acc, s) => {
      const age = now - Number(s.createdAt);
      return acc + age / (30 * 24 * 3600);
    }, 0);
    return `${(totalMonths / activeSubs.length).toFixed(1)} mo`;
  }, [mySubscriptions]);

  const STATS = [
    { label: "Active Subs", value: String(activeSubs), icon: Repeat, color: "#58B059" },
    { label: "Monthly Revenue", value: monthlyRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 }), sub: "tokens", icon: TrendingUp, color: "#A855F7" },
    { label: "Total Processed", value: totalProcessed.toLocaleString(undefined, { maximumFractionDigits: 0 }), sub: "tokens", icon: Coins, color: "#3B82F6" },
    { label: "Avg Duration", value: avgDuration, icon: Clock, color: "#F59E0B" },
  ];

  const parsedAmount = parseFloat(subAmount) || 0;
  const parsedMaxCycles = parseInt(subMaxCycles) || 0;
  const canCreate = sellerAddress.length >= 10 && parsedAmount > 0;

  // Compute interval in days for preview
  const intervalDays: Record<IntervalType, number> = { weekly: 7, monthly: 30, quarterly: 90 };
  const annualCost = parsedAmount * (365 / intervalDays[subInterval]);
  const feeRate = subToken === "LOB" ? 0 : 1.5;

  // Action handlers
  const handlePause = async (id: bigint) => {
    setTxError(null);
    setActionSubId(id);
    try {
      await pauseSub.fn(id);
    } catch (e: any) {
      setTxError(e?.shortMessage || e?.message || "Transaction failed");
    } finally {
      setActionSubId(null);
    }
  };

  const handleResume = async (id: bigint) => {
    setTxError(null);
    setActionSubId(id);
    try {
      await resumeSub.fn(id);
    } catch (e: any) {
      setTxError(e?.shortMessage || e?.message || "Transaction failed");
    } finally {
      setActionSubId(null);
    }
  };

  const handleCancel = async (id: bigint) => {
    setTxError(null);
    setActionSubId(id);
    try {
      await cancelSub.fn(id);
    } catch (e: any) {
      setTxError(e?.shortMessage || e?.message || "Transaction failed");
    } finally {
      setActionSubId(null);
    }
  };

  const handleProcess = async (id: bigint) => {
    setTxError(null);
    setActionSubId(id);
    try {
      await processPayment.fn(id);
    } catch (e: any) {
      setTxError(e?.shortMessage || e?.message || "Transaction failed");
    } finally {
      setActionSubId(null);
    }
  };

  const handleApproveAndCreate = async () => {
    setTxError(null);
    try {
      const amount = parseEther(subAmount);
      const interval = intervalToSeconds(subInterval);
      const maxCycles = BigInt(parsedMaxCycles);
      const token = getTokenAddress(subToken);
      const seller = sellerAddress as Address;

      // Calculate total approval needed: amount * maxCycles (or a large amount for unlimited)
      const approvalAmount = maxCycles > 0n
        ? amount * maxCycles
        : amount * 1000n; // approve enough for ~1000 cycles if unlimited

      // Check if we need to approve first
      const currentAllow = currentAllowance as bigint | undefined;
      if (!currentAllow || currentAllow < approvalAmount) {
        await approveTx.fn(token, approvalAmount);
      }

      // Create subscription
      await createSub.fn(
        seller,
        token,
        amount,
        interval,
        maxCycles,
        0n, // listingId (0 = no linked listing)
        "", // metadataURI
      );

      setCreateSubmitted(true);
    } catch (e: any) {
      setTxError(e?.shortMessage || e?.message || "Transaction failed");
    }
  };

  const isLoading = buyerIdsLoading || buyerSubsLoading || sellerIdsLoading || sellerSubsLoading;

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
          <Repeat className="w-6 h-6 text-lob-green/60" />
        </motion.div>
        <h1 className="text-xl font-bold text-text-primary">Subscriptions</h1>
        <p className="text-sm text-text-secondary">Connect your wallet to manage subscriptions.</p>
        <ConnectButton />
      </motion.div>
    );
  }

  return (
    <motion.div initial="hidden" animate="show" variants={stagger}>
      {/* Header */}
      <motion.div variants={fadeUp} className="mb-6">
        <h1 className="text-xl font-bold text-text-primary flex items-center gap-1.5">
          Subscriptions
          <InfoButton infoKey="subscriptions.header" />
        </h1>
        <p className="text-xs text-text-tertiary mt-0.5">
          Recurring billing for ongoing AI services
        </p>
      </motion.div>

      {/* Error banner */}
      <AnimatePresence>
        {txError && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-4"
          >
            <div className="rounded-lg border border-red-500/20 bg-red-500/[0.05] p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-xs text-red-400 font-medium">Transaction Error</p>
                <p className="text-[10px] text-text-secondary mt-0.5">{txError}</p>
              </div>
              <button onClick={() => setTxError(null)} className="text-text-tertiary hover:text-text-primary">
                <XCircle className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
                <p className="text-xl font-bold tabular-nums text-text-primary">
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin inline" /> : stat.value}
                </p>
                {"sub" in stat && stat.sub && <span className="text-xs text-text-tertiary">{stat.sub}</span>}
              </div>
            </motion.div>
          );
        })}
      </motion.div>

      {/* Subscription Charts */}
      {mySubscriptions.length > 0 && (
        <motion.div variants={fadeUp} className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          {/* Status Distribution Donut */}
          {(() => {
            const statusCounts = [
              { name: "Active", value: mySubscriptions.filter((s) => s.status === 0).length, color: "#58B059" },
              { name: "Paused", value: mySubscriptions.filter((s) => s.status === 1).length, color: "#F0B90B" },
              { name: "Cancelled", value: mySubscriptions.filter((s) => s.status === 2).length, color: "#EF4444" },
              { name: "Completed", value: mySubscriptions.filter((s) => s.status === 3).length, color: "#3B82F6" },
            ].filter((s) => s.value > 0);

            return (
              <div className="card p-4">
                <h4 className="text-[10px] font-semibold text-text-primary uppercase tracking-wider mb-2">
                  Status Distribution
                </h4>
                <div className="flex items-center gap-3">
                  <div className="w-[80px] h-[80px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={statusCounts}
                          cx="50%"
                          cy="50%"
                          innerRadius={22}
                          outerRadius={36}
                          dataKey="value"
                          stroke="none"
                        >
                          {statusCounts.map((entry, idx) => (
                            <Cell key={idx} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ background: "#1E2431", border: "1px solid #2A3142", borderRadius: "8px", fontSize: "10px" }}
                          itemStyle={{ color: "#EAECEF" }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-1">
                    {statusCounts.map((d) => (
                      <div key={d.name} className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                        <span className="text-[10px] text-text-secondary">{d.name}</span>
                        <span className="text-[10px] text-text-tertiary tabular-nums ml-1">{d.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Fee Summary */}
          {(() => {
            const lobSubs = mySubscriptions.filter((s) => isLobToken(s.token));
            const usdcSubs = mySubscriptions.filter((s) => !isLobToken(s.token));
            const lobTotal = lobSubs.reduce((acc, s) => acc + Number(formatEther(s.amount)) * Number(s.cyclesCompleted), 0);
            const usdcTotal = usdcSubs.reduce((acc, s) => acc + Number(formatEther(s.amount)) * Number(s.cyclesCompleted), 0);
            const lobFees = 0; // 0% fee
            const usdcFees = usdcTotal * 0.015; // 1.5% fee
            const feeData = [
              { name: "LOB (0%)", value: Math.max(0.1, lobFees), color: "#58B059" },
              { name: "USDC (1.5%)", value: Math.max(0.1, usdcFees), color: "#3B82F6" },
            ];

            return (
              <div className="card p-4">
                <h4 className="text-[10px] font-semibold text-text-primary uppercase tracking-wider mb-2">
                  Fee Summary
                </h4>
                <div className="flex items-center gap-3">
                  <div className="w-[80px] h-[80px] relative">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={feeData}
                          cx="50%"
                          cy="50%"
                          innerRadius={22}
                          outerRadius={36}
                          dataKey="value"
                          stroke="none"
                        >
                          {feeData.map((entry, idx) => (
                            <Cell key={idx} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ background: "#1E2431", border: "1px solid #2A3142", borderRadius: "8px", fontSize: "10px" }}
                          itemStyle={{ color: "#EAECEF" }}
                          formatter={(value: number | undefined) => (value ?? 0) < 0.2 ? "0" : (value ?? 0).toFixed(2)}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-2 flex-1 min-w-0">
                    <div>
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <div className="w-2 h-2 rounded-full bg-lob-green" />
                        <span className="text-[10px] text-text-secondary">LOB Payments</span>
                      </div>
                      <p className="text-xs font-bold text-text-primary tabular-nums pl-3.5">
                        {lobTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })} LOB
                        <span className="text-[9px] text-lob-green ml-1">0% fee</span>
                      </p>
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <div className="w-2 h-2 rounded-full bg-blue-400" />
                        <span className="text-[10px] text-text-secondary">USDC Payments</span>
                      </div>
                      <p className="text-xs font-bold text-text-primary tabular-nums pl-3.5">
                        {usdcTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })} USDC
                        <span className="text-[9px] text-blue-400 ml-1">{usdcFees.toFixed(2)} fee</span>
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </motion.div>
      )}

      {/* How it works */}
      <motion.div variants={fadeUp} className="mb-6">
        <SubscriptionFlow />
      </motion.div>

      {/* Fee info banner */}
      <motion.div variants={fadeUp} className="mb-6">
        <div className="rounded-lg border border-border/40 bg-surface-1/30 p-3 flex items-start gap-2">
          <Info className="w-4 h-4 text-text-tertiary mt-0.5 flex-shrink-0" />
          <div className="flex gap-6 text-[10px] text-text-secondary">
            <span><strong className="text-lob-green">$LOB:</strong> 0% protocol fee</span>
            <span><strong className="text-blue-400">USDC:</strong> 1.5% protocol fee (150 bps)</span>
            <span><strong className="text-text-tertiary">Min interval:</strong> 1 hour</span>
            <span><strong className="text-text-tertiary">Processing window:</strong> 7 days after due</span>
          </div>
        </div>
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
                <span className="sm:hidden">{tab.mobileLabel}</span>
              </motion.span>
              {activeTab === tab.id && (
                <motion.div
                  layoutId="sub-tab"
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
        {/* ── My Subscriptions Tab ── */}
        {activeTab === "my-subscriptions" && (
          <motion.div
            key="my-subscriptions"
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            transition={{ duration: 0.3, ease }}
            className="space-y-4"
          >
            {/* Buyer view explainer */}
            <div className="rounded-lg border border-lob-green/15 bg-lob-green/[0.03] p-4">
              <div className="flex items-start gap-3">
                <Wallet className="w-4 h-4 text-lob-green mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-text-primary mb-1">Buyer View</p>
                  <p className="text-[10px] text-text-secondary leading-relaxed">
                    These are subscriptions where you are the buyer. Payments are processed automatically from
                    your approved token allowance via the <span className="font-mono text-text-tertiary">SubscriptionEngine</span> contract.
                    Anyone can trigger a due payment permissionlessly.
                  </p>
                </div>
              </div>
            </div>

            {/* Subscription list */}
            {(buyerIdsLoading || buyerSubsLoading) ? (
              <SubscriptionSkeleton />
            ) : mySubscriptions.length === 0 ? (
              <div className="card text-center py-12 px-4">
                <motion.div
                  className="w-12 h-12 rounded-xl border border-border/60 mx-auto mb-4 flex items-center justify-center"
                  animate={{
                    borderColor: [
                      "rgba(30,36,49,0.6)",
                      "rgba(88,176,89,0.2)",
                      "rgba(30,36,49,0.6)",
                    ],
                  }}
                  transition={{ duration: 4, repeat: Infinity }}
                >
                  <Repeat className="w-5 h-5 text-text-tertiary" />
                </motion.div>
                <p className="text-sm font-medium text-text-secondary">No active subscriptions</p>
                <p className="text-xs text-text-tertiary mt-1 max-w-xs mx-auto">
                  Create a subscription to set up recurring payments for ongoing services.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {mySubscriptions.map((sub, i) => (
                  <motion.div
                    key={Number(sub.id)}
                    transition={{ delay: i * 0.04 }}
                  >
                    <SubscriptionCard
                      sub={sub}
                      showActions={true}
                      onPause={handlePause}
                      onResume={handleResume}
                      onCancel={handleCancel}
                      onProcess={handleProcess}
                      actionPending={isAnyWritePending && actionSubId === sub.id}
                    />
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* ── Incoming Tab ── */}
        {activeTab === "incoming" && (
          <motion.div
            key="incoming"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.3, ease }}
            className="space-y-4"
          >
            {/* Seller view explainer */}
            <div className="rounded-lg border border-purple-500/15 bg-purple-500/[0.03] p-4">
              <div className="flex items-start gap-3">
                <TrendingUp className="w-4 h-4 text-purple-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-text-primary mb-1">Seller View</p>
                  <p className="text-[10px] text-text-secondary leading-relaxed">
                    These are subscriptions where you are the service provider. Payments are sent to your
                    wallet each billing cycle. Track your recurring revenue streams below.
                  </p>
                </div>
              </div>
            </div>

            {/* Revenue summary */}
            <div className="card p-5">
              <h3 className="text-[10px] sm:text-xs font-semibold text-text-primary uppercase tracking-wider mb-4">
                Revenue Summary
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                <div>
                  <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Active Subscribers</p>
                  <p className="text-sm font-bold text-text-primary mt-0.5 tabular-nums">
                    {sellerSubsLoading ? <Loader2 className="w-3 h-3 animate-spin inline" /> : incomingSubscriptions.filter((s) => s.status === 0).length}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Monthly Revenue</p>
                  <p className="text-sm font-bold text-lob-green mt-0.5 tabular-nums">
                    {sellerSubsLoading ? <Loader2 className="w-3 h-3 animate-spin inline" /> : `${monthlyRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })} tokens`}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Total Collected</p>
                  <p className="text-sm font-bold text-text-primary mt-0.5 tabular-nums">
                    {sellerSubsLoading ? <Loader2 className="w-3 h-3 animate-spin inline" /> : `${incomingSubscriptions.reduce((acc, s) => acc + Number(formatEther(s.amount)) * Number(s.cyclesCompleted), 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} tokens`}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Annual Projection</p>
                  <p className="text-sm font-bold text-purple-400 mt-0.5 tabular-nums">
                    {sellerSubsLoading ? <Loader2 className="w-3 h-3 animate-spin inline" /> : `${(monthlyRevenue * 12).toLocaleString(undefined, { maximumFractionDigits: 0 })} tokens`}
                  </p>
                </div>
              </div>
            </div>

            {/* Incoming subscriptions list */}
            {(sellerIdsLoading || sellerSubsLoading) ? (
              <SubscriptionSkeleton />
            ) : incomingSubscriptions.length === 0 ? (
              <div className="card text-center py-12 px-4">
                <motion.div
                  className="w-12 h-12 rounded-xl border border-border/60 mx-auto mb-4 flex items-center justify-center"
                  animate={{
                    borderColor: [
                      "rgba(30,36,49,0.6)",
                      "rgba(168,85,247,0.2)",
                      "rgba(30,36,49,0.6)",
                    ],
                  }}
                  transition={{ duration: 4, repeat: Infinity }}
                >
                  <TrendingUp className="w-5 h-5 text-text-tertiary" />
                </motion.div>
                <p className="text-sm font-medium text-text-secondary">No incoming subscriptions</p>
                <p className="text-xs text-text-tertiary mt-1 max-w-xs mx-auto">
                  When buyers subscribe to your services, they will appear here.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {incomingSubscriptions.map((sub, i) => (
                  <motion.div
                    key={Number(sub.id)}
                    transition={{ delay: i * 0.04 }}
                  >
                    <SubscriptionCard
                      sub={sub}
                      showActions={false}
                      onPause={handlePause}
                      onResume={handleResume}
                      onCancel={handleCancel}
                      onProcess={handleProcess}
                      actionPending={isAnyWritePending && actionSubId === sub.id}
                    />
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* ── Create Tab ── */}
        {activeTab === "create" && (
          <motion.div
            key="create"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.3, ease }}
            className="space-y-4"
          >
            {/* Create explainer */}
            <div className="rounded-lg border border-blue-500/15 bg-blue-500/[0.03] p-4">
              <div className="flex items-start gap-3">
                <Plus className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-text-primary mb-1">Create Subscription</p>
                  <p className="text-[10px] text-text-secondary leading-relaxed">
                    Set up a recurring payment to a service provider. You will approve a token allowance
                    that the <span className="font-mono text-text-tertiary">SubscriptionEngine</span> uses
                    to process payments on your behalf each billing cycle.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Form */}
              <div className="card p-5">
                <h3 className="text-[10px] sm:text-xs font-semibold text-text-primary uppercase tracking-wider mb-4">
                  Subscription Details
                </h3>

                {createSubmitted ? (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center py-4"
                  >
                    <div className="w-10 h-10 rounded-full bg-lob-green-muted mx-auto mb-3 flex items-center justify-center">
                      <CheckCircle2 className="w-5 h-5 text-lob-green" />
                    </div>
                    <p className="text-sm font-medium text-text-primary">Subscription Created</p>
                    <p className="text-xs text-text-tertiary mt-1">
                      Your recurring payment has been set up. The first payment will process on the next billing cycle.
                    </p>
                    <motion.button
                      className="btn-secondary mt-4"
                      whileTap={{ scale: 0.97 }}
                      onClick={() => {
                        setCreateSubmitted(false);
                        setSellerAddress("");
                        setSubAmount("");
                        setSubMaxCycles("");
                        setShowPreview(false);
                      }}
                    >
                      Create Another
                    </motion.button>
                  </motion.div>
                ) : (
                  <div className="space-y-4">
                    {/* Seller address */}
                    <div>
                      <label className="block text-[10px] font-medium text-text-tertiary uppercase tracking-wider mb-1.5">
                        Seller Address
                      </label>
                      <input
                        type="text"
                        value={sellerAddress}
                        onChange={(e) => { setSellerAddress(e.target.value); setShowPreview(false); }}
                        placeholder="0x..."
                        className="input-field w-full font-mono"
                      />
                    </div>

                    {/* Token selector */}
                    <div>
                      <label className="block text-[10px] font-medium text-text-tertiary uppercase tracking-wider mb-1.5">
                        Payment Token
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {(["LOB", "USDC"] as const).map((token) => (
                          <motion.button
                            key={token}
                            className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                              subToken === token
                                ? "border-lob-green/40 bg-lob-green/[0.06] text-lob-green"
                                : "border-border bg-surface-2 text-text-secondary hover:border-border-hover"
                            }`}
                            onClick={() => { setSubToken(token); setShowPreview(false); }}
                            whileTap={{ scale: 0.97 }}
                          >
                            {token} {token === "LOB" ? "(0% fee)" : "(1.5% fee)"}
                          </motion.button>
                        ))}
                      </div>
                    </div>

                    {/* Amount */}
                    <div>
                      <label className="block text-[10px] font-medium text-text-tertiary uppercase tracking-wider mb-1.5">
                        Amount Per Cycle
                      </label>
                      <input
                        type="number"
                        value={subAmount}
                        onChange={(e) => { setSubAmount(e.target.value); setShowPreview(false); }}
                        placeholder={`Amount in ${subToken}`}
                        className="input-field w-full tabular-nums"
                      />
                    </div>

                    {/* Interval */}
                    <div>
                      <label className="block text-[10px] font-medium text-text-tertiary uppercase tracking-wider mb-1.5">
                        Billing Interval
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {(["weekly", "monthly", "quarterly"] as const).map((interval) => (
                          <motion.button
                            key={interval}
                            className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors capitalize ${
                              subInterval === interval
                                ? "border-lob-green/40 bg-lob-green/[0.06] text-lob-green"
                                : "border-border bg-surface-2 text-text-secondary hover:border-border-hover"
                            }`}
                            onClick={() => { setSubInterval(interval); setShowPreview(false); }}
                            whileTap={{ scale: 0.97 }}
                          >
                            {interval}
                          </motion.button>
                        ))}
                      </div>
                      <p className="text-[9px] text-text-tertiary mt-1">Min interval: 1 hour (3600s)</p>
                    </div>

                    {/* Max Cycles */}
                    <div>
                      <label className="block text-[10px] font-medium text-text-tertiary uppercase tracking-wider mb-1.5">
                        Max Cycles (0 = unlimited)
                      </label>
                      <input
                        type="number"
                        value={subMaxCycles}
                        onChange={(e) => { setSubMaxCycles(e.target.value); setShowPreview(false); }}
                        placeholder="0"
                        min="0"
                        className="input-field w-full tabular-nums"
                      />
                    </div>

                    {/* Preview */}
                    <AnimatePresence>
                      {canCreate && !showPreview && (
                        <motion.button
                          key="preview-btn"
                          className="btn-secondary w-full"
                          onClick={() => setShowPreview(true)}
                          whileTap={{ scale: 0.97 }}
                        >
                          Preview Subscription
                        </motion.button>
                      )}
                    </AnimatePresence>

                    <AnimatePresence>
                      {showPreview && canCreate && (
                        <motion.div
                          key="preview"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="rounded-lg border border-border/40 bg-surface-1/30 p-4 space-y-2">
                            <p className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-2">
                              Subscription Preview
                            </p>
                            <div className="flex justify-between">
                              <span className="text-[10px] text-text-tertiary">Seller</span>
                              <span className="text-xs text-text-secondary font-mono">
                                {sellerAddress.slice(0, 10)}...{sellerAddress.slice(-4)}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[10px] text-text-tertiary">Per Cycle</span>
                              <span className="text-xs text-text-primary font-medium tabular-nums">
                                {parsedAmount.toLocaleString()} {subToken}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[10px] text-text-tertiary">Interval</span>
                              <span className="text-xs text-text-secondary capitalize">{subInterval}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[10px] text-text-tertiary">Max Cycles</span>
                              <span className="text-xs text-text-secondary">
                                {parsedMaxCycles > 0 ? parsedMaxCycles : "Unlimited"}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[10px] text-text-tertiary">Protocol Fee</span>
                              <span className={`text-xs font-medium ${feeRate === 0 ? "text-lob-green" : "text-blue-400"}`}>
                                {feeRate}%
                              </span>
                            </div>
                            <div className="border-t border-border/30 pt-2 mt-2 flex justify-between">
                              <span className="text-[10px] text-text-primary font-semibold">Annual Cost</span>
                              <span className="text-xs text-lob-green font-bold tabular-nums">
                                ~{annualCost.toLocaleString(undefined, { maximumFractionDigits: 0 })} {subToken}
                              </span>
                            </div>
                            {parsedMaxCycles > 0 && (
                              <div className="flex justify-between">
                                <span className="text-[10px] text-text-primary font-semibold">Total Cost</span>
                                <span className="text-xs text-text-primary font-bold tabular-nums">
                                  {(parsedAmount * parsedMaxCycles).toLocaleString()} {subToken}
                                </span>
                              </div>
                            )}
                          </div>

                          <div className="flex gap-2 mt-3">
                            <motion.button
                              className="btn-primary flex-1 disabled:opacity-50"
                              whileHover={{ boxShadow: "inset 0 1px 0 rgba(88,176,89,0.12), 0 4px 16px rgba(88,176,89,0.08)" }}
                              whileTap={{ scale: 0.97 }}
                              onClick={handleApproveAndCreate}
                              disabled={isAnyWritePending}
                            >
                              {isAnyWritePending ? (
                                <span className="flex items-center justify-center gap-2">
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  {approveTx.isPending ? "Approving..." : "Creating..."}
                                </span>
                              ) : (
                                "Approve & Create"
                              )}
                            </motion.button>
                            <motion.button
                              className="btn-secondary"
                              whileTap={{ scale: 0.97 }}
                              onClick={() => setShowPreview(false)}
                              disabled={isAnyWritePending}
                            >
                              Back
                            </motion.button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </div>

              {/* Sidebar info */}
              <div className="space-y-4">
                <div className="card p-5">
                  <h3 className="text-[10px] sm:text-xs font-semibold text-text-primary mb-3 uppercase tracking-wider">
                    How It Works
                  </h3>
                  <div className="space-y-3">
                    {[
                      { step: "1", text: "Enter the seller address and payment terms" },
                      { step: "2", text: "Approve a token allowance for the SubscriptionEngine" },
                      { step: "3", text: "The contract deducts payment each cycle automatically" },
                      { step: "4", text: "You can pause, resume, or cancel any time" },
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

                <div className="card p-5">
                  <h3 className="text-[10px] sm:text-xs font-semibold text-text-primary mb-3 uppercase tracking-wider">
                    Supported Tokens
                  </h3>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between rounded-lg border border-lob-green/15 p-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-lob-green/10 flex items-center justify-center">
                          <span className="text-[10px] font-bold text-lob-green">L</span>
                        </div>
                        <span className="text-xs font-medium text-text-primary">$LOB</span>
                      </div>
                      <span className="text-[10px] text-lob-green font-medium">0% fee</span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border border-blue-500/15 p-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-blue-500/10 flex items-center justify-center">
                          <span className="text-[10px] font-bold text-blue-400">$</span>
                        </div>
                        <span className="text-xs font-medium text-text-primary">USDC</span>
                      </div>
                      <span className="text-[10px] text-blue-400 font-medium">1.5% fee</span>
                    </div>
                  </div>
                </div>

                <div className="card p-5">
                  <h3 className="text-[10px] sm:text-xs font-semibold text-text-primary mb-2 uppercase tracking-wider">
                    Permissionless Processing
                  </h3>
                  <p className="text-[10px] text-text-secondary leading-relaxed">
                    Anyone can call <span className="font-mono text-text-tertiary">processPayment()</span> on
                    a due subscription. This means payments process even if neither party triggers them --
                    MEV bots and keepers can handle it for a small tip. Processing window is 7 days after due date.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer summary */}
      <motion.div variants={fadeUp} className="mt-8">
        <div className="card p-5">
          <h3 className="text-[10px] sm:text-xs font-semibold text-text-primary uppercase tracking-wider mb-4 flex items-center gap-1.5">
            Key Mechanics
            <InfoButton infoKey="subscriptions.mechanics" />
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                title: "Token Allowance",
                desc: "Buyers approve a token allowance once. The SubscriptionEngine deducts payments each cycle without additional approvals.",
                icon: Coins,
                color: "#58B059",
              },
              {
                title: "Flexible Intervals",
                desc: "Weekly, monthly, or quarterly billing cycles. Min interval: 1 hour. Payments are due at the start of each cycle.",
                icon: Clock,
                color: "#3B82F6",
              },
              {
                title: "Buyer Controls",
                desc: "Pause, resume, or cancel subscriptions at any time. No penalties for cancellation.",
                icon: Repeat,
                color: "#A855F7",
              },
              {
                title: "Permissionless",
                desc: "Due payments can be triggered by anyone within a 7-day window. Keepers and bots ensure timely processing.",
                icon: Zap,
                color: "#F59E0B",
              },
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
    </motion.div>
  );
}
