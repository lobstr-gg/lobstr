"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { motion, AnimatePresence } from "framer-motion";
import { formatEther } from "viem";
import { stagger, fadeUp, ease } from "@/lib/motion";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
} from "recharts";
import {
  useReportDetails,
  useReportBanScheduledAt,
  useReportBanExecuted,
  useTotalReports,
  useTotalBans,
  useTotalSeized,
  useSeizedInEscrow,
  useSeizureEscrowExpiry,
  useEscrowReportId,
  useAppealsRole,
  useSybilGuardHasRole,
  useExecuteBan,
  useCancelBan,
  useReleaseEscrow,
} from "@/lib/useSybilGuard";
import {
  Shield,
  Flag,
  Gavel,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Ban,
  MessageSquareWarning,
  Clock,
  Filter,
  BookOpen,
  MessageCircle,
  Send,
  ChevronRight,
  ArrowUpRight,
  Lock,
  Unlock,
  Timer,
  Coins,
  ShieldAlert,
  Loader2,
} from "lucide-react";
import { InfoButton } from "@/components/InfoButton";

/* ──── Types ──────────────────────────────────────────────────── */

type TabId = "flagged" | "actions" | "guidelines" | "chat" | "sybil-bans" | "seizure-escrow";

type FlagReason = "spam" | "harassment" | "off-topic" | "scam";

type ActionType = "approve" | "warn" | "remove" | "mute" | "ban";

interface FlaggedPost {
  id: string;
  title: string;
  author: string;
  reason: FlagReason;
  flagCount: number;
  flaggedAt: number;
  excerpt: string;
}

interface ModAction {
  id: string;
  action: ActionType;
  targetUser: string;
  targetPost?: string;
  mod: string;
  timestamp: number;
  note?: string;
}

interface ModMessage {
  id: string;
  author: string;
  authorLabel: string;
  message: string;
  timestamp: number;
}

/* ──── Constants ──────────────────────────────────────────────── */

const BAN_DELAY_SECS = 48 * 60 * 60; // 48 hours
const SEIZURE_ESCROW_SECS = 30 * 24 * 60 * 60; // 30 days

const VIOLATION_LABELS: Record<number, string> = {
  0: "Sybil Cluster",
  1: "Self-Dealing",
  2: "Coordinated Voting",
  3: "Reputation Farming",
  4: "Multisig Abuse",
  5: "Stake Manipulation",
  6: "Evidence Fraud",
  7: "Identity Fraud",
};

const REPORT_STATUS_LABELS: Record<number, { label: string; color: string }> = {
  0: { label: "Pending", color: "#F59E0B" },
  1: { label: "Confirmed", color: "#58B059" },
  2: { label: "Rejected", color: "#EF4444" },
  3: { label: "Expired", color: "#6B7280" },
};

const TABS: { id: TabId; label: string; icon: typeof Flag }[] = [
  { id: "flagged", label: "Flagged Content", icon: Flag },
  { id: "actions", label: "Mod Actions", icon: Gavel },
  { id: "sybil-bans", label: "Sybil Bans", icon: ShieldAlert },
  { id: "seizure-escrow", label: "Seizure Escrow", icon: Lock },
  { id: "guidelines", label: "Guidelines", icon: BookOpen },
  { id: "chat", label: "Mod Chat", icon: MessageCircle },
];

