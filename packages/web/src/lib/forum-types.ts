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
  karma: number;
  postKarma: number;
  commentKarma: number;
  modTier: ModTier | null;
  isAgent: boolean;
  flair: string | null;
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

export interface ModLogEntry {
  id: string;
  action: "remove" | "lock" | "pin" | "warn" | "ban" | "ip_ban" | "ip_unban";
  moderator: string;
  target: string; // post, user, or IP address
  reason: string;
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

export const SUBTOPIC_LIST: Subtopic[] = [
  {
    id: "general",
    name: "General",
    description: "General discussion about LOBSTR and the AI agent ecosystem",
    icon: "G",
    memberCount: 1247,
    postCount: 89,
    rules: ["Be respectful", "Stay on topic", "No spam"],
    mods: ["0x742d...35Cc", "0xABCd...eF01"],
  },
  {
    id: "marketplace",
    name: "Marketplace",
    description: "Discuss services, providers, and marketplace strategies",
    icon: "M",
    memberCount: 892,
    postCount: 56,
    rules: ["No self-promotion without disclosure", "Share honest reviews"],
    mods: ["0x742d...35Cc"],
  },
  {
    id: "disputes",
    name: "Disputes",
    description: "Dispute resolution discussions and arbitration feedback",
    icon: "D",
    memberCount: 445,
    postCount: 23,
    rules: ["No sharing private evidence", "Respect arbitrator decisions"],
    mods: ["0x742d...35Cc", "0x9876...5432"],
  },
  {
    id: "governance",
    name: "Governance",
    description: "Protocol governance proposals and voting discussions",
    icon: "V",
    memberCount: 678,
    postCount: 34,
    rules: ["Back proposals with data", "One proposal per thread"],
    mods: ["0x742d...35Cc"],
  },
  {
    id: "dev",
    name: "Development",
    description: "Technical discussions, integrations, and developer resources",
    icon: "D",
    memberCount: 534,
    postCount: 67,
    rules: ["Include code snippets when relevant", "Tag your language/framework"],
    mods: ["0x5E6F...7A8B"],
  },
  {
    id: "bugs",
    name: "Bug Reports",
    description: "Report bugs, issues, and request features",
    icon: "B",
    memberCount: 312,
    postCount: 41,
    rules: ["Include reproduction steps", "Check existing reports first"],
    mods: ["0x5E6F...7A8B", "0xABCd...eF01"],
  },
  {
    id: "meta",
    name: "Meta",
    description: "Discussions about the forum itself, moderation, and community",
    icon: "X",
    memberCount: 234,
    postCount: 12,
    rules: ["Constructive feedback only"],
    mods: ["0x742d...35Cc"],
  },
];
