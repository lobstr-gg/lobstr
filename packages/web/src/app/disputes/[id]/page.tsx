"use client";

import { useParams } from "next/navigation";
import { useAccount } from "wagmi";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { stagger, fadeUp, ease } from "@/lib/motion";
import { useDispute, useExecuteRuling, useArbitratorInfo } from "@/lib/hooks";
import {
  useIsAppealDispute,
  useAppealDisputeId,
  useAppealRuling,
  useFinalizeRuling,
  useApproveLOBForAppeal,
  useIsArbitratorPaused,
  usePauseAsArbitrator,
  useUnpauseAsArbitrator,
  useActiveDisputeCount,
  APPEAL_BOND,
  APPEAL_WINDOW_SECONDS,
} from "@/lib/useDisputeAppeals";
import { formatEther } from "viem";
import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import {
  Shield,
  Clock,
  Gavel,
  AlertTriangle,
  Scale,
  Pause,
  Play,
  ShieldAlert,
  ExternalLink,
} from "lucide-react";
import { getExplorerUrl } from "@/config/contracts";

const VotingPanel = dynamic(() => import("./_components/VotingPanel"), { ssr: false });
const EvidenceViewer = dynamic(() => import("./_components/EvidenceViewer"), { ssr: false });
const EvidenceUpload = dynamic(() => import("./_components/EvidenceUpload"), { ssr: false });
const CounterEvidenceForm = dynamic(() => import("./_components/CounterEvidenceForm"), { ssr: false });
const DisputeTimeline = dynamic(() => import("./_components/DisputeTimeline"), { ssr: false });
const ChannelChat = dynamic(
  () => import("@/components/ChannelChat").then((m) => ({ default: m.ChannelChat })),
  { ssr: false }
);

const STATUS_LABELS: Record<number, string> = {
  0: "Open",
  1: "Evidence Phase",
  2: "Voting",
  3: "Resolved",
};

const STATUS_COLORS: Record<number, { bg: string; text: string; border: string }> = {
  0: { bg: "bg-yellow-500/10", text: "text-yellow-400", border: "border-yellow-400/20" },
  1: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-400/20" },
  2: { bg: "bg-purple-500/10", text: "text-purple-400", border: "border-purple-400/20" },
  3: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-400/20" },
};

const RULING_LABELS: Record<number, string> = {
  0: "Pending",
  1: "Buyer Wins",
  2: "Seller Wins",
};

/* ---- Animated Vote Bar ---- */
function VoteBar({
  buyerVotes,
  sellerVotes,
}: {
  buyerVotes: number;
  sellerVotes: number;
}) {
  const total = buyerVotes + sellerVotes;
  const buyerPct = total > 0 ? (buyerVotes / total) * 100 : 50;
  const sellerPct = total > 0 ? (sellerVotes / total) * 100 : 50;

  return (
    <div className="card p-3 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Gavel className="w-4 h-4 text-text-tertiary" />
          <h3 className="text-xs font-semibold text-text-primary uppercase tracking-wider">
            Vote Tally
          </h3>
        </div>
        <span className="text-[10px] text-text-tertiary tabular-nums">
          {total} / 3 votes cast
        </span>
      </div>

      {/* Vote bar -- fills from both sides */}
      <div className="relative h-8 rounded-full bg-surface-3 overflow-hidden flex">
        <motion.div
          className="h-full bg-blue-500/40 flex items-center justify-start pl-3"
          initial={{ width: "50%" }}
          animate={{ width: `${buyerPct}%` }}
          transition={{ duration: 0.8, ease }}
        >
          {buyerVotes > 0 && (
            <span className="text-[10px] font-bold text-blue-400 tabular-nums">
              {buyerVotes}
            </span>
          )}
        </motion.div>
        <motion.div
          className="h-full bg-orange-500/40 flex items-center justify-end pr-3"
          initial={{ width: "50%" }}
          animate={{ width: `${sellerPct}%` }}
          transition={{ duration: 0.8, ease }}
        >
          {sellerVotes > 0 && (
            <span className="text-[10px] font-bold text-orange-400 tabular-nums">
              {sellerVotes}
            </span>
          )}
        </motion.div>

        {/* Center divider */}
        <motion.div
          className="absolute top-0 bottom-0 w-px bg-surface-0"
          style={{ left: `${buyerPct}%` }}
          animate={{ left: `${buyerPct}%` }}
          transition={{ duration: 0.8, ease }}
        />
      </div>

      <div className="flex justify-between mt-2">
        <span className="text-[10px] text-blue-400 font-medium">Buyer</span>
        <span className="text-[10px] text-orange-400 font-medium">Seller</span>
      </div>
    </div>
  );
}

