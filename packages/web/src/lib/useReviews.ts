"use client";

import { useReadContract, useWriteContract, usePublicClient } from "wagmi";
import { type Address } from "viem";
import { getContracts, CHAIN } from "@/config/contracts";
import { useQuery } from "@tanstack/react-query";

// ── ReviewRegistry ABI (subset for frontend reads + writes) ─────────
export const ReviewRegistryABI = [
  {
    type: "function",
    name: "getReview",
    inputs: [{ name: "reviewId", type: "uint256", internalType: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        internalType: "struct IReviewRegistry.Review",
        components: [
          { name: "id", type: "uint256", internalType: "uint256" },
          { name: "jobId", type: "uint256", internalType: "uint256" },
          { name: "reviewer", type: "address", internalType: "address" },
          { name: "subject", type: "address", internalType: "address" },
          { name: "rating", type: "uint8", internalType: "uint8" },
          { name: "metadataURI", type: "string", internalType: "string" },
          { name: "timestamp", type: "uint256", internalType: "uint256" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getReviewByJobAndReviewer",
    inputs: [
      { name: "jobId", type: "uint256", internalType: "uint256" },
      { name: "reviewer", type: "address", internalType: "address" },
    ],
    outputs: [
      {
        name: "",
        type: "tuple",
        internalType: "struct IReviewRegistry.Review",
        components: [
          { name: "id", type: "uint256", internalType: "uint256" },
          { name: "jobId", type: "uint256", internalType: "uint256" },
          { name: "reviewer", type: "address", internalType: "address" },
          { name: "subject", type: "address", internalType: "address" },
          { name: "rating", type: "uint8", internalType: "uint8" },
          { name: "metadataURI", type: "string", internalType: "string" },
          { name: "timestamp", type: "uint256", internalType: "uint256" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getRatingStats",
    inputs: [{ name: "subject", type: "address", internalType: "address" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        internalType: "struct IReviewRegistry.RatingStats",
        components: [
          { name: "totalRatings", type: "uint256", internalType: "uint256" },
          { name: "sumRatings", type: "uint256", internalType: "uint256" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getAverageRating",
    inputs: [{ name: "subject", type: "address", internalType: "address" }],
    outputs: [
      { name: "numerator", type: "uint256", internalType: "uint256" },
      { name: "denominator", type: "uint256", internalType: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "submitReview",
    inputs: [
      { name: "jobId", type: "uint256", internalType: "uint256" },
      { name: "rating", type: "uint8", internalType: "uint8" },
      { name: "metadataURI", type: "string", internalType: "string" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "event",
    name: "ReviewSubmitted",
    inputs: [
      { name: "reviewId", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "jobId", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "reviewer", type: "address", indexed: true, internalType: "address" },
      { name: "subject", type: "address", indexed: false, internalType: "address" },
      { name: "rating", type: "uint8", indexed: false, internalType: "uint8" },
      { name: "metadataURI", type: "string", indexed: false, internalType: "string" },
    ],
    anonymous: false,
  },
] as const;

// ── Types ───────────────────────────────────────────────────────────
export interface OnChainReview {
  id: bigint;
  jobId: bigint;
  reviewer: Address;
  subject: Address;
  rating: number;
  metadataURI: string;
  timestamp: bigint;
}

export interface RatingStats {
  totalRatings: bigint;
  sumRatings: bigint;
}

// ── Helper ──────────────────────────────────────────────────────────
function useContracts() {
  return getContracts(CHAIN.id);
}

// ── READ hooks ──────────────────────────────────────────────────────

/** Fetch a single review by its ID */
export function useReview(reviewId?: bigint) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.reviewRegistry,
    abi: ReviewRegistryABI,
    functionName: "getReview",
    args: reviewId !== undefined ? [reviewId] : undefined,
    query: { enabled: reviewId !== undefined && !!contracts },
  });
}

/** Fetch a review by job ID + reviewer address */
export function useReviewByJobAndReviewer(jobId?: bigint, reviewer?: `0x${string}`) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.reviewRegistry,
    abi: ReviewRegistryABI,
    functionName: "getReviewByJobAndReviewer",
    args: jobId !== undefined && reviewer ? [jobId, reviewer] : undefined,
    query: { enabled: jobId !== undefined && !!reviewer && !!contracts },
  });
}

/** Fetch totalRatings + sumRatings for a subject */
export function useRatingStats(subject?: `0x${string}`) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.reviewRegistry,
    abi: ReviewRegistryABI,
    functionName: "getRatingStats",
    args: subject ? [subject] : undefined,
    query: { enabled: !!subject && !!contracts },
  });
}

/** Fetch average rating as numerator/denominator for a subject */
export function useAverageRating(subject?: `0x${string}`) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.reviewRegistry,
    abi: ReviewRegistryABI,
    functionName: "getAverageRating",
    args: subject ? [subject] : undefined,
    query: { enabled: !!subject && !!contracts },
  });
}

// ── WRITE hook ──────────────────────────────────────────────────────

/** Submit an on-chain review: jobId, rating (1-5), metadataURI */
export function useSubmitReview() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();

  const fn = async (jobId: bigint, rating: number, metadataURI: string) => {
    if (!contracts) throw new Error("Contracts not loaded");
    if (rating < 1 || rating > 5) throw new Error("Rating must be 1-5");
    return writeContractAsync({
      address: contracts.reviewRegistry as Address,
      abi: ReviewRegistryABI,
      functionName: "submitReview",
      args: [jobId, rating, metadataURI],
    });
  };

  return { fn, isPending, isError, error, reset };
}

// ── Event-scanning hook to load review history ──────────────────────

export interface ReviewEvent {
  reviewId: bigint;
  jobId: bigint;
  reviewer: Address;
  subject: Address;
  rating: number;
  metadataURI: string;
  blockNumber: bigint;
  transactionHash: `0x${string}`;
}

/**
 * Scan ReviewSubmitted events to build review history for an address.
 * Returns reviews where address is either reviewer or subject.
 */
export function useReviewHistory(address?: `0x${string}`) {
  const contracts = useContracts();
  const publicClient = usePublicClient();

  return useQuery({
    queryKey: ["review-history", address, contracts?.reviewRegistry],
    queryFn: async (): Promise<{ given: ReviewEvent[]; received: ReviewEvent[] }> => {
      if (!publicClient || !contracts?.reviewRegistry || !address) {
        return { given: [], received: [] };
      }

      // Fetch reviews given (address is reviewer -- indexed param)
      const givenLogs = await publicClient.getContractEvents({
        address: contracts.reviewRegistry,
        abi: ReviewRegistryABI,
        eventName: "ReviewSubmitted",
        args: { reviewer: address },
        fromBlock: 0n,
        toBlock: "latest",
      });

      // Fetch all recent reviews and filter for received (subject is not indexed,
      // so we need to fetch broadly and filter client-side)
      const allLogs = await publicClient.getContractEvents({
        address: contracts.reviewRegistry,
        abi: ReviewRegistryABI,
        eventName: "ReviewSubmitted",
        fromBlock: 0n,
        toBlock: "latest",
      });

      const mapEvent = (log: typeof allLogs[number]): ReviewEvent => {
        const args = log.args as {
          reviewId?: bigint;
          jobId?: bigint;
          reviewer?: Address;
          subject?: Address;
          rating?: number;
          metadataURI?: string;
        };
        return {
          reviewId: args.reviewId ?? 0n,
          jobId: args.jobId ?? 0n,
          reviewer: args.reviewer ?? ("0x" as Address),
          subject: args.subject ?? ("0x" as Address),
          rating: Number(args.rating ?? 0),
          metadataURI: args.metadataURI ?? "",
          blockNumber: log.blockNumber ?? 0n,
          transactionHash: log.transactionHash ?? ("0x" as `0x${string}`),
        };
      };

      const given = givenLogs.map(mapEvent).sort((a, b) => Number(b.blockNumber - a.blockNumber));
      const received = allLogs
        .filter((log) => {
          const args = log.args as { subject?: Address };
          return args.subject?.toLowerCase() === address.toLowerCase();
        })
        .map(mapEvent)
        .sort((a, b) => Number(b.blockNumber - a.blockNumber));

      return { given, received };
    },
    enabled: !!address && !!contracts?.reviewRegistry && !!publicClient,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}
