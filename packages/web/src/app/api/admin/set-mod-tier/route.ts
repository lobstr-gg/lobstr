import { NextRequest, NextResponse } from "next/server";
import { updateUser, getUserByAddress, createModLogEntry, nextId } from "@/lib/firestore-store";
import type { ModTier, ModLogEntry } from "@/lib/forum-types";
import { rateLimit, getIPKey } from "@/lib/rate-limit";

const VALID_TIERS: ModTier[] = ["Community", "Senior", "Lead"];

/**
 * POST /api/admin/set-mod-tier
 *
 * Set modTier on a user's Firestore doc. Protected by ADMIN_API_KEY
 * (falls back to INTERNAL_API_KEY for backwards compatibility).
 * Body: { address: string, modTier: "Community" | "Senior" | "Lead" }
 */
export async function POST(request: NextRequest) {
  const limited = rateLimit(`admin-mod-tier:${getIPKey(request)}`, 60_000, 10);
  if (limited) return limited;

  const expectedKey = process.env.ADMIN_API_KEY || process.env.INTERNAL_API_KEY;
  if (!expectedKey) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const internalKey = request.headers.get("x-internal-key");
  if (!internalKey || internalKey !== expectedKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { address, modTier } = body;

  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  if (!VALID_TIERS.includes(modTier)) {
    return NextResponse.json(
      { error: `Invalid modTier. Must be one of: ${VALID_TIERS.join(", ")}` },
      { status: 400 }
    );
  }

  const user = await getUserByAddress(address);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  await updateUser(address, { modTier } as any, { unsafe: true });

  // Audit log
  const entry: ModLogEntry = {
    id: await nextId("modLog"),
    action: "set_mod_tier",
    moderator: "admin-api",
    target: address,
    reason: `Set mod tier to ${modTier}`,
    createdAt: Date.now(),
  };
  await createModLogEntry(entry);

  return NextResponse.json({
    success: true,
    address,
    modTier,
    displayName: user.displayName,
  });
}
