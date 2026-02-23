import "server-only";
import { randomBytes } from "crypto";
import { getDb } from "./firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import type {
  ForumUser,
  Post,
  Comment,
  Conversation,
  DirectMessage,
  ModLogEntry,
  SubtopicId,
  SortMode,
  Review,
  ReviewSummary,
} from "./forum-types";
import type { HumanBooking } from "@/app/rent-a-human/_data/types";

// ── Types (re-exported for backward compat) ──────────────────

export interface ApiKeyEntry {
  key: string;
  address: string;
  createdAt: number;
  expiresAt: number;
}

export interface ChallengeEntry {
  nonce: string;
  expiresAt: number;
}

export interface AirdropApprovalEntry {
  address: string;
  workspaceHash: string;
  approvedAt: number;
}

export interface BannedIpEntry {
  attempts: number;
  firstAttempt: number;
  lastAttempt: number;
  banned: boolean;
  /** Platform-wide ban fields (optional for legacy airdrop bans) */
  reason?: string;
  bannedBy?: string; // moderator address or "system"
  scope?: "airdrop" | "platform";
  bannedAt?: number;
  unbannedAt?: number;
}

// ── Collection refs ──────────────────────────────────────────

function col(name: string) {
  return getDb().collection(name);
}

// ── Short random ID generator ────────────────────────────────

const ALPHANUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** Generate a 7-char alphanumeric ID (62^7 ≈ 3.5 T combinations) */
export function generateId(): string {
  const bytes = randomBytes(7);
  let id = "";
  for (let i = 0; i < 7; i++) {
    id += ALPHANUM[bytes[i] % 62];
  }
  return id;
}

// ── Public user sanitization ─────────────────────────────────

/** Fields that should never appear in public-facing user responses */
export function sanitizeUserForPublic(
  user: ForumUser
): Omit<ForumUser, "warningCount"> {
  // eslint-disable-next-line no-unused-vars
  const { warningCount, ...publicUser } = user;
  return publicUser;
}

// ── Query helpers (all async) ────────────────────────────────

export async function getUserByAddress(
  address: string
): Promise<ForumUser | undefined> {
  const snap = await col("users").doc(address).get();
  return snap.exists ? (snap.data() as ForumUser) : undefined;
}

export async function getOrCreateUser(address: string): Promise<ForumUser> {
  const ref = col("users").doc(address);
  const snap = await ref.get();
  if (snap.exists) return snap.data() as ForumUser;

  const user: ForumUser = {
    address,
    displayName: address.slice(0, 8) + "...",
    username: null,
    bio: null,
    socialLinks: null,
    profileImageUrl: null,
    karma: 0,
    postKarma: 0,
    commentKarma: 0,
    modTier: null,
    isAgent: false,
    flair: null,
    warningCount: 0,
    joinedAt: Date.now(),
  };
  await ref.set(user);
  return user;
}

/** Fields safe for user self-update via public routes */
const SAFE_USER_UPDATE_FIELDS = new Set([
  "displayName",
  "profileImageUrl",
  "flair",
  "isAgent",
  "username",
  "bio",
  "socialLinks",
]);

/**
 * Update a user document. Strips privileged fields (modTier, karma,
 * warningCount, etc.) by default to prevent accidental privilege escalation.
 * Internal callers that need to set privileged fields should pass
 * `{ unsafe: true }`.
 */
export async function updateUser(
  address: string,
  data: Partial<ForumUser>,
  opts?: { unsafe?: boolean }
): Promise<void> {
  if (opts?.unsafe) {
    await col("users").doc(address).update(data);
    return;
  }
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (SAFE_USER_UPDATE_FIELDS.has(key)) {
      safe[key] = value;
    }
  }
  if (Object.keys(safe).length > 0) {
    await col("users").doc(address).update(safe);
  }
}

export async function getModeratorAddresses(): Promise<string[]> {
  const snap = await col("users")
    .where("modTier", "!=", null)
    .get();
  return snap.docs.map((d) => d.id);
}

export async function getPostsBySubtopic(
  subtopic: SubtopicId | "all"
): Promise<Post[]> {
  let query = col("posts").orderBy("createdAt", "desc");
  if (subtopic !== "all") {
    query = col("posts")
      .where("subtopic", "==", subtopic)
      .orderBy("createdAt", "desc");
  }
  const snap = await query.get();
  return snap.docs.map((d) => d.data() as Post);
}

export async function getPostById(id: string): Promise<Post | undefined> {
  const snap = await col("posts").doc(id).get();
  return snap.exists ? (snap.data() as Post) : undefined;
}

