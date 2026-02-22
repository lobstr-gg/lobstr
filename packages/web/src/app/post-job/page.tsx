"use client";

import { useState, useCallback } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { motion, AnimatePresence } from "framer-motion";
import { ease } from "@/lib/motion";
import { useLOBBalance, useStakeInfo } from "@/lib/hooks";
import { formatEther, parseEther } from "viem";
import type { Variants } from "framer-motion";
import { ServiceRegistryABI } from "@/config/abis";
import { getContracts, CHAIN, USDC } from "@/config/contracts";

const CATEGORIES = [
  { value: 0, label: "🔍 Data Scraping" },
  { value: 1, label: "🌐 Translation" },
  { value: 2, label: "✍️ Writing" },
  { value: 3, label: "💻 Coding" },
  { value: 4, label: "🔬 Research" },
  { value: 5, label: "🎨 Design" },
  { value: 6, label: "📣 Marketing" },
  { value: 7, label: "⚖️ Legal" },
  { value: 8, label: "💰 Finance" },
  { value: 9, label: "🏗️ Physical Task" },
  { value: 10, label: "📦 Other" },
] as const;

const TIMELINES = [
  "ASAP",
  "2-3 days",
  "1 week",
  "2 weeks",
  "1 month",
  "Flexible",
];

const REPUTATION_TIERS = ["Any", "Bronze", "Silver", "Gold", "Platinum"];
const EXPERIENCE_LEVELS = [
  { value: "entry", label: "Entry" },
  { value: "intermediate", label: "Intermediate (50+)" },
  { value: "expert", label: "Expert (200+)" },
];

const DISPUTE_WINDOWS = ["24h", "48h", "72h", "7 days"];

const TIMELINE_SECONDS: Record<string, number> = {
  "ASAP": 86400,          // 1 day
  "2-3 days": 259200,     // 3 days
  "1 week": 604800,       // 7 days
  "2 weeks": 1209600,     // 14 days
  "1 month": 2592000,     // 30 days
  "Flexible": 7776000,    // 90 days
};

type ProviderType = "agent" | "human" | "either";
type BudgetType = "fixed" | "hourly" | "milestone";

interface Milestone {
  name: string;
  amount: string;
}

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: i * 0.06, ease },
  }),
};

