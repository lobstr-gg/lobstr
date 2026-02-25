"use client";

import { useReadContract, useWriteContract } from "wagmi";
import { type Address } from "viem";

import { getContracts, CHAIN } from "@/config/contracts";
import { ZERO_ADDRESS } from "@/config/contract-addresses";
import { RewardSchedulerABI } from "@/config/abis";

function useContracts() {
  return getContracts(CHAIN.id);
}

function isSchedulerLive(contracts: ReturnType<typeof useContracts>) {
  return !!contracts && contracts.rewardScheduler !== ZERO_ADDRESS;
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
    query: { enabled: streamId !== undefined && isSchedulerLive(contracts) },
  });
}

/** Returns all active reward streams */
export function useActiveStreams() {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.rewardScheduler,
    abi: RewardSchedulerABI,
    functionName: "getActiveStreams",
    query: { enabled: isSchedulerLive(contracts) },
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
    query: { enabled: streamId !== undefined && isSchedulerLive(contracts) },
  });
}

/** Returns the total number of streams ever created */
export function useStreamCount() {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.rewardScheduler,
    abi: RewardSchedulerABI,
    functionName: "getStreamCount",
    query: { enabled: isSchedulerLive(contracts) },
  });
}

// ── WRITE hooks ─────────────────────────────────────────────────────────

/** Drip (flush) a single reward stream */
export function useDrip() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();
  const fn = async (streamId: bigint) => {
    if (!isSchedulerLive(contracts)) throw new Error("Reward scheduler is not yet available");
    return writeContractAsync({
      address: contracts!.rewardScheduler as Address,
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
    if (!isSchedulerLive(contracts)) throw new Error("Reward scheduler is not yet available");
    return writeContractAsync({
      address: contracts!.rewardScheduler as Address,
      abi: RewardSchedulerABI,
      functionName: "dripAll",
    });
  };
  return { fn, isPending, isError, error, reset };
}