export async function createPost(post: Post): Promise<void> {
  await col("posts").doc(post.id).set(post);
}

export async function updatePost(
  id: string,
  data: Partial<Post>
): Promise<void> {
  await col("posts").doc(id).update(data);
}

export async function incrementPostVotes(
  id: string,
  upDelta: number,
  downDelta: number
): Promise<void> {
  await col("posts").doc(id).update({
    upvotes: FieldValue.increment(upDelta),
    downvotes: FieldValue.increment(downDelta),
    score: FieldValue.increment(upDelta - downDelta),
  });
}

export async function deletePost(id: string): Promise<void> {
  await col("posts").doc(id).delete();
}

export async function getCommentsForPost(postId: string): Promise<Comment[]> {
  const snap = await col("posts")
    .doc(postId)
    .collection("comments")
    .orderBy("createdAt", "asc")
    .get();
  return snap.docs.map((d) => {
    const data = d.data() as Omit<Comment, "children">;
    return { ...data, children: [] } as Comment;
  });
}

export async function createComment(
  postId: string,
  comment: Comment
): Promise<void> {
  await col("posts")
    .doc(postId)
    .collection("comments")
    .doc(comment.id)
    .set(comment);
}

export async function getCommentById(
  postId: string,
  commentId: string
): Promise<Comment | undefined> {
  const snap = await col("posts")
    .doc(postId)
    .collection("comments")
    .doc(commentId)
    .get();
  return snap.exists
    ? ({ ...(snap.data() as Omit<Comment, "children">), children: [] } as Comment)
    : undefined;
}

export async function updateComment(
  postId: string,
  commentId: string,
  data: Partial<Comment>
): Promise<void> {
  await col("posts")
    .doc(postId)
    .collection("comments")
    .doc(commentId)
    .update(data);
}

export async function incrementCommentVotes(
  postId: string,
  commentId: string,
  upDelta: number,
  downDelta: number
): Promise<void> {
  await col("posts")
    .doc(postId)
    .collection("comments")
    .doc(commentId)
    .update({
      upvotes: FieldValue.increment(upDelta),
      downvotes: FieldValue.increment(downDelta),
      score: FieldValue.increment(upDelta - downDelta),
    });
}

// ── Comment by ID (search across posts — for comment voting) ─

export async function findCommentGlobally(
  commentId: string
): Promise<{ comment: Comment; postId: string } | undefined> {
  const snap = await getDb()
    .collectionGroup("comments")
    .where("id", "==", commentId)
    .limit(1)
    .get();

  if (snap.empty) return undefined;
  const doc = snap.docs[0];
  const comment = { ...(doc.data() as Omit<Comment, "children">), children: [] } as Comment;
  // Parent path: posts/{postId}/comments/{commentId}
  const postId = doc.ref.parent.parent!.id;
  return { comment, postId };
}

// ── Comment tree (pure utility — same as before) ─────────────

