import { randomUUID } from "crypto";
import { verifyMessage } from "viem";
import { NextRequest, NextResponse } from "next/server";
import {
  getChallenge,
  setChallenge,
  deleteChallenge,
  getApiKeyEntry,
  getUserByAddress,
} from "./firestore-store";

// ── Challenge nonce store (persisted in Firestore) ───────────

const CHALLENGE_TTL = 5 * 60 * 1000; // 5 minutes

export async function generateChallenge(address: string): Promise<string> {
  const nonce = randomUUID();
  await setChallenge(address, {
    nonce,
    expiresAt: Date.now() + CHALLENGE_TTL,
  });
  return nonce;
}

export async function consumeChallenge(
  address: string,
  nonce: string
): Promise<boolean> {
  const entry = await getChallenge(address);
  if (!entry) return false;
  if (entry.nonce !== nonce) return false;
  if (Date.now() > entry.expiresAt) {
    await deleteChallenge(address);
    return false;
  }
  await deleteChallenge(address);
  return true;
}

// ── Signature message format ─────────────────────────────────

export function buildSignMessage(nonce: string, address: string): string {
  return `LOBSTR Forum\nNonce: ${nonce}\nAddress: ${address}`;
}

// ── API key management ───────────────────────────────────────

export function generateApiKey(): string {
  return `lobstr_${randomUUID().replace(/-/g, "")}`;
}

export async function validateApiKey(
  key: string
): Promise<{ address: string } | null> {
  const entry = await getApiKeyEntry(key);
  if (!entry) return null;
  if (entry.expiresAt && Date.now() > entry.expiresAt) return null;
  return { address: entry.address };
}

// ── Route middleware helper ──────────────────────────────────

export async function requireAuth(
  request: NextRequest
): Promise<{ address: string } | NextResponse> {
  // Try Authorization header first (for non-browser clients)
  const authHeader = request.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const key = authHeader.slice(7);
    const result = await validateApiKey(key);
    if (result) return result;
  }

  // Fallback: check httpOnly cookie (for browser clients)
  const cookieKey = request.cookies.get("lobstr_api_key")?.value;
  if (cookieKey) {
    const result = await validateApiKey(cookieKey);
    if (result) return result;
  }

  return NextResponse.json(
    { error: "Missing or invalid authentication" },
    { status: 401 }
  );
}

// ── Verify wallet signature ──────────────────────────────────

export async function verifyWalletSignature(
  address: string,
  signature: string,
  message: string
): Promise<boolean> {
  try {
    const valid = await verifyMessage({
      address: address as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    });
    return valid;
  } catch {
    return false;
  }
}

// ── Mod check ────────────────────────────────────────────────

export async function isModerator(address: string): Promise<boolean> {
  const user = await getUserByAddress(address);
  return user?.modTier !== null && user?.modTier !== undefined;
}
