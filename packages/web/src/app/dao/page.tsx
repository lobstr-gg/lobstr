"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { formatEther } from "viem";
import { stagger, fadeUp, ease } from "@/lib/motion";
import {
  useTreasuryBalance,
  useTreasurySignerCount,
  useTreasuryRequiredApprovals,
  useDelegatee,
  useDelegatorCount,
} from "@/lib/hooks";
import { getContracts, CHAIN, getExplorerUrl } from "@/config/contracts";
import {
  type ProposalType,
  type ProposalStatus,
  type BountyCategory,
  type BountyStatus,
  type BountyDifficulty,
  TYPE_LABELS,
  formatNumber,
} from "./_data/dao-utils";
import { useAccount } from "wagmi";
import {
  FileText,
  Vote,
  CheckCircle2,
  Rocket,
  Shield,
  Landmark,
  Users,
  ArrowRight,
} from "lucide-react";
import { InfoButton } from "@/components/InfoButton";

/* ── Types ────────────────────────────────────────────────────── */

type TabId = "proposals" | "bounties" | "delegates";

type ProposalSort = "newest" | "most_votes" | "ending_soon";
type BountySort = "newest" | "highest_reward" | "ending_soon";

/* ── Constants ────────────────────────────────────────────────── */

const TABS: { id: TabId; label: string }[] = [
  { id: "proposals", label: "Proposals" },
  { id: "bounties", label: "Bounties" },
  { id: "delegates", label: "Delegates" },
];

const PROPOSAL_TYPES: ProposalType[] = [
  "parameter",
  "treasury",
  "upgrade",
  "social",
  "emergency",
];

const PROPOSAL_STATUSES: ProposalStatus[] = [
  "active",
  "pending",
  "passed",
  "failed",
  "executed",
  "cancelled",
];

const BOUNTY_CATEGORIES: BountyCategory[] = [
  "development",
  "design",
  "documentation",
  "research",
  "community",
  "security",
  "marketing",
];

const BOUNTY_STATUSES: BountyStatus[] = [
  "open",
  "claimed",
  "in_review",
  "completed",
  "expired",
];

const BOUNTY_DIFFICULTIES: BountyDifficulty[] = [
  "beginner",
  "intermediate",
  "advanced",
  "expert",
];

/* ── Governance Stats Component ───────────────────────────────── */

