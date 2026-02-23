import { NextRequest, NextResponse } from "next/server";
import { keccak256, encodePacked, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  getAirdropV3Attestation,
  atomicAirdropV3Approval,
  getBannedIp,
  setBannedIp,
} from "@/lib/firestore-store";
import { extractClientIp } from "@/lib/upload-security";
import { rateLimit, getIPKey, checkBodySize } from "@/lib/rate-limit";

/**
 * POST /api/airdrop/v3/approve
 *
 * IP-gated approval. One approval per IP address. Second attempt = permanent ban.
 *
 * Request body: { address: string, nonce: string }
 * Response: { signature: string, signer: string }
 */
export async function POST(request: NextRequest) {
  const limited = rateLimit(`airdrop-approve:${getIPKey(request)}`, 60_000, 5);
  if (limited) return limited;

  const tooLarge = await checkBodySize(request, 1_048_576);
  if (tooLarge) return tooLarge;

  try {
    const body = await request.json();
    const { address, nonce } = body;

    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return NextResponse.json({ error: "Invalid Ethereum address" }, { status: 400 });
    }

    if (!nonce) {
      return NextResponse.json({ error: "Missing nonce" }, { status: 400 });
    }

    // Verify attestation exists for this address + nonce combo
    const attestation = await getAirdropV3Attestation(address.toLowerCase());
    if (!attestation || attestation.nonce !== nonce) {
      return NextResponse.json(
        { error: "No valid attestation found. Call /attest first." },
        { status: 400 }
      );
    }

    // Extract client IP
    const ip = extractClientIp(request);

    // Check if IP is banned
    const bannedEntry = await getBannedIp(ip);
    if (bannedEntry?.banned) {
      return NextResponse.json(
        { error: "This IP address has been permanently banned from the airdrop." },
        { status: 403 }
      );
    }

    // Atomic check-and-set: one approval per IP
    const approvalResult = await atomicAirdropV3Approval(ip, {
      address: address.toLowerCase(),
      nonce,
      approvedAt: Date.now(),
    });

    if (!approvalResult.success) {
      // IP already used — ban
      await setBannedIp(ip, {
        attempts: (bannedEntry?.attempts ?? 1) + 1,
        firstAttempt: approvalResult.existingApproval?.approvedAt ?? Date.now(),
        lastAttempt: Date.now(),
        banned: true,
        reason: "Duplicate airdrop V3 approval attempt",
        bannedBy: "system",
        scope: "airdrop",
        bannedAt: Date.now(),
      });

      return NextResponse.json(
        { error: "This IP has been permanently banned. Only one approval per IP." },
        { status: 403 }
      );
    }

    // Sign approval
    const signerKey = process.env.AIRDROP_APPROVAL_SIGNER_KEY;
    if (!signerKey) {
      return NextResponse.json(
        { error: "Server misconfigured: missing approval signer key" },
        { status: 500 }
      );
    }

    const account = privateKeyToAccount(signerKey as `0x${string}`);

    // keccak256(abi.encodePacked(address, nonce, "LOBSTR_AIRDROP_V3_APPROVAL"))
    const msgHash = keccak256(
      encodePacked(
        ["address", "uint256", "string"],
        [address as `0x${string}`, BigInt(nonce), "LOBSTR_AIRDROP_V3_APPROVAL"]
      )
    );

    const signature = await account.signMessage({
      message: { raw: toBytes(msgHash) },
    });

    return NextResponse.json({
      signature,
      signer: account.address,
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
