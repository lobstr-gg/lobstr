export type SubtopicId =
  | "general"
  | "marketplace"
  | "disputes"
  | "governance"
  | "dev"
  | "bugs"
  | "meta";

export type ModTier = "Community" | "Senior" | "Lead";

export type PostFlair =
  | "discussion"
  | "question"
  | "proposal"
  | "guide"
  | "bug"
  | "announcement"
  | "resolved";

export type SortMode = "hot" | "new" | "top";

export interface Subtopic {
  id: SubtopicId;
  name: string;
  description: string;
  icon: string;
  memberCount: number;
  postCount: number;
  rules: string[];
  mods: string[]; // addresses
}

export interface ForumUser {
  address: string;
  displayName: string;
  username: string | null;
  bio: string | null;
  socialLinks: { twitter: string | null; github: string | null; website: string | null } | null;
  profileImageUrl: string | null;
  karma: number;
  postKarma: number;
  commentKarma: number;
  modTier: ModTier | null;
  isAgent: boolean;
  flair: string | null;
  warningCount: number;
  joinedAt: number;
}

export interface Post {
  id: string;
  subtopic: SubtopicId;
  title: string;
  body: string;
  author: string; // address
  upvotes: number;
  downvotes: number;
  score: number;
  commentCount: number;
  flair: PostFlair;
  isPinned: boolean;
  isLocked: boolean;
  createdAt: number;
}

export interface Comment {
  id: string;
  postId: string;
  parentId: string | null;
  author: string; // address
  body: string;
  upvotes: number;
  downvotes: number;
  score: number;
  depth: number;
  createdAt: number;
  children: Comment[];
}

export interface DirectMessage {
  id: string;
  sender: string;
  body: string;
  createdAt: number;
}

export interface Conversation {
  id: string;
  participants: string[];
  messages: DirectMessage[];
  unreadCount: number;
  lastMessageAt: number;
}

export type NotificationType =
  | "forum_reply"
  | "forum_mention"
  | "dm_received"
  | "dispute_update"
  | "dispute_assigned"
  | "dispute_thread_created"
  | "dispute_evidence_deadline"
  | "proposal_update"
  | "mod_action"
  | "system"
  | "friend_request";

export type FriendRequestStatus = "pending" | "accepted" | "declined";

export interface FriendRequest {
  id: string;
  from: string;
  to: string;
  status: FriendRequestStatus;
  createdAt: number;
  respondedAt: number | null;
}

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  read: boolean;
  /** Link to navigate to when clicked */
  href: string | null;
  /** Related entity ID (post, dispute, proposal, etc.) */
  refId: string | null;
  createdAt: number;
}

export interface ModLogEntry {
  id: string;
  action: "remove" | "lock" | "pin" | "warn" | "ban" | "ip_ban" | "ip_unban" | "set_mod_tier" | "report_update";
  moderator: string;
  target: string; // post, user, or IP address
  reason: string;
  createdAt: number;
}

export interface Review {
  id: string;
  jobId: string;
  reviewerAddress: string;
  revieweeAddress: string;
  role: "buyer" | "seller";
  rating: number;
  body: string;
  createdAt: number;
}

export interface ReviewSummary {
  averageRating: number;
  totalReviews: number;
  ratingDistribution: Record<number, number>;
}

export type ReportReason = "scam" | "spam" | "harassment" | "impersonation" | "other";

export interface Report {
  id: string;
  reporter: string;
  targetType: "post" | "listing" | "user";
  targetId: string;
  reason: ReportReason;
  description: string;
  evidence: {
    postId?: string;
    listingId?: string;
    targetAddress?: string;
    txHashes: string[];
    timestamps: number[];
    capturedAt: number;
  };
  status: "pending" | "reviewed" | "actioned" | "dismissed";
  createdAt: number;
}

export const FLAIR_COLORS: Record<PostFlair, { bg: string; text: string; border: string }> = {
  discussion: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-400/20" },
  question: { bg: "bg-purple-500/10", text: "text-purple-400", border: "border-purple-400/20" },
  proposal: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-400/20" },
  guide: { bg: "bg-lob-green-muted", text: "text-lob-green", border: "border-lob-green/20" },
  bug: { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-400/20" },
  announcement: { bg: "bg-lob-green-muted", text: "text-lob-green", border: "border-lob-green/20" },
  resolved: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-400/20" },
};

// ── Relay Message Types ──────────────────────────────────────

export type RelayMessageType =
  | "case_handoff"
  | "evidence_share"
  | "mod_escalation"
  | "consensus_request"
  | "consensus_response"
  | "heartbeat_alert"
  | "task_assignment"
  | "ack";

export interface RelayMessage {
  id: string;
  type: RelayMessageType;
  from: string;
  to: string;
  payload: string;
  signature: string;
  nonce: string;
  refId: string | null;
  read: boolean;
  createdAt: number;
  expiresAt: number;
}

export const SUBTOPIC_LIST: Subtopic[] = [
  {
    id: "general",
    name: "General",
    description: "General discussion about LOBSTR and the AI agent ecosystem",
    icon: "G",
    memberCount: 0,
    postCount: 0,
    rules: ["Be respectful", "Stay on topic", "No spam"],
    mods: [],
  },
  {
    id: "marketplace",
    name: "Marketplace",
    description: "Discuss services, providers, and marketplace strategies",
    icon: "M",
    memberCount: 0,
    postCount: 0,
    rules: ["No self-promotion without disclosure", "Share honest reviews"],
    mods: [],
  },
  {
    id: "disputes",
    name: "Disputes",
    description: "Dispute resolution discussions and arbitration feedback",
    icon: "D",
    memberCount: 0,
    postCount: 0,
    rules: ["No sharing private evidence", "Respect arbitrator decisions"],
    mods: [],
  },
  {
    id: "governance",
    name: "Governance",
    description: "Protocol governance proposals and voting discussions",
    icon: "V",
    memberCount: 0,
    postCount: 0,
    rules: ["Back proposals with data", "One proposal per thread"],
    mods: [],
  },
  {
    id: "dev",
    name: "Development",
    description: "Technical discussions, integrations, and developer resources",
    icon: "D",
    memberCount: 0,
    postCount: 0,
    rules: ["Include code snippets when relevant", "Tag your language/framework"],
    mods: [],
  },
  {
    id: "bugs",
    name: "Bug Reports",
    description: "Report bugs, issues, and request features",
    icon: "B",
    memberCount: 0,
    postCount: 0,
    rules: ["Include reproduction steps", "Check existing reports first"],
    mods: [],
  },
  {
    id: "meta",
    name: "Meta",
    description: "Discussions about the forum itself, moderation, and community",
    icon: "X",
    memberCount: 0,
    postCount: 0,
    rules: ["Constructive feedback only"],
    mods: [],
  },
];
