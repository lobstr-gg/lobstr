"use client";

import { useReadContract, useWriteContract, usePublicClient, useAccount } from "wagmi";
import { type Address, formatEther, parseEther } from "viem";
import { getContracts, CHAIN, USDC } from "@/config/contracts";
import { LOBTokenABI } from "@/config/abis";
import { useQuery } from "@tanstack/react-query";

/* ════════════════════════════════════════════════════════════════════════
 *  SubscriptionEngine ABI (generated via `forge inspect SubscriptionEngine abi`)
 * ════════════════════════════════════════════════════════════════════════ */

export const SubscriptionEngineABI = [
  {
    type: "function",
    name: "getSubscription",
    inputs: [{ name: "id", type: "uint256", internalType: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        internalType: "struct ISubscriptionEngine.Subscription",
        components: [
          { name: "id", type: "uint256", internalType: "uint256" },
          { name: "buyer", type: "address", internalType: "address" },
          { name: "seller", type: "address", internalType: "address" },
          { name: "token", type: "address", internalType: "address" },
          { name: "amount", type: "uint256", internalType: "uint256" },
          { name: "interval", type: "uint256", internalType: "uint256" },
          { name: "nextDue", type: "uint256", internalType: "uint256" },
          { name: "maxCycles", type: "uint256", internalType: "uint256" },
          { name: "cyclesCompleted", type: "uint256", internalType: "uint256" },
          { name: "status", type: "uint8", internalType: "enum ISubscriptionEngine.SubscriptionStatus" },
          { name: "listingId", type: "uint256", internalType: "uint256" },
          { name: "metadataURI", type: "string", internalType: "string" },
          { name: "createdAt", type: "uint256", internalType: "uint256" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getSubscriptionsByBuyer",
    inputs: [{ name: "buyer", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "uint256[]", internalType: "uint256[]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getSubscriptionsBySeller",
    inputs: [{ name: "seller", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "uint256[]", internalType: "uint256[]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "createSubscription",
    inputs: [
      { name: "seller", type: "address", internalType: "address" },
      { name: "token", type: "address", internalType: "address" },
      { name: "amount", type: "uint256", internalType: "uint256" },
      { name: "interval", type: "uint256", internalType: "uint256" },
      { name: "maxCycles", type: "uint256", internalType: "uint256" },
      { name: "listingId", type: "uint256", internalType: "uint256" },
      { name: "metadataURI", type: "string", internalType: "string" },
    ],
    outputs: [{ name: "id", type: "uint256", internalType: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "processPayment",
    inputs: [{ name: "subscriptionId", type: "uint256", internalType: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "cancelSubscription",
    inputs: [{ name: "subscriptionId", type: "uint256", internalType: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "pauseSubscription",
    inputs: [{ name: "subscriptionId", type: "uint256", internalType: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "resumeSubscription",
    inputs: [{ name: "subscriptionId", type: "uint256", internalType: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "lobToken",
    inputs: [],
    outputs: [{ name: "", type: "address", internalType: "contract IERC20" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "USDC_FEE_BPS",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "MIN_INTERVAL",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "MAX_PROCESSING_WINDOW",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "SubscriptionCreated",
    inputs: [
      { name: "id", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "buyer", type: "address", indexed: true, internalType: "address" },
      { name: "seller", type: "address", indexed: true, internalType: "address" },
      { name: "token", type: "address", indexed: false, internalType: "address" },
      { name: "amount", type: "uint256", indexed: false, internalType: "uint256" },
      { name: "interval", type: "uint256", indexed: false, internalType: "uint256" },
      { name: "maxCycles", type: "uint256", indexed: false, internalType: "uint256" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "PaymentProcessed",
    inputs: [
      { name: "id", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "cycleNumber", type: "uint256", indexed: false, internalType: "uint256" },
      { name: "amount", type: "uint256", indexed: false, internalType: "uint256" },
      { name: "fee", type: "uint256", indexed: false, internalType: "uint256" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "SubscriptionCancelled",
    inputs: [
      { name: "id", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "cancelledBy", type: "address", indexed: false, internalType: "address" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "SubscriptionPaused",
    inputs: [{ name: "id", type: "uint256", indexed: true, internalType: "uint256" }],
    anonymous: false,
  },
  {
    type: "event",
    name: "SubscriptionResumed",
    inputs: [
      { name: "id", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "newNextDue", type: "uint256", indexed: false, internalType: "uint256" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "SubscriptionCompleted",
    inputs: [{ name: "id", type: "uint256", indexed: true, internalType: "uint256" }],
    anonymous: false,
  },
] as const;

/* ════════════════════════════════════════════════════════════════════════
 *  Types
 * ════════════════════════════════════════════════════════════════════════ */

// On-chain enum: Active=0, Paused=1, Cancelled=2, Completed=3
export type SubscriptionStatusEnum = 0 | 1 | 2 | 3;

export const STATUS_LABELS: Record<SubscriptionStatusEnum, string> = {
  0: "Active",
  1: "Paused",
  2: "Cancelled",
  3: "Completed",
};

export interface OnChainSubscription {
  id: bigint;
  buyer: Address;
  seller: Address;
  token: Address;
  amount: bigint;
  interval: bigint;
  nextDue: bigint;
  maxCycles: bigint;
  cyclesCompleted: bigint;
  status: SubscriptionStatusEnum;
  listingId: bigint;
  metadataURI: string;
  createdAt: bigint;
}

function useContracts() {
  return getContracts(CHAIN.id);
}

/* ════════════════════════════════════════════════════════════════════════
 *  READ HOOKS
 * ════════════════════════════════════════════════════════════════════════ */

/** Read a single subscription by ID */
export function useSubscription(id?: bigint) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.subscriptionEngine,
    abi: SubscriptionEngineABI,
    functionName: "getSubscription",
    args: id !== undefined ? [id] : undefined,
    query: { enabled: id !== undefined && !!contracts },
  });
}

/** Get all subscription IDs for a buyer */
export function useSubscriptionsByBuyer(buyer?: string) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.subscriptionEngine,
    abi: SubscriptionEngineABI,
    functionName: "getSubscriptionsByBuyer",
    args: buyer ? [buyer as Address] : undefined,
    query: { enabled: !!buyer && !!contracts },
  });
}

/** Get all subscription IDs for a seller */
export function useSubscriptionsBySeller(seller?: string) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.subscriptionEngine,
    abi: SubscriptionEngineABI,
    functionName: "getSubscriptionsBySeller",
    args: seller ? [seller as Address] : undefined,
    query: { enabled: !!seller && !!contracts },
  });
}

/* ════════════════════════════════════════════════════════════════════════
 *  Multicall helper: fetch full Subscription structs for a list of IDs
 * ════════════════════════════════════════════════════════════════════════ */

export function useSubscriptionDetails(ids?: readonly bigint[]) {
  const contracts = useContracts();
  const publicClient = usePublicClient();

  return useQuery({
    queryKey: ["subscription-details", ids?.map(String)],
    queryFn: async () => {
      if (!publicClient || !contracts || !ids || ids.length === 0) return [];

      const results = await publicClient.multicall({
        contracts: ids.map((id) => ({
          address: contracts.subscriptionEngine,
          abi: SubscriptionEngineABI,
          functionName: "getSubscription" as const,
          args: [id],
        })),
      });

      const subs: OnChainSubscription[] = [];
      for (const result of results) {
        if (result.status === "success" && result.result) {
          subs.push(result.result as unknown as OnChainSubscription);
        }
      }
      return subs;
    },
    enabled: !!publicClient && !!contracts && !!ids && ids.length > 0,
    refetchInterval: 30_000,
    staleTime: 10_000,
  });
}

/* ════════════════════════════════════════════════════════════════════════
 *  WRITE HOOKS
 * ════════════════════════════════════════════════════════════════════════ */

export function useCreateSubscription() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();

  const fn = async (
    seller: Address,
    token: Address,
    amount: bigint,
    interval: bigint,
    maxCycles: bigint,
    listingId: bigint,
    metadataURI: string,
  ) => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.subscriptionEngine as Address,
      abi: SubscriptionEngineABI,
      functionName: "createSubscription",
      args: [seller, token, amount, interval, maxCycles, listingId, metadataURI],
    });
  };

  return { fn, isPending, isError, error, reset };
}

export function useProcessPayment() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();

  const fn = async (subscriptionId: bigint) => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.subscriptionEngine as Address,
      abi: SubscriptionEngineABI,
      functionName: "processPayment",
      args: [subscriptionId],
    });
  };

  return { fn, isPending, isError, error, reset };
}

export function useCancelSubscription() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();

  const fn = async (subscriptionId: bigint) => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.subscriptionEngine as Address,
      abi: SubscriptionEngineABI,
      functionName: "cancelSubscription",
      args: [subscriptionId],
    });
  };

  return { fn, isPending, isError, error, reset };
}

export function usePauseSubscription() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();

  const fn = async (subscriptionId: bigint) => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.subscriptionEngine as Address,
      abi: SubscriptionEngineABI,
      functionName: "pauseSubscription",
      args: [subscriptionId],
    });
  };

  return { fn, isPending, isError, error, reset };
}

export function useResumeSubscription() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();

  const fn = async (subscriptionId: bigint) => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.subscriptionEngine as Address,
      abi: SubscriptionEngineABI,
      functionName: "resumeSubscription",
      args: [subscriptionId],
    });
  };

  return { fn, isPending, isError, error, reset };
}