/* ---- Countdown Timer ---- */
function CountdownTimer({ deadline, label }: { deadline: number; label?: string }) {
  const [remaining, setRemaining] = useState("");

  useEffect(() => {
    const update = () => {
      const now = Math.floor(Date.now() / 1000);
      const diff = deadline - now;
      if (diff <= 0) {
        setRemaining("Expired");
        return;
      }
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      setRemaining(`${h}h ${m}m ${s}s`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [deadline]);

  const isExpired = remaining === "Expired";

  return (
    <motion.div
      className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-surface-1"
      animate={
        !isExpired
          ? {
              borderColor: [
                "rgba(30,36,49,1)",
                "rgba(240,185,11,0.3)",
                "rgba(30,36,49,1)",
              ],
            }
          : {}
      }
      transition={{ duration: 2, repeat: Infinity }}
    >
      <Clock className={`w-3.5 h-3.5 ${isExpired ? "text-text-tertiary" : "text-yellow-400"}`} />
      <span className={`text-xs font-mono tabular-nums ${isExpired ? "text-text-tertiary" : "text-yellow-400"}`}>
        {label ? `${label}: ` : ""}{remaining}
      </span>
    </motion.div>
  );
}

/* ---- Verdict Reveal ---- */
function VerdictReveal({ ruling }: { ruling: number }) {
  const isBuyerWin = ruling === 1;

  return (
    <motion.div
      className="card p-8 text-center overflow-hidden relative"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      {/* Background glow */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3, duration: 1 }}
        style={{
          background: isBuyerWin
            ? "radial-gradient(circle at center, rgba(59,130,246,0.08) 0%, transparent 70%)"
            : "radial-gradient(circle at center, rgba(251,146,60,0.08) 0%, transparent 70%)",
        }}
      />

      <motion.div
        className="relative z-10"
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.2 }}
      >
        <motion.div
          className={`w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center ${
            isBuyerWin ? "bg-blue-500/10 border-2 border-blue-500/30" : "bg-orange-500/10 border-2 border-orange-500/30"
          }`}
          animate={{
            boxShadow: [
              `0 0 0 0 ${isBuyerWin ? "rgba(59,130,246,0)" : "rgba(251,146,60,0)"}`,
              `0 0 0 12px ${isBuyerWin ? "rgba(59,130,246,0.1)" : "rgba(251,146,60,0.1)"}`,
              `0 0 0 0 ${isBuyerWin ? "rgba(59,130,246,0)" : "rgba(251,146,60,0)"}`,
            ],
          }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <Shield className={`w-7 h-7 ${isBuyerWin ? "text-blue-400" : "text-orange-400"}`} />
        </motion.div>

        <motion.p
          className="text-lg font-bold text-text-primary"
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          Dispute Resolved
        </motion.p>
        <motion.p
          className={`text-sm font-semibold mt-1 ${isBuyerWin ? "text-blue-400" : "text-orange-400"}`}
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.7 }}
        >
          {RULING_LABELS[ruling] ?? "Unknown"}
        </motion.p>
      </motion.div>
    </motion.div>
  );
}

