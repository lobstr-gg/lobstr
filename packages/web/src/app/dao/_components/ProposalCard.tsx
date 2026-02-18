"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ease } from "@/lib/motion";
import type { Proposal } from "../_data/dao-utils";
import {
  STATUS_COLORS,
  TYPE_LABELS,
  formatNumber,
  timeUntil,
} from "../_data/dao-utils";
import VoteBar from "./VoteBar";

export default function ProposalCard({ proposal }: { proposal: Proposal }) {
  const statusColor = STATUS_COLORS[proposal.status];
  const typeLabel = TYPE_LABELS[proposal.type];
  const totalVotes = proposal.forVotes + proposal.againstVotes + proposal.abstainVotes;
  const quorumMet = totalVotes >= proposal.quorum;

  return (
    <motion.div
      className="card group p-4 flex flex-col"
      whileHover={{ y: -3, borderColor: "rgba(0,214,114,0.15)" }}
      transition={{ duration: 0.2, ease }}
    >
      <Link
        href={`/dao/proposal/${proposal.id}`}
        className="flex flex-col flex-1"
      >
        {/* Header: Status + Type */}
        <div className="flex items-center gap-2 mb-3">
          <div className="flex items-center gap-1.5">
            <span
              className={`w-1.5 h-1.5 rounded-full ${statusColor.dot}`}
            />
            <span
              className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${statusColor.bg} ${statusColor.text}`}
            >
              {proposal.status}
            </span>
          </div>

          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-[10px] font-mono text-text-tertiary">
              {proposal.id}
            </span>
            <span
              className={`text-[10px] font-medium ${typeLabel.color}`}
            >
              {typeLabel.label}
            </span>
          </div>
        </div>

        {/* Title */}
        <h3 className="text-sm font-medium text-text-primary group-hover:text-lob-green transition-colors mb-1.5 line-clamp-2">
          {proposal.title}
        </h3>

        {/* Description */}
        <p className="text-xs text-text-tertiary line-clamp-2 mb-3 flex-1">
          {proposal.description}
        </p>

        {/* Vote Progress Bar */}
        <VoteBar
          forVotes={proposal.forVotes}
          againstVotes={proposal.againstVotes}
          abstainVotes={proposal.abstainVotes}
          quorum={proposal.quorum}
          className="mb-3"
        />

        {/* Stats row */}
        <div className="flex items-center gap-3 text-[10px] text-text-tertiary mb-3">
          <span>{formatNumber(proposal.totalVoters)} voters</span>
          <span
            className={quorumMet ? "text-green-400" : "text-yellow-400"}
          >
            Quorum {quorumMet ? "met" : "unmet"}
          </span>
          <span className="ml-auto">
            {proposal.status === "active" || proposal.status === "pending"
              ? timeUntil(proposal.votingEndsAt)
              : "Ended"}
          </span>
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-1">
          {proposal.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="text-[10px] text-text-tertiary bg-surface-2 px-1.5 py-0.5 rounded"
            >
              {tag}
            </span>
          ))}
        </div>
      </Link>
    </motion.div>
  );
}
