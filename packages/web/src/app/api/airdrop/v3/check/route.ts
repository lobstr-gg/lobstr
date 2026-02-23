import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, type Address } from "viem";
import { rateLimit, getIPKey } from "@/lib/rate-limit";
import { CONTRACTS, CHAIN } from "@/config/contracts";

const client = createPublicClient({
  chain: CHAIN,
  transport: http(process.env.BASE_RPC_URL ?? "https://mainnet.base.org"),
});

const contracts = CONTRACTS[CHAIN.id];

// Minimal ABIs for on-chain activity checks
const escrowAbi = [
  {
    name: "getJobsByClient",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "client", type: "address" }],
    outputs: [{ name: "", type: "uint256[]" }],
  },
  {
    name: "getJobsByProvider",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "provider", type: "address" }],
    outputs: [{ name: "", type: "uint256[]" }],
  },
] as const;

const registryAbi = [
  {
    name: "getListingsByProvider",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "provider", type: "address" }],
    outputs: [{ name: "", type: "uint256[]" }],
  },
] as const;

const stakingAbi = [
  {
    name: "getStake",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "amount", type: "uint256" }, { name: "lockedUntil", type: "uint256" }],
  },
] as const;

interface EligibilityResult {
  eligible: boolean;
  tier: "New" | "Active" | "PowerUser" | null;
  tierIndex: number;
  activity: {
    jobsAsClient: number;
    jobsAsProvider: number;
    totalJobs: number;
    listings: number;
    staked: boolean;
    hasAnyInteraction: boolean;
  };
}

export async function GET(request: NextRequest) {
  const limited = rateLimit(`airdrop-check:${getIPKey(request)}`, 60_000, 20);
  if (limited) return limited;

  const address = request.nextUrl.searchParams.get("address");

  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: "Invalid or missing address" }, { status: 400 });
  }

  try {
    const addr = address as Address;

    // Fetch on-chain activity in parallel
    const [clientJobs, providerJobs, listings, stake] = await Promise.all([
      client.readContract({
        address: contracts.escrowEngine,
        abi: escrowAbi,
        functionName: "getJobsByClient",
        args: [addr],
      }).catch(() => [] as readonly bigint[]),
      client.readContract({
        address: contracts.escrowEngine,
        abi: escrowAbi,
        functionName: "getJobsByProvider",
        args: [addr],
      }).catch(() => [] as readonly bigint[]),
      client.readContract({
        address: contracts.serviceRegistry,
        abi: registryAbi,
        functionName: "getListingsByProvider",
        args: [addr],
      }).catch(() => [] as readonly bigint[]),
      client.readContract({
        address: contracts.stakingManager,
        abi: stakingAbi,
        functionName: "getStake",
        args: [addr],
      }).catch(() => [0n, 0n] as readonly [bigint, bigint]),
    ]);

    const totalJobs = clientJobs.length + providerJobs.length;
    const hasAnyInteraction = totalJobs > 0 || listings.length > 0 || stake[0] > 0n;

    // Determine tier based on on-chain activity
    // PowerUser: 3+ completed jobs
    // Active: 1+ completed job
    // New: any on-chain interaction (listing, job, or stake)
    let tier: "New" | "Active" | "PowerUser" | null = null;
    let tierIndex = -1;

    if (totalJobs >= 3) {
      tier = "PowerUser";
      tierIndex = 2;
    } else if (totalJobs >= 1) {
      tier = "Active";
      tierIndex = 1;
    } else if (hasAnyInteraction) {
      tier = "New";
      tierIndex = 0;
    }

    const result: EligibilityResult = {
      eligible: tier !== null,
      tier,
      tierIndex,
      activity: {
        jobsAsClient: clientJobs.length,
        jobsAsProvider: providerJobs.length,
        totalJobs,
        listings: listings.length,
        staked: stake[0] > 0n,
        hasAnyInteraction,
      },
    };

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
