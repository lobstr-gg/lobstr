"use client";

import { useReadContract, useWriteContract, useAccount } from "wagmi";
import { type Address } from "viem";
import { getContracts, CHAIN } from "@/config/contracts";
import { AirdropClaimABI } from "@/config/abis";

function useContracts() {
  return getContracts(CHAIN.id);
}

// ═══════════════════════════════════════════════════════════════════════
//  Milestone enum (matches IAirdropClaimV3.Milestone)
// ═══════════════════════════════════════════════════════════════════════

export enum Milestone {
  JobComplete = 0,
  ServiceListed = 1,
  StakeActive = 2,
  ReputationEarned = 3,
  GovernanceVote = 4,
}

export const MILESTONE_LABELS: Record<Milestone, string> = {
  [Milestone.JobComplete]: "Job Complete",
  [Milestone.ServiceListed]: "Service Listed",
  [Milestone.StakeActive]: "Stake Active",
  [Milestone.ReputationEarned]: "Reputation Earned",
  [Milestone.GovernanceVote]: "Governance Vote",
};

export const MILESTONE_DESCRIPTIONS: Record<Milestone, string> = {
  [Milestone.JobComplete]: "Complete at least 1 job via escrow",
  [Milestone.ServiceListed]: "Create a service listing on the marketplace",
  [Milestone.StakeActive]: "Stake at least 100 LOB tokens",
  [Milestone.ReputationEarned]: "Earn a reputation score of 1,000+",
  [Milestone.GovernanceVote]: "Cast a vote on a dispute arbitration",
};

export const ALL_MILESTONES = [
  Milestone.JobComplete,
  Milestone.ServiceListed,
  Milestone.StakeActive,
  Milestone.ReputationEarned,
  Milestone.GovernanceVote,
] as const;

// ═══════════════════════════════════════════════════════════════════════
//  Read hooks
// ═══════════════════════════════════════════════════════════════════════

export interface ClaimInfo {
  claimed: boolean;
  released: bigint;
  milestonesCompleted: bigint;
  claimedAt: bigint;
}

export function useClaimInfoV3(address?: string) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.airdropClaim,
    abi: AirdropClaimABI,
    functionName: "getClaimInfo",
    args: address ? [address as Address] : undefined,
    query: {
      enabled: !!address && !!contracts,
      refetchInterval: 15_000,
    },
  });
}

export function useIsMilestoneComplete(address?: string, milestone?: number) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.airdropClaim,
    abi: AirdropClaimABI,
    functionName: "isMilestoneComplete",
    args: address && milestone !== undefined ? [address as Address, milestone] : undefined,
    query: {
      enabled: !!address && milestone !== undefined && !!contracts,
    },
  });
}

export function useMerkleRoot() {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.airdropClaim,
    abi: AirdropClaimABI,
    functionName: "getMerkleRoot",
    query: { enabled: !!contracts },
  });
}

export function useDifficultyTarget() {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.airdropClaim,
    abi: AirdropClaimABI,
    functionName: "difficultyTarget",
    query: { enabled: !!contracts },
  });
}

export function usePendingMilestones(address?: string) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.airdropClaim,
    abi: AirdropClaimABI,
    functionName: "getPendingMilestones",
    args: address ? [address as Address] : undefined,
    query: {
      enabled: !!address && !!contracts,
      refetchInterval: 15_000,
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════
//  Write hooks
// ═══════════════════════════════════════════════════════════════════════

export function useClaimAirdropV3() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();

  const claim = async (
    pA: [bigint, bigint],
    pB: [[bigint, bigint], [bigint, bigint]],
    pC: [bigint, bigint],
    pubSignals: [bigint, bigint],
    approvalSig: `0x${string}`,
    powNonce: bigint,
  ) => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.airdropClaim,
      abi: AirdropClaimABI,
      functionName: "claim",
      args: [pA, pB, pC, pubSignals, approvalSig, powNonce],
    });
  };

  return { claim, isPending, isError, error, reset };
}

export function useCompleteMilestone() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();

  const completeMilestone = async (claimant: Address, milestone: number) => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.airdropClaim,
      abi: AirdropClaimABI,
      functionName: "completeMilestone",
      args: [claimant, milestone],
    });
  };

  return { completeMilestone, isPending, isError, error, reset };
}

// ═══════════════════════════════════════════════════════════════════════
//  Utility: decode milestone bitmask
// ═══════════════════════════════════════════════════════════════════════

export function decodeMilestoneBitmask(bitmask: bigint): boolean[] {
  return ALL_MILESTONES.map((m) => (bitmask & (1n << BigInt(m))) !== 0n);
}

export function countCompletedMilestones(bitmask: bigint): number {
  return decodeMilestoneBitmask(bitmask).filter(Boolean).length;
}