function GovernanceStats() {
  const contracts = getContracts(CHAIN.id);
  const { data: lobBalance } = useTreasuryBalance(contracts?.lobToken);
  const { data: signerCount } = useTreasurySignerCount();
  const { data: requiredApprovals } = useTreasuryRequiredApprovals();

  const lobBalanceFormatted = lobBalance
    ? formatNumber(Number(formatEther(lobBalance as bigint)))
    : "—";

  const stats = [
    // TODO: Iterate proposals from contract when nextProposalId is available
    { label: "Active Proposals", value: "0" },
    { label: "Open Bounties", value: "0" },
    { label: "Treasury Signers", value: signerCount !== undefined ? String(Number(signerCount)) : "—" },
    {
      label: "Treasury LOB",
      value: lobBalanceFormatted,
    },
    {
      label: "Required Approvals",
      value: requiredApprovals !== undefined ? String(Number(requiredApprovals)) : "—",
    },
    {
      label: "Proposals (All Time)",
      value: "0",
    },
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

/* ── Treasury Overview Component ──────────────────────────────── */

function TreasuryOverview() {
  const contracts = getContracts(CHAIN.id);
  const lobTokenAddress = contracts?.lobToken;
  const { data: lobBalance, isLoading } = useTreasuryBalance(lobTokenAddress);

  const lobBalanceNum = lobBalance
    ? Number(formatEther(lobBalance as bigint))
    : 0;

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-text-primary uppercase tracking-wider flex items-center gap-1.5">
          Treasury
          <InfoButton infoKey="dao.treasury" />
        </h3>
        {isLoading ? (
          <span className="text-xs text-text-tertiary animate-pulse">Loading...</span>
        ) : (
          <span className="text-sm font-bold text-text-primary tabular-nums">
            {formatNumber(lobBalanceNum)} LOB
          </span>
        )}
      </div>

      <div className="space-y-2">
        {/* LOB balance from contract */}
        <div className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-surface-3 flex items-center justify-center text-[9px] font-bold text-text-primary">
              L
            </div>
            <div>
              <p className="text-xs font-medium text-text-primary">
                LOB
              </p>
              <p className="text-[10px] text-text-tertiary tabular-nums">
                {isLoading ? "..." : formatNumber(lobBalanceNum)}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs font-medium text-lob-green tabular-nums">
              {isLoading ? "..." : formatNumber(lobBalanceNum)}
            </p>
          </div>
        </div>
      </div>

      {/* TODO: Add ETH and USDC balance reads when treasury holds multiple tokens */}

      <a
        href={getExplorerUrl("address", contracts?.treasuryGovernor ?? "")}
        target="_blank"
        rel="noopener noreferrer"
        className="block text-center text-[10px] text-lob-green hover:underline mt-3"
      >
        View on Basescan
      </a>
    </div>
  );
}

/* ── Governance Process Flow ──────────────────────────────────── */

const GOV_STEPS = [
  { icon: FileText, label: "Draft Proposal", desc: "Write and submit on-chain" },
  { icon: Vote, label: "Voting Period", desc: "veLOB holders cast votes" },
  { icon: CheckCircle2, label: "Quorum Check", desc: "Meets threshold to pass" },
  { icon: Rocket, label: "Execution", desc: "Multisig executes on-chain" },
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
            {/* Background ring */}
            <circle
              cx="50" cy="50" r="45"
              fill="none"
              stroke="#1E2431"
              strokeWidth="8"
            />
            {/* Treasury slice */}
            {!isLoading && (
              <motion.circle
                cx="50" cy="50" r="45"
                fill="none"
                stroke="#58B059"
                strokeWidth="8"
                strokeLinecap="round"
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
  const signers = Array.from({ length: signerCount }, (_, i) => i);

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
          {signers.map((i) => (
            <motion.div
              key={i}
              className={`w-8 h-8 rounded-full border-2 border-surface-1 flex items-center justify-center text-[9px] font-bold ${
                i < requiredApprovals
                  ? "bg-lob-green/20 text-lob-green"
                  : "bg-surface-3 text-text-tertiary"
              }`}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.1 + i * 0.08 }}
            >
              S{i + 1}
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
        <span
          className={`tabular-nums ${active ? "text-lob-green/70" : "text-text-tertiary/60"}`}
        >
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

  /* ── Tab state ────────────────────────────────────────────── */
  const [activeTab, setActiveTab] = useState<TabId>("proposals");

  /* ── Proposal filters ─────────────────────────────────────── */
  const [proposalSearch, setProposalSearch] = useState("");
  const [proposalTypeFilter, setProposalTypeFilter] = useState<
    "all" | ProposalType
  >("all");
  const [proposalStatusFilter, setProposalStatusFilter] = useState<
    "all" | ProposalStatus
  >("all");
  const [proposalSort, setProposalSort] =
    useState<ProposalSort>("newest");

  /* ── Bounty filters ───────────────────────────────────────── */
  const [bountySearch, setBountySearch] = useState("");
  const [bountyCategoryFilter, setBountyCategoryFilter] = useState<
    "all" | BountyCategory
  >("all");
  const [bountyStatusFilter, setBountyStatusFilter] = useState<
    "all" | BountyStatus
  >("all");
  const [bountyDifficultyFilter, setBountyDifficultyFilter] = useState<
    "all" | BountyDifficulty
  >("all");
  const [bountySort, setBountySort] = useState<BountySort>("newest");

  /* ── Tab counts ───────────────────────────────────────────── */
  // TODO: Iterate proposals from contract when nextProposalId is available
  const tabCounts: Record<TabId, number> = {
    proposals: 0,
    bounties: 0,
    delegates: signerCount !== undefined ? Number(signerCount) : 0,
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
            Shape the protocol. Lock $LOB for veLOB voting power, vote on proposals,
            fund bounties, delegate.
          </p>
        </div>
        <Link href="/dao/create">
          <motion.span
            className="btn-primary inline-flex items-center gap-1.5"
            whileHover={{
              boxShadow: "inset 0 1px 0 rgba(88,176,89,0.12), 0 4px 16px rgba(88,176,89,0.08)",
            }}
            whileTap={{ scale: 0.97 }}
          >
            + Create Proposal
          </motion.span>
        </Link>
      </motion.div>

      {/* ── Stats ───────────────────────────────────────────── */}
      <motion.div variants={fadeUp} className="mb-6">
        <GovernanceStats />
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
                  animate={{
                    color:
                      activeTab === tab.id ? "#EAECEF" : "#5E6673",
                  }}
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
                    transition={{
                      type: "spring",
                      stiffness: 400,
                      damping: 30,
                    }}
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
                {/* Filter bar */}
                <div className="space-y-3 mb-4">
                  {/* Row 1: Search + Type dropdown + Sort */}
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        value={proposalSearch}
                        onChange={(e) =>
                          setProposalSearch(e.target.value)
                        }
                        placeholder="Search proposals..."
                        className="input-field pl-8 text-xs"
                      />
                      <svg
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                        />
                      </svg>
                    </div>
                    <select
                      value={proposalTypeFilter}
                      onChange={(e) =>
                        setProposalTypeFilter(
                          e.target.value as "all" | ProposalType
                        )
                      }
                      className="input-field text-xs w-auto sm:w-40"
                    >
                      <option value="all">All Types</option>
                      {PROPOSAL_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {TYPE_LABELS[type].label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={proposalSort}
                      onChange={(e) =>
                        setProposalSort(
                          e.target.value as ProposalSort
                        )
                      }
                      className="input-field text-xs w-auto sm:w-40"
                    >
                      <option value="newest">Newest</option>
                      <option value="most_votes">Most Votes</option>
                      <option value="ending_soon">
                        Ending Soon
                      </option>
                    </select>
                  </div>

                  {/* Row 2: Status pills */}
                  <div className="flex flex-wrap gap-1.5">
                    <FilterPill
                      label="All"
                      active={proposalStatusFilter === "all"}
                      onClick={() => setProposalStatusFilter("all")}
                      count={0}
                    />
                    {PROPOSAL_STATUSES.map((status) => (
                      <FilterPill
                        key={status}
                        label={
                          status.charAt(0).toUpperCase() +
                          status.slice(1)
                        }
                        active={proposalStatusFilter === status}
                        onClick={() =>
                          setProposalStatusFilter(status)
                        }
                        count={0}
                      />
                    ))}
                  </div>
                </div>

                {/* TODO: Iterate proposals from contract when nextProposalId is available */}
                {/* Empty state for proposals */}
                <EmptyState
                  message="No proposals yet"
                  action={
                    <Link
                      href="/dao/create"
                      className="text-lob-green hover:underline"
                    >
                      Create the first proposal
                    </Link>
                  }
                />
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
                {/* Filter bar */}
                <div className="space-y-3 mb-4">
                  {/* Row 1: Search + Sort + Post Bounty */}
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        value={bountySearch}
                        onChange={(e) =>
                          setBountySearch(e.target.value)
                        }
                        placeholder="Search bounties..."
                        className="input-field pl-8 text-xs"
                      />
                      <svg
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                        />
                      </svg>
                    </div>
                    <select
                      value={bountySort}
                      onChange={(e) =>
                        setBountySort(
                          e.target.value as BountySort
                        )
                      }
                      className="input-field text-xs w-auto sm:w-44"
                    >
                      <option value="newest">Newest</option>
                      <option value="highest_reward">
                        Highest Reward
                      </option>
                      <option value="ending_soon">
                        Ending Soon
                      </option>
                    </select>
                    <motion.span
                      className="btn-primary inline-flex items-center gap-1 text-xs whitespace-nowrap opacity-50 cursor-not-allowed"
                      title="Coming soon — bounties will be available after Phase 2 governance launch"
                    >
                      + Post Bounty
                    </motion.span>
                  </div>

                  {/* Row 2: Category pills */}
                  <div className="flex flex-wrap gap-1.5">
                    <FilterPill
                      label="All"
                      active={bountyCategoryFilter === "all"}
                      onClick={() =>
                        setBountyCategoryFilter("all")
                      }
                    />
                    {BOUNTY_CATEGORIES.map((cat) => (
                      <FilterPill
                        key={cat}
                        label={
                          cat.charAt(0).toUpperCase() + cat.slice(1)
                        }
                        active={bountyCategoryFilter === cat}
                        onClick={() => setBountyCategoryFilter(cat)}
                      />
                    ))}
                  </div>

                  {/* Row 3: Status + Difficulty pills */}
                  <div className="flex flex-wrap gap-1.5 items-center">
                    <span className="text-[10px] text-text-tertiary uppercase tracking-wider mr-1">
                      Status:
                    </span>
                    <FilterPill
                      label="All"
                      active={bountyStatusFilter === "all"}
                      onClick={() => setBountyStatusFilter("all")}
                    />
                    {BOUNTY_STATUSES.map((status) => (
                      <FilterPill
                        key={status}
                        label={
                          status === "in_review"
                            ? "In Review"
                            : status.charAt(0).toUpperCase() +
                              status.slice(1)
                        }
                        active={bountyStatusFilter === status}
                        onClick={() =>
                          setBountyStatusFilter(status)
                        }
                      />
                    ))}

                    <span className="text-border mx-1">|</span>

                    <span className="text-[10px] text-text-tertiary uppercase tracking-wider mr-1">
                      Level:
                    </span>
                    <FilterPill
                      label="All"
                      active={bountyDifficultyFilter === "all"}
                      onClick={() =>
                        setBountyDifficultyFilter("all")
                      }
                    />
                    {BOUNTY_DIFFICULTIES.map((diff) => (
                      <FilterPill
                        key={diff}
                        label={
                          diff.charAt(0).toUpperCase() +
                          diff.slice(1)
                        }
                        active={bountyDifficultyFilter === diff}
                        onClick={() =>
                          setBountyDifficultyFilter(diff)
                        }
                      />
                    ))}
                  </div>
                </div>

                {/* TODO: Iterate bounties from contract when nextBountyId is available */}
                {/* Empty state for bounties */}
                <EmptyState
                  message="No bounties yet"
                  action="Bounties will appear here once created on-chain."
                />
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
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <h3 className="text-xs font-semibold text-text-primary uppercase tracking-wider mb-1">
                        Your Delegation
                      </h3>
                      <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs">
                        <div>
                          <span className="text-text-tertiary">
                            Delegate:{" "}
                          </span>
                          <span className="text-text-secondary font-mono">
                            {delegatee &&
                            delegatee !== "0x0000000000000000000000000000000000000000"
                              ? `${String(delegatee).slice(0, 6)}...${String(delegatee).slice(-4)}`
                              : "Not delegated"}
                          </span>
                        </div>
                        <div>
                          <span className="text-text-tertiary">
                            Delegators to you:{" "}
                          </span>
                          <span className="text-text-primary font-medium tabular-nums">
                            {delegatorCount !== undefined
                              ? String(Number(delegatorCount))
                              : "0"}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <motion.button
                        className="btn-primary text-xs"
                        whileHover={{
                          boxShadow:
                            "0 0 20px rgba(88,176,89,0.2)",
                        }}
                        whileTap={{ scale: 0.97 }}
                      >
                        Delegate
                      </motion.button>
                      <motion.button
                        className="btn-secondary text-xs"
                        whileTap={{ scale: 0.97 }}
                      >
                        Undelegate
                      </motion.button>
                    </div>
                  </div>
                </div>

                {/* Signers info */}
                <div className="card p-4 mb-4">
                  <h3 className="text-xs font-semibold text-text-primary uppercase tracking-wider mb-3">
                    Treasury Governance
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="bg-surface-2 rounded px-3 py-2">
                      <p className="text-[10px] text-text-tertiary uppercase tracking-wider">
                        Total Signers
                      </p>
                      <p className="text-lg font-bold text-text-primary tabular-nums mt-0.5">
                        {signerCount !== undefined
                          ? String(Number(signerCount))
                          : "—"}
                      </p>
                    </div>
                    <div className="bg-surface-2 rounded px-3 py-2">
                      <p className="text-[10px] text-text-tertiary uppercase tracking-wider">
                        Required Approvals
                      </p>
                      <p className="text-lg font-bold text-text-primary tabular-nums mt-0.5">
                        {requiredApprovals !== undefined
                          ? String(Number(requiredApprovals))
                          : "—"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Top Delegates heading */}
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold text-text-primary uppercase tracking-wider">
                    Top Delegates
                  </h3>
                  <span className="text-[10px] text-text-tertiary">
                    Ranked by voting power
                  </span>
                </div>

                {/* TODO: Iterate delegates when on-chain delegate enumeration is available */}
                <EmptyState
                  message="No delegates found"
                  action="Delegate data will populate from on-chain once the governance contract is active."
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Sidebar ─────────────────────────────────────────── */}
        <motion.div
          variants={fadeUp}
          className="w-full lg:w-72 flex-shrink-0"
        >
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

      {/* ── Governance Flow — full-width at bottom ───────────── */}
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
        transition={{
          duration: 20,
          repeat: Infinity,
          ease: "linear",
        }}
      >
        <div className="w-1.5 h-1.5 rounded-full bg-lob-green/30" />
      </motion.div>
      <p className="text-sm text-text-secondary">{message}</p>
      <p className="text-xs text-text-tertiary mt-1">{action}</p>
    </div>
  );
}