/* ---- Appeal Window Section ---- */
function AppealWindowSection({
  disputeId,
  dispute,
  isBuyer,
  isSeller,
  onSuccess,
}: {
  disputeId: bigint;
  dispute: {
    ruling: number;
    createdAt: bigint;
  };
  isBuyer: boolean;
  isSeller: boolean;
  onSuccess: () => void;
}) {
  const rulingNum = Number(dispute.ruling);
  const appealRuling = useAppealRuling();
  const approveLOB = useApproveLOBForAppeal();
  const { data: appealDisputeId } = useAppealDisputeId(disputeId);
  const { data: isAppeal } = useIsAppealDispute(disputeId);

  const [step, setStep] = useState<"idle" | "approving" | "appealing" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  // Calculate appeal window deadline (createdAt is resolution proxy for now;
  // the contract uses the block.timestamp when executeRuling was called).
  // We approximate with createdAt + evidence + voting durations, but for a
  // resolved dispute the on-chain status already gates this.
  const resolvedAt = Number(dispute.createdAt); // proxy
  const appealDeadline = resolvedAt + APPEAL_WINDOW_SECONDS;
  const now = Math.floor(Date.now() / 1000);
  const appealWindowActive = now <= appealDeadline;

  // Is user the losing party?
  const isLosingParty =
    (isBuyer && rulingNum === 2) || (isSeller && rulingNum === 1);

  // If this IS an appeal dispute, no further appeals allowed
  if (isAppeal) return null;

  // If an appeal has already been filed
  const hasAppeal = appealDisputeId !== undefined && appealDisputeId !== BigInt(0);

  const handleAppeal = async () => {
    setError(null);
    setStep("approving");
    try {
      await approveLOB();
      setStep("appealing");
      await appealRuling(disputeId);
      setStep("done");
      setTimeout(() => onSuccess(), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Appeal failed");
      setStep("idle");
    }
  };

  if (hasAppeal) {
    return (
      <motion.div
        className="card p-3 sm:p-5 border-l-2 border-l-purple-500/40"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="w-4 h-4 text-purple-400" />
          <h3 className="text-xs font-semibold text-purple-400 uppercase tracking-wider">
            Appeal Filed
          </h3>
        </div>
        <p className="text-xs text-text-tertiary mb-3">
          This ruling has been appealed. A fresh 3-person Senior/Principal panel will re-review.
        </p>
        <Link
          href={`/disputes/${appealDisputeId!.toString()}`}
          className="inline-flex items-center gap-1.5 text-xs text-purple-400 font-medium hover:text-purple-300 transition-colors"
        >
          View Appeal Dispute #{appealDisputeId!.toString()}
          <ExternalLink className="w-3 h-3" />
        </Link>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="card p-3 sm:p-5 border-l-2 border-l-yellow-500/40"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Scale className="w-4 h-4 text-yellow-400" />
          <h3 className="text-xs font-semibold text-yellow-400 uppercase tracking-wider">
            Appeal Window
          </h3>
        </div>
        {appealWindowActive && (
          <CountdownTimer deadline={appealDeadline} />
        )}
      </div>

      {appealWindowActive ? (
        <>
          <p className="text-xs text-text-tertiary mb-4">
            The losing party can appeal this ruling within 48 hours by posting a 500 LOB bond.
            A fresh panel of Senior/Principal arbitrators will be assigned, excluding the original panel.
          </p>

          {isLosingParty ? (
            <>
              {error && (
                <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded p-2 mb-3">
                  {error}
                </div>
              )}
              {step === "done" ? (
                <div className="text-center py-2">
                  <span className="text-lob-green text-lg">{"\u2713"}</span>
                  <p className="text-xs text-text-secondary mt-1">Appeal filed successfully!</p>
                </div>
              ) : (
                <motion.button
                  className="flex items-center gap-2 text-xs font-medium px-4 py-2 rounded bg-purple-500/10 text-purple-400 border border-purple-400/20 hover:bg-purple-500/20 transition-colors"
                  whileTap={{ scale: 0.97 }}
                  onClick={handleAppeal}
                  disabled={step !== "idle"}
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {step === "approving"
                    ? "Approving 500 LOB..."
                    : step === "appealing"
                    ? "Filing appeal..."
                    : "File Appeal (500 LOB bond)"}
                </motion.button>
              )}
            </>
          ) : (
            <p className="text-xs text-text-tertiary italic">
              Only the losing party can file an appeal.
            </p>
          )}
        </>
      ) : (
        <p className="text-xs text-text-tertiary">
          The 48-hour appeal window has expired. This ruling can now be finalized.
        </p>
      )}
    </motion.div>
  );
}

/* ---- Finalize Section ---- */
function FinalizeSection({
  disputeId,
  onSuccess,
}: {
  disputeId: bigint;
  onSuccess: () => void;
}) {
  const finalizeRuling = useFinalizeRuling();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFinalize = async () => {
    setError(null);
    setLoading(true);
    try {
      await finalizeRuling(disputeId);
      setTimeout(() => onSuccess(), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Finalize failed");
    }
    setLoading(false);
  };

  return (
    <motion.div
      className="card p-3 sm:p-5 text-center border border-emerald-500/20"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex items-center justify-center gap-2 mb-2">
        <Gavel className="w-4 h-4 text-emerald-400" />
        <h3 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
          Ready to Finalize
        </h3>
      </div>
      <p className="text-xs text-text-tertiary mb-4">
        The appeal window has expired with no appeal filed. Anyone can finalize the ruling to
        execute the escrow outcome.
      </p>
      {error && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded p-2 mb-3 mx-auto max-w-sm">
          {error}
        </div>
      )}
      <motion.button
        className="btn-primary text-xs px-6"
        whileTap={{ scale: 0.97 }}
        onClick={handleFinalize}
        disabled={loading}
      >
        {loading ? "Finalizing..." : "Finalize Ruling"}
      </motion.button>
    </motion.div>
  );
}

/* ---- Appeal Badge (shown in header) ---- */
function AppealBadge({ disputeId }: { disputeId: bigint }) {
  const { data: isAppeal } = useIsAppealDispute(disputeId);
  const { data: appealDisputeId } = useAppealDisputeId(disputeId);

  if (!isAppeal && (!appealDisputeId || appealDisputeId === BigInt(0))) return null;

  if (isAppeal) {
    return (
      <span className="text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-400/20 flex items-center gap-1">
        <AlertTriangle className="w-2.5 h-2.5" />
        Appeal
      </span>
    );
  }

  if (appealDisputeId && appealDisputeId !== BigInt(0)) {
    return (
      <span className="text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-400/20 flex items-center gap-1">
        <AlertTriangle className="w-2.5 h-2.5" />
        Appealed
      </span>
    );
  }

  return null;
}

/* ---- Original Dispute Link (for appeal disputes) ---- */
function OriginalDisputeLink({ disputeId }: { disputeId: bigint }) {
  const { data: isAppeal } = useIsAppealDispute(disputeId);

  // For appeal disputes, we can't directly get the original ID from the contract
  // without an inverse mapping. We note it's an appeal.
  if (!isAppeal) return null;

  return (
    <motion.div
      className="card p-4 border-l-2 border-l-purple-500/40"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-purple-400" />
        <div>
          <p className="text-xs font-semibold text-purple-400">This is an Appeal Dispute</p>
          <p className="text-[10px] text-text-tertiary mt-0.5">
            This dispute was created via appeal. A fresh Senior/Principal panel has been assigned.
            Appeals are final and cannot be further appealed.
          </p>
        </div>
      </div>
    </motion.div>
  );
}

/* ---- Arbitrator Controls (if connected wallet is an arbitrator) ---- */
function ArbitratorSection({ address }: { address: `0x${string}` }) {
  const { data: arbInfo, isLoading } = useArbitratorInfo(address);
  const { data: isPaused, refetch: refetchPaused } = useIsArbitratorPaused(address);
  const { data: activeCount } = useActiveDisputeCount(address);
  const pauseArb = usePauseAsArbitrator();
  const unpauseArb = useUnpauseAsArbitrator();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const arbData = arbInfo as
    | { rank: number; disputesHandled: bigint; majorityVotes: bigint; active: boolean; stake: bigint }
    | undefined;

  if (isLoading || !arbData?.active) return null;

  const disputesHandled = Number(arbData.disputesHandled);
  const majorityVotesPct = Number(arbData.majorityVotes);
  const stakeDisplay = Number(formatEther(arbData.stake)).toLocaleString();
  const activeDisputeCount = activeCount !== undefined ? Number(activeCount) : 0;

  const RANK_NAMES = ["Unranked", "Junior", "Senior", "Principal"];
  const rankName = RANK_NAMES[Number(arbData.rank)] ?? "Unknown";

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

  return (
    <motion.div
      className="card p-3 sm:p-5"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <h3 className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-4">
        Arbitrator Controls
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Pause / Unpause */}
        <div className="flex items-center justify-between rounded-lg border border-border/60 p-4">
          <div>
            <p className="text-xs font-semibold text-text-primary">Availability</p>
            <p className="text-[10px] text-text-tertiary mt-0.5">
              {isPaused ? "Paused -- not receiving assignments" : "Active -- accepting assignments"}
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
              <span className="text-[10px] text-text-tertiary">Rank</span>
              <span className="text-[10px] text-text-secondary font-medium">{rankName}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-text-tertiary">Stake</span>
              <span className="text-[10px] text-text-secondary font-medium tabular-nums">{stakeDisplay} LOB</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-text-tertiary">Disputes Handled</span>
              <span className="text-[10px] text-text-secondary font-medium tabular-nums">{disputesHandled}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-text-tertiary">Active Disputes</span>
              <span className="text-[10px] text-text-secondary font-medium tabular-nums">{activeDisputeCount}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-text-tertiary">Majority Vote Rate</span>
              <span className="text-[10px] text-text-secondary font-medium tabular-nums">{majorityVotesPct}%</span>
            </div>
          </div>
        </div>
      </div>
      {error && (
        <p className="text-xs text-red-400 mt-2">{error}</p>
      )}
    </motion.div>
  );
}

/* ---- Arbitrator Chat Section ---- */
function ArbChatSection({
  disputeId,
  arbitrators,
}: {
  disputeId: string;
  arbitrators: readonly string[];
}) {
  const [ready, setReady] = useState(false);
  const [creating, setCreating] = useState(false);

  const channelId = `arb-${disputeId}`;

  // Lazy-create channel on mount
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      setCreating(true);
      try {
        const res = await fetch("/api/forum/channels", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            disputeId,
            participants: [...arbitrators],
          }),
        });
        if (res.ok && !cancelled) {
          setReady(true);
        }
      } catch {
        // Channel may already exist, try to load it directly
        if (!cancelled) setReady(true);
      } finally {
        if (!cancelled) setCreating(false);
      }
    };
    init();
    return () => { cancelled = true; };
  }, [disputeId, arbitrators]);

  if (creating && !ready) return null;

  return (
    <div>
      <h3 className="text-[10px] font-semibold text-purple-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
        <ShieldAlert className="w-3.5 h-3.5" />
        Arbitrator Private Chat
      </h3>
      <ChannelChat channelId={channelId} />
    </div>
  );
}

