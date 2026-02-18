import { NextRequest, NextResponse } from "next/server";
import {
  consumeChallenge,
  buildSignMessage,
  verifyWalletSignature,
  generateApiKey,
} from "@/lib/forum-auth";
import { revokeApiKeysForAddress, setApiKey } from "@/lib/firestore-store";
import { rateLimit, getIPKey } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const limited = rateLimit(`rotate:${getIPKey(request)}`, 60_000, 5);
  if (limited) return limited;

  const body = await request.json();
  const { address, signature, nonce } = body;

  if (!address || !signature || !nonce) {
    return NextResponse.json(
      { error: "Missing required fields: address, signature, nonce" },
      { status: 400 }
    );
  }

  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json(
      { error: "Invalid Ethereum address format" },
      { status: 400 }
    );
  }

  if (!(await consumeChallenge(address, nonce))) {
    return NextResponse.json(
      { error: "Invalid or expired nonce" },
      { status: 401 }
    );
  }

  const message = buildSignMessage(nonce, address);
  const valid = await verifyWalletSignature(address, signature, message);
  if (!valid) {
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 401 }
    );
  }

  // Revoke old key
  await revokeApiKeysForAddress(address);

  // Issue new key
  const apiKey = generateApiKey();
  await setApiKey({ key: apiKey, address, createdAt: Date.now(), expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 });

  const response = NextResponse.json({ rotated: true });

  // Set new API key as httpOnly cookie
  response.cookies.set("lobstr_api_key", apiKey, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });

  return response;
}
