import { NextRequest, NextResponse } from "next/server";
import {
  createPost,
  createNotification,
  createDisputeThread,
  getDisputeThread,
  updateDisputeThreadParticipants,
  generateId,
  nextId,
} from "@/lib/firestore-store";
import type { Post } from "@/lib/forum-types";

const WEBHOOK_SECRET = process.env.LOBSTR_WEBHOOK_SECRET;

function verifySecret(request: NextRequest): boolean {
  if (!WEBHOOK_SECRET) return false;
  return request.headers.get("x-webhook-secret") === WEBHOOK_SECRET;
}

export async function POST(request: NextRequest) {
  if (!verifySecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { event: string; data: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { event, data } = body;
  if (!event || !data) {
    return NextResponse.json({ error: "Missing event or data" }, { status: 400 });
  }

  try {
    switch (event) {
      case "DisputeCreated":
        await handleDisputeCreated(data);
        break;
      case "ArbitratorsAssigned":
        await handleArbitratorsAssigned(data);
        break;
      case "DirectivePosted":
        // Acknowledged — no auto-action needed beyond indexing
        break;
      default:
        return NextResponse.json({ error: `Unknown event: ${event}` }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`Webhook handler error for ${event}:`, err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

async function handleDisputeCreated(data: Record<string, unknown>) {
  const disputeId = String(data.disputeId);
  const jobId = String(data.jobId);
  const buyer = String(data.buyer);
  const seller = String(data.seller);
  const amount = String(data.amount);

  // Check if thread already exists (idempotency)
  const existing = await getDisputeThread(disputeId);
  if (existing) return;

  // Create forum post in "disputes" subtopic
  const postId = await nextId("post");
  const now = Date.now();

  const post: Post = {
    id: postId,
    subtopic: "disputes",
    title: `Dispute #${disputeId}: Job #${jobId}`,
    body: [
      `**Dispute #${disputeId}** has been created on-chain.`,
      "",
      `- **Job ID**: ${jobId}`,
      `- **Buyer**: \`${buyer}\``,
      `- **Seller**: \`${seller}\``,
      `- **Amount**: ${amount} wei`,
      `- **Status**: Evidence Phase`,
      "",
      "This thread is auto-generated for dispute discussion. ",
      "Only the buyer, seller, and assigned arbitrators may participate.",
      "",
      "*Please keep all evidence submissions on-chain. This thread is for discussion only.*",
    ].join("\n"),
    author: "0x0000000000000000000000000000000000000000", // system
    upvotes: 0,
    downvotes: 0,
    score: 0,
    commentCount: 0,
    flair: "discussion",
    isPinned: true,
    isLocked: false,
    createdAt: now,
  };

  await createPost(post);

  // Store dispute→thread mapping
  const participants = [buyer.toLowerCase(), seller.toLowerCase()];
  await createDisputeThread(disputeId, postId, participants);

  // Notify buyer and seller
  for (const addr of [buyer, seller]) {
    await createNotification(addr.toLowerCase(), {
      type: "dispute_thread_created",
      title: `Dispute #${disputeId} Thread Created`,
      body: `A discussion thread has been created for Dispute #${disputeId} (Job #${jobId}).`,
      read: false,
      href: `/disputes/${disputeId}`,
      refId: postId,
      createdAt: now,
    });
  }
}

async function handleArbitratorsAssigned(data: Record<string, unknown>) {
  const disputeId = String(data.disputeId);
  const arbitrators = data.arbitrators as string[];

  if (!arbitrators || !Array.isArray(arbitrators)) return;

  // Update thread participants to include arbitrators
  const thread = await getDisputeThread(disputeId);
  if (thread) {
    const allParticipants = [
      ...thread.participants,
      ...arbitrators.map((a) => a.toLowerCase()),
    ];
    const unique = [...new Set(allParticipants)];
    await updateDisputeThreadParticipants(disputeId, unique);
  }

  // Notify each arbitrator
  const now = Date.now();
  for (const arb of arbitrators) {
    await createNotification(arb.toLowerCase(), {
      type: "dispute_assigned",
      title: `Assigned to Dispute #${disputeId}`,
      body: `You have been assigned as an arbitrator for Dispute #${disputeId}.`,
      read: false,
      href: `/disputes/${disputeId}`,
      refId: disputeId,
      createdAt: now,
    });

    if (thread) {
      await createNotification(arb.toLowerCase(), {
        type: "dispute_thread_created",
        title: `Dispute #${disputeId} Discussion Thread`,
        body: `A discussion thread is available for Dispute #${disputeId}.`,
        read: false,
        href: `/disputes/${disputeId}`,
        refId: thread.postId,
        createdAt: now,
      });
    }
  }
}
