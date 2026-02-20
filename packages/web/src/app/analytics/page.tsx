"use client";

import Link from "next/link";
import { motion, useSpring, useTransform } from "framer-motion";
import { useEffect, useState } from "react";
import { ease } from "@/lib/motion";
import { useAnalytics } from "@/lib/useAnalytics";
import { LOBSTR_CONTRACTS } from "@/lib/dune";
import {
  BarChart3,
  Copy,
  Check,
  ExternalLink,
  Gift,
  Clock,
  ArrowRight,
  Shield,
  Landmark,
  TrendingUp,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCompact(n: number): string {
  if (n >= 1_000_000)
    return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function daysUntil(ts: number): number {
  const now = Date.now() / 1000;
  const diff = ts - now;
  return Math.max(0, Math.ceil(diff / 86400));
}

// ---------------------------------------------------------------------------
// Animated number
// ---------------------------------------------------------------------------

function AnimatedValue({
  value,
  loading,
  suffix,
  prefix,
}: {
  value: number | null;
  loading: boolean;
  suffix?: string;
  prefix?: string;
}) {
  const spring = useSpring(0, { stiffness: 50, damping: 20 });
  const display = useTransform(spring, (v) => formatCompact(Math.round(v)));

  useEffect(() => {
    if (value != null) spring.set(value);
  }, [value, spring]);

  if (loading) {
    return <div className="h-8 w-20 rounded bg-surface-3 animate-pulse" />;
  }

  if (value == null) {
    return <span className="text-text-tertiary">--</span>;
  }

  return (
    <span>
      {prefix && (
        <span className="text-sm font-normal text-text-tertiary mr-0.5">
          {prefix}
        </span>
      )}
      <motion.span>{display}</motion.span>
      {suffix && (
        <span className="text-sm font-normal text-text-tertiary ml-1">
          {suffix}
        </span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Mini bar chart (pure CSS, no library)
// ---------------------------------------------------------------------------

function MiniBar({
  label,
  value,
  max,
  loading,
  color = "bg-lob-green",
}: {
  label: string;
  value: number | null;
  max: number;
  loading: boolean;
  color?: string;
}) {
  const pct = value != null && max > 0 ? Math.min((value / max) * 100, 100) : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-text-tertiary uppercase tracking-wider">
          {label}
        </span>
        <span className="text-xs font-bold text-text-primary tabular-nums">
          {loading ? "..." : value != null ? formatCompact(value) : "--"}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${color}`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 1, ease }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Contract directory data
// ---------------------------------------------------------------------------

const CONTRACT_INFO: {
  name: string;
  key: keyof typeof LOBSTR_CONTRACTS;
  desc: string;
}[] = [
  {
    name: "$LOB Token",
    key: "LOBToken",
    desc: "ERC-20 governance token with 1B fixed supply",
  },
  {
    name: "Reputation System",
    key: "ReputationSystem",
    desc: "On-chain reputation scoring for providers and buyers",
  },
  {
    name: "Staking Manager",
    key: "StakingManager",
    desc: "Tiered staking for service listing and arbitration rights",
  },
  {
    name: "Treasury Governor",
    key: "TreasuryGovernor",
    desc: "DAO governance for treasury allocation and protocol upgrades",
  },
  {
    name: "Sybil Guard",
    key: "SybilGuard",
    desc: "On-chain sybil detection, reporting, and ban enforcement",
  },
  {
    name: "Service Registry",
    key: "ServiceRegistry",
    desc: "Marketplace listings with metadata, pricing, and search",
  },
  {
    name: "Dispute Arbitration",
    key: "DisputeArbitration",
    desc: "Decentralized dispute resolution with ranked arbitrators",
  },
  {
    name: "Escrow Engine",
    key: "EscrowEngine",
    desc: "Non-custodial escrow for job payments and auto-release",
  },
  {
    name: "Groth16 Verifier",
    key: "Groth16Verifier",
    desc: "ZK proof verification for privacy-preserving attestations",
  },
  {
    name: "Airdrop Claim V2",
    key: "AirdropClaimV2",
    desc: "Merkle-proof airdrop with tiered allocations and claim window",
  },
];

const DUNE_DASHBOARDS = [
  "Staking & SybilGuard",
  "Escrow & Jobs",
  "Disputes",
  "Reputation",
  "Treasury",
  "Airdrop",
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  loading,
  suffix,
  prefix,
  delay,
}: {
  label: string;
  value: number | null;
  loading: boolean;
  suffix?: string;
  prefix?: string;
  delay: number;
}) {
  return (
    <motion.div
      className="rounded-lg border border-border-default bg-surface-1/50 backdrop-blur-sm p-4 text-center"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease }}
    >
      <div className="text-2xl font-bold tabular-nums text-text-primary">
        <AnimatedValue
          value={value}
          loading={loading}
          suffix={suffix}
          prefix={prefix}
        />
      </div>
      <p className="text-[10px] text-text-tertiary mt-1.5 uppercase tracking-wider">
        {label}
      </p>
    </motion.div>
  );
}

function CopyableAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      onClick={copy}
      className="flex items-center gap-1.5 font-mono text-xs text-text-tertiary hover:text-lob-green transition-colors group"
    >
      <span>
        {address.slice(0, 6)}...{address.slice(-4)}
      </span>
      {copied ? (
        <Check className="w-3 h-3 text-lob-green" />
      ) : (
        <Copy className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
      )}
    </button>
  );
}

function ContractCard({
  name,
  desc,
  address,
  delay,
}: {
  name: string;
  desc: string;
  address: string;
  delay: number;
}) {
  return (
    <motion.div
      className="rounded-lg border border-border-default bg-surface-1/50 backdrop-blur-sm p-4 flex flex-col gap-2"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease }}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-text-primary">{name}</h3>
        <a
          href={`https://basescan.org/address/${address}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-text-tertiary hover:text-lob-green transition-colors"
          aria-label={`View ${name} on Basescan`}
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
      <p className="text-[10px] text-text-tertiary leading-relaxed">{desc}</p>
      <CopyableAddress address={address} />
    </motion.div>
  );
}

function SectionLabel({
  children,
  delay,
}: {
  children: React.ReactNode;
  delay: number;
}) {
  return (
    <motion.h2
      className="text-[10px] uppercase tracking-widest text-text-tertiary font-semibold mb-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay }}
    >
      {children}
    </motion.h2>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AnalyticsPage() {
  const { data, isLoading } = useAnalytics();

  const claimedPct =
    data.airdropClaimed != null && data.airdropMaxPool
      ? Math.min((data.airdropClaimed / data.airdropMaxPool) * 100, 100)
      : 0;

  const remaining =
    data.airdropMaxPool != null && data.airdropClaimed != null
      ? data.airdropMaxPool - data.airdropClaimed
      : null;

  const daysLeft =
    data.claimWindowEnd != null ? daysUntil(data.claimWindowEnd) : null;

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-10">
      {/* Page header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease }}
      >
        <div className="flex items-center gap-3 mb-2">
          <div className="w-8 h-8 rounded bg-lob-green-muted flex items-center justify-center border border-lob-green/20">
            <BarChart3 className="w-4 h-4 text-lob-green" />
          </div>
          <h1 className="text-2xl font-bold text-text-primary">Analytics</h1>
          <span className="relative flex h-2 w-2 ml-1">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-lob-green opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-lob-green" />
          </span>
        </div>
        <p className="text-sm text-text-secondary">
          Live on-chain protocol intelligence. All data sourced directly from
          Base mainnet.
        </p>
      </motion.div>

      {/* ─── Section 1: Protocol KPIs ─── */}
      <section>
        <SectionLabel delay={0.2}>Protocol KPIs</SectionLabel>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard
            label="LOB Staked"
            value={data.lobStaked}
            loading={isLoading}
            suffix="LOB"
            delay={0.1}
          />
          <StatCard
            label="Total Jobs"
            value={data.jobs}
            loading={isLoading}
            delay={0.15}
          />
          <StatCard
            label="Services Listed"
            value={data.services}
            loading={isLoading}
            delay={0.2}
          />
          <StatCard
            label="Airdrop Claimed"
            value={data.airdropClaimed}
            loading={isLoading}
            suffix="LOB"
            delay={0.25}
          />
          <StatCard
            label="Wallets"
            value={data.wallets}
            loading={isLoading}
            delay={0.3}
          />
          <StatCard
            label="Sybil Bans"
            value={data.totalBans}
            loading={isLoading}
            delay={0.35}
          />
        </div>
      </section>

      {/* ─── Section 2: Treasury & DAO ─── */}
      <section>
        <SectionLabel delay={0.35}>Treasury &amp; DAO</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Treasury balance card */}
          <motion.div
            className="rounded-lg border border-border-default bg-surface-1/50 backdrop-blur-sm p-5"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4, ease }}
          >
            <div className="flex items-center gap-2 mb-4">
              <Landmark className="w-4 h-4 text-lob-green" />
              <h3 className="text-xs font-semibold text-text-primary">
                Treasury Balance
              </h3>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-secondary">LOB held</span>
                <span className="text-sm font-bold text-text-primary tabular-nums">
                  {isLoading
                    ? "..."
                    : data.treasuryLob != null
                      ? formatCompact(data.treasuryLob)
                      : "--"}{" "}
                  <span className="text-text-tertiary font-normal text-xs">
                    LOB
                  </span>
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-secondary">
                  Seized LOB (from bans)
                </span>
                <span className="text-sm font-bold text-text-primary tabular-nums">
                  {isLoading
                    ? "..."
                    : data.treasurySeizedLob != null
                      ? formatCompact(data.treasurySeizedLob)
                      : "--"}{" "}
                  <span className="text-text-tertiary font-normal text-xs">
                    LOB
                  </span>
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-secondary">
                  Seized USDC (from bans)
                </span>
                <span className="text-sm font-bold text-text-primary tabular-nums">
                  {isLoading
                    ? "..."
                    : data.treasurySeizedUsdc != null
                      ? formatCompact(data.treasurySeizedUsdc)
                      : "--"}{" "}
                  <span className="text-text-tertiary font-normal text-xs">
                    USDC
                  </span>
                </span>
              </div>
            </div>
          </motion.div>

          {/* DAO activity card */}
          <motion.div
            className="rounded-lg border border-border-default bg-surface-1/50 backdrop-blur-sm p-5"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.45, ease }}
          >
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-4 h-4 text-lob-green" />
              <h3 className="text-xs font-semibold text-text-primary">
                DAO Activity
              </h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold tabular-nums text-text-primary">
                  <AnimatedValue
                    value={data.daoBounties}
                    loading={isLoading}
                  />
                </div>
                <p className="text-[10px] text-text-tertiary mt-1 uppercase tracking-wider">
                  Bounties Created
                </p>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold tabular-nums text-text-primary">
                  <AnimatedValue
                    value={data.treasuryLob}
                    loading={isLoading}
                    suffix="LOB"
                  />
                </div>
                <p className="text-[10px] text-text-tertiary mt-1 uppercase tracking-wider">
                  Treasury TVL
                </p>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-border/30">
              <Link
                href="/dao"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-lob-green hover:underline"
              >
                View governance
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ─── Section 3: SybilGuard ─── */}
      <section>
        <SectionLabel delay={0.45}>SybilGuard</SectionLabel>
        <motion.div
          className="rounded-lg border border-border-default bg-surface-1/50 backdrop-blur-sm p-5"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5, ease }}
        >
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-4 h-4 text-lob-green" />
            <h3 className="text-xs font-semibold text-text-primary">
              Sybil Protection
            </h3>
          </div>
          <div className="grid grid-cols-3 gap-4 mb-5">
            <div className="text-center">
              <div className="text-2xl font-bold tabular-nums text-text-primary">
                <AnimatedValue
                  value={data.totalReports}
                  loading={isLoading}
                />
              </div>
              <p className="text-[10px] text-text-tertiary mt-1 uppercase tracking-wider">
                Reports Filed
              </p>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold tabular-nums text-text-primary">
                <AnimatedValue value={data.totalBans} loading={isLoading} />
              </div>
              <p className="text-[10px] text-text-tertiary mt-1 uppercase tracking-wider">
                Addresses Banned
              </p>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold tabular-nums text-text-primary">
                <AnimatedValue
                  value={data.totalSeized}
                  loading={isLoading}
                  suffix="LOB"
                />
              </div>
              <p className="text-[10px] text-text-tertiary mt-1 uppercase tracking-wider">
                Funds Seized
              </p>
            </div>
          </div>
          {/* Proportional bars */}
          <div className="space-y-3">
            <MiniBar
              label="Reports → Bans conversion"
              value={data.totalBans}
              max={data.totalReports ?? 1}
              loading={isLoading}
              color="bg-red-500"
            />
            <MiniBar
              label="Seized from pool"
              value={data.totalSeized}
              max={data.airdropMaxPool ?? 400_000_000}
              loading={isLoading}
              color="bg-yellow-500"
            />
          </div>
        </motion.div>
      </section>

      {/* ─── Section 4: Airdrop Progress ─── */}
      <motion.section
        className="rounded-lg border border-border-default bg-surface-1/50 backdrop-blur-sm p-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.55, ease }}
      >
        <div className="flex items-center gap-2 mb-4">
          <Gift className="w-4 h-4 text-lob-green" />
          <h2 className="text-sm font-semibold text-text-primary">
            Airdrop Progress
          </h2>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
          <div>
            <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">
              Total Pool
            </p>
            <p className="text-sm font-bold text-text-primary tabular-nums">
              {data.airdropMaxPool != null
                ? formatCompact(data.airdropMaxPool)
                : isLoading
                  ? "..."
                  : "--"}{" "}
              <span className="text-text-tertiary font-normal">LOB</span>
            </p>
          </div>
          <div>
            <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">
              Claimed
            </p>
            <p className="text-sm font-bold text-lob-green tabular-nums">
              {data.airdropClaimed != null
                ? formatCompact(data.airdropClaimed)
                : isLoading
                  ? "..."
                  : "--"}{" "}
              <span className="text-text-tertiary font-normal">LOB</span>
            </p>
          </div>
          <div>
            <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">
              Remaining
            </p>
            <p className="text-sm font-bold text-text-primary tabular-nums">
              {remaining != null
                ? formatCompact(remaining)
                : isLoading
                  ? "..."
                  : "--"}{" "}
              <span className="text-text-tertiary font-normal">LOB</span>
            </p>
          </div>
          <div>
            <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">
              Days Left
            </p>
            <p className="text-sm font-bold text-text-primary tabular-nums">
              {daysLeft != null ? daysLeft : isLoading ? "..." : "--"}
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-3 rounded-full bg-surface-3 overflow-hidden mb-4">
          <motion.div
            className="h-full rounded-full bg-lob-green"
            initial={{ width: 0 }}
            animate={{ width: `${claimedPct}%` }}
            transition={{ duration: 1.2, delay: 0.7, ease }}
          />
        </div>
        <div className="flex items-center justify-between text-[10px] text-text-tertiary mb-4">
          <span>{claimedPct.toFixed(1)}% claimed</span>
          <span>
            {data.airdropMaxPool != null
              ? formatCompact(data.airdropMaxPool) + " LOB total"
              : ""}
          </span>
        </div>

        {/* Claim window dates */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-6 pt-3 border-t border-border/30">
          <div className="flex items-center gap-2 text-xs text-text-secondary">
            <Clock className="w-3.5 h-3.5 text-text-tertiary" />
            <span>
              {data.claimWindowStart != null
                ? formatDate(data.claimWindowStart)
                : "..."}{" "}
              &rarr;{" "}
              {data.claimWindowEnd != null
                ? formatDate(data.claimWindowEnd)
                : "..."}
            </span>
          </div>
          <Link
            href="/airdrop"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-lob-green hover:underline"
          >
            Claim your $LOB
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </motion.section>

      {/* ─── Section 5: Contract Directory ─── */}
      <section>
        <SectionLabel delay={0.6}>
          Deployed Contracts &mdash; Base Mainnet
        </SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {CONTRACT_INFO.map((c, i) => (
            <ContractCard
              key={c.key}
              name={c.name}
              desc={c.desc}
              address={LOBSTR_CONTRACTS[c.key]}
              delay={0.65 + i * 0.04}
            />
          ))}
        </div>
      </section>

      {/* ─── Section 6: Dune Analytics CTA ─── */}
      <motion.section
        className="rounded-lg border border-border-default bg-surface-1/50 backdrop-blur-sm p-6"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 1.0, ease }}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-text-primary">
            Explore on Dune Analytics
          </h2>
          <span className="px-2 py-0.5 rounded text-[9px] font-medium bg-lob-green-muted text-lob-green border border-lob-green/20">
            Coming Soon
          </span>
        </div>
        <p className="text-xs text-text-secondary mb-4">
          Deep-dive into historical on-chain data with our SQL playbook.
          Time-series charts for staking TVL, job volume, and dispute trends
          will be embedded here once Dune dashboards are live.
        </p>

        {/* Chart placeholder grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
          {[
            { title: "Staking TVL", desc: "Cumulative LOB staked over time" },
            { title: "Daily Jobs", desc: "Job creation & escrow volume" },
            { title: "Dispute Trends", desc: "Weekly disputes & resolutions" },
          ].map((chart) => (
            <div
              key={chart.title}
              className="rounded border border-dashed border-border/40 bg-surface-2/30 p-4 flex flex-col items-center justify-center text-center min-h-[120px]"
            >
              <BarChart3 className="w-6 h-6 text-text-tertiary mb-2" />
              <p className="text-xs font-medium text-text-secondary">
                {chart.title}
              </p>
              <p className="text-[10px] text-text-tertiary mt-0.5">
                {chart.desc}
              </p>
            </div>
          ))}
        </div>

        {/* Dashboard tags */}
        <div className="flex flex-wrap gap-2">
          {DUNE_DASHBOARDS.map((d) => (
            <span
              key={d}
              className="px-2.5 py-1 rounded-full text-[10px] font-medium border border-border/40 text-text-secondary bg-surface-2"
            >
              {d}
            </span>
          ))}
        </div>
      </motion.section>
    </div>
  );
}
