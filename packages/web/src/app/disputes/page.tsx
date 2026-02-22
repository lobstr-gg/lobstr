"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { stagger, fadeUp, ease } from "@/lib/motion";
import { useArbitratorInfo, useApproveToken, useStakeAsArbitrator } from "@/lib/hooks";
import { getContracts, CHAIN } from "@/config/contracts";
import { parseEther, formatEther } from "viem";
import { useQuery } from "@tanstack/react-query";
import { fetchDisputesForAddress, isIndexerConfigured, type IndexerDispute } from "@/lib/indexer";

type TabId = "assigned" | "my-disputes" | "history";

const TABS: { id: TabId; label: string }[] = [
  { id: "assigned", label: "Assigned to Me" },
  { id: "my-disputes", label: "My Disputes" },
  { id: "history", label: "History" },
];

const RANK_NAMES = ["Unranked", "Junior", "Senior", "Principal"];

const DISPUTE_STATUS_LABELS: Record<number, string> = {
  0: "Open",
  1: "Evidence",
  2: "Voting",
  3: "Resolved",
};

const DISPUTE_STATUS_COLORS: Record<number, { bg: string; text: string; border: string }> = {
  0: { bg: "bg-yellow-500/10", text: "text-yellow-400", border: "border-yellow-400/20" },
  1: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-400/20" },
  2: { bg: "bg-purple-500/10", text: "text-purple-400", border: "border-purple-400/20" },
  3: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-400/20" },
};