/* ════════════════════════════════════════════════════════════════════════
 *  Token Approval Helper
 * ════════════════════════════════════════════════════════════════════════ */

export function useApproveTokenForSubscriptions() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();

  const fn = async (token: Address, amount: bigint) => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: token,
      abi: LOBTokenABI,
      functionName: "approve",
      args: [contracts.subscriptionEngine, amount],
    });
  };

  return { fn, isPending, isError, error, reset };
}

/** Read current allowance for the SubscriptionEngine spender */
export function useTokenAllowanceForSubscriptions(owner?: Address, token?: Address) {
  const contracts = useContracts();
  return useReadContract({
    address: token,
    abi: LOBTokenABI,
    functionName: "allowance",
    args: owner && contracts ? [owner, contracts.subscriptionEngine] : undefined,
    query: { enabled: !!owner && !!token && !!contracts },
  });
}

/* ════════════════════════════════════════════════════════════════════════
 *  Utility
 * ════════════════════════════════════════════════════════════════════════ */

/** Determine if a token address is LOB (0% fee) or stablecoin (1.5% fee) */
export function isLobToken(tokenAddress: Address): boolean {
  const contracts = getContracts(CHAIN.id);
  if (!contracts) return false;
  return tokenAddress.toLowerCase() === contracts.lobToken.toLowerCase();
}

