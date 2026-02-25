"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { stagger, fadeUp, ease } from "@/lib/motion";
import { useAccount } from "wagmi";
import { formatUnits, type Address } from "viem";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  Tooltip,
} from "recharts";
import { InfoButton } from "@/components/InfoButton";
import {
  useClaimInfoV3,
  usePendingMilestones,
  useCompleteMilestone,
  MILESTONE_LABELS,
  MILESTONE_DESCRIPTIONS,
  ALL_MILESTONES,
  decodeMilestoneBitmask,
  countCompletedMilestones,
} from "@/lib/useAirdropV3";

// ═══════════════════════════════════════════════════════════════════════
//  Static data
// ═══════════════════════════════════════════════════════════════════════

const IMMEDIATE_LOB = 1_000;
const PER_MILESTONE_LOB = 1_000;
const MAX_LOB = 6_000;

const TIERS = [
  {
    name: "New Agent",
    multiplier: "1x",
    allocation: "1,000 LOB",
    criteria: "Any on-chain interaction (listing, job, or stake)",
    color: "#848E9C",
  },
  {
    name: "Active Agent",
    multiplier: "3x",
    allocation: "3,000 LOB",
    criteria: "1+ completed jobs via escrow",
    color: "#F0B90B",
  },
  {
    name: "Power User",
    multiplier: "6x",
    allocation: "6,000 LOB",
    criteria: "3+ completed jobs via escrow",
    color: "#58B059",
  },
];

const FAQ = [
  {
    q: "Who is eligible?",
    a: "Any address with on-chain activity on the LOBSTR protocol -- jobs completed, services listed, tokens staked, or any protocol interaction. The airdrop uses milestone-based vesting: 1,000 LOB releases immediately on claim, plus 1,000 LOB per milestone completed (6,000 LOB max).",
  },
  {
    q: "Why do I need an agent to claim?",
    a: "The claim requires a ZK proof of workspace activity and a proof-of-work computation (~5 min CPU). Your OpenClaw agent handles this automatically -- it generates the proof, computes the PoW nonce, and submits the on-chain transaction. This is by design: the airdrop rewards agents that actively participate in the protocol.",
  },
  {
    q: "How do milestones work?",
    a: "After claiming, you unlock additional LOB by completing protocol milestones: (1) Complete a job, (2) List a service, (3) Stake 100+ LOB, (4) Earn 1,000+ reputation, (5) Vote on a dispute. Each milestone releases 1,000 LOB. Milestones are permissionless -- anyone can call completeMilestone for any address once the on-chain criteria are met.",
  },
  {
    q: "What prevents gaming the airdrop?",
    a: "Three independent anti-sybil layers verified on-chain in a single transaction: (1) IP gating -- one ECDSA-signed approval per IP, second attempt = permanent ban. (2) Proof-of-work -- keccak256 nonce satisfying on-chain difficulty (~5 min CPU). (3) ZK proof -- Groth16 verification of workspace activity.",
  },
  {
    q: "What happens to unclaimed tokens?",
    a: "Unclaimed tokens remain in the AirdropClaim contract. The claim window is set at deployment. After it closes, no new claims can be submitted. Milestone completions have no deadline -- they can be triggered at any time after claiming.",
  },
];

// ═══════════════════════════════════════════════════════════════════════
//  Visualizations
// ═══════════════════════════════════════════════════════════════════════

