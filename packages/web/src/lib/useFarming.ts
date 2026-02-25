"use client";

import { useReadContract, useWriteContract } from "wagmi";
import { type Address } from "viem";

import { getContracts, CHAIN } from "@/config/contracts";
import { ZERO_ADDRESS } from "@/config/contract-addresses";
import { LiquidityMiningABI, LOBTokenABI } from "@/config/abis";

function useContracts() {
  return getContracts(CHAIN.id);
}

function isFarmingLive(contracts: ReturnType<typeof useContracts>) {
  return !!contracts && contracts.liquidityMining !== ZERO_ADDRESS;
}

// ── READ hooks ──────────────────────────────────────────────────────────

/** Returns earned LP farming rewards for a user */
export function useLPEarned(user?: `0x${string}`) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.liquidityMining,
    abi: LiquidityMiningABI,
    functionName: "earned",
    args: user ? [user] : undefined,
    query: { enabled: !!user && isFarmingLive(contracts) },
  });
}

/** Returns the user's staked LP token balance in the farming contract */
export function useLPBalance(user?: `0x${string}`) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.liquidityMining,
    abi: LiquidityMiningABI,
    functionName: "balanceOf",
    args: user ? [user] : undefined,
    query: { enabled: !!user && isFarmingLive(contracts) },
  });
}

/** Returns the total LP tokens staked across all users */
export function useLPTotalSupply() {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.liquidityMining,
    abi: LiquidityMiningABI,
    functionName: "totalSupply",
    query: { enabled: isFarmingLive(contracts) },
  });
}

/** Returns the boost multiplier for a user based on their staking tier */
export function useBoostMultiplier(user?: `0x${string}`) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.liquidityMining,
    abi: LiquidityMiningABI,
    functionName: "getBoostMultiplier",
    args: user ? [user] : undefined,
    query: { enabled: !!user && isFarmingLive(contracts) },
  });
}

/** Returns the current reward rate (LOB per second) */
export function useLPRewardRate() {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.liquidityMining,
    abi: LiquidityMiningABI,
    functionName: "rewardRate",
    query: { enabled: isFarmingLive(contracts) },
  });
}

/** Returns the timestamp when the current reward period ends */
export function useLPPeriodFinish() {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.liquidityMining,
    abi: LiquidityMiningABI,
    functionName: "periodFinish",
    query: { enabled: isFarmingLive(contracts) },
  });
}

/** Returns the LP token address used by the contract */
export function useLPTokenAddress() {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.liquidityMining,
    abi: LiquidityMiningABI,
    functionName: "lpToken",
    query: { enabled: isFarmingLive(contracts) },
  });
}

/** Returns user's LP token wallet balance (not staked, in their wallet) */
export function useLPWalletBalance(user?: `0x${string}`, lpTokenAddress?: Address) {
  return useReadContract({
    address: lpTokenAddress,
    abi: LOBTokenABI, // ERC-20 compatible
    functionName: "balanceOf",
    args: user ? [user] : undefined,
    query: { enabled: !!user && !!lpTokenAddress },
  });
}

/** Returns current LP token allowance for the LiquidityMining contract */
export function useLPAllowance(owner?: `0x${string}`, lpTokenAddress?: Address) {
  const contracts = useContracts();
  return useReadContract({
    address: lpTokenAddress,
    abi: LOBTokenABI, // ERC-20 compatible
    functionName: "allowance",
    args: owner && contracts ? [owner, contracts.liquidityMining] : undefined,
    query: { enabled: !!owner && !!lpTokenAddress && isFarmingLive(contracts) },
  });
}

// ── WRITE hooks ─────────────────────────────────────────────────────────

/** Approve LP token spending by the LiquidityMining contract */
export function useApproveLPToken() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();
  const fn = async (lpTokenAddress: Address, amount: bigint) => {
    if (!isFarmingLive(contracts)) throw new Error("LP farming is not yet available");
    return writeContractAsync({
      address: lpTokenAddress,
      abi: LOBTokenABI, // ERC-20 compatible
      functionName: "approve",
      args: [contracts!.liquidityMining, amount],
    });
  };
  return { fn, isPending, isError, error, reset };
}

/** Stake LP tokens into the farming contract */
export function useStakeLP() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();
  const fn = async (amount: bigint) => {
    if (!isFarmingLive(contracts)) throw new Error("LP farming is not yet available");
    return writeContractAsync({
      address: contracts!.liquidityMining as Address,
      abi: LiquidityMiningABI,
      functionName: "stake",
      args: [amount],
    });
  };
  return { fn, isPending, isError, error, reset };
}

/** Withdraw staked LP tokens */
export function useWithdrawLP() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();
  const fn = async (amount: bigint) => {
    if (!isFarmingLive(contracts)) throw new Error("LP farming is not yet available");
    return writeContractAsync({
      address: contracts!.liquidityMining as Address,
      abi: LiquidityMiningABI,
      functionName: "withdraw",
      args: [amount],
    });
  };
  return { fn, isPending, isError, error, reset };
}

/** Claim earned LP farming rewards */
export function useGetLPReward() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();
  const fn = async () => {
    if (!isFarmingLive(contracts)) throw new Error("LP farming is not yet available");
    return writeContractAsync({
      address: contracts!.liquidityMining as Address,
      abi: LiquidityMiningABI,
      functionName: "getReward",
    });
  };
  return { fn, isPending, isError, error, reset };
}

/** Exit: withdraw all staked LP + claim all rewards in one tx */
export function useExitLP() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();
  const fn = async () => {
    if (!isFarmingLive(contracts)) throw new Error("LP farming is not yet available");
    return writeContractAsync({
      address: contracts!.liquidityMining as Address,
      abi: LiquidityMiningABI,
      functionName: "exit",
    });
  };
  return { fn, isPending, isError, error, reset };
}

/** Emergency withdraw: pulls all LP but forfeits unclaimed rewards */
export function useEmergencyWithdraw() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();
  const fn = async () => {
    if (!isFarmingLive(contracts)) throw new Error("LP farming is not yet available");
    return writeContractAsync({
      address: contracts!.liquidityMining as Address,
      abi: LiquidityMiningABI,
      functionName: "emergencyWithdraw",
    });
  };
  return { fn, isPending, isError, error, reset };
}
