"use client";

import { useReadContract, useWriteContract } from "wagmi";
import { type Address, parseEther } from "viem";

import { getContracts, CHAIN } from "@/config/contracts";
import { DisputeArbitrationABI, LOBTokenABI } from "@/config/abis";

// ─── Constants ───────────────────────────────────────────────────────
export const APPEAL_BOND = parseEther("500"); // 500 LOB
export const APPEAL_WINDOW_SECONDS = 48 * 60 * 60; // 172800s = 48h

// ─── Internal ────────────────────────────────────────────────────────
function useContracts() {
  return getContracts(CHAIN.id);
}

// ═════════════════════════════════════════════════════════════════════
//  READ HOOKS
// ═════════════════════════════════════════════════════════════════════

/** Check whether a dispute is itself an appeal (created via appealRuling) */
export function useIsAppealDispute(disputeId?: bigint) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.disputeArbitration,
    abi: DisputeArbitrationABI,
    functionName: "isAppealDispute",
    args: disputeId !== undefined ? [disputeId] : undefined,
    query: { enabled: disputeId !== undefined && !!contracts },
  });
}

/** Get the appeal dispute ID for an original resolved dispute (0 if no appeal) */
export function useAppealDisputeId(originalId?: bigint) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.disputeArbitration,
    abi: DisputeArbitrationABI,
    functionName: "getAppealDisputeId",
    args: originalId !== undefined ? [originalId] : undefined,
    query: { enabled: originalId !== undefined && !!contracts },
  });
}

/** Check whether an arbitrator has self-paused */
export function useIsArbitratorPaused(address?: string) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.disputeArbitration,
    abi: DisputeArbitrationABI,
    functionName: "isArbitratorPaused",
    args: address ? [address as Address] : undefined,
    query: { enabled: !!address && !!contracts },
  });
}

/** Get the agreement rate between two arbitrators: [agreed, total] */
export function useAgreementRate(arbA?: string, arbB?: string) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.disputeArbitration,
    abi: DisputeArbitrationABI,
    functionName: "getAgreementRate",
    args: arbA && arbB ? [arbA as Address, arbB as Address] : undefined,
    query: { enabled: !!arbA && !!arbB && !!contracts },
  });
}

/** On-chain APPEAL_BOND constant */
export function useAppealBondConstant() {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.disputeArbitration,
    abi: DisputeArbitrationABI,
    functionName: "APPEAL_BOND",
    query: { enabled: !!contracts },
  });
}

/** On-chain APPEAL_WINDOW constant */
export function useAppealWindowConstant() {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.disputeArbitration,
    abi: DisputeArbitrationABI,
    functionName: "APPEAL_WINDOW",
    query: { enabled: !!contracts },
  });
}

/** Get the number of active disputes for an arbitrator */
export function useActiveDisputeCount(address?: string) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.disputeArbitration,
    abi: DisputeArbitrationABI,
    functionName: "getActiveDisputeCount",
    args: address ? [address as Address] : undefined,
    query: { enabled: !!address && !!contracts },
  });
}

// ═════════════════════════════════════════════════════════════════════
//  WRITE HOOKS
// ═════════════════════════════════════════════════════════════════════

/** File an appeal on a resolved dispute. Requires prior 500 LOB approval. */
export function useAppealRuling() {
  const { writeContractAsync } = useWriteContract();
  const contracts = useContracts();

  return async (disputeId: bigint) => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.disputeArbitration,
      abi: DisputeArbitrationABI,
      functionName: "appealRuling",
      args: [disputeId],
    });
  };
}

/** Finalize a ruling after the appeal window has expired (permissionless). */
export function useFinalizeRuling() {
  const { writeContractAsync } = useWriteContract();
  const contracts = useContracts();

  return async (disputeId: bigint) => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.disputeArbitration,
      abi: DisputeArbitrationABI,
      functionName: "finalizeRuling",
      args: [disputeId],
    });
  };
}

/** Self-pause as arbitrator (stops receiving new assignments). */
export function usePauseAsArbitrator() {
  const { writeContractAsync } = useWriteContract();
  const contracts = useContracts();

  return async () => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.disputeArbitration,
      abi: DisputeArbitrationABI,
      functionName: "pauseAsArbitrator",
    });
  };
}

/** Unpause to resume receiving dispute assignments. */
export function useUnpauseAsArbitrator() {
  const { writeContractAsync } = useWriteContract();
  const contracts = useContracts();

  return async () => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.disputeArbitration,
      abi: DisputeArbitrationABI,
      functionName: "unpauseAsArbitrator",
    });
  };
}

/** Approve LOB tokens to the DisputeArbitration contract for the appeal bond. */
export function useApproveLOBForAppeal() {
  const { writeContractAsync } = useWriteContract();
  const contracts = useContracts();

  return async (amount?: bigint) => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.lobToken,
      abi: LOBTokenABI,
      functionName: "approve",
      args: [contracts.disputeArbitration, amount ?? APPEAL_BOND],
    });
  };
}
