"use client";

import { useReadContract, useWriteContract } from "wagmi";
import { type Address } from "viem";

import { getContracts, CHAIN } from "@/config/contracts";
import { RewardSchedulerABI } from "@/config/abis";

function useContracts() {
  return getContracts(CHAIN.id);
}

// ── READ hooks ──────────────────────────────────────────────────────────

/** Returns a single stream by its ID */
export function useStream(streamId?: bigint) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.rewardScheduler,
    abi: RewardSchedulerABI,
    functionName: "getStream",
    args: streamId !== undefined ? [streamId] : undefined,
    query: { enabled: streamId !== undefined && !!contracts },
  });
}

/** Returns all active reward streams */
export function useActiveStreams() {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.rewardScheduler,
    abi: RewardSchedulerABI,
    functionName: "getActiveStreams",
    query: { enabled: !!contracts },
  });
}

/** Returns the pending drippable balance for a stream */
export function useStreamBalance(streamId?: bigint) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.rewardScheduler,
    abi: RewardSchedulerABI,
    functionName: "streamBalance",
    args: streamId !== undefined ? [streamId] : undefined,
    query: { enabled: streamId !== undefined && !!contracts },
  });
}

/** Returns the total number of streams ever created */
export function useStreamCount() {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.rewardScheduler,
    abi: RewardSchedulerABI,
    functionName: "getStreamCount",
    query: { enabled: !!contracts },
  });
}

// ── WRITE hooks ─────────────────────────────────────────────────────────

/** Drip (flush) a single reward stream */
export function useDrip() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();
  const fn = async (streamId: bigint) => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.rewardScheduler as Address,
      abi: RewardSchedulerABI,
      functionName: "drip",
      args: [streamId],
    });
  };
  return { fn, isPending, isError, error, reset };
}

/** Drip all active reward streams in one tx */
export function useDripAll() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();
  const fn = async () => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.rewardScheduler as Address,
      abi: RewardSchedulerABI,
      functionName: "dripAll",
    });
  };
  return { fn, isPending, isError, error, reset };
}
