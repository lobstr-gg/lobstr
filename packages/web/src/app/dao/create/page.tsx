"use client";

import { useState, useCallback, useEffect, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useWriteContract, useWaitForTransactionReceipt, useAccount } from "wagmi";
import { parseEther } from "viem";
import { stagger, fadeUp } from "@/lib/motion";
import { TreasuryGovernorABI } from "@/config/abis";
import { getContracts, CHAIN } from "@/config/contracts";
import type { ProposalType, ProposalAction } from "../_data/dao-utils";
import { TYPE_LABELS } from "../_data/dao-utils";

/* ── Constants ─────────────────────────────────────────────────── */

const PROPOSAL_TYPES: ProposalType[] = [
  "parameter",
  "treasury",
  "upgrade",
  "social",
  "emergency",
];

const TYPE_BG_ACTIVE: Record<ProposalType, string> = {
  parameter: "bg-orange-500/20 border-orange-500/40",
  treasury: "bg-yellow-500/20 border-yellow-500/40",
  upgrade: "bg-blue-500/20 border-blue-500/40",
  social: "bg-pink-500/20 border-pink-500/40",
  emergency: "bg-red-500/20 border-red-500/40",
};

const CONTRACT_OPTIONS = [
  "LOBToken",
  "StakingManager",
  "ReputationSystem",
  "ServiceRegistry",
  "DisputeArbitration",
  "EscrowEngine",
];

const VOTING_PERIODS = [
  { label: "3 days", value: 3 },
  { label: "5 days", value: 5 },
  { label: "7 days", value: 7 },
  { label: "14 days", value: 14 },
];

const QUORUM_OPTIONS = [
  { label: "1% (10M LOB)", value: 10_000_000 },
  { label: "2.5% (25M LOB)", value: 25_000_000 },
  { label: "5% (50M LOB)", value: 50_000_000 },
  { label: "10% (100M LOB)", value: 100_000_000 },
];

/* ── Page ──────────────────────────────────────────────────────── */

