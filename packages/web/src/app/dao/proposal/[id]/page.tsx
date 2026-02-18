"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { fadeUp, stagger, ease } from "@/lib/motion";
// TODO: Re-enable these imports when contract proposal data is mapped to the full UI
// import { STATUS_COLORS, TYPE_LABELS, formatNumber, timeAgo, timeUntil } from "../../_data/dao-utils";
// import VoteBar from "../../_components/VoteBar";
import type { VoteChoice } from "../../_data/dao-utils";
import { useTreasuryProposal } from "@/lib/hooks";

/* ── Vote choice display helpers ──────────────────────────────── */
const VOTE_CHOICE_CONFIG: Record<VoteChoice, { label: string; dot: string; text: string; bg: string; border: string }> = {
  for: { label: "For", dot: "bg-green-400", text: "text-green-400", bg: "bg-green-500/10", border: "border-green-500/30" },
  against: { label: "Against", dot: "bg-red-400", text: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/30" },
  abstain: { label: "Abstain", dot: "bg-zinc-400", text: "text-zinc-400", bg: "bg-zinc-500/10", border: "border-zinc-500/30" },
};

// TODO: Re-enable these helpers when contract proposal data is mapped to the full UI
// function formatDate(timestamp: number): string {
//   return new Date(timestamp).toLocaleDateString("en-US", {
//     month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
//   });
// }
// function formatShortDate(timestamp: number): string {
//   return new Date(timestamp).toLocaleDateString("en-US", {
//     month: "short", day: "numeric", year: "numeric",
//   });
// }
// function renderBody(body: string) { ... }

/* ── Main page component ──────────────────────────────────────── */
export default function ProposalDetailPage() {
  const params = useParams();
  const proposalId = params.id as string;

  // Try to parse as bigint for contract lookup
  const proposalIdBigInt = (() => {
    try {
      return BigInt(proposalId);
    } catch {
      return undefined;
    }
  })();

  const { data: proposal, isLoading, isError } = useTreasuryProposal(proposalIdBigInt);

  const [selectedVote, setSelectedVote] = useState<VoteChoice | null>(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [confirmedChoice, setConfirmedChoice] = useState<VoteChoice | null>(null);

  /* ── Loading state ───────────────────────────────────────── */
  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
        <motion.div
          className="w-10 h-10 rounded-full border border-border flex items-center justify-center"
          animate={{ rotate: [0, 360] }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: "linear",
          }}
        >
          <div className="w-2 h-2 rounded-full bg-lob-green" />
        </motion.div>
        <p className="text-sm text-text-tertiary">
          Loading proposal...
        </p>
      </div>
    );
  }

  /* ── Not found ────────────────────────────────────────────── */
  if (!proposal || isError) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
        <div className="text-5xl font-bold text-text-tertiary">404</div>
        <p className="text-sm text-text-tertiary">
          Proposal not found
        </p>
        <p className="text-xs text-text-tertiary max-w-sm text-center">
          This proposal may not exist on-chain yet, or the governance contract has not been deployed.
        </p>
        <Link
          href="/dao"
          className="text-sm text-lob-green hover:underline"
        >
          Back to Governance
        </Link>
      </div>
    );
  }

  // TODO: Map contract proposal data to UI once the TreasuryGovernor ABI shape is finalized
  // For now, show a placeholder with the raw proposal data

  /* ── Vote handler ─────────────────────────────────────────── */
  function handleVote() {
    if (!selectedVote) return;
    setConfirmedChoice(selectedVote);
    setHasVoted(true);
    setSelectedVote(null);
  }

  return (
    <motion.div
      className="max-w-7xl mx-auto px-4 py-8"
      variants={stagger}
      initial="hidden"
      animate="show"
    >
      {/* Back link */}
      <motion.div variants={fadeUp} className="mb-6">
        <Link
          href="/dao"
          className="inline-flex items-center gap-1.5 text-sm text-text-tertiary hover:text-lob-green transition-colors"
        >
          <span>&larr;</span>
          <span>Back to Governance</span>
        </Link>
      </motion.div>

      {/* Proposal data card */}
      <motion.div variants={fadeUp} className="card p-5">
        <h1 className="text-2xl font-bold text-text-primary mb-4">
          Proposal #{proposalId}
        </h1>

        <div className="bg-surface-2 rounded-lg p-4">
          <p className="text-xs text-text-tertiary mb-2">
            Raw contract data:
          </p>
          <pre className="text-xs text-text-secondary font-mono overflow-x-auto whitespace-pre-wrap break-all">
            {JSON.stringify(proposal, (_key, value) =>
              typeof value === "bigint" ? value.toString() : value,
            2)}
          </pre>
        </div>

        {/* Vote buttons */}
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-text-primary mb-4">
            Cast Your Vote
          </h2>

          {hasVoted && confirmedChoice ? (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease }}
              className={`flex items-center gap-3 p-4 rounded-lg border ${VOTE_CHOICE_CONFIG[confirmedChoice].bg} ${VOTE_CHOICE_CONFIG[confirmedChoice].border}`}
            >
              <span className={`w-3 h-3 rounded-full ${VOTE_CHOICE_CONFIG[confirmedChoice].dot}`} />
              <span className={`text-sm font-medium ${VOTE_CHOICE_CONFIG[confirmedChoice].text}`}>
                You voted: {VOTE_CHOICE_CONFIG[confirmedChoice].label}
              </span>
            </motion.div>
          ) : (
            <>
              <div className="flex flex-wrap gap-3 mb-4">
                {(["for", "against", "abstain"] as VoteChoice[]).map((choice) => {
                  const config = VOTE_CHOICE_CONFIG[choice];
                  const isSelected = selectedVote === choice;
                  return (
                    <motion.button
                      key={choice}
                      onClick={() => setSelectedVote(choice)}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className={`flex-1 min-w-[120px] py-3 px-4 rounded-lg border text-sm font-medium transition-colors ${
                        isSelected
                          ? `${config.bg} ${config.border} ${config.text}`
                          : "bg-surface-2 border-border/40 text-text-secondary hover:border-border"
                      }`}
                    >
                      <span className="flex items-center justify-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${isSelected ? config.dot : "bg-text-tertiary"}`} />
                        {config.label}
                      </span>
                    </motion.button>
                  );
                })}
              </div>

              {selectedVote && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  transition={{ duration: 0.3, ease }}
                >
                  <div className="flex items-center gap-3">
                    <p className="text-xs text-text-tertiary flex-1">
                      Confirm your vote:{" "}
                      <span className={`font-medium ${VOTE_CHOICE_CONFIG[selectedVote].text}`}>
                        {VOTE_CHOICE_CONFIG[selectedVote].label}
                      </span>
                    </p>
                    <motion.button
                      onClick={handleVote}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.97 }}
                      className="px-5 py-2 rounded-lg bg-lob-green text-black text-sm font-semibold hover:bg-lob-green/90 transition-colors"
                    >
                      Confirm Vote
                    </motion.button>
                    <button
                      onClick={() => setSelectedVote(null)}
                      className="text-xs text-text-tertiary hover:text-text-secondary transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </motion.div>
              )}
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
