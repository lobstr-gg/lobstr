/* ── DAO Governance Types & Utilities ─────────────────────────── */

export type ProposalStatus =
  | "active"
  | "pending"
  | "passed"
  | "failed"
  | "executed"
  | "cancelled";

export type ProposalType =
  | "parameter"
  | "treasury"
  | "upgrade"
  | "social"
  | "emergency";

export type VoteChoice = "for" | "against" | "abstain";

export interface ProposalAction {
  target: string;
  signature: string;
  description: string;
}

export interface Proposal {
  id: string;
  title: string;
  description: string;
  body: string;
  proposer: {
    address: string;
    name: string;
    tier: string;
  };
  type: ProposalType;
  status: ProposalStatus;
  createdAt: number;
  votingStartsAt: number;
  votingEndsAt: number;
  executedAt?: number;
  forVotes: number;
  againstVotes: number;
  abstainVotes: number;
  quorum: number;
  totalVoters: number;
  actions: ProposalAction[];
  forumThread: string;
  tags: string[];
}

export interface Delegate {
  address: string;
  name: string;
  votingPower: number;
  delegators: number;
  proposalsVoted: number;
  proposalsCreated: number;
  tier: string;
  statement: string;
}

export interface TreasuryAsset {
  symbol: string;
  balance: number;
  valueUSD: number;
  change24h: number;
}

export interface Bounty {
  id: string;
  title: string;
  description: string;
  category: BountyCategory;
  reward: number;
  rewardToken: "LOB" | "USDC";
  status: BountyStatus;
  difficulty: BountyDifficulty;
  postedBy: { address: string; name: string };
  claimedBy?: { address: string; name: string };
  createdAt: number;
  deadline: number;
  completedAt?: number;
  submissions: number;
  tags: string[];
  requirements: string[];
}

export type BountyStatus = "open" | "claimed" | "in_review" | "completed" | "expired";
export type BountyCategory = "development" | "design" | "documentation" | "research" | "community" | "security" | "marketing";
export type BountyDifficulty = "beginner" | "intermediate" | "advanced" | "expert";

/* ── Style Constants ─────────────────────────────────────────── */

export const STATUS_COLORS: Record<ProposalStatus, { bg: string; text: string; dot: string }> = {
  active: { bg: "bg-green-500/10", text: "text-green-400", dot: "bg-green-400" },
  pending: { bg: "bg-yellow-500/10", text: "text-yellow-400", dot: "bg-yellow-400" },
  passed: { bg: "bg-blue-500/10", text: "text-blue-400", dot: "bg-blue-400" },
  failed: { bg: "bg-red-500/10", text: "text-red-400", dot: "bg-red-400" },
  executed: { bg: "bg-purple-500/10", text: "text-purple-400", dot: "bg-purple-400" },
  cancelled: { bg: "bg-zinc-500/10", text: "text-zinc-400", dot: "bg-zinc-400" },
};

export const TYPE_LABELS: Record<ProposalType, { label: string; color: string }> = {
  parameter: { label: "Parameter", color: "text-orange-400" },
  treasury: { label: "Treasury", color: "text-yellow-400" },
  upgrade: { label: "Upgrade", color: "text-blue-400" },
  social: { label: "Social", color: "text-pink-400" },
  emergency: { label: "Emergency", color: "text-red-400" },
};

export const BOUNTY_STATUS_COLORS: Record<BountyStatus, { bg: string; text: string; dot: string }> = {
  open: { bg: "bg-green-500/10", text: "text-green-400", dot: "bg-green-400" },
  claimed: { bg: "bg-yellow-500/10", text: "text-yellow-400", dot: "bg-yellow-400" },
  in_review: { bg: "bg-blue-500/10", text: "text-blue-400", dot: "bg-blue-400" },
  completed: { bg: "bg-purple-500/10", text: "text-purple-400", dot: "bg-purple-400" },
  expired: { bg: "bg-zinc-500/10", text: "text-zinc-400", dot: "bg-zinc-400" },
};

export const DIFFICULTY_COLORS: Record<BountyDifficulty, string> = {
  beginner: "text-green-400",
  intermediate: "text-yellow-400",
  advanced: "text-orange-400",
  expert: "text-red-400",
};

export const CATEGORY_ICONS: Record<BountyCategory, string> = {
  development: "{ }",
  design: "~",
  documentation: "#",
  research: "?",
  community: "@",
  security: "!",
  marketing: "*",
};

/* ── Formatting Helpers ──────────────────────────────────────── */

export function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export function formatUSD(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

export function timeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export function timeUntil(timestamp: number): string {
  const diff = timestamp - Date.now();
  if (diff <= 0) return "Ended";
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 24) return `${hours}h left`;
  const days = Math.floor(hours / 24);
  return `${days}d left`;
}
