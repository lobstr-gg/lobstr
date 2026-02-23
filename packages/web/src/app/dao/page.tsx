"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { formatEther, type Address } from "viem";
import { useReadContracts, useAccount } from "wagmi";
import { stagger, fadeUp, ease } from "@/lib/motion";
import {
  useTreasuryBalance,
  useTreasurySignerCount,
  useTreasuryRequiredApprovals,
  useDelegatee,
  useDelegatorCount,
  useAdminProposalApproval,
  useApproveAdminProposal,
  useExecuteAdminProposal,
  useDelegate,
  useUndelegate,
} from "@/lib/hooks";
import { getContracts, CHAIN, getExplorerUrl } from "@/config/contracts";
import {
  type BountyCategory,
  type BountyStatus,
  type BountyDifficulty,
  formatNumber,
  timeAgo,
} from "./_data/dao-utils";
import { TreasuryGovernorABI } from "@/config/abis";
import {
  FileText,
  Vote,
  CheckCircle2,
  Rocket,
  Shield,
  Landmark,
  Users,
  ArrowRight,
  Clock,
  ExternalLink,
} from "lucide-react";
import { InfoButton } from "@/components/InfoButton";

/* ── Types ────────────────────────────────────────────────────── */

type TabId = "proposals" | "bounties" | "delegates";

type AdminProposalStatus = "pending" | "approved" | "executed" | "cancelled" | "expired";

interface AdminProposal {
  id: bigint;
  proposer: Address;
  target: Address;
  callData: `0x${string}`;
  description: string;
  status: number;
  approvalCount: bigint;
  createdAt: bigint;
  timelockEnd: bigint;
}

const ADMIN_STATUS_LABELS: Record<number, AdminProposalStatus> = {
  0: "pending",
  1: "approved",
  2: "executed",
  3: "cancelled",
  4: "expired",
};

const ADMIN_STATUS_COLORS: Record<AdminProposalStatus, { bg: string; text: string; dot: string }> = {
  pending: { bg: "bg-yellow-500/10", text: "text-yellow-400", dot: "bg-yellow-400" },
  approved: { bg: "bg-blue-500/10", text: "text-blue-400", dot: "bg-blue-400" },
  executed: { bg: "bg-purple-500/10", text: "text-purple-400", dot: "bg-purple-400" },
  cancelled: { bg: "bg-zinc-500/10", text: "text-zinc-400", dot: "bg-zinc-400" },
  expired: { bg: "bg-red-500/10", text: "text-red-400", dot: "bg-red-400" },
};

/* Known signer addresses */
const KNOWN_SIGNERS: { address: Address; label: string }[] = [
  { address: "0x8a1C742A8A2F4f7C1295443809acE281723650fb", label: "Sentinel (Deployer)" },
  { address: "0xb761530d346D39B2c10B546545c24a0b0a3285D0", label: "Arbiter" },
  { address: "0x443c4ff3CAa0E344b10CA19779B2E8AB1ACcd672", label: "Steward" },
  { address: "0x3F2ABc3BDb1e3e4F0120e560554c3c842286B251", label: "Cruz" },
];

/* Known contract addresses for readable target names */
const TARGET_LABELS: Record<string, string> = {
  "0xd41a40145811915075f6935a4755f8688e53c8db": "ReputationSystem",
  "0xcb7790d3f9b5bfe171eb30c253ab3007d43c441b": "StakingManager",
  "0x0d1d8583561310adeefe18cb3a5729e2666ac14c": "X402CreditFacility",
  "0x576235a56e0e25feb95ea198d017070ad7f78360": "EscrowEngine",
  "0xffbded2dba5e27ad5a56c6d4c401124e942ada04": "DisputeArbitration",
  "0xf5ab9f1a5c6cc60e1a68d50b4c943d72fd97487a": "LoanEngine",
  "0x545a01e48cfb6a76699ef12ec1e998c1a275c84e": "SybilGuard",
  "0xe1d68167a15afa7c4e22df978dc4a66a0b4114fe": "InsurancePool",
  "0x9b7e2b8cf7de5ef1f85038b050952dc1d4596319": "TreasuryGovernor",
};

/* ── Constants ────────────────────────────────────────────────── */

const TABS: { id: TabId; label: string }[] = [
  { id: "proposals", label: "Admin Proposals" },
  { id: "bounties", label: "Bounties" },
  { id: "delegates", label: "Delegates" },
];

const BOUNTY_CATEGORIES: BountyCategory[] = [
  "development", "design", "documentation", "research", "community", "security", "marketing",
];

const BOUNTY_DIFFICULTIES: BountyDifficulty[] = [
  "beginner", "intermediate", "advanced", "expert",
];

/* On-chain BountyStatus enum: Open(0), Claimed(1), Completed(2), Cancelled(3) */
const ONCHAIN_BOUNTY_STATUS: Record<number, string> = {
  0: "open",
  1: "claimed",
  2: "completed",
  3: "cancelled",
};

const ONCHAIN_BOUNTY_STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  open: { bg: "bg-green-500/10", text: "text-green-400", dot: "bg-green-400" },
  claimed: { bg: "bg-yellow-500/10", text: "text-yellow-400", dot: "bg-yellow-400" },
  completed: { bg: "bg-purple-500/10", text: "text-purple-400", dot: "bg-purple-400" },
  cancelled: { bg: "bg-zinc-500/10", text: "text-zinc-400", dot: "bg-zinc-400" },
};

