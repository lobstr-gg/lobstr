"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { stagger, fadeUp, ease } from "@/lib/motion";
import { InfoButton } from "@/components/InfoButton";
import {
  Trophy,
  Scale,
  Star,
  Coins,
  Landmark,
  Wrench,
  ChevronUp,
  ChevronDown,
  ArrowUpDown,
  Shield,
  TrendingUp,
  Users,
  Lock,
  DollarSign,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TabId = "reputation" | "arbitrators" | "reviews" | "stakers" | "lenders" | "skills";

type SortDir = "asc" | "desc";
type SortConfig<T extends string> = { key: T; dir: SortDir };

// ---------------------------------------------------------------------------
// Tab Config
// ---------------------------------------------------------------------------

const TABS: { id: TabId; label: string; icon: typeof Trophy }[] = [
  { id: "reputation", label: "Reputation", icon: Trophy },
  { id: "arbitrators", label: "Arbitrators", icon: Scale },
  { id: "reviews", label: "Reviews", icon: Star },
  { id: "stakers", label: "Stakers", icon: Coins },
  { id: "lenders", label: "Lenders", icon: Landmark },
  { id: "skills", label: "Skills", icon: Wrench },
];

// ---------------------------------------------------------------------------
// Tier Badges
// ---------------------------------------------------------------------------

const TIER_COLORS: Record<string, string> = {
  Bronze: "#CD7F32",
  Silver: "#848E9C",
  Gold: "#F0B90B",
  Platinum: "#58B059",
  Junior: "#CD7F32",
  Senior: "#848E9C",
  Principal: "#58B059",
};

function TierBadge({ tier }: { tier: string }) {
  const color = TIER_COLORS[tier] ?? "#5E6673";
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider"
      style={{ backgroundColor: `${color}18`, color, border: `1px solid ${color}30` }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      {tier}
    </span>
  );
}

function PricingBadge({ model }: { model: string }) {
  const colorMap: Record<string, string> = {
    "Per Hour": "#3B82F6",
    "Per Job": "#F59E0B",
    Subscription: "#A855F7",
    "Pay What You Want": "#58B059",
  };
  const color = colorMap[model] ?? "#5E6673";
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium"
      style={{ backgroundColor: `${color}15`, color }}
    >
      {model}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Rank Display
// ---------------------------------------------------------------------------

const RANK_COLORS: Record<number, string> = {
  1: "#F0B90B",
  2: "#848E9C",
  3: "#CD7F32",
};

function RankCell({ rank }: { rank: number }) {
  const color = RANK_COLORS[rank];
  return (
    <span
      className="text-sm font-bold tabular-nums"
      style={{ color: color ?? undefined }}
    >
      #{rank}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Address Display
// ---------------------------------------------------------------------------

function AddressCell({ address }: { address: string }) {
  const truncated = `${address.slice(0, 6)}...${address.slice(-4)}`;
  return (
    <Link
      href={`/profile/${address}`}
      className="font-mono text-xs text-text-secondary hover:text-lob-green transition-colors"
    >
      {truncated}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Star Rating
// ---------------------------------------------------------------------------

function StarRating({ rating }: { rating: number }) {
  const fullStars = Math.floor(rating);
  const halfStar = rating % 1 >= 0.5;
  return (
    <span className="inline-flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className="w-3 h-3"
          fill={i < fullStars ? "#F0B90B" : i === fullStars && halfStar ? "#F0B90B" : "none"}
          stroke={i < fullStars || (i === fullStars && halfStar) ? "#F0B90B" : "#5E6673"}
          strokeWidth={2}
        />
      ))}
      <span className="text-[10px] text-text-tertiary ml-1 tabular-nums">{rating.toFixed(1)}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Sortable Table Header
// ---------------------------------------------------------------------------

function SortHeader<T extends string>({
  label,
  sortKey,
  current,
  onSort,
}: {
  label: string;
  sortKey: T;
  current: SortConfig<T>;
  onSort: (key: T) => void;
}) {
  const isActive = current.key === sortKey;
  return (
    <button
      onClick={() => onSort(sortKey)}
      className="flex items-center gap-1 text-[10px] font-medium text-text-tertiary uppercase tracking-wider hover:text-text-secondary transition-colors group"
    >
      {label}
      {isActive ? (
        current.dir === "asc" ? (
          <ChevronUp className="w-3 h-3 text-lob-green" />
        ) : (
          <ChevronDown className="w-3 h-3 text-lob-green" />
        )
      ) : (
        <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity" />
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Generic sort helper
// ---------------------------------------------------------------------------

function useSortable<T extends string>(defaultKey: T, defaultDir: SortDir = "desc") {
  const [sort, setSort] = useState<SortConfig<T>>({ key: defaultKey, dir: defaultDir });

  const toggle = (key: T) => {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "desc" }
    );
  };

  return { sort, toggle };
}

function sortData<T>(data: T[], key: keyof T, dir: SortDir): T[] {
  return [...data].sort((a, b) => {
    const va = a[key];
    const vb = b[key];
    if (typeof va === "number" && typeof vb === "number") {
      return dir === "asc" ? va - vb : vb - va;
    }
    return dir === "asc"
      ? String(va).localeCompare(String(vb))
      : String(vb).localeCompare(String(va));
  });
}

// ---------------------------------------------------------------------------
// Mock Data Generation
// ---------------------------------------------------------------------------

function addr(seed: number): string {
  const hex = seed.toString(16).padStart(8, "0");
  return `0x${hex}${"A1B2C3D4E5F6a1b2c3d4e5f6a1b2c3d4".slice(0, 32)}`;
}

// Reputation mock data (20 entries)
const MOCK_REPUTATION = Array.from({ length: 20 }, (_, i) => {
  const score = Math.floor(9800 - i * 340 + Math.random() * 100);
  const jobsDone = Math.floor(120 - i * 4 + Math.random() * 10);
  const disputesWon = Math.floor(Math.random() * 8 + 2);
  const disputesLost = Math.floor(Math.random() * 3);
  const tier =
    score >= 9000 ? "Platinum" : score >= 7000 ? "Gold" : score >= 4000 ? "Silver" : "Bronze";
  return {
    rank: i + 1,
    address: addr(0x1a2b + i * 0x1111),
    score,
    tier,
    jobsCompleted: jobsDone,
    disputesWon,
    disputesLost,
    winRate: disputesWon + disputesLost > 0
      ? Math.round((disputesWon / (disputesWon + disputesLost)) * 100)
      : 100,
  };
});

// Arbitrators mock data (10 entries)
const MOCK_ARBITRATORS = Array.from({ length: 10 }, (_, i) => {
  const stakeAmount = Math.floor(120000 - i * 10000 + Math.random() * 5000);
  const disputesHandled = Math.floor(45 - i * 3 + Math.random() * 5);
  const majorityPct = Math.floor(98 - i * 2 + Math.random() * 3);
  const rewardsEarned = Math.floor(stakeAmount * 0.04 + Math.random() * 500);
  const tier =
    stakeAmount >= 100000 ? "Principal" : stakeAmount >= 25000 ? "Senior" : "Junior";
  return {
    rank: i + 1,
    address: addr(0x2b3c + i * 0x2222),
    tier,
    stakeAmount,
    disputesHandled,
    majorityPct: Math.min(100, majorityPct),
    rewardsEarned,
  };
});

// Reviews mock data (15 entries)
const MOCK_REVIEWS = Array.from({ length: 15 }, (_, i) => {
  const avgRating = Math.round((4.9 - i * 0.12 + Math.random() * 0.1) * 10) / 10;
  return {
    rank: i + 1,
    address: addr(0x3c4d + i * 0x3333),
    avgRating: Math.min(5, Math.max(1, avgRating)),
    reviewsGiven: Math.floor(80 - i * 4 + Math.random() * 8),
    reviewsReceived: Math.floor(65 - i * 3 + Math.random() * 6),
  };
});

// Stakers mock data (15 entries)
const MOCK_STAKERS = Array.from({ length: 15 }, (_, i) => {
  const stakedAmount = Math.floor(250000 - i * 15000 + Math.random() * 5000);
  const rewardsEarned = Math.floor(stakedAmount * 0.06 + Math.random() * 800);
  const durationDays = Math.floor(365 - i * 15 + Math.random() * 30);
  const tier =
    stakedAmount >= 100000
      ? "Platinum"
      : stakedAmount >= 10000
        ? "Gold"
        : stakedAmount >= 1000
          ? "Silver"
          : "Bronze";
  return {
    rank: i + 1,
    address: addr(0x4d5e + i * 0x4444),
    stakedAmount,
    tier,
    rewardsEarned,
    duration: `${durationDays}d`,
    durationDays,
  };
});

// Lenders mock data (10 entries)
const MOCK_LENDERS = Array.from({ length: 10 }, (_, i) => {
  const totalFunded = Math.floor(500000 - i * 40000 + Math.random() * 15000);
  const activeLoans = Math.floor(12 - i + Math.random() * 3);
  const defaultRate = Math.round((1.2 + i * 0.3 + Math.random() * 0.5) * 10) / 10;
  const interestEarned = Math.floor(totalFunded * 0.08 + Math.random() * 2000);
  return {
    rank: i + 1,
    address: addr(0x5e6f + i * 0x5555),
    totalFunded,
    activeLoans: Math.max(0, activeLoans),
    defaultRate: Math.min(15, defaultRate),
    interestEarned,
  };
});

// Skills mock data (10 entries)
const SKILL_NAMES = [
  "Smart Contract Audit",
  "UI/UX Design",
  "Solidity Development",
  "Token Economics",
  "Community Mgmt",
  "Technical Writing",
  "DevOps & Infra",
  "Data Analysis",
  "Marketing Strategy",
  "Legal Review",
];
const PRICING_MODELS = ["Per Hour", "Per Job", "Subscription", "Pay What You Want"];

const MOCK_SKILLS = Array.from({ length: 10 }, (_, i) => {
  const purchases = Math.floor(200 - i * 15 + Math.random() * 10);
  const revenue = Math.floor(purchases * (150 + Math.random() * 50));
  const avgRating = Math.round((4.8 - i * 0.08 + Math.random() * 0.1) * 10) / 10;
  return {
    rank: i + 1,
    skillName: SKILL_NAMES[i],
    seller: addr(0x6f70 + i * 0x6666),
    purchases,
    revenue,
    avgRating: Math.min(5, avgRating),
    pricingModel: PRICING_MODELS[i % PRICING_MODELS.length],
  };
});

// ---------------------------------------------------------------------------
// Protocol Stats Banner
// ---------------------------------------------------------------------------

const PROTOCOL_STATS = [
  { label: "Total Value Locked", value: "$4.2M", icon: Lock, color: "#58B059" },
  { label: "Jobs Completed", value: "1,847", icon: TrendingUp, color: "#3B82F6" },
  { label: "Active Arbitrators", value: "42", icon: Scale, color: "#A855F7" },
  { label: "LOB Staked", value: "24.5M", icon: Coins, color: "#F0B90B" },
  { label: "Protocol Revenue", value: "$312K", icon: DollarSign, color: "#58B059" },
  { label: "Insurance TVL", value: "$890K", icon: Shield, color: "#EF4444" },
];

function ProtocolStatsBanner() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
      {PROTOCOL_STATS.map((stat, i) => {
        const Icon = stat.icon;
        return (
          <motion.div
            key={stat.label}
            className="card p-3 sm:p-4 relative overflow-hidden group"
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.1 + i * 0.05, ease }}
            whileHover={{ y: -2 }}
          >
            <motion.div
              className="absolute top-0 left-0 right-0 h-px opacity-0 group-hover:opacity-100 transition-opacity"
              style={{
                background: `linear-gradient(to right, transparent, ${stat.color}30, transparent)`,
              }}
            />
            <Icon className="w-4 h-4 mb-2" style={{ color: stat.color }} />
            <p className="text-lg sm:text-xl font-bold text-text-primary tabular-nums">
              {stat.value}
            </p>
            <p className="text-[9px] text-text-tertiary uppercase tracking-wider mt-0.5">
              {stat.label}
            </p>
          </motion.div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return n.toLocaleString();
}

// ---------------------------------------------------------------------------
// Table Components (one per tab)
// ---------------------------------------------------------------------------

type RepKey = "rank" | "score" | "jobsCompleted" | "disputesWon" | "disputesLost" | "winRate";

function ReputationTable() {
  const { sort, toggle } = useSortable<RepKey>("score");
  const sorted = useMemo(() => sortData(MOCK_REPUTATION, sort.key, sort.dir), [sort]);

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px]">
          <thead>
            <tr className="border-b border-border/50">
              <th className="px-4 py-3 text-left">
                <SortHeader label="Rank" sortKey="rank" current={sort} onSort={toggle} />
              </th>
              <th className="px-4 py-3 text-left">
                <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-wider">
                  Address
                </span>
              </th>
              <th className="px-4 py-3 text-left">
                <SortHeader label="Score" sortKey="score" current={sort} onSort={toggle} />
              </th>
              <th className="px-4 py-3 text-left">
                <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-wider">
                  Tier
                </span>
              </th>
              <th className="px-4 py-3 text-left">
                <SortHeader label="Jobs" sortKey="jobsCompleted" current={sort} onSort={toggle} />
              </th>
              <th className="px-4 py-3 text-left">
                <SortHeader label="Won" sortKey="disputesWon" current={sort} onSort={toggle} />
              </th>
              <th className="px-4 py-3 text-left">
                <SortHeader label="Lost" sortKey="disputesLost" current={sort} onSort={toggle} />
              </th>
              <th className="px-4 py-3 text-left">
                <SortHeader label="Win Rate" sortKey="winRate" current={sort} onSort={toggle} />
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <motion.tr
                key={row.address}
                className="border-b border-border/30 last:border-0 hover:bg-surface-1/60 transition-colors"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.02, ease }}
              >
                <td className="px-4 py-3"><RankCell rank={row.rank} /></td>
                <td className="px-4 py-3"><AddressCell address={row.address} /></td>
                <td className="px-4 py-3 text-sm font-bold text-text-primary tabular-nums">
                  {fmtNum(row.score)}
                </td>
                <td className="px-4 py-3"><TierBadge tier={row.tier} /></td>
                <td className="px-4 py-3 text-sm text-text-secondary tabular-nums">
                  {row.jobsCompleted}
                </td>
                <td className="px-4 py-3 text-sm text-lob-green tabular-nums">
                  {row.disputesWon}
                </td>
                <td className="px-4 py-3 text-sm text-red-400 tabular-nums">
                  {row.disputesLost}
                </td>
                <td className="px-4 py-3 text-sm font-medium tabular-nums" style={{
                  color: row.winRate >= 80 ? "#58B059" : row.winRate >= 50 ? "#F0B90B" : "#FF3B69",
                }}>
                  {row.winRate}%
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type ArbKey = "rank" | "stakeAmount" | "disputesHandled" | "majorityPct" | "rewardsEarned";

function ArbitratorsTable() {
  const { sort, toggle } = useSortable<ArbKey>("stakeAmount");
  const sorted = useMemo(() => sortData(MOCK_ARBITRATORS, sort.key, sort.dir), [sort]);

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px]">
          <thead>
            <tr className="border-b border-border/50">
              <th className="px-4 py-3 text-left">
                <SortHeader label="Rank" sortKey="rank" current={sort} onSort={toggle} />
              </th>
              <th className="px-4 py-3 text-left">
                <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-wider">Address</span>
              </th>
              <th className="px-4 py-3 text-left">
                <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-wider">Tier</span>
              </th>
              <th className="px-4 py-3 text-left">
                <SortHeader label="Stake" sortKey="stakeAmount" current={sort} onSort={toggle} />
              </th>
              <th className="px-4 py-3 text-left">
                <SortHeader label="Disputes" sortKey="disputesHandled" current={sort} onSort={toggle} />
              </th>
              <th className="px-4 py-3 text-left">
                <SortHeader label="Majority %" sortKey="majorityPct" current={sort} onSort={toggle} />
              </th>
              <th className="px-4 py-3 text-left">
                <SortHeader label="Rewards" sortKey="rewardsEarned" current={sort} onSort={toggle} />
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <motion.tr
                key={row.address}
                className="border-b border-border/30 last:border-0 hover:bg-surface-1/60 transition-colors"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.02, ease }}
              >
                <td className="px-4 py-3"><RankCell rank={row.rank} /></td>
                <td className="px-4 py-3"><AddressCell address={row.address} /></td>
                <td className="px-4 py-3"><TierBadge tier={row.tier} /></td>
                <td className="px-4 py-3 text-sm font-bold text-text-primary tabular-nums">
                  {fmtNum(row.stakeAmount)} LOB
                </td>
                <td className="px-4 py-3 text-sm text-text-secondary tabular-nums">
                  {row.disputesHandled}
                </td>
                <td className="px-4 py-3 text-sm font-medium tabular-nums" style={{
                  color: row.majorityPct >= 90 ? "#58B059" : row.majorityPct >= 70 ? "#F0B90B" : "#FF3B69",
                }}>
                  {row.majorityPct}%
                </td>
                <td className="px-4 py-3 text-sm text-lob-green tabular-nums">
                  {fmtNum(row.rewardsEarned)} LOB
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type RevKey = "rank" | "avgRating" | "reviewsGiven" | "reviewsReceived";

function ReviewsTable() {
  const { sort, toggle } = useSortable<RevKey>("avgRating");
  const sorted = useMemo(() => sortData(MOCK_REVIEWS, sort.key, sort.dir), [sort]);

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px]">
          <thead>
            <tr className="border-b border-border/50">
              <th className="px-4 py-3 text-left">
                <SortHeader label="Rank" sortKey="rank" current={sort} onSort={toggle} />
              </th>
              <th className="px-4 py-3 text-left">
                <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-wider">Address</span>
              </th>
              <th className="px-4 py-3 text-left">
                <SortHeader label="Avg Rating" sortKey="avgRating" current={sort} onSort={toggle} />
              </th>
              <th className="px-4 py-3 text-left">
                <SortHeader label="Given" sortKey="reviewsGiven" current={sort} onSort={toggle} />
              </th>
              <th className="px-4 py-3 text-left">
                <SortHeader label="Received" sortKey="reviewsReceived" current={sort} onSort={toggle} />
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <motion.tr
                key={row.address}
                className="border-b border-border/30 last:border-0 hover:bg-surface-1/60 transition-colors"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.02, ease }}
              >
                <td className="px-4 py-3"><RankCell rank={row.rank} /></td>
                <td className="px-4 py-3"><AddressCell address={row.address} /></td>
                <td className="px-4 py-3"><StarRating rating={row.avgRating} /></td>
                <td className="px-4 py-3 text-sm text-text-secondary tabular-nums">
                  {row.reviewsGiven}
                </td>
                <td className="px-4 py-3 text-sm text-text-secondary tabular-nums">
                  {row.reviewsReceived}
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type StakeKey = "rank" | "stakedAmount" | "rewardsEarned" | "durationDays";

function StakersTable() {
  const { sort, toggle } = useSortable<StakeKey>("stakedAmount");
  const sorted = useMemo(() => sortData(MOCK_STAKERS, sort.key, sort.dir), [sort]);

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="border-b border-border/50">
              <th className="px-4 py-3 text-left">
                <SortHeader label="Rank" sortKey="rank" current={sort} onSort={toggle} />
              </th>
              <th className="px-4 py-3 text-left">
                <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-wider">Address</span>
              </th>
              <th className="px-4 py-3 text-left">
                <SortHeader label="Staked" sortKey="stakedAmount" current={sort} onSort={toggle} />
              </th>
              <th className="px-4 py-3 text-left">
                <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-wider">Tier</span>
              </th>
              <th className="px-4 py-3 text-left">
                <SortHeader label="Rewards" sortKey="rewardsEarned" current={sort} onSort={toggle} />
              </th>
              <th className="px-4 py-3 text-left">
                <SortHeader label="Duration" sortKey="durationDays" current={sort} onSort={toggle} />
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <motion.tr
                key={row.address}
                className="border-b border-border/30 last:border-0 hover:bg-surface-1/60 transition-colors"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.02, ease }}
              >
                <td className="px-4 py-3"><RankCell rank={row.rank} /></td>
                <td className="px-4 py-3"><AddressCell address={row.address} /></td>
                <td className="px-4 py-3 text-sm font-bold text-text-primary tabular-nums">
                  {fmtNum(row.stakedAmount)} LOB
                </td>
                <td className="px-4 py-3"><TierBadge tier={row.tier} /></td>
                <td className="px-4 py-3 text-sm text-lob-green tabular-nums">
                  {fmtNum(row.rewardsEarned)} LOB
                </td>
                <td className="px-4 py-3 text-sm text-text-secondary tabular-nums">
                  {row.duration}
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type LendKey = "rank" | "totalFunded" | "activeLoans" | "defaultRate" | "interestEarned";

function LendersTable() {
  const { sort, toggle } = useSortable<LendKey>("totalFunded");
  const sorted = useMemo(() => sortData(MOCK_LENDERS, sort.key, sort.dir), [sort]);

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="border-b border-border/50">
              <th className="px-4 py-3 text-left">
                <SortHeader label="Rank" sortKey="rank" current={sort} onSort={toggle} />
              </th>
              <th className="px-4 py-3 text-left">
                <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-wider">Address</span>
              </th>
              <th className="px-4 py-3 text-left">
                <SortHeader label="Funded" sortKey="totalFunded" current={sort} onSort={toggle} />
              </th>
              <th className="px-4 py-3 text-left">
                <SortHeader label="Active" sortKey="activeLoans" current={sort} onSort={toggle} />
              </th>
              <th className="px-4 py-3 text-left">
                <SortHeader label="Default %" sortKey="defaultRate" current={sort} onSort={toggle} />
              </th>
              <th className="px-4 py-3 text-left">
                <SortHeader label="Interest" sortKey="interestEarned" current={sort} onSort={toggle} />
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <motion.tr
                key={row.address}
                className="border-b border-border/30 last:border-0 hover:bg-surface-1/60 transition-colors"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.02, ease }}
              >
                <td className="px-4 py-3"><RankCell rank={row.rank} /></td>
                <td className="px-4 py-3"><AddressCell address={row.address} /></td>
                <td className="px-4 py-3 text-sm font-bold text-text-primary tabular-nums">
                  {fmtNum(row.totalFunded)} LOB
                </td>
                <td className="px-4 py-3 text-sm text-text-secondary tabular-nums">
                  {row.activeLoans}
                </td>
                <td className="px-4 py-3 text-sm font-medium tabular-nums" style={{
                  color: row.defaultRate <= 3 ? "#58B059" : row.defaultRate <= 7 ? "#F0B90B" : "#FF3B69",
                }}>
                  {row.defaultRate}%
                </td>
                <td className="px-4 py-3 text-sm text-lob-green tabular-nums">
                  {fmtNum(row.interestEarned)} LOB
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type SkillKey = "rank" | "purchases" | "revenue" | "avgRating";

