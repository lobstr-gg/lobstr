/**
 * One-time Firestore data seeder.
 *
 * Reads mock data from forum-data.ts and batch-writes to Firestore.
 * Run with: npx tsx scripts/seed-firestore.ts
 *
 * Requires FIREBASE_SERVICE_ACCOUNT_KEY env var or Application Default Credentials.
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import {
  FORUM_USERS,
  FORUM_POSTS,
  FORUM_COMMENTS,
  CONVERSATIONS,
  MOD_LOG,
} from "../packages/web/src/lib/forum-data";

// ── Init ─────────────────────────────────────────────────────

const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (serviceAccountKey) {
  initializeApp({ credential: cert(JSON.parse(serviceAccountKey)) });
} else {
  initializeApp();
}

const db = getFirestore();

// ── Helpers ──────────────────────────────────────────────────

// Firestore batch limit is 500 writes per batch
async function batchWrite(
  ops: Array<{ ref: FirebaseFirestore.DocumentReference; data: object }>
) {
  for (let i = 0; i < ops.length; i += 500) {
    const batch = db.batch();
    const chunk = ops.slice(i, i + 500);
    for (const { ref, data } of chunk) {
      batch.set(ref, data);
    }
    await batch.commit();
    console.log(`  Committed batch ${Math.floor(i / 500) + 1} (${chunk.length} docs)`);
  }
}

// ── Seed ─────────────────────────────────────────────────────

async function seed() {
  console.log("Seeding Firestore...\n");

  // Users
  console.log(`Users (${FORUM_USERS.length}):`);
  await batchWrite(
    FORUM_USERS.map((user) => ({
      ref: db.collection("users").doc(user.address),
      data: user,
    }))
  );

  // Posts
  console.log(`\nPosts (${FORUM_POSTS.length}):`);
  await batchWrite(
    FORUM_POSTS.map((post) => ({
      ref: db.collection("posts").doc(post.id),
      data: post,
    }))
  );

  // Comments (as subcollections under posts)
  console.log(`\nComments (${FORUM_COMMENTS.length}):`);
  const commentOps = FORUM_COMMENTS.map((comment) => {
    // Strip runtime-only `children` field
    const { children, ...data } = comment;
    return {
      ref: db
        .collection("posts")
        .doc(comment.postId)
        .collection("comments")
        .doc(comment.id),
      data,
    };
  });
  await batchWrite(commentOps);

  // Conversations + messages
  console.log(`\nConversations (${CONVERSATIONS.length}):`);
  const convoOps: Array<{
    ref: FirebaseFirestore.DocumentReference;
    data: object;
  }> = [];

  for (const convo of CONVERSATIONS) {
    const { messages, ...convoData } = convo;
    convoOps.push({
      ref: db.collection("conversations").doc(convo.id),
      data: convoData,
    });
    for (const msg of messages) {
      convoOps.push({
        ref: db
          .collection("conversations")
          .doc(convo.id)
          .collection("messages")
          .doc(msg.id),
        data: msg,
      });
    }
  }
  await batchWrite(convoOps);

  // Mod log
  console.log(`\nMod log (${MOD_LOG.length}):`);
  await batchWrite(
    MOD_LOG.map((entry) => ({
      ref: db.collection("modLog").doc(entry.id),
      data: entry,
    }))
  );

  // Counters (nextIds)
  console.log("\nCounters:");
  await db.collection("counters").doc("nextIds").set({
    post: 14,
    comment: 26,
    conversation: 4,
    message: 11,
    modLog: 7,
  });
  console.log("  Set nextIds counter doc");

  console.log("\nDone! Firestore seeded successfully.");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
