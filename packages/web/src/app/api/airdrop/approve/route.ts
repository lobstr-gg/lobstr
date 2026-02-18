import { NextRequest, NextResponse } from "next/server";
import { keccak256, encodePacked, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  getAirdropApproval,
  setAirdropApproval,
  getBannedIp,
  setBannedIp,
  atomicAirdropApproval,
} from "@/lib/firestore-store";
import { extractClientIp } from "@/lib/upload-security";
import { rateLimit, getIPKey, checkBodySize } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const limited = rateLimit(`airdrop:${getIPKey(request)}`, 60_000, 5);
  if (limited) return limited;

  const tooLarge = await checkBodySize(request, 1_048_576);
  if (tooLarge) return tooLarge;

  try {
    const body = await request.json();
    const { address, workspaceHash } = body;

    if (!address || !workspaceHash) {
      return NextResponse.json(
        { error: "Missing address or workspaceHash" },
        { status: 400 }
      );
    }

    // Validate Ethereum address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return NextResponse.json(
        { error: "Invalid Ethereum address format" },
        { status: 400 }
      );
    }

    // Extract client IP (use last x-forwarded-for value to prevent spoofing)
    const ip = extractClientIp(request);

    // Check if IP is banned (any previous attempt = permanent ban)
    const bannedEntry = await getBannedIp(ip);
    if (bannedEntry?.banned) {
      return NextResponse.json(
        { error: "This IP address has been permanently banned from the airdrop. Attempting to claim more than once per IP is a violation of the airdrop terms and results in an immediate platform-wide ban." },
        { status: 403 }
      );
    }

    // Atomic check-and-set to prevent TOCTOU race condition
    const approvalResult = await atomicAirdropApproval(ip, {
      address,
      workspaceHash: String(workspaceHash),
      approvedAt: Date.now(),
    });

    if (!approvalResult.success) {
      // IP was already used — ban
      await setBannedIp(ip, {
        attempts: (bannedEntry?.attempts ?? 1) + 1,
        firstAttempt: approvalResult.existingApproval?.approvedAt ?? Date.now(),
        lastAttempt: Date.now(),
        banned: true,
      });

      return NextResponse.json(
        { error: "This IP address has been permanently banned from the airdrop. Only one claim per IP is allowed. This attempt has been logged and your IP is now banned from the platform." },
        { status: 403 }
      );
    }

    // Sign the approval message
    const signerKey = process.env.AIRDROP_APPROVAL_SIGNER_KEY;
    if (!signerKey) {
      return NextResponse.json(
        { error: "Server misconfigured: missing signer key" },
        { status: 500 }
      );
    }

    const account = privateKeyToAccount(signerKey as `0x${string}`);

    // Build the same message hash the contract expects:
    // keccak256(abi.encodePacked(address, workspaceHash, "LOBSTR_AIRDROP_APPROVAL"))
    const msgHash = keccak256(
      encodePacked(
        ["address", "uint256", "string"],
        [address as `0x${string}`, BigInt(workspaceHash), "LOBSTR_AIRDROP_APPROVAL"]
      )
    );

    // Sign as eth_sign (prefixed message) to match ECDSA.toEthSignedMessageHash
    const signature = await account.signMessage({
      message: { raw: toBytes(msgHash) },
    });

    return NextResponse.json({
      signature,
      signer: account.address,
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