const FLAG_REASON_STYLES: Record<FlagReason, { bg: string; text: string; border: string }> = {
  spam: { bg: "bg-yellow-500/10", text: "text-yellow-400", border: "border-yellow-400/20" },
  harassment: { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-400/20" },
  "off-topic": { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-400/20" },
  scam: { bg: "bg-purple-500/10", text: "text-purple-400", border: "border-purple-400/20" },
};

const ACTION_STYLES: Record<ActionType, { bg: string; text: string; border: string; label: string }> = {
  approve: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-400/20", label: "Approved" },
  warn: { bg: "bg-yellow-500/10", text: "text-yellow-400", border: "border-yellow-400/20", label: "Warned" },
  remove: { bg: "bg-orange-500/10", text: "text-orange-400", border: "border-orange-400/20", label: "Removed" },
  mute: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-400/20", label: "Muted" },
  ban: { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-400/20", label: "Banned" },
};

/* ──── Mock Data ──────────────────────────────────────────────── */

const MOCK_FLAGGED: FlaggedPost[] = [
  {
    id: "f1",
    title: "FREE LOB AIRDROP - CLICK HERE NOW!!!",
    author: "0x7a3B...9f21",
    reason: "scam",
    flagCount: 12,
    flaggedAt: Date.now() - 1000 * 60 * 23,
    excerpt: "Claiming to distribute free tokens via external link. Multiple users flagged as phishing attempt.",
  },
  {
    id: "f2",
    title: "This protocol is garbage and the devs are...",
    author: "0x1cD4...8e3a",
    reason: "harassment",
    flagCount: 7,
    flaggedAt: Date.now() - 1000 * 60 * 60 * 2,
    excerpt: "Personal attacks against core team members with threatening language.",
  },
  {
    id: "f3",
    title: "Buy my NFT collection (unrelated to LOBSTR)",
    author: "0x9eF2...4b77",
    reason: "spam",
    flagCount: 4,
    flaggedAt: Date.now() - 1000 * 60 * 60 * 5,
    excerpt: "Repeated promotional posts for unrelated NFT project across multiple forum categories.",
  },
  {
    id: "f4",
    title: "Best pizza recipes for weekend",
    author: "0x5aB1...2c98",
    reason: "off-topic",
    flagCount: 2,
    flaggedAt: Date.now() - 1000 * 60 * 60 * 8,
    excerpt: "Posted in the Governance category. Content is completely unrelated to LOBSTR protocol.",
  },
];

const MOCK_ACTIONS: ModAction[] = [
  {
    id: "a1",
    action: "ban",
    targetUser: "0x3dE1...7f44",
    targetPost: "Fake airdrop phishing link",
    mod: "0x3F2A...B251",
    timestamp: Date.now() - 1000 * 60 * 45,
    note: "Repeat offender, posted phishing links 3 times",
  },
  {
    id: "a2",
    action: "remove",
    targetUser: "0x8bC2...5a19",
    targetPost: "Selling account access for USDC",
    mod: "0x3F2A...B251",
    timestamp: Date.now() - 1000 * 60 * 60 * 3,
    note: "ToS violation - account selling",
  },
  {
    id: "a3",
    action: "warn",
    targetUser: "0x1cD4...8e3a",
    targetPost: "Heated debate getting personal",
    mod: "0xA7b3...9e55",
    timestamp: Date.now() - 1000 * 60 * 60 * 6,
    note: "First offense, issued formal warning",
  },
  {
    id: "a4",
    action: "approve",
    targetUser: "0x5aB1...2c98",
    targetPost: "Constructive criticism of staking model",
    mod: "0xA7b3...9e55",
    timestamp: Date.now() - 1000 * 60 * 60 * 12,
    note: "Legitimate feedback, dismissing flags",
  },
  {
    id: "a5",
    action: "mute",
    targetUser: "0x9eF2...4b77",
    mod: "0x3F2A...B251",
    timestamp: Date.now() - 1000 * 60 * 60 * 18,
    note: "24h mute for repeated spam posts",
  },
  {
    id: "a6",
    action: "remove",
    targetUser: "0x6fA9...1d33",
    targetPost: "Malicious contract link disguised as tool",
    mod: "0xA7b3...9e55",
    timestamp: Date.now() - 1000 * 60 * 60 * 24,
    note: "Security risk - removed immediately",
  },
];

const MOCK_MESSAGES: ModMessage[] = [
  {
    id: "m1",
    author: "0x3F2A...B251",
    authorLabel: "Cruz",
    message: "Heads up - seeing a wave of phishing posts from new accounts. Looks coordinated.",
    timestamp: Date.now() - 1000 * 60 * 15,
  },
  {
    id: "m2",
    author: "0xA7b3...9e55",
    authorLabel: "Sentinel",
    message: "Confirmed. I've flagged 4 accounts so far. All created within the last hour with similar naming patterns.",
    timestamp: Date.now() - 1000 * 60 * 12,
  },
  {
    id: "m3",
    author: "0x3F2A...B251",
    authorLabel: "Cruz",
    message: "Banning them now. Should we add a cooldown for new account posting?",
    timestamp: Date.now() - 1000 * 60 * 8,
  },
  {
    id: "m4",
    author: "0xB4c8...7a22",
    authorLabel: "Arbiter",
    message: "Good idea. I'll draft a proposal. In the meantime, I'll keep watch on new registrations.",
    timestamp: Date.now() - 1000 * 60 * 3,
  },
];

/* ──── Mock data for scheduled bans (for demo/fallback) ──────── */

interface MockScheduledBan {
  reportId: bigint;
  scheduledAt: number;  // unix seconds
  executed: boolean;
  cancelled: boolean;
  subjects: string[];
  watcher: string;
  violation: number;
  confirmations: number;
  notes: string;
}

const MOCK_SCHEDULED_BANS: MockScheduledBan[] = [
  {
    reportId: 7n,
    scheduledAt: Math.floor(Date.now() / 1000) - 36 * 3600, // 36h ago (12h left)
    executed: false,
    cancelled: false,
    subjects: ["0x7a3B...9f21", "0x1cD4...8e3a"],
    watcher: "0xA7b3...9e55",
    violation: 0,
    confirmations: 2,
    notes: "Coordinated sybil cluster found via on-chain analysis",
  },
  {
    reportId: 6n,
    scheduledAt: Math.floor(Date.now() / 1000) - 50 * 3600, // 50h ago (ready)
    executed: false,
    cancelled: false,
    subjects: ["0x8bC2...5a19"],
    watcher: "0x3F2A...B251",
    violation: 3,
    confirmations: 2,
    notes: "Reputation farming across 3 alt accounts",
  },
  {
    reportId: 5n,
    scheduledAt: Math.floor(Date.now() / 1000) - 72 * 3600,
    executed: true,
    cancelled: false,
    subjects: ["0x3dE1...7f44"],
    watcher: "0xA7b3...9e55",
    violation: 1,
    confirmations: 3,
    notes: "Self-dealing on escrow jobs, stake seized: 5,240 LOB",
  },
  {
    reportId: 4n,
    scheduledAt: Math.floor(Date.now() / 1000) - 96 * 3600,
    executed: true,
    cancelled: true,
    subjects: ["0x9eF2...4b77"],
    watcher: "0xB4c8...7a22",
    violation: 2,
    confirmations: 2,
    notes: "Cancelled on appeal - coordinated voting claim disproven",
  },
];

interface MockEscrowEntry {
  account: string;
  amount: string; // formatted LOB
  expiry: number; // unix seconds
  reportId: bigint;
}

const MOCK_ESCROW_ENTRIES: MockEscrowEntry[] = [
  {
    account: "0x3dE1...7f44",
    amount: "5,240",
    expiry: Math.floor(Date.now() / 1000) + 22 * 24 * 3600, // 22 days left
    reportId: 5n,
  },
  {
    account: "0x7a3B...9f21",
    amount: "1,800",
    expiry: Math.floor(Date.now() / 1000) + 28 * 24 * 3600, // 28 days left
    reportId: 7n,
  },
  {
    account: "0x6fA9...1d33",
    amount: "12,500",
    expiry: Math.floor(Date.now() / 1000) - 2 * 24 * 3600, // expired 2 days ago
    reportId: 3n,
  },
];

/* ──── Helpers ────────────────────────────────────────────────── */

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / (1000 * 60));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function truncateAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatCountdown(targetUnixSecs: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = targetUnixSecs - now;
  if (diff <= 0) return "Ready";
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const mins = Math.floor((diff % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function formatDaysLeft(targetUnixSecs: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = targetUnixSecs - now;
  if (diff <= 0) return "Releasable";
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  if (days > 0) return `${days}d ${hours}h remaining`;
  return `${hours}h remaining`;
}

/* ──── Mod Activity Bar Chart ─────────────────────────────────── */

const MOD_ACTION_COLORS: Record<string, string> = {
  approve: "#58B059",
  warn: "#F59E0B",
  remove: "#F97316",
  mute: "#3B82F6",
  ban: "#EF4444",
};

function ModActivityBarTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; payload: { fill: string; label: string } }>;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="rounded-md border border-border/60 bg-surface-0/95 backdrop-blur px-3 py-2 shadow-lg">
      <p className="text-xs font-medium text-text-primary">{d.payload.label}</p>
      <p className="text-xs tabular-nums" style={{ color: d.payload.fill }}>
        {d.value} action{d.value !== 1 ? "s" : ""}
      </p>
    </div>
  );
}

function ModActivityChart({ actions }: { actions: ModAction[] }) {
  const chartData = useMemo(() => {
    const counts: Record<ActionType, number> = { approve: 0, warn: 0, remove: 0, mute: 0, ban: 0 };
    actions.forEach((a) => {
      counts[a.action] = (counts[a.action] ?? 0) + 1;
    });
    return [
      { label: "Approved", key: "approve", count: counts.approve, fill: MOD_ACTION_COLORS.approve },
      { label: "Warned", key: "warn", count: counts.warn, fill: MOD_ACTION_COLORS.warn },
      { label: "Removed", key: "remove", count: counts.remove, fill: MOD_ACTION_COLORS.remove },
      { label: "Muted", key: "mute", count: counts.mute, fill: MOD_ACTION_COLORS.mute },
      { label: "Banned", key: "ban", count: counts.ban, fill: MOD_ACTION_COLORS.ban },
    ];
  }, [actions]);

  return (
    <div className="card p-4">
      <h3 className="text-[10px] sm:text-xs font-semibold text-text-primary uppercase tracking-wider mb-3 flex items-center gap-1.5">
        Mod Actions Breakdown
        <InfoButton infoKey="mod.actions" />
      </h3>
      <div className="h-[140px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 4, right: 4, bottom: 4, left: 4 }}
          >
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: "#5E6673" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#5E6673" }}
              axisLine={false}
              tickLine={false}
              width={20}
              allowDecimals={false}
            />
            <Tooltip
              content={<ModActivityBarTooltip />}
              cursor={{ fill: "rgba(255,255,255,0.03)" }}
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]} animationDuration={1200}>
              {chartData.map((entry) => (
                <Cell key={entry.key} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ──── Flag Reason Donut ─────────────────────────────────────── */

const FLAG_REASON_COLORS: Record<string, string> = {
  scam: "#A855F7",
  harassment: "#EF4444",
  spam: "#F59E0B",
  "off-topic": "#3B82F6",
};

function FlagReasonDonutTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; payload: { fill: string } }>;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="rounded-md border border-border/60 bg-surface-0/95 backdrop-blur px-3 py-2 shadow-lg">
      <p className="text-xs font-medium text-text-primary">{d.name}</p>
      <p className="text-xs tabular-nums" style={{ color: d.payload.fill }}>
        {d.value} flag{d.value !== 1 ? "s" : ""}
      </p>
    </div>
  );
}

function FlagReasonDonut({ posts }: { posts: FlaggedPost[] }) {
  const chartData = useMemo(() => {
    const counts: Record<string, number> = {};
    posts.forEach((p) => {
      counts[p.reason] = (counts[p.reason] ?? 0) + 1;
    });
    return Object.entries(counts).map(([reason, count]) => ({
      name: reason.charAt(0).toUpperCase() + reason.slice(1),
      value: count,
      fill: FLAG_REASON_COLORS[reason] ?? "#5E6673",
    }));
  }, [posts]);

  if (chartData.length === 0) return null;

  return (
    <div className="card p-4">
      <h3 className="text-[10px] sm:text-xs font-semibold text-text-primary uppercase tracking-wider mb-3 flex items-center gap-1.5">
        Flagged by Reason
        <InfoButton infoKey="mod.queue" />
      </h3>
      <div className="flex items-center gap-4">
        <div className="w-[100px] h-[100px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={28}
                outerRadius={45}
                paddingAngle={3}
                dataKey="value"
                strokeWidth={0}
                animationDuration={1000}
              >
                {chartData.map((entry) => (
                  <Cell key={entry.name} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip content={<FlagReasonDonutTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-col gap-1.5">
          {chartData.map((d) => (
            <div key={d.name} className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.fill }} />
              <span className="text-[10px] text-text-tertiary">{d.name}</span>
              <span className="text-[10px] text-text-secondary font-bold tabular-nums">{d.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ──── Stats Row ──────────────────────────────────────────────── */

function ModStats() {
  const totalReports = useTotalReports();
  const totalBans = useTotalBans();
  const totalSeized = useTotalSeized();

  const seizedFormatted = totalSeized.data
    ? parseFloat(formatEther(totalSeized.data as bigint)).toLocaleString(undefined, { maximumFractionDigits: 0 })
    : "--";

  const stats = [
    { label: "Flagged Posts", value: "4", icon: Flag, color: "#F59E0B" },
    { label: "On-Chain Bans", value: totalBans.data?.toString() ?? "--", icon: Ban, color: "#EF4444" },
    { label: "Total Reports", value: totalReports.data?.toString() ?? "--", icon: Shield, color: "#A855F7" },
    { label: "LOB Seized", value: seizedFormatted, icon: Coins, color: "#3B82F6" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {stats.map((stat, i) => {
        const Icon = stat.icon;
        return (
          <motion.div
            key={stat.label}
            className="card p-4 relative overflow-hidden group"
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.1 + i * 0.06, ease }}
            whileHover={{ y: -2 }}
          >
            <motion.div
              className="absolute top-0 left-0 right-0 h-px opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ background: `linear-gradient(to right, transparent, ${stat.color}30, transparent)` }}
            />
            <Icon className="w-4 h-4 mb-2" style={{ color: stat.color }} />
            <p className="text-xl font-bold text-text-primary tabular-nums">{stat.value}</p>
            <p className="text-[9px] text-text-tertiary uppercase tracking-wider mt-0.5">{stat.label}</p>
          </motion.div>
        );
      })}
    </div>
  );
}

/* ──── Flagged Content Card ───────────────────────────────────── */

function FlaggedCard({
  post,
  onAction,
}: {
  post: FlaggedPost;
  onAction: (postId: string, action: string) => void;
}) {
  const reasonStyle = FLAG_REASON_STYLES[post.reason];

  return (
    <motion.div
      className="card p-4 hover:border-lob-red/20 transition-colors"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -1 }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-semibold text-text-primary truncate">
              {post.title}
            </h3>
            <span
              className={`text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded border whitespace-nowrap ${reasonStyle.bg} ${reasonStyle.text} ${reasonStyle.border}`}
            >
              {post.reason}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-text-tertiary">
            <span className="font-mono">{post.author}</span>
            <span className="flex items-center gap-1">
              <Flag className="w-3 h-3" />
              <span className="tabular-nums">{post.flagCount} flags</span>
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {timeAgo(post.flaggedAt)}
            </span>
          </div>
        </div>
      </div>

      {/* Excerpt */}
      <p className="text-xs text-text-secondary leading-relaxed mb-3 border-l-2 border-border pl-3">
        {post.excerpt}
      </p>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <motion.button
          className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-400/20 hover:bg-emerald-500/20 transition-colors min-h-[36px]"
          whileTap={{ scale: 0.97 }}
          onClick={() => onAction(post.id, "approve")}
        >
          <CheckCircle2 className="w-3 h-3" />
          Approve
        </motion.button>
        <motion.button
          className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1.5 rounded bg-yellow-500/10 text-yellow-400 border border-yellow-400/20 hover:bg-yellow-500/20 transition-colors min-h-[36px]"
          whileTap={{ scale: 0.97 }}
          onClick={() => onAction(post.id, "warn")}
        >
          <AlertTriangle className="w-3 h-3" />
          Warn
        </motion.button>
        <motion.button
          className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1.5 rounded bg-lob-red-dim text-lob-red border border-lob-red/20 hover:bg-lob-red/20 transition-colors min-h-[36px]"
          whileTap={{ scale: 0.97 }}
          onClick={() => onAction(post.id, "remove")}
        >
          <XCircle className="w-3 h-3" />
          Remove
        </motion.button>
        <motion.button
          className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors min-h-[36px]"
          whileTap={{ scale: 0.97 }}
          onClick={() => onAction(post.id, "ban")}
        >
          <Ban className="w-3 h-3" />
          Ban
        </motion.button>
      </div>
    </motion.div>
  );
}

/* ──── Mod Action Row ─────────────────────────────────────────── */

function ActionRow({ action }: { action: ModAction }) {
  const style = ACTION_STYLES[action.action];

  return (
    <motion.div
      className="card p-4"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span
            className={`text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded border ${style.bg} ${style.text} ${style.border}`}
          >
            {style.label}
          </span>
          {action.targetPost && (
            <span className="text-xs text-text-secondary truncate max-w-[240px]">
              {action.targetPost}
            </span>
          )}
        </div>
        <span className="text-[10px] text-text-tertiary tabular-nums whitespace-nowrap">
          {timeAgo(action.timestamp)}
        </span>
      </div>
      <div className="flex items-center gap-3 text-xs text-text-tertiary">
        <span>
          Target: <span className="font-mono text-text-secondary">{action.targetUser}</span>
        </span>
        <span>
          Mod: <span className="font-mono text-text-secondary">{action.mod}</span>
        </span>
      </div>
      {action.note && (
        <p className="text-[11px] text-text-tertiary mt-1.5 italic">
          &quot;{action.note}&quot;
        </p>
      )}
    </motion.div>
  );
}

/* ──── Guidelines Section ─────────────────────────────────────── */

function GuidelinesTab() {
  const tiers = [
    {
      level: 1,
      label: "Warning",
      desc: "Formal written warning. Notification sent to user. No restrictions applied.",
      color: "#F59E0B",
      icon: MessageSquareWarning,
    },
    {
      level: 2,
      label: "24h Mute",
      desc: "User cannot post or comment for 24 hours. Escalated from warning for repeat minor offenses.",
      color: "#3B82F6",
      icon: Clock,
    },
    {
      level: 3,
      label: "7-Day Ban",
      desc: "Full forum access revoked for 7 days. Applied for serious violations or pattern of abuse.",
      color: "#F97316",
      icon: Ban,
    },
    {
      level: 4,
      label: "Permanent Ban",
      desc: "Wallet address permanently banned. On-chain SybilGuard report filed. Stake slashed if applicable.",
      color: "#EF4444",
      icon: XCircle,
    },
  ];

  const guidelines = [
    { title: "No Spam or Self-Promotion", desc: "Repeated promotional content, affiliate links, or unrelated advertising will be removed." },
    { title: "No Harassment or Threats", desc: "Personal attacks, doxxing threats, or discriminatory language result in immediate escalation." },
    { title: "Stay On Topic", desc: "Posts should be relevant to LOBSTR, DeFi, governance, or the broader ecosystem." },
    { title: "No Scams or Phishing", desc: "Fake airdrops, malicious links, or impersonation attempts result in immediate ban." },
    { title: "Respect Privacy", desc: "Do not share personal information of other users without their consent." },
    { title: "Good Faith Participation", desc: "Engage constructively. Disagreement is welcome; bad faith is not." },
  ];

  return (
    <div className="space-y-6">
      {/* Community Guidelines */}
      <div className="card p-3 sm:p-5">
        <h3 className="text-[10px] sm:text-xs font-semibold text-text-primary uppercase tracking-wider mb-4">
          Community Guidelines
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {guidelines.map((g, i) => (
            <motion.div
              key={g.title}
              className="rounded-lg border border-border/60 p-3"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.05, ease }}
            >
              <div className="flex items-start gap-2">
                <ChevronRight className="w-3 h-3 text-lob-green mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-text-primary">{g.title}</p>
                  <p className="text-[10px] text-text-tertiary leading-relaxed mt-0.5">{g.desc}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Enforcement Tiers */}
      <div className="card p-3 sm:p-5">
        <h3 className="text-[10px] sm:text-xs font-semibold text-text-primary uppercase tracking-wider mb-4">
          Enforcement Tiers
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {tiers.map((tier, i) => {
            const Icon = tier.icon;
            return (
              <motion.div
                key={tier.label}
                className="rounded-lg border border-border/60 p-4 relative overflow-hidden group"
                style={{ borderColor: `${tier.color}20` }}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1 + i * 0.08, ease }}
                whileHover={{ y: -2, borderColor: `${tier.color}40` }}
              >
                <motion.div
                  className="absolute top-0 left-0 right-0 h-px opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ background: `linear-gradient(to right, transparent, ${tier.color}30, transparent)` }}
                />
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: `${tier.color}15` }}
                  >
                    <Icon className="w-4 h-4" style={{ color: tier.color }} />
                  </div>
                  <div>
                    <p className="text-[10px] text-text-tertiary uppercase tracking-wider">
                      Tier {tier.level}
                    </p>
                    <p className="text-sm font-bold" style={{ color: tier.color }}>
                      {tier.label}
                    </p>
                  </div>
                </div>
                <p className="text-[10px] text-text-tertiary leading-relaxed">
                  {tier.desc}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Escalation Process */}
      <div className="card p-3 sm:p-5">
        <h3 className="text-[10px] sm:text-xs font-semibold text-text-primary uppercase tracking-wider mb-4">
          Escalation Process
        </h3>
        <div className="space-y-3">
          {[
            {
              step: "1",
              title: "Community Flagging",
              desc: "Users flag content via the report button. Posts with 3+ flags are auto-queued for mod review.",
            },
            {
              step: "2",
              title: "Mod Review",
              desc: "Any mod can review flagged content. For bans, a second mod must confirm within 24h.",
            },
            {
              step: "3",
              title: "Action & Notification",
              desc: "Action is taken and the user is notified with the reason. All actions are logged for transparency.",
            },
            {
              step: "4",
              title: "Appeal Process",
              desc: "Users may appeal bans via the Governance forum. Appeals require a Lead Mod or DAO vote to overturn.",
            },
          ].map((item, i) => (
            <motion.div
              key={item.step}
              className="flex items-start gap-3"
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.1 + i * 0.08, ease }}
            >
              <div className="w-6 h-6 rounded-full bg-lob-green-muted border border-lob-green/20 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-[10px] font-bold text-lob-green">{item.step}</span>
              </div>
              <div>
                <p className="text-xs font-semibold text-text-primary">{item.title}</p>
                <p className="text-[10px] text-text-tertiary leading-relaxed mt-0.5">{item.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ──── Mod Chat Tab ───────────────────────────────────────────── */

function ModChatTab() {
  const [messages] = useState<ModMessage[]>(MOCK_MESSAGES);
  const [draft, setDraft] = useState("");

  return (
    <div className="card p-3 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[10px] sm:text-xs font-semibold text-text-primary uppercase tracking-wider">
          Mod Coordination Channel
        </h3>
        <span className="text-[10px] text-text-tertiary">
          {messages.length} messages
        </span>
      </div>

      {/* Messages */}
      <div className="space-y-3 mb-4 max-h-[400px] overflow-y-auto pr-1">
        {messages.map((msg, i) => (
          <motion.div
            key={msg.id}
            className="flex items-start gap-3"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: i * 0.05, ease }}
          >
            <div className="w-7 h-7 rounded-full bg-surface-3 border border-border/60 flex items-center justify-center shrink-0">
              <span className="text-[9px] font-bold text-text-secondary">
                {msg.authorLabel.slice(0, 2).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs font-semibold text-text-primary">
                  {msg.authorLabel}
                </span>
                <span className="text-[10px] text-text-tertiary font-mono">
                  {truncateAddress(msg.author)}
                </span>
                <span className="text-[10px] text-text-tertiary tabular-nums">
                  {timeAgo(msg.timestamp)}
                </span>
              </div>
              <p className="text-xs text-text-secondary leading-relaxed">
                {msg.message}
              </p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Compose */}
      <div className="flex items-center gap-2 pt-3 border-t border-border/50">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Message the mod team..."
          className="flex-1 bg-surface-2 border border-border rounded px-3 py-2 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-lob-green/40 transition-colors"
        />
        <motion.button
          className="w-8 h-8 rounded-lg bg-lob-green-muted border border-lob-green/20 flex items-center justify-center text-lob-green hover:bg-lob-green/20 transition-colors"
          whileTap={{ scale: 0.95 }}
          disabled={!draft.trim()}
        >
          <Send className="w-3.5 h-3.5" />
        </motion.button>
      </div>
    </div>
  );
}

/* ──── Countdown Hook ─────────────────────────────────────────── */

function useCountdown(targetUnixSecs: number) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const iv = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(iv);
  }, []);

  const remaining = targetUnixSecs - now;
  return { remaining, isReady: remaining <= 0 };
}

/* ──── Scheduled Ban Card ─────────────────────────────────────── */

function ScheduledBanCard({
  ban,
  hasAppealsRole,
  onExecute,
  onCancel,
}: {
  ban: MockScheduledBan;
  hasAppealsRole: boolean;
  onExecute: (reportId: bigint) => void;
  onCancel: (reportId: bigint) => void;
}) {
  const executeAt = ban.scheduledAt + BAN_DELAY_SECS;
  const { remaining, isReady } = useCountdown(executeAt);
  const [loading, setLoading] = useState(false);

  const getStatus = () => {
    if (ban.cancelled) return { label: "Cancelled", color: "#6B7280", bg: "bg-gray-500/10", border: "border-gray-500/20" };
    if (ban.executed) return { label: "Executed", color: "#58B059", bg: "bg-emerald-500/10", border: "border-emerald-500/20" };
    if (isReady) return { label: "Ready to Execute", color: "#F59E0B", bg: "bg-yellow-500/10", border: "border-yellow-500/20" };
    return { label: "Scheduled", color: "#3B82F6", bg: "bg-blue-500/10", border: "border-blue-500/20" };
  };

  const status = getStatus();

  return (
    <motion.div
      className="card p-4"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -1 }}
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-text-primary tabular-nums">
            Report #{ban.reportId.toString()}
          </span>
          <span
            className={`text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded border ${status.bg} ${status.border}`}
            style={{ color: status.color }}
          >
            {status.label}
          </span>
          <span className="text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded border bg-purple-500/10 text-purple-400 border-purple-400/20">
            {VIOLATION_LABELS[ban.violation] ?? "Unknown"}
          </span>
        </div>
        {!ban.executed && !ban.cancelled && (
          <div className="flex items-center gap-1.5">
            <Timer className="w-3 h-3 text-text-tertiary" />
            <span className={`text-xs font-mono tabular-nums ${isReady ? "text-yellow-400" : "text-text-secondary"}`}>
              {isReady ? "48h elapsed" : formatCountdown(executeAt)}
            </span>
          </div>
        )}
      </div>

      {/* Details */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3 text-xs">
        <div>
          <span className="text-text-tertiary">Targets: </span>
          <span className="font-mono text-text-secondary">
            {ban.subjects.join(", ")}
          </span>
        </div>
        <div>
          <span className="text-text-tertiary">Watcher: </span>
          <span className="font-mono text-text-secondary">{ban.watcher}</span>
        </div>
        <div>
          <span className="text-text-tertiary">Judges: </span>
          <span className="text-text-secondary tabular-nums">{ban.confirmations} confirmed</span>
        </div>
      </div>

      {/* Notes */}
      {ban.notes && (
        <p className="text-[11px] text-text-tertiary mb-3 italic border-l-2 border-border pl-3">
          &quot;{ban.notes}&quot;
        </p>
      )}

      {/* Progress bar for countdown */}
      {!ban.executed && !ban.cancelled && (
        <div className="mb-3">
          <div className="w-full h-1 rounded-full bg-surface-3 overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{
                backgroundColor: isReady ? "#F59E0B" : "#3B82F6",
                width: `${Math.min(100, ((BAN_DELAY_SECS - remaining) / BAN_DELAY_SECS) * 100)}%`,
              }}
              initial={{ width: 0 }}
              animate={{
                width: `${Math.min(100, ((BAN_DELAY_SECS - remaining) / BAN_DELAY_SECS) * 100)}%`,
              }}
              transition={{ duration: 1 }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[9px] text-text-tertiary">Scheduled</span>
            <span className="text-[9px] text-text-tertiary">48h delay</span>
            <span className="text-[9px] text-text-tertiary">Executable</span>
          </div>
        </div>
      )}

      {/* Action buttons */}
      {!ban.executed && !ban.cancelled && (
        <div className="flex items-center gap-2">
          <motion.button
            className={`inline-flex items-center gap-1 text-[11px] font-medium px-3 py-1.5 rounded transition-colors ${
              isReady
                ? "bg-lob-red-dim text-lob-red border border-lob-red/20 hover:bg-lob-red/20"
                : "bg-surface-2 text-text-tertiary border border-border cursor-not-allowed opacity-50"
            }`}
            whileTap={isReady ? { scale: 0.97 } : undefined}
            disabled={!isReady || loading}
            onClick={async () => {
              setLoading(true);
              try {
                await onExecute(ban.reportId);
              } finally {
                setLoading(false);
              }
            }}
          >
            {loading ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Gavel className="w-3 h-3" />
            )}
            Execute Ban
          </motion.button>
          {hasAppealsRole && (
            <motion.button
              className="inline-flex items-center gap-1 text-[11px] font-medium px-3 py-1.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-400/20 hover:bg-emerald-500/20 transition-colors"
              whileTap={{ scale: 0.97 }}
              disabled={loading}
              onClick={async () => {
                setLoading(true);
                try {
                  await onCancel(ban.reportId);
                } finally {
                  setLoading(false);
                }
              }}
            >
              {loading ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <XCircle className="w-3 h-3" />
              )}
              Cancel Ban
            </motion.button>
          )}
        </div>
      )}
    </motion.div>
  );
}

/* ──── Sybil Bans Tab ─────────────────────────────────────────── */

function SybilBansTab() {
  const { address } = useAccount();
  const appealsRole = useAppealsRole();
  const hasAppeals = useSybilGuardHasRole(
    appealsRole.data as `0x${string}` | undefined,
    address
  );

  const executeBan = useExecuteBan();
  const cancelBan = useCancelBan();

  const [banFilter, setBanFilter] = useState<"all" | "scheduled" | "ready" | "executed" | "cancelled">("all");
  const [txStatus, setTxStatus] = useState<string | null>(null);

  const now = Math.floor(Date.now() / 1000);

  const filteredBans = MOCK_SCHEDULED_BANS.filter((b) => {
    if (banFilter === "all") return true;
    if (banFilter === "scheduled") return !b.executed && !b.cancelled && (b.scheduledAt + BAN_DELAY_SECS) > now;
    if (banFilter === "ready") return !b.executed && !b.cancelled && (b.scheduledAt + BAN_DELAY_SECS) <= now;
    if (banFilter === "executed") return b.executed && !b.cancelled;
    if (banFilter === "cancelled") return b.cancelled;
    return true;
  });

  const handleExecute = useCallback(async (reportId: bigint) => {
    try {
      setTxStatus("Executing ban...");
      await executeBan(reportId);
      setTxStatus("Ban executed successfully");
      setTimeout(() => setTxStatus(null), 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      setTxStatus(`Error: ${msg.slice(0, 80)}`);
      setTimeout(() => setTxStatus(null), 5000);
    }
  }, [executeBan]);

  const handleCancel = useCallback(async (reportId: bigint) => {
    try {
      setTxStatus("Cancelling ban...");
      await cancelBan(reportId);
      setTxStatus("Ban cancelled successfully");
      setTimeout(() => setTxStatus(null), 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      setTxStatus(`Error: ${msg.slice(0, 80)}`);
      setTimeout(() => setTxStatus(null), 5000);
    }
  }, [cancelBan]);

  return (
    <div className="space-y-4">
      {/* Info banner */}
      <div className="card p-4 border-blue-500/20">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
            <ShieldAlert className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <p className="text-xs font-semibold text-text-primary mb-0.5">SybilGuard Delayed Ban System</p>
            <p className="text-[10px] text-text-tertiary leading-relaxed">
              Confirmed reports enter a 48-hour delay window before execution. During this window, APPEALS_ROLE holders can
              cancel false positives. After 48 hours, anyone can execute the ban permissionlessly.
              {hasAppeals.data ? (
                <span className="text-emerald-400 font-medium"> You have APPEALS_ROLE.</span>
              ) : (
                <span className="text-text-tertiary"> You do not have APPEALS_ROLE.</span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Tx status banner */}
      <AnimatePresence>
        {txStatus && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className={`card p-3 text-xs font-medium ${
              txStatus.startsWith("Error")
                ? "text-red-400 border-red-500/20"
                : txStatus.includes("successfully")
                ? "text-emerald-400 border-emerald-500/20"
                : "text-blue-400 border-blue-500/20"
            }`}
          >
            <div className="flex items-center gap-2">
              {txStatus.includes("...") && <Loader2 className="w-3 h-3 animate-spin" />}
              {txStatus.includes("successfully") && <CheckCircle2 className="w-3 h-3" />}
              {txStatus.startsWith("Error") && <XCircle className="w-3 h-3" />}
              {txStatus}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filter pills */}
      <div className="flex flex-wrap gap-1.5">
        {(["all", "scheduled", "ready", "executed", "cancelled"] as const).map((type) => (
          <button
            key={type}
            onClick={() => setBanFilter(type)}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all duration-150 capitalize ${
              banFilter === type
                ? "bg-purple-500/10 text-purple-400 border border-purple-400/30"
                : "bg-surface-2 text-text-tertiary border border-transparent hover:text-text-secondary hover:bg-surface-3"
            }`}
          >
            {type === "all" && <Filter className="w-3 h-3" />}
            {type === "scheduled" && <Timer className="w-3 h-3" />}
            {type === "ready" && <AlertTriangle className="w-3 h-3" />}
            {type === "executed" && <CheckCircle2 className="w-3 h-3" />}
            {type === "cancelled" && <XCircle className="w-3 h-3" />}
            {type}
          </button>
        ))}
      </div>

      {/* Ban list */}
      <div className="space-y-3">
        {filteredBans.length === 0 ? (
          <div className="card text-center py-12 px-4">
            <p className="text-sm text-text-secondary">No bans match this filter</p>
          </div>
        ) : (
          filteredBans.map((ban) => (
            <ScheduledBanCard
              key={ban.reportId.toString()}
              ban={ban}
              hasAppealsRole={!!hasAppeals.data}
              onExecute={handleExecute}
              onCancel={handleCancel}
            />
          ))
        )}
      </div>

      {/* Protocol constants */}
      <div className="card p-4">
        <h4 className="text-[10px] text-text-tertiary uppercase tracking-wider mb-3 font-semibold">Protocol Constants</h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { label: "Ban Delay", value: "48 hours" },
            { label: "Seizure Escrow", value: "30 days" },
            { label: "Watcher Reward", value: "10% of seized" },
            { label: "Judge Reward", value: "100 LOB flat" },
            { label: "High-Stake Threshold", value: "10,000 LOB" },
            { label: "High-Stake Judges", value: "3 (vs 2)" },
          ].map((c) => (
            <div key={c.label} className="rounded-lg border border-border/40 p-2.5">
              <p className="text-[9px] text-text-tertiary uppercase tracking-wider">{c.label}</p>
              <p className="text-xs font-bold text-text-primary mt-0.5 tabular-nums">{c.value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ──── Escrow Entry Card ──────────────────────────────────────── */

function EscrowEntryCard({
  entry,
  onRelease,
}: {
  entry: MockEscrowEntry;
  onRelease: (account: string) => void;
}) {
  const { isReady } = useCountdown(entry.expiry);
  const [loading, setLoading] = useState(false);

  return (
    <motion.div
      className="card p-4"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -1 }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-orange-500/10 flex items-center justify-center">
            <Coins className="w-3.5 h-3.5 text-orange-400" />
          </div>
          <div>
            <span className="text-xs font-bold text-text-primary font-mono">{entry.account}</span>
            <p className="text-[10px] text-text-tertiary">Report #{entry.reportId.toString()}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold text-text-primary tabular-nums">{entry.amount} LOB</p>
          <p className={`text-[10px] tabular-nums ${isReady ? "text-yellow-400" : "text-text-tertiary"}`}>
            {formatDaysLeft(entry.expiry)}
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-3">
        <div className="w-full h-1 rounded-full bg-surface-3 overflow-hidden">
          {(() => {
            const elapsedSecs = Math.floor(Date.now() / 1000) - (entry.expiry - SEIZURE_ESCROW_SECS);
            const pct = Math.min(100, Math.max(0, (elapsedSecs / SEIZURE_ESCROW_SECS) * 100));
            return (
              <div
                className="h-full rounded-full transition-all duration-1000"
                style={{
                  backgroundColor: isReady ? "#F59E0B" : "#F97316",
                  width: `${pct}%`,
                }}
              />
            );
          })()}
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[9px] text-text-tertiary">Seized</span>
          <span className="text-[9px] text-text-tertiary">30-day escrow</span>
          <span className="text-[9px] text-text-tertiary">Release</span>
        </div>
      </div>

      {/* Release button */}
      <motion.button
        className={`inline-flex items-center gap-1 text-[11px] font-medium px-3 py-1.5 rounded transition-colors ${
          isReady
            ? "bg-yellow-500/10 text-yellow-400 border border-yellow-400/20 hover:bg-yellow-500/20"
            : "bg-surface-2 text-text-tertiary border border-border cursor-not-allowed opacity-50"
        }`}
        whileTap={isReady ? { scale: 0.97 } : undefined}
        disabled={!isReady || loading}
        onClick={async () => {
          setLoading(true);
          try {
            await onRelease(entry.account);
          } finally {
            setLoading(false);
          }
        }}
      >
        {loading ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : isReady ? (
          <Unlock className="w-3 h-3" />
        ) : (
          <Lock className="w-3 h-3" />
        )}
        {isReady ? "Release to Treasury" : "Escrow Locked"}
      </motion.button>
    </motion.div>
  );
}

/* ──── Seizure Escrow Tab ─────────────────────────────────────── */

function SeizureEscrowTab() {
  const releaseEscrow = useReleaseEscrow();
  const [txStatus, setTxStatus] = useState<string | null>(null);

  const handleRelease = useCallback(async (account: string) => {
    try {
      setTxStatus("Releasing escrow...");
      await releaseEscrow(account as `0x${string}`);
      setTxStatus("Escrow released successfully");
      setTimeout(() => setTxStatus(null), 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Transaction failed";
      setTxStatus(`Error: ${msg.slice(0, 80)}`);
      setTimeout(() => setTxStatus(null), 5000);
    }
  }, [releaseEscrow]);

  const now = Math.floor(Date.now() / 1000);
  const releasable = MOCK_ESCROW_ENTRIES.filter((e) => e.expiry <= now);
  const locked = MOCK_ESCROW_ENTRIES.filter((e) => e.expiry > now);

  return (
    <div className="space-y-4">
      {/* Info banner */}
      <div className="card p-4 border-orange-500/20">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0">
            <Lock className="w-4 h-4 text-orange-400" />
          </div>
          <div>
            <p className="text-xs font-semibold text-text-primary mb-0.5">Seizure Escrow System</p>
            <p className="text-[10px] text-text-tertiary leading-relaxed">
              Seized funds are held in escrow for 30 days. If the ban is overturned on appeal during this window,
              funds are returned to the user. After 30 days, anyone can trigger release to the treasury (permissionless).
              Watcher and judge rewards are deducted at ban execution time.
            </p>
          </div>
        </div>
      </div>

      {/* Tx status banner */}
      <AnimatePresence>
        {txStatus && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className={`card p-3 text-xs font-medium ${
              txStatus.startsWith("Error")
                ? "text-red-400 border-red-500/20"
                : txStatus.includes("successfully")
                ? "text-emerald-400 border-emerald-500/20"
                : "text-blue-400 border-blue-500/20"
            }`}
          >
            <div className="flex items-center gap-2">
              {txStatus.includes("...") && <Loader2 className="w-3 h-3 animate-spin" />}
              {txStatus.includes("successfully") && <CheckCircle2 className="w-3 h-3" />}
              {txStatus.startsWith("Error") && <XCircle className="w-3 h-3" />}
              {txStatus}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="card p-3 text-center">
          <p className="text-lg font-bold text-text-primary tabular-nums">{MOCK_ESCROW_ENTRIES.length}</p>
          <p className="text-[9px] text-text-tertiary uppercase tracking-wider">Total Entries</p>
        </div>
        <div className="card p-3 text-center">
          <p className="text-lg font-bold text-yellow-400 tabular-nums">{releasable.length}</p>
          <p className="text-[9px] text-text-tertiary uppercase tracking-wider">Releasable</p>
        </div>
        <div className="card p-3 text-center">
          <p className="text-lg font-bold text-orange-400 tabular-nums">{locked.length}</p>
          <p className="text-[9px] text-text-tertiary uppercase tracking-wider">Locked</p>
        </div>
      </div>

      {/* Releasable section */}
      {releasable.length > 0 && (
        <div>
          <h4 className="text-[10px] text-yellow-400 uppercase tracking-wider font-semibold mb-2 flex items-center gap-1.5">
            <Unlock className="w-3 h-3" />
            Ready to Release ({releasable.length})
          </h4>
          <div className="space-y-3">
            {releasable.map((entry) => (
              <EscrowEntryCard
                key={entry.account}
                entry={entry}
                onRelease={handleRelease}
              />
            ))}
          </div>
        </div>
      )}

      {/* Locked section */}
      {locked.length > 0 && (
        <div>
          <h4 className="text-[10px] text-orange-400 uppercase tracking-wider font-semibold mb-2 flex items-center gap-1.5">
            <Lock className="w-3 h-3" />
            In Escrow ({locked.length})
          </h4>
          <div className="space-y-3">
            {locked.map((entry) => (
              <EscrowEntryCard
                key={entry.account}
                entry={entry}
                onRelease={handleRelease}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {MOCK_ESCROW_ENTRIES.length === 0 && (
        <div className="card text-center py-16 px-4">
          <motion.div
            className="w-12 h-12 rounded-full border border-border mx-auto mb-4 flex items-center justify-center"
            animate={{
              borderColor: [
                "rgba(30,36,49,1)",
                "rgba(249,115,22,0.3)",
                "rgba(30,36,49,1)",
              ],
            }}
            transition={{ duration: 3, repeat: Infinity }}
          >
            <Lock className="w-5 h-5 text-orange-400/60" />
          </motion.div>
          <p className="text-sm font-medium text-text-secondary">No seized funds in escrow</p>
          <p className="text-xs text-text-tertiary mt-1">
            Escrow entries appear when bans are executed with stake seizure.
          </p>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════ */
/* ── MAIN PAGE COMPONENT ──────────────────────────────────────── */
/* ══════════════════════════════════════════════════════════════════ */

export default function ModCenterPage() {
  const { isConnected } = useAccount();
  const [activeTab, setActiveTab] = useState<TabId>("flagged");
  const [flaggedPosts, setFlaggedPosts] = useState<FlaggedPost[]>(MOCK_FLAGGED);
  const [actionFilter, setActionFilter] = useState<"all" | ActionType>("all");

  /* Handle mod action on a flagged post */
  const handleAction = (postId: string, action: string) => {
    setFlaggedPosts((prev) => prev.filter((p) => p.id !== postId));
    // In production this would call an API and log the action
  };

  /* Filter mod actions */
  const filteredActions =
    actionFilter === "all"
      ? MOCK_ACTIONS
      : MOCK_ACTIONS.filter((a) => a.action === actionFilter);

  /* Tab counts */
  const scheduledCount = MOCK_SCHEDULED_BANS.filter((b) => !b.executed && !b.cancelled).length;
  const escrowCount = MOCK_ESCROW_ENTRIES.length;

  const tabCounts: Record<TabId, number | null> = {
    flagged: flaggedPosts.length,
    actions: MOCK_ACTIONS.length,
    "sybil-bans": scheduledCount,
    "seizure-escrow": escrowCount,
    guidelines: null,
    chat: MOCK_MESSAGES.length,
  };

  /* ── Wallet gate ───────────────────────────────────────────── */
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
              "rgba(168,85,247,0.3)",
              "rgba(30,36,49,1)",
            ],
          }}
          transition={{ duration: 3, repeat: Infinity }}
        >
          <Shield className="w-6 h-6 text-purple-400/60" />
        </motion.div>
        <h1 className="text-xl font-bold text-text-primary">Mod Center</h1>
        <p className="text-sm text-text-secondary">
          Connect your wallet to access moderation tools.
        </p>
        <ConnectButton />
      </motion.div>
    );
  }

  /* ── Main layout ───────────────────────────────────────────── */
  return (
    <motion.div initial="hidden" animate="show" variants={stagger}>
      {/* Header */}
      <motion.div variants={fadeUp} className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-400/20 flex items-center justify-center">
            <Shield className="w-4 h-4 text-purple-400" />
          </div>
          <h1 className="text-xl font-bold text-text-primary flex items-center gap-1.5">
            Mod Center
            <InfoButton infoKey="mod.header" />
          </h1>
          <span className="relative flex h-2 w-2 ml-1">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-lob-green opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-lob-green" />
          </span>
        </div>
        <p className="text-xs text-text-tertiary mt-0.5">
          Forum moderation coordination and tools
        </p>
      </motion.div>

      {/* Stats */}
      <motion.div variants={fadeUp} className="mb-6">
        <ModStats />
      </motion.div>

      {/* Activity Charts */}
      <motion.div variants={fadeUp} className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        <ModActivityChart actions={MOCK_ACTIONS} />
        <FlagReasonDonut posts={flaggedPosts} />
      </motion.div>

      {/* Tabs */}
      <motion.div variants={fadeUp} className="flex gap-0.5 mb-6 border-b border-border overflow-x-auto scrollbar-none">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="relative px-3 sm:px-4 py-2 text-sm font-medium -mb-px whitespace-nowrap shrink-0"
            >
              <motion.span
                animate={{ color: activeTab === tab.id ? "#EAECEF" : "#5E6673" }}
                className="relative z-10 flex items-center gap-1.5"
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden text-xs">{tab.label.split(" ")[0]}</span>
                {tabCounts[tab.id] !== null && (
                  <span
                    className={`text-[10px] tabular-nums px-1.5 py-0.5 rounded-full ${
                      activeTab === tab.id
                        ? "bg-surface-3 text-text-primary"
                        : "bg-surface-2 text-text-tertiary"
                    }`}
                  >
                    {tabCounts[tab.id]}
                  </span>
                )}
              </motion.span>
              {activeTab === tab.id && (
                <motion.div
                  layoutId="mod-tab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-400"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
            </button>
          );
        })}
      </motion.div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        {/* ═══ FLAGGED CONTENT ═══ */}
        {activeTab === "flagged" && (
          <motion.div
            key="flagged"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
          >
            {flaggedPosts.length === 0 ? (
              <div className="card text-center py-16 px-4">
                <motion.div
                  className="w-12 h-12 rounded-full border border-border mx-auto mb-4 flex items-center justify-center"
                  animate={{
                    borderColor: [
                      "rgba(30,36,49,1)",
                      "rgba(88,176,89,0.3)",
                      "rgba(30,36,49,1)",
                    ],
                  }}
                  transition={{ duration: 3, repeat: Infinity }}
                >
                  <CheckCircle2 className="w-5 h-5 text-lob-green/60" />
                </motion.div>
                <p className="text-sm font-medium text-text-secondary">
                  All clear
                </p>
                <p className="text-xs text-text-tertiary mt-1">
                  No flagged content in the queue. Nice work.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] text-text-tertiary uppercase tracking-wider">
                    {flaggedPosts.length} item{flaggedPosts.length !== 1 ? "s" : ""} in queue
                  </p>
                  <div className="flex items-center gap-1 text-[10px] text-text-tertiary">
                    <ArrowUpRight className="w-3 h-3" />
                    Sorted by flag count
                  </div>
                </div>
                {flaggedPosts.map((post) => (
                  <FlaggedCard
                    key={post.id}
                    post={post}
                    onAction={handleAction}
                  />
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* ═══ MOD ACTIONS ═══ */}
        {activeTab === "actions" && (
          <motion.div
            key="actions"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
          >
            {/* Filter pills */}
            <div className="flex flex-wrap gap-1.5 mb-4">
              {(["all", "approve", "warn", "remove", "mute", "ban"] as const).map(
                (type) => (
                  <button
                    key={type}
                    onClick={() => setActionFilter(type)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all duration-150 ${
                      actionFilter === type
                        ? "bg-lob-green/10 text-lob-green border border-lob-green/30"
                        : "bg-surface-2 text-text-tertiary border border-transparent hover:text-text-secondary hover:bg-surface-3"
                    }`}
                  >
                    {type === "all" ? (
                      <>
                        <Filter className="w-3 h-3" />
                        All
                      </>
                    ) : (
                      ACTION_STYLES[type].label
                    )}
                  </button>
                ),
              )}
            </div>

            {/* Action list */}
            <div className="space-y-2">
              {filteredActions.length === 0 ? (
                <div className="card text-center py-12 px-4">
                  <p className="text-sm text-text-secondary">
                    No actions match this filter
                  </p>
                </div>
              ) : (
                filteredActions.map((action) => (
                  <ActionRow key={action.id} action={action} />
                ))
              )}
            </div>
          </motion.div>
        )}

        {/* ═══ SYBIL BANS ═══ */}
        {activeTab === "sybil-bans" && (
          <motion.div
            key="sybil-bans"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
          >
            <SybilBansTab />
          </motion.div>
        )}

        {/* ═══ SEIZURE ESCROW ═══ */}
        {activeTab === "seizure-escrow" && (
          <motion.div
            key="seizure-escrow"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
          >
            <SeizureEscrowTab />
          </motion.div>
        )}

        {/* ═══ GUIDELINES ═══ */}
        {activeTab === "guidelines" && (
          <motion.div
            key="guidelines"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
          >
            <GuidelinesTab />
          </motion.div>
        )}

        {/* ═══ MOD CHAT ═══ */}
        {activeTab === "chat" && (
          <motion.div
            key="chat"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
          >
            <ModChatTab />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
