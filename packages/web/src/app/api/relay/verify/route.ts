import { NextRequest, NextResponse } from "next/server";
import { recoverMessageAddress } from "viem";
import { rateLimit, getIPKey } from "@/lib/rate-limit";

/**
 * GET /api/relay/verify?type=<type>&to=<to>&payload=<payload>&nonce=<nonce>&signature=<sig>
 * Utility to verify a relay message signature and return the recovered signer.
 */
export async function GET(request: NextRequest) {
  const limited = rateLimit(`relay-verify:${getIPKey(request)}`, 60_000, 30);
  if (limited) return limited;

  const params = request.nextUrl.searchParams;
  const type = params.get("type");
  const to = params.get("to");
  const payload = params.get("payload");
  const nonce = params.get("nonce");
  const signature = params.get("signature");

  if (!type || !to || !payload || !nonce || !signature) {
    return NextResponse.json({ error: "Missing required params" }, { status: 400 });
  }

  const message = `LOBSTR Relay\nType: ${type}\nTo: ${to}\nPayload: ${payload}\nNonce: ${nonce}`;

  try {
    const signer = await recoverMessageAddress({
      message,
      signature: signature as `0x${string}`,
    });
    return NextResponse.json({ valid: true, signer });
  } catch {
    return NextResponse.json({ valid: false, signer: null });
  }
}
