"use client";

import { motion } from "framer-motion";
import { fadeUp, stagger, ease } from "@/lib/motion";
import type { Proposal, TreasuryAsset } from "../_data/dao-utils";
import { formatNumber, formatUSD } from "../_data/dao-utils";

interface GovernanceStatsProps {
  proposals: Proposal[];
  treasury: TreasuryAsset[];
}

export default function GovernanceStats({
  proposals,
  treasury,
}: GovernanceStatsProps) {
  const activeCount = proposals.filter((p) => p.status === "active").length;

  const votedProposals = proposals.filter((p) => p.status !== "pending");
  const avgParticipation =
    votedProposals.length > 0
      ? Math.round(
          votedProposals.reduce((sum, p) => sum + p.totalVoters, 0) /
            votedProposals.length
        )
      : 0;

  const treasuryValue = treasury.reduce((sum, a) => sum + a.valueUSD, 0);

  const passedCount = proposals.filter(
    (p) => p.status === "passed" || p.status === "executed"
  ).length;

  const stats = [
    { label: "Active Proposals", value: activeCount.toString() },
    { label: "Avg Participation", value: formatNumber(avgParticipation) },
    { label: "Treasury Value", value: formatUSD(treasuryValue) },
    { label: "Proposals Passed", value: passedCount.toString() },
  ];

  return (
    <motion.div
      className="grid grid-cols-2 lg:grid-cols-4 gap-3"
      variants={stagger}
      initial="hidden"
      animate="show"
    >
      {stats.map((stat) => (
        <motion.div
          key={stat.label}
          variants={fadeUp}
          className="card p-4 relative overflow-hidden group/stat"
        >
          {/* Subtle gradient hover overlay */}
          <motion.div
            className="absolute inset-0 bg-gradient-to-br from-lob-green/5 to-transparent opacity-0 group-hover/stat:opacity-100 transition-opacity duration-300"
            aria-hidden
          />

          <div className="relative z-10">
            <p className="text-xl font-bold text-text-primary tabular-nums">
              {stat.value}
            </p>
            <p className="text-[10px] text-text-tertiary uppercase tracking-wider mt-1">
              {stat.label}
            </p>
          </div>
        </motion.div>
      ))}
    </motion.div>
  );
}