/* ---- Main Page ---- */

export default function DisputeDetailPage() {
  const params = useParams();
  const disputeIdStr = params.id as string;
  const { address } = useAccount();
  const [executing, setExecuting] = useState(false);
  const [execError, setExecError] = useState<string | null>(null);

  const isValidId = /^\d+$/.test(disputeIdStr);
  const disputeId = isValidId ? BigInt(disputeIdStr) : undefined;
  const { data: disputeData, isLoading, isError, refetch } = useDispute(disputeId);
  const executeRuling = useExecuteRuling();

  // Appeal-related reads
  const { data: isAppeal } = useIsAppealDispute(disputeId);
  const { data: appealDisputeId } = useAppealDisputeId(disputeId);

  const dispute = disputeData as
    | {
        id: bigint;
        jobId: bigint;
        buyer: `0x${string}`;
        seller: `0x${string}`;
        amount: bigint;
        token: `0x${string}`;
        buyerEvidenceURI: string;
        sellerEvidenceURI: string;
        status: number;
        ruling: number;
        createdAt: bigint;
        counterEvidenceDeadline: bigint;
        arbitrators: readonly [`0x${string}`, `0x${string}`, `0x${string}`];
        votesForBuyer: number;
        votesForSeller: number;
        totalVotes: number;
      }
    | undefined;

  if (!isValidId) {
    return (
      <div className="max-w-3xl mx-auto flex flex-col items-center justify-center py-24 text-center">
        <div className="card p-8 space-y-4">
          <p className="text-lg font-semibold text-text-primary">Dispute not found</p>
          <p className="text-sm text-text-tertiary">Invalid dispute ID.</p>
          <Link href="/disputes" className="inline-block mt-2 text-sm font-medium text-lob-green hover:text-lob-green/80">
            Back to Disputes
          </Link>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="card p-3 sm:p-5 animate-pulse">
            <div className="h-4 bg-surface-3 rounded w-1/3 mb-3" />
            <div className="h-3 bg-surface-3 rounded w-2/3 mb-2" />
            <div className="h-3 bg-surface-3 rounded w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (!dispute || isError || dispute.buyer === "0x0000000000000000000000000000000000000000") {
    return (
      <div className="max-w-3xl mx-auto flex flex-col items-center justify-center py-24 text-center">
        <div className="card p-8 space-y-4">
          <p className="text-lg font-semibold text-text-primary">Dispute not found</p>
          <p className="text-sm text-text-tertiary">This dispute does not exist.</p>
          <Link href="/disputes" className="inline-block mt-2 text-sm font-medium text-lob-green hover:text-lob-green/80">
            Back to Disputes
          </Link>
        </div>
      </div>
    );
  }

  const statusNum = Number(dispute.status);
  const rulingNum = Number(dispute.ruling);
  const statusLabel = STATUS_LABELS[statusNum] ?? "Unknown";
  const statusColors = STATUS_COLORS[statusNum] ?? STATUS_COLORS[0];
  const displayAmount = Number(formatEther(dispute.amount));
  const createdDate = new Date(Number(dispute.createdAt) * 1000).toLocaleDateString();

  const addr = address?.toLowerCase();
  const isBuyer = addr === dispute.buyer.toLowerCase();
  const isSeller = addr === dispute.seller.toLowerCase();
  const isArbitrator = dispute.arbitrators?.some(
    (a) => a.toLowerCase() === addr
  );
  const isParty = isBuyer || isSeller;

  const counterDeadline = Number(dispute.counterEvidenceDeadline);
  const now = Math.floor(Date.now() / 1000);
  const canSubmitCounterEvidence = isSeller && statusNum === 1 && counterDeadline > now;

  const totalVotes = (dispute.votesForBuyer ?? 0) + (dispute.votesForSeller ?? 0);
  const canExecuteRuling = statusNum === 2 && totalVotes >= 2;

  // Appeal window logic
  const resolvedAt = Number(dispute.createdAt); // proxy for resolution time
  const appealDeadline = resolvedAt + APPEAL_WINDOW_SECONDS;
  const appealWindowExpired = statusNum === 3 && now > appealDeadline;
  const hasAppeal = appealDisputeId !== undefined && appealDisputeId !== BigInt(0);
  // Show finalize button if resolved, appeal window expired, and no appeal filed
  const canFinalize = appealWindowExpired && !hasAppeal && !isAppeal;

  const handleExecuteRuling = async () => {
    if (!disputeId) return;
    setExecuting(true);
    setExecError(null);
    try {
      await executeRuling(disputeId);
      setTimeout(() => refetch(), 3000);
    } catch (err) {
      setExecError(err instanceof Error ? err.message : "Execution failed");
    } finally {
      setExecuting(false);
    }
  };

  return (
    <motion.div className="max-w-4xl mx-auto" initial="hidden" animate="show" variants={stagger}>
      {/* Breadcrumb */}
      <motion.div variants={fadeUp} className="flex items-center gap-2 text-xs text-text-tertiary mb-4">
        <Link href="/disputes" className="hover:text-text-secondary transition-colors">
          Disputes
        </Link>
        <span>/</span>
        <span className="text-text-secondary tabular-nums">#{disputeIdStr}</span>
      </motion.div>

      {/* Header with status + timer */}
      <motion.div variants={fadeUp} className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <span className={`text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded ${statusColors.bg} ${statusColors.text} border ${statusColors.border}`}>
              {statusLabel}
            </span>
            {statusNum === 3 && (
              <span className={`text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded ${
                rulingNum === 1 ? "bg-blue-500/10 text-blue-400 border border-blue-400/20" : "bg-orange-500/10 text-orange-400 border border-orange-400/20"
              }`}>
                {RULING_LABELS[rulingNum]}
              </span>
            )}
            {/* Appeal badge */}
            {disputeId !== undefined && <AppealBadge disputeId={disputeId} />}
            {isBuyer && (
              <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-400/20">
                Buyer
              </span>
            )}
            {isSeller && (
              <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400 border border-orange-400/20">
                Seller
              </span>
            )}
            {isArbitrator && (
              <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-400/20">
                Arbitrator
              </span>
            )}
          </div>
          <h1 className="text-xl font-bold text-text-primary">Dispute #{disputeIdStr}</h1>
        </div>

        {/* Countdown timer for evidence phase */}
        {statusNum === 1 && counterDeadline > now && (
          <CountdownTimer deadline={counterDeadline} />
        )}
      </motion.div>

      {/* Original dispute link for appeal disputes */}
      {disputeId !== undefined && (
        <motion.div variants={fadeUp} className="mb-6">
          <OriginalDisputeLink disputeId={disputeId} />
        </motion.div>
      )}

      {/* ---- Arena Layout: Split Screen ---- */}
      <motion.div variants={fadeUp} className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Buyer Side */}
        <div className="space-y-4">
          <div className="card p-3 sm:p-5 border-l-2 border-l-blue-500/40">
            <h2 className="text-sm font-semibold text-blue-400 mb-3 flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-blue-500/10 flex items-center justify-center">
                <span className="text-[9px] font-bold text-blue-400">B</span>
              </div>
              Buyer
            </h2>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-tertiary">Address</span>
                <Link href={`/forum/u/${dispute.buyer}`} className="text-xs text-text-primary font-mono hover:text-lob-green transition-colors">
                  {dispute.buyer.slice(0, 6)}...{dispute.buyer.slice(-4)}
                </Link>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-tertiary">Amount</span>
                <span className="text-xs text-text-primary font-medium tabular-nums">{displayAmount.toLocaleString()} LOB</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-tertiary">Job</span>
                <Link href={`/jobs/${dispute.jobId}`} className="text-xs text-lob-green hover:underline tabular-nums">
                  #{dispute.jobId.toString()}
                </Link>
              </div>
            </div>
          </div>

          {/* Buyer evidence */}
          {(isParty || isArbitrator) && (
            <div className="card p-4">
              <h3 className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-2">
                Buyer Evidence
              </h3>
              {dispute.buyerEvidenceURI ? (
                <a href={dispute.buyerEvidenceURI} target="_blank" rel="noopener noreferrer" className="text-xs text-lob-green hover:underline break-all">
                  {dispute.buyerEvidenceURI}
                </a>
              ) : (
                <p className="text-xs text-text-tertiary">No evidence submitted yet</p>
              )}
            </div>
          )}
        </div>

        {/* Seller Side */}
        <div className="space-y-4">
          <div className="card p-3 sm:p-5 border-l-2 border-l-orange-500/40">
            <h2 className="text-sm font-semibold text-orange-400 mb-3 flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-orange-500/10 flex items-center justify-center">
                <span className="text-[9px] font-bold text-orange-400">S</span>
              </div>
              Seller
            </h2>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-tertiary">Address</span>
                <Link href={`/forum/u/${dispute.seller}`} className="text-xs text-text-primary font-mono hover:text-lob-green transition-colors">
                  {dispute.seller.slice(0, 6)}...{dispute.seller.slice(-4)}
                </Link>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-tertiary">Created</span>
                <span className="text-xs text-text-primary">{createdDate}</span>
              </div>
            </div>
          </div>

          {/* Seller evidence */}
          {(isParty || isArbitrator) && (
            <div className="card p-4">
              <h3 className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-2">
                Seller Evidence
              </h3>
              {dispute.sellerEvidenceURI ? (
                <a href={dispute.sellerEvidenceURI} target="_blank" rel="noopener noreferrer" className="text-xs text-lob-green hover:underline break-all">
                  {dispute.sellerEvidenceURI}
                </a>
              ) : (
                <p className="text-xs text-text-tertiary">No counter-evidence submitted yet</p>
              )}
            </div>
          )}
        </div>
      </motion.div>

      {/* Vote Bar -- center between sides */}
      {(statusNum === 2 || statusNum === 3) && (
        <motion.div variants={fadeUp} className="mb-6">
          <VoteBar
            buyerVotes={dispute.votesForBuyer ?? 0}
            sellerVotes={dispute.votesForSeller ?? 0}
          />
        </motion.div>
      )}

      {/* Arbitrators */}
      {dispute.arbitrators && (
        <motion.div variants={fadeUp} className="mb-6">
          <div className="card p-4">
            <h3 className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-3">
              Arbitration Panel
              {isAppeal && (
                <span className="ml-2 text-purple-400 normal-case">(Appeal Panel)</span>
              )}
            </h3>
            <div className="flex flex-wrap gap-3">
              {dispute.arbitrators
                .filter((a) => a !== "0x0000000000000000000000000000000000000000")
                .map((arb, i) => (
                  <Link
                    key={i}
                    href={`/forum/u/${arb}`}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-purple-500/20 bg-purple-500/5 hover:border-purple-500/40 transition-colors"
                  >
                    <div className="w-4 h-4 rounded-full bg-purple-500/20 flex items-center justify-center">
                      <span className="text-[8px] font-bold text-purple-400">{i + 1}</span>
                    </div>
                    <span className="text-xs text-text-primary font-mono">
                      {arb.slice(0, 6)}...{arb.slice(-4)}
                    </span>
                  </Link>
                ))}
            </div>
          </div>
        </motion.div>
      )}

      {/* Timeline */}
      <motion.div variants={fadeUp} className="mb-6">
        <DisputeTimeline
          status={statusNum}
          createdAt={Number(dispute.createdAt)}
          counterEvidenceDeadline={counterDeadline}
        />
      </motion.div>

      {/* Full evidence viewer */}
      {isParty || isArbitrator ? (
        <motion.div variants={fadeUp} className="mb-6">
          <EvidenceViewer disputeId={disputeIdStr} />
        </motion.div>
      ) : null}

      {/* Evidence upload for parties during evidence phase */}
      {isParty && statusNum === 1 && !canSubmitCounterEvidence && (
        <motion.div variants={fadeUp} className="mb-6">
          <EvidenceUpload disputeId={disputeIdStr} onSuccess={() => refetch()} />
        </motion.div>
      )}

      {/* Counter-evidence for seller */}
      {canSubmitCounterEvidence && disputeId && (
        <motion.div variants={fadeUp} className="mb-6">
          <CounterEvidenceForm
            disputeId={disputeId}
            counterEvidenceDeadline={counterDeadline}
            onSuccess={() => refetch()}
          />
        </motion.div>
      )}

      {/* Voting panel for arbitrators */}
      {isArbitrator && statusNum === 2 && disputeId && (
        <motion.div variants={fadeUp} className="mb-6">
          <VotingPanel
            disputeId={disputeId}
            votesForBuyer={dispute.votesForBuyer ?? 0}
            votesForSeller={dispute.votesForSeller ?? 0}
            onSuccess={() => refetch()}
          />
        </motion.div>
      )}

      {/* Execute ruling button */}
      {canExecuteRuling && (
        <motion.div variants={fadeUp} className="mb-6">
          <div className="card p-3 sm:p-5 text-center">
            <p className="text-xs text-text-tertiary mb-3">
              Voting complete ({totalVotes} votes). Anyone can execute the ruling.
            </p>
            {execError && (
              <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded p-2 mb-3">
                {execError}
              </div>
            )}
            <motion.button
              className="btn-primary text-xs px-6"
              whileTap={{ scale: 0.97 }}
              onClick={handleExecuteRuling}
              disabled={executing}
            >
              {executing ? "Executing..." : "Execute Ruling"}
            </motion.button>
          </div>
        </motion.div>
      )}

      {/* Resolved state -- verdict reveal */}
      {statusNum === 3 && (
        <motion.div variants={fadeUp} className="mb-6">
          <VerdictReveal ruling={rulingNum} />
        </motion.div>
      )}

      {/* Appeal window section (only for resolved, non-appeal disputes) */}
      {statusNum === 3 && disputeId !== undefined && (
        <motion.div variants={fadeUp} className="mb-6">
          <AppealWindowSection
            disputeId={disputeId}
            dispute={{ ruling: dispute.ruling, createdAt: dispute.createdAt }}
            isBuyer={isBuyer}
            isSeller={isSeller}
            onSuccess={() => refetch()}
          />
        </motion.div>
      )}

      {/* Finalize section (appeal window expired, no appeal) */}
      {canFinalize && disputeId !== undefined && (
        <motion.div variants={fadeUp} className="mb-6">
          <FinalizeSection
            disputeId={disputeId}
            onSuccess={() => refetch()}
          />
        </motion.div>
      )}

      {/* Arbitrator controls (if connected wallet is an arbitrator on this dispute) */}
      {isArbitrator && address && (
        <motion.div variants={fadeUp} className="mb-6">
          <ArbitratorSection address={address} />
        </motion.div>
      )}

      {/* Arbitrator private chat */}
      {isArbitrator && dispute.arbitrators && (
        <motion.div variants={fadeUp} className="mb-6">
          <ArbChatSection
            disputeId={disputeIdStr}
            arbitrators={dispute.arbitrators.filter(
              (a) => a !== "0x0000000000000000000000000000000000000000"
            )}
          />
        </motion.div>
      )}

      {/* BaseScan link */}
      <motion.div variants={fadeUp} className="mt-4 text-center">
        <a
          href={getExplorerUrl("address", dispute.buyer)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-text-tertiary hover:text-lob-green transition-colors"
        >
          View on BaseScan
        </a>
      </motion.div>
    </motion.div>
  );
}