/** Get the token address for LOB or USDC */
export function getTokenAddress(tokenType: "LOB" | "USDC"): Address {
  const contracts = getContracts(CHAIN.id);
  if (tokenType === "LOB" && contracts) return contracts.lobToken;
  return USDC[CHAIN.id];
}

/** Convert interval label to seconds */
export function intervalToSeconds(interval: "weekly" | "monthly" | "quarterly"): bigint {
  const map = {
    weekly: 7n * 24n * 3600n,    // 604800
    monthly: 30n * 24n * 3600n,   // 2592000
    quarterly: 90n * 24n * 3600n, // 7776000
  };
  return map[interval];
}

/** Convert seconds back to a human-readable interval label */
export function secondsToIntervalLabel(seconds: bigint): string {
  const s = Number(seconds);
  if (s <= 604800) return "Weekly";
  if (s <= 2592000) return "Monthly";
  if (s <= 7776000) return "Quarterly";
  const days = Math.round(s / 86400);
  return `Every ${days}d`;
}

/** Format a unix timestamp to a date string */
export function formatDueDate(timestamp: bigint): string {
  if (timestamp === 0n) return "N/A";
  return new Date(Number(timestamp) * 1000).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Check if a subscription payment is currently due */
export function isPaymentDue(sub: OnChainSubscription): boolean {
  if (sub.status !== 0) return false; // only Active subs
  const nowSec = BigInt(Math.floor(Date.now() / 1000));
  return sub.nextDue <= nowSec;
}

/** Check if a subscription is within the processing window (7 days) */
export function isWithinProcessingWindow(sub: OnChainSubscription): boolean {
  if (sub.status !== 0) return false;
  const nowSec = BigInt(Math.floor(Date.now() / 1000));
  const MAX_WINDOW = 7n * 24n * 3600n; // 7 days
  return sub.nextDue <= nowSec && nowSec <= sub.nextDue + MAX_WINDOW;
}
