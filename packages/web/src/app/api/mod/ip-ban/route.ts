import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isModerator } from "@/lib/forum-auth";
import { rateLimit, getIPKey } from "@/lib/rate-limit";
import {
  getBannedIp,
  setBannedIp,
  unbanIp,
  nextId,
  createModLogEntry,
} from "@/lib/firestore-store";
import type { ModLogEntry } from "@/lib/forum-types";

/**
 * POST /api/mod/ip-ban — Ban an IP address platform-wide (mod-only)
 * Body: { ip: string, reason: string }
 */
export async function POST(request: NextRequest) {
  const limited = rateLimit(`ip-ban:${getIPKey(request)}`, 60_000, 20);
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
  const { ip, reason } = body;

  if (!ip || typeof ip !== "string") {
    return NextResponse.json(
      { error: "Missing required field: ip" },
      { status: 400 }
    );
  }

  // IP format validation (IPv4 with octet range check, or IPv6)
  const ipv4Match = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  const ipv6 = /^([0-9a-fA-F]{1,4}:){2,7}[0-9a-fA-F]{1,4}$|^::([0-9a-fA-F]{1,4}:){0,5}[0-9a-fA-F]{1,4}$|^([0-9a-fA-F]{1,4}:){1,6}:$/;
  if (ipv4Match) {
    const octets = [ipv4Match[1], ipv4Match[2], ipv4Match[3], ipv4Match[4]];
    if (octets.some((o) => parseInt(o, 10) > 255)) {
      return NextResponse.json(
        { error: "Invalid IP address: octets must be 0-255" },
        { status: 400 }
      );
    }
  } else if (!ipv6.test(ip)) {
    return NextResponse.json(
      { error: "Invalid IP address format" },
      { status: 400 }
    );
  }

  const existing = await getBannedIp(ip);
  if (existing?.banned && existing.scope === "platform") {
    return NextResponse.json(
      { error: "IP is already banned" },
      { status: 409 }
    );
  }

  await setBannedIp(ip, {
    attempts: (existing?.attempts ?? 0) + 1,
    firstAttempt: existing?.firstAttempt ?? Date.now(),
    lastAttempt: Date.now(),
    banned: true,
    reason: reason || "Banned by moderator",
    bannedBy: auth.address,
    scope: "platform",
    bannedAt: Date.now(),
  });

  // Log the action
  const entry: ModLogEntry = {
    id: await nextId("modLog"),
    action: "ip_ban",
    moderator: auth.address,
    target: ip,
    reason: reason || "No reason provided",
    createdAt: Date.now(),
  };
  await createModLogEntry(entry);

  return NextResponse.json({ success: true, ip, entry }, { status: 201 });
}

/**
 * DELETE /api/mod/ip-ban — Unban an IP address (mod-only)
 * Body: { ip: string, reason: string }
 */
export async function DELETE(request: NextRequest) {
  const limited = rateLimit(`ip-unban:${getIPKey(request)}`, 60_000, 20);
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
  const { ip, reason } = body;

  if (!ip || typeof ip !== "string") {
    return NextResponse.json(
      { error: "Missing required field: ip" },
      { status: 400 }
    );
  }

  const removed = await unbanIp(ip);
  if (!removed) {
    return NextResponse.json(
      { error: "IP is not currently banned" },
      { status: 404 }
    );
  }

  const entry: ModLogEntry = {
    id: await nextId("modLog"),
    action: "ip_unban",
    moderator: auth.address,
    target: ip,
    reason: reason || "Unbanned by moderator",
    createdAt: Date.now(),
  };
  await createModLogEntry(entry);

  return NextResponse.json({ success: true, ip, entry });
}
