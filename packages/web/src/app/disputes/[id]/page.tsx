"use client";

import { useParams } from "next/navigation";
import { useAccount } from "wagmi";
import { motion } from "framer-motion";
import Link from "next/link";
import { stagger, fadeUp, ease } from "@/lib/motion";
import { useDispute, useExecuteRuling } from "@/lib/hooks";
import { formatEther } from "viem";
import { useState } from "react";
import dynamic from "next/dynamic";

const VotingPanel = dynamic(() => import("./_components/VotingPanel"), { ssr: false });
const EvidenceViewer = dynamic(() => import("./_components/EvidenceViewer"), { ssr: false });
const EvidenceUpload = dynamic(() => import("./_components/EvidenceUpload"), { ssr: false });
const CounterEvidenceForm = dynamic(() => import("./_components/CounterEvidenceForm"), { ssr: false });
const DisputeTimeline = dynamic(() => import("./_components/DisputeTimeline"), { ssr: false });

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
      <div className="max-w-3xl mx-auto space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="card p-5 animate-pulse">
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

  // Anyone can execute ruling when voting is done (2+ votes)
  const totalVotes = (dispute.votesForBuyer ?? 0) + (dispute.votesForSeller ?? 0);
  const canExecuteRuling = statusNum === 2 && totalVotes >= 2;

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
    <motion.div className="max-w-3xl mx-auto" initial="hidden" animate="show" variants={stagger}>
      {/* Breadcrumb */}
      <motion.div variants={fadeUp} className="flex items-center gap-2 text-xs text-text-tertiary mb-4">
        <Link href="/disputes" className="hover:text-text-secondary transition-colors">
          Disputes
        </Link>
        <span>/</span>
        <span className="text-text-secondary tabular-nums">#{disputeIdStr}</span>
      </motion.div>

      {/* Header */}
      <motion.div variants={fadeUp} className="mb-6">
        <div className="flex items-center gap-3 mb-2">
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
      </motion.div>

      {/* Details grid */}
      <motion.div variants={fadeUp} className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-text-primary mb-3">Details</h2>
          <div className="space-y-3">
            {[
              { label: "Amount", value: `${displayAmount.toLocaleString()} LOB` },
              { label: "Job", value: `#${dispute.jobId.toString()}`, href: `/jobs/${dispute.jobId}` },
              { label: "Created", value: createdDate },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between">
                <span className="text-xs text-text-tertiary">{item.label}</span>
                {"href" in item && item.href ? (
                  <Link href={item.href} className="text-xs text-lob-green hover:underline tabular-nums">
                    {item.value}
                  </Link>
                ) : (
                  <span className="text-xs text-text-primary font-medium tabular-nums">{item.value}</span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <h2 className="text-sm font-semibold text-text-primary mb-3">Parties</h2>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-text-tertiary mb-1">Buyer</p>
              <Link href={`/forum/u/${dispute.buyer}`} className="text-xs text-text-primary font-mono hover:text-lob-green transition-colors">
                {dispute.buyer.slice(0, 6)}...{dispute.buyer.slice(-4)}
              </Link>
            </div>
            <div>
              <p className="text-xs text-text-tertiary mb-1">Seller</p>
              <Link href={`/forum/u/${dispute.seller}`} className="text-xs text-text-primary font-mono hover:text-lob-green transition-colors">
                {dispute.seller.slice(0, 6)}...{dispute.seller.slice(-4)}
              </Link>
            </div>
            {dispute.arbitrators && (
              <div>
                <p className="text-xs text-text-tertiary mb-1">Arbitrators</p>
                <div className="space-y-1">
                  {dispute.arbitrators.filter((a) => a !== "0x0000000000000000000000000000000000000000").map((arb, i) => (
                    <Link key={i} href={`/forum/u/${arb}`} className="block text-xs text-text-primary font-mono hover:text-lob-green transition-colors">
                      {arb.slice(0, 6)}...{arb.slice(-4)}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Timeline */}
      <motion.div variants={fadeUp} className="mb-6">
        <DisputeTimeline
          status={statusNum}
          createdAt={Number(dispute.createdAt)}
          counterEvidenceDeadline={counterDeadline}
        />
      </motion.div>

      {/* Evidence */}
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

      {/* Vote tally for non-arbitrators during voting */}
      {!isArbitrator && statusNum === 2 && (
        <motion.div variants={fadeUp} className="mb-6">
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-text-primary mb-3">Vote Tally</h3>
            <div className="flex items-center gap-4">
              <div className="flex-1 text-center">
                <p className="text-lg font-bold text-blue-400 tabular-nums">{dispute.votesForBuyer ?? 0}</p>
                <p className="text-[10px] text-text-tertiary uppercase tracking-wider">For Buyer</p>
              </div>
              <div className="text-xs text-text-tertiary">vs</div>
              <div className="flex-1 text-center">
                <p className="text-lg font-bold text-orange-400 tabular-nums">{dispute.votesForSeller ?? 0}</p>
                <p className="text-[10px] text-text-tertiary uppercase tracking-wider">For Seller</p>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Execute ruling button */}
      {canExecuteRuling && (
        <motion.div variants={fadeUp} className="mb-6">
          <div className="card p-5 text-center">
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

      {/* Resolved state */}
      {statusNum === 3 && (
        <motion.div variants={fadeUp} className="mb-6">
          <div className="card p-5 text-center">
            <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-3">
              <span className="text-emerald-400 text-lg">{"\u2713"}</span>
            </div>
            <p className="text-sm text-text-secondary">Dispute Resolved</p>
            <p className="text-xs text-text-tertiary mt-1">
              Ruling: {RULING_LABELS[rulingNum] ?? "Unknown"}
            </p>
          </div>
        </motion.div>
      )}

      {/* BaseScan link */}
      <motion.div variants={fadeUp} className="mt-4 text-center">
        <a
          href={`https://basescan.org/address/${dispute.buyer}`}
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
