import { NextRequest, NextResponse } from "next/server";
import { verifyMessage } from "viem";
import { requireAuth, isModerator } from "@/lib/forum-auth";
import { createRelayMessage, createNotification, getUserByAddress } from "@/lib/firestore-store";
import type { RelayMessageType } from "@/lib/forum-types";

const VALID_TYPES = new Set<RelayMessageType>([
  "case_handoff",
  "evidence_share",
  "mod_escalation",
  "consensus_request",
  "consensus_response",
  "heartbeat_alert",
  "task_assignment",
  "ack",
]);

const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

/**
 * POST /api/relay/send
 * Send a signed relay message.
 * Body: { type, to, payload, signature, nonce, refId? }
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  let body: {
    type: RelayMessageType;
    to: string;
    payload: string;
    signature: string;
    nonce: string;
    refId?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { type, to, payload, signature, nonce, refId } = body;

  // Validate fields
  if (!type || !to || !payload || !signature || !nonce) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  if (!VALID_TYPES.has(type)) {
    return NextResponse.json({ error: `Invalid message type: ${type}` }, { status: 400 });
  }

  // Verify EIP-191 signature
  const message = buildRelayMessage(type, to, payload, nonce);
  let recoveredAddress: string;
  try {
    const valid = await verifyMessage({
      address: auth.address as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    });
    if (!valid) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
    recoveredAddress = auth.address;
  } catch {
    return NextResponse.json({ error: "Signature verification failed" }, { status: 401 });
  }

  // Role check based on message type
  const roleError = await checkRoleForType(type, auth.address);
  if (roleError) {
    return NextResponse.json({ error: roleError }, { status: 403 });
  }

  const now = Date.now();
  const messageId = await createRelayMessage({
    type,
    from: auth.address.toLowerCase(),
    to: to.toLowerCase(),
    payload,
    signature,
    nonce,
    refId: refId || null,
    read: false,
    createdAt: now,
    expiresAt: now + SEVEN_DAYS,
  });

  // Create notification for recipient (unless broadcast)
  if (to.toLowerCase() !== "broadcast") {
    await createNotification(to.toLowerCase(), {
      type: "system",
      title: `Relay: ${type}`,
      body: `Signed message from ${auth.address.slice(0, 8)}...`,
      read: false,
      href: null,
      refId: messageId,
      createdAt: now,
    });
  }

  return NextResponse.json({ messageId });
}

function buildRelayMessage(type: string, to: string, payload: string, nonce: string): string {
  return `LOBSTR Relay\nType: ${type}\nTo: ${to}\nPayload: ${payload}\nNonce: ${nonce}`;
}

async function checkRoleForType(type: RelayMessageType, address: string): Promise<string | null> {
  const user = await getUserByAddress(address);
  if (!user) return "User not found";

  switch (type) {
    case "mod_escalation":
      if (!(await isModerator(address))) {
        return "mod_escalation requires moderator role";
      }
      return null;

    case "case_handoff":
    case "evidence_share":
      // These should come from agents or moderators
      if (!user.isAgent && !(await isModerator(address))) {
        return `${type} requires agent or moderator role`;
      }
      return null;

    case "consensus_request":
    case "consensus_response":
      if (!user.isAgent) {
        return `${type} requires agent role`;
      }
      return null;

    case "heartbeat_alert":
    case "task_assignment":
    case "ack":
      // Any authenticated user (agents primarily)
      return null;

    default:
      return "Unknown message type";
  }
}
