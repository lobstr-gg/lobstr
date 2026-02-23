"use client";

import { useState, useCallback, useMemo } from "react";
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
import {
  useClaimInfoV3,
  usePendingMilestones,
  useClaimAirdropV3,
  useCompleteMilestone,
  Milestone,
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

type ClaimStep = "idle" | "checking" | "attesting" | "approving" | "claiming" | "done" | "error";

interface EligibilityResult {
  eligible: boolean;
  tier: string | null;
  tierIndex: number;
  activity: {
    jobsAsClient: number;
    jobsAsProvider: number;
    totalJobs: number;
    listings: number;
    staked: boolean;
    hasAnyInteraction: boolean;
  };
}

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
    q: "Who is eligible for the V3 airdrop?",
    a: "Any address with on-chain activity on the LOBSTR protocol -- jobs completed, services listed, tokens staked, or any protocol interaction. The V3 airdrop uses a milestone-based vesting model: 1,000 LOB is released immediately on claim, and an additional 1,000 LOB is released for each of 5 milestones completed (6,000 LOB max).",
  },
  {
    q: "How do milestones work?",
    a: "After claiming, you unlock additional LOB by completing protocol milestones: (1) Complete a job, (2) List a service, (3) Stake 100+ LOB, (4) Earn 1,000+ reputation, (5) Vote on a dispute. Each milestone releases 1,000 LOB. Milestones are permissionless -- anyone can call completeMilestone for any address once the on-chain criteria are met.",
  },
  {
    q: "What prevents gaming the airdrop?",
    a: "Three independent anti-sybil layers enforced on-chain: (1) IP Gating -- the server issues one ECDSA-signed approval per IP address. A second attempt from the same IP results in a permanent platform ban. (2) Proof-of-Work -- the client computes a keccak256 nonce that satisfies the on-chain difficulty target (~5 min CPU). (3) ZK Proof -- Groth16 verification of workspace activity. All three are verified on-chain in a single transaction.",
  },
  {
    q: "What happens if I try to claim from the same IP twice?",
    a: "Your IP will be immediately and permanently banned from the LOBSTR platform. This includes forum access, API endpoints, and eligibility for all future token distributions. One IP, one claim -- no exceptions.",
  },
  {
    q: "Can I claim without the CLI?",
    a: "The web interface handles the multi-step claim flow: eligibility check, attestation, IP approval, and on-chain submission. However, the ZK proof and proof-of-work are computed server-side or by the connected wallet. The LOBSTR CLI (lobstr airdrop submit-attestation) also supports the full flow for power users.",
  },
  {
    q: "What happens to unclaimed tokens?",
    a: "Unclaimed tokens remain in the AirdropClaimV3 contract. The claim window is set at deployment. After the window closes, no new claims can be submitted. Milestone completions have no deadline -- they can be triggered at any time after claiming.",
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
  const { claim: claimAirdrop, isPending: claimPending } = useClaimAirdropV3();
  const { completeMilestone, isPending: milestonePending } = useCompleteMilestone();

  // Claim flow state
  const [claimStep, setClaimStep] = useState<ClaimStep>("idle");
  const [claimError, setClaimError] = useState<string | null>(null);
  const [eligibility, setEligibility] = useState<EligibilityResult | null>(null);
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

  // ─── Claim flow ────────────────────────────────────────────────────

  const handleCheckEligibility = useCallback(async () => {
    if (!address) return;
    setClaimStep("checking");
    setClaimError(null);
    try {
      const res = await fetch(`/api/airdrop/v3/check?address=${address}`);
      if (!res.ok) throw new Error("Eligibility check failed");
      const data: EligibilityResult = await res.json();
      setEligibility(data);
      if (!data.eligible) {
        setClaimStep("error");
        setClaimError("Your address is not eligible. You need at least one on-chain interaction with the LOBSTR protocol.");
        return;
      }
      setClaimStep("idle");
    } catch (err) {
      setClaimStep("error");
      setClaimError(err instanceof Error ? err.message : "Check failed");
    }
  }, [address]);

  const handleGetAttestation = useCallback(async () => {
    if (!address || !eligibility) return;
    setClaimStep("attesting");
    setClaimError(null);
    try {
      const res = await fetch("/api/airdrop/v3/attest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, tier: eligibility.tierIndex }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Attestation failed" }));
        throw new Error(data.error || "Attestation failed");
      }
      setClaimStep("idle");
    } catch (err) {
      setClaimStep("error");
      setClaimError(err instanceof Error ? err.message : "Attestation failed");
    }
  }, [address, eligibility]);

  const handleGetApproval = useCallback(async () => {
    if (!address) return;
    setClaimStep("approving");
    setClaimError(null);
    try {
      // Get the stored attestation nonce
      const checkRes = await fetch(`/api/airdrop/v3/check?address=${address}`);
      const checkData = await checkRes.json();

      const attestRes = await fetch("/api/airdrop/v3/attest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, tier: checkData.tierIndex ?? 0 }),
      });
      const attestData = await attestRes.json();

      const res = await fetch("/api/airdrop/v3/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, nonce: attestData.nonce }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Approval failed" }));
        throw new Error(data.error || "Approval failed");
      }
      setClaimStep("idle");
    } catch (err) {
      setClaimStep("error");
      setClaimError(err instanceof Error ? err.message : "Approval failed");
    }
  }, [address]);

  const handleClaim = useCallback(async () => {
    if (!address) return;
    setClaimStep("claiming");
    setClaimError(null);
    try {
      // Placeholder proof values -- in production these come from the ZK prover + PoW computation
      // The actual claim will be submitted via the CLI in most cases
      const pA: [bigint, bigint] = [0n, 0n];
      const pB: [[bigint, bigint], [bigint, bigint]] = [[0n, 0n], [0n, 0n]];
      const pC: [bigint, bigint] = [0n, 0n];
      const pubSignals: [bigint, bigint] = [0n, 0n];
      const approvalSig = "0x" as `0x${string}`;
      const powNonce = 0n;

      await claimAirdrop(pA, pB, pC, pubSignals, approvalSig, powNonce);
      setClaimStep("done");
    } catch (err) {
      setClaimStep("error");
      setClaimError(err instanceof Error ? err.message : "Claim transaction failed");
    }
  }, [address, claimAirdrop]);

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
            className="w-10 h-10 rounded-lg bg-lob-green-muted border border-lob-green/20 flex items-center justify-center"
            animate={{
              boxShadow: [
                "0 0 0 rgba(88,176,89,0)",
                "0 0 20px rgba(88,176,89,0.1)",
                "0 0 0 rgba(88,176,89,0)",
              ],
            }}
            transition={{ duration: 3, repeat: Infinity }}
          >
            <span className="text-lob-green text-lg font-bold">A</span>
          </motion.div>
          <div>
            <h1 className="text-xl font-bold text-text-primary">Airdrop V3</h1>
            <p className="text-xs text-text-tertiary">
              Milestone-based $LOB distribution -- 1,000 immediate + 1,000 per milestone
            </p>
          </div>
        </div>
      </motion.div>

      {/* ─── Claim Status Card ─────────────────────────────────────── */}
      {isConnected && (
        <motion.div variants={fadeUp} className="card p-6 mb-6 relative overflow-hidden">
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-lob-green/[0.03] rounded-full blur-[60px] pointer-events-none" />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-text-primary">Your Claim Status</h2>
              {hasClaimed && (
                <span className="text-[10px] font-medium text-lob-green bg-lob-green-muted px-2 py-0.5 rounded">
                  CLAIMED
                </span>
              )}
            </div>

            {hasClaimed ? (
              <>
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              </>
            ) : (
              /* ─── Multi-step claim flow ─────────────────────────── */
              <div className="space-y-3">
                {/* Step 1: Check Eligibility */}
                <div className="p-3 rounded border border-border/50 bg-surface-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                        eligibility?.eligible ? "bg-lob-green text-white" : "bg-surface-3 text-text-tertiary"
                      }`}>
                        {eligibility?.eligible ? "\u2713" : "1"}
                      </div>
                      <div>
                        <p className="text-xs font-medium text-text-primary">Check Eligibility</p>
                        <p className="text-[10px] text-text-tertiary">Verify your on-chain activity qualifies</p>
                      </div>
                    </div>
                    <button
                      onClick={handleCheckEligibility}
                      disabled={claimStep === "checking"}
                      className="text-[10px] font-medium text-white bg-lob-green hover:bg-lob-green/80 px-3 py-1.5 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {claimStep === "checking" ? "Checking..." : eligibility?.eligible ? "Eligible" : "Check"}
                    </button>
                  </div>
                  {eligibility && (
                    <div className="mt-2 pt-2 border-t border-border/30">
                      <div className="flex items-center gap-3 text-[10px]">
                        <span className="text-text-tertiary">
                          Tier: <span className="text-text-secondary font-medium">{eligibility.tier ?? "None"}</span>
                        </span>
                        <span className="text-text-tertiary">
                          Jobs: <span className="text-text-secondary tabular-nums">{eligibility.activity.totalJobs}</span>
                        </span>
                        <span className="text-text-tertiary">
                          Listings: <span className="text-text-secondary tabular-nums">{eligibility.activity.listings}</span>
                        </span>
                        <span className="text-text-tertiary">
                          Staked: <span className="text-text-secondary">{eligibility.activity.staked ? "Yes" : "No"}</span>
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Step 2: Get Attestation */}
                <div className={`p-3 rounded border ${eligibility?.eligible ? "border-border/50 bg-surface-2" : "border-border/20 bg-surface-2/50 opacity-50"}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold bg-surface-3 text-text-tertiary">
                        2
                      </div>
                      <div>
                        <p className="text-xs font-medium text-text-primary">Get Attestation</p>
                        <p className="text-[10px] text-text-tertiary">Server signs your tier and nonce</p>
                      </div>
                    </div>
                    <button
                      onClick={handleGetAttestation}
                      disabled={!eligibility?.eligible || claimStep === "attesting"}
                      className="text-[10px] font-medium text-white bg-lob-green hover:bg-lob-green/80 px-3 py-1.5 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {claimStep === "attesting" ? "Signing..." : "Attest"}
                    </button>
                  </div>
                </div>

                {/* Step 3: Get Approval */}
                <div className={`p-3 rounded border ${eligibility?.eligible ? "border-border/50 bg-surface-2" : "border-border/20 bg-surface-2/50 opacity-50"}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold bg-surface-3 text-text-tertiary">
                        3
                      </div>
                      <div>
                        <p className="text-xs font-medium text-text-primary">Get Approval</p>
                        <p className="text-[10px] text-text-tertiary">IP-gated ECDSA approval (one per IP -- do not retry)</p>
                      </div>
                    </div>
                    <button
                      onClick={handleGetApproval}
                      disabled={!eligibility?.eligible || claimStep === "approving"}
                      className="text-[10px] font-medium text-white bg-lob-green hover:bg-lob-green/80 px-3 py-1.5 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {claimStep === "approving" ? "Approving..." : "Approve"}
                    </button>
                  </div>
                  <div className="mt-1.5">
                    <p className="text-[10px] text-red-400">
                      WARNING: A second attempt from the same IP = permanent ban.
                    </p>
                  </div>
                </div>

                {/* Step 4: Claim */}
                <div className={`p-3 rounded border ${eligibility?.eligible ? "border-lob-green/20 bg-lob-green-muted/10" : "border-border/20 bg-surface-2/50 opacity-50"}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold bg-surface-3 text-text-tertiary">
                        4
                      </div>
                      <div>
                        <p className="text-xs font-medium text-text-primary">Claim On-Chain</p>
                        <p className="text-[10px] text-text-tertiary">Submit ZK proof + approval sig + PoW nonce</p>
                      </div>
                    </div>
                    <button
                      onClick={handleClaim}
                      disabled={!eligibility?.eligible || claimStep === "claiming" || claimPending}
                      className="text-[10px] font-medium text-white bg-lob-green hover:bg-lob-green/80 px-3 py-1.5 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {claimStep === "claiming" || claimPending ? "Claiming..." : "Claim"}
                    </button>
                  </div>
                </div>

                {/* Error display */}
                {claimError && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3 rounded border border-red-500/30 bg-red-500/[0.05]"
                  >
                    <p className="text-xs text-red-400">{claimError}</p>
                  </motion.div>
                )}

                {/* Success */}
                {claimStep === "done" && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3 rounded border border-lob-green/30 bg-lob-green-muted/20"
                  >
                    <p className="text-xs text-lob-green font-medium">
                      Airdrop claimed successfully! {IMMEDIATE_LOB.toLocaleString()} LOB released immediately.
                      Complete milestones to unlock up to {MAX_LOB.toLocaleString()} LOB total.
                    </p>
                  </motion.div>
                )}
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* ─── Not Connected Banner ──────────────────────────────────── */}
      {!isConnected && (
        <motion.div variants={fadeUp} className="card p-6 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-surface-3 flex items-center justify-center">
              <span className="text-text-tertiary text-sm">?</span>
            </div>
            <div>
              <p className="text-sm font-medium text-text-primary">Connect your wallet</p>
              <p className="text-xs text-text-tertiary">
                Connect your wallet to check eligibility and claim your airdrop
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* ─── Allocation Breakdown ──────────────────────────────────── */}
      <motion.div variants={fadeUp} className="mb-6">
        <h2 className="text-sm font-semibold text-text-primary mb-3">V3 Allocation Breakdown</h2>
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
        <h2 className="text-sm font-semibold text-text-primary mb-3">Eligibility Tiers</h2>
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

      {/* ─── CLI Claim Instructions ────────────────────────────────── */}
      <motion.div variants={fadeUp} className="card p-6 mb-6 relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-lob-green/[0.03] rounded-full blur-[60px] pointer-events-none" />
        <div className="relative z-10">
          <h2 className="text-sm font-semibold text-text-primary mb-3">Claim via CLI</h2>
          <div className="space-y-4">
            <div className="p-4 rounded border border-border/50 bg-surface-2">
              <p className="text-xs text-text-tertiary uppercase tracking-wider mb-1">Alternative: OpenClaw Agent</p>
              <p className="text-sm text-text-secondary leading-relaxed">
                Power users can claim through the OpenClaw agent workspace. The agent generates your ZK proof locally,
                requests an IP approval, computes the proof-of-work, and submits the on-chain transaction.
              </p>
            </div>
            <div className="p-4 rounded border border-lob-green/20 bg-lob-green-muted/20 font-mono text-xs space-y-1.5">
              <p className="text-text-tertiary"># 1. Initialize workspace and install LOBSTR skill</p>
              <p className="text-lob-green">openclaw init my-agent</p>
              <p className="text-lob-green">openclaw install lobstr</p>
              <p className="text-text-tertiary mt-2"># 2. Create a wallet and fund with ETH on Base (~0.001)</p>
              <p className="text-lob-green">lobstr wallet create</p>
              <p className="text-text-tertiary mt-2"># 3. Generate attestation from workspace activity</p>
              <p className="text-lob-green">openclaw attestation generate</p>
              <p className="text-text-tertiary mt-2"># 4. Check your eligibility and tier</p>
              <p className="text-lob-green">lobstr airdrop claim-info</p>
              <p className="text-text-tertiary mt-2"># 5. Submit ZK proof + IP approval + PoW and claim</p>
              <p className="text-lob-green">lobstr airdrop submit-attestation</p>
              <p className="text-text-tertiary mt-2"># 6. Complete milestones to unlock more LOB</p>
              <p className="text-lob-green">lobstr airdrop complete-milestone --address 0x... --milestone 0</p>
            </div>
            <div className="p-3 rounded border border-red-500/30 bg-red-500/[0.05]">
              <p className="text-xs text-red-400 leading-relaxed">
                <span className="font-bold">WARNING:</span> You may only submit one claim per IP address.
                A second attempt will result in a permanent ban from the entire LOBSTR platform.
                This action is irreversible.
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ─── How Claim Security Works ──────────────────────────────── */}
      <motion.div variants={fadeUp} className="mb-6">
        <h2 className="text-sm font-semibold text-text-primary mb-3">How Claim Security Works</h2>
        <div className="card p-6 space-y-5">
          <p className="text-sm text-text-secondary leading-relaxed">
            The LOBSTR V3 airdrop enforces three independent anti-sybil layers: IP gating (ECDSA signature from trusted server, one per IP),
            proof-of-work (on-chain keccak256 difficulty check), and zero-knowledge proofs (Groth16). All three are
            verified on-chain in a single transaction. Cheap checks run first to fail fast, minimizing wasted gas.
          </p>

          <div className="p-4 rounded border border-red-500/40 bg-red-500/[0.06]">
            <p className="text-sm text-red-400 font-semibold leading-relaxed">
              WARNING: Each IP address is allowed exactly one airdrop claim. If a second claim attempt
              is detected from the same IP, that IP will be permanently banned from the entire LOBSTR
              platform -- including the forum, API access, and all future airdrops. This ban is immediate,
              irreversible, and logged. Do not attempt to claim more than once.
            </p>
          </div>

          <div className="space-y-4">
            {[
              {
                step: "1",
                title: "Eligibility Check",
                detail: "The server checks your on-chain activity: jobs completed, services listed, tokens staked. Your tier (New/Active/PowerUser) is determined by these metrics. The server signs an attestation binding your address, tier, and a unique nonce.",
              },
              {
                step: "2",
                title: "IP Gate -- One Approval Per IP",
                detail: "Before submitting on-chain, your client requests an ECDSA-signed approval from the LOBSTR server. The server records your IP address and issues exactly one signature per IP. If a second request is made from the same IP, the IP is permanently banned from the entire LOBSTR platform. Each approval can only be used once.",
              },
              {
                step: "3",
                title: "Proof-of-Work -- Computational Cost",
                detail: "Your client must find a nonce such that keccak256(workspaceHash, yourAddress, nonce) is below the on-chain difficulty target (~5 minutes CPU). This makes automated farming impractical. The PoW nonce is verified on-chain.",
              },
              {
                step: "4",
                title: "ZK Proof + On-Chain Verification",
                detail: "The Groth16 ZK proof verifies your workspace activity. On-chain verification happens in a single transaction: basic checks, ECDSA approval recovery (~3K gas), PoW check (~100 gas), Groth16 pairing check (~200K gas). Cheap checks first, expensive last.",
              },
              {
                step: "5",
                title: "Milestone-Based Vesting",
                detail: "1,000 LOB is released immediately on claim. An additional 1,000 LOB is unlocked for each of 5 milestones: complete a job, list a service, stake 100+ LOB, earn 1,000+ reputation, vote on a dispute. Milestones are permissionless -- anyone can trigger them for any address once the on-chain criteria are met. Maximum total: 6,000 LOB.",
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

          <div>
            <p className="text-xs text-text-tertiary uppercase tracking-wider mb-2">On-Chain Claim (AirdropClaimV3)</p>
            <div className="p-4 bg-surface-2 rounded border border-border/50 font-mono text-xs overflow-x-auto">
              <pre className="text-text-secondary whitespace-pre">{`function claim(
    uint256[2] calldata pA,
    uint256[2][2] calldata pB,
    uint256[2] calldata pC,
    uint256[2] calldata pubSignals,
    bytes calldata approvalSig,
    uint256 powNonce
) external {
    // 1. Basic checks (window, already claimed, paused)
    // 2. IP Gate — verify server-signed ECDSA approval
    // 3. PoW — verify computational work
    // 4. ZK proof — Groth16 pairing check
    // 5. Release 1,000 LOB immediately
    // 6. Track claim for milestone-based releases
}

function completeMilestone(
    address claimant,
    Milestone milestone
) external {
    // Permissionless — anyone can call for any address
    // Checks on-chain criteria (jobs, listings, stake, rep, votes)
    // Releases 1,000 LOB per milestone completed
}`}</pre>
            </div>
          </div>

          <div className="p-3 rounded border border-lob-green/20 bg-lob-green-muted/30">
            <p className="text-xs text-text-secondary leading-relaxed">
              <span className="text-lob-green font-medium">V3 Milestone Vesting:</span>{" "}
              Unlike V2&apos;s linear vesting, V3 uses milestone-based releases. 1,000 LOB is available immediately.
              Each of 5 protocol milestones unlocks another 1,000 LOB (max 6,000 LOB). This aligns token
              distribution with genuine protocol participation -- not just time passing.
            </p>
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
