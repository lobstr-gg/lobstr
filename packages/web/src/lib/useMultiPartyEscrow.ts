"use client";

import { useReadContract, useWriteContract } from "wagmi";
import { type Address } from "viem";

import { getContracts, CHAIN } from "@/config/contracts";
import { MultiPartyEscrowABI } from "@/config/abis";

function useContracts() {
  return getContracts(CHAIN.id);
}

// ═══════════════════════════════════════════════════════════════════════
//  MultiPartyEscrow — Read hooks
// ═══════════════════════════════════════════════════════════════════════

/** Fetch a JobGroup struct by groupId. */
export function useGroup(groupId?: bigint) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.multiPartyEscrow,
    abi: MultiPartyEscrowABI,
    functionName: "getGroup",
    args: groupId !== undefined ? [groupId] : undefined,
    query: { enabled: groupId !== undefined && !!contracts },
  });
}

/** GroupStatus enum: Active=0, AllConfirmed=1, PartialDispute=2 */
export function useGroupStatus(groupId?: bigint) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.multiPartyEscrow,
    abi: MultiPartyEscrowABI,
    functionName: "getGroupStatus",
    args: groupId !== undefined ? [groupId] : undefined,
    query: { enabled: groupId !== undefined && !!contracts },
  });
}

/** Returns the array of EscrowEngine job IDs belonging to a group. */
export function useGroupJobIds(groupId?: bigint) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.multiPartyEscrow,
    abi: MultiPartyEscrowABI,
    functionName: "getGroupJobIds",
    args: groupId !== undefined ? [groupId] : undefined,
    query: { enabled: groupId !== undefined && !!contracts },
  });
}

// ═══════════════════════════════════════════════════════════════════════
//  MultiPartyEscrow — Write hooks
// ═══════════════════════════════════════════════════════════════════════

/**
 * Create a multi-seller job group.
 * Returns { fn, isPending, isError, error, reset }.
 */
export function useCreateMultiJob() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();
  const fn = async (
    sellers: `0x${string}`[],
    shares: bigint[],
    listingIds: bigint[],
    token: `0x${string}`,
    totalAmount: bigint,
    deliveryDeadline: bigint,
    metadataURI: string,
  ) => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.multiPartyEscrow as Address,
      abi: MultiPartyEscrowABI,
      functionName: "createMultiJob",
      args: [sellers, shares, listingIds, token, totalAmount, deliveryDeadline, metadataURI],
    });
  };
  return { fn, isPending, isError, error, reset };
}

/** Confirm delivery for a single job within a multi-party group. */
export function useConfirmMultiDelivery() {
  const contracts = useContracts();
  const { writeContract } = useWriteContract();
  return (jobId: bigint) => {
    writeContract({
      address: contracts?.multiPartyEscrow as Address,
      abi: MultiPartyEscrowABI,
      functionName: "confirmDelivery",
      args: [jobId],
    });
  };
}

/** Initiate a dispute for a single job within a multi-party group. */
export function useInitiateMultiDispute() {
  const contracts = useContracts();
  const { writeContractAsync, isPending, isError, error, reset } = useWriteContract();
  const fn = async (jobId: bigint, evidenceURI: string) => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.multiPartyEscrow as Address,
      abi: MultiPartyEscrowABI,
      functionName: "initiateDispute",
      args: [jobId, evidenceURI],
    });
  };
  return { fn, isPending, isError, error, reset };
}