export function buildCommentTree(comments: Comment[]): Comment[] {
  const map = new Map<string, Comment>();
  const roots: Comment[] = [];

  comments.forEach((c) => {
    map.set(c.id, { ...c, children: [] });
  });

  comments.forEach((c) => {
    const node = map.get(c.id)!;
    if (c.parentId && map.has(c.parentId)) {
      map.get(c.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
}

// ── Sort (pure utility — same as before) ─────────────────────

export function sortPosts(posts: Post[], mode: SortMode): Post[] {
  const sorted = [...posts];

  sorted.sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;

    switch (mode) {
      case "hot": {
        const ageA = (Date.now() - a.createdAt) / 3600000;
        const ageB = (Date.now() - b.createdAt) / 3600000;
        const hotA = a.score / Math.pow(ageA + 2, 1.5);
        const hotB = b.score / Math.pow(ageB + 2, 1.5);
        return hotB - hotA;
      }
      case "top":
        return b.score - a.score;
      case "new":
      default:
        return b.createdAt - a.createdAt;
    }
  });

  return sorted;
}

// ── Search (fetch all + in-memory filter, same as current) ───

/** Max docs fetched per collection during search (prevents full-collection scans) */
const SEARCH_FETCH_LIMIT = 200;
/** Max results returned per type */
const SEARCH_RESULT_CAP = 25;

export async function searchAll(query: string): Promise<{
  posts: Post[];
  comments: Comment[];
  users: ForumUser[];
}> {
  const q = query.toLowerCase();

  const [postsSnap, usersSnap, commentsSnap] = await Promise.all([
    col("posts").limit(SEARCH_FETCH_LIMIT).get(),
    col("users").limit(SEARCH_FETCH_LIMIT).get(),
    getDb().collectionGroup("comments").limit(SEARCH_FETCH_LIMIT).get(),
  ]);

  const allPosts = postsSnap.docs.map((d) => d.data() as Post);
  const allUsers = usersSnap.docs.map((d) => d.data() as ForumUser);
  const allComments = commentsSnap.docs.map(
    (d) => ({ ...(d.data() as Omit<Comment, "children">), children: [] } as Comment)
  );

  return {
    posts: allPosts
      .filter(
        (p) =>
          p.title.toLowerCase().includes(q) || p.body.toLowerCase().includes(q)
      )
      .slice(0, SEARCH_RESULT_CAP),
    comments: allComments
      .filter((c) => c.body.toLowerCase().includes(q))
      .slice(0, SEARCH_RESULT_CAP),
    users: allUsers
      .filter(
        (u) =>
          u.displayName.toLowerCase().includes(q) ||
          u.address.toLowerCase().includes(q) ||
          (u.username && u.username.toLowerCase().includes(q))
      )
      .slice(0, SEARCH_RESULT_CAP),
  };
}

// ── Conversations ────────────────────────────────────────────

export async function getConversationsForUser(
  address: string
): Promise<Conversation[]> {
  const snap = await col("conversations")
    .where("participants", "array-contains", address)
    .get();

  const convos: Conversation[] = [];
  for (const doc of snap.docs) {
    const data = doc.data();
    // Fetch messages subcollection
    const msgSnap = await doc.ref
      .collection("messages")
      .orderBy("createdAt", "asc")
      .get();
    const messages = msgSnap.docs.map((m) => m.data() as DirectMessage);
    convos.push({ ...data, messages } as Conversation);
  }
  return convos;
}

export async function getConversationById(
  id: string
): Promise<Conversation | undefined> {
  const snap = await col("conversations").doc(id).get();
  if (!snap.exists) return undefined;

  const data = snap.data()!;
  const msgSnap = await snap.ref
    .collection("messages")
    .orderBy("createdAt", "asc")
    .get();
  const messages = msgSnap.docs.map((m) => m.data() as DirectMessage);
  return { ...data, messages } as Conversation;
}

export async function createConversation(
  convo: Omit<Conversation, "messages">,
  firstMessage: DirectMessage
): Promise<void> {
  const ref = col("conversations").doc(convo.id);
  await ref.set(convo);
  await ref.collection("messages").doc(firstMessage.id).set(firstMessage);
}

export async function addMessageToConversation(
  convoId: string,
  message: DirectMessage,
  updateData: Partial<Conversation>
): Promise<void> {
  const ref = col("conversations").doc(convoId);
  await ref.collection("messages").doc(message.id).set(message);
  await ref.update(updateData);
}

export async function updateConversation(
  id: string,
  data: Partial<Conversation>
): Promise<void> {
  await col("conversations").doc(id).update(data);
}

// ── Find conversation between two users ──────────────────────

export async function findConversationBetween(
  address1: string,
  address2: string
): Promise<Conversation | undefined> {
  // Query conversations where address1 is a participant
  const snap = await col("conversations")
    .where("participants", "array-contains", address1)
    .get();

  for (const doc of snap.docs) {
    const data = doc.data();
    if ((data.participants as string[]).includes(address2)) {
      const msgSnap = await doc.ref
        .collection("messages")
        .orderBy("createdAt", "asc")
        .get();
      const messages = msgSnap.docs.map((m) => m.data() as DirectMessage);
      return { ...data, messages } as Conversation;
    }
  }
  return undefined;
}

// ── Mod log ──────────────────────────────────────────────────

export async function getModLog(): Promise<ModLogEntry[]> {
  const snap = await col("modLog").orderBy("createdAt", "desc").get();
  return snap.docs.map((d) => d.data() as ModLogEntry);
}

export async function createModLogEntry(entry: ModLogEntry): Promise<void> {
  await col("modLog").doc(entry.id).set(entry);
}

export async function getUserWarningCount(address: string): Promise<number> {
  const snap = await col("modLog")
    .where("target", "==", address)
    .where("action", "==", "warn")
    .get();
  return snap.size;
}

export async function incrementUserWarning(address: string): Promise<number> {
  const ref = col("users").doc(address);
  await ref.update({ warningCount: FieldValue.increment(1) });
  const snap = await ref.get();
  return (snap.data() as ForumUser)?.warningCount ?? 1;
}

// ── Votes ────────────────────────────────────────────────────

export async function getVotesForItem(
  itemId: string
): Promise<Record<string, 1 | -1>> {
  const snap = await col("votes").doc(itemId).get();
  return snap.exists ? (snap.data() as Record<string, 1 | -1>) : {};
}

export async function setVote(
  itemId: string,
  address: string,
  direction: 1 | -1
): Promise<void> {
  await col("votes")
    .doc(itemId)
    .set({ [address]: direction }, { merge: true });
}

export async function removeVote(
  itemId: string,
  address: string
): Promise<void> {
  await col("votes")
    .doc(itemId)
    .update({ [address]: FieldValue.delete() });
}

// ── API keys ─────────────────────────────────────────────────

export async function getApiKeyEntry(
  key: string
): Promise<ApiKeyEntry | undefined> {
  const snap = await col("apiKeys").doc(key).get();
  return snap.exists ? (snap.data() as ApiKeyEntry) : undefined;
}

export async function setApiKey(entry: ApiKeyEntry): Promise<void> {
  await col("apiKeys").doc(entry.key).set(entry);
}

export async function revokeApiKeysForAddress(
  address: string
): Promise<void> {
  const snap = await col("apiKeys")
    .where("address", "==", address.toLowerCase())
    .get();
  const batch = getDb().batch();
  snap.docs.forEach((doc) => batch.delete(doc.ref));
  if (!snap.empty) await batch.commit();
}

// ── Challenges ───────────────────────────────────────────────

export async function getChallenge(
  address: string
): Promise<ChallengeEntry | undefined> {
  const snap = await col("challenges").doc(address.toLowerCase()).get();
  return snap.exists ? (snap.data() as ChallengeEntry) : undefined;
}

export async function setChallenge(
  address: string,
  entry: ChallengeEntry
): Promise<void> {
  await col("challenges").doc(address.toLowerCase()).set(entry);
}

export async function deleteChallenge(address: string): Promise<void> {
  await col("challenges").doc(address.toLowerCase()).delete();
}

// ── Airdrop approvals ────────────────────────────────────────

export async function getAirdropApproval(
  ip: string
): Promise<AirdropApprovalEntry | undefined> {
  const snap = await col("airdropApprovals").doc(ip).get();
  return snap.exists ? (snap.data() as AirdropApprovalEntry) : undefined;
}

export async function setAirdropApproval(
  ip: string,
  entry: AirdropApprovalEntry
): Promise<void> {
  await col("airdropApprovals").doc(ip).set(entry);
}

/**
 * Atomic airdrop approval — prevents TOCTOU race condition.
 * Atomically checks if IP already has an approval and sets one if not.
 */
export async function atomicAirdropApproval(
  ip: string,
  entry: AirdropApprovalEntry
): Promise<{ success: boolean; existingApproval?: AirdropApprovalEntry }> {
  const db = getDb();
  const ref = col("airdropApprovals").doc(ip);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) {
      return { success: false, existingApproval: snap.data() as AirdropApprovalEntry };
    }
    tx.set(ref, entry);
    return { success: true };
  });
}

