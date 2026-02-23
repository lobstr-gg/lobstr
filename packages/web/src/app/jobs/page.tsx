"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { formatEther } from "viem";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useLOBBalance, useStakeTier, useStakeInfo } from "@/lib/hooks";
import { motion, AnimatePresence } from "framer-motion";
import { stagger, fadeUp, ease } from "@/lib/motion";
import dynamic from "next/dynamic";

const EscrowFlowAnimation = dynamic(() => import("@/components/EscrowFlowAnimation"), { ssr: false });
const DashboardWidgets = dynamic(
  () => import("@/components/DashboardWidgets").then((m) => ({
    default: () => {
      const { EarningsChart, JobFunnel, ResponseTimeGauge, StreakCounter } = m;
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <EarningsChart />
          <JobFunnel />
          <ResponseTimeGauge />
          <StreakCounter />
        </div>
      );
    },
  })),
  { ssr: false }
);
const SellerDashboardContent = dynamic(() => import("@/app/seller-dashboard/_components/SellerContent"), { ssr: false });
import { type JobStatus, type JobRole } from "./_data/types";
import JobCard from "./_components/JobCard";
import JobFilterBar, { type SortMode } from "./_components/JobFilterBar";
import { useWalletJobs } from "@/lib/useWalletJobs";

type DashboardView = "jobs" | "selling";
type TabId = JobStatus;
type RoleFilter = "all" | JobRole;

const TABS: { id: TabId; label: string; color: string }[] = [
  { id: "active", label: "Active", color: "rgba(88,176,89,0.8)" },
  { id: "delivered", label: "Pending Review", color: "rgba(240,185,11,0.8)" },
  { id: "completed", label: "Completed", color: "rgba(88,176,89,0.5)" },
  { id: "disputed", label: "Disputed", color: "rgba(255,59,105,0.8)" },
];

const emptyMessages: Record<TabId, { text: string; showCta: boolean }> = {
  active: { text: "No active jobs. Post a job or browse the marketplace.", showCta: true },
  delivered: { text: "No jobs awaiting review.", showCta: false },
  completed: { text: "No completed jobs yet.", showCta: false },
  disputed: { text: "No disputed jobs.", showCta: false },
};