const DIFFICULTY_LABELS: Record<number, string> = {
  0: "beginner",
  1: "intermediate",
  2: "advanced",
  3: "expert",
};

const DIFFICULTY_COLORS: Record<string, string> = {
  beginner: "text-green-400",
  intermediate: "text-yellow-400",
  advanced: "text-orange-400",
  expert: "text-red-400",
};

const PROPOSAL_EXPIRY = 7 * 24 * 60 * 60; // 7 days in seconds
const PROPOSAL_TIMELOCK = 24 * 60 * 60; // 24 hours in seconds

/* ── Scan range for admin proposals ──────────────────────────── */
const SCAN_COUNT = 20;

/* ── useAdminProposals hook ──────────────────────────────────── */

function useAdminProposals(): { proposals: AdminProposal[]; isLoading: boolean } {
  const contracts = getContracts(CHAIN.id);
  const governorAddr = contracts?.treasuryGovernor;

  const calls = Array.from({ length: SCAN_COUNT }, (_, i) => ({
    address: governorAddr as Address,
    abi: TreasuryGovernorABI,
    functionName: "getAdminProposal" as const,
    args: [BigInt(i + 1)],
  }));

  const { data, isLoading } = useReadContracts({
    contracts: calls,
    query: { enabled: !!governorAddr },
  });

  const proposals: AdminProposal[] = [];
  if (data) {
    for (let i = 0; i < data.length; i++) {
      const r = data[i];
      if (r.status === "success" && r.result) {
        const [id, proposer, target, callData, description, status, approvalCount, createdAt, timelockEnd] =
          r.result as [bigint, Address, Address, `0x${string}`, string, number, bigint, bigint, bigint];
        if (id > 0n) {
          proposals.push({ id, proposer, target, callData, description, status, approvalCount, createdAt, timelockEnd });
        }
      }
    }
  }

  return { proposals, isLoading };
}

/* ── Bounty types & hook ────────────────────────────────────── */

interface OnchainBounty {
  id: bigint;
  creator: Address;
  title: string;
  description: string;
  reward: bigint;
  token: Address;
  status: number;
  category: string;
  difficulty: number;
  claimant: Address;
  createdAt: bigint;
  deadline: bigint;
}

const BOUNTY_SCAN_COUNT = 20;

function useBounties(): { bounties: OnchainBounty[]; isLoading: boolean } {
  const contracts = getContracts(CHAIN.id);
  const governorAddr = contracts?.treasuryGovernor;

  const calls = Array.from({ length: BOUNTY_SCAN_COUNT }, (_, i) => ({
    address: governorAddr as Address,
    abi: TreasuryGovernorABI,
    functionName: "getBounty" as const,
    args: [BigInt(i + 1)],
  }));

  const { data, isLoading } = useReadContracts({
    contracts: calls,
    query: { enabled: !!governorAddr },
  });

  const bounties: OnchainBounty[] = [];
  if (data) {
    for (let i = 0; i < data.length; i++) {
      const r = data[i];
      if (r.status === "success" && r.result) {
        const d = r.result as any;
        const id = d.id ?? d[0];
        if (id > 0n) {
          bounties.push({
            id,
            creator: d.creator ?? d[1],
            title: d.title ?? d[2],
            description: d.description ?? d[3],
            reward: d.reward ?? d[4],
            token: d.token ?? d[5],
            status: Number(d.status ?? d[6]),
            category: d.category ?? d[7],
            difficulty: Number(d.difficulty ?? d[8]),
            claimant: d.claimant ?? d[9],
            createdAt: d.createdAt ?? d[10],
            deadline: d.deadline ?? d[11],
          });
        }
      }
    }
  }

  return { bounties, isLoading };
}

/* ── Bounty Card ───────────────────────────────────────────── */

