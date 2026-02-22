import { createPublicClient, http, type Address } from "viem";
import { CHAIN, RPC_URL, CONTRACTS } from "./config.js";

// ─── Viem Client ─────────────────────────────────────────────────────────────

export const publicClient = createPublicClient({
  chain: CHAIN,
  transport: http(RPC_URL),
});

// ─── Minimal ABIs (view functions only) ──────────────────────────────────────

const reputationAbi = [
  {
    type: "function",
    name: "getScore",
    inputs: [{ name: "user", type: "address" }],
    outputs: [
      { name: "score", type: "uint256" },
      { name: "tier", type: "uint8" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getReputationData",
    inputs: [{ name: "user", type: "address" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "score", type: "uint256" },
          { name: "completions", type: "uint256" },
          { name: "disputesLost", type: "uint256" },
          { name: "disputesWon", type: "uint256" },
          { name: "firstActivityTimestamp", type: "uint256" },
        ],
      },
    ],
    stateMutability: "view",
  },
] as const;

const stakingAbi = [
  {
    type: "function",
    name: "getTier",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getStake",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

const serviceRegistryAbi = [
  {
    type: "function",
    name: "getListing",
    inputs: [{ name: "listingId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "id", type: "uint256" },
          { name: "provider", type: "address" },
          { name: "category", type: "uint8" },
          { name: "title", type: "string" },
          { name: "description", type: "string" },
          { name: "pricePerUnit", type: "uint256" },
          { name: "settlementToken", type: "address" },
          { name: "estimatedDeliverySeconds", type: "uint256" },
          { name: "metadataURI", type: "string" },
          { name: "active", type: "bool" },
          { name: "createdAt", type: "uint256" },
        ],
      },
    ],
    stateMutability: "view",
  },
] as const;

// ─── Tier Name Maps ──────────────────────────────────────────────────────────

const STAKE_TIERS = ["None", "Bronze", "Silver", "Gold", "Platinum"] as const;
const REP_TIERS = ["Bronze", "Silver", "Gold", "Platinum"] as const;

// ─── Trust Query Types ───────────────────────────────────────────────────────

export interface SellerTrust {
  address: Address;
  reputationScore: number;
  reputationTier: string;
  stakeTier: string;
  stakeAmount: string;
  completedJobs: number;
  disputesWon: number;
  disputesLost: number;
}

export interface ListingData {
  id: bigint;
  provider: Address;
  category: number;
  title: string;
  pricePerUnit: bigint;
  settlementToken: Address;
  active: boolean;
}

// ─── On-Chain Queries ────────────────────────────────────────────────────────

export async function querySellerTrust(seller: Address): Promise<SellerTrust> {
  const [scoreData, stakeTier, stakeAmount, repData] = await Promise.all([
    publicClient.readContract({
      address: CONTRACTS.reputationSystem,
      abi: reputationAbi,
      functionName: "getScore",
      args: [seller],
    }),
    publicClient.readContract({
      address: CONTRACTS.stakingManager,
      abi: stakingAbi,
      functionName: "getTier",
      args: [seller],
    }),
    publicClient.readContract({
      address: CONTRACTS.stakingManager,
      abi: stakingAbi,
      functionName: "getStake",
      args: [seller],
    }),
    publicClient.readContract({
      address: CONTRACTS.reputationSystem,
      abi: reputationAbi,
      functionName: "getReputationData",
      args: [seller],
    }),
  ]);

  return {
    address: seller,
    reputationScore: Number(scoreData[0]),
    reputationTier: REP_TIERS[scoreData[1]] ?? "Bronze",
    stakeTier: STAKE_TIERS[stakeTier] ?? "None",
    stakeAmount: stakeAmount.toString(),
    completedJobs: Number(repData.completions),
    disputesWon: Number(repData.disputesWon),
    disputesLost: Number(repData.disputesLost),
  };
}

export async function queryListing(listingId: bigint): Promise<ListingData> {
  const listing = await publicClient.readContract({
    address: CONTRACTS.serviceRegistry,
    abi: serviceRegistryAbi,
    functionName: "getListing",
    args: [listingId],
  });

  return {
    id: listing.id,
    provider: listing.provider,
    category: listing.category,
    title: listing.title,
    pricePerUnit: listing.pricePerUnit,
    settlementToken: listing.settlementToken,
    active: listing.active,
  };
}
