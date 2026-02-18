"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { formatEther, parseEther } from "viem";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { motion, AnimatePresence } from "framer-motion";
import { stagger, fadeUp, ease } from "@/lib/motion";
import {
  useStakeInfo,
  useStakeTier,
  useLOBBalance,
  useApproveAndStake,
  useArbitratorInfo,
} from "@/lib/hooks";

type Section = "seller" | "arbitrator" | "moderator";

const TIERS = [
  { name: "Bronze", stake: "100", listings: "3", boost: "1x", color: "#CD7F32" },
  { name: "Silver", stake: "1,000", listings: "10", boost: "2x", color: "#848E9C" },
  { name: "Gold", stake: "10,000", listings: "25", boost: "5x", color: "#F0B90B" },
  { name: "Platinum", stake: "100,000", listings: "\u221E", boost: "10x", color: "#00D672" },
];

const ARB_TIERS = [
  { name: "Junior", stake: "5,000 LOB", maxDispute: "500 LOB", fee: "5%" },
  { name: "Senior", stake: "25,000 LOB", maxDispute: "5,000 LOB", fee: "4%" },
  { name: "Principal", stake: "100,000 LOB", maxDispute: "Unlimited", fee: "3%" },
];

const TAB_COLORS: Record<Section, string> = {
  seller: "#00D672",
  arbitrator: "#00D672",
  moderator: "#60A5FA",
};

const TIER_NAMES = ["None", "Bronze", "Silver", "Gold", "Platinum"];
const TIER_COLORS: Record<string, string> = {
  None: "#5E6673",
  Bronze: "#CD7F32",
  Silver: "#848E9C",
  Gold: "#F0B90B",
  Platinum: "#00D672",
};

const SUBTOPICS = ["General", "Marketplace", "Protocol", "Governance", "Off-Topic"];
const AVAILABILITY = ["< 1hr/day", "1-3 hrs/day", "3+ hrs/day"];

const ELIGIBILITY = [
  { label: "Min 1,000 LOB staked", pass: true },
  { label: "Account age 30+ days", pass: true },
  { label: "100+ forum karma", pass: false },
  { label: "No active disputes", pass: true },
];

const PERKS = [
  "Verified Mod badge on profile",
  "500 LOB monthly reward (governance-voted)",
  "Mod-only discussion channel",
  "Priority dispute escalation",
];

