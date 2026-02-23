"use client";

import { useReadContract, useWriteContract, useAccount } from "wagmi";
import { type Address } from "viem";
import { getContracts, CHAIN } from "@/config/contracts";
import { RewardDistributorABI } from "@/config/abis";

const POLL_INTERVAL = 30_000;

/** Read: claimableBalance(account, token) */
export function useClaimableRewards(account?: string, token?: string) {
  const contracts = getContracts(CHAIN.id);

  return useReadContract({
    address: contracts?.rewardDistributor,
    abi: RewardDistributorABI,
    functionName: "claimableBalance",
    args: account && token ? [account as Address, token as Address] : undefined,
    chainId: CHAIN.id,
    query: {
      enabled: !!contracts?.rewardDistributor && !!account && !!token,
      refetchInterval: POLL_INTERVAL,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      retry: 3,
      staleTime: 60_000,
    },
  });
}

/** Read: availableBudget(token) */
export function useAvailableBudget(token?: string) {
  const contracts = getContracts(CHAIN.id);

  return useReadContract({
    address: contracts?.rewardDistributor,
    abi: RewardDistributorABI,
    functionName: "availableBudget",
    args: token ? [token as Address] : undefined,
    chainId: CHAIN.id,
    query: {
      enabled: !!contracts?.rewardDistributor && !!token,
      refetchInterval: POLL_INTERVAL,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      retry: 3,
      staleTime: 60_000,
    },
  });
}

/** Read: totalDeposited() */
export function useTotalDeposited() {
  const contracts = getContracts(CHAIN.id);

  return useReadContract({
    address: contracts?.rewardDistributor,
    abi: RewardDistributorABI,
    functionName: "totalDeposited",
    chainId: CHAIN.id,
    query: {
      enabled: !!contracts?.rewardDistributor,
      refetchInterval: POLL_INTERVAL,
      staleTime: 60_000,
    },
  });
}

/** Read: totalDistributed() */
export function useTotalDistributed() {
  const contracts = getContracts(CHAIN.id);

  return useReadContract({
    address: contracts?.rewardDistributor,
    abi: RewardDistributorABI,
    functionName: "totalDistributed",
    chainId: CHAIN.id,
    query: {
      enabled: !!contracts?.rewardDistributor,
      refetchInterval: POLL_INTERVAL,
      staleTime: 60_000,
    },
  });
}

/** Read: totalEarnedByAccount(address) */
export function useTotalEarnedByAccount(account?: string) {
  const contracts = getContracts(CHAIN.id);

  return useReadContract({
    address: contracts?.rewardDistributor,
    abi: RewardDistributorABI,
    functionName: "totalEarnedByAccount",
    args: account ? [account as Address] : undefined,
    chainId: CHAIN.id,
    query: {
      enabled: !!contracts?.rewardDistributor && !!account,
      refetchInterval: POLL_INTERVAL,
      staleTime: 60_000,
    },
  });
}

/** Write: claim(token) */
export function useClaimRewards() {
  const { writeContractAsync, isPending, isSuccess, isError, error } =
    useWriteContract();
  const contracts = getContracts(CHAIN.id);

  const claim = async (token: Address) => {
    if (!contracts?.rewardDistributor) throw new Error("Contract not configured");
    return writeContractAsync({
      address: contracts.rewardDistributor,
      abi: RewardDistributorABI,
      functionName: "claim",
      args: [token],
    });
  };

  return { claim, isPending, isSuccess, isError, error };
}

/** Write: deposit(token, amount) */
export function useDepositRewards() {
  const { writeContractAsync, isPending, isSuccess, isError, error } =
    useWriteContract();
  const contracts = getContracts(CHAIN.id);

  const deposit = async (token: Address, amount: bigint) => {
    if (!contracts?.rewardDistributor) throw new Error("Contract not configured");
    return writeContractAsync({
      address: contracts.rewardDistributor,
      abi: RewardDistributorABI,
      functionName: "deposit",
      args: [token, amount],
    });
  };

  return { deposit, isPending, isSuccess, isError, error };
}