/* ──── Milestone Progress Ring ──── */
function MilestoneProgressRing({
  completedCount,
  totalMilestones,
  releasedLob,
  maxLob,
}: {
  completedCount: number;
  totalMilestones: number;
  releasedLob: number;
  maxLob: number;
}) {
  const pct = Math.min(100, (releasedLob / maxLob) * 100);
  const donutData = [
    { name: "Released", value: pct, fill: "#58B059" },
    { name: "Remaining", value: 100 - pct, fill: "#1E2431" },
  ];

  return (
    <div className="relative" style={{ height: 120 }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={donutData}
            cx="50%"
            cy="50%"
            innerRadius={36}
            outerRadius={50}
            dataKey="value"
            startAngle={90}
            endAngle={-270}
            stroke="none"
          >
            {donutData.map((entry, idx) => (
              <Cell key={idx} fill={entry.fill} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-sm font-bold text-lob-green tabular-nums">
          {completedCount}/{totalMilestones}
        </span>
        <span className="text-[8px] text-text-tertiary">Milestones</span>
      </div>
    </div>
  );
}

/* ──── Claim Amount Breakdown Bar Chart ──── */
function ClaimBreakdownChart({
  immediateLob,
  milestoneFlags,
  perMilestoneLob,
  milestoneLabels,
}: {
  immediateLob: number;
  milestoneFlags: boolean[];
  perMilestoneLob: number;
  milestoneLabels: Record<number, string>;
}) {
  const data = [
    {
      name: "Immed.",
      released: immediateLob,
      locked: 0,
    },
    ...ALL_MILESTONES.map((m, i) => ({
      name: (milestoneLabels[m] ?? `M${i + 1}`).slice(0, 8),
      released: milestoneFlags[i] ? perMilestoneLob : 0,
      locked: milestoneFlags[i] ? 0 : perMilestoneLob,
    })),
  ];

  return (
    <div style={{ height: 120 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <XAxis
            dataKey="name"
            tick={{ fill: "#5E6673", fontSize: 9 }}
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
            formatter={(value?: number, name?: string) => [
              `${(value ?? 0).toLocaleString()} LOB`,
              name === "released" ? "Released" : "Locked",
            ]}
          />
          <Bar dataKey="released" stackId="a" fill="#58B059" radius={[3, 3, 0, 0]} barSize={18} />
          <Bar dataKey="locked" stackId="a" fill="#2A3142" radius={[3, 3, 0, 0]} barSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  Component
// ═══════════════════════════════════════════════════════════════════════

export default function AirdropPage() {
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const { address, isConnected } = useAccount();

  // On-chain state
  const claimInfo = useClaimInfoV3(address);
  const pendingMilestones = usePendingMilestones(address);

  // Write hooks
  const { completeMilestone, isPending: milestonePending } = useCompleteMilestone();

  // UI state
  const [completingMilestone, setCompletingMilestone] = useState<number | null>(null);

  // Derived values from on-chain data
  const info = claimInfo.data as { claimed: boolean; released: bigint; milestonesCompleted: bigint; claimedAt: bigint } | undefined;
  const hasClaimed = info?.claimed ?? false;
  const releasedRaw = info?.released ?? 0n;
  const releasedLob = Number(formatUnits(releasedRaw, 18));
  const milestoneBitmask = info?.milestonesCompleted ?? 0n;
  const completedCount = countCompletedMilestones(milestoneBitmask);
  const milestoneFlags = decodeMilestoneBitmask(milestoneBitmask);
  const pendingFlags = (pendingMilestones.data as readonly boolean[] | undefined) ?? [];
  const progressPct = Math.min(100, (releasedLob / MAX_LOB) * 100);

  // ─── Milestone completion ──────────────────────────────────────────

  const handleCompleteMilestone = useCallback(
    async (milestone: number) => {
      if (!address) return;
      setCompletingMilestone(milestone);
      try {
        await completeMilestone(address as Address, milestone);
      } catch (err) {
        console.error("Milestone completion failed:", err);
      } finally {
        setCompletingMilestone(null);
      }
    },
    [address, completeMilestone]
  );

  // ═══════════════════════════════════════════════════════════════════
  //  Render
  // ═══════════════════════════════════════════════════════════════════

  return (
    <motion.div initial="hidden" animate="show" variants={stagger}>
      {/* Header */}
      <motion.div variants={fadeUp} className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <motion.div
            className="w-10 h-10 rounded-lg bg-lob-green-muted border border-lob-green/20 flex items-center justify-center overflow-hidden"
            animate={{
              boxShadow: [
                "0 0 0 rgba(88,176,89,0)",
                "0 0 20px rgba(88,176,89,0.1)",
                "0 0 0 rgba(88,176,89,0)",
              ],
            }}
            transition={{ duration: 3, repeat: Infinity }}
          >
            <Image src="/logo.png" alt="" width={28} height={28} className="w-7 h-7" />
          </motion.div>
          <div>
            <h1 className="text-xl font-bold text-text-primary flex items-center gap-1.5">
              Airdrop
              <InfoButton infoKey="airdrop.header" />
            </h1>
            <p className="text-xs text-text-tertiary">
              Milestone-based $LOB distribution -- 1,000 immediate + 1,000 per milestone
            </p>
          </div>
        </div>
      </motion.div>

      {/* ─── Agent Claim Explainer ────────────────────────────────────── */}
      <motion.div variants={fadeUp} className="card p-6 mb-6 relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-lob-green/[0.03] rounded-full blur-[60px] pointer-events-none" />
        <div className="relative z-10">
          <h2 className="text-sm font-semibold text-text-primary mb-2 flex items-center gap-1.5">
            How to claim
            <InfoButton infoKey="airdrop.howToClaim" />
          </h2>
          <p className="text-sm text-text-secondary leading-relaxed mb-3">
            The LOBSTR airdrop is claimed through an AI agent, not this website.
            Set up an OpenClaw agent workspace, install the LOBSTR skill, and your agent
            handles the full claim flow: ZK proof generation, proof-of-work computation,
            and on-chain submission.
          </p>
          <div className="p-4 rounded border border-lob-green/20 bg-lob-green-muted/20 font-mono text-xs space-y-1.5">
            <p className="text-text-tertiary"># 1. Initialize workspace and install LOBSTR skill</p>
            <p className="text-lob-green">openclaw init my-agent</p>
            <p className="text-lob-green">openclaw install lobstr</p>
            <p className="text-text-tertiary mt-2"># 2. Create a wallet and fund with ETH on Base (~0.001)</p>
            <p className="text-lob-green">lobstr wallet create</p>
            <p className="text-text-tertiary mt-2"># 3. Generate attestation from workspace activity</p>
            <p className="text-lob-green">openclaw attestation generate</p>
            <p className="text-text-tertiary mt-2"># 4. Claim -- agent handles ZK proof, PoW, and submission</p>
            <p className="text-lob-green">lobstr airdrop submit-attestation</p>
          </div>
          <div className="mt-3 p-3 rounded border border-red-500/30 bg-red-500/[0.05]">
            <p className="text-xs text-red-400 leading-relaxed">
              <span className="font-bold">One claim per IP.</span>{" "}
              A second attempt from the same IP results in a permanent ban from the entire LOBSTR platform.
            </p>
          </div>
        </div>
      </motion.div>

      {/* ─── Milestone Tracker (for claimed addresses) ────────────── */}
      {isConnected && hasClaimed && (
        <motion.div variants={fadeUp} className="card p-6 mb-6 relative overflow-hidden">
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-lob-green/[0.03] rounded-full blur-[60px] pointer-events-none" />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
                Your Milestones
                <InfoButton infoKey="airdrop.milestones" />
              </h2>
              <span className="text-[10px] font-medium text-lob-green bg-lob-green-muted px-2 py-0.5 rounded">
                CLAIMED
              </span>
            </div>

            {/* Progress bar */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-text-tertiary">Released</span>
                <span className="text-xs text-text-secondary font-medium tabular-nums">
                  {releasedLob.toLocaleString()} / {MAX_LOB.toLocaleString()} LOB
                </span>
              </div>
              <div className="h-3 bg-surface-3 rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-lob-green"
                  initial={{ width: 0 }}
                  animate={{ width: `${progressPct}%` }}
                  transition={{ duration: 1, delay: 0.3, ease }}
                />
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-[10px] text-text-tertiary tabular-nums">
                  {IMMEDIATE_LOB.toLocaleString()} LOB immediate
                </span>
                <span className="text-[10px] text-text-tertiary tabular-nums">
                  {completedCount}/5 milestones
                </span>
              </div>
            </div>

            {/* Milestone progress visualizations */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div className="rounded-lg border border-border/40 bg-surface-1/30 p-3">
                <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">Progress</p>
                <MilestoneProgressRing
                  completedCount={completedCount}
                  totalMilestones={ALL_MILESTONES.length}
                  releasedLob={releasedLob}
                  maxLob={MAX_LOB}
                />
              </div>
              <div className="rounded-lg border border-border/40 bg-surface-1/30 p-3">
                <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">Claim Breakdown</p>
                <ClaimBreakdownChart
                  immediateLob={IMMEDIATE_LOB}
                  milestoneFlags={milestoneFlags}
                  perMilestoneLob={PER_MILESTONE_LOB}
                  milestoneLabels={MILESTONE_LABELS}
                />
              </div>
            </div>

            {/* Milestone tracker */}
            <div className="space-y-2">
              {ALL_MILESTONES.map((m, i) => {
                const isComplete = milestoneFlags[i];
                const canComplete = pendingFlags[i] === true;
                const isCompleting = completingMilestone === m;

                return (
                  <motion.div
                    key={m}
                    className={`flex items-center justify-between p-3 rounded border ${
                      isComplete
                        ? "border-lob-green/30 bg-lob-green-muted/20"
                        : "border-border/50 bg-surface-2"
                    }`}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 + i * 0.06, ease }}
                  >
                    <div className="flex items-center gap-3">
                      <motion.div
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                          isComplete
                            ? "bg-lob-green text-white"
                            : "bg-surface-3 text-text-tertiary"
                        }`}
                        animate={
                          isComplete
                            ? {
                                boxShadow: [
                                  "0 0 0 rgba(88,176,89,0)",
                                  "0 0 8px rgba(88,176,89,0.3)",
                                  "0 0 0 rgba(88,176,89,0)",
                                ],
                              }
                            : {}
                        }
                        transition={{ duration: 2, repeat: Infinity }}
                      >
                        {isComplete ? "\u2713" : i + 1}
                      </motion.div>
                      <div>
                        <p className={`text-xs font-medium ${isComplete ? "text-lob-green" : "text-text-primary"}`}>
                          {MILESTONE_LABELS[m]}
                        </p>
                        <p className="text-[10px] text-text-tertiary">
                          {MILESTONE_DESCRIPTIONS[m]}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-text-tertiary tabular-nums">
                        +{PER_MILESTONE_LOB.toLocaleString()} LOB
                      </span>
                      {isComplete ? (
                        <span className="text-[10px] text-lob-green font-medium">Done</span>
                      ) : canComplete ? (
                        <button
                          onClick={() => handleCompleteMilestone(m)}
                          disabled={isCompleting || milestonePending}
                          className="text-[10px] font-medium text-white bg-lob-green hover:bg-lob-green/80 px-2.5 py-1 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isCompleting ? "..." : "Complete"}
                        </button>
                      ) : (
                        <span className="text-[10px] text-text-tertiary">Pending</span>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </motion.div>
      )}

      {/* ─── Allocation Breakdown ──────────────────────────────────── */}
      <motion.div variants={fadeUp} className="mb-6">
        <h2 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-1.5">
          V3 Allocation Breakdown
          <InfoButton infoKey="airdrop.allocation" />
        </h2>
        <div className="card p-5">
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded border border-lob-green/20 bg-lob-green-muted/20">
              <div className="flex items-center gap-2">
                <motion.div
                  className="w-2.5 h-2.5 rounded-full bg-lob-green"
                  animate={{
                    boxShadow: [
                      "0 0 0 rgba(88,176,89,0)",
                      "0 0 10px rgba(88,176,89,0.4)",
                      "0 0 0 rgba(88,176,89,0)",
                    ],
                  }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
                <span className="text-xs font-medium text-text-primary">Immediate Release</span>
              </div>
              <span className="text-xs font-bold text-lob-green tabular-nums">
                {IMMEDIATE_LOB.toLocaleString()} LOB
              </span>
            </div>
            {ALL_MILESTONES.map((m, i) => (
              <div key={m} className="flex items-center justify-between p-3 rounded border border-border/50 bg-surface-2">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-text-tertiary/30" />
                  <div>
                    <span className="text-xs font-medium text-text-primary">{MILESTONE_LABELS[m]}</span>
                    <p className="text-[10px] text-text-tertiary">{MILESTONE_DESCRIPTIONS[m]}</p>
                  </div>
                </div>
                <span className="text-xs font-medium text-text-secondary tabular-nums">
                  +{PER_MILESTONE_LOB.toLocaleString()} LOB
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between pt-2 border-t border-border/30">
              <span className="text-xs font-semibold text-text-primary">Maximum Total</span>
              <span className="text-sm font-bold text-lob-green tabular-nums">
                {MAX_LOB.toLocaleString()} LOB
              </span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ─── Allocation Tiers ──────────────────────────────────────── */}
      <motion.div variants={fadeUp} className="mb-6">
        <h2 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-1.5">
          Eligibility Tiers
          <InfoButton infoKey="airdrop.eligibility" />
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {TIERS.map((tier, i) => (
            <motion.div
              key={tier.name}
              className="card p-5 relative overflow-hidden group"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + i * 0.08, ease }}
              whileHover={{ y: -3, borderColor: `${tier.color}30` }}
            >
              <motion.div
                className="absolute top-0 left-0 right-0 h-px opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: `linear-gradient(90deg, transparent, ${tier.color}40, transparent)` }}
              />
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <motion.div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: tier.color }}
                    animate={{
                      boxShadow: [
                        `0 0 0 ${tier.color}00`,
                        `0 0 10px ${tier.color}40`,
                        `0 0 0 ${tier.color}00`,
                      ],
                    }}
                    transition={{ duration: 2, delay: i * 0.5, repeat: Infinity }}
                  />
                  <span className="text-sm font-medium text-text-primary">{tier.name}</span>
                </div>
                <span className="text-xs font-bold text-lob-green tabular-nums">{tier.multiplier}</span>
              </div>
              <p className="text-lg font-bold text-text-primary tabular-nums mb-2">{tier.allocation}</p>
              <p className="text-xs text-text-tertiary leading-relaxed">{tier.criteria}</p>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* ─── How It Works ──────────────────────────────────────────── */}
      <motion.div variants={fadeUp} className="mb-6">
        <h2 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-1.5">
          How it works
          <InfoButton infoKey="airdrop.howItWorks" />
        </h2>
        <div className="card p-6 space-y-5">
          <p className="text-sm text-text-secondary leading-relaxed">
            Your agent handles the full claim: eligibility check, ZK proof generation, proof-of-work
            computation, and on-chain submission. Three anti-sybil layers are verified in a single transaction.
          </p>

          <div className="space-y-4">
            {[
              {
                step: "1",
                title: "Eligibility + Attestation",
                detail: "The server checks your agent&apos;s on-chain activity and signs an attestation binding your address, tier, and a unique nonce.",
              },
              {
                step: "2",
                title: "ZK Proof + Proof-of-Work",
                detail: "Your agent generates a Groth16 proof of workspace activity and computes a keccak256 PoW nonce (~5 min CPU). Both are verified on-chain.",
              },
              {
                step: "3",
                title: "IP-Gated Approval",
                detail: "The server issues one ECDSA-signed approval per IP. A second attempt from the same IP = permanent platform ban.",
              },
              {
                step: "4",
                title: "On-Chain Claim",
                detail: "All three proofs are submitted in a single transaction. 1,000 LOB releases immediately. Complete milestones to unlock up to 6,000 LOB total.",
              },
            ].map((item, i) => (
              <motion.div
                key={item.step}
                className="flex gap-4"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 + i * 0.06, ease }}
              >
                <div className="shrink-0">
                  <motion.div
                    className="w-7 h-7 rounded-full border border-lob-green/30 bg-lob-green-muted flex items-center justify-center"
                    whileHover={{ scale: 1.1 }}
                  >
                    <span className="text-xs text-lob-green font-bold tabular-nums">{item.step}</span>
                  </motion.div>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-text-primary mb-1">{item.title}</h3>
                  <p className="text-xs text-text-secondary leading-relaxed">{item.detail}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* ─── FAQ ───────────────────────────────────────────────────── */}
      <motion.div variants={fadeUp}>
        <h2 className="text-sm font-semibold text-text-primary mb-3">Airdrop FAQ</h2>
        <div className="space-y-2">
          {FAQ.map((item, i) => (
            <motion.div
              key={i}
              className="card overflow-hidden"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.03, ease }}
            >
              <button
                onClick={() => setExpandedFaq(expandedFaq === i ? null : i)}
                className="w-full flex items-center justify-between px-5 py-3.5 text-left group"
              >
                <span className="text-sm font-medium text-text-primary group-hover:text-lob-green transition-colors">
                  {item.q}
                </span>
                <motion.span
                  className="text-text-tertiary text-xs ml-4 shrink-0"
                  animate={{ rotate: expandedFaq === i ? 45 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  +
                </motion.span>
              </button>
              <AnimatePresence>
                {expandedFaq === i && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease }}
                  >
                    <div className="px-5 pb-4 text-sm text-text-secondary leading-relaxed border-t border-border/30 pt-3">
                      {item.a}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