// ── Banned IPs ───────────────────────────────────────────────

export async function getBannedIp(
  ip: string
): Promise<BannedIpEntry | undefined> {
  const snap = await col("bannedIps").doc(ip).get();
  return snap.exists ? (snap.data() as BannedIpEntry) : undefined;
}

export async function setBannedIp(
  ip: string,
  entry: BannedIpEntry
): Promise<void> {
  await col("bannedIps").doc(ip).set(entry);
}

export async function unbanIp(ip: string): Promise<boolean> {
  const entry = await getBannedIp(ip);
  if (!entry || !entry.banned) return false;
  await col("bannedIps").doc(ip).update({
    banned: false,
    unbannedAt: Date.now(),
  });
  return true;
}

export async function getAllBannedIps(): Promise<
  (BannedIpEntry & { ip: string })[]
> {
  const snap = await col("bannedIps").where("banned", "==", true).get();
  return snap.docs.map((d) => ({
    ip: d.id,
    ...(d.data() as BannedIpEntry),
  }));
}

// ── User blocking ───────────────────────────────────────────

export async function blockUser(
  blockerAddress: string,
  blockedAddress: string
): Promise<void> {
  await col("blocks")
    .doc(blockerAddress)
    .collection("blockedUsers")
    .doc(blockedAddress)
    .set({ blockedAt: Date.now() });
}

export async function unblockUser(
  blockerAddress: string,
  blockedAddress: string
): Promise<void> {
  await col("blocks")
    .doc(blockerAddress)
    .collection("blockedUsers")
    .doc(blockedAddress)
    .delete();
}