export default function StakingPage() {
  const { isConnected, address } = useAccount();
  const { data: stakeData } = useStakeInfo(address);
  const { data: tierNum } = useStakeTier(address);
  const { data: lobBalance } = useLOBBalance(address);
  const { approve, stake } = useApproveAndStake();
  const { data: arbData } = useArbitratorInfo(address);

  // Derived values from contract data
  const stakedAmount = stakeData ? stakeData.amount : BigInt(0);
  const cooldownEnd = stakeData ? stakeData.unstakeRequestTime : BigInt(0);
  const currentTier = tierNum !== undefined ? tierNum : 0;
  const tierName = TIER_NAMES[currentTier] ?? "None";
  const tierColor = TIER_COLORS[tierName] ?? "#5E6673";

  const arbIsActive = arbData ? arbData.active : false;
  const arbTier = arbData ? arbData.rank : 0;
  const arbCasesHandled = arbData ? arbData.disputesHandled : BigInt(0);
  const arbMajorityRate = arbData ? arbData.majorityVotes : BigInt(0);

  // Format a bigint LOB value for display (no trailing zeros)
  const fmtLob = (val: bigint) => {
    const raw = formatEther(val);
    // Remove unnecessary trailing zeros but keep at least one decimal if needed
    const num = parseFloat(raw);
    return num.toLocaleString("en-US", { maximumFractionDigits: 2 });
  };

  // Cooldown display
  const cooldownDisplay = (() => {
    if (cooldownEnd === BigInt(0)) return "None";
    const endMs = Number(cooldownEnd) * 1000;
    const now = Date.now();
    if (endMs <= now) return "Ready";
    const diffSec = Math.floor((endMs - now) / 1000);
    const days = Math.floor(diffSec / 86400);
    const hours = Math.floor((diffSec % 86400) / 3600);
    if (days > 0) return `${days}d ${hours}h`;
    return `${hours}h`;
  })();

  // Tier progress: how far through the current tier toward the next one
  const TIER_THRESHOLDS = [BigInt(0), BigInt(100), BigInt(1000), BigInt(10000), BigInt(100000)]; // in LOB (not wei)
  const nextTierIdx = Math.min(currentTier + 1, 4);
  const currentThreshold = parseEther(TIER_THRESHOLDS[currentTier].toString());
  const nextThreshold = parseEther(TIER_THRESHOLDS[nextTierIdx].toString());
  const tierProgress =
    currentTier >= 4
      ? 100
      : nextThreshold > currentThreshold
        ? Number(((stakedAmount - currentThreshold) * BigInt(100)) / (nextThreshold - currentThreshold))
        : 0;
  const lobToNextTier =
    currentTier >= 4 ? "Max" : `${fmtLob(nextThreshold - stakedAmount)} LOB to ${TIER_NAMES[nextTierIdx]}`;

  const [stakeAmount, setStakeAmount] = useState("");
  const [arbStakeAmount, setArbStakeAmount] = useState("");
  const [activeSection, setActiveSection] = useState<Section>("seller");

  // Moderator form state
  const [showModForm, setShowModForm] = useState(false);
  const [modMotivation, setModMotivation] = useState("");
  const [modExperience, setModExperience] = useState("");
  const [modSubtopic, setModSubtopic] = useState("General");
  const [modAvailability, setModAvailability] = useState("1-3 hrs/day");
  const [modSubmitted, setModSubmitted] = useState(false);

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
            borderColor: ["rgba(30,36,49,1)", "rgba(0,214,114,0.4)", "rgba(30,36,49,1)"],
            boxShadow: [
              "0 0 0 rgba(0,214,114,0)",
              "0 0 30px rgba(0,214,114,0.08)",
              "0 0 0 rgba(0,214,114,0)",
            ],
          }}
          transition={{ duration: 3, repeat: Infinity }}
        >
          <motion.span
            className="text-lob-green text-2xl font-bold"
            animate={{ rotate: [0, 360] }}
            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          >
            S
          </motion.span>
        </motion.div>
        <h1 className="text-xl font-bold text-text-primary">Staking</h1>
        <p className="text-sm text-text-secondary">Connect your wallet to manage staking.</p>
        <ConnectButton />
      </motion.div>
    );
  }

  return (
    <motion.div initial="hidden" animate="show" variants={stagger}>
      <motion.div variants={fadeUp} className="mb-6">
        <h1 className="text-xl font-bold text-text-primary">Staking</h1>
        <p className="text-xs text-text-tertiary mt-0.5">
          Stake $LOB to unlock listings, arbitrate disputes, or moderate the forum
        </p>
      </motion.div>

      {/* Current stake info */}
      <motion.div variants={fadeUp} className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        {[
          { label: "Your Stake", value: `${fmtLob(stakedAmount)} LOB` },
          { label: "Current Tier", value: tierName },
          { label: "LOB Balance", value: `${lobBalance !== undefined ? fmtLob(lobBalance) : "—"} LOB` },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            className="card p-4 relative overflow-hidden group"
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.1 + i * 0.07, ease }}
            whileHover={{ y: -2, borderColor: "rgba(0,214,114,0.2)" }}
          >
            <motion.div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-lob-green/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <p className="text-xs text-text-tertiary uppercase tracking-wider">{stat.label}</p>
            <p className="text-xl font-bold text-text-primary mt-1 tabular-nums">{stat.value}</p>
          </motion.div>
        ))}
      </motion.div>

      {/* Section toggle */}
      <motion.div variants={fadeUp} className="flex gap-0.5 mb-6 border-b border-border">
        {(["seller", "arbitrator", "moderator"] as const).map((section) => (
          <button
            key={section}
            onClick={() => setActiveSection(section)}
            className="relative px-4 py-2 text-sm font-medium -mb-px"
          >
            <motion.span
              animate={{ color: activeSection === section ? "#EAECEF" : "#5E6673" }}
              className="relative z-10 capitalize"
            >
              {section === "moderator" ? "Moderator" : `${section} Staking`}
            </motion.span>
            {activeSection === section && (
              <motion.div
                layoutId="stake-tab"
                className="absolute bottom-0 left-0 right-0 h-0.5"
                style={{ background: TAB_COLORS[section] }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
          </button>
        ))}
      </motion.div>

      <AnimatePresence mode="wait">
        {/* ── Seller Tab ── */}
        {activeSection === "seller" && (
          <motion.div
            key="seller"
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            transition={{ duration: 0.3, ease }}
            className="space-y-4"
          >
            {/* Position card */}
            <div className="card p-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Staked</p>
                  <p className="text-sm font-bold text-text-primary mt-0.5 tabular-nums">{fmtLob(stakedAmount)} LOB</p>
                </div>
                <div>
                  <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Tier</p>
                  <p className="text-sm font-bold mt-0.5" style={{ color: tierColor }}>{tierName}</p>
                </div>
                <div>
                  <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Cooldown</p>
                  <p className="text-sm font-bold text-text-primary mt-0.5">{cooldownDisplay}</p>
                </div>
              </div>

              {/* Tier progress bar */}
              <div className="mt-4">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[10px] text-text-tertiary">
                    {currentTier >= 4 ? "Platinum (Max)" : `${tierName} → ${TIER_NAMES[nextTierIdx]}`}
                  </span>
                  <span className="text-[10px] text-text-tertiary tabular-nums">{lobToNextTier}</span>
                </div>
                <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-lob-green"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(0, Math.min(100, tierProgress))}%` }}
                    transition={{ duration: 0.8, ease }}
                  />
                </div>
              </div>

              <p className="text-xs text-text-tertiary mt-3">
                Higher tiers unlock more listings and a search boost multiplier.
              </p>
            </div>

            {/* Stake form */}
            <div className="card p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-text-primary">Stake $LOB</h2>
                <span className="text-xs text-text-tertiary tabular-nums">
                  Available: {lobBalance !== undefined ? fmtLob(lobBalance) : "—"} LOB
                </span>
              </div>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={stakeAmount}
                  onChange={(e) => setStakeAmount(e.target.value)}
                  placeholder="Amount to stake"
                  className="input-field flex-1 tabular-nums"
                />
                <motion.button
                  className="btn-primary"
                  whileHover={{ boxShadow: "0 0 20px rgba(0,214,114,0.2)" }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => {
                    if (!stakeAmount) return;
                    const amt = parseEther(stakeAmount);
                    approve(amt);
                    // After approval TX confirms, call stake(amt) to complete.
                    // For now approve is step 1; user must confirm both TXs.
                  }}
                >
                  Approve & Stake
                </motion.button>
                {/* TODO: wire unstake — need useUnstake hook */}
                <motion.button
                  className="btn-secondary"
                  whileTap={{ scale: 0.97 }}
                >
                  Unstake
                </motion.button>
              </div>
              <p className="text-[10px] text-text-tertiary mt-2">
                7-day cooldown on unstaking. Minimum 100 LOB to activate listings.
              </p>
            </div>

            {/* Tier table */}
            <div className="card overflow-hidden">
              <div className="grid grid-cols-4 gap-4 px-4 py-2.5 text-xs font-medium text-text-tertiary uppercase tracking-wider border-b border-border">
                <div>Tier</div>
                <div>Stake Required</div>
                <div>Max Listings</div>
                <div>Search Boost</div>
              </div>
              {TIERS.map((tier, i) => (
                <motion.div
                  key={tier.name}
                  className="grid grid-cols-4 gap-4 px-4 py-3 text-sm border-b border-border/50 last:border-0 group hover:bg-surface-1 transition-colors"
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: 0.1 + i * 0.06, ease }}
                  whileHover={{ x: 4 }}
                >
                  <div className="flex items-center gap-2">
                    <motion.div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: tier.color }}
                      animate={{
                        boxShadow: [
                          `0 0 0 ${tier.color}00`,
                          `0 0 8px ${tier.color}40`,
                          `0 0 0 ${tier.color}00`,
                        ],
                      }}
                      transition={{ duration: 2, delay: i * 0.5, repeat: Infinity }}
                    />
                    <span className="text-text-primary font-medium">{tier.name}</span>
                  </div>
                  <div className="text-text-secondary tabular-nums">{tier.stake} LOB</div>
                  <div className="text-text-secondary tabular-nums">{tier.listings}</div>
                  <div className="text-text-secondary">{tier.boost}</div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ── Arbitrator Tab ── */}
        {activeSection === "arbitrator" && (
          <motion.div
            key="arbitrator"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.3, ease }}
            className="space-y-4"
          >
            {/* Arbitrator stats */}
            <div className="card p-4">
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Status</p>
                  <p className={`text-sm font-bold mt-0.5 ${arbIsActive ? "text-lob-green" : "text-text-tertiary"}`}>
                    {arbIsActive ? "Active" : "Inactive"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Arb Tier</p>
                  <p className="text-sm font-bold text-text-primary mt-0.5">
                    {TIER_NAMES[arbTier] ?? "None"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Cases Reviewed</p>
                  <p className="text-sm font-bold text-text-primary mt-0.5 tabular-nums">
                    {arbCasesHandled.toString()}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Majority Rate</p>
                  <p className="text-sm font-bold text-text-primary mt-0.5 tabular-nums">
                    {arbCasesHandled > BigInt(0) ? `${arbMajorityRate.toString()}%` : "—"}
                  </p>
                </div>
              </div>
            </div>

            {/* How it works */}
            <div className="card p-4">
              <h3 className="text-xs font-semibold text-text-primary mb-3 uppercase tracking-wider">
                How It Works
              </h3>
              <div className="space-y-3">
                {[
                  { step: 1, title: "Stake $LOB", desc: "Stake tokens to qualify as an arbitrator at your tier level" },
                  { step: 2, title: "Get Assigned", desc: "Cases matching your tier are randomly assigned to a panel of 3" },
                  { step: 3, title: "Vote & Earn", desc: "Review evidence, cast your vote, and earn fees if you're in the majority" },
                ].map((item) => (
                  <div key={item.step} className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-lob-green-muted flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-lob-green text-[10px] font-bold">{item.step}</span>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-text-primary">{item.title}</p>
                      <p className="text-[10px] text-text-tertiary">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Main card with tiers + stake form */}
            <div className="card p-5 space-y-5">
              <div>
                <h2 className="text-sm font-semibold text-text-primary mb-1">
                  Become an Arbitrator
                </h2>
                <p className="text-xs text-text-secondary">
                  Stake $LOB to become a dispute arbitrator. Review evidence, vote on
                  disputes, and earn arbitration fees.
                </p>
              </div>

              <div className="space-y-2">
                {ARB_TIERS.map((tier, i) => (
                  <motion.div
                    key={tier.name}
                    className="flex items-center justify-between py-2.5 px-3 rounded border border-border/50 hover:border-lob-green/20 transition-colors group"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: i * 0.08, ease }}
                    whileHover={{ x: 4, backgroundColor: "rgba(14,18,23,0.5)" }}
                  >
                    <div className="flex items-center gap-3">
                      <motion.div
                        className="w-6 h-6 rounded bg-lob-green-muted flex items-center justify-center"
                        whileHover={{ scale: 1.15, rotate: 5 }}
                      >
                        <span className="text-lob-green text-[10px] font-bold">
                          {tier.name[0]}
                        </span>
                      </motion.div>
                      <div>
                        <p className="text-sm font-medium text-text-primary">{tier.name}</p>
                        <p className="text-[10px] text-text-tertiary tabular-nums">{tier.stake}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-text-secondary">Max {tier.maxDispute}</p>
                      <p className="text-[10px] text-lob-green tabular-nums">{tier.fee} fee</p>
                    </div>
                  </motion.div>
                ))}
              </div>

              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-text-tertiary tabular-nums">
                  Available: {lobBalance !== undefined ? fmtLob(lobBalance) : "—"} LOB
                </span>
              </div>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={arbStakeAmount}
                  onChange={(e) => setArbStakeAmount(e.target.value)}
                  placeholder="Amount to stake as arbitrator"
                  className="input-field flex-1 tabular-nums"
                />
                <motion.button
                  className="btn-primary"
                  whileHover={{ boxShadow: "0 0 20px rgba(0,214,114,0.2)" }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => {
                    if (!arbStakeAmount) return;
                    const amt = parseEther(arbStakeAmount);
                    approve(amt);
                    // After approval TX confirms, call stake(amt) to complete.
                  }}
                >
                  Approve & Stake
                </motion.button>
                {/* TODO: wire unstake — need useUnstake hook */}
                <motion.button
                  className="btn-secondary"
                  whileTap={{ scale: 0.97 }}
                >
                  Unstake
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Moderator Tab ── */}
        {activeSection === "moderator" && (
          <motion.div
            key="moderator"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.3, ease }}
          >
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Main content — 2/3 */}
              <div className="lg:col-span-2 space-y-4">
                {/* Header */}
                <div className="card p-5">
                  <h2 className="text-sm font-semibold text-text-primary mb-1">
                    Forum Moderator Program
                  </h2>
                  <p className="text-xs text-text-secondary">
                    Help keep the LOBSTR forum healthy. Moderators review flagged posts,
                    enforce community guidelines, and earn monthly LOB rewards via governance vote.
                  </p>
                </div>

                {/* Eligibility checklist */}
                <div className="card p-5">
                  <h3 className="text-xs font-semibold text-text-primary mb-3 uppercase tracking-wider">
                    Eligibility
                  </h3>
                  <div className="space-y-2.5">
                    {ELIGIBILITY.map((req) => (
                      <div key={req.label} className="flex items-center gap-2.5">
                        <div
                          className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                            req.pass
                              ? "bg-lob-green-muted text-lob-green"
                              : "bg-lob-red/10 text-lob-red"
                          }`}
                        >
                          {req.pass ? "✓" : "✗"}
                        </div>
                        <span
                          className={`text-xs ${
                            req.pass ? "text-text-primary" : "text-text-tertiary"
                          }`}
                        >
                          {req.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Application form */}
                <div className="card p-5">
                  {modSubmitted ? (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-center py-4"
                    >
                      <div className="w-10 h-10 rounded-full bg-lob-green-muted mx-auto mb-3 flex items-center justify-center">
                        <span className="text-lob-green font-bold">✓</span>
                      </div>
                      <p className="text-sm font-medium text-text-primary">
                        Application Submitted
                      </p>
                      <p className="text-xs text-text-tertiary mt-1">
                        Your application is under review. You&apos;ll be notified via on-chain message.
                      </p>
                    </motion.div>
                  ) : !showModForm ? (
                    <div className="text-center py-2">
                      <p className="text-xs text-text-secondary mb-3">
                        Ready to apply? Fill out the form to join the moderation team.
                      </p>
                      <motion.button
                        className="btn-primary"
                        onClick={() => setShowModForm(true)}
                        whileHover={{ boxShadow: "0 0 20px rgba(96,165,250,0.2)" }}
                        whileTap={{ scale: 0.97 }}
                      >
                        Apply
                      </motion.button>
                    </div>
                  ) : (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-4"
                    >
                      <h3 className="text-xs font-semibold text-text-primary uppercase tracking-wider">
                        Application
                      </h3>

                      {/* Motivation */}
                      <div>
                        <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">
                          Motivation
                        </label>
                        <textarea
                          value={modMotivation}
                          onChange={(e) => setModMotivation(e.target.value)}
                          placeholder="Why do you want to moderate the LOBSTR forum?"
                          maxLength={500}
                          rows={4}
                          className="input-field resize-none"
                        />
                        <p className="text-[10px] text-text-tertiary mt-1 text-right tabular-nums">
                          {modMotivation.length}/500
                        </p>
                      </div>

                      {/* Experience */}
                      <div>
                        <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">
                          Moderation Experience
                        </label>
                        <textarea
                          value={modExperience}
                          onChange={(e) => setModExperience(e.target.value)}
                          placeholder="Describe any relevant moderation or community management experience..."
                          maxLength={300}
                          rows={3}
                          className="input-field resize-none"
                        />
                        <p className="text-[10px] text-text-tertiary mt-1 text-right tabular-nums">
                          {modExperience.length}/300
                        </p>
                      </div>

                      {/* Subtopic */}
                      <div>
                        <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">
                          Subtopic Focus
                        </label>
                        <select
                          value={modSubtopic}
                          onChange={(e) => setModSubtopic(e.target.value)}
                          className="input-field"
                        >
                          {SUBTOPICS.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Availability */}
                      <div>
                        <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">
                          Availability
                        </label>
                        <select
                          value={modAvailability}
                          onChange={(e) => setModAvailability(e.target.value)}
                          className="input-field"
                        >
                          {AVAILABILITY.map((a) => (
                            <option key={a} value={a}>
                              {a}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex gap-2">
                        <motion.button
                          className="btn-primary flex-1"
                          onClick={() => setModSubmitted(true)}
                          whileHover={{ boxShadow: "0 0 20px rgba(96,165,250,0.2)" }}
                          whileTap={{ scale: 0.97 }}
                        >
                          Submit Application
                        </motion.button>
                        <motion.button
                          className="btn-secondary"
                          onClick={() => setShowModForm(false)}
                          whileTap={{ scale: 0.97 }}
                        >
                          Cancel
                        </motion.button>
                      </div>
                    </motion.div>
                  )}
                </div>
              </div>

              {/* Perks sidebar — 1/3 */}
              <div className="space-y-4">
                <div className="card p-5">
                  <h3 className="text-xs font-semibold text-text-primary mb-3 uppercase tracking-wider">
                    Moderator Perks
                  </h3>
                  <div className="space-y-3">
                    {PERKS.map((perk) => (
                      <div key={perk} className="flex items-start gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 flex-shrink-0" />
                        <p className="text-xs text-text-secondary">{perk}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="card p-5">
                  <h3 className="text-xs font-semibold text-text-primary mb-2 uppercase tracking-wider">
                    Active Moderators
                  </h3>
                  <p className="text-2xl font-bold text-text-primary tabular-nums">3</p>
                  <p className="text-[10px] text-text-tertiary mt-0.5">founding agents</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
