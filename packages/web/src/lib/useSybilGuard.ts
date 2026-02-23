"use client";

import { useReadContract, useWriteContract } from "wagmi";
import { type Address } from "viem";
import { getContracts, CHAIN } from "@/config/contracts";
import { SybilGuardABI } from "@/config/abis";

function useContracts() {
  return getContracts(CHAIN.id);
}

/* ═══════════════════════════════════════════════════════════════
   READ HOOKS
   ═══════════════════════════════════════════════════════════════ */

/** Read a SybilReport struct by reportId */
export function useReportDetails(reportId?: bigint) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.sybilGuard,
    abi: SybilGuardABI,
    functionName: "getReport",
    args: reportId !== undefined ? [reportId] : undefined,
    query: { enabled: reportId !== undefined && !!contracts },
  });
}

/** Read the seizedInEscrow mapping for an account */
export function useSeizedInEscrow(account?: string) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.sybilGuard,
    abi: SybilGuardABI,
    functionName: "seizedInEscrow",
    args: account ? [account as Address] : undefined,
    query: { enabled: !!account && !!contracts },
  });
}

/** Read the seizureEscrowExpiry mapping for an account */
export function useSeizureEscrowExpiry(account?: string) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.sybilGuard,
    abi: SybilGuardABI,
    functionName: "seizureEscrowExpiry",
    args: account ? [account as Address] : undefined,
    query: { enabled: !!account && !!contracts },
  });
}

/** Read the escrowReportId for an account */
export function useEscrowReportId(account?: string) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.sybilGuard,
    abi: SybilGuardABI,
    functionName: "escrowReportId",
    args: account ? [account as Address] : undefined,
    query: { enabled: !!account && !!contracts },
  });
}

/** Read when a ban was scheduled for a report */
export function useReportBanScheduledAt(reportId?: bigint) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.sybilGuard,
    abi: SybilGuardABI,
    functionName: "reportBanScheduledAt",
    args: reportId !== undefined ? [reportId] : undefined,
    query: { enabled: reportId !== undefined && !!contracts },
  });
}

/** Read whether a ban has been executed for a report */
export function useReportBanExecuted(reportId?: bigint) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.sybilGuard,
    abi: SybilGuardABI,
    functionName: "reportBanExecuted",
    args: reportId !== undefined ? [reportId] : undefined,
    query: { enabled: reportId !== undefined && !!contracts },
  });
}

/** Read the bond amount for a report */
export function useReportBondAmount(reportId?: bigint) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.sybilGuard,
    abi: SybilGuardABI,
    functionName: "reportBondAmount",
    args: reportId !== undefined ? [reportId] : undefined,
    query: { enabled: reportId !== undefined && !!contracts },
  });
}

/** Read the total number of reports */
export function useTotalReports() {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.sybilGuard,
    abi: SybilGuardABI,
    functionName: "totalReports",
    query: { enabled: !!contracts },
  });
}

/** Read the total number of bans */
export function useTotalBans() {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.sybilGuard,
    abi: SybilGuardABI,
    functionName: "totalBans",
    query: { enabled: !!contracts },
  });
}

/** Read the total seized amount */
export function useTotalSeized() {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.sybilGuard,
    abi: SybilGuardABI,
    functionName: "totalSeized",
    query: { enabled: !!contracts },
  });
}

/** Read the banned count */
export function useBannedCount() {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.sybilGuard,
    abi: SybilGuardABI,
    functionName: "getBannedCount",
    query: { enabled: !!contracts },
  });
}

/** Check if an address has a specific role */
export function useSybilGuardHasRole(role?: `0x${string}`, account?: `0x${string}`) {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.sybilGuard,
    abi: SybilGuardABI,
    functionName: "hasRole",
    args: role && account ? [role, account] : undefined,
    query: { enabled: !!role && !!account && !!contracts },
  });
}

/** Read the APPEALS_ROLE bytes32 value */
export function useAppealsRole() {
  const contracts = useContracts();
  return useReadContract({
    address: contracts?.sybilGuard,
    abi: SybilGuardABI,
    functionName: "APPEALS_ROLE",
    query: { enabled: !!contracts },
  });
}

/* ═══════════════════════════════════════════════════════════════
   WRITE HOOKS
   ═══════════════════════════════════════════════════════════════ */

/** Execute a scheduled ban after the 48hr delay period. Permissionless. */
export function useExecuteBan() {
  const { writeContractAsync } = useWriteContract();
  const contracts = useContracts();

  return async (reportId: bigint) => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.sybilGuard,
      abi: SybilGuardABI,
      functionName: "executeBan",
      args: [reportId],
    });
  };
}

/** Cancel a scheduled ban during the delay window. APPEALS_ROLE only. */
export function useCancelBan() {
  const { writeContractAsync } = useWriteContract();
  const contracts = useContracts();

  return async (reportId: bigint) => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.sybilGuard,
      abi: SybilGuardABI,
      functionName: "cancelBan",
      args: [reportId],
    });
  };
}

/** Release escrowed seized funds after the 30-day escrow period. Permissionless. */
export function useReleaseEscrow() {
  const { writeContractAsync } = useWriteContract();
  const contracts = useContracts();

  return async (account: `0x${string}`) => {
    if (!contracts) throw new Error("Contracts not loaded");
    return writeContractAsync({
      address: contracts.sybilGuard,
      abi: SybilGuardABI,
      functionName: "releaseEscrow",
      args: [account],
    });
  };
}