export async function getBlockedUsers(address: string): Promise<string[]> {
  const snap = await col("blocks")
    .doc(address)
    .collection("blockedUsers")
    .get();
  return snap.docs.map((d) => d.id);
}

export async function isBlocked(
  blockerAddress: string,
  blockedAddress: string
): Promise<boolean> {
  const snap = await col("blocks")
    .doc(blockerAddress)
    .collection("blockedUsers")
    .doc(blockedAddress)
    .get();
  return snap.exists;
}

export async function isBlockedEither(
  address1: string,
  address2: string
): Promise<boolean> {
  const [a1BlocksA2, a2BlocksA1] = await Promise.all([
    isBlocked(address1, address2),
    isBlocked(address2, address1),
  ]);
  return a1BlocksA2 || a2BlocksA1;
}

// ── Human bookings ───────────────────────────────────────────

export async function createBooking(booking: HumanBooking): Promise<void> {
  await col("humanBookings").doc(booking.id).set(booking);
}

// ── Next ID (atomic increment via transaction) ───────────────

const PREFIXES: Record<string, string> = {
  post: "p",
  comment: "c",
  conversation: "dm",
  message: "m",
  modLog: "ml",
  review: "rv",
};

export async function nextId(
  kind: "post" | "comment" | "conversation" | "message" | "modLog" | "review"
): Promise<string> {
  const db = getDb();
  const ref = col("counters").doc("nextIds");

  const newId = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data() || {
      post: 1,
      comment: 1,
      conversation: 1,
      message: 1,
      modLog: 1,
    };
    const current = (data[kind] as number) || 1;
    tx.set(ref, { [kind]: current + 1 }, { merge: true });
    return current;
  });

  return `${PREFIXES[kind]}${newId}`;
}

// ── Atomic karma increment ───────────────────────────────

export async function incrementUserKarma(
  address: string,
  field: "postKarma" | "commentKarma",
  delta: number
): Promise<void> {
  if (delta === 0) return;
  const ref = col("users").doc(address);
  await ref.update({
    [field]: FieldValue.increment(delta),
    karma: FieldValue.increment(delta),
  });
}

// ── Posts for author ─────────────────────────────────────────

export async function getPostsByAuthor(
  address: string,
  limit = 10
): Promise<Post[]> {
  const snap = await col("posts")
    .where("author", "==", address)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();
  return snap.docs.map((d) => d.data() as Post);
}

// ── All posts (for karma recalc) ─────────────────────────────

export async function getAllPostsByAuthor(address: string): Promise<Post[]> {
  const snap = await col("posts").where("author", "==", address).get();
  return snap.docs.map((d) => d.data() as Post);
}

// ── All comments by author (for karma recalc) ────────────────

export async function getAllCommentsByAuthor(
  address: string
): Promise<Comment[]> {
  const snap = await getDb()
    .collectionGroup("comments")
    .where("author", "==", address)
    .get();
  return snap.docs.map((d) => {
    const data = d.data() as Omit<Comment, "children">;
    return { ...data, children: [] } as Comment;
  });
}

// ── Remove all posts (for mod action) ────────────────────────

export async function filterOutPost(id: string): Promise<void> {
  await col("posts").doc(id).delete();
}

// ── Username lookup ───────────────────────────────────────────

export async function getUserByUsername(
  username: string
): Promise<ForumUser | undefined> {
  const snap = await col("users")
    .where("username", "==", username.toLowerCase())
    .limit(1)
    .get();
  return snap.empty ? undefined : (snap.docs[0].data() as ForumUser);
}

export async function isUsernameTaken(
  username: string,
  excludeAddress?: string
): Promise<boolean> {
  const snap = await col("users")
    .where("username", "==", username.toLowerCase())
    .limit(1)
    .get();
  if (snap.empty) return false;
  if (excludeAddress && snap.docs[0].id === excludeAddress) return false;
  return true;
}

// ── Reviews ───────────────────────────────────────────────────

export async function createReview(review: Review): Promise<void> {
  await col("reviews").doc(review.id).set(review);
}

export async function getReviewsForUser(
  address: string,
  limit = 20
): Promise<Review[]> {
  const snap = await col("reviews")
    .where("revieweeAddress", "==", address)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();
  return snap.docs.map((d) => d.data() as Review);
}