function SkillsTable() {
  const { sort, toggle } = useSortable<SkillKey>("revenue");
  const sorted = useMemo(() => sortData(MOCK_SKILLS, sort.key, sort.dir), [sort]);

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px]">
          <thead>
            <tr className="border-b border-border/50">
              <th className="px-4 py-3 text-left">
                <SortHeader label="Rank" sortKey="rank" current={sort} onSort={toggle} />
              </th>
              <th className="px-4 py-3 text-left">
                <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-wider">Skill</span>
              </th>
              <th className="px-4 py-3 text-left">
                <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-wider">Seller</span>
              </th>
              <th className="px-4 py-3 text-left">
                <SortHeader label="Purchases" sortKey="purchases" current={sort} onSort={toggle} />
              </th>
              <th className="px-4 py-3 text-left">
                <SortHeader label="Revenue" sortKey="revenue" current={sort} onSort={toggle} />
              </th>
              <th className="px-4 py-3 text-left">
                <SortHeader label="Rating" sortKey="avgRating" current={sort} onSort={toggle} />
              </th>
              <th className="px-4 py-3 text-left">
                <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-wider">Pricing</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <motion.tr
                key={row.skillName}
                className="border-b border-border/30 last:border-0 hover:bg-surface-1/60 transition-colors"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.02, ease }}
              >
                <td className="px-4 py-3"><RankCell rank={row.rank} /></td>
                <td className="px-4 py-3 text-sm font-semibold text-text-primary">
                  {row.skillName}
                </td>
                <td className="px-4 py-3"><AddressCell address={row.seller} /></td>
                <td className="px-4 py-3 text-sm text-text-secondary tabular-nums">
                  {row.purchases}
                </td>
                <td className="px-4 py-3 text-sm font-bold text-text-primary tabular-nums">
                  {fmtNum(row.revenue)} LOB
                </td>
                <td className="px-4 py-3"><StarRating rating={row.avgRating} /></td>
                <td className="px-4 py-3"><PricingBadge model={row.pricingModel} /></td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab content mapping
