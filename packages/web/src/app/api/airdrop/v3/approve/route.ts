import { NextRequest, NextResponse } from "next/server";
import { keccak256, encodePacked, toBytes, createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import {
  getAirdropV3Attestation,
  atomicAirdropV3Approval,
} from "@/lib/firestore-store";
import { extractClientIp } from "@/lib/upload-security";
import { rateLimit, getIPKey, checkBodySize } from "@/lib/rate-limit";
import { CONTRACTS_BY_CHAIN } from "@/config/contract-addresses";

const AIRDROP_CLAIM_ABI = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "getClaim",
    outputs: [
      {
        components: [
          { name: "claimed", type: "bool" },
          { name: "released", type: "uint256" },
          { name: "milestonesCompleted", type: "uint256" },
          { name: "claimedAt", type: "uint256" },
        ],
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

/**
 * POST /api/airdrop/v3/approve
 *
 * IP-gated approval. Allows one unclaimed address per IP.
 * Retries from the same address are idempotent.
 * Rejects if a *different* address from this IP already claimed on-chain.
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

    // Sign approval helper
    const signerKey = process.env.AIRDROP_APPROVAL_SIGNER_KEY;
    if (!signerKey) {
      return NextResponse.json(
        { error: "Server misconfigured: missing approval signer key" },
        { status: 500 }
      );
    }

    const account = privateKeyToAccount(signerKey as `0x${string}`);

    const signApproval = async (addr: string, n: string) => {
      const msgHash = keccak256(
        encodePacked(
          ["address", "uint256", "string"],
          [addr as `0x${string}`, BigInt(n), "LOBSTR_AIRDROP_V3_APPROVAL"]
        )
      );
      return account.signMessage({ message: { raw: toBytes(msgHash) } });
    };

    // Atomic check-and-set: one approval per IP
    const approvalResult = await atomicAirdropV3Approval(ip, {
      address: address.toLowerCase(),
      nonce,
      approvedAt: Date.now(),
    });

    if (!approvalResult.success) {
      const existing = approvalResult.existingApproval!;

      // Same address retrying — idempotent, re-sign
      if (existing.address === address.toLowerCase()) {
        const signature = await signApproval(address, existing.nonce);
        return NextResponse.json({ signature, signer: account.address });
      }

      // Different address from same IP — check if the previous address
      // actually claimed on-chain. If not, allow the new address through.
      const addresses = CONTRACTS_BY_CHAIN[base.id];
      const airdropAddr = addresses.airdropClaim;

      const client = createPublicClient({
        chain: base,
        transport: http(
          `https://base-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`
        ),
      });

      const claimInfo = await client.readContract({
        address: airdropAddr,
        abi: AIRDROP_CLAIM_ABI,
        functionName: "getClaim",
        args: [existing.address as `0x${string}`],
      });

      if (claimInfo.claimed) {
        // Previous address from this IP already claimed on-chain — reject
        return NextResponse.json(
          { error: "Another address from this IP has already claimed the airdrop." },
          { status: 403 }
        );
      }

      // Previous address never claimed on-chain — allow this new address.
      // Overwrite the approval record.
      await atomicAirdropV3Approval(ip, {
        address: address.toLowerCase(),
        nonce,
        approvedAt: Date.now(),
      }, true);

      const signature = await signApproval(address, nonce);
      return NextResponse.json({ signature, signer: account.address });
    }

    // First approval from this IP — sign and return
    const signature = await signApproval(address, nonce);

    return NextResponse.json({
      signature,
      signer: account.address,
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