export async function getReviewByJobAndReviewer(
  jobId: string,
  reviewerAddress: string
): Promise<Review | undefined> {
  const snap = await col("reviews")
    .where("jobId", "==", jobId)
    .where("reviewerAddress", "==", reviewerAddress)
    .limit(1)
    .get();
  return snap.empty ? undefined : (snap.docs[0].data() as Review);
}

export async function getReviewSummaryForUser(
  address: string
): Promise<ReviewSummary> {
  const snap = await col("reviews")
    .where("revieweeAddress", "==", address)
    .get();

  const reviews = snap.docs.map((d) => d.data() as Review);
  const totalReviews = reviews.length;

  if (totalReviews === 0) {
    return { averageRating: 0, totalReviews: 0, ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };
  }

  const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sum = 0;
  for (const r of reviews) {
    sum += r.rating;
    distribution[r.rating] = (distribution[r.rating] || 0) + 1;
  }

  return {
    averageRating: Math.round((sum / totalReviews) * 10) / 10,
    totalReviews,
    ratingDistribution: distribution,
  };
}

// ── Notifications ─────────────────────────────────────────────

import type { Notification, NotificationType, FriendRequest, RelayMessage } from "./forum-types";

export async function getNotificationsForUser(
  address: string
): Promise<Notification[]> {
  const snap = await col("notifications")
    .where("recipient", "==", address)
    .orderBy("createdAt", "desc")
    .limit(50)
    .get();
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      type: data.type as NotificationType,
      title: data.title,
      body: data.body,
      read: data.read ?? false,
      href: data.href ?? null,
      refId: data.refId ?? null,
      createdAt: data.createdAt,
    };
  });
}

export async function createNotification(
  recipient: string,
  notification: Omit<Notification, "id">
): Promise<string> {
  const ref = await col("notifications").add({
    recipient,
    ...notification,
  });
  return ref.id;
}

export async function markNotificationRead(
  id: string,
  address: string
): Promise<void> {
  const doc = col("notifications").doc(id);
  const snap = await doc.get();
  if (snap.exists && snap.data()?.recipient === address) {
    await doc.update({ read: true });
  }
}

export async function markAllNotificationsRead(
  address: string
): Promise<void> {
  const snap = await col("notifications")
    .where("recipient", "==", address)
    .where("read", "==", false)
    .get();
  const batch = getDb().batch();
  snap.docs.forEach((doc) => batch.update(doc.ref, { read: true }));
  await batch.commit();
}

// ── Friend Requests ──────────────────────────────────────────

export async function sendFriendRequest(
  from: string,
  to: string
): Promise<FriendRequest> {
  // Deterministic ID prevents duplicate requests
  const id = `${from}_${to}`;
  const reverseId = `${to}_${from}`;

  // Check for existing request in either direction
  const [existing, reverse] = await Promise.all([
    col("friendRequests").doc(id).get(),
    col("friendRequests").doc(reverseId).get(),
  ]);

  if (existing.exists) {
    const data = existing.data() as FriendRequest;
    if (data.status === "pending") throw new Error("Friend request already pending");
    if (data.status === "accepted") throw new Error("Already friends");
  }

  if (reverse.exists) {
    const data = reverse.data() as FriendRequest;
    if (data.status === "pending") throw new Error("This user already sent you a friend request");
    if (data.status === "accepted") throw new Error("Already friends");
  }

  const request: FriendRequest = {
    id,
    from,
    to,
    status: "pending",
    createdAt: Date.now(),
    respondedAt: null,
  };

  await col("friendRequests").doc(id).set(request);
  return request;
}

export async function respondToFriendRequest(
  requestId: string,
  responderAddress: string,
  accept: boolean
): Promise<void> {
  const doc = col("friendRequests").doc(requestId);
  const snap = await doc.get();
  if (!snap.exists) throw new Error("Friend request not found");

  const request = snap.data() as FriendRequest;
  if (request.to !== responderAddress) throw new Error("Not authorized to respond");
  if (request.status !== "pending") throw new Error("Request already responded to");

  const now = Date.now();
  await doc.update({
    status: accept ? "accepted" : "declined",
    respondedAt: now,
  });

  if (accept) {
    const batch = getDb().batch();
    batch.set(
      col("friends").doc(request.from).collection("friendList").doc(request.to),
      { since: now }
    );
    batch.set(
      col("friends").doc(request.to).collection("friendList").doc(request.from),
      { since: now }
    );
    await batch.commit();
  }
}

export async function getFriends(address: string): Promise<string[]> {
  const snap = await col("friends")
    .doc(address)
    .collection("friendList")
    .get();
  return snap.docs.map((d) => d.id);
}