function BountyCard({ bounty }: { bounty: OnchainBounty }) {
  const statusLabel = ONCHAIN_BOUNTY_STATUS[bounty.status] ?? "open";
  const statusColors = ONCHAIN_BOUNTY_STATUS_COLORS[statusLabel] ?? ONCHAIN_BOUNTY_STATUS_COLORS.open;
  const diffLabel = DIFFICULTY_LABELS[bounty.difficulty] ?? "beginner";
  const diffColor = DIFFICULTY_COLORS[diffLabel] ?? "text-green-400";
  const now = BigInt(Math.floor(Date.now() / 1000));
  const isExpired = bounty.deadline > 0n && now > bounty.deadline && statusLabel === "open";

  const creatorLabel = KNOWN_SIGNERS.find(
    s => s.address.toLowerCase() === bounty.creator.toLowerCase()
  )?.label ?? `${bounty.creator.slice(0, 6)}...${bounty.creator.slice(-4)}`;

  return (
    <motion.div
      className="border border-border/50 rounded-lg p-4 hover:border-lob-green/20 transition-colors"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] text-text-tertiary font-mono">#{String(bounty.id)}</span>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
            isExpired ? ONCHAIN_BOUNTY_STATUS_COLORS.cancelled.bg + " " + ONCHAIN_BOUNTY_STATUS_COLORS.cancelled.text
              : statusColors.bg + " " + statusColors.text
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isExpired ? ONCHAIN_BOUNTY_STATUS_COLORS.cancelled.dot : statusColors.dot}`} />
            {isExpired ? "Expired" : statusLabel.charAt(0).toUpperCase() + statusLabel.slice(1)}
          </span>
          <span className={`text-[10px] font-medium ${diffColor}`}>
            {diffLabel.charAt(0).toUpperCase() + diffLabel.slice(1)}
          </span>
        </div>
        <span className="text-xs font-bold text-lob-green tabular-nums shrink-0">
          {formatNumber(Number(formatEther(bounty.reward)))} LOB
        </span>
      </div>

      <p className="text-xs text-text-primary font-medium mb-1 leading-relaxed">
        {bounty.title}
      </p>
      {bounty.description && (
        <p className="text-[10px] text-text-tertiary mb-2 line-clamp-2">
          {bounty.description}
        </p>
      )}

      <div className="flex items-center gap-3 text-[10px] text-text-tertiary">
        <span className="px-1.5 py-0.5 rounded bg-surface-2">{bounty.category}</span>
        <span>by {creatorLabel}</span>
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {timeAgo(Number(bounty.createdAt) * 1000)}
        </span>
        {bounty.deadline > 0n && !isExpired && (
          <span className="text-yellow-400">
            Deadline: {new Date(Number(bounty.deadline) * 1000).toLocaleDateString()}
          </span>
        )}
        {bounty.claimant !== "0x0000000000000000000000000000000000000000" && (
          <span className="text-blue-400">
            Claimed by {bounty.claimant.slice(0, 6)}...{bounty.claimant.slice(-4)}
          </span>
        )}
      </div>
    </motion.div>
  );
}

/* ── Admin Proposal Card ─────────────────────────────────────── */

function AdminProposalCard({ proposal, requiredApprovals }: { proposal: AdminProposal; requiredApprovals: number }) {
  const { address } = useAccount();
  const { data: hasApproved } = useAdminProposalApproval(proposal.id, address);
  const approveProposal = useApproveAdminProposal();
  const executeProposal = useExecuteAdminProposal();

  const statusKey = ADMIN_STATUS_LABELS[proposal.status] ?? "pending";
  const colors = ADMIN_STATUS_COLORS[statusKey];
  const now = BigInt(Math.floor(Date.now() / 1000));
  const isExpired = now > proposal.createdAt + BigInt(PROPOSAL_EXPIRY);
  const timelockPassed = proposal.timelockEnd > 0n && now >= proposal.timelockEnd;

  const effectiveStatus = isExpired && (statusKey === "pending" || statusKey === "approved")
    ? "expired" : statusKey;
  const effectiveColors = ADMIN_STATUS_COLORS[effectiveStatus];

  const targetLabel = TARGET_LABELS[proposal.target.toLowerCase()] ?? `${proposal.target.slice(0, 8)}...`;
  const proposerLabel = KNOWN_SIGNERS.find(
    s => s.address.toLowerCase() === proposal.proposer.toLowerCase()
  )?.label ?? `${proposal.proposer.slice(0, 6)}...${proposal.proposer.slice(-4)}`;

  const canApprove = effectiveStatus === "pending" && address && !hasApproved;
  const canExecute = effectiveStatus === "approved" && timelockPassed && !isExpired;

  return (
    <motion.div
      className="border border-border/50 rounded-lg p-4 hover:border-lob-green/20 transition-colors"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] text-text-tertiary font-mono">#{String(proposal.id)}</span>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${effectiveColors.bg} ${effectiveColors.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${effectiveColors.dot}`} />
            {effectiveStatus.charAt(0).toUpperCase() + effectiveStatus.slice(1)}
          </span>
          <span className="text-[10px] text-text-tertiary px-1.5 py-0.5 rounded bg-surface-2 font-mono">
            {targetLabel}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] text-text-tertiary tabular-nums">
            {Number(proposal.approvalCount)}/{requiredApprovals}
          </span>
          <div className="flex -space-x-1">
            {Array.from({ length: requiredApprovals }, (_, i) => (
              <div
                key={i}
                className={`w-4 h-4 rounded-full border border-surface-1 ${
                  i < Number(proposal.approvalCount)
                    ? "bg-lob-green/30"
                    : "bg-surface-3"
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      <p className="text-xs text-text-primary font-medium mb-1.5 leading-relaxed">
        {proposal.description}
      </p>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-[10px] text-text-tertiary">
          <span>by {proposerLabel}</span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {timeAgo(Number(proposal.createdAt) * 1000)}
          </span>
          {effectiveStatus === "approved" && !timelockPassed && (
            <span className="text-blue-400">
              Timelock: {Math.ceil((Number(proposal.timelockEnd) - Number(now)) / 3600)}h left
            </span>
          )}
        </div>

        <div className="flex gap-1.5">
          {canApprove && (
            <motion.button
              className="btn-primary text-[10px] px-2.5 py-1"
              whileTap={{ scale: 0.95 }}
              onClick={() => approveProposal(proposal.id)}
            >
              Approve
            </motion.button>
          )}
          {canExecute && (
            <motion.button
              className="btn-primary text-[10px] px-2.5 py-1"
              whileTap={{ scale: 0.95 }}
              onClick={() => executeProposal(proposal.id)}
            >
              Execute
            </motion.button>
          )}
          {hasApproved && effectiveStatus === "pending" && (
            <span className="text-[10px] text-lob-green/60 px-2 py-1">Approved</span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/* ── Governance Stats Component ───────────────────────────────── */

function GovernanceStats({ proposalCount, pendingCount, openBounties }: { proposalCount: number; pendingCount: number; openBounties: number }) {
  const contracts = getContracts(CHAIN.id);
  const { data: lobBalance } = useTreasuryBalance(contracts?.lobToken);
  const { data: signerCount } = useTreasurySignerCount();
  const { data: requiredApprovals } = useTreasuryRequiredApprovals();

  const lobBalanceFormatted = lobBalance
    ? formatNumber(Number(formatEther(lobBalance as bigint)))
    : "\u2014";

  const stats = [
    { label: "Pending Proposals", value: String(pendingCount) },
    { label: "Open Bounties", value: String(openBounties) },
    { label: "Treasury Signers", value: signerCount !== undefined ? String(Number(signerCount)) : "\u2014" },
    { label: "Treasury LOB", value: lobBalanceFormatted },
    { label: "Required Approvals", value: requiredApprovals !== undefined ? String(Number(requiredApprovals)) : "\u2014" },
    { label: "Proposals (All Time)", value: String(proposalCount) },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {stats.map((stat, i) => (
        <motion.div
          key={stat.label}
          className="card p-4 relative overflow-hidden group"
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.1 + i * 0.06, ease }}
          whileHover={{ y: -2, borderColor: "rgba(88,176,89,0.2)" }}
        >
          <motion.div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-lob-green/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <p className="text-[10px] text-text-tertiary uppercase tracking-wider">
            {stat.label}
          </p>
          <motion.p
            className="text-lg font-bold text-text-primary mt-1 tabular-nums"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 + i * 0.08, ease }}
          >
            {stat.value}
          </motion.p>
        </motion.div>
      ))}
    </div>
  );
}

/* ── Governance Process Flow ──────────────────────────────────── */

const GOV_STEPS = [
  { icon: FileText, label: "Create Proposal", desc: "Signer submits on-chain" },
  { icon: Vote, label: "Multisig Approval", desc: "3-of-4 signers approve" },
  { icon: Clock, label: "24h Timelock", desc: "Cooldown before execution" },
  { icon: Rocket, label: "Execution", desc: "Anyone executes on-chain" },
];

function GovernanceFlow() {
  return (
    <div className="card p-5 overflow-hidden">
      <div className="flex items-center gap-2 mb-4">
        <Shield className="w-4 h-4 text-lob-green" />
        <h3 className="text-xs font-semibold text-text-primary uppercase tracking-wider">
          Governance Process
        </h3>
        <InfoButton infoKey="dao.governanceProcess" />
      </div>
      <div className="flex items-start justify-between gap-2">
        {GOV_STEPS.map((step, i) => (
          <div key={step.label} className="flex items-start flex-1 min-w-0">
            <motion.div
              className="flex flex-col items-center text-center flex-1"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 + i * 0.1, ease }}
            >
              <motion.div
                className="w-10 h-10 rounded-lg bg-lob-green-muted border border-lob-green/20 flex items-center justify-center mb-2"
                whileHover={{ scale: 1.1, borderColor: "rgba(88,176,89,0.4)" }}
              >
                <step.icon className="w-4.5 h-4.5 text-lob-green" />
              </motion.div>
              <p className="text-[11px] font-semibold text-text-primary leading-tight">
                {step.label}
              </p>
              <p className="text-[9px] text-text-tertiary mt-0.5 leading-tight">
                {step.desc}
              </p>
            </motion.div>
            {i < GOV_STEPS.length - 1 && (
              <div className="flex items-center pt-4 px-1 shrink-0">
                <div className="w-4 sm:w-6 border-t border-dashed border-lob-green/30 relative">
                  <motion.div
                    className="absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-lob-green/60"
                    initial={{ left: "0%" }}
                    animate={{ left: "100%" }}
                    transition={{
                      duration: 1,
                      delay: 0.5 + i * 0.3,
                      repeat: Infinity,
                      repeatDelay: 3,
                      ease: "easeInOut",
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Treasury Donut (SVG, no library) ────────────────────────── */

function TreasuryDonut({ lobBalance, isLoading }: { lobBalance: number; isLoading: boolean }) {
  const contracts = getContracts(CHAIN.id);
  const TOTAL_SUPPLY = 1_000_000_000;
  const treasuryPct = TOTAL_SUPPLY > 0 ? (lobBalance / TOTAL_SUPPLY) * 100 : 0;
  const circumference = 2 * Math.PI * 45;
  const treasuryDash = (treasuryPct / 100) * circumference;
  const remainDash = circumference - treasuryDash;

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Landmark className="w-4 h-4 text-lob-green" />
        <h3 className="text-xs font-semibold text-text-primary uppercase tracking-wider">
          Treasury Allocation
        </h3>
        <InfoButton infoKey="dao.treasuryAllocation" />
      </div>
      <div className="flex items-center gap-6">
        <div className="relative w-28 h-28 shrink-0">
          <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
            <circle cx="50" cy="50" r="45" fill="none" stroke="#1E2431" strokeWidth="8" />
            {!isLoading && (
              <motion.circle
                cx="50" cy="50" r="45"
                fill="none" stroke="#58B059" strokeWidth="8" strokeLinecap="round"
                strokeDasharray={`${treasuryDash} ${remainDash}`}
                initial={{ strokeDashoffset: circumference }}
                animate={{ strokeDashoffset: 0 }}
                transition={{ duration: 1.2, delay: 0.3, ease }}
              />
            )}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-sm font-bold text-text-primary tabular-nums">
              {isLoading ? "..." : `${treasuryPct.toFixed(1)}%`}
            </span>
            <span className="text-[8px] text-text-tertiary uppercase">of supply</span>
          </div>
        </div>
        <div className="flex flex-col gap-2 min-w-0">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-lob-green shrink-0" />
            <span className="text-[11px] text-text-secondary">Treasury</span>
            <span className="text-[11px] font-bold text-text-primary tabular-nums ml-auto">
              {isLoading ? "..." : formatNumber(lobBalance)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-surface-4 shrink-0" />
            <span className="text-[11px] text-text-secondary">Other</span>
            <span className="text-[11px] font-bold text-text-primary tabular-nums ml-auto">
              {isLoading ? "..." : formatNumber(TOTAL_SUPPLY - lobBalance)}
            </span>
          </div>
          <a
            href={getExplorerUrl("address", contracts?.treasuryGovernor ?? "")}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[10px] text-lob-green hover:underline mt-1"
          >
            View on Basescan <ArrowRight className="w-2.5 h-2.5" />
          </a>
        </div>
      </div>
    </div>
  );
}

/* ── Multisig Signers Visual ─────────────────────────────────── */

function SignersVisual({ signerCount, requiredApprovals }: { signerCount: number; requiredApprovals: number }) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Users className="w-4 h-4 text-lob-green" />
        <h3 className="text-xs font-semibold text-text-primary uppercase tracking-wider">
          Multisig Security
        </h3>
        <InfoButton infoKey="dao.multisig" />
      </div>
      <div className="flex items-center gap-3 mb-3">
        <div className="flex -space-x-2">
          {KNOWN_SIGNERS.map((signer, i) => (
            <motion.div
              key={signer.address}
              className={`w-8 h-8 rounded-full border-2 border-surface-1 flex items-center justify-center text-[9px] font-bold ${
                i < requiredApprovals
                  ? "bg-lob-green/20 text-lob-green"
                  : "bg-surface-3 text-text-tertiary"
              }`}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.1 + i * 0.08 }}
              title={`${signer.label} (${signer.address.slice(0, 6)}...${signer.address.slice(-4)})`}
            >
              {signer.label.charAt(0)}
            </motion.div>
          ))}
        </div>
        <div className="text-xs text-text-secondary">
          <span className="font-bold text-lob-green">{requiredApprovals}</span>
          <span className="text-text-tertiary"> of </span>
          <span className="font-bold text-text-primary">{signerCount}</span>
          <span className="text-text-tertiary"> required</span>
        </div>
      </div>
      <div className="h-2 rounded-full bg-surface-3 overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-lob-green"
          initial={{ width: 0 }}
          animate={{ width: `${(requiredApprovals / Math.max(signerCount, 1)) * 100}%` }}
          transition={{ duration: 0.8, delay: 0.5, ease }}
        />
      </div>
      <p className="text-[10px] text-text-tertiary mt-2">
        {requiredApprovals}-of-{signerCount} multisig protects treasury funds
      </p>
    </div>
  );
}

/* ── Filter Pill Component ────────────────────────────────────── */

function FilterPill({
  label,
  active,
  onClick,
  count,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all duration-150 ${
        active
          ? "bg-lob-green/10 text-lob-green border border-lob-green/30"
          : "bg-surface-2 text-text-tertiary border border-transparent hover:text-text-secondary hover:bg-surface-3"
      }`}
    >
      {label}
      {count !== undefined && (
        <span className={`tabular-nums ${active ? "text-lob-green/70" : "text-text-tertiary/60"}`}>
          {count}
        </span>
      )}
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════ */
/* ── MAIN PAGE COMPONENT ─────────────────────────────────────── */
/* ═══════════════════════════════════════════════════════════════ */

export default function DaoPage() {
  const { address } = useAccount();

  /* ── Contract data ───────────────────────────────────────── */
  const contracts = getContracts(CHAIN.id);
  const { data: lobBalance, isLoading: lobLoading } = useTreasuryBalance(contracts?.lobToken);
  const { data: signerCount } = useTreasurySignerCount();
  const { data: requiredApprovals } = useTreasuryRequiredApprovals();
  const { data: delegatee } = useDelegatee(address);
  const { data: delegatorCount } = useDelegatorCount(address);

  const lobBalanceNum = lobBalance ? Number(formatEther(lobBalance as bigint)) : 0;
  const signerCountNum = signerCount !== undefined ? Number(signerCount) : 0;
  const requiredApprovalsNum = requiredApprovals !== undefined ? Number(requiredApprovals) : 0;

  /* ── Admin proposals ────────────────────────────────────── */
  const { proposals, isLoading: proposalsLoading } = useAdminProposals();
  const pendingProposals = proposals.filter(p => p.status === 0);

  /* ── Bounties ─────────────────────────────────────────── */
  const { bounties, isLoading: bountiesLoading } = useBounties();

  /* ── Delegation ──────────────────────────────────────────── */
  const delegateFn = useDelegate();
  const undelegateFn = useUndelegate();
  const [delegateInput, setDelegateInput] = useState("");

  /* ── Tab state ────────────────────────────────────────────── */
  const [activeTab, setActiveTab] = useState<TabId>("proposals");

  /* ── Proposal status filter ───────────────────────────────── */
  const [proposalStatusFilter, setProposalStatusFilter] = useState<"all" | AdminProposalStatus>("all");

  /* ── Bounty filters ───────────────────────────────────────── */
  const [bountySearch, setBountySearch] = useState("");
  const [bountyCategoryFilter, setBountyCategoryFilter] = useState<"all" | BountyCategory>("all");
  const [bountyStatusFilter, setBountyStatusFilter] = useState<"all" | BountyStatus>("all");
  const [bountyDifficultyFilter, setBountyDifficultyFilter] = useState<"all" | BountyDifficulty>("all");

  /* ── Filter proposals by status ──────────────────────────── */
  const now = Math.floor(Date.now() / 1000);
  const filteredProposals = proposals.filter(p => {
    if (proposalStatusFilter === "all") return true;
    const statusKey = ADMIN_STATUS_LABELS[p.status] ?? "pending";
    const isExpired = now > Number(p.createdAt) + PROPOSAL_EXPIRY;
    const effective = isExpired && (statusKey === "pending" || statusKey === "approved") ? "expired" : statusKey;
    return effective === proposalStatusFilter;
  });

  /* ── Filter bounties ──────────────────────────────────────── */
  const filteredBounties = bounties.filter(b => {
    const statusLabel = ONCHAIN_BOUNTY_STATUS[b.status] ?? "open";
    const diffLabel = DIFFICULTY_LABELS[b.difficulty] ?? "beginner";

    if (bountySearch) {
      const q = bountySearch.toLowerCase();
      if (!b.title.toLowerCase().includes(q) && !b.description.toLowerCase().includes(q)) return false;
    }
    if (bountyCategoryFilter !== "all" && b.category.toLowerCase() !== bountyCategoryFilter) return false;
    if (bountyStatusFilter !== "all" && statusLabel !== bountyStatusFilter) return false;
    if (bountyDifficultyFilter !== "all" && diffLabel !== bountyDifficultyFilter) return false;
    return true;
  });

  /* ── Tab counts ───────────────────────────────────────────── */
  const tabCounts: Record<TabId, number> = {
    proposals: proposals.length,
    bounties: bounties.length,
    delegates: signerCountNum,
  };

  /* ── Render ───────────────────────────────────────────────── */
  return (
    <motion.div initial="hidden" animate="show" variants={stagger}>
      {/* ── Header ──────────────────────────────────────────── */}
      <motion.div
        variants={fadeUp}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6"
      >
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-1.5">
            <span className="text-lob-green">Governance</span>
            <InfoButton infoKey="dao.header" />
          </h1>
          <p className="text-xs text-text-tertiary mt-1">
            3-of-4 multisig governance. Create proposals, approve, execute after 24h timelock.
          </p>
        </div>
        <a
          href={getExplorerUrl("address", contracts?.treasuryGovernor ?? "")}
          target="_blank"
          rel="noopener noreferrer"
        >
          <motion.span
            className="btn-secondary inline-flex items-center gap-1.5 text-xs"
            whileHover={{ borderColor: "rgba(88,176,89,0.3)" }}
          >
            <ExternalLink className="w-3 h-3" />
            TreasuryGovernor
          </motion.span>
        </a>
      </motion.div>

      {/* ── Stats ───────────────────────────────────────────── */}
      <motion.div variants={fadeUp} className="mb-6">
        <GovernanceStats
          proposalCount={proposals.length}
          pendingCount={pendingProposals.length}
          openBounties={bounties.filter(b => b.status === 0).length}
        />
      </motion.div>

      {/* ── Layout: Main + Sidebar ──────────────────────────── */}
      <div className="flex flex-col lg:flex-row gap-4">
        {/* Main content area */}
        <div className="flex-1 min-w-0 card p-5">
          {/* ── Tabs ────────────────────────────────────────── */}
          <motion.div
            variants={fadeUp}
            className="flex gap-0.5 mb-6 border-b border-border"
          >
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
                  <span
                    className={`text-[10px] tabular-nums px-1.5 py-0.5 rounded-full ${
                      activeTab === tab.id
                        ? "bg-surface-3 text-text-primary"
                        : "bg-surface-2 text-text-tertiary"
                    }`}
                  >
                    {tabCounts[tab.id]}
                  </span>
                </motion.span>
                {activeTab === tab.id && (
                  <motion.div
                    layoutId="dao-tab"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-lob-green"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
              </button>
            ))}
          </motion.div>

          {/* ── Tab Content ─────────────────────────────────── */}
          <AnimatePresence mode="wait">
            {/* ═══ PROPOSALS TAB ═══ */}
            {activeTab === "proposals" && (
              <motion.div
                key="proposals"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
              >
                {/* Status filter pills */}
                <div className="flex flex-wrap gap-1.5 mb-4">
                  <FilterPill
                    label="All"
                    active={proposalStatusFilter === "all"}
                    onClick={() => setProposalStatusFilter("all")}
                    count={proposals.length}
                  />
                  {(["pending", "approved", "executed", "cancelled"] as AdminProposalStatus[]).map((status) => {
                    const count = proposals.filter(p => {
                      const sk = ADMIN_STATUS_LABELS[p.status] ?? "pending";
                      const expired = now > Number(p.createdAt) + PROPOSAL_EXPIRY;
                      const eff = expired && (sk === "pending" || sk === "approved") ? "expired" : sk;
                      return eff === status;
                    }).length;
                    return (
                      <FilterPill
                        key={status}
                        label={status.charAt(0).toUpperCase() + status.slice(1)}
                        active={proposalStatusFilter === status}
                        onClick={() => setProposalStatusFilter(status)}
                        count={count}
                      />
                    );
                  })}
                </div>

                {/* Proposal list */}
                {proposalsLoading ? (
                  <div className="text-center py-12">
                    <span className="text-xs text-text-tertiary animate-pulse">Loading proposals...</span>
                  </div>
                ) : filteredProposals.length > 0 ? (
                  <div className="space-y-3">
                    {filteredProposals
                      .sort((a, b) => Number(b.id) - Number(a.id))
                      .map((p) => (
                        <AdminProposalCard
                          key={String(p.id)}
                          proposal={p}
                          requiredApprovals={requiredApprovalsNum}
                        />
                      ))}
                  </div>
                ) : (
                  <EmptyState
                    message="No proposals match this filter"
                    action="Try selecting a different status."
                  />
                )}
              </motion.div>
            )}

            {/* ═══ BOUNTIES TAB ═══ */}
            {activeTab === "bounties" && (
              <motion.div
                key="bounties"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
              >
                <div className="space-y-3 mb-4">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        value={bountySearch}
                        onChange={(e) => setBountySearch(e.target.value)}
                        placeholder="Search bounties..."
                        className="input-field pl-8 text-xs"
                      />
                      <svg
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary"
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    <FilterPill label="All" active={bountyCategoryFilter === "all"} onClick={() => setBountyCategoryFilter("all")} count={bounties.length} />
                    {BOUNTY_CATEGORIES.map((cat) => (
                      <FilterPill
                        key={cat}
                        label={cat.charAt(0).toUpperCase() + cat.slice(1)}
                        active={bountyCategoryFilter === cat}
                        onClick={() => setBountyCategoryFilter(cat)}
                        count={bounties.filter(b => b.category.toLowerCase() === cat).length}
                      />
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    <FilterPill label="All Status" active={bountyStatusFilter === "all"} onClick={() => setBountyStatusFilter("all")} />
                    {(["open", "claimed", "completed"] as BountyStatus[]).map((status) => (
                      <FilterPill
                        key={status}
                        label={status.charAt(0).toUpperCase() + status.slice(1)}
                        active={bountyStatusFilter === status}
                        onClick={() => setBountyStatusFilter(status)}
                      />
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    <FilterPill label="All Difficulty" active={bountyDifficultyFilter === "all"} onClick={() => setBountyDifficultyFilter("all")} />
                    {BOUNTY_DIFFICULTIES.map((diff) => (
                      <FilterPill
                        key={diff}
                        label={diff.charAt(0).toUpperCase() + diff.slice(1)}
                        active={bountyDifficultyFilter === diff}
                        onClick={() => setBountyDifficultyFilter(diff)}
                      />
                    ))}
                  </div>
                </div>

                {bountiesLoading ? (
                  <div className="text-center py-12">
                    <span className="text-xs text-text-tertiary animate-pulse">Loading bounties...</span>
                  </div>
                ) : filteredBounties.length > 0 ? (
                  <div className="space-y-3">
                    {filteredBounties
                      .sort((a, b) => Number(b.id) - Number(a.id))
                      .map((b) => (
                        <BountyCard key={String(b.id)} bounty={b} />
                      ))}
                  </div>
                ) : (
                  <EmptyState
                    message={bounties.length > 0 ? "No bounties match this filter" : "No bounties yet"}
                    action={bounties.length > 0 ? "Try a different filter." : "Bounties will appear here once created on-chain."}
                  />
                )}
              </motion.div>
            )}

            {/* ═══ DELEGATES TAB ═══ */}
            {activeTab === "delegates" && (
              <motion.div
                key="delegates"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
              >
                {/* Your Delegation card */}
                <div className="card p-4 mb-4">
                  <div className="flex flex-col gap-3">
                    <div>
                      <h3 className="text-xs font-semibold text-text-primary uppercase tracking-wider mb-1">
                        Your Delegation
                      </h3>
                      {!address ? (
                        <p className="text-xs text-text-tertiary">Connect wallet to manage delegation</p>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs">
                          <div>
                            <span className="text-text-tertiary">Delegate: </span>
                            <span className="text-text-secondary font-mono">
                              {delegatee && delegatee !== "0x0000000000000000000000000000000000000000"
                                ? (() => {
                                    const known = KNOWN_SIGNERS.find(s => s.address.toLowerCase() === String(delegatee).toLowerCase());
                                    return known ? known.label : `${String(delegatee).slice(0, 6)}...${String(delegatee).slice(-4)}`;
                                  })()
                                : "Not delegated"}
                            </span>
                          </div>
                          <div>
                            <span className="text-text-tertiary">Delegators to you: </span>
                            <span className="text-text-primary font-medium tabular-nums">
                              {delegatorCount !== undefined ? String(Number(delegatorCount)) : "0"}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                    {address && (
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="text"
                          value={delegateInput}
                          onChange={(e) => setDelegateInput(e.target.value)}
                          placeholder="0x... address to delegate to"
                          className="input-field text-xs flex-1 font-mono"
                        />
                        <div className="flex gap-2">
                          <motion.button
                            className="btn-primary text-xs"
                            whileTap={{ scale: 0.97 }}
                            onClick={() => {
                              if (delegateInput.startsWith("0x") && delegateInput.length === 42) {
                                delegateFn(delegateInput as `0x${string}`);
                              }
                            }}
                          >
                            Delegate
                          </motion.button>
                          <motion.button
                            className="btn-secondary text-xs"
                            whileTap={{ scale: 0.97 }}
                            onClick={() => undelegateFn()}
                          >
                            Undelegate
                          </motion.button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Signers info */}
                <div className="card p-4 mb-4">
                  <h3 className="text-xs font-semibold text-text-primary uppercase tracking-wider mb-3">
                    Treasury Governance
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                    <div className="bg-surface-2 rounded px-3 py-2">
                      <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Total Signers</p>
                      <p className="text-lg font-bold text-text-primary tabular-nums mt-0.5">
                        {signerCount !== undefined ? String(Number(signerCount)) : "\u2014"}
                      </p>
                    </div>
                    <div className="bg-surface-2 rounded px-3 py-2">
                      <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Required Approvals</p>
                      <p className="text-lg font-bold text-text-primary tabular-nums mt-0.5">
                        {requiredApprovals !== undefined ? String(Number(requiredApprovals)) : "\u2014"}
                      </p>
                    </div>
                  </div>

                  {/* Signer list */}
                  <h4 className="text-[10px] text-text-tertiary uppercase tracking-wider mb-2">Multisig Signers</h4>
                  <div className="space-y-2">
                    {KNOWN_SIGNERS.map((signer) => (
                      <div key={signer.address} className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-lob-green/15 flex items-center justify-center text-[9px] font-bold text-lob-green">
                            {signer.label.charAt(0)}
                          </div>
                          <div>
                            <p className="text-xs font-medium text-text-primary">{signer.label}</p>
                            <p className="text-[10px] text-text-tertiary font-mono">
                              {signer.address.slice(0, 6)}...{signer.address.slice(-4)}
                            </p>
                          </div>
                        </div>
                        <a
                          href={getExplorerUrl("address", signer.address)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-lob-green hover:underline"
                        >
                          View
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Sidebar ─────────────────────────────────────────── */}
        <motion.div variants={fadeUp} className="w-full lg:w-72 flex-shrink-0">
          <div className="lg:sticky lg:top-20 space-y-3">
            <TreasuryDonut lobBalance={lobBalanceNum} isLoading={lobLoading} />
            {signerCountNum > 0 && (
              <SignersVisual signerCount={signerCountNum} requiredApprovals={requiredApprovalsNum} />
            )}

            {/* Quick links */}
            <div className="card p-4">
              <h3 className="text-xs font-semibold text-text-primary uppercase tracking-wider mb-3 flex items-center gap-1.5">
                Quick Links
                <InfoButton infoKey="dao.quickLinks" />
              </h3>
              <div className="space-y-2">
                {[
                  { label: "Governance Docs", href: "/docs" },
                  { label: "Forum: Governance", href: "/forum/governance" },
                  { label: "Analytics", href: "/analytics" },
                ].map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="flex items-center justify-between text-xs text-text-secondary hover:text-lob-green transition-colors py-1"
                  >
                    <span>{link.label}</span>
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* ── Governance Flow ───────────────────────────────────── */}
      <motion.div variants={fadeUp} className="mt-6">
        <GovernanceFlow />
      </motion.div>
    </motion.div>
  );
}

/* ── Empty State ──────────────────────────────────────────────── */

function EmptyState({
  message,
  action,
}: {
  message: string;
  action: React.ReactNode;
}) {
  return (
    <div className="text-center py-16 px-4 border border-border/30 rounded-lg bg-surface-1/30">
      <motion.div
        className="w-10 h-10 rounded-full border border-border mx-auto mb-4 flex items-center justify-center"
        animate={{ rotate: [0, 360] }}
        transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
      >
        <div className="w-1.5 h-1.5 rounded-full bg-lob-green/30" />
      </motion.div>
      <p className="text-sm text-text-secondary">{message}</p>
      <p className="text-xs text-text-tertiary mt-1">{action}</p>
    </div>
  );
}
