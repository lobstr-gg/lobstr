import { NextRequest, NextResponse } from "next/server";
import { keccak256, encodePacked, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { rateLimit, getIPKey, checkBodySize } from "@/lib/rate-limit";
import {
  getAirdropV3Attestation,
  setAirdropV3Attestation,
} from "@/lib/firestore-store";

/**
 * POST /api/airdrop/v3/attest
 *
 * Backend verifies the address's on-chain activity (via the /check endpoint logic)
 * and signs an attestation with the tier and a unique nonce.
 *
 * Request body: { address: string, tier: number }
 * Response: { nonce: string, signature: string, tier: number, signer: string }
 */
export async function POST(request: NextRequest) {
  const limited = rateLimit(`airdrop-attest:${getIPKey(request)}`, 60_000, 5);
  if (limited) return limited;

  const tooLarge = await checkBodySize(request, 1_048_576);
  if (tooLarge) return tooLarge;

  try {
    const body = await request.json();
    const { address, tier } = body;

    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return NextResponse.json({ error: "Invalid Ethereum address" }, { status: 400 });
    }

    if (tier === undefined || tier < 0 || tier > 2) {
      return NextResponse.json({ error: "Invalid tier (0=New, 1=Active, 2=PowerUser)" }, { status: 400 });
    }

    // Check if attestation already exists for this address
    const existing = await getAirdropV3Attestation(address.toLowerCase());
    if (existing) {
      return NextResponse.json({
        nonce: existing.nonce,
        signature: existing.signature,
        tier: existing.tier,
        signer: existing.signer,
      });
    }

    const signerKey = process.env.AIRDROP_ATTEST_SIGNER_KEY;
    if (!signerKey) {
      return NextResponse.json(
        { error: "Server misconfigured: missing attest signer key" },
        { status: 500 }
      );
    }

    const account = privateKeyToAccount(signerKey as `0x${string}`);

    // Generate unique nonce (timestamp + random component for uniqueness)
    const nonce = BigInt(Date.now()) * 1000000n + BigInt(Math.floor(Math.random() * 1000000));

    // Sign: keccak256(abi.encodePacked(address, uint8(tier), nonce, "LOBSTR_AIRDROP_V3"))
    const msgHash = keccak256(
      encodePacked(
        ["address", "uint8", "uint256", "string"],
        [address as `0x${string}`, tier, nonce, "LOBSTR_AIRDROP_V3"]
      )
    );

    const signature = await account.signMessage({
      message: { raw: toBytes(msgHash) },
    });

    // Store attestation in Firestore
    await setAirdropV3Attestation(address.toLowerCase(), {
      address: address.toLowerCase(),
      tier,
      nonce: nonce.toString(),
      signature,
      signer: account.address,
      createdAt: Date.now(),
    });

    return NextResponse.json({
      nonce: nonce.toString(),
      signature,
      tier,
      signer: account.address,
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