// ---------------------------------------------------------------------------

const TAB_CONTENT: Record<TabId, () => JSX.Element> = {
  reputation: ReputationTable,
  arbitrators: ArbitratorsTable,
  reviews: ReviewsTable,
  stakers: StakersTable,
  lenders: LendersTable,
  skills: SkillsTable,
};

const TAB_DESCRIPTIONS: Record<TabId, string> = {
  reputation: "Ranked by on-chain reputation score across all protocol interactions",
  arbitrators: "Top dispute arbitrators by stake, performance, and rewards earned",
  reviews: "Highest-rated participants by average review score",
  stakers: "Largest LOB stakers by amount and duration",
  lenders: "Top lenders by total funded, active loans, and interest earned",
  skills: "Most popular skills by purchases, revenue, and ratings",
};

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function LeaderboardPage() {
  const [activeTab, setActiveTab] = useState<TabId>("reputation");
  const ActiveTable = TAB_CONTENT[activeTab];

  return (
    <motion.div initial="hidden" animate="show" variants={stagger}>
      {/* Header */}
      <motion.div variants={fadeUp} className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-lg bg-lob-green-muted flex items-center justify-center border border-lob-green/20">
            <Trophy className="w-4 h-4 text-lob-green" />
          </div>
          <h1 className="text-xl font-bold text-text-primary flex items-center gap-1.5">
            Leaderboard
            <InfoButton infoKey="leaderboard.header" />
          </h1>
        </div>
        <p className="text-xs text-text-tertiary mt-0.5">
          Protocol rankings across all dimensions
        </p>
      </motion.div>

      {/* Protocol Stats Banner */}
      <motion.div variants={fadeUp}>
        <ProtocolStatsBanner />
      </motion.div>

      {/* Tab Navigation */}
      <motion.div variants={fadeUp} className="flex gap-0.5 mb-2 border-b border-border overflow-x-auto scrollbar-none">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="relative px-3 sm:px-4 py-2 text-sm font-medium -mb-px whitespace-nowrap flex-shrink-0"
            >
              <motion.span
                animate={{ color: activeTab === tab.id ? "#EAECEF" : "#5E6673" }}
                className="relative z-10 flex items-center gap-1.5"
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden text-xs">{tab.label}</span>
              </motion.span>
              {activeTab === tab.id && (
                <motion.div
                  layoutId="leaderboard-tab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-lob-green"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
            </button>
          );
        })}
      </motion.div>

      {/* Tab Description */}
      <motion.p
        key={activeTab + "-desc"}
        className="text-[10px] text-text-tertiary mb-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        {TAB_DESCRIPTIONS[activeTab]}
      </motion.p>

      {/* Table Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25 }}
        >
          <ActiveTable />
        </motion.div>
      </AnimatePresence>

      {/* Footer note */}
      <motion.div variants={fadeUp} className="mt-6">
        <div className="card p-4">
          <div className="flex items-start gap-3">
            <Users className="w-4 h-4 text-text-tertiary mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-semibold text-text-primary mb-1">
                How Rankings Work
              </p>
              <p className="text-[10px] text-text-tertiary leading-relaxed">
                All rankings are derived from on-chain data indexed from LOBSTR protocol contracts on Base.
                Reputation scores factor in job completion rate, dispute outcomes, staking history, and review scores.
                Rankings update in real-time as new transactions are confirmed on-chain.
                Addresses with active Sybil flags are excluded from all leaderboards.
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
