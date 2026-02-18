import { NextRequest, NextResponse } from "next/server";
import { generateChallenge } from "@/lib/forum-auth";
import { rateLimit, getIPKey } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const limited = rateLimit(`forum-challenge:${getIPKey(request)}`, 60_000, 10);
  if (limited) return limited;

  const address = request.nextUrl.searchParams.get("address");
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json(
      { error: "Missing or invalid Ethereum address" },
      { status: 400 }
    );
  }

  const nonce = await generateChallenge(address);
  return NextResponse.json({ nonce });
}
