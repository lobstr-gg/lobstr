"use client";

import { useReadContract, useWriteContract } from "wagmi";
import { type Address } from "viem";

import { getContracts, CHAIN } from "@/config/contracts";
import { StakingRewardsABI } from "@/config/abis";

function useContracts() {
  return getContracts(CHAIN.id);
}

// ── READ hooks ──────────────────────────────────────────────────────────

/** Returns earned rewards for a user/token pair */
export function useStakingEarned(user?: `0x${string}`, token?: `0x${string}`) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.stakingRewards,
    abi: StakingRewardsABI,
    functionName: "earned",
    args: user && token ? [user, token] : undefined,
    query: { enabled: !!user && !!token && !!contracts },
  });
}

/** Returns the effective balance (stake * tier boost) for a user */
export function useEffectiveBalance(user?: `0x${string}`) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.stakingRewards,
    abi: StakingRewardsABI,
    functionName: "getEffectiveBalance",
    args: user ? [user] : undefined,
    query: { enabled: !!user && !!contracts },
  });
}

/** Returns the list of configured reward token addresses */
export function useRewardTokens() {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.stakingRewards,
    abi: StakingRewardsABI,
    functionName: "getRewardTokens",
    query: { enabled: !!contracts },
  });
}

/** Returns the total effective balance across all stakers */
export function useTotalEffectiveBalance() {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.stakingRewards,
    abi: StakingRewardsABI,
    functionName: "getTotalEffectiveBalance",
    query: { enabled: !!contracts },
  });
}

/** Returns the reward per token for a given reward token */
export function useStakingRewardPerToken(token?: `0x${string}`) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.stakingRewards,
    abi: StakingRewardsABI,
    functionName: "rewardPerToken",
    args: token ? [token] : undefined,
    query: { enabled: !!token && !!contracts },
  });
}

// ── WRITE hooks ─────────────────────────────────────────────────────────

/** Fire-and-forget sync of the caller's effective balance */
export function useSyncStake() {
  const contracts = useContracts();
  const { writeContract } = useWriteContract();
  return () => {
    writeContract({
      address: contracts?.stakingRewards as Address,
      abi: StakingRewardsABI,
      functionName: "syncStake",
    });
  };
}

/** Claim accrued rewards for a specific reward token */
export function useClaimStakingRewards() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();
  const fn = async (token: `0x${string}`) => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.stakingRewards as Address,
      abi: StakingRewardsABI,
      functionName: "claimRewards",
      args: [token],
    });
  };
  return { fn, isPending, isError, error, reset };
}