export default function CreateProposalPage() {
  const router = useRouter();
  const { address } = useAccount();
  const contracts = getContracts(CHAIN.id);

  /* ── Contract write hooks ────────────────────────────────────── */
  const {
    writeContract,
    data: txHash,
    isPending,
    error: writeError,
    reset: resetWrite,
  } = useWriteContract();

  const {
    isLoading: isConfirming,
    isSuccess,
    error: confirmError,
  } = useWaitForTransactionReceipt({ hash: txHash });

  const txError = writeError || confirmError;

  // Navigate to DAO page on success
  useEffect(() => {
    if (isSuccess) {
      toast.success("Proposal submitted successfully!", {
        description: txHash
          ? `Tx: ${txHash.slice(0, 10)}...${txHash.slice(-8)}`
          : "Your proposal is now on-chain.",
      });
      const timeout = setTimeout(() => router.push("/dao"), 2000);
      return () => clearTimeout(timeout);
    }
  }, [isSuccess, txHash, router]);

  /* ── Form state ──────────────────────────────────────────────── */
  const [title, setTitle] = useState("");
  const [type, setType] = useState<ProposalType | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [summary, setSummary] = useState("");
  const [body, setBody] = useState("");
  const [actions, setActions] = useState<ProposalAction[]>([]);
  const [votingPeriod, setVotingPeriod] = useState(7);
  const [quorum, setQuorum] = useState(25_000_000);
  const [forumThread, setForumThread] = useState("");
  const isSubmitting = isPending || isConfirming;
  const [showPreview, setShowPreview] = useState(false);

  /* ── Tags ────────────────────────────────────────────────────── */
  const handleAddTag = useCallback(
    (value: string) => {
      const tag = value.trim().toLowerCase();
      if (tag && !tags.includes(tag) && tags.length < 6) {
        setTags((prev) => [...prev, tag]);
      }
      setTagInput("");
    },
    [tags],
  );

  const handleTagKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      handleAddTag(tagInput);
    }
    if (e.key === "Backspace" && !tagInput && tags.length > 0) {
      setTags((prev) => prev.slice(0, -1));
    }
  };

  const handleRemoveTag = (tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag));
  };

  /* ── Actions ─────────────────────────────────────────────────── */
  const handleAddAction = () => {
    setActions((prev) => [
      ...prev,
      { target: CONTRACT_OPTIONS[0], signature: "", description: "" },
    ]);
  };

  const handleRemoveAction = (index: number) => {
    setActions((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpdateAction = (
    index: number,
    field: keyof ProposalAction,
    value: string,
  ) => {
    setActions((prev) =>
      prev.map((a, i) => (i === index ? { ...a, [field]: value } : a)),
    );
  };

  /* ── Submit ──────────────────────────────────────────────────── */
  const canSubmit = title.trim() && type && summary.trim() && !isSubmitting && !!contracts;

  const handleSubmit = async () => {
    if (!canSubmit || !contracts || !address) return;
    resetWrite();

    if (type === "treasury") {
      // Treasury proposals use TreasuryGovernor.createProposal
      const descriptionText = `${title}\n\n${summary}\n\n${body}`;
      writeContract({
        address: contracts.treasuryGovernor,
        abi: TreasuryGovernorABI,
        functionName: "createProposal",
        args: [
          contracts.lobToken,                 // token (default to LOB)
          address,                            // recipient (proposer as default)
          parseEther("0"),                    // amount (0 for general proposals)
          descriptionText,                    // description
        ],
      });
    } else {
      // Non-treasury proposals also go through createProposal with description
      const descriptionText = `[${type?.toUpperCase()}] ${title}\n\n${summary}\n\n${body}`;
      writeContract({
        address: contracts.treasuryGovernor,
        abi: TreasuryGovernorABI,
        functionName: "createProposal",
        args: [
          contracts.lobToken,
          address,
          parseEther("0"),
          descriptionText,
        ],
      });
    }
  };

  /* ── Render ──────────────────────────────────────────────────── */
  return (
    <motion.div
      className="mx-auto max-w-2xl px-4 py-10"
      variants={stagger}
      initial="hidden"
      animate="show"
    >
      {/* ── Header ────────────────────────────────────────────── */}
      <motion.div variants={fadeUp} className="mb-8">
        <Link
          href="/dao"
          className="inline-flex items-center gap-1.5 text-xs text-text-tertiary hover:text-lob-green transition-colors mb-4"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 12H5" />
            <path d="m12 19-7-7 7-7" />
          </svg>
          Back to Governance
        </Link>
        <h1 className="text-2xl font-bold text-text-primary mb-1">
          Create Proposal
        </h1>
        <p className="text-sm text-text-tertiary">
          Submit a governance proposal for the LOBSTR community to vote on.
        </p>
      </motion.div>

      <div className="space-y-4">
        {/* ─── Section 1: Proposal Details ────────────────────── */}
        <motion.div variants={fadeUp} className="card p-6 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">
              Proposal Details
            </h2>
            <p className="text-xs text-text-tertiary">
              Basic information about your proposal.
            </p>
          </div>

          {/* Title */}
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1.5 block">
              Title <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              className="input-field"
              placeholder="A clear, descriptive title for your proposal"
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <p className="text-[10px] text-text-tertiary text-right mt-1">
              {title.length}/120
            </p>
          </div>

          {/* Type selector */}
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1.5 block">
              Type <span className="text-red-400">*</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {PROPOSAL_TYPES.map((t) => {
                const isActive = type === t;
                const label = TYPE_LABELS[t];
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={`relative rounded-full px-3.5 py-1.5 text-xs font-medium border transition-all duration-200 ${
                      isActive
                        ? `${TYPE_BG_ACTIVE[t]} ${label.color}`
                        : "border-border bg-surface-2 text-text-tertiary hover:text-text-secondary hover:border-border-hover"
                    }`}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="proposal-type"
                        className="absolute inset-0 rounded-full bg-white/5"
                        transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
                      />
                    )}
                    <span className="relative z-10">{label.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1.5 block">
              Tags{" "}
              <span className="text-text-tertiary font-normal">
                (max 6, press Enter or comma to add)
              </span>
            </label>
            <div className="flex flex-wrap items-center gap-1.5 input-field min-h-[42px] !py-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="text-[10px] bg-surface-2 px-1.5 py-0.5 rounded inline-flex items-center gap-1 text-text-secondary border border-border"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    className="text-text-tertiary hover:text-red-400 transition-colors"
                  >
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M18 6 6 18" />
                      <path d="m6 6 12 12" />
                    </svg>
                  </button>
                </span>
              ))}
              {tags.length < 6 && (
                <input
                  type="text"
                  className="flex-1 min-w-[100px] bg-transparent text-sm text-text-primary placeholder-text-tertiary outline-none"
                  placeholder={tags.length === 0 ? "Add tags..." : ""}
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value.replace(",", ""))}
                  onKeyDown={handleTagKeyDown}
                  onBlur={() => {
                    if (tagInput.trim()) handleAddTag(tagInput);
                  }}
                />
              )}
            </div>
          </div>
        </motion.div>

        {/* ─── Section 2: Description ─────────────────────────── */}
        <motion.div variants={fadeUp} className="card p-6 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">
              Description
            </h2>
            <p className="text-xs text-text-tertiary">
              Explain the proposal in detail.
            </p>
          </div>

          {/* Summary */}
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1.5 block">
              Summary <span className="text-red-400">*</span>
            </label>
            <textarea
              className="input-field resize-none"
              rows={3}
              maxLength={280}
              placeholder="A concise summary shown in the proposal list"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
            <p className="text-[10px] text-text-tertiary text-right mt-1">
              {summary.length}/280
            </p>
          </div>

          {/* Full Description */}
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1.5 block">
              Full Description
            </label>
            <textarea
              className="input-field resize-none"
              rows={10}
              placeholder="Detailed proposal body with motivation, specification, and impact analysis"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            <p className="text-[10px] text-text-tertiary mt-1">
              Supports markdown formatting:{" "}
              <span className="font-mono">## headers</span>,{" "}
              <span className="font-mono">**bold**</span>,{" "}
              <span className="font-mono">- lists</span>,{" "}
              <span className="font-mono">1. numbered lists</span>
            </p>
          </div>
        </motion.div>

        {/* ─── Section 3: On-Chain Actions ────────────────────── */}
        <motion.div variants={fadeUp} className="card p-6 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">
              On-Chain Actions
            </h2>
            <p className="text-xs text-text-tertiary">
              Define the contract calls that will execute if this proposal
              passes. Social proposals can skip this section.
            </p>
          </div>

          {type === "social" ? (
            <div className="rounded-lg border border-border bg-surface-2 px-4 py-3">
              <p className="text-xs text-text-tertiary">
                Social proposals don&apos;t include on-chain actions.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {actions.map((action, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-border bg-surface-2 p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono text-text-tertiary">
                        Action {i + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveAction(i)}
                        className="text-text-tertiary hover:text-red-400 transition-colors p-1"
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M18 6 6 18" />
                          <path d="m6 6 12 12" />
                        </svg>
                      </button>
                    </div>

                    {/* Target */}
                    <div>
                      <label className="text-xs font-medium text-text-secondary mb-1.5 block">
                        Target Contract
                      </label>
                      <select
                        className="input-field"
                        value={action.target}
                        onChange={(e) =>
                          handleUpdateAction(i, "target", e.target.value)
                        }
                      >
                        {CONTRACT_OPTIONS.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Function signature */}
                    <div>
                      <label className="text-xs font-medium text-text-secondary mb-1.5 block">
                        Function Signature
                      </label>
                      <input
                        type="text"
                        className="input-field font-mono"
                        placeholder="setFeeBps(uint256)"
                        value={action.signature}
                        onChange={(e) =>
                          handleUpdateAction(i, "signature", e.target.value)
                        }
                      />
                    </div>

                    {/* Description */}
                    <div>
                      <label className="text-xs font-medium text-text-secondary mb-1.5 block">
                        Description
                      </label>
                      <input
                        type="text"
                        className="input-field"
                        placeholder="Human-readable description of this action"
                        value={action.description}
                        onChange={(e) =>
                          handleUpdateAction(i, "description", e.target.value)
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={handleAddAction}
                className="btn-secondary w-full flex items-center justify-center gap-2"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 5v14" />
                  <path d="M5 12h14" />
                </svg>
                Add Action
              </button>
            </>
          )}
        </motion.div>

        {/* ─── Section 4: Voting Configuration ────────────────── */}
        <motion.div variants={fadeUp} className="card p-6 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">
              Voting Configuration
            </h2>
            <p className="text-xs text-text-tertiary">
              Set voting parameters for your proposal.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Voting Period */}
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1.5 block">
                Voting Period
              </label>
              <select
                className="input-field"
                value={votingPeriod}
                onChange={(e) => setVotingPeriod(Number(e.target.value))}
              >
                {VOTING_PERIODS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Quorum */}
            <div>
              <label className="text-xs font-medium text-text-secondary mb-1.5 block">
                Quorum
              </label>
              <select
                className="input-field"
                value={quorum}
                onChange={(e) => setQuorum(Number(e.target.value))}
              >
                {QUORUM_OPTIONS.map((q) => (
                  <option key={q.value} value={q.value}>
                    {q.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Forum Thread */}
          <div>
            <label className="text-xs font-medium text-text-secondary mb-1.5 block">
              Forum Thread
            </label>
            <input
              type="text"
              className="input-field"
              placeholder="/forum/governance/..."
              value={forumThread}
              onChange={(e) => setForumThread(e.target.value)}
            />
            <p className="text-[10px] text-text-tertiary mt-1">
              Link to the forum discussion thread.
            </p>
          </div>

          {/* Voting Power Info */}
          <div className="rounded-lg border border-lob-green/20 bg-lob-green/5 px-4 py-3 flex items-start gap-3">
            <div className="mt-0.5 flex-shrink-0">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-lob-green"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4" />
                <path d="M12 8h.01" />
              </svg>
            </div>
            <p className="text-xs text-text-secondary">
              Proposals require a minimum of{" "}
              <span className="text-text-primary font-medium">
                100,000 LOB
              </span>{" "}
              voting power to submit. Your current voting power:{" "}
              <span className="text-lob-green font-semibold">
                2,450,000 LOB
              </span>
            </p>
          </div>
        </motion.div>

        {/* ─── Section 5: Preview & Submit ────────────────────── */}
        <motion.div variants={fadeUp} className="card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-text-primary">
                Preview &amp; Submit
              </h2>
              <p className="text-xs text-text-tertiary">
                Review your proposal before submitting.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowPreview((p) => !p)}
              className="btn-secondary text-xs flex items-center gap-1.5"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`transition-transform duration-200 ${showPreview ? "rotate-180" : ""}`}
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
              {showPreview ? "Hide" : "Show"} Preview
            </button>
          </div>

          {/* Collapsible preview */}
          <AnimatePresence>
            {showPreview && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="overflow-hidden"
              >
                <div className="rounded-lg border border-border bg-surface-2 p-4 space-y-3">
                  {/* Preview Header */}
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-text-tertiary">
                      LIP-XX
                    </span>
                    {type && (
                      <span
                        className={`text-[10px] font-medium ${TYPE_LABELS[type].color}`}
                      >
                        {TYPE_LABELS[type].label}
                      </span>
                    )}
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400">
                      Pending
                    </span>
                  </div>

                  {/* Title */}
                  <h3 className="text-sm font-medium text-text-primary">
                    {title || (
                      <span className="text-text-disabled italic">
                        Untitled Proposal
                      </span>
                    )}
                  </h3>

                  {/* Summary */}
                  <p className="text-xs text-text-tertiary">
                    {summary || (
                      <span className="italic">No summary provided.</span>
                    )}
                  </p>

                  {/* Meta row */}
                  <div className="flex flex-wrap items-center gap-3 text-[10px] text-text-tertiary pt-2 border-t border-border">
                    <span>
                      {actions.length} action{actions.length !== 1 ? "s" : ""}
                    </span>
                    <span>
                      {votingPeriod} day voting period
                    </span>
                    <span>
                      {(quorum / 1_000_000).toFixed(1)}M LOB quorum
                    </span>
                  </div>

                  {/* Tags preview */}
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {tags.map((tag) => (
                        <span
                          key={tag}
                          className="text-[10px] text-text-tertiary bg-surface-3 px-1.5 py-0.5 rounded"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error message */}
          <AnimatePresence>
            {txError && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3 }}
                className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-400"
              >
                {(txError as Error).message?.slice(0, 200) || "Transaction failed"}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Success message */}
          <AnimatePresence>
            {isSuccess && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3 }}
                className="rounded-md border border-lob-green/30 bg-lob-green-muted px-4 py-3 text-xs text-lob-green"
              >
                Proposal submitted on-chain!
                {txHash && (
                  <span className="block mt-1 font-mono text-[10px] text-text-tertiary break-all">
                    Tx: {txHash}
                  </span>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Submit button */}
          <button
            type="button"
            disabled={!canSubmit || isSuccess}
            onClick={handleSubmit}
            className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-lob-green"
          >
            {isPending ? (
              <>
                <svg
                  className="animate-spin h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Submitting...
              </>
            ) : isConfirming ? (
              <>
                <svg
                  className="animate-spin h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Confirming...
              </>
            ) : isSuccess ? (
              "Submitted"
            ) : (
              "Submit Proposal"
            )}
          </button>
        </motion.div>

        {/* ─── Requirements Card ──────────────────────────────── */}
        <motion.div variants={fadeUp} className="card p-6 space-y-4">
          <h2 className="text-sm font-semibold text-text-primary">
            Requirements
          </h2>
          <ul className="space-y-2.5">
            {[
              "Minimum 100,000 LOB voting power",
              "Must have a forum discussion thread",
              "Voting period: 3\u201314 days",
              "Quorum: 1\u201310% of total supply",
              "Emergency proposals require council approval",
            ].map((req) => (
              <li
                key={req}
                className="flex items-start gap-2 text-xs text-text-secondary"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-lob-green flex-shrink-0 mt-0.5"
                >
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <path d="m9 11 3 3L22 4" />
                </svg>
                {req}
              </li>
            ))}
          </ul>
        </motion.div>
      </div>
    </motion.div>
  );
}
