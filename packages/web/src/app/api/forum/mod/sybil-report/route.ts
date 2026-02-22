import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isModerator } from "@/lib/forum-auth";
import { rateLimit, getIPKey } from "@/lib/rate-limit";
import {
  updateSybilFlagStatus,
  nextId,
  createModLogEntry,
} from "@/lib/firestore-store";
import type { ModLogEntry } from "@/lib/forum-types";

// POST /api/forum/mod/sybil-report — create SybilGuard report from flag
export async function POST(request: NextRequest) {
  const limited = rateLimit(`sybil-report:${getIPKey(request)}`, 60_000, 10);
  if (limited) return limited;

  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  if (!(await isModerator(auth.address))) {
    return NextResponse.json(
      { error: "Moderator access required" },
      { status: 403 }
    );
  }

  const body = await request.json();
  const { address, signals, txHashes, score } = body;

  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json(
      { error: "Missing or invalid address" },
      { status: 400 }
    );
  }

  // Validate optional arrays
  if (signals !== undefined && (!Array.isArray(signals) || !signals.every((s: unknown) => typeof s === "string"))) {
    return NextResponse.json(
      { error: "signals must be an array of strings" },
      { status: 400 }
    );
  }

  if (txHashes !== undefined && (!Array.isArray(txHashes) || !txHashes.every((h: unknown) => typeof h === "string"))) {
    return NextResponse.json(
      { error: "txHashes must be an array of strings" },
      { status: 400 }
    );
  }

  // Mark flag as reported
  await updateSybilFlagStatus(address, "reported");

  // Log the mod action
  const entryId = await nextId("modLog");
  const logEntry: ModLogEntry = {
    id: entryId,
    action: "warn",
    moderator: auth.address,
    target: address,
    reason: `SybilGuard report: ${(signals ?? []).join(", ")} (score: ${score ?? "N/A"}, txs: ${(txHashes ?? []).length})`,
    createdAt: Date.now(),
  };
  await createModLogEntry(logEntry);

  return NextResponse.json({ ok: true }, { status: 201 });
}
