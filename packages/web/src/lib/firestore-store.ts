import "server-only";
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
    karma: 0,
    postKarma: 0,
    commentKarma: 0,
    modTier: null,
    isAgent: false,
    flair: null,
    joinedAt: Date.now(),
  };
  await ref.set(user);
  return user;
}

export async function updateUser(
  address: string,
  data: Partial<ForumUser>
): Promise<void> {
  await col("users").doc(address).update(data);
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

export async function searchAll(query: string): Promise<{
  posts: Post[];
  comments: Comment[];
  users: ForumUser[];
}> {
  const q = query.toLowerCase();

  const [postsSnap, usersSnap] = await Promise.all([
    col("posts").get(),
    col("users").get(),
  ]);

  const allPosts = postsSnap.docs.map((d) => d.data() as Post);
  const allUsers = usersSnap.docs.map((d) => d.data() as ForumUser);

  // Collect comments from all posts via collectionGroup
  const commentsSnap = await getDb().collectionGroup("comments").get();
  const allComments = commentsSnap.docs.map(
    (d) => ({ ...(d.data() as Omit<Comment, "children">), children: [] } as Comment)
  );

  return {
    posts: allPosts.filter(
      (p) =>
        p.title.toLowerCase().includes(q) || p.body.toLowerCase().includes(q)
    ),
    comments: allComments.filter((c) => c.body.toLowerCase().includes(q)),
    users: allUsers.filter(
      (u) =>
        u.displayName.toLowerCase().includes(q) ||
        u.address.toLowerCase().includes(q)
    ),
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
};

export async function nextId(
  kind: "post" | "comment" | "conversation" | "message" | "modLog"
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
    tx.update(ref, { [kind]: current + 1 });
    return current;
  });

  return `${PREFIXES[kind]}${newId}`;
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
