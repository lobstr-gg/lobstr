"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ease } from "@/lib/motion";
import SpotlightCard from "@/components/SpotlightCard";
import type { WalletJob } from "../_data/types";
import { EscrowType, getDisputeWindowLabel } from "@/lib/useEscrowUpdates";
import JobLifecycleTimeline from "@/components/JobLifecycleTimeline";

const TIER_COLORS: Record<string, string> = {
  Bronze: "#CD7F32",
  Silver: "#C0C0C0",
  Gold: "#FFD700",
  Platinum: "#E5E4E2",
};

const STATUS_DOT: Record<string, string> = {
  active: "bg-lob-green",
  delivered: "bg-lob-yellow",
  completed: "bg-lob-green/50",
  disputed: "bg-lob-red",
};

function relativeTime(ts: number): string {
  const diff = 1739750400000 - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function ctaLabel(status: WalletJob["status"], role: WalletJob["role"]): string {
  if (status === "delivered" && role === "buyer") return "Review Delivery";
  if (status === "delivered" && role === "seller") return "Awaiting Review";
  if (status === "disputed") return "Open Dispute";
  return "View Details";
}

export default function JobCard({ job }: { job: WalletJob }) {
  const tierColor = TIER_COLORS[job.counterparty.reputationTier] ?? "#848E9C";
  const showProgress = job.status === "active" || job.status === "delivered";
  const progress =
    job.milestonesTotal > 0
      ? (job.milestonesPaid / job.milestonesTotal) * 100
      : 0;

  return (
    <Link href={`/jobs/${job.id}`}>
    <SpotlightCard className="card p-4 flex flex-col group">
    <motion.div
      className="flex flex-col flex-1"
      whileHover={{ y: -3 }}
      transition={{ duration: 0.2, ease }}
    >
      {/* Header: role badge + status dot + time */}
      <div className="flex items-center gap-2 mb-3">
        <span
          className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
            job.role === "buyer"
              ? "bg-blue-500/10 text-blue-400 border border-blue-400/20"
              : "bg-lob-green-muted text-lob-green border border-lob-green/20"
          }`}
        >
          {job.role}
        </span>
        {job.isX402 && (
          <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400 border border-orange-400/20">
            x402
          </span>
        )}
        {job.escrowType === EscrowType.SKILL_PURCHASE && (
          <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-400/20">
            Skill Purchase
          </span>
        )}
        {job.status === "active" ? (
          <motion.span
            className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[job.status]}`}
            animate={{ scale: [1, 1.3, 1], opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          />
        ) : (
          <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[job.status]}`} />
        )}
        <span className="text-[10px] text-text-tertiary ml-auto">
          {relativeTime(job.postedAt)}
        </span>
      </div>

      {/* Title */}
      <h3 className="text-sm font-medium text-text-primary group-hover:text-lob-green transition-colors mb-1.5 line-clamp-2">
        {job.title}
      </h3>

      {/* Description */}
      <p className="text-xs text-text-tertiary line-clamp-2 mb-3 flex-1">
        {job.description}
      </p>

      {/* Counterparty row */}
      <div className="flex items-center gap-2 mb-3">
        <div
          className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
            job.counterparty.providerType === "agent"
              ? "bg-lob-green-muted text-lob-green border border-lob-green/20"
              : "bg-blue-500/10 text-blue-400 border border-blue-400/20"
          }`}
        >
          {job.counterparty.providerType === "agent" ? "A" : "H"}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-text-primary truncate">
            {job.counterparty.name}
          </p>
          <p className="text-[10px] text-text-tertiary font-mono">
            {job.counterparty.address}
          </p>
        </div>
        <span
          className="text-[10px] font-medium px-1.5 py-0.5 rounded"
          style={{
            color: tierColor,
            backgroundColor: `${tierColor}15`,
            border: `1px solid ${tierColor}30`,
          }}
        >
          {job.counterparty.reputationTier}
        </span>
      </div>

      {/* Tags */}
      <div className="flex flex-wrap gap-1 mb-3">
        {job.tags.slice(0, 3).map((tag) => (
          <span
            key={tag}
            className="text-[10px] text-text-tertiary bg-surface-2 px-1.5 py-0.5 rounded"
          >
            {tag}
          </span>
        ))}
      </div>

      {/* Job lifecycle timeline */}
      <div className="mb-3">
        <JobLifecycleTimeline currentStatus={job.status as "created" | "active" | "delivered" | "confirmed" | "disputed" | "resolved"} compact />
      </div>

      {/* Dispute window info */}
      {(job.status === "active" || job.status === "delivered") && (
        <div className="flex items-center gap-1.5 mb-3">
          <span className="text-[10px] text-text-tertiary">
            {getDisputeWindowLabel(job.escrowType ?? 0)}
          </span>
          {job.escrowType === EscrowType.SKILL_PURCHASE && (
            <span className="text-[10px] text-purple-400">
              (no delivery step)
            </span>
          )}
        </div>
      )}

      {/* Milestone progress */}
      {showProgress && (
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-text-tertiary">
              Milestones {job.milestonesPaid}/{job.milestonesTotal}
            </span>
            <span className="text-[10px] text-text-tertiary tabular-nums">
              {Math.round(progress)}%
            </span>
          </div>
          <div className="h-1 rounded-full bg-surface-2 overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-lob-green"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.6, ease }}
            />
          </div>
        </div>
      )}

      {/* Footer: budget + escrow + CTA */}
      <div className="flex items-center justify-between pt-3 border-t border-border/30">
        <div>
          <span
            className={`text-sm font-bold tabular-nums ${
              job.settlementToken === "LOB" ? "text-lob-green" : "text-text-primary"
            }`}
          >
            {job.budget.toLocaleString()}
          </span>
          <span className="text-[10px] text-text-tertiary ml-1">
            {job.settlementToken}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-text-tertiary font-mono">
            {job.escrowId}
          </span>
          <motion.button
            className={`text-[10px] font-medium px-2.5 py-1 rounded transition-colors ${
              job.status === "delivered" && job.role === "buyer"
                ? "bg-lob-green text-black"
                : job.status === "disputed"
                ? "bg-lob-red/10 text-lob-red border border-lob-red/20"
                : "bg-surface-2 text-text-secondary hover:text-text-primary"
            }`}
            whileTap={{ scale: 0.95 }}
          >
            {ctaLabel(job.status, job.role)}
          </motion.button>
        </div>
      </div>
    </motion.div>
    </SpotlightCard>
    </Link>
  );
}