export async function getFriendCount(address: string): Promise<number> {
  const snap = await col("friends")
    .doc(address)
    .collection("friendList")
    .get();
  return snap.size;
}

export async function isFriend(a: string, b: string): Promise<boolean> {
  const snap = await col("friends")
    .doc(a)
    .collection("friendList")
    .doc(b)
    .get();
  return snap.exists;
}

export async function removeFriend(a: string, b: string): Promise<void> {
  const batch = getDb().batch();
  batch.delete(col("friends").doc(a).collection("friendList").doc(b));
  batch.delete(col("friends").doc(b).collection("friendList").doc(a));
  await batch.commit();

  // Also clean up any accepted friend request docs
  const id1 = `${a}_${b}`;
  const id2 = `${b}_${a}`;
  const [doc1, doc2] = await Promise.all([
    col("friendRequests").doc(id1).get(),
    col("friendRequests").doc(id2).get(),
  ]);
  if (doc1.exists) await col("friendRequests").doc(id1).delete();
  if (doc2.exists) await col("friendRequests").doc(id2).delete();
}

export async function getPendingFriendRequests(
  address: string
): Promise<FriendRequest[]> {
  const snap = await col("friendRequests")
    .where("to", "==", address)
    .where("status", "==", "pending")
    .get();
  return snap.docs.map((d) => d.data() as FriendRequest);
}

export async function getFriendshipStatus(
  a: string,
  b: string
): Promise<"none" | "pending_sent" | "pending_received" | "friends"> {
  // Check if already friends
  const areFriends = await isFriend(a, b);
  if (areFriends) return "friends";

  // Check pending requests in both directions
  const [sentDoc, receivedDoc] = await Promise.all([
    col("friendRequests").doc(`${a}_${b}`).get(),
    col("friendRequests").doc(`${b}_${a}`).get(),
  ]);

  if (sentDoc.exists && (sentDoc.data() as FriendRequest).status === "pending") {
    return "pending_sent";
  }
  if (receivedDoc.exists && (receivedDoc.data() as FriendRequest).status === "pending") {
    return "pending_received";
  }

  return "none";
}

export async function declinePendingFriendRequests(
  from: string,
  to: string
): Promise<void> {
  const id1 = `${from}_${to}`;
  const id2 = `${to}_${from}`;
  const [doc1, doc2] = await Promise.all([
    col("friendRequests").doc(id1).get(),
    col("friendRequests").doc(id2).get(),
  ]);
  const now = Date.now();
  if (doc1.exists && (doc1.data() as FriendRequest).status === "pending") {
    await col("friendRequests").doc(id1).update({ status: "declined", respondedAt: now });
  }
  if (doc2.exists && (doc2.data() as FriendRequest).status === "pending") {
    await col("friendRequests").doc(id2).update({ status: "declined", respondedAt: now });
  }
}

// ── Mod Applications ─────────────────────────────────────────

export interface ModApplication {
  address: string;
  tier: string;
  reason: string;
  createdAt: number;
  status: "pending" | "approved" | "rejected";
}

export async function createModApplication(
  application: ModApplication
): Promise<void> {
  const id = `${application.address}_${application.createdAt}`;
  await col("modApplications").doc(id).set(application);
}

// ── Sybil Flags ─────────────────────────────────────────────

export interface SybilFlag {
  address: string;
  signals: string[];
  txHashes: string[];
  score: number;
  createdAt: number;
  status: "pending" | "reported";
}

export async function getSybilFlags(): Promise<SybilFlag[]> {
  const snap = await col("sybilFlags").orderBy("createdAt", "desc").get();
  return snap.docs.map((d) => d.data() as SybilFlag);
}

export async function createSybilFlag(flag: SybilFlag): Promise<void> {
  await col("sybilFlags").doc(flag.address).set(flag);
}

export async function updateSybilFlagStatus(
  address: string,
  status: "pending" | "reported"
): Promise<void> {
  await col("sybilFlags").doc(address).update({ status });
}

// ── Reports ─────────────────────────────────────────────────