export default function JobsPage() {
  const { isConnected, address } = useAccount();
  const { data: lobBalance } = useLOBBalance(address);
  const { data: stakeTier } = useStakeTier(address);
  const { data: stakeInfo } = useStakeInfo(address);

  const TIER_NAMES = ["None", "Bronze", "Silver", "Gold", "Platinum"];
  const tierName = stakeTier !== undefined ? (TIER_NAMES[Number(stakeTier)] ?? "None") : "—";
  const formattedBalance = lobBalance !== undefined ? Number(formatEther(lobBalance)).toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—";
  const stakedAmount = stakeInfo ? Number(formatEther((stakeInfo as unknown as [bigint, bigint, bigint])[0])) : 0;
  const formattedStaked = stakedAmount > 0 ? stakedAmount.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "0";

  const [dashboardView, setDashboardView] = useState<DashboardView>("jobs");
  const [activeTab, setActiveTab] = useState<TabId>("active");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("newest");

  // Fetch jobs for connected wallet from contract events
  const { jobs } = useWalletJobs(address);

  // Compute stats from live data
  const stats = useMemo(() => {
    const active = jobs.filter((j) => j.status === "active").length;
    const completed = jobs.filter((j) => j.status === "completed").length;
    const totalEarned = jobs
      .filter((j) => j.role === "seller" && j.status === "completed")
      .reduce((sum, j) => sum + j.budget, 0);
    const totalSpent = jobs
      .filter((j) => j.role === "buyer" && j.status === "completed")
      .reduce((sum, j) => sum + j.budget, 0);
    return [
      { label: "Active Jobs", value: String(active) },
      { label: "Completed", value: String(completed) },
      { label: "Total Earned", value: `${totalEarned.toLocaleString()} LOB` },
      { label: "Total Spent", value: `${totalSpent.toLocaleString()} LOB` },
    ];
  }, [jobs]);

  // Tab counts
  const tabCounts = useMemo(() => {
    const counts: Record<TabId, number> = { active: 0, delivered: 0, completed: 0, disputed: 0 };
    for (const job of jobs) counts[job.status]++;
    return counts;
  }, [jobs]);

  // Filtered + sorted jobs
  const filteredJobs = useMemo(() => {
    const q = search.toLowerCase();
    return jobs
      .filter((j) => j.status === activeTab)
      .filter((j) => roleFilter === "all" || j.role === roleFilter)
      .filter(
        (j) =>
          !q ||
          j.title.toLowerCase().includes(q) ||
          j.description.toLowerCase().includes(q) ||
          j.category.toLowerCase().includes(q) ||
          j.tags.some((t) => t.toLowerCase().includes(q))
      )
      .sort((a, b) => {
        if (sortMode === "budget") return b.budget - a.budget;
        if (sortMode === "deadline") return a.deadline - b.deadline;
        return b.postedAt - a.postedAt; // newest
      });
  }, [jobs, activeTab, roleFilter, search, sortMode]);

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
            borderColor: ["rgba(30,36,49,1)", "rgba(88,176,89,0.3)", "rgba(30,36,49,1)"],
          }}
          transition={{ duration: 3, repeat: Infinity }}
        >
          <div className="grid grid-cols-2 gap-1">
            {[...Array(4)].map((_, i) => (
              <motion.div
                key={i}
                className="w-2.5 h-2.5 rounded-sm bg-surface-4"
                animate={{ opacity: [0.3, 0.7, 0.3] }}
                transition={{ duration: 2, delay: i * 0.3, repeat: Infinity }}
              />
            ))}
          </div>
        </motion.div>
        <h1 className="text-xl font-bold text-text-primary">My Jobs</h1>
        <p className="text-sm text-text-secondary">
          Connect your wallet to view your jobs.
        </p>
        <ConnectButton />
      </motion.div>
    );
  }

  return (
    <motion.div initial="hidden" animate="show" variants={stagger}>
      <motion.div variants={fadeUp} className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Dashboard</h1>
          <p className="text-xs text-text-tertiary mt-0.5">
            {dashboardView === "jobs"
              ? "Track your active jobs, deliveries, and disputes"
              : "Manage your skill listings, earnings, and usage"}
          </p>
        </div>
        <div className="flex rounded-md border border-border overflow-hidden">
          {(["jobs", "selling"] as const).map((view) => (
            <button
              key={view}
              onClick={() => setDashboardView(view)}
              className={`relative px-3 py-1.5 text-xs font-medium transition-colors ${
                dashboardView === view
                  ? "bg-lob-green-muted text-lob-green"
                  : "bg-surface-2 text-text-tertiary hover:text-text-secondary"
              } ${view === "selling" ? "border-l border-border" : ""}`}
            >
              {view === "jobs" ? "Jobs" : "Selling"}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Selling view */}
      {dashboardView === "selling" && address && (
        <motion.div variants={fadeUp}>
          <SellerDashboardContent address={address} />
        </motion.div>
      )}

      {/* Jobs view */}
      {dashboardView === "jobs" && <>

      {/* Wallet context */}
      <motion.div variants={fadeUp} className="card p-3 mb-3 flex flex-wrap items-center gap-2 sm:gap-4 text-xs">
        <span className="text-text-secondary">
          Liquid LOB: <span className="text-text-primary font-medium">{formattedBalance}</span>
        </span>
        <span className="text-text-secondary group relative">
          Staked LOB: <span className="text-text-primary font-medium">{formattedStaked}</span>
          <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 rounded bg-surface-3 border border-border text-[10px] text-text-tertiary whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            Staked tokens cannot be transferred. Unstaking has a 7-day cooldown.
          </span>
        </span>
        <span className="text-text-secondary">
          Stake Tier: <span className="text-text-primary font-medium">{tierName}</span>
        </span>
      </motion.div>

      {/* Escrow Flow Overview */}
      <motion.div variants={fadeUp} className="mb-4">
        <EscrowFlowAnimation
          status={
            jobs.some((j) => j.status === "delivered")
              ? "delivered"
              : jobs.some((j) => j.status === "active")
              ? "locked"
              : "pending"
          }
          amount={
            jobs
              .filter((j) => j.status === "active" || j.status === "delivered")
              .reduce((sum, j) => sum + j.budget, 0)
              .toLocaleString() || "0"
          }
          token="LOB"
          compact
        />
      </motion.div>

      {/* Stats */}
      <motion.div variants={fadeUp} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mb-6">
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
            <p className="text-xs text-text-tertiary uppercase tracking-wider">
              {stat.label}
            </p>
            <motion.p
              className="text-xl font-bold text-text-primary mt-1 tabular-nums"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.3 + i * 0.08, ease }}
            >
              {stat.value}
            </motion.p>
          </motion.div>
        ))}
      </motion.div>

      {/* Agent Performance Widgets */}
      <motion.div variants={fadeUp} className="mb-6">
        <DashboardWidgets />
      </motion.div>

      {/* Tabs */}
      <motion.div variants={fadeUp} className="flex gap-0.5 mb-6 border-b border-border overflow-x-auto scrollbar-none">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="relative px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium -mb-px whitespace-nowrap min-h-[44px]"
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
                layoutId="job-tab"
                className="absolute bottom-0 left-0 right-0 h-0.5"
                style={{ background: tab.color }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
          </button>
        ))}
      </motion.div>

      {/* Filter bar */}
      <motion.div variants={fadeUp}>
        <JobFilterBar
          search={search}
          onSearchChange={setSearch}
          roleFilter={roleFilter}
          onRoleFilterChange={setRoleFilter}
          sortMode={sortMode}
          onSortModeChange={setSortMode}
        />
      </motion.div>

      {/* Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`${activeTab}-${roleFilter}-${sortMode}-${search}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25 }}
        >
          {filteredJobs.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredJobs.map((job) => (
                <JobCard key={job.id} job={job} />
              ))}
            </div>
          ) : (
            <div className="card text-center py-16 px-4">
              <motion.div
                className="w-10 h-10 rounded-full border border-border mx-auto mb-4 flex items-center justify-center"
                animate={{ rotate: [0, 360] }}
                transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
              >
                <div className="w-1.5 h-1.5 rounded-full bg-lob-green/30" />
              </motion.div>
              <p className="text-sm text-text-secondary">
                {emptyMessages[activeTab].text}
              </p>
              {emptyMessages[activeTab].showCta && (
                <div className="flex items-center justify-center gap-4 mt-3">
                  <Link
                    href="/post-job"
                    className="text-xs text-lob-green hover:underline"
                  >
                    Post a Job
                  </Link>
                  <span className="text-text-tertiary text-xs">or</span>
                  <Link
                    href="/marketplace"
                    className="text-xs text-lob-green hover:underline"
                  >
                    Browse Marketplace
                  </Link>
                </div>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      </>}
    </motion.div>
  );
}