function DisputeCard({ dispute, role }: { dispute: IndexerDispute; role: string }) {
  const statusNum = dispute.status;
  const statusLabel = DISPUTE_STATUS_LABELS[statusNum] ?? "Unknown";
  const colors = DISPUTE_STATUS_COLORS[statusNum] ?? DISPUTE_STATUS_COLORS[0];
  const amount = Number(formatEther(BigInt(dispute.amount)));
  const date = new Date(Number(dispute.createdAt) * 1000).toLocaleDateString();

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
          </div>
          <span className="text-xs text-text-tertiary">{date}</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-xs text-text-tertiary">
            <span>Job #{dispute.jobId}</span>
            <span>{amount.toLocaleString()} LOB</span>
            <span className="capitalize">{role}</span>
          </div>
          {statusNum === 2 && (
            <span className="text-[10px] text-purple-400">
              {dispute.votesForBuyer + dispute.votesForSeller}/3 votes
            </span>
          )}
        </div>
      </motion.div>
    </Link>
  );
}

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

  const arbData = arbInfo as { rank: number; disputesHandled: bigint; majorityVotes: bigint; active: boolean; stake: bigint } | undefined;
  const arbTier = arbData ? Number(arbData.rank) : undefined;
  const casesHandled = arbData ? Number(arbData.disputesHandled) : undefined;
  const majorityRate = arbData ? Number(arbData.majorityVotes) : undefined;

  const STATS = [
    { label: "Arbitrator Rank", value: arbLoading ? "--" : RANK_NAMES[arbTier ?? 0] ?? "Unranked", sub: "" },
    { label: "Disputes Handled", value: arbLoading ? "--" : String(casesHandled ?? 0), sub: "" },
    { label: "Majority Vote Rate", value: arbLoading ? "--" : majorityRate !== undefined ? `${majorityRate}%` : "--", sub: "" },
    { label: "Earnings", value: "0", sub: "LOB" },
  ];

  // Filter disputes by tab
  const addr = address?.toLowerCase() ?? "";
  const filteredDisputes = (disputes ?? []).filter((d) => {
    const isAssigned = [d.arbitrator0, d.arbitrator1, d.arbitrator2].some(
      (a) => a?.toLowerCase() === addr
    );
    const isParty = d.buyer.toLowerCase() === addr || d.seller.toLowerCase() === addr;

    switch (activeTab) {
      case "assigned":
        return isAssigned && d.status !== 3;
      case "my-disputes":
        return isParty && d.status !== 3;
      case "history":
        return d.status === 3;
      default:
        return false;
    }
  });

  function getRole(d: IndexerDispute): string {
    if (d.buyer.toLowerCase() === addr) return "buyer";
    if (d.seller.toLowerCase() === addr) return "seller";
    if ([d.arbitrator0, d.arbitrator1, d.arbitrator2].some((a) => a?.toLowerCase() === addr)) return "arbitrator";
    return "spectator";
  }

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
          <motion.div
            className="w-6 h-px bg-lob-red"
            animate={{ rotate: [0, 45, 0], opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 3, repeat: Infinity }}
          />
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
        <h1 className="text-xl font-bold text-text-primary">Dispute Center</h1>
        <p className="text-xs text-text-tertiary mt-0.5">
          Manage arbitration, disputes, and rulings
        </p>
      </motion.div>

      {/* Arbitrator stats */}
      <motion.div variants={fadeUp} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {STATS.map((stat, i) => (
          <motion.div
            key={stat.label}
            className="card p-4 relative overflow-hidden group"
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.1 + i * 0.06, ease }}
            whileHover={{ y: -2, borderColor: "rgba(0,214,114,0.2)" }}
          >
            <motion.div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-lob-green/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <p className="text-xs text-text-tertiary uppercase tracking-wider">{stat.label}</p>
            <div className="flex items-baseline gap-1 mt-1">
              <p className="text-xl font-bold text-text-primary tabular-nums">{stat.value}</p>
              {stat.sub && <span className="text-xs text-text-tertiary">{stat.sub}</span>}
            </div>
          </motion.div>
        ))}
      </motion.div>

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
                <div className="flex gap-2 text-[10px] text-text-tertiary mb-4">
                  <span className="px-2 py-0.5 rounded bg-surface-2 border border-border">Junior: 5,000+ LOB</span>
                  <span className="px-2 py-0.5 rounded bg-surface-2 border border-border">Senior: 25,000+ LOB</span>
                  <span className="px-2 py-0.5 rounded bg-surface-2 border border-border">Principal: 100,000+ LOB</span>
                </div>

                {stakeStep === "done" ? (
                  <div className="text-center py-4">
                    <span className="text-lob-green text-lg">{"\u2713"}</span>
                    <p className="text-xs text-text-secondary mt-1">Staked successfully!</p>
                  </div>
                ) : (
                  <>
                    <div className="flex gap-2 mb-3">
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
              {disputes && (
                <span className={`text-[10px] tabular-nums px-1.5 py-0.5 rounded-full ${
                  activeTab === tab.id ? "bg-surface-3 text-text-primary" : "bg-surface-2 text-text-tertiary"
                }`}>
                  {(disputes ?? []).filter((d) => {
                    const isAssigned = [d.arbitrator0, d.arbitrator1, d.arbitrator2].some(
                      (a) => a?.toLowerCase() === addr
                    );
                    const isParty = d.buyer.toLowerCase() === addr || d.seller.toLowerCase() === addr;
                    if (tab.id === "assigned") return isAssigned && d.status !== 3;
                    if (tab.id === "my-disputes") return isParty && d.status !== 3;
                    return d.status === 3;
                  }).length}
                </span>
              )}
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
            <div className="card text-center py-16 px-4">
              <motion.div
                className="w-12 h-12 rounded-full border border-border/60 mx-auto mb-4 flex items-center justify-center"
                animate={{
                  borderColor: [
                    "rgba(30,36,49,0.6)",
                    "rgba(255,59,105,0.2)",
                    "rgba(30,36,49,0.6)",
                  ],
                }}
                transition={{ duration: 4, repeat: Infinity }}
              >
                <motion.div
                  className="w-4 h-4 border-t-2 border-r-2 border-lob-red/30 rounded-tr-full"
                  animate={{ rotate: [0, 360] }}
                  transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                />
              </motion.div>
              <p className="text-sm text-text-secondary">
                {activeTab === "assigned"
                  ? "No disputes assigned to you"
                  : activeTab === "my-disputes"
                  ? "No active disputes"
                  : "No dispute history"}
              </p>
              <p className="text-xs text-text-tertiary mt-1">
                {!isIndexerConfigured()
                  ? "Indexer not configured. Disputes will appear once connected."
                  : "Disputes will appear here when they are created on-chain."}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredDisputes.map((d) => (
                <DisputeCard key={d.id} dispute={d} role={getRole(d)} />
              ))}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}
