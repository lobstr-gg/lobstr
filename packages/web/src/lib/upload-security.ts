import "server-only";

/**
 * Upload Security Module
 *
 * Enforces IP bans and platform bans for malicious file upload attempts.
 * Malicious = magic byte mismatch (file masquerading), executable upload attempts,
 * or repeated validation failures.
 *
 * Ban thresholds:
 * - 1 magic byte mismatch → immediate IP ban + wallet flag
 * - 3 validation failures (wrong type, too large) → IP ban + wallet flag
 *
 * All bans are logged to the moderation log for transparency.
 */

import { getDb } from "./firebase-admin";
import {
  getBannedIp,
  setBannedIp,
  nextId,
  createModLogEntry,
} from "./firestore-store";
import type { BannedIpEntry } from "./firestore-store";
import type { ModLogEntry } from "./forum-types";

const SOFT_FAILURE_THRESHOLD = 3; // validation errors before ban

export type ViolationType =
  | "magic_byte_mismatch" // file content doesn't match extension — immediate ban
  | "executable_upload" // tried to upload .exe/.sh/.html — immediate ban
  | "validation_failure"; // wrong type, too large, etc. — counted

interface UploadViolation {
  type: ViolationType;
  filename: string;
  detail: string;
}

/**
 * Record an upload violation. Returns true if the IP/address should be banned.
 * Automatically bans on immediate-ban violations (magic byte mismatch, executables).
 */
export async function recordUploadViolation(
  ip: string,
  walletAddress: string,
  violation: UploadViolation
): Promise<{ banned: boolean; reason: string }> {
  const db = getDb();
  const isImmediateBan =
    violation.type === "magic_byte_mismatch" ||
    violation.type === "executable_upload";

  // Track violations per IP
  const violationRef = db.collection("uploadViolations").doc(ip);
  const snap = await violationRef.get();
  const existing = snap.exists ? snap.data() : null;

  const count = (existing?.count ?? 0) + 1;
  const violations = existing?.violations ?? [];
  violations.push({
    ...violation,
    walletAddress,
    timestamp: Date.now(),
  });

  await violationRef.set(
    {
      ip,
      count,
      violations,
      lastViolation: Date.now(),
      firstViolation: existing?.firstViolation ?? Date.now(),
    },
    { merge: true }
  );

  // Determine if ban is warranted
  const shouldBan =
    isImmediateBan || count >= SOFT_FAILURE_THRESHOLD;

  if (!shouldBan) {
    return { banned: false, reason: "" };
  }

  const reason = isImmediateBan
    ? `Malicious file upload: ${violation.type} — ${violation.detail}`
    : `Repeated upload violations (${count} attempts) — ${violation.detail}`;

  // Execute IP ban
  await executeBan(ip, walletAddress, reason);

  return { banned: true, reason };
}

/**
 * Execute an IP ban + wallet flag for malicious upload behavior.
 */
async function executeBan(
  ip: string,
  walletAddress: string,
  reason: string
): Promise<void> {
  const db = getDb();

  // 1. IP ban (platform-wide)
  const existing = await getBannedIp(ip);
  const banEntry: BannedIpEntry = {
    attempts: (existing?.attempts ?? 0) + 1,
    firstAttempt: existing?.firstAttempt ?? Date.now(),
    lastAttempt: Date.now(),
    banned: true,
    reason,
    bannedBy: "system:upload-security",
    scope: "platform",
    bannedAt: Date.now(),
  };
  await setBannedIp(ip, banEntry);

  // 2. Flag the wallet address (platform ban record)
  await db
    .collection("bannedWallets")
    .doc(walletAddress.toLowerCase())
    .set(
      {
        address: walletAddress.toLowerCase(),
        banned: true,
        reason,
        bannedBy: "system:upload-security",
        bannedAt: Date.now(),
        ip, // link to the IP for investigation
      },
      { merge: true }
    );

  // 3. Log to moderation log
  const logEntry: ModLogEntry = {
    id: await nextId("modLog"),
    action: "ip_ban",
    moderator: "system:upload-security",
    target: `IP: ${ip} | Wallet: ${walletAddress}`,
    reason,
    createdAt: Date.now(),
  };
  await createModLogEntry(logEntry);
}

/**
 * Check if a wallet is platform-banned (separate from IP bans).
 */
export async function isWalletBanned(
  address: string
): Promise<boolean> {
  const db = getDb();
  const snap = await db
    .collection("bannedWallets")
    .doc(address.toLowerCase())
    .get();
  if (!snap.exists) return false;
  return snap.data()?.banned === true;
}

/**
 * Extract client IP from request headers.
 *
 * Security: Use the LAST value in x-forwarded-for (proxy-appended, not client-controlled).
 * The first value is client-set and trivially spoofable.
 * Prefer x-vercel-forwarded-for when deployed on Vercel (set by the platform, not the client).
 */
export function extractClientIp(request: Request): string {
  // Vercel-set header (most trustworthy on Vercel)
  const vercelForwarded = request.headers.get("x-vercel-forwarded-for");
  if (vercelForwarded) {
    const parts = vercelForwarded.split(",");
    return parts[parts.length - 1].trim();
  }

  // Standard x-forwarded-for — use LAST value (proxy-appended)
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",");
    return parts[parts.length - 1].trim();
  }

  const realIp = request.headers.get("x-real-ip");
  return realIp || "unknown";
}

/**
 * Detect if a filename suggests an executable or script upload attempt.
 * These are immediate-ban worthy even before magic byte checks.
 */
export function isExecutableFilename(filename: string): boolean {
  const dangerous = [
    ".exe", ".bat", ".cmd", ".com", ".msi", ".scr", ".pif",
    ".sh", ".bash", ".csh", ".ksh", ".zsh",
    ".ps1", ".psm1", ".psd1",
    ".vbs", ".vbe", ".js", ".jse", ".wsf", ".wsh",
    ".html", ".htm", ".svg", ".xml",
    ".py", ".rb", ".pl", ".php",
    ".dll", ".so", ".dylib",
    ".app", ".dmg", ".deb", ".rpm",
    ".jar", ".war", ".class",
  ];
  const ext = filename.lastIndexOf(".") >= 0
    ? filename.slice(filename.lastIndexOf(".")).toLowerCase()
    : "";
  return dangerous.includes(ext);
}
