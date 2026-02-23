"use client";

import { useReadContract, useWriteContract } from "wagmi";
import { getContracts, CHAIN } from "@/config/contracts";
import { TeamVestingABI } from "@/config/abis";

const POLL_INTERVAL = 30_000;

/** Read: vestedAmount() */
export function useVestedAmount() {
  const contracts = getContracts(CHAIN.id);

  return useReadContract({
    address: contracts?.teamVesting,
    abi: TeamVestingABI,
    functionName: "vestedAmount",
    chainId: CHAIN.id,
    query: {
      enabled: !!contracts?.teamVesting,
      refetchInterval: POLL_INTERVAL,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      retry: 3,
      staleTime: 60_000,
    },
  });
}

/** Read: releasable() */
export function useReleasable() {
  const contracts = getContracts(CHAIN.id);

  return useReadContract({
    address: contracts?.teamVesting,
    abi: TeamVestingABI,
    functionName: "releasable",
    chainId: CHAIN.id,
    query: {
      enabled: !!contracts?.teamVesting,
      refetchInterval: POLL_INTERVAL,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      retry: 3,
      staleTime: 60_000,
    },
  });
}

/** Read: released() */
export function useVestingReleased() {
  const contracts = getContracts(CHAIN.id);

  return useReadContract({
    address: contracts?.teamVesting,
    abi: TeamVestingABI,
    functionName: "released",
    chainId: CHAIN.id,
    query: {
      enabled: !!contracts?.teamVesting,
      refetchInterval: POLL_INTERVAL,
      staleTime: 60_000,
    },
  });
}

/** Read: beneficiary() */
export function useVestingBeneficiary() {
  const contracts = getContracts(CHAIN.id);

  return useReadContract({
    address: contracts?.teamVesting,
    abi: TeamVestingABI,
    functionName: "beneficiary",
    chainId: CHAIN.id,
    query: {
      enabled: !!contracts?.teamVesting,
      staleTime: Infinity, // immutable
    },
  });
}

/** Read: start() */
export function useVestingStart() {
  const contracts = getContracts(CHAIN.id);

  return useReadContract({
    address: contracts?.teamVesting,
    abi: TeamVestingABI,
    functionName: "start",
    chainId: CHAIN.id,
    query: {
      enabled: !!contracts?.teamVesting,
      staleTime: Infinity, // immutable
    },
  });
}

/** Read: duration() */
export function useVestingDuration() {
  const contracts = getContracts(CHAIN.id);

  return useReadContract({
    address: contracts?.teamVesting,
    abi: TeamVestingABI,
    functionName: "duration",
    chainId: CHAIN.id,
    query: {
      enabled: !!contracts?.teamVesting,
      staleTime: Infinity, // immutable
    },
  });
}

/** Read: cliffEnd() */
export function useVestingCliffEnd() {
  const contracts = getContracts(CHAIN.id);

  return useReadContract({
    address: contracts?.teamVesting,
    abi: TeamVestingABI,
    functionName: "cliffEnd",
    chainId: CHAIN.id,
    query: {
      enabled: !!contracts?.teamVesting,
      staleTime: Infinity, // immutable
    },
  });
}

/** Read: totalAllocation() */
export function useTotalAllocation() {
  const contracts = getContracts(CHAIN.id);

  return useReadContract({
    address: contracts?.teamVesting,
    abi: TeamVestingABI,
    functionName: "totalAllocation",
    chainId: CHAIN.id,
    query: {
      enabled: !!contracts?.teamVesting,
      staleTime: Infinity, // immutable once set
    },
  });
}

/** Write: release() */
export function useReleaseVested() {
  const { writeContractAsync, isPending, isSuccess, isError, error } =
    useWriteContract();
  const contracts = getContracts(CHAIN.id);

  const release = async () => {
    if (!contracts?.teamVesting) throw new Error("Contract not configured");
    return writeContractAsync({
      address: contracts.teamVesting,
      abi: TeamVestingABI,
      functionName: "release",
    });
  };

  return { release, isPending, isSuccess, isError, error };
}
