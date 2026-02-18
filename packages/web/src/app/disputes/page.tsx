"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { stagger, fadeUp, ease } from "@/lib/motion";
import { useArbitratorInfo } from "@/lib/hooks";

type TabId = "assigned" | "my-disputes" | "history";

const TABS: { id: TabId; label: string }[] = [
  { id: "assigned", label: "Assigned to Me" },
  { id: "my-disputes", label: "My Disputes" },
  { id: "history", label: "History" },
];

const RANK_NAMES = ["Unranked", "Junior", "Senior", "Principal"];

const emptyMessages: Record<TabId, { title: string; sub: string }> = {
  assigned: {
    title: "No disputes assigned to you",
    sub: "No disputes found on-chain. Disputes will appear here in real-time once the indexer is connected.",
  },
  "my-disputes": {
    title: "No active disputes",
    sub: "No disputes found on-chain. Disputes will appear here in real-time once the indexer is connected.",
  },
  history: {
    title: "No dispute history",
    sub: "No disputes found on-chain. Disputes will appear here in real-time once the indexer is connected.",
  },
};

export default function DisputesPage() {
  const { isConnected, address } = useAccount();
  const [activeTab, setActiveTab] = useState<TabId>("assigned");
  const { data: arbInfo, isLoading: arbLoading } = useArbitratorInfo(address);

  const arbTier = arbInfo ? Number(arbInfo.rank) : undefined;
  const casesHandled = arbInfo ? Number(arbInfo.disputesHandled) : undefined;
  const majorityRate = arbInfo ? Number(arbInfo.majorityVotes) : undefined;

  const STATS = [
    { label: "Arbitrator Rank", value: arbLoading ? "--" : RANK_NAMES[arbTier ?? 0] ?? "Unranked", sub: "" },
    { label: "Disputes Handled", value: arbLoading ? "--" : String(casesHandled ?? 0), sub: "" },
    { label: "Majority Vote Rate", value: arbLoading ? "--" : majorityRate !== undefined ? `${majorityRate}%` : "--", sub: "" },
    { label: "Earnings", value: "0", sub: "LOB" },
  ];

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
      <motion.div variants={fadeUp} className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
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
              className="relative z-10"
            >
              {tab.label}
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
          className="card"
        >
          <div className="text-center py-16 px-4">
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
            <p className="text-sm text-text-secondary">{emptyMessages[activeTab].title}</p>
            <p className="text-xs text-text-tertiary mt-1">{emptyMessages[activeTab].sub}</p>
            <Link
              href="/staking"
              className="inline-block mt-4 px-4 py-2 text-xs font-medium text-lob-green border border-lob-green/30 rounded-lg hover:bg-lob-green/10 transition-colors"
            >
              Become an Arbitrator
            </Link>
          </div>
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}