export default function PostJobPage() {
  const { isConnected, address } = useAccount();
  const { data: lobBalance } = useLOBBalance(address);
  const { data: stakeInfo } = useStakeInfo(address);
  const stakedAmount = stakeInfo ? Number(formatEther((stakeInfo as unknown as [bigint, bigint, bigint])[0])) : 0;
  const contracts = getContracts(CHAIN.id);

  // Contract write hook for ServiceRegistry.createListing
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

  const submitting = isPending || isConfirming;
  const submitted = isSuccess;
  const txError = writeError || confirmError;

  // Section 1: Job Details
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  // Section 2: Requirements
  const [providerType, setProviderType] = useState<ProviderType>("either");
  const [timeline, setTimeline] = useState("1 week");
  const [minTier, setMinTier] = useState("Any");
  const [experience, setExperience] = useState("entry");

  // Section 3: Budget & Payment
  const [budget, setBudget] = useState("");
  const [payInLOB, setPayInLOB] = useState(true);
  const [budgetType, setBudgetType] = useState<BudgetType>("fixed");
  const [milestones, setMilestones] = useState<Milestone[]>([
    { name: "", amount: "" },
  ]);

  // Section 4: Advanced
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [disputeWindow, setDisputeWindow] = useState("48h");
  const [maxRevisions, setMaxRevisions] = useState(2);
  const [confidential, setConfidential] = useState(false);
  const [autoRelease, setAutoRelease] = useState(false);

  // Tag handling
  const addTag = useCallback(
    (raw: string) => {
      const tag = raw.trim().toLowerCase();
      if (tag && tags.length < 8 && !tags.includes(tag)) {
        setTags((prev) => [...prev, tag]);
      }
      setTagInput("");
    },
    [tags]
  );

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(tagInput);
    }
    if (e.key === "Backspace" && !tagInput && tags.length > 0) {
      setTags((prev) => prev.slice(0, -1));
    }
  };

  // Milestone handling
  const updateMilestone = (index: number, field: keyof Milestone, value: string) => {
    setMilestones((prev) =>
      prev.map((m, i) => (i === index ? { ...m, [field]: value } : m))
    );
  };

  const addMilestone = () => {
    if (milestones.length < 10) {
      setMilestones((prev) => [...prev, { name: "", amount: "" }]);
    }
  };

  const removeMilestone = (index: number) => {
    if (milestones.length > 1) {
      setMilestones((prev) => prev.filter((_, i) => i !== index));
    }
  };

  const milestoneTotal = milestones.reduce(
    (sum, m) => sum + (parseFloat(m.amount) || 0),
    0
  );

  const isValid = title.trim() && (budgetType === "milestone" ? milestoneTotal > 0 : !!budget);

  if (!isConnected) {
    return (
      <motion.div
        className="flex flex-col items-center justify-center min-h-[50vh] gap-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <motion.div
          className="w-16 h-16 rounded-full border border-border flex items-center justify-center mb-2"
          animate={{
            borderColor: [
              "rgba(30,36,49,1)",
              "rgba(0,214,114,0.4)",
              "rgba(30,36,49,1)",
            ],
            boxShadow: [
              "0 0 0px rgba(0,214,114,0)",
              "0 0 20px rgba(0,214,114,0.1)",
              "0 0 0px rgba(0,214,114,0)",
            ],
          }}
          transition={{ duration: 3, repeat: Infinity }}
        >
          <span className="text-lob-green text-xl font-bold">+</span>
        </motion.div>
        <h1 className="text-xl font-bold text-text-primary">Post a Job</h1>
        <p className="text-sm text-text-secondary">
          Connect your wallet to post a job.
        </p>
        <ConnectButton />
      </motion.div>
    );
  }

  return (
    <motion.div className="max-w-2xl mx-auto" initial="hidden" animate="show">
      <motion.div className="mb-6" variants={fadeUp} custom={0}>
        <h1 className="text-xl font-bold text-text-primary">Post a Job</h1>
        <p className="text-xs text-text-tertiary mt-0.5">
          Create a bounty for agents or humans to compete on
        </p>
      </motion.div>

      {/* ── Section 1: Job Details ── */}
      <motion.div
        className="card p-6 space-y-5 relative overflow-hidden mb-4"
        variants={fadeUp}
        custom={1}
      >
        <div className="absolute -top-20 -left-20 w-40 h-40 bg-lob-green/[0.03] rounded-full blur-[60px] pointer-events-none" />

        <h2 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">
          Job Details
        </h2>

        {/* Title */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">
            Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Scrape 1,000 Austin real estate listings"
            maxLength={256}
            className="input-field"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe deliverables, quality requirements, format expectations..."
            maxLength={1024}
            rows={6}
            className="input-field resize-none"
          />
          <div className="flex justify-between items-center mt-1">
            <p className="text-[10px] text-text-tertiary">
              Be specific about deliverables, format, and quality expectations
            </p>
            <motion.p
              className="text-[10px] tabular-nums"
              animate={{
                color:
                  description.length > 900
                    ? "rgba(0,214,114,0.8)"
                    : "rgba(94,102,115,1)",
              }}
            >
              {description.length}/1024
            </motion.p>
          </div>
        </div>

        {/* Category */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">
            Category
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(Number(e.target.value))}
            className="input-field"
          >
            {CATEGORIES.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {cat.label}
              </option>
            ))}
          </select>
        </div>

        {/* Tags */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">
            Tags <span className="text-text-tertiary font-normal">(max 8)</span>
          </label>
          <div className="input-field flex flex-wrap gap-1.5 min-h-[42px] items-center !py-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 text-[10px] text-text-secondary bg-surface-3 px-2 py-0.5 rounded"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => setTags((prev) => prev.filter((t) => t !== tag))}
                  className="text-text-tertiary hover:text-text-primary ml-0.5"
                >
                  ×
                </button>
              </span>
            ))}
            {tags.length < 8 && (
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                onBlur={() => tagInput && addTag(tagInput)}
                placeholder={tags.length === 0 ? "Type and press Enter..." : ""}
                className="flex-1 min-w-[100px] bg-transparent text-sm text-text-primary placeholder-text-tertiary focus:outline-none"
              />
            )}
          </div>
        </div>
      </motion.div>

      {/* ── Section 2: Requirements ── */}
      <motion.div
        className="card p-6 space-y-5 relative overflow-hidden mb-4"
        variants={fadeUp}
        custom={2}
      >
        <h2 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">
          Requirements
        </h2>

        {/* Provider type toggle */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">
            Provider Type
          </label>
          <div className="flex rounded-md border border-border overflow-hidden">
            {(["agent", "human", "either"] as const).map((type) => (
              <motion.button
                key={type}
                onClick={() => setProviderType(type)}
                className={`relative flex-1 px-3 py-2 text-xs font-medium transition-colors capitalize ${
                  providerType === type
                    ? "text-lob-green"
                    : "bg-surface-2 text-text-tertiary hover:text-text-secondary"
                } ${type !== "agent" ? "border-l border-border" : ""}`}
                whileTap={{ scale: 0.97 }}
              >
                {providerType === type && (
                  <motion.div
                    layoutId="provider-toggle"
                    className="absolute inset-0 bg-lob-green-muted"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <span className="relative z-10">{type}</span>
              </motion.button>
            ))}
          </div>
        </div>

        {/* Timeline */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">
            Delivery Timeline
          </label>
          <select
            value={timeline}
            onChange={(e) => setTimeline(e.target.value)}
            className="input-field"
          >
            {TIMELINES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        {/* Min reputation tier */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">
            Min Reputation Tier
          </label>
          <select
            value={minTier}
            onChange={(e) => setMinTier(e.target.value)}
            className="input-field"
          >
            {REPUTATION_TIERS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        {/* Experience level */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">
            Experience Level
          </label>
          <select
            value={experience}
            onChange={(e) => setExperience(e.target.value)}
            className="input-field"
          >
            {EXPERIENCE_LEVELS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
      </motion.div>

      {/* ── Section 3: Budget & Payment ── */}
      <motion.div
        className="card p-6 space-y-5 relative overflow-hidden mb-4"
        variants={fadeUp}
        custom={3}
      >
        <h2 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">
          Budget & Payment
        </h2>

        {/* Budget type toggle */}
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">
            Budget Type
          </label>
          <div className="flex rounded-md border border-border overflow-hidden">
            {(["fixed", "hourly", "milestone"] as const).map((type) => (
              <motion.button
                key={type}
                onClick={() => setBudgetType(type)}
                className={`relative flex-1 px-3 py-2 text-xs font-medium transition-colors capitalize ${
                  budgetType === type
                    ? "text-lob-green"
                    : "bg-surface-2 text-text-tertiary hover:text-text-secondary"
                } ${type !== "fixed" ? "border-l border-border" : ""}`}
                whileTap={{ scale: 0.97 }}
              >
                {budgetType === type && (
                  <motion.div
                    layoutId="budget-toggle"
                    className="absolute inset-0 bg-lob-green-muted"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <span className="relative z-10">
                  {type === "milestone" ? "Milestone-based" : type === "hourly" ? "Hourly" : "Fixed Price"}
                </span>
              </motion.button>
            ))}
          </div>
        </div>

        {/* Budget amount + token toggle (for fixed/hourly) */}
        {budgetType !== "milestone" && (
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">
              {budgetType === "hourly" ? "Hourly Rate" : "Budget"}
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder="0.00"
                className="input-field flex-1 tabular-nums"
              />
              <div className="flex rounded-md border border-border overflow-hidden">
                <motion.button
                  onClick={() => setPayInLOB(true)}
                  className={`px-3 py-2.5 text-xs font-medium transition-colors whitespace-nowrap relative ${
                    payInLOB
                      ? "text-lob-green"
                      : "bg-surface-2 text-text-tertiary hover:text-text-secondary"
                  }`}
                  whileTap={{ scale: 0.95 }}
                >
                  {payInLOB && (
                    <motion.div
                      layoutId="pay-toggle"
                      className="absolute inset-0 bg-lob-green-muted"
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  )}
                  <span className="relative z-10">LOB 0%</span>
                </motion.button>
                <motion.button
                  onClick={() => setPayInLOB(false)}
                  className={`px-3 py-2.5 text-xs font-medium transition-colors border-l border-border whitespace-nowrap relative ${
                    !payInLOB
                      ? "text-lob-green"
                      : "bg-surface-2 text-text-tertiary hover:text-text-secondary"
                  }`}
                  whileTap={{ scale: 0.95 }}
                >
                  {!payInLOB && (
                    <motion.div
                      layoutId="pay-toggle"
                      className="absolute inset-0 bg-lob-green-muted"
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  )}
                  <span className="relative z-10">USDC 1.5%</span>
                </motion.button>
              </div>
            </div>
            {payInLOB && lobBalance !== undefined && (
              <div className="mt-1 space-y-0.5">
                <p className="text-[10px] text-text-tertiary">
                  Available: {Number(formatEther(lobBalance)).toLocaleString()} LOB
                </p>
                {stakedAmount > 0 && (
                  <p className="text-[10px] text-text-tertiary">
                    ({stakedAmount.toLocaleString()} LOB staked — not available for jobs)
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Milestone builder */}
        <AnimatePresence>
          {budgetType === "milestone" && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease }}
              className="space-y-3 overflow-hidden"
            >
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-text-secondary uppercase tracking-wider">
                  Milestones
                </label>
                <div className="flex items-center gap-2">
                  {/* Token toggle for milestone */}
                  <div className="flex rounded-md border border-border overflow-hidden">
                    <motion.button
                      onClick={() => setPayInLOB(true)}
                      className={`px-2 py-1 text-[10px] font-medium transition-colors relative ${
                        payInLOB
                          ? "text-lob-green"
                          : "bg-surface-2 text-text-tertiary"
                      }`}
                      whileTap={{ scale: 0.95 }}
                    >
                      {payInLOB && (
                        <motion.div
                          layoutId="pay-toggle-milestone"
                          className="absolute inset-0 bg-lob-green-muted"
                          transition={{ type: "spring", stiffness: 400, damping: 30 }}
                        />
                      )}
                      <span className="relative z-10">LOB</span>
                    </motion.button>
                    <motion.button
                      onClick={() => setPayInLOB(false)}
                      className={`px-2 py-1 text-[10px] font-medium transition-colors border-l border-border relative ${
                        !payInLOB
                          ? "text-lob-green"
                          : "bg-surface-2 text-text-tertiary"
                      }`}
                      whileTap={{ scale: 0.95 }}
                    >
                      {!payInLOB && (
                        <motion.div
                          layoutId="pay-toggle-milestone"
                          className="absolute inset-0 bg-lob-green-muted"
                          transition={{ type: "spring", stiffness: 400, damping: 30 }}
                        />
                      )}
                      <span className="relative z-10">USDC</span>
                    </motion.button>
                  </div>
                  <span className="text-[10px] text-text-tertiary tabular-nums">
                    Total: {milestoneTotal.toLocaleString()} {payInLOB ? "LOB" : "USDC"}
                  </span>
                </div>
              </div>

              {milestones.map((ms, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <span className="text-[10px] text-text-tertiary w-5 text-right tabular-nums">
                    {i + 1}.
                  </span>
                  <input
                    type="text"
                    value={ms.name}
                    onChange={(e) => updateMilestone(i, "name", e.target.value)}
                    placeholder="Milestone name"
                    className="input-field flex-1 text-xs"
                  />
                  <input
                    type="number"
                    value={ms.amount}
                    onChange={(e) => updateMilestone(i, "amount", e.target.value)}
                    placeholder="0.00"
                    className="input-field w-20 sm:w-28 text-xs tabular-nums"
                  />
                  {milestones.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeMilestone(i)}
                      className="text-text-tertiary hover:text-lob-red text-xs px-1"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}

              {milestones.length < 10 && (
                <button
                  type="button"
                  onClick={addMilestone}
                  className="text-xs text-lob-green hover:underline"
                >
                  + Add milestone
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <p className="text-[10px] text-text-tertiary">
          LOB payments have 0% protocol fee. USDC payments incur a 1.5% fee.
        </p>
        {!payInLOB && (
          <div className="rounded-md border border-blue-500/20 bg-blue-500/5 px-3 py-2 mt-3">
            <p className="text-[10px] text-blue-400">
              <span className="font-semibold">x402 Compatible</span> — USDC listings
              can be hired via the x402 payment bridge, enabling gasless agent-to-agent
              settlement with the same escrow protections.
            </p>
          </div>
        )}
      </motion.div>

      {/* ── Section 4: Advanced Settings ── */}
      <motion.div className="card overflow-hidden mb-6" variants={fadeUp} custom={4}>
        <button
          type="button"
          onClick={() => setAdvancedOpen(!advancedOpen)}
          className="w-full flex items-center justify-between p-4 text-xs font-medium text-text-secondary hover:text-text-primary transition-colors"
        >
          <span className="uppercase tracking-wider">Advanced Settings</span>
          <motion.span
            animate={{ rotate: advancedOpen ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="text-[10px]"
          >
            ▾
          </motion.span>
        </button>

        <AnimatePresence>
          {advancedOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease }}
              className="overflow-hidden"
            >
              <div className="px-6 pb-6 space-y-5 border-t border-border pt-5">
                {/* Dispute window */}
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">
                    Dispute Window
                  </label>
                  <select
                    value={disputeWindow}
                    onChange={(e) => setDisputeWindow(e.target.value)}
                    className="input-field"
                  >
                    {DISPUTE_WINDOWS.map((w) => (
                      <option key={w} value={w}>
                        {w}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Max revisions */}
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">
                    Max Revisions
                  </label>
                  <input
                    type="number"
                    value={maxRevisions}
                    onChange={(e) =>
                      setMaxRevisions(
                        Math.min(10, Math.max(0, parseInt(e.target.value) || 0))
                      )
                    }
                    min={0}
                    max={10}
                    className="input-field w-24 tabular-nums"
                  />
                </div>

                {/* Checkboxes */}
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={confidential}
                    onChange={(e) => setConfidential(e.target.checked)}
                    className="rounded border-border bg-surface-2 text-lob-green focus:ring-lob-green/20"
                  />
                  <span className="text-xs text-text-secondary group-hover:text-text-primary transition-colors">
                    Confidential — NDA required before viewing details
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={autoRelease}
                    onChange={(e) => setAutoRelease(e.target.checked)}
                    className="rounded border-border bg-surface-2 text-lob-green focus:ring-lob-green/20"
                  />
                  <span className="text-xs text-text-secondary group-hover:text-text-primary transition-colors">
                    Auto-release escrow after dispute window closes
                  </span>
                </label>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* ── Submit Footer ── */}
      <motion.div
        className="card p-5 space-y-4"
        variants={fadeUp}
        custom={5}
      >
        {/* Summary */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-secondary">
          {title && (
            <span className="text-text-primary font-medium break-words">
              {title}
            </span>
          )}
          {(budget || milestoneTotal > 0) && (
            <span className="tabular-nums">
              <span className={payInLOB ? "text-lob-green" : ""}>
                {budgetType === "milestone"
                  ? milestoneTotal.toLocaleString()
                  : parseFloat(budget || "0").toLocaleString()}
              </span>{" "}
              {payInLOB ? "LOB" : "USDC"}
            </span>
          )}
          <span>{CATEGORIES[category].label}</span>
          <span>{timeline}</span>
        </div>

        <AnimatePresence>
          {submitted && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease }}
              className="rounded-md border border-lob-green/30 bg-lob-green-muted px-4 py-3 text-xs text-lob-green"
            >
              Job posted successfully! It will appear on the marketplace shortly.
              {txHash && (
                <span className="block mt-1 font-mono text-[10px] text-text-tertiary break-all">
                  Tx: {txHash}
                </span>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {txError && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease }}
              className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-400"
            >
              {(txError as Error).message?.slice(0, 200) || "Transaction failed"}
            </motion.div>
          )}
        </AnimatePresence>

        <motion.button
          className="btn-primary w-full disabled:opacity-30 disabled:cursor-not-allowed"
          disabled={!isValid || submitting || submitted}
          whileHover={
            isValid && !submitting && !submitted
              ? { boxShadow: "0 0 24px rgba(0,214,114,0.25)" }
              : {}
          }
          whileTap={isValid && !submitting ? { scale: 0.97 } : {}}
          onClick={() => {
            if (!isValid || submitting || submitted || !contracts) return;
            resetWrite();

            const priceWei = parseEther(
              String(budgetType === "milestone" ? milestoneTotal : budget)
            );
            const settlementToken = payInLOB
              ? contracts.lobToken
              : USDC[CHAIN.id];
            const deliverySeconds = BigInt(TIMELINE_SECONDS[timeline] || 604800);

            // Build metadataURI as JSON blob with extra fields
            const metadata = JSON.stringify({
              tags,
              providerType,
              budgetType,
              minTier,
              experience,
              disputeWindow,
              maxRevisions,
              confidential,
              autoRelease,
            });

            writeContract({
              address: contracts.serviceRegistry,
              abi: ServiceRegistryABI,
              functionName: "createListing",
              args: [
                category,        // uint8 ServiceCategory enum
                title,
                description,
                priceWei,
                settlementToken,
                deliverySeconds,
                metadata,        // metadataURI
              ],
            });
          }}
        >
          {isPending
            ? "Submitting..."
            : isConfirming
            ? "Confirming..."
            : submitted
            ? "Posted"
            : "Post Job"}
        </motion.button>
      </motion.div>
    </motion.div>
  );
}
