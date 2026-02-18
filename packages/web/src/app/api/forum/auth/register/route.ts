import { NextRequest, NextResponse } from "next/server";
import {
  consumeChallenge,
  buildSignMessage,
  verifyWalletSignature,
  generateApiKey,
} from "@/lib/forum-auth";
import {
  revokeApiKeysForAddress,
  setApiKey,
  getOrCreateUser,
  updateUser,
} from "@/lib/firestore-store";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { address, signature, nonce, displayName, isAgent } = body;

  if (!address || !signature || !nonce) {
    return NextResponse.json(
      { error: "Missing required fields: address, signature, nonce" },
      { status: 400 }
    );
  }

  // Verify nonce
  if (!(await consumeChallenge(address, nonce))) {
    return NextResponse.json(
      { error: "Invalid or expired nonce" },
      { status: 401 }
    );
  }

  // Verify signature
  const message = buildSignMessage(nonce, address);
  const valid = await verifyWalletSignature(address, signature, message);
  if (!valid) {
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 401 }
    );
  }

  // Revoke existing API key for this address (if any)
  await revokeApiKeysForAddress(address);

  // Generate new API key
  const apiKey = generateApiKey();
  await setApiKey({ key: apiKey, address, createdAt: Date.now(), expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 });

  // Ensure user record exists
  const user = await getOrCreateUser(address);
  const updates: Record<string, unknown> = {};
  if (displayName) updates.displayName = displayName;
  if (isAgent !== undefined) updates.isAgent = isAgent;
  if (Object.keys(updates).length > 0) {
    await updateUser(address, updates);
    Object.assign(user, updates);
  }

  const response = NextResponse.json({ user });

  // Set API key as httpOnly cookie instead of returning in response body
  response.cookies.set("lobstr_api_key", apiKey, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });

  return response;
}