export interface Report {
  id: string;
  reporter: string;
  targetType: "post" | "listing" | "user";
  targetId: string;
  reason: "scam" | "spam" | "harassment" | "impersonation" | "other";
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

export async function createReport(report: Report): Promise<void> {
  await col("reports").doc(report.id).set(report);
}

export async function getReports(
  status?: "pending" | "reviewed" | "actioned" | "dismissed"
): Promise<Report[]> {
  let query = col("reports").orderBy("createdAt", "desc");
  if (status) {
    query = col("reports")
      .where("status", "==", status)
      .orderBy("createdAt", "desc");
  }
  const snap = await query.limit(100).get();
  return snap.docs.map((d) => d.data() as Report);
}

export async function updateReportStatus(
  id: string,
  status: "pending" | "reviewed" | "actioned" | "dismissed"
): Promise<void> {
  await col("reports").doc(id).update({ status });
}

// ── Airdrop V3 Attestations ─────────────────────────────────

export interface AirdropV3AttestationEntry {
  address: string;
  tier: number;
  nonce: string;
  signature: string;
  signer: string;
  createdAt: number;
}

export async function getAirdropV3Attestation(
  address: string
): Promise<AirdropV3AttestationEntry | undefined> {
  const snap = await col("airdropV3Attestations").doc(address).get();
  return snap.exists ? (snap.data() as AirdropV3AttestationEntry) : undefined;
}

export async function setAirdropV3Attestation(
  address: string,
  entry: AirdropV3AttestationEntry
): Promise<void> {
  await col("airdropV3Attestations").doc(address).set(entry);
}

// ── Airdrop V3 Approvals (IP-gated) ─────────────────────────

export interface AirdropV3ApprovalEntry {
  address: string;
  nonce: string;
  approvedAt: number;
}

export async function atomicAirdropV3Approval(
  ip: string,
  entry: AirdropV3ApprovalEntry
): Promise<{ success: boolean; existingApproval?: AirdropV3ApprovalEntry }> {
  const db = getDb();
  const ref = col("airdropV3Approvals").doc(ip);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) {
      return { success: false, existingApproval: snap.data() as AirdropV3ApprovalEntry };
    }
    tx.set(ref, entry);
    return { success: true };
  });
}

// ── Dispute Threads ──────────────────────────────────────────

export interface DisputeThread {
  disputeId: string;
  postId: string;
  createdAt: number;
  participants: string[];
}

export async function createDisputeThread(
  disputeId: string,
  postId: string,
  participants: string[]
): Promise<void> {
  await col("dispute_threads").doc(disputeId).set({
    disputeId,
    postId,
    createdAt: Date.now(),
    participants,
  });
}

export async function getDisputeThread(
  disputeId: string
): Promise<{ postId: string; participants: string[] } | null> {
  const snap = await col("dispute_threads").doc(disputeId).get();
  if (!snap.exists) return null;
  const data = snap.data() as DisputeThread;
  return { postId: data.postId, participants: data.participants };
}

export async function updateDisputeThreadParticipants(
  disputeId: string,
  participants: string[]
): Promise<void> {
  await col("dispute_threads").doc(disputeId).update({ participants });
}

// ── Relay Messages ───────────────────────────────────────────

export async function createRelayMessage(
  msg: Omit<RelayMessage, "id">
): Promise<string> {
  const id = generateId();
  await col("relay_messages").doc(id).set({ id, ...msg });
  return id;
}

export async function getRelayInbox(
  address: string,
  opts: { type?: string; unread?: boolean; since?: number; limit?: number }
): Promise<RelayMessage[]> {
  const limit = opts.limit || 50;

  // Query messages addressed to this address
  let query = col("relay_messages")
    .where("to", "in", [address.toLowerCase(), "broadcast"])
    .orderBy("createdAt", "desc")
    .limit(limit);

  const snap = await query.get();
  let messages = snap.docs.map((d) => d.data() as RelayMessage);

  // Apply filters in memory (Firestore limitations on compound queries)
  if (opts.type) {
    messages = messages.filter((m) => m.type === opts.type);
  }
  if (opts.unread) {
    messages = messages.filter((m) => !m.read);
  }
  if (opts.since) {
    messages = messages.filter((m) => m.createdAt >= opts.since!);
  }

  return messages;
}

export async function markRelayMessagesRead(
  address: string,
  messageIds: string[]
): Promise<void> {
  const batch = getDb().batch();
  for (const id of messageIds) {
    const ref = col("relay_messages").doc(id);
    const snap = await ref.get();
    if (snap.exists) {
      const msg = snap.data() as RelayMessage;
      if (msg.to === address.toLowerCase() || msg.to === "broadcast") {
        batch.update(ref, { read: true });
      }
    }
  }
  await batch.commit();
}

export async function cleanExpiredRelayMessages(): Promise<number> {
  const now = Date.now();
  const snap = await col("relay_messages")
    .where("expiresAt", ">", 0)
    .where("expiresAt", "<=", now)
    .limit(100)
    .get();

  if (snap.empty) return 0;

  const batch = getDb().batch();
  snap.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
  return snap.size;
}
